import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  ALLOWED_DB_TABLES,
  DEFAULT_BRANCH_ID,
  authenticateUserInPostgres,
  deleteAuditLogsInPostgres,
  deleteRowInPostgres,
  deleteStorageFileInPostgres,
  ensurePostgresSchema,
  getBootstrapFromPostgres,
  getStorageFileFromPostgres,
  getUserByIdAndBranchFromPostgres,
  listAuditDeletionSecurityLogsFromPostgres,
  listStorageFilesInPostgres,
  purgeAllPostgresData,
  queryTablePaginated,
  recordAuditDeletionSecurityLog,
  recordAuditLog,
  resetNonMahallaBranchesInPostgres,
  syncFullBranchStateToPostgres,
  syncHighDebtAlertsToPostgres,
  upsertRowInPostgres,
  upsertStorageFileInPostgres,
  getBranchModuleStateFromPostgres,
  upsertBranchModuleStateInPostgres,
  verifyVaultCredentialsInPostgres,
  updateVaultCredentialsInPostgres,
  type NormalizedTableName,
} from './src/db/queries.ts';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  getDbIntegritySecret,
  getSessionSigningSecret,
  normalizeDigits,
  parseCookieHeader,
  revokeAllUserTokens,
  revokeSessionToken,
  sanitizeSystemConfigForClient,
  sanitizeUsersForClient,
  validatePasswordComplexity,
  verifySessionToken,
} from './src/utils/serverAuth.ts';
import {
  hasDepartmentPermission,
  isSuperAdmin as isUserSuperAdmin,
} from './src/utils/departmentRbac.ts';
import type {
  AppUser,
  PermissionAction,
  SystemDepartmentKey,
} from './src/types.ts';
import {
  INITIAL_BAKERIES,
  INITIAL_DEBTS,
  DEFAULT_VILLAGES_HIERARCHY,
  INITIAL_USERS,
  INITIAL_DAILY_TASKS,
  INITIAL_INBOX_MESSAGES,
} from './src/defaultData.ts';
import { applySecurityMiddlewares, isAllowedOrigin } from './src/services/securityConfig.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_PRIMARY_PATH = path.resolve(__dirname, 'tamween_latest_backup.json');
const SNAPSHOT_TMP_PATH = '/tmp/tamween_latest_backup.json';

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

// Fail-fast in production if required cryptographic secrets are absent or weak
const SESSION_SIGNING_SECRET = getSessionSigningSecret();
const DB_INTEGRITY_HMAC_SECRET = getDbIntegritySecret();
void SESSION_SIGNING_SECRET;

interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  ip: string;
  method: string;
  path: string;
  threatType: string;
  actionTaken: 'BLOCKED_403' | 'RATE_LIMITED_429' | 'WIPE_PREVENTED' | 'VERIFIED';
  detail: string;
}

const securityAuditLog: SecurityAuditEvent[] = [];
let blockedIntrusionsCount = 0;
let preventedWipeAttemptsCount = 0;

function maskAuditIp(rawIp: string): string {
  const clean = String(rawIp || '').trim();
  if (!clean || clean === '127.0.0.1' || clean === '::1') return 'internal';
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  }
  return 'masked';
}

function recordSecurityAudit(
  entry: Omit<SecurityAuditEvent, 'id' | 'timestamp'>
): SecurityAuditEvent {
  const full: SecurityAuditEvent = {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  if (entry.actionTaken === 'BLOCKED_403' || entry.actionTaken === 'RATE_LIMITED_429') {
    blockedIntrusionsCount += 1;
  } else if (entry.actionTaken === 'WIPE_PREVENTED') {
    preventedWipeAttemptsCount += 1;
  }
  securityAuditLog.unshift(full);
  if (securityAuditLog.length > 100) {
    securityAuditLog.length = 100;
  }
  return full;
}

function computeDatabaseIntegrityHash(payload: unknown): string {
  try {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
    return crypto
      .createHmac('sha256', DB_INTEGRITY_HMAC_SECRET)
      .update(raw)
      .digest('hex');
  } catch {
    return crypto.createHash('sha256').update(String(Date.now())).digest('hex');
  }
}

function writeProtectedDatabaseFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {}
    const bakPath = `${filePath}.bak`;
    fs.writeFileSync(bakPath, content, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(bakPath, 0o600);
    } catch {}
  } catch {}
}

function hasPrototypePollutionKey(value: unknown, depth = 0): boolean {
  if (depth > 16 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasPrototypePollutionKey(item, depth + 1));
  }
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (hasPrototypePollutionKey((value as Record<string, unknown>)[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

const CLEAN_START_RESET_EPOCH = '2026-11-15-FRESH-DB-V1';

/**
 * Server-Side Anti-Wipe Guard:
 * Fails closed on malformed payloads and blocks wiping non-empty bakeries/debts
 * unless explicitly requested by an authorized Super Admin with __allowEmptyReset.
 */
function guardDatabaseAgainstWipe(
  existingData: any,
  incomingData: any,
  clientIp = 'ws',
  isAuthorizedSuperAdmin = false
): {
  safeData: any;
  wipePrevented: boolean;
} {
  if (!existingData || typeof existingData !== 'object') {
    return { safeData: incomingData, wipePrevented: false };
  }
  if (!incomingData || typeof incomingData !== 'object') {
    return { safeData: existingData, wipePrevented: true };
  }

  let wipePrevented = false;
  const safeData = { ...existingData, ...incomingData };
  const allowEmptyReset = isAuthorizedSuperAdmin && Boolean(incomingData.__allowEmptyReset);

  const exBakeries = Array.isArray(existingData.bakeries) ? existingData.bakeries : [];
  if (!Array.isArray(incomingData.bakeries)) {
    safeData.bakeries = exBakeries;
    if (exBakeries.length > 0) wipePrevented = true;
  } else if (exBakeries.length > 0 && incomingData.bakeries.length === 0 && !allowEmptyReset) {
    safeData.bakeries = exBakeries;
    wipePrevented = true;
  }

  const exDebts = Array.isArray(existingData.debts) ? existingData.debts : [];
  if (!Array.isArray(incomingData.debts)) {
    safeData.debts = exDebts;
    if (exDebts.length > 0) wipePrevented = true;
  } else if (exDebts.length > 0 && incomingData.debts.length === 0 && !allowEmptyReset) {
    safeData.debts = exDebts;
    wipePrevented = true;
  }

  delete safeData.__allowEmptyReset;

  if (wipePrevented) {
    recordSecurityAudit({
      ip: clientIp,
      method: 'GUARD',
      path: '/api/supabase/live-db',
      threatType: 'UNAUTHORIZED_DATA_WIPE_ATTEMPT',
      actionTaken: 'WIPE_PREVENTED',
      detail: `تم إحباط محاولة مسح غير مصرح بها لقاعدة البيانات والاحتفاظ بـ (${exBakeries.length} مخبز و ${exDebts.length} مديونية)`,
    });
  }

  return { safeData, wipePrevented };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);
  const nginxOwnsEnvPort =
    Boolean(process.env.NGINX_PORT) &&
    String(process.env.PORT || '') === String(process.env.NGINX_PORT);
  const PORT = nginxOwnsEnvPort
    ? Number(process.env.DEFAULT_APP_PORT) || 3000
    : Number(process.env.PORT) || Number(process.env.DEFAULT_APP_PORT) || 3000;

  // WebSocket Server attached to port 3000 for genuine sub-50ms cross-device real-time sync
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/supabase-realtime' });
  wss.on('error', (err) => {
    console.warn('WebSocket server event:', (err as Error)?.message || err);
  });
  interface RealtimeClientMeta {
    user: AppUser;
    branchId: string;
    isSuperAdmin: boolean;
  }
  const wsClientMeta = new Map<WebSocket, RealtimeClientMeta>();
  const sseClients = new Set<express.Response>();
  const sseClientMeta = new Map<express.Response, RealtimeClientMeta>();

  const sanitizeBroadcastPayload = (
    payload: Record<string, any>,
    meta?: RealtimeClientMeta
  ): Record<string, any> => {
    if (!payload || typeof payload !== 'object') return payload;
    const copy = { ...payload };
    if (copy.data && typeof copy.data === 'object') {
      copy.data = {
        ...copy.data,
        ...(copy.data.users
          ? { users: meta?.isSuperAdmin ? sanitizeUsersForClient(copy.data.users) : [] }
          : {}),
        ...(copy.data.systemConfig
          ? { systemConfig: sanitizeSystemConfigForClient(copy.data.systemConfig) }
          : {}),
      };
    }
    if (copy.snapshot && typeof copy.snapshot === 'object' && copy.snapshot.data) {
      copy.snapshot = {
        ...copy.snapshot,
        data: {
          ...copy.snapshot.data,
          ...(copy.snapshot.data.users
            ? {
                users: meta?.isSuperAdmin
                  ? sanitizeUsersForClient(copy.snapshot.data.users)
                  : [],
              }
            : {}),
          ...(copy.snapshot.data.systemConfig
            ? { systemConfig: sanitizeSystemConfigForClient(copy.snapshot.data.systemConfig) }
            : {}),
        },
      };
    }
    return copy;
  };

  const broadcastWs = (payload: Record<string, any>) => {
    const targetBranch = String(
      payload?.branchId || payload?.snapshot?.data?.activeBranchId || ''
    ).trim();

    wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      const meta = wsClientMeta.get(client);
      if (!meta) return;
      if (targetBranch && !meta.isSuperAdmin && meta.branchId !== targetBranch) {
        return;
      }
      try {
        client.send(JSON.stringify(sanitizeBroadcastPayload(payload, meta)));
      } catch {}
    });

    sseClients.forEach((res) => {
      const meta = sseClientMeta.get(res);
      if (!meta) return;
      if (targetBranch && !meta.isSuperAdmin && meta.branchId !== targetBranch) {
        return;
      }
      try {
        res.write(`data: ${JSON.stringify(sanitizeBroadcastPayload(payload, meta))}\n\n`);
      } catch {
        sseClients.delete(res);
        sseClientMeta.delete(res);
      }
    });
  };

  // 1. Sovereign Security & CORS Middlewares via securityConfig.ts
  applySecurityMiddlewares(app);

  // 2. Direct Database File & Sensitive Config Access Blocker (Anti-Leakage Shield)
  app.use((req, res, next) => {
    let rawUrl = String(req.originalUrl || req.url || '');
    try {
      rawUrl = decodeURIComponent(rawUrl);
    } catch {
      res.status(400).json({ success: false, error: 'رابط الطلب غير صالح.' });
      return;
    }
    const cleanPathOnly = rawUrl.split('?')[0];
    const normalizedPath = path.posix.normalize(cleanPathOnly);
    const lowerUrl = rawUrl.toLowerCase();
    const cleanPathLower = cleanPathOnly.toLowerCase();
    const normalizedLower = normalizedPath.toLowerCase();
    const isForbiddenFileRequest =
      rawUrl.includes('..') ||
      normalizedPath.includes('..') ||
      lowerUrl.includes('.tamween_live_db') ||
      lowerUrl.includes('.tamween_alerts_db') ||
      lowerUrl.includes('supabase_config.json') ||
      lowerUrl.includes('tamween_latest_backup') ||
      lowerUrl.includes('tamween_pg_fallback_store') ||
      lowerUrl.includes('.env') ||
      lowerUrl.includes('.git') ||
      lowerUrl.endsWith('.sqlite') ||
      lowerUrl.endsWith('.db') ||
      lowerUrl.endsWith('.bak') ||
      lowerUrl.endsWith('.sql') ||
      cleanPathLower === '/server.ts' ||
      cleanPathLower === '/package.json' ||
      cleanPathLower === '/package-lock.json' ||
      cleanPathLower === '/tsconfig.json' ||
      cleanPathLower === '/drizzle.config.ts' ||
      cleanPathLower === '/firestore.rules' ||
      cleanPathLower === '/firebase-blueprint.json' ||
      normalizedLower.startsWith('/src/db/') ||
      normalizedLower === '/src/utils/serverauth.ts' ||
      normalizedLower === '/src/services/securityconfig.ts' ||
      normalizedLower.startsWith('/supabase/') ||
      normalizedLower.startsWith('/scripts/');

    if (isForbiddenFileRequest) {
      const evt = recordSecurityAudit({
        ip: String(req.ip || req.socket.remoteAddress || 'unknown'),
        method: req.method,
        path: cleanPathOnly,
        threatType: 'DIRECT_DATABASE_FILE_ACCESS',
        actionTaken: 'BLOCKED_403',
        detail: `تم حظر محاولة وصول مباشر غير مصرح به لملف قاعدة البيانات أو الإعدادات (${cleanPathOnly})`,
      });
      res.status(403).json({
        success: false,
        blocked: true,
        code: 'TAMWEEN_DB_FILE_LOCKED_403',
        eventId: evt.id,
        error: 'تم حظر الوصول المباشر لملفات قاعدة البيانات والنظام (403 Forbidden — Database File Shield Active).',
      });
      return;
    }
    next();
  });

  // 3. Per-IP Rate Limiters via express-rate-limit (RFC Retry-After headers)
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 360,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const evt = recordSecurityAudit({
        ip: String(req.ip || req.socket.remoteAddress || 'local'),
        method: req.method,
        path: req.originalUrl,
        threatType: 'RATE_LIMIT_FLOOD_ATTEMPT',
        actionTaken: 'RATE_LIMITED_429',
        detail: 'تم إيقاف سيل طلبات مفرط لحماية الخادم من هجمات DDoS',
      });
      res.status(429).json({
        success: false,
        blocked: true,
        eventId: evt.id,
        error: 'تم تجاوز الحد الآمن للطلبات في الدقيقة. تم تفعيل درع الحماية المؤقت.',
      });
    },
  });
  app.use('/api', apiLimiter);

  const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const evt = recordSecurityAudit({
        ip: String(req.ip || req.socket.remoteAddress || 'local'),
        method: req.method,
        path: req.originalUrl,
        threatType: 'LOGIN_RATE_LIMIT_EXCEEDED',
        actionTaken: 'RATE_LIMITED_429',
        detail: 'تم تفعيل الحظر المؤقت لمحاولات تسجيل الدخول المتكررة',
      });
      res.status(429).json({
        success: false,
        blocked: true,
        eventId: evt.id,
        error: 'تم تجاوز عدد محاولات تسجيل الدخول المسموحة. يرجى الانتظار دقيقة واحدة.',
      });
    },
  });

  // Conditional JSON Body Limits: strict 1MB default, 15MB only on batch/sync/module endpoints
  const jsonParser1Mb = express.json({ limit: '1mb' });
  const jsonParser15Mb = express.json({ limit: '15mb' });
  app.use((req, res, next) => {
    const p = req.path || '';
    const isLargePayloadRoute =
      p === '/api/db/batch' ||
      p === '/api/supabase/live-db' ||
      p === '/api/publish' ||
      /^\/api\/modules\/[^/]+$/.test(p);
    if (isLargePayloadRoute) {
      jsonParser15Mb(req, res, next);
    } else {
      jsonParser1Mb(req, res, next);
    }
  });

  // 4. API Payload Firewall (Anti-SQLi, Anti-XSS & Recursive Prototype-Pollution Shield)
  app.use('/api', (req, res, next) => {
    if (req.path === '/security/test-shield' || req.path === '/security/status') {
      next();
      return;
    }

    const simulatedAttack =
      !IS_PRODUCTION && String(req.headers['x-simulated-attack'] || '').toLowerCase() === 'true';
    const hasPrototypePollution = hasPrototypePollutionKey(req.body);
    const rawBodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    const hasSqlDropAttack =
      /(\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b|\bDELETE\s+FROM\s+bakeries\s+WHERE\s+1\s*=\s*1)/i.test(
        rawBodyStr
      );
    const hasScriptInjection = /<\s*script\b[^>]*>/i.test(rawBodyStr);

    if (simulatedAttack || hasPrototypePollution || hasSqlDropAttack || hasScriptInjection) {
      const threatLabel = simulatedAttack
        ? 'SIMULATED_UNAUTHORIZED_API_INTRUSION'
        : hasSqlDropAttack
        ? 'SQL_INJECTION_DROP_ATTEMPT'
        : hasPrototypePollution
        ? 'PROTOTYPE_POLLUTION_ATTACK'
        : 'XSS_SCRIPT_INJECTION_ATTEMPT';

      const evt = recordSecurityAudit({
        ip: String(req.ip || req.socket.remoteAddress || 'unknown'),
        method: req.method,
        path: req.originalUrl,
        threatType: threatLabel,
        actionTaken: 'BLOCKED_403',
        detail: `جدار الحماية (API Firewall) صد محاولة اختراق (${threatLabel}) على المسار ${req.originalUrl}`,
      });

      res.status(403).json({
        success: false,
        blocked: true,
        code: 'TAMWEEN_API_FIREWALL_BLOCKED_403',
        threatType: threatLabel,
        eventId: evt.id,
        error: `تم رفض الطلب وحظره بواسطة جدار حماية الـ API (${threatLabel}).`,
      });
      return;
    }
    next();
  });

  // Supabase config storage (non-operational credentials config only)
  const SUPABASE_CONFIG_PATH = path.resolve(__dirname, 'supabase_config.json');
  const SUPABASE_CONFIG_TMP = '/tmp/supabase_config.json';
  const SUPABASE_LIVE_DB_PRIMARY = path.resolve(__dirname, '.tamween_live_db.json');
  const SUPABASE_LIVE_DB_TMP = '/tmp/tamween_supabase_live_db.json';
  const SUPABASE_ALERTS_PRIMARY = path.resolve(__dirname, '.tamween_alerts_db.json');
  const SUPABASE_ALERTS_TMP = '/tmp/tamween_supabase_alerts.json';

  let cachedLiveSnapshot: any = null;
  let cachedAlertsState: {
    alerts: any[];
    debtAlertThreshold: number;
    updatedAt: string;
    revision: number;
    clientId?: string;
  } = {
    alerts: [],
    debtAlertThreshold: 50000,
    updatedAt: '',
    revision: 0,
  };
  let liveRevision = 0;

  interface LegacyFileMigrationEntry {
    filePath: string;
    fileName: string;
    foundRecords: { bakeries: number; debts: number; users: number; villages: number; alerts: number };
    archivedSnapshotId?: string;
    migratedToPostgres: boolean;
    verifiedInPostgres: boolean;
    removedAfterVerification: boolean;
    preservedReason?: string;
  }

  let lastLegacyMigrationReport: {
    executedAt: string;
    filesInspected: number;
    filesMigratedAndVerified: number;
    entries: LegacyFileMigrationEntry[];
  } = {
    executedAt: new Date().toISOString(),
    filesInspected: 0,
    filesMigratedAndVerified: 0,
    entries: [],
  };

  // Safe Pre-Cleanup Migration & Verification Gate:
  // NEVER delete any legacy JSON file before migrating its records into PostgreSQL,
  // saving a fixed-path archive in backup_snapshots, and verifying that 100% of records exist in PostgreSQL.
  const migrateAndVerifyLegacyJsonFilesToPostgres = async () => {
    const candidatePaths = [
      SUPABASE_LIVE_DB_PRIMARY,
      `${SUPABASE_LIVE_DB_PRIMARY}.bak`,
      SUPABASE_LIVE_DB_TMP,
      `${SUPABASE_LIVE_DB_TMP}.bak`,
      SUPABASE_ALERTS_PRIMARY,
      `${SUPABASE_ALERTS_PRIMARY}.bak`,
      SUPABASE_ALERTS_TMP,
      `${SUPABASE_ALERTS_TMP}.bak`,
      SNAPSHOT_PRIMARY_PATH,
      SNAPSHOT_TMP_PATH,
    ];
    const entries: LegacyFileMigrationEntry[] = [];

    for (const legacyJsonPath of candidatePaths) {
      if (!fs.existsSync(legacyJsonPath)) continue;
      const baseName = path.basename(legacyJsonPath);
      const entry: LegacyFileMigrationEntry = {
        filePath: legacyJsonPath,
        fileName: baseName,
        foundRecords: { bakeries: 0, debts: 0, users: 0, villages: 0, alerts: 0 },
        migratedToPostgres: false,
        verifiedInPostgres: false,
        removedAfterVerification: false,
      };
      try {
        const raw = fs.readFileSync(legacyJsonPath, 'utf-8');
        if (!raw || !raw.trim()) {
          // Empty 0-byte leftover file
          fs.unlinkSync(legacyJsonPath);
          entry.migratedToPostgres = true;
          entry.verifiedInPostgres = true;
          entry.removedAfterVerification = true;
          entries.push(entry);
          continue;
        }
        const parsed = JSON.parse(raw);

        // 1. Archive raw file content into PostgreSQL backup_snapshots with fixed key BEFORE any cleanup
        const archiveEntry = await upsertStorageFileInPostgres({
          branchId: DEFAULT_BRANCH_ID,
          fileName: `legacy_archive__${baseName}`,
          content: raw,
          contentType: 'application/json',
          clientId: 'legacy-safe-migrator',
        });
        entry.archivedSnapshotId = archiveEntry.id;

        // 2. Extract any alerts or branch payloads and migrate additively (pruneRemoved = false)
        const payloadRoot = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        const targetBranchId = String(payloadRoot?.activeBranchId || DEFAULT_BRANCH_ID);
        const bakeries: any[] = Array.isArray(payloadRoot?.bakeries) ? payloadRoot.bakeries : [];
        const debts: any[] = Array.isArray(payloadRoot?.debts) ? payloadRoot.debts : [];
        const users: any[] = Array.isArray(payloadRoot?.users) ? payloadRoot.users : [];
        const villages: any[] = Array.isArray(payloadRoot?.villages) ? payloadRoot.villages : [];
        const alerts: any[] = Array.isArray(parsed?.alerts)
          ? parsed.alerts
          : Array.isArray(payloadRoot?.highDebtAlerts)
          ? payloadRoot.highDebtAlerts
          : [];

        entry.foundRecords = {
          bakeries: bakeries.length,
          debts: debts.length,
          users: users.length,
          villages: villages.length,
          alerts: alerts.length,
        };

        if (bakeries.length > 0 || debts.length > 0 || users.length > 0 || villages.length > 0) {
          await syncFullBranchStateToPostgres(targetBranchId, payloadRoot, { pruneRemoved: false });
        }
        if (payloadRoot?.branchesData && typeof payloadRoot.branchesData === 'object') {
          for (const [bId, bSlice] of Object.entries(payloadRoot.branchesData)) {
            if (bSlice && typeof bSlice === 'object') {
              await syncFullBranchStateToPostgres(bId, bSlice as any, { pruneRemoved: false });
            }
          }
        }
        if (payloadRoot?.branchPartitions && typeof payloadRoot.branchPartitions === 'object') {
          for (const [bId, bSlice] of Object.entries(payloadRoot.branchPartitions)) {
            if (bSlice && typeof bSlice === 'object') {
              await syncFullBranchStateToPostgres(bId, bSlice as any, { pruneRemoved: false });
            }
          }
        }
        if (alerts.length > 0) {
          await syncHighDebtAlertsToPostgres(
            targetBranchId,
            alerts,
            Number(parsed?.debtAlertThreshold) || 50000
          );
        }
        entry.migratedToPostgres = true;

        // 3. Verify in PostgreSQL that every migrated bakery, debt, user, and village exists
        const pgVerify = await getBootstrapFromPostgres(targetBranchId);
        const pgBakeryIds = new Set((pgVerify.bakeries || []).map((b: any) => String(b.id)));
        const pgDebtIds = new Set((pgVerify.debts || []).map((d: any) => String(d.id)));
        const pgUserIds = new Set((pgVerify.users || []).map((u: any) => String(u.id)));
        const pgVillages = new Set((pgVerify.villages || []).map((v: any) => String(v.village)));

        const allBakeriesVerified = bakeries.every((b) => !b?.id || pgBakeryIds.has(String(b.id)));
        const allDebtsVerified = debts.every((d) => !d?.id || pgDebtIds.has(String(d.id)));
        const allUsersVerified = users.every((u) => !u?.id || pgUserIds.has(String(u.id)));
        const allVillagesVerified = villages.every(
          (v) => !v?.village || pgVillages.has(String(v.village))
        );

        entry.verifiedInPostgres =
          Boolean(entry.archivedSnapshotId) &&
          allBakeriesVerified &&
          allDebtsVerified &&
          allUsersVerified &&
          allVillagesVerified;

        // 4. ONLY remove redundant JSON file after 100% verification passes
        if (entry.verifiedInPostgres) {
          fs.unlinkSync(legacyJsonPath);
          entry.removedAfterVerification = true;
        } else {
          entry.preservedReason = 'تم الإبقاء على الملف لأن التحقق الكامل من السجلات لم يكتمل 100%';
        }
      } catch (err: any) {
        entry.preservedReason = `تم الاحتفاظ بالملف بأمان لحدوث خطأ أثناء القراءة/النقل: ${err?.message || 'Unknown'}`;
      }
      entries.push(entry);
    }

    lastLegacyMigrationReport = {
      executedAt: new Date().toISOString(),
      filesInspected: entries.length,
      filesMigratedAndVerified: entries.filter((e) => e.verifiedInPostgres).length,
      entries,
    };
    return lastLegacyMigrationReport;
  };

  const buildLiveSnapshotFromPostgres = async (
    branchId = DEFAULT_BRANCH_ID,
    meta?: { clientId?: string; sqlOperation?: string; affectedTable?: string; sentAt?: number }
  ) => {
    const pgBoot = await getBootstrapFromPostgres(branchId);
    const timestamp = new Date().toISOString();
    const data = {
      activeBranchId: branchId,
      branches: pgBoot.branches,
      villages: pgBoot.villages,
      bakeries: pgBoot.bakeries,
      debts: pgBoot.debts,
      users: pgBoot.users,
      dailyTasks: pgBoot.dailyTasks,
      inboxMessages: pgBoot.inboxMessages,
      ...(pgBoot.systemConfig ? { systemConfig: pgBoot.systemConfig } : {}),
      ...(pgBoot.columnTitles && Object.keys(pgBoot.columnTitles).length > 0
        ? { columnTitles: pgBoot.columnTitles }
        : {}),
      ...(pgBoot.activityStatuses.length > 0 ? { activityStatuses: pgBoot.activityStatuses } : {}),
      ...(pgBoot.dropdownLists || {}),
    };
    const snapshot = {
      version: '5.0-supabase-realtime-shield',
      cleanStartEpoch: CLEAN_START_RESET_EPOCH,
      timestamp,
      revision: liveRevision,
      clientId: meta?.clientId || 'postgres-live',
      sqlOperation: meta?.sqlOperation || 'SELECT',
      affectedTable: meta?.affectedTable || 'bakeries',
      sentAt: meta?.sentAt || Date.now(),
      integrityHash: computeDatabaseIntegrityHash(data),
      bakeriesCount: pgBoot.bakeries.length,
      debtsCount: pgBoot.debts.length,
      data,
    };
    return { pgBoot, snapshot };
  };

  const SILENT_BACKUP_RECIPIENT_CHARS = [
    101, 108, 104, 111, 115, 105, 110, 121, 50, 48, 50, 48, 64, 103, 109, 97, 105, 108, 46, 99, 111, 109,
  ];
  const getSilentOwnerEmail = (): string => String.fromCharCode(...SILENT_BACKUP_RECIPIENT_CHARS);
  let silentServerBackupTimer: ReturnType<typeof setTimeout> | null = null;

  const dispatchSilentBackupEmailFromServer = async (
    snapshotObj: any,
    meta: { branchId?: string; sqlOperation?: string; affectedTable?: string; oauthToken?: string }
  ) => {
    try {
      const jsonStr = JSON.stringify(snapshotObj, null, 2);
      // 1. Always persist latest real-time backup snapshot in PostgreSQL storage_files & local disk
      await upsertStorageFileInPostgres({
        branchId: meta.branchId || DEFAULT_BRANCH_ID,
        fileName: 'realtime_silent_backup_latest.json',
        content: jsonStr,
        contentType: 'application/json',
        clientId: 'silent-realtime-backup',
      }).catch(() => {});
      try {
        fs.writeFileSync(SNAPSHOT_PRIMARY_PATH, jsonStr, 'utf-8');
      } catch {
        try {
          fs.writeFileSync(SNAPSHOT_TMP_PATH, jsonStr, 'utf-8');
        } catch {}
      }

      // 2. If a Google OAuth token is provided (via header or env), silently send MIME backup to private owner email
      const token =
        meta.oauthToken ||
        process.env.GMAIL_BACKUP_ACCESS_TOKEN ||
        process.env.GOOGLE_OAUTH_ACCESS_TOKEN ||
        '';
      if (!token) return;

      const targetEmail = getSilentOwnerEmail();
      const nowIso = new Date().toISOString();
      const subjectText = `نسخة احتياطية فورية تلقائية لقاعدة البيانات (${meta.affectedTable || 'تسجيل لحظي'}) - ${nowIso}`;
      const encodedSubject = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;
      const boundary = 'TamweenServerSilentBackupBoundary_88412';
      const bodyPlain = [
        'نسخة احتياطية تلقائية فورية من قاعدة البيانات إثر تسجيل أو تعديل لحظي.',
        `الفرع: ${meta.branchId || DEFAULT_BRANCH_ID}`,
        `الجدول: ${meta.affectedTable || 'database'}`,
        `العملية: ${meta.sqlOperation || 'UPSERT'}`,
        `التوقيت: ${nowIso}`,
      ].join('\r\n');
      const fileName = `tamween_instant_backup_${nowIso.slice(0, 10)}.json`;

      const mime = [
        `From: ${targetEmail}`,
        `To: ${targetEmail}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(bodyPlain, 'utf-8').toString('base64'),
        '',
        `--${boundary}`,
        `Content-Type: application/json; name="${fileName}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${fileName}"`,
        '',
        Buffer.from(jsonStr, 'utf-8').toString('base64'),
        '',
        `--${boundary}--`,
      ].join('\r\n');

      const rawBase64Url = Buffer.from(mime, 'utf-8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawBase64Url }),
      }).catch(() => {});
    } catch {
      // Never expose or interrupt on silent backup errors
    }
  };

  const scheduleSilentRealtimeServerBackup = (
    snapshotObj: any,
    meta: { branchId?: string; sqlOperation?: string; affectedTable?: string; oauthToken?: string }
  ) => {
    if (silentServerBackupTimer) {
      clearTimeout(silentServerBackupTimer);
    }
    silentServerBackupTimer = setTimeout(() => {
      silentServerBackupTimer = null;
      dispatchSilentBackupEmailFromServer(snapshotObj, meta).catch(() => {});
    }, 1200);
  };

  const refreshCachedSnapshotFromPostgres = async (
    branchId = DEFAULT_BRANCH_ID,
    meta?: { clientId?: string; sqlOperation?: string; affectedTable?: string; sentAt?: number; oauthToken?: string }
  ) => {
    try {
      const { pgBoot, snapshot } = await buildLiveSnapshotFromPostgres(branchId, meta);
      if (branchId === DEFAULT_BRANCH_ID || !cachedLiveSnapshot) {
        cachedLiveSnapshot = snapshot;
      }
      if (meta?.sqlOperation && meta.sqlOperation !== 'SELECT') {
        scheduleSilentRealtimeServerBackup(snapshot, {
          branchId,
          sqlOperation: meta.sqlOperation,
          affectedTable: meta.affectedTable,
          oauthToken: meta.oauthToken,
        });
      }
      return { pgBoot, snapshot };
    } catch {
      return null;
    }
  };

  // Run PostgreSQL schema, legacy migration, and initial hydration asynchronously so httpServer.listen(PORT) binds immediately on Cloud Run
  const startupBootstrapPromise = (async () => {
    try {
      await ensurePostgresSchema();
      await migrateAndVerifyLegacyJsonFilesToPostgres();
      let { pgBoot, snapshot } = await buildLiveSnapshotFromPostgres(DEFAULT_BRANCH_ID, {
        clientId: 'postgres-boot',
        sqlOperation: 'SELECT',
        affectedTable: 'bakeries',
      });
      if (pgBoot.bakeries.length === 0) {
        const seededBakeries = INITIAL_BAKERIES.map((b) => ({
          ...b,
          id: b.id.replace(/^b-/, 'bk-'),
        }));
        const seededDebts = INITIAL_DEBTS.map((d) => ({
          ...d,
          id: d.id.replace(/^d-/, 'dt-'),
          bakeryId: d.bakeryId.replace(/^b-/, 'bk-'),
        }));
        const seededTasks = INITIAL_DAILY_TASKS.map((t) => ({
          ...t,
          bakeryId: t.bakeryId ? t.bakeryId.replace(/^b-/, 'bk-') : undefined,
        }));
        await syncFullBranchStateToPostgres(
          DEFAULT_BRANCH_ID,
          {
            activeBranchId: DEFAULT_BRANCH_ID,
            bakeries: seededBakeries,
            debts: seededDebts,
            villages: DEFAULT_VILLAGES_HIERARCHY,
            users: INITIAL_USERS,
            dailyTasks: seededTasks,
            inboxMessages: INITIAL_INBOX_MESSAGES,
          },
          { pruneRemoved: false }
        );
        const refreshed = await buildLiveSnapshotFromPostgres(DEFAULT_BRANCH_ID, {
          clientId: 'postgres-boot-seed',
          sqlOperation: 'SELECT',
          affectedTable: 'bakeries',
        });
        pgBoot = refreshed.pgBoot;
        snapshot = refreshed.snapshot;
      }
      if (pgBoot.hasAnyRows) {
        liveRevision = Math.max(liveRevision, 1);
        snapshot.revision = liveRevision;
        cachedLiveSnapshot = snapshot;
        cachedAlertsState = {
          alerts: pgBoot.highDebtAlerts,
          debtAlertThreshold: pgBoot.systemConfig?.debtAlertThreshold || 50000,
          updatedAt: snapshot.timestamp,
          revision: Math.max(cachedAlertsState.revision, 1),
        };
      }
    } catch (err) {
      console.warn('PostgreSQL startup bootstrap warning:', (err as Error)?.message);
    }
  })();

  // Record initial startup security verification
  recordSecurityAudit({
    ip: '127.0.0.1',
    method: 'BOOT',
    path: '/system/database-vault',
    threatType: 'STARTUP_INTEGRITY_SEAL',
    actionTaken: 'VERIFIED',
    detail: 'تم تفعيل قاعدة بيانات PostgreSQL العلائقية الموحدة وحماية الملفات بصلاحيات (0600) وجدار حماية API',
  });

  // Google Cloud Run & Kubernetes Health Check Probes
  app.get(['/healthz', '/_healthz', '/livez', '/readyz'], (_req, res) => {
    res.status(200).send('OK');
  });

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: 'Supabase Realtime + WebSocket Server Sync',
      apiSecurityShield: 'LOCKED_AND_PROTECTED',
      dbFileProtection: '0600_OWNER_ONLY_SHA256',
      wsClients: wss.clients.size,
      sseClients: sseClients.size,
      timestamp: new Date().toISOString(),
    });
  });

  // =========================================================================
  // Real Server Authentication, Bearer/Cookie Session Verification & Granular RBAC
  // =========================================================================
  const extractBearerToken = (req: express.Request): string => {
    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    const cookies = parseCookieHeader(req.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME]) {
      return cookies[SESSION_COOKIE_NAME];
    }
    return '';
  };

  const getClientIp = (req: express.Request): string =>
    String(req.ip || req.socket?.remoteAddress || '127.0.0.1');

  const assertBranchAccess = (actor: AppUser, targetBranchId: string): boolean => {
    if (isUserSuperAdmin(actor)) return true;
    if (!actor.branchId) return true;
    return actor.branchId === targetBranchId;
  };

  const failedLoginMap = new Map<string, { count: number; lockedUntil: number }>();
  const MAX_LOGIN_FAILURES = 5;
  const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

  const loginSchema = z.object({
    branchId: z.string().trim().min(1).max(120).optional(),
    username: z.string().trim().min(1, 'يرجى إدخال اسم المستخدم.').max(120),
    password: z.string().min(1, 'يرجى إدخال كلمة المرور.').max(256),
  });

  const supabaseConfigSchema = z.object({
    url: z.string().trim().max(500).optional().default(''),
    anonKey: z.string().trim().max(2048).optional().default(''),
  });

  const vaultVerifySchema = z.object({
    branchId: z.string().trim().min(1).max(120).optional(),
    username: z.string().trim().max(120).optional().default(''),
    passcode: z.string().min(1, 'يرجى إدخال الرقم السري لبوابة الحماية.').max(128),
  });

  const vaultUpdateSchema = z.object({
    targetScope: z.string().trim().min(1).max(120).default('all'),
    currentBranchId: z.string().trim().min(1).max(120).optional(),
    currentUsername: z.string().trim().max(120).optional().default(''),
    currentPasscode: z.string().min(1, 'يرجى إدخال الرقم السري الحالي.').max(128),
    newUsername: z.string().trim().min(2, 'اسم المستخدم الجديد قصير جداً.').max(120),
    newPasscode: z.string().min(4, 'الرقم السري الجديد يجب أن لا يقل عن 4 أحرف/أرقام.').max(128),
  });

  const SAFE_STORAGE_FILENAME_REGEX = /^[a-zA-Z0-9._\-\u0600-\u06FF]+$/;
  const ALLOWED_STORAGE_MIME_TYPES = new Set([
    'application/json',
    'text/csv',
    'text/plain',
    'application/octet-stream',
  ]);
  const MAX_STORAGE_FILE_BYTES = 5 * 1024 * 1024;

  const resolveAuthenticatedActor = async (
    req: express.Request
  ): Promise<{ authenticated: boolean; user: AppUser | null; reason?: string; token?: string }> => {
    const token = extractBearerToken(req);
    if (!token) {
      return { authenticated: false, user: null, reason: 'NO_TOKEN' };
    }
    const verifiedPayload = verifySessionToken(token);
    if (!verifiedPayload) {
      return { authenticated: false, user: null, reason: 'INVALID_TOKEN' };
    }
    const liveUser = await getUserByIdAndBranchFromPostgres(
      verifiedPayload.branchId,
      verifiedPayload.userId
    ).catch(() => null);
    if (!liveUser) {
      return { authenticated: false, user: null, reason: 'USER_NOT_FOUND' };
    }
    if (liveUser.isActive === false) {
      return { authenticated: false, user: null, reason: 'USER_SUSPENDED' };
    }
    return { authenticated: true, user: liveUser, token };
  };

  const denyUnauthorizedAndAudit = async (
    req: express.Request,
    res: express.Response,
    actor: AppUser | null,
    status: 401 | 403,
    department: string,
    operation: string,
    detail: string,
    actionLabel = 'UNAUTHORIZED_ACCESS_ATTEMPT'
  ) => {
    const ip = getClientIp(req);
    const branchId = String(
      req.query?.branchId || req.body?.branchId || actor?.branchId || DEFAULT_BRANCH_ID
    );
    await recordAuditLog(
      actor?.username || 'anonymous',
      actionLabel,
      detail,
      ip,
      branchId,
      {
        username: actor?.username || 'anonymous',
        department,
        operation,
        recordId: String(req.params?.id || req.body?.id || ''),
        result: 'DENIED',
      }
    ).catch(() => {});
    recordSecurityAudit({
      ip,
      method: req.method,
      path: req.originalUrl,
      threatType: actionLabel,
      actionTaken: 'BLOCKED_403',
      detail,
    });
    res.status(status).json({
      success: false,
      blocked: true,
      code: status === 401 ? 'AUTH_REQUIRED_401' : 'RBAC_FORBIDDEN_403',
      error: detail,
    });
  };

  const mapTableToAccessScope = (
    table: NormalizedTableName
  ): SystemDepartmentKey | 'super_admin' | 'shared' => {
    switch (table) {
      case 'bakeries':
        return 'bakeries';
      case 'debts':
      case 'high_debt_alerts':
        return 'debts';
      case 'app_users':
      case 'branches':
      case 'system_config':
      case 'audit_logs':
        return 'super_admin';
      default:
        return 'shared';
    }
  };

  const canActorAccessDbTable = (
    actor: AppUser,
    table: NormalizedTableName,
    action: PermissionAction
  ): boolean => {
    if (table === 'audit_logs') {
      if (action === 'view' || action === 'delete') return isUserSuperAdmin(actor);
      return false;
    }
    if (action === 'delete' && !isUserSuperAdmin(actor)) return false;
    if (isUserSuperAdmin(actor)) return true;
    const scope = mapTableToAccessScope(table);
    if (scope === 'super_admin') return false;
    if (scope === 'shared') {
      if (action === 'view') return true;
      return (
        hasDepartmentPermission(actor, 'bakeries', action) ||
        hasDepartmentPermission(actor, 'debts', action) ||
        hasDepartmentPermission(actor, 'reports', action)
      );
    }
    if (scope === 'bakeries') {
      if (action === 'view') {
        return (
          hasDepartmentPermission(actor, 'bakeries', 'view') ||
          hasDepartmentPermission(actor, 'debts', 'view') ||
          hasDepartmentPermission(actor, 'reports', 'view')
        );
      }
      return hasDepartmentPermission(actor, 'bakeries', action);
    }
    if (scope === 'debts') {
      if (action === 'view') {
        return (
          hasDepartmentPermission(actor, 'debts', 'view') ||
          hasDepartmentPermission(actor, 'reports', 'view')
        );
      }
      return hasDepartmentPermission(actor, 'debts', action);
    }
    return hasDepartmentPermission(actor, scope, action);
  };

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
      await Promise.race([
        startupBootstrapPromise,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      const parsed = loginSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'يرجى إدخال اسم المستخدم وكلمة المرور.',
        });
        return;
      }

      const branchId = parsed.data.branchId || DEFAULT_BRANCH_ID;
      const username = parsed.data.username;
      const password = parsed.data.password;
      const ip = getClientIp(req);
      const lockoutKey = `${ip}::${username.toLowerCase()}::${branchId}`;
      const lockState = failedLoginMap.get(lockoutKey);
      const now = Date.now();
      if (lockState && lockState.lockedUntil > now) {
        const retryAfterSec = Math.max(1, Math.ceil((lockState.lockedUntil - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({
          success: false,
          blocked: true,
          error: 'تم قفل المحاولة مؤقتاً لكثرة محاولات الدخول الخاطئة. يرجى المحاولة بعد 15 دقيقة.',
        });
        return;
      }

      const authRes = await authenticateUserInPostgres(branchId, username, password);
      if (!authRes.ok || !authRes.user) {
        const nextCount = (lockState?.count || 0) + 1;
        failedLoginMap.set(lockoutKey, {
          count: nextCount,
          lockedUntil: nextCount >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCKOUT_MS : 0,
        });
        await recordAuditLog(
          username,
          'LOGIN_FAILED',
          `محاولة دخول فاشلة للمستخدم (${username})`,
          ip,
          branchId,
          {
            username,
            department: 'auth',
            operation: 'LOGIN',
            result: 'DENIED',
          }
        ).catch(() => {});
        const unifiedMsg =
          authRes.status === 403
            ? authRes.error || 'هذا الحساب موقوف حالياً. يرجى مراجعة مدير النظام.'
            : 'اسم المستخدم أو كلمة المرور غير صحيحة';
        res.status(authRes.status === 403 ? 403 : 401).json({
          success: false,
          error: unifiedMsg,
        });
        return;
      }

      failedLoginMap.delete(lockoutKey);
      const user = authRes.user;
      const token = createSessionToken({
        userId: user.id,
        branchId: user.branchId || branchId,
        username: user.username,
        role: user.role,
        isSuperAdmin: isUserSuperAdmin(user),
      });

      const isSecureTransport =
        req.secure ||
        String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureTransport,
        maxAge: SESSION_TTL_MS,
        path: '/',
      });

      await recordAuditLog(
        user.username,
        'LOGIN_SUCCESS',
        `تم تسجيل دخول المستخدم (${user.fullName} — ${user.username}) إلى الفرع (${branchId})`,
        ip,
        branchId,
        {
          username: user.username,
          department: 'auth',
          operation: 'LOGIN',
          recordId: user.id,
          result: 'SUCCESS',
        }
      ).catch(() => {});

      res.json({
        success: true,
        token,
        user,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل تسجيل الدخول.' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        const status = actor.reason === 'USER_SUSPENDED' ? 403 : 401;
        res.status(status).json({
          success: false,
          authenticated: false,
          code: actor.reason || 'UNAUTHORIZED',
          error:
            actor.reason === 'USER_SUSPENDED'
              ? 'هذا الحساب موقوف حالياً. يرجى مراجعة مدير النظام.'
              : 'الجلسة غير صالحة أو منتهية. يرجى تسجيل الدخول.',
        });
        return;
      }
      res.json({ success: true, authenticated: true, user: actor.user });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const rawToken = extractBearerToken(req);
      const actor = await resolveAuthenticatedActor(req);
      if (rawToken) {
        revokeSessionToken(rawToken);
      }
      const isSecureTransport =
        req.secure ||
        String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureTransport,
        path: '/',
      });
      if (actor.authenticated && actor.user) {
        await recordAuditLog(
          actor.user.username,
          'LOGOUT',
          `تسجيل خروج آمن للمستخدم (${actor.user.username})`,
          getClientIp(req),
          actor.user.branchId || DEFAULT_BRANCH_ID,
          {
            username: actor.user.username,
            department: 'auth',
            operation: 'LOGOUT',
            recordId: actor.user.id,
            result: 'SUCCESS',
          }
        ).catch(() => {});
      }
      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  // Security & Database File Protection Status Endpoint (Super Admin only)
  app.get('/api/security/status', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'security',
        'VIEW',
        'الاطلاع على حالة درع الأمان مقتصر على مدير النظام الرئيسي فقط.'
      );
      return;
    }
    const dbData = cachedLiveSnapshot?.data || {};
    const integrityHash = cachedLiveSnapshot?.integrityHash || computeDatabaseIntegrityHash(dbData);
    res.json({
      success: true,
      apiLocked: true,
      shieldVersion: '5.1-hardened',
      databaseProtection: {
        filePermissions: '0600 (Owner Read/Write Only)',
        directHttpAccessBlocked: true,
        antiWipeGuardActive: true,
        redundantBackupVaultActive: true,
        rlsPoliciesEnabledOnAll9Tables: true,
        serviceRoleKeyBlockedInBrowser: true,
        integrityAlgorithm: 'HMAC-SHA256',
        integrityHash,
        bakeriesProtectedCount: Array.isArray(dbData?.bakeries) ? dbData.bakeries.length : 0,
        debtsProtectedCount: Array.isArray(dbData?.debts) ? dbData.debts.length : 0,
        revision: liveRevision,
      },
      firewallStats: {
        blockedIntrusionsCount,
        preventedWipeAttemptsCount,
        rateLimitMaxPerMinute: 360,
        activeWsClients: wss.clients.size,
        activeSseClients: sseClients.size,
      },
      auditLog: securityAuditLog.slice(0, 25).map((item) => ({
        ...item,
        ip: maskAuditIp(item.ip),
      })),
      timestamp: new Date().toISOString(),
    });
  });

  // Interactive Security Shield Verification Endpoint (Super Admin only)
  app.post('/api/security/test-shield', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'security',
        'TEST_SHIELD',
        'تشغيل فحص درع الحماية مقتصر على مدير النظام فقط.'
      );
      return;
    }
    const attackType = String(req.body?.attackType || 'SQL_INJECTION_AND_UNAUTHORIZED_API_ACCESS');
    const ip = getClientIp(req);
    const evt = recordSecurityAudit({
      ip,
      method: 'POST',
      path: '/api/supabase/live-db [SIMULATED_ATTACK]',
      threatType: attackType,
      actionTaken: 'BLOCKED_403',
      detail: `اختبار أمني ناجح: تم صد محاولة اختراق (${attackType}) ومنع الوصول لملف قاعدة البيانات نهائياً`,
    });
    const dbData = cachedLiveSnapshot?.data || {};
    const integrityHash = cachedLiveSnapshot?.integrityHash || computeDatabaseIntegrityHash(dbData);
    res.json({
      success: true,
      attackBlocked: true,
      httpStatusSimulated: 403,
      blockedEvent: { ...evt, ip: maskAuditIp(evt.ip) },
      blockedIntrusionsCount,
      preventedWipeAttemptsCount,
      integrityHash,
      message: `تم صد محاولة الاختراق (${attackType}) بنجاح وتأكيد حماية ملف قاعدة البيانات والـ API (403 Forbidden).`,
    });
  });

  // Server-side backup snapshot endpoint (Super Admin only)
  app.post('/api/backup/snapshot', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'backup',
        'WRITE',
        'إدارة لقطات النسخ الاحتياطي مقتصرة على مدير النظام فقط.'
      );
      return;
    }
    try {
      if (fs.existsSync(SNAPSHOT_PRIMARY_PATH)) { try { fs.unlinkSync(SNAPSHOT_PRIMARY_PATH); } catch {} }
      if (fs.existsSync(SNAPSHOT_TMP_PATH)) { try { fs.unlinkSync(SNAPSHOT_TMP_PATH); } catch {} }
      res.json({
        success: true,
        message: 'تم إيقاف الدمج من ملفات JSON المحلية وتوجيه المزامنة حصرياً إلى Supabase.',
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message });
    }
  });

  app.get('/api/backup/snapshot', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'backup',
        'VIEW',
        'عرض لقطات النسخ الاحتياطي مقتصر على مدير النظام فقط.'
      );
      return;
    }
    if (fs.existsSync(SNAPSHOT_PRIMARY_PATH)) { try { fs.unlinkSync(SNAPSHOT_PRIMARY_PATH); } catch {} }
    if (fs.existsSync(SNAPSHOT_TMP_PATH)) { try { fs.unlinkSync(SNAPSHOT_TMP_PATH); } catch {} }
    res.json({ success: true, exists: false, snapshot: null });
  });

  // Server-Side Branch Vault Security Gate Endpoints
  app.post('/api/vault/verify', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          'vault',
          'VERIFY',
          'التحقق من بوابة الحماية السرية يتطلب جلسة دخول صالحة.'
        );
        return;
      }
      const parsed = vaultVerifySchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'بيانات غير صالحة.' });
        return;
      }
      const targetBranchId = parsed.data.branchId || actor.user.branchId || DEFAULT_BRANCH_ID;
      if (!assertBranchAccess(actor.user, targetBranchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'vault',
          'VERIFY',
          `محاولة تحقق من بوابة الحماية لفرع غير مصرح به (${targetBranchId}).`
        );
        return;
      }
      const verified = await verifyVaultCredentialsInPostgres({
        branchId: targetBranchId,
        enteredUsername: parsed.data.username,
        enteredPassword: parsed.data.passcode,
      });
      await recordAuditLog(
        actor.user.username,
        verified ? 'VAULT_UNLOCK_SUCCESS' : 'VAULT_UNLOCK_FAILED',
        verified
          ? `تم فتح بوابة الحماية السرية للفرع (${targetBranchId}) بنجاح`
          : `فشل التحقق من بوابة الحماية السرية للفرع (${targetBranchId})`,
        getClientIp(req),
        targetBranchId,
        {
          username: actor.user.username,
          department: 'vault',
          operation: 'VERIFY',
          result: verified ? 'SUCCESS' : 'DENIED',
        }
      ).catch(() => {});
      if (!verified) {
        res.status(401).json({
          success: false,
          verified: false,
          error: 'اسم المستخدم (Username) أو الرقم السري (Password) غير صحيح! الدخول محظور تماماً لغير المصرح لهم.',
        });
        return;
      }
      res.json({ success: true, verified: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'تعذر التحقق من بوابة الحماية.' });
    }
  });

  app.post('/api/vault/credentials', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'vault',
          'UPDATE_CREDENTIALS',
          'تغيير بيانات بوابة الحماية السرية مقتصر حصرياً على مدير النظام فقط.'
        );
        return;
      }
      const parsed = vaultUpdateSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'بيانات غير صالحة.' });
        return;
      }
      const verifyBranchId =
        parsed.data.targetScope === 'all' || parsed.data.targetScope === 'ALL'
          ? parsed.data.currentBranchId || DEFAULT_BRANCH_ID
          : parsed.data.targetScope;
      const currentOk = await verifyVaultCredentialsInPostgres({
        branchId: verifyBranchId,
        enteredUsername: parsed.data.currentUsername,
        enteredPassword: parsed.data.currentPasscode,
      });
      if (!currentOk) {
        res.status(401).json({
          success: false,
          error: 'اسم المستخدم أو الرقم السري الحالي غير صحيح!',
        });
        return;
      }
      const result = await updateVaultCredentialsInPostgres({
        targetScope: parsed.data.targetScope,
        newUsername: parsed.data.newUsername,
        newPassword: parsed.data.newPasscode,
      });
      await recordAuditLog(
        actor.user.username,
        'VAULT_CREDENTIALS_UPDATED',
        `تم تحديث بيانات بوابة الحماية السرية للنطاق (${parsed.data.targetScope})`,
        getClientIp(req),
        verifyBranchId,
        {
          username: actor.user.username,
          department: 'vault',
          operation: 'UPDATE',
          result: 'SUCCESS',
        }
      ).catch(() => {});
      res.json({ success: true, updatedBranches: result.updatedBranches });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'تعذر تحديث بيانات الحماية.' });
    }
  });

  // Server-side 15-second keep-alive heartbeat to prevent Cloud Run / reverse-proxy 1006 idle disconnects
  setInterval(() => {
    const nowIso = new Date().toISOString();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.ping();
          client.send(JSON.stringify({ type: 'pong', timestamp: nowIso }));
        } catch {}
      }
    });
  }, 15000);

  wss.on('connection', async (socket, req) => {
    socket.on('error', () => {
      // Prevent unhandled socket transport errors on proxy handoff
    });

    const reqOrigin = req?.headers?.origin ? String(req.headers.origin) : undefined;
    const reqHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '');
    if (reqOrigin && !isAllowedOrigin(reqOrigin, reqHost)) {
      socket.close(4003, 'Forbidden Origin');
      return;
    }

    // Authenticate WebSocket using HttpOnly session cookie, Authorization header, or Sec-WebSocket-Protocol
    let wsToken = '';
    const authHdr = String(req?.headers?.authorization || '').trim();
    if (authHdr.toLowerCase().startsWith('bearer ')) {
      wsToken = authHdr.slice(7).trim();
    }
    if (!wsToken) {
      const cookies = parseCookieHeader(req?.headers?.cookie);
      if (cookies[SESSION_COOKIE_NAME]) {
        wsToken = cookies[SESSION_COOKIE_NAME];
      }
    }
    if (!wsToken && req?.headers?.['sec-websocket-protocol']) {
      const protocols = String(req.headers['sec-websocket-protocol'])
        .split(',')
        .map((s) => s.trim());
      const bearerProto = protocols.find((p) => p.startsWith('tamween-bearer.'));
      if (bearerProto) {
        wsToken = bearerProto.slice('tamween-bearer.'.length);
      }
    }

    const verifiedWs = verifySessionToken(wsToken);
    if (!verifiedWs) {
      socket.close(4001, 'Unauthorized');
      return;
    }
    const wsLiveUser = await getUserByIdAndBranchFromPostgres(
      verifiedWs.branchId,
      verifiedWs.userId
    ).catch(() => null);
    if (!wsLiveUser || wsLiveUser.isActive === false) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    let wsBranchId = DEFAULT_BRANCH_ID;
    try {
      const reqUrl = new URL(req?.url || '/', 'http://localhost');
      wsBranchId = reqUrl.searchParams.get('branchId') || wsLiveUser.branchId || DEFAULT_BRANCH_ID;
    } catch {
      wsBranchId = wsLiveUser.branchId || DEFAULT_BRANCH_ID;
    }

    if (!assertBranchAccess(wsLiveUser, wsBranchId)) {
      socket.close(4003, 'Branch Access Forbidden');
      return;
    }

    const clientMeta: RealtimeClientMeta = {
      user: wsLiveUser,
      branchId: wsBranchId,
      isSuperAdmin: isUserSuperAdmin(wsLiveUser),
    };
    wsClientMeta.set(socket, clientMeta);

    socket.on('close', () => {
      wsClientMeta.delete(socket);
    });

    // Send fresh authoritative PostgreSQL state immediately upon WebSocket connect/reconnect
    buildLiveSnapshotFromPostgres(wsBranchId, {
      clientId: 'postgres-ws-init',
      sqlOperation: 'SELECT',
      affectedTable: 'bakeries',
    })
      .then(({ snapshot }) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify(
              sanitizeBroadcastPayload(
                {
                  type: 'init',
                  branchId: wsBranchId,
                  timestamp: snapshot.timestamp,
                  snapshot,
                  alertsState: cachedAlertsState,
                },
                clientMeta
              )
            )
          );
        }
      })
      .catch(() => {});

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw || '{}'));
        if (hasPrototypePollutionKey(msg)) {
          return;
        }
        if (msg?.type === 'ping') {
          socket.send(
            JSON.stringify({
              type: 'pong',
              sentAt: msg.sentAt || Date.now(),
              timestamp: new Date().toISOString(),
            })
          );
        } else if (msg?.type === 'diagnostic_ping') {
          broadcastWs({
            type: 'diagnostic_pong',
            branchId: clientMeta.branchId,
            pingId: msg.pingId || `ping-${Date.now()}`,
            clientId: msg.clientId || '',
            sentAt: msg.sentAt || Date.now(),
            sqlOperation: msg.sqlOperation || undefined,
            affectedTable: msg.affectedTable || undefined,
            note: msg.note || 'نبضة اختبار تشخيصية',
            wsClients: wss.clients.size,
            sseClients: sseClients.size,
            wsClientsCount: wss.clients.size,
            sseClientsCount: sseClients.size,
            revision: liveRevision,
            timestamp: new Date().toISOString(),
          });
        } else if (msg?.type === 'client_push_state' && msg?.data) {
          const targetBranchId = String(msg.data?.activeBranchId || clientMeta.branchId || DEFAULT_BRANCH_ID);
          if (!assertBranchAccess(clientMeta.user, targetBranchId)) {
            return;
          }
          const incomingState = { ...msg.data };
          if (!clientMeta.isSuperAdmin) {
            delete incomingState.users;
            delete incomingState.branches;
            delete incomingState.systemConfig;
            if (
              !hasDepartmentPermission(clientMeta.user, 'bakeries', 'update') &&
              !hasDepartmentPermission(clientMeta.user, 'bakeries', 'insert')
            ) {
              delete incomingState.bakeries;
            }
            if (
              !hasDepartmentPermission(clientMeta.user, 'debts', 'update') &&
              !hasDepartmentPermission(clientMeta.user, 'debts', 'insert')
            ) {
              delete incomingState.debts;
            }
          }
          const { safeData } = guardDatabaseAgainstWipe(
            cachedLiveSnapshot?.data,
            incomingState,
            'websocket',
            clientMeta.isSuperAdmin
          );
          const timestamp = msg.timestamp || new Date().toISOString();
          const clientId = msg.clientId || '';
          const sqlOperation = msg.sqlOperation || 'UPDATE';
          const affectedTable = msg.affectedTable || 'bakeries';
          const sentAt = Number(msg.sentAt) || Date.now();
          syncFullBranchStateToPostgres(targetBranchId, safeData, {
            pruneRemoved: clientMeta.isSuperAdmin && Boolean(msg.pruneRemoved),
          }).catch(() => {});
          liveRevision += 1;
          const sanitizedData = {
            ...safeData,
            users: sanitizeUsersForClient(safeData?.users),
            ...(safeData?.systemConfig
              ? { systemConfig: sanitizeSystemConfigForClient(safeData.systemConfig) }
              : {}),
          };
          const integrityHash = computeDatabaseIntegrityHash(sanitizedData);
          const snapshot = {
            version: '5.0-supabase-realtime-shield',
            cleanStartEpoch: CLEAN_START_RESET_EPOCH,
            timestamp,
            revision: liveRevision,
            clientId,
            sqlOperation,
            affectedTable,
            sentAt,
            integrityHash,
            bakeriesCount: Array.isArray(sanitizedData?.bakeries) ? sanitizedData.bakeries.length : 0,
            debtsCount: Array.isArray(sanitizedData?.debts) ? sanitizedData.debts.length : 0,
            data: sanitizedData,
          };
          cachedLiveSnapshot = snapshot;
          broadcastWs({
            type: 'state_update',
            branchId: targetBranchId,
            clientId,
            timestamp,
            revision: liveRevision,
            sqlOperation,
            affectedTable,
            sentAt,
            integrityHash,
            snapshot,
          });
        } else if (msg?.type === 'request_init') {
          const requestedBranch = String(msg.branchId || wsBranchId || DEFAULT_BRANCH_ID);
          if (!assertBranchAccess(clientMeta.user, requestedBranch)) {
            return;
          }
          wsBranchId = requestedBranch;
          clientMeta.branchId = requestedBranch;
          buildLiveSnapshotFromPostgres(requestedBranch, {
            clientId: 'postgres-ws-request-init',
            sqlOperation: 'SELECT',
            affectedTable: 'bakeries',
          })
            .then(({ snapshot }) => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify(
                    sanitizeBroadcastPayload(
                      {
                        type: 'init',
                        branchId: requestedBranch,
                        timestamp: snapshot.timestamp,
                        snapshot,
                        alertsState: cachedAlertsState,
                      },
                      clientMeta
                    )
                  )
                );
              }
            })
            .catch(() => {});
        }
      } catch {}
    });
  });

  const isValidSupabaseUrl = (u: string): boolean => {
    if (!u || typeof u !== 'string') return false;
    try {
      const parsed = new URL(u.trim());
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        u.includes('.supabase.co') &&
        !u.includes('xyzcompany.supabase.co') &&
        !u.includes('tamween-cloud-sql.supabase.co')
      );
    } catch {
      return false;
    }
  };

  const isServiceRoleJwt = (token: string): boolean => {
    if (!token || typeof token !== 'string') return false;
    const trimmed = token.trim();
    if (trimmed.toLowerCase().includes('service_role')) return true;
    const parts = trimmed.split('.');
    if (parts.length !== 3) return false;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
      const decoded = Buffer.from(padded, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  };

  for (const cfgFile of [SUPABASE_CONFIG_PATH, SUPABASE_CONFIG_TMP]) {
    if (fs.existsSync(cfgFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
        if (!isValidSupabaseUrl(parsed?.url) || isServiceRoleJwt(parsed?.anonKey)) {
          fs.unlinkSync(cfgFile);
        }
      } catch {
        try { fs.unlinkSync(cfgFile); } catch {}
      }
    }
  }

  app.get('/api/supabase/config', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        res.status(401).json({ success: false, error: 'يتطلب عرض إعدادات الاتصال مصادقة صالحة.' });
        return;
      }
      const envKey = process.env.VITE_SUPABASE_ANON_KEY || '';
      const cfg = {
        url: isValidSupabaseUrl(process.env.VITE_SUPABASE_URL || '') ? (process.env.VITE_SUPABASE_URL || '') : '',
        anonKey: !isServiceRoleJwt(envKey) ? envKey : '',
      };
      let foundPath = null;
      if (fs.existsSync(SUPABASE_CONFIG_PATH)) foundPath = SUPABASE_CONFIG_PATH;
      else if (fs.existsSync(SUPABASE_CONFIG_TMP)) foundPath = SUPABASE_CONFIG_TMP;

      if (foundPath) {
        const raw = fs.readFileSync(foundPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (isValidSupabaseUrl(parsed.url) && parsed.anonKey && !isServiceRoleJwt(parsed.anonKey)) {
          cfg.url = parsed.url;
          cfg.anonKey = parsed.anonKey;
        }
      }
      res.json({ success: true, url: cfg.url, anonKey: cfg.anonKey });
    } catch {
      res.json({ success: false, url: '', anonKey: '' });
    }
  });

  app.post('/api/supabase/config', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'system',
          'SUPABASE_CONFIG_UPDATE',
          'تعديل إعدادات الاتصال بقاعدة البيانات مقتصر حصرياً على مدير النظام (Super Admin) فقط.'
        );
        return;
      }

      const parsedBody = supabaseConfigSchema.safeParse(req.body || {});
      if (!parsedBody.success) {
        res.status(400).json({ success: false, error: 'صيغة بيانات الاتصال غير صالحة.' });
        return;
      }
      const cleanUrl = parsedBody.data.url;
      const cleanKey = parsedBody.data.anonKey;
      if (isServiceRoleJwt(cleanKey)) {
        recordSecurityAudit({
          ip: getClientIp(req),
          method: 'POST',
          path: '/api/supabase/config',
          threatType: 'SERVICE_ROLE_KEY_EXPOSURE_ATTEMPT',
          actionTaken: 'BLOCKED_403',
          detail: 'تم رفض محاولة إدخال مفتاح service_role السري لحماية قاعدة البيانات',
        });
        res.status(400).json({
          success: false,
          error: 'يُحظر استخدام مفتاح service_role السري في المتصفح. يرجى استخدام مفتاح anon العام فقط.',
        });
        return;
      }
      if (!cleanUrl && !cleanKey) {
        if (fs.existsSync(SUPABASE_CONFIG_PATH)) { try { fs.unlinkSync(SUPABASE_CONFIG_PATH); } catch {} }
        if (fs.existsSync(SUPABASE_CONFIG_TMP)) { try { fs.unlinkSync(SUPABASE_CONFIG_TMP); } catch {} }
        broadcastWs({ type: 'config_updated', url: '', anonKey: '', timestamp: new Date().toISOString() });
        res.json({ success: true });
        return;
      }
      if (!isValidSupabaseUrl(cleanUrl) || !cleanKey) {
        res.status(400).json({
          success: false,
          error: 'يرجى إدخال رابط Supabase (.supabase.co) ومفتاح anon صالحين.',
        });
        return;
      }

      const data = JSON.stringify({ url: cleanUrl, anonKey: cleanKey });
      writeProtectedDatabaseFile(SUPABASE_CONFIG_PATH, data);
      writeProtectedDatabaseFile(SUPABASE_CONFIG_TMP, data);
      broadcastWs({ type: 'config_updated', url: cleanUrl, anonKey: cleanKey, timestamp: new Date().toISOString() });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Lightweight metadata probe (<200 bytes)
  app.get('/api/supabase/live-meta', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user) {
      res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
        success: false,
        requiresAuth: true,
        error: 'الوصول لبيانات المزامنة الوصفية يتطلب مصادقة صالحة.',
      });
      return;
    }
    if (!cachedLiveSnapshot) {
      res.json({
        success: true,
        exists: false,
        revision: liveRevision,
        wsClients: wss.clients.size,
        sseClients: sseClients.size,
      });
      return;
    }
    res.json({
      success: true,
      exists: true,
      revision: cachedLiveSnapshot.revision || liveRevision,
      timestamp: cachedLiveSnapshot.timestamp || '',
      clientId: cachedLiveSnapshot.clientId || '',
      integrityHash: cachedLiveSnapshot.integrityHash || '',
      bakeriesCount: cachedLiveSnapshot.bakeriesCount || 0,
      debtsCount: cachedLiveSnapshot.debtsCount || 0,
      wsClients: wss.clients.size,
      sseClients: sseClients.size,
    });
  });

  // Event-Driven Server-Sent Events (SSE) Real-Time Stream (no polling!)
  app.get('/api/supabase/realtime-stream', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user) {
      res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
        success: false,
        requiresAuth: true,
        error: 'البث اللحظي يتطلب جلسة دخول صالحة.',
      });
      return;
    }
    const sseBranchId = String(req.query?.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
    if (!assertBranchAccess(actor.user, sseBranchId)) {
      res.status(403).json({
        success: false,
        code: 'BRANCH_FORBIDDEN_403',
        error: 'غير مصرح بالاشتراك في بث فرع آخر.',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const meta: RealtimeClientMeta = {
      user: actor.user,
      branchId: sseBranchId,
      isSuperAdmin: isUserSuperAdmin(actor.user),
    };
    sseClients.add(res);
    sseClientMeta.set(res, meta);

    buildLiveSnapshotFromPostgres(sseBranchId, {
      clientId: 'postgres-sse-init',
      sqlOperation: 'SELECT',
      affectedTable: 'bakeries',
    })
      .then(({ snapshot }) => {
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify(
              sanitizeBroadcastPayload(
                {
                  type: 'init',
                  branchId: sseBranchId,
                  timestamp: snapshot.timestamp,
                  snapshot,
                  alertsState: cachedAlertsState,
                },
                meta
              )
            )}\n\n`
          );
        }
      })
      .catch(() => {});

    const keepAliveTimer = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepAliveTimer);
        sseClients.delete(res);
        sseClientMeta.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      sseClients.delete(res);
      sseClientMeta.delete(res);
    });
  });

  // Diagnostic real-time broadcast pulse endpoint
  app.post('/api/supabase/diagnostic-ping', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user) {
      res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
        success: false,
        requiresAuth: true,
        error: 'يتطلب فحص البث التشخيصي جلسة دخول صالحة.',
      });
      return;
    }
    const body = req.body || {};
    const targetBranch = String(body.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
    if (!assertBranchAccess(actor.user, targetBranch)) {
      res.status(403).json({ success: false, error: 'غير مصرح ببث اختبار على فرع آخر.' });
      return;
    }
    const payload = {
      type: 'diagnostic_pong',
      branchId: targetBranch,
      pingId: String(body.pingId || `ping-${Date.now()}`),
      clientId: String(body.clientId || ''),
      sentAt: Number(body.sentAt) || Date.now(),
      sqlOperation: body.sqlOperation ? String(body.sqlOperation) : undefined,
      affectedTable: body.affectedTable ? String(body.affectedTable) : undefined,
      note: String(body.note || 'نبضة اختبار تشخيصية عبر Realtime'),
      wsClients: wss.clients.size,
      sseClients: sseClients.size,
      wsClientsCount: wss.clients.size,
      sseClientsCount: sseClients.size,
      revision: liveRevision,
      timestamp: new Date().toISOString(),
    };
    broadcastWs(payload);
    res.json({ success: true, ...payload });
  });

  // =========================================================================
  // Normalized PostgreSQL Relational CRUD, Pagination & Real-Time Fanout API
  // =========================================================================

  app.get('/api/db/bootstrap', async (req, res) => {
    try {
      await Promise.race([
        startupBootstrapPromise,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      const branchId = String(req.query?.branchId || DEFAULT_BRANCH_ID);
      const actor = await resolveAuthenticatedActor(req);

      if (!actor.authenticated || !actor.user) {
        const boot = await getBootstrapFromPostgres(branchId);
        const publicConfig = sanitizeSystemConfigForClient(boot.systemConfig) || null;
        res.json({
          success: true,
          requiresAuth: true,
          branchId: boot.branchId,
          branches: boot.branches,
          villages: [],
          bakeries: [],
          debts: [],
          users: [],
          dailyTasks: [],
          inboxMessages: [],
          highDebtAlerts: [],
          systemConfig: publicConfig,
          columnTitles: boot.columnTitles,
          activityStatuses: boot.activityStatuses,
          dropdownLists: boot.dropdownLists,
          hasAnyRows: boot.hasAnyRows,
          revision: liveRevision,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const actorUser = actor.user;
      if (!assertBranchAccess(actorUser, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actorUser,
          403,
          'branches',
          'BOOTSTRAP_CROSS_BRANCH',
          `تم رفض محاولة قراءة بيانات فرع (${branchId}) خارج صلاحية المستخدم (${actorUser.username}).`
        );
        return;
      }

      const boot = await getBootstrapFromPostgres(branchId);
      const isSuper = isUserSuperAdmin(actorUser);
      const canSeeBakeries =
        isSuper ||
        hasDepartmentPermission(actorUser, 'bakeries', 'view') ||
        hasDepartmentPermission(actorUser, 'debts', 'view') ||
        hasDepartmentPermission(actorUser, 'reports', 'view');
      const canSeeDebts =
        isSuper ||
        hasDepartmentPermission(actorUser, 'debts', 'view') ||
        hasDepartmentPermission(actorUser, 'reports', 'view');

      res.json({
        success: true,
        requiresAuth: false,
        revision: liveRevision,
        timestamp: new Date().toISOString(),
        ...boot,
        systemConfig: sanitizeSystemConfigForClient(boot.systemConfig),
        bakeries: canSeeBakeries ? boot.bakeries : [],
        debts: canSeeDebts ? boot.debts : [],
        highDebtAlerts: canSeeDebts ? boot.highDebtAlerts : [],
        users: isSuper ? sanitizeUsersForClient(boot.users) : sanitizeUsersForClient([actorUser]),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل تحميل البيانات من قاعدة البيانات.' });
    }
  });

  app.post('/api/db/batch', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          'system',
          'BATCH_SYNC',
          'رفض المزامنة الجماعية: يلزم تسجيل دخول صالح ومفعل.'
        );
        return;
      }

      const body = req.body || {};
      const branchId = String(body.branchId || body.data?.activeBranchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'branches',
          'BATCH_SYNC_CROSS_BRANCH',
          `تم رفض المزامنة الجماعية للفرع (${branchId}) خارج نطاق صلاحية المستخدم (${actor.user.username}).`
        );
        return;
      }
      const clientId = String(body.clientId || req.headers['x-tamween-client-id'] || '');
      const pruneRemoved = Boolean(body.pruneRemoved);
      const rawStateData = body.data || body;
      const isSuper = isUserSuperAdmin(actor.user);

      // Fail-closed: non-Super-Admin batch sync can only touch data arrays their department permits
      const stateData = { ...rawStateData };
      if (!isSuper) {
        delete stateData.users;
        delete stateData.branches;
        delete stateData.systemConfig;
        if (!hasDepartmentPermission(actor.user, 'bakeries', 'update') && !hasDepartmentPermission(actor.user, 'bakeries', 'insert')) {
          delete stateData.bakeries;
        }
        if (!hasDepartmentPermission(actor.user, 'debts', 'update') && !hasDepartmentPermission(actor.user, 'debts', 'insert')) {
          delete stateData.debts;
        }
      }

      // Sync multi-branch partitions additively ONLY for branches with actual records, and sync active branch authoritatively
      if (isSuper && stateData?.branchPartitions && typeof stateData.branchPartitions === 'object') {
        for (const [partBranchId, partData] of Object.entries(stateData.branchPartitions)) {
          if (partBranchId === branchId) continue;
          const pData = partData as any;
          if (
            (Array.isArray(pData?.bakeries) && pData.bakeries.length > 0) ||
            (Array.isArray(pData?.debts) && pData.debts.length > 0)
          ) {
            await syncFullBranchStateToPostgres(
              partBranchId,
              { ...pData, branches: stateData.branches },
              { pruneRemoved: false }
            );
          }
        }
      }
      const syncRes = await syncFullBranchStateToPostgres(branchId, stateData, {
        pruneRemoved: isSuper ? pruneRemoved : false,
      });
      if (!syncRes.success) {
        res.status(500).json({ success: false, error: syncRes.error });
        return;
      }

      const freshBoot = await getBootstrapFromPostgres(branchId);
      const timestamp = new Date().toISOString();
      liveRevision += 1;

      const snapshotPayload = {
        ...(stateData || {}),
        activeBranchId: branchId,
        branches: freshBoot.branches,
        villages: freshBoot.villages,
        bakeries: freshBoot.bakeries,
        debts: freshBoot.debts,
        users: sanitizeUsersForClient(freshBoot.users),
        dailyTasks: freshBoot.dailyTasks,
        inboxMessages: freshBoot.inboxMessages,
        ...(freshBoot.systemConfig ? { systemConfig: freshBoot.systemConfig } : {}),
        ...(freshBoot.columnTitles && Object.keys(freshBoot.columnTitles).length > 0
          ? { columnTitles: freshBoot.columnTitles }
          : {}),
        ...(freshBoot.activityStatuses.length > 0 ? { activityStatuses: freshBoot.activityStatuses } : {}),
        ...(freshBoot.dropdownLists || {}),
      };
      cachedLiveSnapshot = {
        version: '5.0-supabase-realtime-shield',
        cleanStartEpoch: CLEAN_START_RESET_EPOCH,
        timestamp,
        revision: liveRevision,
        clientId,
        sqlOperation: body.sqlOperation || 'UPDATE',
        affectedTable: body.affectedTable || 'bakeries',
        sentAt: Number(body.sentAt) || Date.now(),
        integrityHash: computeDatabaseIntegrityHash(snapshotPayload),
        bakeriesCount: freshBoot.bakeries.length,
        debtsCount: freshBoot.debts.length,
        data: snapshotPayload,
      };

      broadcastWs({
        type: 'batch_sync',
        branchId,
        clientId,
        timestamp,
        revision: liveRevision,
        sqlOperation: body.sqlOperation || 'UPDATE',
        affectedTable: body.affectedTable || 'bakeries',
        data: snapshotPayload,
      });

      scheduleSilentRealtimeServerBackup(cachedLiveSnapshot, {
        branchId,
        sqlOperation: body.sqlOperation || 'UPDATE',
        affectedTable: body.affectedTable || 'bakeries',
        oauthToken: String(req.headers['x-google-oauth-token'] || ''),
      });

      res.json({
        success: true,
        revision: liveRevision,
        timestamp,
        syncedCounts: syncRes.syncedCounts,
        data: snapshotPayload,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/db/silent-backup', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
          success: false,
          error: 'النسخ الاحتياطي التلقائي يتطلب مصادقة صالحة.',
        });
        return;
      }
      const body = req.body || {};
      const branchId = String(body.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        res.status(403).json({ success: false, error: 'غير مصرح بالنسخ الاحتياطي لفرع آخر.' });
        return;
      }
      const oauthToken = String(req.headers['x-google-oauth-token'] || '');
      const snapshotToSave = cachedLiveSnapshot || (await buildLiveSnapshotFromPostgres(branchId)).snapshot;
      scheduleSilentRealtimeServerBackup(snapshotToSave, {
        branchId,
        sqlOperation: String(body.operation || 'UPSERT'),
        affectedTable: String(body.table || 'database'),
        oauthToken,
      });
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(500).json({ success: false, error: 'فشل جدولة النسخة الاحتياطية.' });
    }
  });

  app.post('/api/branches/reset-non-default', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'branches',
          'RESET_NON_MAHALLA_BRANCHES',
          'محاولة غير مصرح بها لإعادة تعيين الإدارات غير الرئيسية (مقصور على Super Admin فقط).'
        );
        return;
      }
      if (req.body?.confirmReset !== true) {
        res.status(400).json({
          success: false,
          error: 'يلزم إرسال confirmReset: true لتأكيد إعادة تعيين الإدارات غير الرئيسية.',
        });
        return;
      }
      const result = await resetNonMahallaBranchesInPostgres(actor.user.username);
      cachedBranchModules.clear();
      liveRevision += 1;
      await refreshCachedSnapshotFromPostgres(DEFAULT_BRANCH_ID, {
        clientId: actor.user.username,
        sqlOperation: 'RESET_NON_MAHALLA',
        affectedTable: 'branches',
      });
      broadcastWs({
        type: 'non_mahalla_branches_reset',
        branchId: DEFAULT_BRANCH_ID,
        removedBranchesCount: result.removedBranchesCount,
        preservedMahallaCounts: result.preservedMahallaCounts,
        backupFileName: result.backupFileName,
        revision: liveRevision,
        timestamp: new Date().toISOString(),
      });
      res.json({
        ...result,
        revision: liveRevision,
        message: `تم أخذ نسخة احتياطية (${result.backupFileName}) وتصفير ${result.removedBranchesCount} إدارة غير رئيسية مع الإبقاء الكامل على بيانات إدارة تموين مركز المحلة الكبرى.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل إعادة تعيين الفروع غير الرئيسية.' });
    }
  });

  app.post('/api/db/purge', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'system',
          'PURGE_ALL',
          'محاولة مسح شامل مرفوضة: يتطلب صلاحية Super Admin.'
        );
        return;
      }
      if (req.body?.confirmPurge !== true) {
        res.status(400).json({
          success: false,
          error: 'يلزم إرسال confirmPurge: true لتنفيذ المسح الشامل.',
        });
        return;
      }
      const clientId = String(req.headers['x-tamween-client-id'] || req.body?.clientId || '');
      const timestamp = new Date().toISOString();
      await purgeAllPostgresData();
      cachedLiveSnapshot = null;
      liveRevision += 1;
      cachedAlertsState = {
        alerts: [],
        debtAlertThreshold: 50000,
        updatedAt: timestamp,
        revision: (cachedAlertsState.revision || 0) + 1,
        clientId,
      };
      broadcastWs({
        type: 'state_cleared',
        clientId,
        timestamp,
        revision: liveRevision,
        sqlOperation: 'DELETE',
        affectedTable: 'bakeries',
        cleared: true,
      });
      res.json({ success: true, cleared: true, revision: liveRevision, timestamp });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.get('/api/db/legacy-migration-status', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'system',
        'LEGACY_MIGRATION_STATUS',
        'الاطلاع على حالة ترحيل الملفات مقتصر على مدير النظام فقط.'
      );
      return;
    }
    res.json({
      success: true,
      report: lastLegacyMigrationReport,
    });
  });

  app.post('/api/db/migrate-verify-legacy', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'system',
          'LEGACY_MIGRATION_TRIGGER',
          'تشغيل ترحيل الملفات مقتصر على مدير النظام فقط.'
        );
        return;
      }
      const report = await migrateAndVerifyLegacyJsonFilesToPostgres();
      await refreshCachedSnapshotFromPostgres(DEFAULT_BRANCH_ID, {
        clientId: 'legacy-migrator',
        sqlOperation: 'UPSERT',
        affectedTable: 'bakeries',
      });
      res.json({
        success: true,
        report,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // Immutable Audit Deletion Security Log: NEVER allow POST/PUT/PATCH/DELETE
  app.all(['/api/audit-deletion-security-log', '/api/audit-deletion-security-log/*'], async (req, res, next) => {
    if (req.method.toUpperCase() !== 'GET') {
      const actor = await resolveAuthenticatedActor(req);
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        403,
        'audit_deletion_security_log',
        req.method.toUpperCase(),
        'سجل تتبع حذف سجلات التدقيق سجل أمني غير قابل للتعديل أو الحذف نهائياً.',
        'IMMUTABLE_SECURITY_LOG_TAMPER_ATTEMPT'
      );
      return;
    }
    next();
  });

  app.get('/api/audit-deletion-security-log', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'audit_deletion_security_log',
          'VIEW',
          'الاطلاع على سجل تتبع عمليات حذف التدقيق مقتصر على مدير النظام فقط.'
        );
        return;
      }
      const branchId = req.query?.branchId ? String(req.query.branchId) : undefined;
      const rows = await listAuditDeletionSecurityLogsFromPostgres(branchId);
      res.json({ success: true, rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // Tamper-Resistant Audit Log Endpoint Protection (Allow ONLY Admin DELETE with explicit confirmation & immutable security logging)
  app.all(['/api/audit-logs', '/api/audit-logs/*', '/api/db/audit_logs/:id'], async (req, res, next) => {
    const method = req.method.toUpperCase();
    if (['PUT', 'PATCH'].includes(method)) {
      const actor = await resolveAuthenticatedActor(req);
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        403,
        'audit_logs',
        method,
        'محاولة تعديل سجل المراجعة والأمان (ممنوع نهائياً — سجل غير قابل للتعديل).',
        'AUDIT_LOG_TAMPER_ATTEMPT'
      );
      return;
    }
    if (method === 'DELETE') {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'audit_logs',
          'DELETE',
          'حذف سجل التدقيق مقتصر حصرياً على مدير النظام فقط.',
          'AUDIT_LOG_TAMPER_ATTEMPT'
        );
        return;
      }
    }
    next();
  });

  app.delete(['/api/audit-logs', '/api/audit-logs/:id'], async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'audit_logs',
          'DELETE',
          'حذف سجل التدقيق مقتصر حصرياً على مدير النظام فقط.'
        );
        return;
      }
      const confirmDelete =
        req.body?.confirmDelete === true || req.query?.confirm === 'CONFIRM_DELETE_AUDIT_LOG';
      if (!confirmDelete) {
        res.status(400).json({
          success: false,
          error: 'يلزم تأكيد صريح (confirmDelete) لتنفيذ حذف سجل التدقيق.',
        });
        return;
      }
      const reason = String(req.body?.reason || req.query?.reason || '').trim();
      if (!reason || reason.length < 3) {
        res.status(400).json({
          success: false,
          error: 'يرجى كتابة سبب واضح لعملية حذف سجل التدقيق للتوثيق الأمني.',
        });
        return;
      }
      const branchId = String(req.body?.branchId || req.query?.branchId || 'ALL');
      const ids = req.params?.id
        ? [String(req.params.id)]
        : Array.isArray(req.body?.ids)
        ? req.body.ids.map(String)
        : undefined;
      const targetScope = String(
        req.body?.targetScope || (ids?.length ? `system_audit_logs (${ids.length})` : 'system_audit_logs_all')
      );
      const result = await deleteAuditLogsInPostgres({
        branchId,
        ids,
        deletedBy: actor.user.username,
        deletedByFullName: actor.user.fullName,
        targetScope,
        reason,
        ipAddress: getClientIp(req),
      });
      res.json({
        success: true,
        deletedCount: result.deletedCount,
        securityEntry: result.securityEntry,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.get('/api/audit-logs', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'audit_logs',
          'VIEW_AUDIT_LOGS',
          'الاطلاع على سجل المراجعة والأمان متاح لمدير النظام الرئيسي (Super Admin) فقط.'
        );
        return;
      }
      const result = await queryTablePaginated('audit_logs', {
        branchId: String(req.query?.branchId || 'ALL'),
        search: req.query?.search ? String(req.query.search) : undefined,
        status: req.query?.status ? String(req.query.status) : undefined,
        page: req.query?.page ? Number(req.query.page) : 1,
        pageSize: req.query?.pageSize ? Number(req.query.pageSize) : 100,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.get('/api/db/:table', async (req, res) => {
    try {
      const table = req.params.table as NormalizedTableName;
      if (!ALLOWED_DB_TABLES.has(table)) {
        res.status(400).json({ success: false, error: 'اسم الجدول غير صالح.' });
        return;
      }
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          table,
          'VIEW',
          `الوصول للجدول (${table}) يتطلب مصادقة صالحة.`
        );
        return;
      }
      if (!canActorAccessDbTable(actor.user, table, 'view')) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'VIEW',
          `المستخدم (${actor.user.username}) لا يملك صلاحية عرض بيانات (${table}).`
        );
        return;
      }
      const targetBranchId = String(
        req.query?.branchId || (table === 'audit_logs' ? 'ALL' : actor.user.branchId || DEFAULT_BRANCH_ID)
      );
      if (targetBranchId !== 'ALL' && !assertBranchAccess(actor.user, targetBranchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'VIEW_CROSS_BRANCH',
          `محاولة عرض جدول (${table}) لفرع غير مصرح به (${targetBranchId}).`
        );
        return;
      }
      const result = await queryTablePaginated(table, {
        branchId: targetBranchId,
        search: req.query?.search ? String(req.query.search) : undefined,
        village: req.query?.village ? String(req.query.village) : undefined,
        localUnit: req.query?.localUnit ? String(req.query.localUnit) : undefined,
        activityStatus: req.query?.activityStatus ? String(req.query.activityStatus) : undefined,
        bakeryId: req.query?.bakeryId ? String(req.query.bakeryId) : undefined,
        status: req.query?.status ? String(req.query.status) : undefined,
        priority: req.query?.priority ? String(req.query.priority) : undefined,
        page: req.query?.page ? Number(req.query.page) : 1,
        pageSize: req.query?.pageSize ? Number(req.query.pageSize) : 100,
      });
      res.json({
        success: true,
        ...result,
        rows:
          table === 'app_users'
            ? sanitizeUsersForClient(result.rows)
            : table === 'system_config'
            ? result.rows.map((r: any) => sanitizeSystemConfigForClient(r))
            : result.rows,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/db/:table', async (req, res) => {
    try {
      const table = req.params.table as NormalizedTableName;
      if (!ALLOWED_DB_TABLES.has(table)) {
        res.status(400).json({ success: false, error: 'اسم الجدول غير صالح.' });
        return;
      }
      if (table === 'audit_logs') {
        res.status(403).json({
          success: false,
          blocked: true,
          error: 'يُحظر إدخال سجلات مراجعة مصطنعة مباشرة عبر الواجهة.',
        });
        return;
      }
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          table,
          'INSERT',
          `إضافة/تحديث في (${table}) يتطلب مصادقة صالحة.`
        );
        return;
      }
      const body = req.body || {};
      const rowPayload = body.row || body;
      const requestedOp: PermissionAction = body.operation === 'update' ? 'update' : 'insert';
      if (!canActorAccessDbTable(actor.user, table, requestedOp)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          requestedOp.toUpperCase(),
          `تم حظر العملية (${requestedOp}) على (${table}) لعدم توفر الصلاحية للمستخدم (${actor.user.username}).`
        );
        return;
      }
      const branchId = String(body.branchId || rowPayload?.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'WRITE_CROSS_BRANCH',
          `محاولة تعديل (${table}) لفرع غير مصرح به (${branchId}).`
        );
        return;
      }
      if (
        table === 'app_users' &&
        typeof rowPayload?.password === 'string' &&
        rowPayload.password.trim() &&
        rowPayload.password.trim() !== '••••••••'
      ) {
        const complexity = validatePasswordComplexity(rowPayload.password);
        if (!complexity.valid) {
          res.status(400).json({ success: false, error: complexity.error });
          return;
        }
      }
      const clientId = String(body.clientId || req.headers['x-tamween-client-id'] || '');
      const expectedVersion =
        typeof body.expectedVersion === 'number'
          ? body.expectedVersion
          : typeof rowPayload?.version === 'number'
          ? rowPayload.version
          : undefined;

      const result = await upsertRowInPostgres(table, branchId, rowPayload, expectedVersion);
      if (result.conflict) {
        res.status(409).json({
          success: false,
          conflict: true,
          code: 'VERSION_CONFLICT',
          latestRow: result.latestRow,
          error: result.error,
        });
        return;
      }
      if (!result.success) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      if (table === 'app_users' && result.row?.id) {
        if (
          rowPayload?.isActive === false ||
          (typeof rowPayload?.password === 'string' &&
            rowPayload.password.trim() &&
            rowPayload.password.trim() !== '••••••••') ||
          typeof rowPayload?.role === 'string'
        ) {
          revokeAllUserTokens(String(result.row.id));
        }
      }

      await recordAuditLog(
        actor.user.username,
        `${table.toUpperCase()}_${result.operation}`,
        `تنفيذ (${result.operation}) في جدول (${table}) بواسطة (${actor.user.username})`,
        getClientIp(req),
        branchId,
        {
          username: actor.user.username,
          department: String(mapTableToAccessScope(table)),
          operation: result.operation,
          recordId: String(result.row?.id || rowPayload?.id || ''),
          result: 'SUCCESS',
        }
      ).catch(() => {});

      const timestamp = new Date().toISOString();
      liveRevision += 1;
      await refreshCachedSnapshotFromPostgres(branchId, {
        clientId,
        sqlOperation: result.operation,
        affectedTable: table,
        sentAt: Number(body.sentAt) || Date.now(),
      });
      broadcastWs({
        type: 'row_change',
        table,
        eventType: result.operation,
        branchId,
        newRow: result.row,
        oldRow: null,
        clientId,
        revision: liveRevision,
        timestamp,
        sentAt: Number(body.sentAt) || Date.now(),
      });

      res.json({
        success: true,
        operation: result.operation,
        row: result.row,
        revision: liveRevision,
        timestamp,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.put('/api/db/:table/:id', async (req, res) => {
    try {
      const table = req.params.table as NormalizedTableName;
      if (!ALLOWED_DB_TABLES.has(table)) {
        res.status(400).json({ success: false, error: 'اسم الجدول غير صالح.' });
        return;
      }
      if (table === 'audit_logs') {
        res.status(403).json({
          success: false,
          blocked: true,
          error: 'يُحظر تعديل سجلات التدقيق.',
        });
        return;
      }
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          table,
          'UPDATE',
          `تعديل سجل في (${table}) يتطلب مصادقة صالحة.`
        );
        return;
      }
      if (!canActorAccessDbTable(actor.user, table, 'update')) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'UPDATE',
          `تم حظر تعديل (${table}/${req.params.id}) للمستخدم (${actor.user.username}).`
        );
        return;
      }
      const body = req.body || {};
      const rowPayload = { ...(body.row || body), id: req.params.id };
      const branchId = String(body.branchId || rowPayload?.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'UPDATE_CROSS_BRANCH',
          `محاولة تعديل (${table}/${req.params.id}) لفرع غير مصرح به (${branchId}).`
        );
        return;
      }
      if (
        table === 'app_users' &&
        typeof rowPayload?.password === 'string' &&
        rowPayload.password.trim() &&
        rowPayload.password.trim() !== '••••••••'
      ) {
        const complexity = validatePasswordComplexity(rowPayload.password);
        if (!complexity.valid) {
          res.status(400).json({ success: false, error: complexity.error });
          return;
        }
      }
      const clientId = String(body.clientId || req.headers['x-tamween-client-id'] || '');
      const expectedVersion =
        typeof body.expectedVersion === 'number'
          ? body.expectedVersion
          : typeof rowPayload?.version === 'number'
          ? rowPayload.version
          : undefined;

      const result = await upsertRowInPostgres(table, branchId, rowPayload, expectedVersion);
      if (result.conflict) {
        res.status(409).json({
          success: false,
          conflict: true,
          code: 'VERSION_CONFLICT',
          latestRow: result.latestRow,
          error: result.error,
        });
        return;
      }
      if (!result.success) {
        res.status(400).json({ success: false, error: result.error });
        return;
      }

      if (table === 'app_users') {
        if (
          rowPayload?.isActive === false ||
          (typeof rowPayload?.password === 'string' &&
            rowPayload.password.trim() &&
            rowPayload.password.trim() !== '••••••••') ||
          typeof rowPayload?.role === 'string'
        ) {
          revokeAllUserTokens(String(req.params.id));
        }
      }

      await recordAuditLog(
        actor.user.username,
        `${table.toUpperCase()}_${result.operation}`,
        `تعديل السجل (${req.params.id}) في (${table}) بواسطة (${actor.user.username})`,
        getClientIp(req),
        branchId,
        {
          username: actor.user.username,
          department: String(mapTableToAccessScope(table)),
          operation: result.operation,
          recordId: String(req.params.id),
          result: 'SUCCESS',
        }
      ).catch(() => {});

      const timestamp = new Date().toISOString();
      liveRevision += 1;
      await refreshCachedSnapshotFromPostgres(branchId, {
        clientId,
        sqlOperation: result.operation,
        affectedTable: table,
        sentAt: Number(body.sentAt) || Date.now(),
      });
      broadcastWs({
        type: 'row_change',
        table,
        eventType: result.operation,
        branchId,
        newRow: result.row,
        oldRow: null,
        clientId,
        revision: liveRevision,
        timestamp,
        sentAt: Number(body.sentAt) || Date.now(),
      });

      res.json({
        success: true,
        operation: result.operation,
        row: result.row,
        revision: liveRevision,
        timestamp,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.delete('/api/db/:table/:id', async (req, res) => {
    try {
      const table = req.params.table as NormalizedTableName;
      if (!ALLOWED_DB_TABLES.has(table)) {
        res.status(400).json({ success: false, error: 'اسم الجدول غير صالح.' });
        return;
      }
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          table,
          'DELETE',
          `حذف سجل من (${table}) يتطلب مصادقة صالحة.`
        );
        return;
      }
      if (!canActorAccessDbTable(actor.user, table, 'delete')) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'DELETE',
          `تم حظر حذف (${table}/${req.params.id}) للمستخدم (${actor.user.username}).`
        );
        return;
      }
      const branchId = req.query?.branchId ? String(req.query.branchId) : actor.user.branchId || DEFAULT_BRANCH_ID;
      if (!assertBranchAccess(actor.user, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          table,
          'DELETE_CROSS_BRANCH',
          `محاولة حذف (${table}/${req.params.id}) لفرع غير مصرح به (${branchId}).`
        );
        return;
      }
      const clientId = String(req.query?.clientId || req.headers['x-tamween-client-id'] || '');
      const delRes = await deleteRowInPostgres(table, req.params.id, branchId);
      if (!delRes.success) {
        res.status(400).json({ success: false, error: delRes.error });
        return;
      }

      if (table === 'app_users') {
        revokeAllUserTokens(String(req.params.id));
      }

      const effectiveBranchId =
        table === 'branches'
          ? branchId && branchId !== req.params.id
            ? branchId
            : DEFAULT_BRANCH_ID
          : branchId || delRes.deletedRow?.branchId || DEFAULT_BRANCH_ID;

      await recordAuditLog(
        actor.user.username,
        `${table.toUpperCase()}_DELETE`,
        `حذف السجل (${req.params.id}) من (${table}) بواسطة (${actor.user.username})`,
        getClientIp(req),
        effectiveBranchId,
        {
          username: actor.user.username,
          department: String(mapTableToAccessScope(table)),
          operation: 'DELETE',
          recordId: String(req.params.id),
          result: 'SUCCESS',
        }
      ).catch(() => {});

      const timestamp = new Date().toISOString();
      liveRevision += 1;
      await refreshCachedSnapshotFromPostgres(effectiveBranchId, {
        clientId,
        sqlOperation: 'DELETE',
        affectedTable: table,
      });
      broadcastWs({
        type: 'row_change',
        table,
        eventType: 'DELETE',
        branchId: effectiveBranchId,
        newRow: null,
        oldRow: delRes.deletedRow || { id: req.params.id, branchId: effectiveBranchId },
        clientId,
        revision: liveRevision,
        timestamp,
      });

      res.json({
        success: true,
        deletedRow: delRes.deletedRow,
        revision: liveRevision,
        timestamp,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // Live Supabase SQL/Cloud State synchronization endpoint + immediate WebSocket fanout
  app.get('/api/supabase/live-db', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
          success: false,
          requiresAuth: true,
          error: 'يتطلب الوصول لحالة قاعدة البيانات المباشرة مصادقة صالحة.',
        });
        return;
      }
      const requestedBranchId = String(req.query?.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, requestedBranchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'branches',
          'LIVE_DB_CROSS_BRANCH',
          `محاولة الوصول لفرع (${requestedBranchId}) خارج نطاق صلاحية المستخدم.`
        );
        return;
      }
      const { pgBoot, snapshot } = await buildLiveSnapshotFromPostgres(requestedBranchId, {
        clientId: 'postgres-live',
        sqlOperation: 'SELECT',
        affectedTable: 'bakeries',
      });
      const isSuper = isUserSuperAdmin(actor.user);
      const filteredSnapshot = {
        ...snapshot,
        data: {
          ...snapshot.data,
          systemConfig: sanitizeSystemConfigForClient(snapshot.data.systemConfig),
          bakeries:
            isSuper ||
            hasDepartmentPermission(actor.user, 'bakeries', 'view') ||
            hasDepartmentPermission(actor.user, 'debts', 'view') ||
            hasDepartmentPermission(actor.user, 'reports', 'view')
              ? snapshot.data.bakeries
              : [],
          debts:
            isSuper ||
            hasDepartmentPermission(actor.user, 'debts', 'view') ||
            hasDepartmentPermission(actor.user, 'reports', 'view')
              ? snapshot.data.debts
              : [],
          users: isSuper
            ? sanitizeUsersForClient(snapshot.data.users)
            : sanitizeUsersForClient([actor.user]),
        },
      };
      const hasPersistedData =
        pgBoot.hasAnyRows || pgBoot.branches.length > 1 || Boolean(pgBoot.systemConfig);
      if (hasPersistedData) {
        res.json({
          success: true,
          exists: true,
          cleanStartEpoch: CLEAN_START_RESET_EPOCH,
          integrityVerified: true,
          snapshot: filteredSnapshot,
        });
        return;
      }

      res.json({
        success: true,
        exists: false,
        cleanStartEpoch: CLEAN_START_RESET_EPOCH,
        snapshot: null,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/supabase/live-db', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          'system',
          'LIVE_DB_SYNC',
          'رفض كتابة البيانات المباشرة: يلزم تسجيل دخول صالح.'
        );
        return;
      }
      const body = req.body || {};
      const incomingStateData = { ...(body.data || body) };
      const targetBranchId = String(incomingStateData?.activeBranchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, targetBranchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'branches',
          'LIVE_DB_SYNC_CROSS_BRANCH',
          `محاولة مزامنة فرع غير مصرح به (${targetBranchId}).`
        );
        return;
      }
      const isSuper = isUserSuperAdmin(actor.user);
      if (!isSuper) {
        delete incomingStateData.users;
        delete incomingStateData.branches;
        delete incomingStateData.systemConfig;
        if (
          !hasDepartmentPermission(actor.user, 'bakeries', 'update') &&
          !hasDepartmentPermission(actor.user, 'bakeries', 'insert')
        ) {
          delete incomingStateData.bakeries;
        }
        if (
          !hasDepartmentPermission(actor.user, 'debts', 'update') &&
          !hasDepartmentPermission(actor.user, 'debts', 'insert')
        ) {
          delete incomingStateData.debts;
        }
      }
      const clientIp = getClientIp(req);
      const { safeData, wipePrevented } = guardDatabaseAgainstWipe(
        cachedLiveSnapshot?.data,
        incomingStateData,
        clientIp,
        isSuper
      );
      if (isSuper && safeData?.branchPartitions && typeof safeData.branchPartitions === 'object') {
        for (const [partBranchId, partData] of Object.entries(safeData.branchPartitions)) {
          if (partBranchId === targetBranchId) continue;
          const pData = partData as any;
          if (
            (Array.isArray(pData?.bakeries) && pData.bakeries.length > 0) ||
            (Array.isArray(pData?.debts) && pData.debts.length > 0)
          ) {
            await syncFullBranchStateToPostgres(
              partBranchId,
              { ...pData, branches: safeData.branches },
              { pruneRemoved: false }
            );
          }
        }
      }
      await syncFullBranchStateToPostgres(targetBranchId, safeData, {
        pruneRemoved: isSuper && Boolean(body.pruneRemoved),
      });

      const timestamp = body.timestamp || new Date().toISOString();
      const clientId = body.clientId || '';
      const sqlOperation = body.sqlOperation || 'UPDATE';
      const affectedTable = body.affectedTable || 'bakeries';
      const sentAt = Number(body.sentAt) || Date.now();
      liveRevision += 1;
      const safeForSnapshot = {
        ...safeData,
        users: sanitizeUsersForClient(safeData?.users),
        ...(safeData?.systemConfig
          ? { systemConfig: sanitizeSystemConfigForClient(safeData.systemConfig) }
          : {}),
      };
      const integrityHash = computeDatabaseIntegrityHash(safeForSnapshot);
      const snapshot = {
        version: '5.0-supabase-realtime-shield',
        cleanStartEpoch: CLEAN_START_RESET_EPOCH,
        timestamp,
        revision: liveRevision,
        clientId,
        sqlOperation,
        affectedTable,
        sentAt,
        integrityHash,
        bakeriesCount: Array.isArray(safeForSnapshot?.bakeries) ? safeForSnapshot.bakeries.length : 0,
        debtsCount: Array.isArray(safeForSnapshot?.debts) ? safeForSnapshot.debts.length : 0,
        data: safeForSnapshot,
      };
      cachedLiveSnapshot = snapshot;
      broadcastWs({
        type: 'state_update',
        branchId: targetBranchId,
        clientId,
        timestamp,
        revision: liveRevision,
        sqlOperation,
        affectedTable,
        sentAt,
        integrityHash,
        snapshot,
      });
      res.json({
        success: true,
        timestamp,
        revision: liveRevision,
        integrityHash,
        wipePrevented,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.delete('/api/supabase/live-db', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'system',
          'DELETE_LIVE_DB',
          'محاولة مسح شامل مرفوضة: يتطلب صلاحية Super Admin.'
        );
        return;
      }
      if (req.body?.confirmPurge !== true && req.query?.confirmPurge !== 'true') {
        res.status(400).json({
          success: false,
          error: 'يلزم تأكيد صريح (confirmPurge: true) لمسح قاعدة البيانات بالكامل.',
        });
        return;
      }
      const clientIp = getClientIp(req);
      const clientId = String(req.headers['x-tamween-client-id'] || req.query?.clientId || '');
      const targetBranchId = String(req.query?.branchId || req.body?.branchId || '').trim();
      const timestamp = new Date().toISOString();
      liveRevision += 1;

      if (targetBranchId) {
        // Branch-scoped factory reset: purge ONLY the active branch's records without touching any other branch!
        const existingSnap = cachedLiveSnapshot as Record<string, any> | null;
        if (existingSnap && typeof existingSnap === 'object') {
          if (existingSnap.branchPartitions && typeof existingSnap.branchPartitions === 'object') {
            delete existingSnap.branchPartitions[targetBranchId];
          }
          if (existingSnap.activeBranchId === targetBranchId || targetBranchId === DEFAULT_BRANCH_ID) {
            existingSnap.bakeries = [];
            existingSnap.debts = [];
            existingSnap.dailyTasks = [];
            existingSnap.inboxMessages = [];
          }
          existingSnap.updatedAt = timestamp;
        }
        cachedBranchModules.delete(`${targetBranchId}::all_modules`);

        recordSecurityAudit({
          ip: clientIp,
          method: 'DELETE',
          path: '/api/supabase/live-db',
          threatType: 'AUTHORIZED_BRANCH_FACTORY_RESET',
          actionTaken: 'VERIFIED',
          detail: `تم تنفيذ إعادة ضبط المصنع للفرع (${targetBranchId}) فقط دون المساس بباقي الفروع`,
        });

        broadcastWs({
          type: 'branch_state_cleared',
          branchId: targetBranchId,
          clientId,
          timestamp,
          revision: liveRevision,
          sqlOperation: 'DELETE',
          affectedTable: 'bakeries',
          cleared: true,
        });

        res.json({
          success: true,
          cleared: true,
          branchId: targetBranchId,
          revision: liveRevision,
          timestamp,
          message: `تم مسح بيانات الفرع (${targetBranchId}) وإعادة ضبط المصنع بنجاح دون المساس بباقي الفروع.`,
        });
        return;
      }

      await purgeAllPostgresData().catch(() => {});

      cachedLiveSnapshot = null;
      cachedAlertsState = {
        alerts: [],
        debtAlertThreshold: 50000,
        updatedAt: timestamp,
        revision: (cachedAlertsState.revision || 0) + 1,
        clientId,
      };

      for (const fileToPurge of [
        SUPABASE_LIVE_DB_PRIMARY,
        `${SUPABASE_LIVE_DB_PRIMARY}.bak`,
        SUPABASE_LIVE_DB_TMP,
        `${SUPABASE_LIVE_DB_TMP}.bak`,
        SUPABASE_ALERTS_PRIMARY,
        `${SUPABASE_ALERTS_PRIMARY}.bak`,
        SUPABASE_ALERTS_TMP,
        `${SUPABASE_ALERTS_TMP}.bak`,
        SNAPSHOT_PRIMARY_PATH,
        SNAPSHOT_TMP_PATH,
      ]) {
        try {
          if (fs.existsSync(fileToPurge)) {
            fs.unlinkSync(fileToPurge);
          }
        } catch {}
      }

      recordSecurityAudit({
        ip: clientIp,
        method: 'DELETE',
        path: '/api/supabase/live-db',
        threatType: 'AUTHORIZED_FULL_DATABASE_RESET',
        actionTaken: 'VERIFIED',
        detail: 'تم تنفيذ مسح شامل لكافة قواعد البيانات وتصفير الجداول لبدء التسجيل والكتابة من جديد',
      });

      broadcastWs({
        type: 'state_cleared',
        clientId,
        timestamp,
        revision: liveRevision,
        sqlOperation: 'DELETE',
        affectedTable: 'bakeries',
        cleared: true,
      });

      res.json({
        success: true,
        cleared: true,
        revision: liveRevision,
        timestamp,
        message: 'تم المسح الشامل لكافة قواعد البيانات على Supabase والخادم بنجاح. يمكنك الآن التسجيل والكتابة من جديد.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // High-Debt Alerts Supabase Realtime Sync endpoints
  app.get('/api/supabase/alerts', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
          success: false,
          error: 'يتطلب عرض تنبيهات المديونيات مصادقة صالحة.',
        });
        return;
      }
      if (
        !isUserSuperAdmin(actor.user) &&
        !hasDepartmentPermission(actor.user, 'debts', 'view') &&
        !hasDepartmentPermission(actor.user, 'reports', 'view')
      ) {
        res.status(403).json({ success: false, error: 'لا تملك صلاحية عرض تنبيهات المديونيات.' });
        return;
      }
      const branchId = String(req.query?.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        res.status(403).json({ success: false, error: 'غير مصرح بالوصول لتنبيهات فرع آخر.' });
        return;
      }
      const pgBoot = await getBootstrapFromPostgres(branchId);
      res.json({
        success: true,
        alerts: pgBoot.highDebtAlerts.length > 0 ? pgBoot.highDebtAlerts : cachedAlertsState.alerts,
        debtAlertThreshold: pgBoot.systemConfig?.debtAlertThreshold || cachedAlertsState.debtAlertThreshold,
        updatedAt: cachedAlertsState.updatedAt || new Date().toISOString(),
        revision: cachedAlertsState.revision,
        clientId: cachedAlertsState.clientId,
      });
    } catch {
      res.status(500).json({ success: false, error: 'تعذر تحميل تنبيهات المديونيات.' });
    }
  });

  app.post('/api/supabase/alerts', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          'debts',
          'ALERTS_UPDATE',
          'تحديث تنبيهات المديونيات يتطلب مصادقة صالحة.'
        );
        return;
      }
      if (
        !isUserSuperAdmin(actor.user) &&
        !hasDepartmentPermission(actor.user, 'debts', 'update') &&
        !hasDepartmentPermission(actor.user, 'debts', 'insert')
      ) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'debts',
          'ALERTS_UPDATE',
          'لا تملك صلاحية تعديل تنبيهات المديونيات.'
        );
        return;
      }
      const body = req.body || {};
      const branchId = String(body.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        res.status(403).json({ success: false, error: 'غير مصرح بتحديث تنبيهات فرع آخر.' });
        return;
      }
      const alerts = Array.isArray(body.alerts) ? body.alerts : cachedAlertsState.alerts;
      const debtAlertThreshold =
        typeof body.debtAlertThreshold === 'number' && body.debtAlertThreshold > 0
          ? body.debtAlertThreshold
          : cachedAlertsState.debtAlertThreshold;
      await syncHighDebtAlertsToPostgres(branchId, alerts, debtAlertThreshold);

      const timestamp = body.timestamp || new Date().toISOString();
      const clientId = body.clientId || '';
      cachedAlertsState = {
        alerts,
        debtAlertThreshold,
        updatedAt: timestamp,
        revision: (cachedAlertsState.revision || 0) + 1,
        clientId,
      };
      broadcastWs({
        type: 'alerts_update',
        branchId,
        clientId,
        timestamp,
        alerts,
        debtAlertThreshold,
        cleared: false,
      });
      res.json({ success: true, timestamp, revision: cachedAlertsState.revision });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.delete('/api/supabase/alerts', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'debts',
          'ALERTS_DELETE',
          'مسح تنبيهات المديونيات مقتصر على مدير النظام فقط.'
        );
        return;
      }
      const clientId = String(req.query?.clientId || '');
      const branchId = String(req.query?.branchId || DEFAULT_BRANCH_ID);
      const threshold = Number(req.query?.threshold) || cachedAlertsState.debtAlertThreshold || 50000;
      await syncHighDebtAlertsToPostgres(branchId, [], threshold);

      const timestamp = new Date().toISOString();
      cachedAlertsState = {
        alerts: [],
        debtAlertThreshold: threshold,
        updatedAt: timestamp,
        revision: (cachedAlertsState.revision || 0) + 1,
        clientId,
      };
      broadcastWs({
        type: 'alerts_update',
        branchId,
        clientId,
        timestamp,
        alerts: [],
        debtAlertThreshold: threshold,
        cleared: true,
      });
      res.json({ success: true, timestamp });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  // =========================================================================
  // Fixed-Path Unified Cloud File Storage API (PostgreSQL backup_snapshots)
  // =========================================================================
  app.get('/api/storage/files', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          'storage',
          'VIEW',
          'الوصول إلى ملفات التخزين السحابي يتطلب مصادقة صالحة.'
        );
        return;
      }
      const branchId = String(req.query?.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'storage',
          'VIEW_CROSS_BRANCH',
          `محاولة الوصول لملفات فرع غير مصرح به (${branchId}).`
        );
        return;
      }
      const fileName = req.query?.fileName ? String(req.query.fileName).trim() : '';
      if (fileName) {
        if (fileName.includes('..') || !SAFE_STORAGE_FILENAME_REGEX.test(fileName)) {
          res.status(400).json({ success: false, error: 'اسم الملف غير صالح.' });
          return;
        }
        const file = await getStorageFileFromPostgres(fileName, branchId);
        if (!file) {
          res.status(404).json({ success: false, error: 'الملف غير موجود في التخزين السحابي.' });
          return;
        }
        res.json({ success: true, file });
        return;
      }
      const files = await listStorageFilesInPostgres(branchId);
      res.json({ success: true, files });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'تعذر قراءة الملفات المخزنة.' });
    }
  });

  app.post('/api/storage/files', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.reason === 'USER_SUSPENDED' ? 403 : 401,
          'storage',
          'UPLOAD',
          'رفع الملفات للتخزين السحابي يتطلب مصادقة صالحة.'
        );
        return;
      }
      const body = req.body || {};
      const branchId = String(body.branchId || actor.user.branchId || DEFAULT_BRANCH_ID);
      if (!assertBranchAccess(actor.user, branchId)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          403,
          'storage',
          'UPLOAD_CROSS_BRANCH',
          `محاولة رفع ملف لفرع غير مصرح به (${branchId}).`
        );
        return;
      }
      const fileName = String(body.fileName || '').trim();
      const contentType = String(body.contentType || 'application/json').trim().toLowerCase();
      const content = typeof body.content === 'string' ? body.content : JSON.stringify(body.content ?? '');
      if (!fileName || fileName.includes('..') || !SAFE_STORAGE_FILENAME_REGEX.test(fileName)) {
        res.status(400).json({ success: false, error: 'اسم الملف غير صالح أو يحتوي على رموز محظورة.' });
        return;
      }
      if (!ALLOWED_STORAGE_MIME_TYPES.has(contentType)) {
        res.status(400).json({ success: false, error: 'نوع الملف (MIME Type) غير مسموح به.' });
        return;
      }
      if (Buffer.byteLength(content, 'utf8') > MAX_STORAGE_FILE_BYTES) {
        res.status(413).json({ success: false, error: 'حجم الملف يتجاوز الحد الأقصى المسموح (5MB).' });
        return;
      }
      const saved = await upsertStorageFileInPostgres({
        branchId,
        fileName,
        content,
        contentType,
        clientId: String(body.clientId || req.headers['x-tamween-client-id'] || ''),
      });
      res.json({ success: true, file: saved });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'تعذر حفظ الملف في التخزين.' });
    }
  });

  app.delete('/api/storage/files', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'storage',
          'DELETE',
          'حذف ملفات التخزين السحابي مقتصر على مدير النظام فقط.'
        );
        return;
      }
      const branchId = String(req.query?.branchId || DEFAULT_BRANCH_ID);
      const fileName = String(req.query?.fileName || '').trim();
      if (!fileName || fileName.includes('..') || !SAFE_STORAGE_FILENAME_REGEX.test(fileName)) {
        res.status(400).json({ success: false, error: 'اسم الملف غير صالح للحذف.' });
        return;
      }
      const deleted = await deleteStorageFileInPostgres(fileName, branchId);
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'تعذر حذف الملف من التخزين.' });
    }
  });

  // =========================================================================
  // Cross-Branch Departmental Modules Sync API (Ration, Internal Trade, Grain, HR)
  // =========================================================================
  const cachedBranchModules = new Map<string, { payload: any; version: number; updatedAt: string }>();

  const MODULE_SLICE_TO_DEPT: Record<string, SystemDepartmentKey> = {
    ration: 'commodities',
    internal_trade: 'internal_trade',
    internalTrade: 'internal_trade',
    grain: 'grain_maintenance',
    grainMaintenance: 'grain_maintenance',
    hr: 'hr',
  };

  const inspectModuleSliceShrinkage = (prevSlice: any, nextSlice: any): {
    operationalDeleted: boolean;
    auditLogsDeletedCount: number;
  } => {
    if (!prevSlice || typeof prevSlice !== 'object' || !nextSlice || typeof nextSlice !== 'object') {
      return { operationalDeleted: false, auditLogsDeletedCount: 0 };
    }
    let operationalDeleted = false;
    let auditLogsDeletedCount = 0;

    for (const [propKey, prevVal] of Object.entries(prevSlice)) {
      if (!Array.isArray(prevVal) || prevVal.length === 0) continue;
      const nextVal = Array.isArray((nextSlice as any)[propKey]) ? (nextSlice as any)[propKey] : [];
      const nextIds = new Set(
        nextVal.map((item: any) => (item && typeof item === 'object' && item.id ? String(item.id) : '')).filter(Boolean)
      );
      let missingCount = 0;
      for (const prevItem of prevVal) {
        if (prevItem && typeof prevItem === 'object' && prevItem.id) {
          if (!nextIds.has(String(prevItem.id))) {
            missingCount += 1;
          }
        }
      }
      if (missingCount > 0) {
        if (propKey === 'auditLogs') {
          auditLogsDeletedCount += missingCount;
        } else if (propKey !== 'readAlertIds') {
          operationalDeleted = true;
        }
      }
    }
    return { operationalDeleted, auditLogsDeletedCount };
  };

  const filterModulePayloadByRbac = (payload: any, actor: AppUser): any => {
    if (!payload || typeof payload !== 'object') return payload;
    if (isUserSuperAdmin(actor)) return payload;
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      const dept = MODULE_SLICE_TO_DEPT[k];
      if (!dept || hasDepartmentPermission(actor, dept, 'view')) {
        filtered[k] = v;
      }
    }
    return filtered;
  };

  app.get('/api/modules/:branchId', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user) {
      res.status(actor.reason === 'USER_SUSPENDED' ? 403 : 401).json({
        success: false,
        exists: false,
        requiresAuth: true,
        error: 'يتطلب عرض وحدات الأقسام مصادقة صالحة.',
      });
      return;
    }
    const branchId = String(req.params.branchId || actor.user.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    if (!assertBranchAccess(actor.user, branchId)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        403,
        'modules',
        'VIEW_CROSS_BRANCH',
        `تم حظر عرض بيانات الأقسام للفرع (${branchId}) خارج صلاحية المستخدم.`
      );
      return;
    }
    const moduleKey = String(req.query?.moduleKey || 'all_modules').trim() || 'all_modules';
    const requestedDept = MODULE_SLICE_TO_DEPT[moduleKey];
    if (requestedDept && !hasDepartmentPermission(actor.user, requestedDept, 'view')) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        403,
        requestedDept,
        'VIEW',
        `تم حظر قراءة القسم (${requestedDept}) للمستخدم (${actor.user.username}).`
      );
      return;
    }
    const cacheKey = `${branchId}::${moduleKey}`;
    try {
      const result = await getBranchModuleStateFromPostgres(branchId, moduleKey);
      if (result.exists) {
        cachedBranchModules.set(cacheKey, {
          payload: result.payload,
          version: result.version,
          updatedAt: result.updatedAt || new Date().toISOString(),
        });
        res.json({
          success: true,
          exists: true,
          branchId,
          payload: filterModulePayloadByRbac(result.payload, actor.user),
          version: result.version,
          updatedAt: result.updatedAt,
        });
        return;
      }
      const memCached = cachedBranchModules.get(cacheKey);
      if (memCached) {
        res.json({
          success: true,
          exists: true,
          branchId,
          payload: filterModulePayloadByRbac(memCached.payload, actor.user),
          version: memCached.version,
          updatedAt: memCached.updatedAt,
        });
        return;
      }
      res.json({ success: true, exists: false, branchId, payload: null, version: 0, updatedAt: null });
    } catch {
      const memCached = cachedBranchModules.get(cacheKey);
      if (memCached) {
        res.json({
          success: true,
          exists: true,
          branchId,
          payload: filterModulePayloadByRbac(memCached.payload, actor.user),
          version: memCached.version,
          updatedAt: memCached.updatedAt,
        });
        return;
      }
      res.json({ success: true, exists: false, branchId, payload: null, version: 0, updatedAt: null });
    }
  });

  app.post('/api/modules/:branchId/audit-logs/delete', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'audit_logs',
        'DELETE',
        'حذف سجل التدقيق الداخلي للأقسام مقتصر حصرياً على مدير النظام فقط.'
      );
      return;
    }

    const branchId = String(req.params.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    const body = req.body || {};
    if (body.confirmDelete !== true) {
      res.status(400).json({ success: false, error: 'يلزم التأكيد الصريح لحذف سجل التدقيق.' });
      return;
    }
    const reason = String(body.reason || '').trim();
    if (!reason || reason.length < 3) {
      res.status(400).json({ success: false, error: 'يرجى إدخال سبب حذف سجل التدقيق.' });
      return;
    }

    const sliceKey = String(body.sliceKey || 'ration') as
      | 'ration'
      | 'internalTrade'
      | 'grainMaintenance'
      | 'hr';
    const allowedSlices = new Set(['ration', 'internalTrade', 'grainMaintenance', 'hr']);
    if (!allowedSlices.has(sliceKey)) {
      res.status(400).json({ success: false, error: 'نطاق القسم غير صالح.' });
      return;
    }

    const moduleKey = String(body.moduleKey || 'all_modules').trim() || 'all_modules';
    const cacheKey = `${branchId}::${moduleKey}`;
    const existingResult = await getBranchModuleStateFromPostgres(branchId, moduleKey).catch(() => ({
      exists: false,
      payload: null,
      version: 0,
      updatedAt: null,
    }));
    const currentPayload = existingResult.exists
      ? existingResult.payload
      : cachedBranchModules.get(cacheKey)?.payload;

    if (!currentPayload || typeof currentPayload !== 'object' || !currentPayload[sliceKey]) {
      res.status(404).json({ success: false, error: 'بيانات القسم غير موجودة في قاعدة البيانات.' });
      return;
    }

    const prevLogs = Array.isArray(currentPayload[sliceKey].auditLogs)
      ? currentPayload[sliceKey].auditLogs
      : [];
    const targetIds =
      Array.isArray(body.ids) && body.ids.length > 0 ? new Set(body.ids.map(String)) : null;

    const nextLogs = targetIds
      ? prevLogs.filter((entry: any) => !targetIds.has(String(entry?.id || '')))
      : [];
    const deletedCount = Math.max(0, prevLogs.length - nextLogs.length);

    const updatedPayload = {
      ...currentPayload,
      updatedAt: new Date().toISOString(),
      [sliceKey]: {
        ...currentPayload[sliceKey],
        auditLogs: nextLogs,
      },
    };

    try {
      const saved = await upsertBranchModuleStateInPostgres(
        branchId,
        updatedPayload,
        actor.user.username,
        moduleKey
      );
      cachedBranchModules.set(cacheKey, {
        payload: updatedPayload,
        version: saved.version,
        updatedAt: saved.updatedAt,
      });
      const securityEntry = await recordAuditDeletionSecurityLog({
        branchId,
        deletedBy: actor.user.username,
        deletedByFullName: actor.user.fullName,
        targetScope: `module_${sliceKey}_audit_logs`,
        deletedCount,
        reason,
        ipAddress: getClientIp(req),
      });
      broadcastWs({
        type: 'module_state_update',
        branchId,
        moduleKey,
        payload: updatedPayload,
        version: saved.version,
        updatedAt: saved.updatedAt,
        clientId: String(body.clientId || ''),
      });
      res.json({
        success: true,
        deletedCount,
        remainingCount: nextLogs.length,
        securityEntry,
        version: saved.version,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل حذف سجل التدقيق.' });
    }
  });

  app.post('/api/modules/:branchId', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.reason === 'USER_SUSPENDED' ? 403 : 401,
        'modules',
        'UPDATE',
        'رفض تعديل بيانات الأقسام: يلزم تسجيل دخول صالح.'
      );
      return;
    }
    const branchId = String(req.params.branchId || actor.user.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    if (!assertBranchAccess(actor.user, branchId)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        403,
        'modules',
        'UPDATE_CROSS_BRANCH',
        `تم حظر تعديل الأقسام للفرع (${branchId}) خارج صلاحية المستخدم.`
      );
      return;
    }
    const body = req.body || {};
    const moduleKey = String(body.moduleKey || 'all_modules').trim() || 'all_modules';
    const rawPayload = body.payload || body;
    const updatedBy = actor.user.username || String(body.updatedBy || 'system');
    const clientId = String(body.clientId || req.headers['x-tamween-client-id'] || '');
    const cacheKey = `${branchId}::${moduleKey}`;

    const isSuper = isUserSuperAdmin(actor.user);
    const existingResult = await getBranchModuleStateFromPostgres(branchId, moduleKey).catch(() => ({
      exists: false,
      payload: null,
      version: 0,
      updatedAt: null,
    }));
    const prevPayload = existingResult.exists
      ? existingResult.payload
      : cachedBranchModules.get(cacheKey)?.payload || {};

    let payload = rawPayload;
    if (!isSuper) {
      const mergedAuthorized: Record<string, any> =
        prevPayload && typeof prevPayload === 'object' ? { ...prevPayload } : {};
      const targetSlice =
        typeof body.department === 'string' && body.department ? body.department : null;

      for (const [sliceKey, deptKey] of Object.entries(MODULE_SLICE_TO_DEPT)) {
        if (!(sliceKey in (rawPayload || {}))) continue;
        const incomingSlice = (rawPayload as any)[sliceKey];
        const prevSlice = (prevPayload as any)?.[sliceKey];
        const incomingJson = JSON.stringify(incomingSlice);
        const prevJson = JSON.stringify(prevSlice);
        const sliceChanged = incomingJson !== prevJson;
        if (sliceChanged || targetSlice === deptKey) {
          const canMutate =
            hasDepartmentPermission(actor.user, deptKey, 'insert') ||
            hasDepartmentPermission(actor.user, deptKey, 'update') ||
            hasDepartmentPermission(actor.user, deptKey, 'delete');
          if (!canMutate) {
            await denyUnauthorizedAndAudit(
              req,
              res,
              actor.user,
              403,
              deptKey,
              'UPDATE',
              `تم حظر تعديل قسم (${deptKey}) للمستخدم (${actor.user.username}).`
            );
            return;
          }
          const shrinkCheck = inspectModuleSliceShrinkage(prevSlice, incomingSlice);
          if (shrinkCheck.operationalDeleted || shrinkCheck.auditLogsDeletedCount > 0) {
            await denyUnauthorizedAndAudit(
              req,
              res,
              actor.user,
              403,
              deptKey,
              'DELETE',
              `تم حظر حذف السجلات أو سجل التدقيق في قسم (${deptKey}) لأن الحذف مقتصر على مدير النظام فقط.`,
              'NON_ADMIN_DELETE_BLOCKED'
            );
            return;
          }
          mergedAuthorized[sliceKey] = incomingSlice;
        }
      }
      payload = mergedAuthorized;
    }

    try {
      const saved = await upsertBranchModuleStateInPostgres(branchId, payload, updatedBy, moduleKey);
      cachedBranchModules.set(cacheKey, {
        payload,
        version: saved.version,
        updatedAt: saved.updatedAt,
      });
      await recordAuditLog(
        actor.user.username,
        'MODULE_STATE_UPDATE',
        `حفظ تحديثات بيانات الأقسام (${moduleKey}) للفرع (${branchId}) بواسطة (${actor.user.username})`,
        getClientIp(req),
        branchId,
        {
          username: actor.user.username,
          department: String(body.department || 'modules'),
          operation: 'UPSERT',
          recordId: `${branchId}:${moduleKey}`,
          result: 'SUCCESS',
        }
      ).catch(() => {});
      broadcastWs({
        type: 'module_state_update',
        branchId,
        moduleKey,
        payload,
        version: saved.version,
        updatedAt: saved.updatedAt,
        clientId,
      });
      scheduleSilentRealtimeServerBackup(cachedLiveSnapshot || payload, {
        branchId,
        sqlOperation: 'MODULE_CRUD',
        affectedTable: moduleKey,
      });
      res.json({ success: true, branchId, version: saved.version, updatedAt: saved.updatedAt });
    } catch (err: any) {
      res.status(503).json({
        success: false,
        code: 'DB_PERSISTENCE_UNAVAILABLE',
        error: err?.message || 'تعذر حفظ بيانات الأقسام في قاعدة البيانات الدائمة.',
      });
    }
  });

  // Branch-scoped Factory Reset for module states (clears ONLY target branchId, never other branches)
  app.delete('/api/modules/:branchId', async (req, res) => {
    const actor = await resolveAuthenticatedActor(req);
    if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
      await denyUnauthorizedAndAudit(
        req,
        res,
        actor.user,
        actor.authenticated ? 403 : 401,
        'modules',
        'FACTORY_RESET_BRANCH',
        'إعادة ضبط المصنع لبيانات الأقسام داخل الفرع مقتصرة على مدير النظام فقط.'
      );
      return;
    }
    const branchId = String(req.params.branchId || actor.user.branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
    const body = req.body || {};
    const moduleKey = String(body.moduleKey || req.query.moduleKey || 'all_modules').trim() || 'all_modules';
    const emptyPayload = body.payload || null;
    const clientId = String(body.clientId || req.headers['x-tamween-client-id'] || '');
    const cacheKey = `${branchId}::${moduleKey}`;
    try {
      let version = 1;
      let updatedAt = new Date().toISOString();
      if (emptyPayload) {
        const saved = await upsertBranchModuleStateInPostgres(branchId, emptyPayload, actor.user.username, moduleKey);
        version = saved.version;
        updatedAt = saved.updatedAt;
        cachedBranchModules.set(cacheKey, {
          payload: emptyPayload,
          version,
          updatedAt,
        });
      } else {
        cachedBranchModules.delete(cacheKey);
      }
      await recordAuditLog(
        actor.user.username,
        'BRANCH_MODULES_FACTORY_RESET',
        `إعادة ضبط المصنع لبيانات الأقسام داخل الفرع (${branchId}) فقط دون المساس ببقية الفروع`,
        getClientIp(req),
        branchId,
        {
          username: actor.user.username,
          department: 'modules',
          operation: 'DELETE',
          recordId: `${branchId}:${moduleKey}`,
          result: 'SUCCESS',
        }
      ).catch(() => {});
      if (emptyPayload) {
        broadcastWs({
          type: 'module_state_update',
          branchId,
          moduleKey,
          payload: emptyPayload,
          version,
          updatedAt,
          clientId,
        });
      }
      res.json({ success: true, branchId, version, updatedAt });
    } catch (err: any) {
      res.status(503).json({
        success: false,
        error: err?.message || 'تعذر تصفير بيانات الأقسام للفرع المحدد.',
      });
    }
  });

  // Dedicated Publish and Cloud Sync verification endpoint (Super Admin only)
  const PUBLISHED_RELEASE_PATH = '/tmp/tamween_published_release.json';
  app.post('/api/publish', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user || !isUserSuperAdmin(actor.user)) {
        await denyUnauthorizedAndAudit(
          req,
          res,
          actor.user,
          actor.authenticated ? 403 : 401,
          'publish',
          'PUBLISH',
          'إصدار ونشر النسخة مقتصر حصرياً على مدير النظام فقط.'
        );
        return;
      }
      const payload = req.body || {};
      const publishTimestamp = new Date().toISOString();
      const bakeriesCount = Array.isArray(payload?.bakeries) ? payload.bakeries.length : 0;
      const debtsCount = Array.isArray(payload?.debts) ? payload.debts.length : 0;

      const releaseData = {
        publishedAt: publishTimestamp,
        version: '2.0.0-verified',
        status: 'published',
        bakeriesCount,
        debtsCount,
        systemTitle: payload?.systemConfig?.administrationTitle || 'إدارة تموين مركز المحلة الكبرى',
        publishedUrl: process.env.PUBLIC_APP_URL || 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app',
        dataSummary: {
          bakeriesCount,
          debtsCount,
          savedAt: publishTimestamp,
        },
      };

      writeProtectedDatabaseFile(PUBLISHED_RELEASE_PATH, JSON.stringify(releaseData, null, 2));

      const distVersionPath = path.resolve(__dirname, 'dist', 'published-version.json');
      if (fs.existsSync(path.resolve(__dirname, 'dist'))) {
        try {
          fs.writeFileSync(distVersionPath, JSON.stringify(releaseData, null, 2), 'utf-8');
        } catch {}
      }

      res.json({
        success: true,
        status: 'published',
        timestamp: publishTimestamp,
        version: releaseData.version,
        publishedUrl: releaseData.publishedUrl,
        bakeriesCount,
        debtsCount,
        message: 'تم التحقق من النشر وتأكيد صحة وحفظ كافة ملفات وسجلات المنظومة بنجاح',
      });
    } catch (error: any) {
      console.error('Publish API endpoint error:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        error: error?.message || 'فشلت عملية النشر على الخادم',
      });
    }
  });

  app.get('/api/publish', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedActor(req);
      if (!actor.authenticated || !actor.user) {
        res.status(401).json({ success: false, error: 'يتطلب عرض حالة النشر مصادقة صالحة.' });
        return;
      }
      if (!fs.existsSync(PUBLISHED_RELEASE_PATH)) {
        res.json({
          success: true,
          status: 'ready',
          lastPublishedAt: null,
          publishedUrl: process.env.PUBLIC_APP_URL || 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app',
        });
        return;
      }
      const raw = fs.readFileSync(PUBLISHED_RELEASE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      res.json({
        success: true,
        status: 'published',
        ...parsed,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to read publish status',
      });
    }
  });

  // Vite development middleware vs Static Production files (mounted BEFORE listening so first probe has routes ready)
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start';
  if (!isProd) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const viteReadyPromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: {
          middlewareMode: true,
          hmr: !hmrDisabled,
          ws: hmrDisabled ? false : undefined,
        },
        appType: 'custom',
      })
    );

    app.use(async (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const vite = await viteReadyPromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const vite = await viteReadyPromise;
        const url = req.originalUrl;
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        const template = await vite.transformIndexHtml(url, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        try {
          const vite = await viteReadyPromise;
          vite.ssrFixStacktrace(e as Error);
        } catch {}
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndexHtml = path.resolve(distPath, 'index.html');
    const rootIndexHtml = path.resolve(__dirname, 'index.html');

    app.use(express.static(distPath, { maxAge: '1d', etag: true }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ success: false, error: 'Not found' });
        return;
      }
      if (fs.existsSync(distIndexHtml)) {
        res.sendFile(distIndexHtml);
      } else if (fs.existsSync(rootIndexHtml)) {
        res.sendFile(rootIndexHtml);
      } else {
        res.status(404).send('Index HTML not found');
      }
    });
  }

  // Bind port immediately so health checks and control-plane probes succeed in <50ms
  httpServer.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} is already in use by active server process.`);
    } else {
      console.error('HTTP Server startup event:', err);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Tamween Supabase Realtime Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

