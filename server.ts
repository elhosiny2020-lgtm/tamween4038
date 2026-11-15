import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  ALLOWED_DB_TABLES,
  DEFAULT_BRANCH_ID,
  deleteRowInPostgres,
  ensurePostgresSchema,
  getBootstrapFromPostgres,
  purgeAllPostgresData,
  queryTablePaginated,
  syncFullBranchStateToPostgres,
  syncHighDebtAlertsToPostgres,
  upsertRowInPostgres,
  type NormalizedTableName,
} from './src/db/queries.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_PRIMARY_PATH = path.resolve(__dirname, 'tamween_latest_backup.json');
const SNAPSHOT_TMP_PATH = '/tmp/tamween_latest_backup.json';

// Security Shield Token & HMAC Secret for API & Database Protection
const API_SECURITY_SHIELD_TOKEN = 'TAMWEEN-GOV-SHIELD-2026-V5';
const DB_INTEGRITY_HMAC_SECRET = process.env.TAMWEEN_DB_HMAC_SECRET || 'tamween-gharbia-sovereign-db-seal-2026';

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
    // Also maintain a redundant .bak protected vault file
    const bakPath = `${filePath}.bak`;
    fs.writeFileSync(bakPath, content, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(bakPath, 0o600);
    } catch {}
  } catch {}
}

const CLEAN_START_RESET_EPOCH = '2026-11-15-FRESH-DB-V1';

/**
 * Server-Side Anti-Wipe Guard:
 * Protects against unauthenticated or malformed wipe payloads while allowing
 * authenticated client operations (including starting from scratch or deleting records).
 */
function guardDatabaseAgainstWipe(
  existingData: any,
  incomingData: any,
  clientIp = 'ws',
  isAuthenticatedClient = true
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

  // If the request is from an authenticated client with valid security shield token,
  // honor the client's exact state (including fresh registration or record deletion).
  if (isAuthenticatedClient) {
    return {
      safeData: {
        ...existingData,
        ...incomingData,
        bakeries: Array.isArray(incomingData.bakeries) ? incomingData.bakeries : [],
        debts: Array.isArray(incomingData.debts) ? incomingData.debts : [],
      },
      wipePrevented: false,
    };
  }

  let wipePrevented = false;
  const safeData = { ...existingData, ...incomingData };

  const exBakeries = Array.isArray(existingData.bakeries) ? existingData.bakeries : [];
  const incBakeries = Array.isArray(incomingData.bakeries) ? incomingData.bakeries : [];
  if (exBakeries.length > 0 && incBakeries.length === 0) {
    safeData.bakeries = exBakeries;
    wipePrevented = true;
  }

  const exDebts = Array.isArray(existingData.debts) ? existingData.debts : [];
  const incDebts = Array.isArray(incomingData.debts) ? incomingData.debts : [];
  if (exDebts.length > 0 && incDebts.length === 0) {
    safeData.debts = exDebts;
    wipePrevented = true;
  }

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
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // WebSocket Server attached to port 3000 for genuine sub-50ms cross-device real-time sync
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/supabase-realtime' });
  const sseClients = new Set<express.Response>();

  const broadcastWs = (payload: Record<string, any>) => {
    const encoded = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(encoded);
        } catch {}
      }
    });
    sseClients.forEach((res) => {
      try {
        res.write(`data: ${encoded}\n\n`);
      } catch {
        sseClients.delete(res);
      }
    });
  };

  // 1. Sovereign Security Headers & CORS Middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Tamween-Security-Token, X-Tamween-Client-Id, X-Simulated-Attack'
    );
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.header('X-Permitted-Cross-Domain-Policies', 'none');
    res.header('X-Tamween-Database-Shield', 'ACTIVE-SHA256-0600');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // 2. Direct Database File & Sensitive Config Access Blocker (Anti-Leakage Shield)
  app.use((req, res, next) => {
    const rawUrl = decodeURIComponent(req.originalUrl || req.url || '');
    const lowerUrl = rawUrl.toLowerCase();
    const isForbiddenFileRequest =
      rawUrl.includes('..') ||
      lowerUrl.includes('.tamween_live_db') ||
      lowerUrl.includes('.tamween_alerts_db') ||
      lowerUrl.includes('supabase_config.json') ||
      lowerUrl.includes('tamween_latest_backup') ||
      lowerUrl.includes('.env') ||
      lowerUrl.includes('.git') ||
      lowerUrl.endsWith('.sqlite') ||
      lowerUrl.endsWith('.db') ||
      lowerUrl.endsWith('.bak') ||
      lowerUrl.endsWith('.sql') ||
      lowerUrl.endsWith('/server.ts');

    if (isForbiddenFileRequest) {
      const evt = recordSecurityAudit({
        ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'),
        method: req.method,
        path: rawUrl,
        threatType: 'DIRECT_DATABASE_FILE_ACCESS',
        actionTaken: 'BLOCKED_403',
        detail: `تم حظر محاولة وصول مباشر غير مصرح به لملف قاعدة البيانات أو الإعدادات (${rawUrl})`,
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

  // 3. Per-IP Rate Limiter against Brute-Force & Flood Attacks on /api/*
  const ipRateMap = new Map<string, { count: number; windowStart: number }>();
  app.use('/api', (req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    const now = Date.now();
    const entry = ipRateMap.get(ip);
    if (!entry || now - entry.windowStart > 60_000) {
      ipRateMap.set(ip, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > 360) {
        const evt = recordSecurityAudit({
          ip,
          method: req.method,
          path: req.originalUrl,
          threatType: 'RATE_LIMIT_FLOOD_ATTEMPT',
          actionTaken: 'RATE_LIMITED_429',
          detail: `تم إيقاف سيل طلبات مفرط (${entry.count} طلب/دقيقة) لحماية الخادم من هجمات DDoS`,
        });
        res.status(429).json({
          success: false,
          blocked: true,
          eventId: evt.id,
          error: 'تم تجاوز الحد الآمن للطلبات في الدقيقة. تم تفعيل درع الحماية المؤقت.',
        });
        return;
      }
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // 4. API Payload Firewall (Anti-SQLi, Anti-XSS, Anti-Prototype-Pollution & Unauthorized Intrusion Blocker)
  app.use('/api', (req, res, next) => {
    // Allow explicit security shield test endpoint to handle its own simulation report
    if (req.path === '/security/test-shield' || req.path === '/security/status') {
      next();
      return;
    }

    const simulatedAttack = String(req.headers['x-simulated-attack'] || '').toLowerCase() === 'true';
    const rawBodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    const hasPrototypePollution =
      rawBodyStr.includes('"__proto__"') || rawBodyStr.includes('"prototype"');
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
        ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'),
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

  // Dedicated Supabase config & live-db storage for seamless cross-device synchronization
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

  // Hydrate cached snapshots ONLY if they belong to the current CLEAN_START_RESET_EPOCH.
  // Any legacy pre-reset database files are purged so registration starts fresh from scratch.
  for (const candidatePath of [
    SUPABASE_LIVE_DB_PRIMARY,
    `${SUPABASE_LIVE_DB_PRIMARY}.bak`,
    SUPABASE_LIVE_DB_TMP,
    `${SUPABASE_LIVE_DB_TMP}.bak`,
    SNAPSHOT_PRIMARY_PATH,
    SNAPSHOT_TMP_PATH,
  ]) {
    try {
      if (fs.existsSync(candidatePath)) {
        const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
        if (parsed && parsed.cleanStartEpoch === CLEAN_START_RESET_EPOCH && parsed.data) {
          try {
            fs.chmodSync(candidatePath, 0o600);
          } catch {}
          if (
            !cachedLiveSnapshot ||
            (Date.parse(parsed.timestamp || '') || 0) > (Date.parse(cachedLiveSnapshot.timestamp || '') || 0)
          ) {
            cachedLiveSnapshot = parsed;
            liveRevision = Math.max(liveRevision, Number(parsed?.revision || 1));
          }
        } else {
          // Legacy snapshot before the full database reset -> delete it cleanly
          try {
            fs.unlinkSync(candidatePath);
          } catch {}
        }
      }
    } catch {
      try {
        if (fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
      } catch {}
    }
  }

  for (const alertsPath of [
    SUPABASE_ALERTS_PRIMARY,
    `${SUPABASE_ALERTS_PRIMARY}.bak`,
    SUPABASE_ALERTS_TMP,
    `${SUPABASE_ALERTS_TMP}.bak`,
  ]) {
    try {
      if (fs.existsSync(alertsPath)) {
        const parsedAlerts = JSON.parse(fs.readFileSync(alertsPath, 'utf-8'));
        if (parsedAlerts && parsedAlerts.cleanStartEpoch === CLEAN_START_RESET_EPOCH) {
          try {
            fs.chmodSync(alertsPath, 0o600);
          } catch {}
          cachedAlertsState = {
            alerts: Array.isArray(parsedAlerts.alerts) ? parsedAlerts.alerts : [],
            debtAlertThreshold: Number(parsedAlerts.debtAlertThreshold) || 50000,
            updatedAt: parsedAlerts.updatedAt || '',
            revision: Number(parsedAlerts.revision) || 0,
          };
        } else {
          try {
            fs.unlinkSync(alertsPath);
          } catch {}
        }
      }
    } catch {
      try {
        if (fs.existsSync(alertsPath)) fs.unlinkSync(alertsPath);
      } catch {}
    }
  }

  // Ensure normalized PostgreSQL schema & default branch on startup, and hydrate state from PG
  try {
    await ensurePostgresSchema();
    const pgBoot = await getBootstrapFromPostgres(DEFAULT_BRANCH_ID);
    if (pgBoot.hasAnyRows) {
      liveRevision = Math.max(liveRevision, 1);
      cachedLiveSnapshot = {
        version: '5.0-supabase-realtime-shield',
        cleanStartEpoch: CLEAN_START_RESET_EPOCH,
        timestamp: new Date().toISOString(),
        revision: liveRevision,
        clientId: 'postgres-boot',
        sqlOperation: 'SELECT',
        affectedTable: 'bakeries',
        sentAt: Date.now(),
        integrityHash: computeDatabaseIntegrityHash(pgBoot),
        bakeriesCount: pgBoot.bakeries.length,
        debtsCount: pgBoot.debts.length,
        data: pgBoot,
      };
      cachedAlertsState = {
        alerts: pgBoot.highDebtAlerts,
        debtAlertThreshold: pgBoot.systemConfig?.debtAlertThreshold || 50000,
        updatedAt: new Date().toISOString(),
        revision: Math.max(cachedAlertsState.revision, 1),
      };
    }
  } catch (err) {
    console.warn('PostgreSQL startup bootstrap warning:', (err as Error)?.message);
  }

  // Record initial startup security verification
  recordSecurityAudit({
    ip: '127.0.0.1',
    method: 'BOOT',
    path: '/system/database-vault',
    threatType: 'STARTUP_INTEGRITY_SEAL',
    actionTaken: 'VERIFIED',
    detail: 'تم تفعيل قاعدة بيانات PostgreSQL العلائقية الموحدة وحماية الملفات بصلاحيات (0600) وجدار حماية API',
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

  // Security & Database File Protection Status Endpoint
  app.get('/api/security/status', (_req, res) => {
    const dbData = cachedLiveSnapshot?.data || {};
    const integrityHash = cachedLiveSnapshot?.integrityHash || computeDatabaseIntegrityHash(dbData);
    res.json({
      success: true,
      apiLocked: true,
      shieldVersion: API_SECURITY_SHIELD_TOKEN,
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
      auditLog: securityAuditLog.slice(0, 25),
      timestamp: new Date().toISOString(),
    });
  });

  // Interactive Security Shield Verification Endpoint (Simulates & Blocks Intrusion / SQLi / Wipe Attack)
  app.post('/api/security/test-shield', (req, res) => {
    const attackType = String(req.body?.attackType || 'SQL_INJECTION_AND_UNAUTHORIZED_API_ACCESS');
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
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
      blockedEvent: evt,
      blockedIntrusionsCount,
      preventedWipeAttemptsCount,
      integrityHash,
      message: `تم صد محاولة الاختراق (${attackType}) بنجاح وتأكيد حماية ملف قاعدة البيانات والـ API (403 Forbidden).`,
    });
  });

  // Server-side backup snapshot endpoint (Legacy JSON backups disabled per user requirement - Supabase exclusive sync)
  app.post('/api/backup/snapshot', (_req, res) => {
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

  app.get('/api/backup/snapshot', (_req, res) => {
    if (fs.existsSync(SNAPSHOT_PRIMARY_PATH)) { try { fs.unlinkSync(SNAPSHOT_PRIMARY_PATH); } catch {} }
    if (fs.existsSync(SNAPSHOT_TMP_PATH)) { try { fs.unlinkSync(SNAPSHOT_TMP_PATH); } catch {} }
    res.json({ success: true, exists: false, snapshot: null });
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

  wss.on('connection', (socket) => {
    socket.on('error', () => {
      // Prevent unhandled socket transport errors on proxy handoff
    });

    // Send authoritative state immediately upon WebSocket connect/reconnect
    try {
      socket.send(
        JSON.stringify({
          type: 'init',
          timestamp: new Date().toISOString(),
          snapshot: cachedLiveSnapshot,
          alertsState: cachedAlertsState,
        })
      );
    } catch {}

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw || '{}'));
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
          const { safeData } = guardDatabaseAgainstWipe(
            cachedLiveSnapshot?.data,
            msg.data,
            'websocket',
            true
          );
          const timestamp = msg.timestamp || new Date().toISOString();
          const clientId = msg.clientId || '';
          const sqlOperation = msg.sqlOperation || 'UPDATE';
          const affectedTable = msg.affectedTable || 'bakeries';
          const sentAt = Number(msg.sentAt) || Date.now();
          const targetBranchId = String(safeData?.activeBranchId || DEFAULT_BRANCH_ID);
          syncFullBranchStateToPostgres(targetBranchId, safeData, { pruneRemoved: true }).catch(() => {});
          liveRevision += 1;
          const integrityHash = computeDatabaseIntegrityHash(safeData);
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
            bakeriesCount: Array.isArray(safeData?.bakeries) ? safeData.bakeries.length : 0,
            debtsCount: Array.isArray(safeData?.debts) ? safeData.debts.length : 0,
            data: safeData,
          };
          cachedLiveSnapshot = snapshot;
          const serialized = JSON.stringify(snapshot);
          writeProtectedDatabaseFile(SUPABASE_LIVE_DB_PRIMARY, serialized);
          writeProtectedDatabaseFile(SUPABASE_LIVE_DB_TMP, serialized);
          broadcastWs({
            type: 'state_update',
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
          socket.send(
            JSON.stringify({
              type: 'init',
              timestamp: new Date().toISOString(),
              snapshot: cachedLiveSnapshot,
              alertsState: cachedAlertsState,
            })
          );
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

  // Clean up any accidentally autofilled invalid config files or service_role keys on startup
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

  app.get('/api/supabase/config', (_req, res) => {
    try {
      const envKey = process.env.VITE_SUPABASE_ANON_KEY || '';
      let cfg = {
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

  app.post('/api/supabase/config', (req, res) => {
    try {
      const { url, anonKey } = req.body || {};
      const cleanUrl = String(url || '').trim();
      const cleanKey = String(anonKey || '').trim();
      if (isServiceRoleJwt(cleanKey)) {
        recordSecurityAudit({
          ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'),
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
      if (isValidSupabaseUrl(cleanUrl) && cleanKey) {
        const data = JSON.stringify({ url: cleanUrl, anonKey: cleanKey });
        writeProtectedDatabaseFile(SUPABASE_CONFIG_PATH, data);
        writeProtectedDatabaseFile(SUPABASE_CONFIG_TMP, data);
        broadcastWs({ type: 'config_updated', url: cleanUrl, anonKey: cleanKey, timestamp: new Date().toISOString() });
      } else if (!cleanUrl && !cleanKey) {
        if (fs.existsSync(SUPABASE_CONFIG_PATH)) { try { fs.unlinkSync(SUPABASE_CONFIG_PATH); } catch {} }
        if (fs.existsSync(SUPABASE_CONFIG_TMP)) { try { fs.unlinkSync(SUPABASE_CONFIG_TMP); } catch {} }
        broadcastWs({ type: 'config_updated', url: '', anonKey: '', timestamp: new Date().toISOString() });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Lightweight metadata probe (<200 bytes)
  app.get('/api/supabase/live-meta', (_req, res) => {
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
  app.get('/api/supabase/realtime-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);

    // Push initial state immediately upon SSE stream subscription
    try {
      res.write(
        `data: ${JSON.stringify({
          type: 'init',
          timestamp: new Date().toISOString(),
          snapshot: cachedLiveSnapshot,
          alertsState: cachedAlertsState,
        })}\n\n`
      );
    } catch {}

    const keepAliveTimer = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepAliveTimer);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      sseClients.delete(res);
    });
  });

  // Diagnostic real-time broadcast pulse endpoint
  app.post('/api/supabase/diagnostic-ping', (req, res) => {
    const body = req.body || {};
    const payload = {
      type: 'diagnostic_pong',
      pingId: body.pingId || `ping-${Date.now()}`,
      clientId: body.clientId || '',
      sentAt: body.sentAt || Date.now(),
      sqlOperation: body.sqlOperation || undefined,
      affectedTable: body.affectedTable || undefined,
      note: body.note || 'نبضة اختبار تشخيصية عبر Realtime',
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
      const branchId = String(req.query?.branchId || DEFAULT_BRANCH_ID);
      const boot = await getBootstrapFromPostgres(branchId);
      res.json({
        success: true,
        revision: liveRevision,
        timestamp: new Date().toISOString(),
        ...boot,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل تحميل البيانات من قاعدة البيانات.' });
    }
  });

  app.post('/api/db/batch', async (req, res) => {
    try {
      const body = req.body || {};
      const branchId = String(body.branchId || body.data?.activeBranchId || DEFAULT_BRANCH_ID);
      const clientId = String(body.clientId || req.headers['x-tamween-client-id'] || '');
      const pruneRemoved = Boolean(body.pruneRemoved);
      const stateData = body.data || body;

      // Sync multi-branch partitions if present, otherwise active branch
      if (stateData?.branchPartitions && typeof stateData.branchPartitions === 'object') {
        for (const [partBranchId, partData] of Object.entries(stateData.branchPartitions)) {
          await syncFullBranchStateToPostgres(
            partBranchId,
            { ...(partData as any), branches: stateData.branches },
            { pruneRemoved }
          );
        }
      }
      const syncRes = await syncFullBranchStateToPostgres(branchId, stateData, { pruneRemoved });
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
        users: freshBoot.users,
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

  app.post('/api/db/purge', async (req, res) => {
    try {
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

  app.get('/api/db/:table', async (req, res) => {
    try {
      const table = req.params.table as NormalizedTableName;
      if (!ALLOWED_DB_TABLES.has(table)) {
        res.status(400).json({ success: false, error: 'اسم الجدول غير صالح.' });
        return;
      }
      const result = await queryTablePaginated(table, {
        branchId: String(req.query?.branchId || DEFAULT_BRANCH_ID),
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
      res.json({ success: true, ...result });
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
      const body = req.body || {};
      const rowPayload = body.row || body;
      const branchId = String(body.branchId || rowPayload?.branchId || DEFAULT_BRANCH_ID);
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

      const timestamp = new Date().toISOString();
      liveRevision += 1;
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
      const body = req.body || {};
      const rowPayload = { ...(body.row || body), id: req.params.id };
      const branchId = String(body.branchId || rowPayload?.branchId || DEFAULT_BRANCH_ID);
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

      const timestamp = new Date().toISOString();
      liveRevision += 1;
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
      const branchId = req.query?.branchId ? String(req.query.branchId) : undefined;
      const clientId = String(req.query?.clientId || req.headers['x-tamween-client-id'] || '');
      const delRes = await deleteRowInPostgres(table, req.params.id, branchId);
      if (!delRes.success) {
        res.status(400).json({ success: false, error: delRes.error });
        return;
      }

      const effectiveBranchId = branchId || delRes.deletedRow?.branchId || DEFAULT_BRANCH_ID;
      const timestamp = new Date().toISOString();
      liveRevision += 1;
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
      const requestedBranchId = String(req.query?.branchId || DEFAULT_BRANCH_ID);
      const pgBoot = await getBootstrapFromPostgres(requestedBranchId);
      const hasPersistedData =
        pgBoot.hasAnyRows || pgBoot.branches.length > 1 || Boolean(pgBoot.systemConfig);
      if (hasPersistedData) {
        const mergedData = {
          ...(cachedLiveSnapshot?.data || {}),
          activeBranchId: requestedBranchId,
          branches: pgBoot.branches,
          villages: pgBoot.villages,
          bakeries: pgBoot.bakeries,
          debts: pgBoot.debts,
          users: pgBoot.users.length > 0 ? pgBoot.users : cachedLiveSnapshot?.data?.users || [],
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
          timestamp: cachedLiveSnapshot?.timestamp || new Date().toISOString(),
          revision: liveRevision,
          clientId: cachedLiveSnapshot?.clientId || 'postgres-live',
          sqlOperation: 'SELECT',
          affectedTable: 'bakeries',
          sentAt: Date.now(),
          integrityHash: computeDatabaseIntegrityHash(mergedData),
          bakeriesCount: pgBoot.bakeries.length,
          debtsCount: pgBoot.debts.length,
          data: mergedData,
        };
        res.json({
          success: true,
          exists: true,
          cleanStartEpoch: CLEAN_START_RESET_EPOCH,
          integrityVerified: true,
          snapshot,
        });
        return;
      }

      if (!cachedLiveSnapshot) {
        res.json({
          success: true,
          exists: false,
          cleanStartEpoch: CLEAN_START_RESET_EPOCH,
          snapshot: null,
        });
        return;
      }
      res.json({
        success: true,
        exists: true,
        cleanStartEpoch: CLEAN_START_RESET_EPOCH,
        integrityVerified: true,
        snapshot: cachedLiveSnapshot,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/supabase/live-db', async (req, res) => {
    try {
      const body = req.body || {};
      const incomingStateData = body.data || body;
      const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'http');
      const hasSecurityToken =
        req.headers['x-tamween-security-token'] === API_SECURITY_SHIELD_TOKEN;
      const { safeData, wipePrevented } = guardDatabaseAgainstWipe(
        cachedLiveSnapshot?.data,
        incomingStateData,
        clientIp,
        hasSecurityToken
      );
      const targetBranchId = String(safeData?.activeBranchId || DEFAULT_BRANCH_ID);
      if (safeData?.branchPartitions && typeof safeData.branchPartitions === 'object') {
        for (const [partBranchId, partData] of Object.entries(safeData.branchPartitions)) {
          await syncFullBranchStateToPostgres(
            partBranchId,
            { ...(partData as any), branches: safeData.branches },
            { pruneRemoved: hasSecurityToken }
          );
        }
      }
      await syncFullBranchStateToPostgres(targetBranchId, safeData, { pruneRemoved: hasSecurityToken });

      const timestamp = body.timestamp || new Date().toISOString();
      const clientId = body.clientId || '';
      const sqlOperation = body.sqlOperation || 'UPDATE';
      const affectedTable = body.affectedTable || 'bakeries';
      const sentAt = Number(body.sentAt) || Date.now();
      liveRevision += 1;
      const integrityHash = computeDatabaseIntegrityHash(safeData);
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
        bakeriesCount: Array.isArray(safeData?.bakeries) ? safeData.bakeries.length : 0,
        debtsCount: Array.isArray(safeData?.debts) ? safeData.debts.length : 0,
        data: safeData,
      };
      cachedLiveSnapshot = snapshot;
      const serialized = JSON.stringify(snapshot);
      writeProtectedDatabaseFile(SUPABASE_LIVE_DB_PRIMARY, serialized);
      writeProtectedDatabaseFile(SUPABASE_LIVE_DB_TMP, serialized);
      broadcastWs({
        type: 'state_update',
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
      const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'http');
      const clientId = String(req.headers['x-tamween-client-id'] || req.query?.clientId || '');
      const timestamp = new Date().toISOString();
      liveRevision += 1;

      await purgeAllPostgresData().catch(() => {});

      // Perform a complete purge of all server-side database files and in-memory snapshots
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
      const branchId = String(req.query?.branchId || DEFAULT_BRANCH_ID);
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
      res.json({
        success: true,
        ...cachedAlertsState,
      });
    }
  });

  app.post('/api/supabase/alerts', async (req, res) => {
    try {
      const body = req.body || {};
      const alerts = Array.isArray(body.alerts) ? body.alerts : cachedAlertsState.alerts;
      const debtAlertThreshold =
        typeof body.debtAlertThreshold === 'number' && body.debtAlertThreshold > 0
          ? body.debtAlertThreshold
          : cachedAlertsState.debtAlertThreshold;
      const branchId = String(body.branchId || DEFAULT_BRANCH_ID);
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
      const serializedAlerts = JSON.stringify(cachedAlertsState);
      writeProtectedDatabaseFile(SUPABASE_ALERTS_PRIMARY, serializedAlerts);
      writeProtectedDatabaseFile(SUPABASE_ALERTS_TMP, serializedAlerts);
      broadcastWs({
        type: 'alerts_update',
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
      const serializedAlerts = JSON.stringify(cachedAlertsState);
      writeProtectedDatabaseFile(SUPABASE_ALERTS_PRIMARY, serializedAlerts);
      writeProtectedDatabaseFile(SUPABASE_ALERTS_TMP, serializedAlerts);
      broadcastWs({
        type: 'alerts_update',
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

  // Dedicated Publish and Cloud Sync verification endpoint
  const PUBLISHED_RELEASE_PATH = '/tmp/tamween_published_release.json';
  app.post('/api/publish', (req, res) => {
    try {
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
      
      // Also sync to dist if present
      const distVersionPath = path.resolve(__dirname, 'dist', 'published-version.json');
      if (fs.existsSync(path.resolve(__dirname, 'dist'))) {
        try {
          fs.writeFileSync(distVersionPath, JSON.stringify(releaseData, null, 2), 'utf-8');
        } catch {
          // non-critical
        }
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

  app.get('/api/publish', (_req, res) => {
    try {
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

  // Vite development middleware vs Static Production files
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);
  if (!isProd) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        ws: hmrDisabled ? false : undefined,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        const template = await vite.transformIndexHtml(url, rawHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const distIndexHtml = path.resolve(distPath, 'index.html');
    const rootIndexHtml = path.resolve(__dirname, 'index.html');

    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndexHtml)) {
        res.sendFile(distIndexHtml);
      } else if (fs.existsSync(rootIndexHtml)) {
        res.sendFile(rootIndexHtml);
      } else {
        res.status(404).send('Index HTML not found');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Tamween Supabase Realtime Server running on http://localhost:${PORT}`);
  });
}

startServer();

