import crypto from 'node:crypto';
import fs from 'node:fs';
import type { AppUser } from '../types.ts';

const SCRYPT_PREFIX = 'scrypt$';
const TOKEN_VERSION = 'v1';
export const SESSION_COOKIE_NAME = 'tamween_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours
const MIN_PRODUCTION_SECRET_LENGTH = 32;
const RUNTIME_SECRETS_PATH = '/tmp/.tamween_runtime_secrets.json';

// Separate CSPRNG per-process fallback keys (never shared, never hardcoded literals)
const PROCESS_FALLBACK_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const PROCESS_FALLBACK_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
let missingSecretWarned = false;
let cachedRuntimeSecrets: { sessionSecret: string; dbHmacSecret: string } | null = null;

function loadOrCreateRuntimeSecrets(): { sessionSecret: string; dbHmacSecret: string } {
  if (cachedRuntimeSecrets) return cachedRuntimeSecrets;
  try {
    if (fs.existsSync(RUNTIME_SECRETS_PATH)) {
      const raw = fs.readFileSync(RUNTIME_SECRETS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.sessionSecret === 'string' &&
        parsed.sessionSecret.length >= MIN_PRODUCTION_SECRET_LENGTH &&
        typeof parsed?.dbHmacSecret === 'string' &&
        parsed.dbHmacSecret.length >= MIN_PRODUCTION_SECRET_LENGTH
      ) {
        cachedRuntimeSecrets = {
          sessionSecret: parsed.sessionSecret,
          dbHmacSecret: parsed.dbHmacSecret,
        };
        return cachedRuntimeSecrets;
      }
    }
    const generated = {
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      dbHmacSecret: crypto.randomBytes(32).toString('hex'),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(RUNTIME_SECRETS_PATH, JSON.stringify(generated), {
      encoding: 'utf8',
      mode: 0o600,
    });
    cachedRuntimeSecrets = {
      sessionSecret: generated.sessionSecret,
      dbHmacSecret: generated.dbHmacSecret,
    };
    return cachedRuntimeSecrets;
  } catch {
    cachedRuntimeSecrets = {
      sessionSecret: PROCESS_FALLBACK_SESSION_SECRET,
      dbHmacSecret: PROCESS_FALLBACK_HMAC_SECRET,
    };
    return cachedRuntimeSecrets;
  }
}

export function getSessionSigningSecret(): string {
  const envSecret = String(
    process.env.TAMWEEN_SESSION_SECRET || process.env.APP_SECURITY_SALT || ''
  ).trim();
  const strictRequired = process.env.TAMWEEN_STRICT_ENV_SECRETS === 'true';

  if (envSecret && envSecret.length >= MIN_PRODUCTION_SECRET_LENGTH) {
    return envSecret;
  }

  if (strictRequired) {
    throw new Error(
      `FATAL SECURITY ERROR: TAMWEEN_SESSION_SECRET (min ${MIN_PRODUCTION_SECRET_LENGTH} chars) must be set when TAMWEEN_STRICT_ENV_SECRETS=true.`
    );
  }

  if (!missingSecretWarned) {
    missingSecretWarned = true;
    console.warn(
      '[SECURITY NOTICE] TAMWEEN_SESSION_SECRET / TAMWEEN_DB_HMAC_SECRET not set (or <32 chars); using CSPRNG runtime keys. Configure both in environment variables for multi-instance session persistence.'
    );
  }
  return envSecret || loadOrCreateRuntimeSecrets().sessionSecret;
}

export function getDbIntegritySecret(): string {
  const envSecret = String(process.env.TAMWEEN_DB_HMAC_SECRET || '').trim();
  const strictRequired = process.env.TAMWEEN_STRICT_ENV_SECRETS === 'true';

  if (envSecret && envSecret.length >= MIN_PRODUCTION_SECRET_LENGTH) {
    return envSecret;
  }
  if (strictRequired) {
    throw new Error(
      `FATAL SECURITY ERROR: TAMWEEN_DB_HMAC_SECRET must be set (>= ${MIN_PRODUCTION_SECRET_LENGTH} chars) when TAMWEEN_STRICT_ENV_SECRETS=true.`
    );
  }
  return envSecret || loadOrCreateRuntimeSecrets().dbHmacSecret;
}

export function isScryptHash(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(SCRYPT_PREFIX) && value.split('$').length === 3;
}

export function normalizeDigits(input: string): string {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(input || '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
}

export function validatePasswordComplexity(password: string): { valid: boolean; error?: string } {
  const clean = normalizeDigits(password);
  if (clean.length < 8) {
    return { valid: false, error: 'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.' };
  }
  const hasLetter = /[a-zA-Z\u0600-\u06FF]/.test(clean);
  const hasDigit = /\d/.test(clean);
  if (!hasLetter || !hasDigit) {
    return { valid: false, error: 'كلمة المرور يجب أن تحتوي على أحرف وأرقام على الأقل.' };
  }
  return { valid: true };
}

export function hashPasswordScrypt(password: string, customSaltHex?: string): string {
  const clean = normalizeDigits(password);
  if (!clean) return '';
  const salt = customSaltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

export function verifyPasswordScrypt(password: string, storedHash: string | undefined | null): boolean {
  const input = normalizeDigits(password);
  const stored = String(storedHash || '').trim();
  if (!input || !stored) return false;

  if (isScryptHash(stored)) {
    const parts = stored.split('$');
    const salt = parts[1];
    const expectedHex = parts[2];
    if (!salt || !expectedHex) return false;
    try {
      const actualBuf = crypto.scryptSync(input, salt, 64);
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      if (actualBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(actualBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  // Constant-time comparison using SHA-256 digest of equal lengths for legacy un-migrated values
  const normalizedStored = normalizeDigits(stored);
  const inputDigest = crypto.createHash('sha256').update(input, 'utf8').digest();
  const storedDigest = crypto.createHash('sha256').update(normalizedStored, 'utf8').digest();
  return crypto.timingSafeEqual(inputDigest, storedDigest);
}

export interface SessionTokenPayload {
  v: string;
  jti: string;
  userId: string;
  branchId: string;
  username: string;
  role: string;
  isSuperAdmin: boolean;
  iat: number;
  exp: number;
}

// In-memory JTI & per-user token revocation store with periodic TTL cleanup
const revokedJtiMap = new Map<string, number>();
const userRevokedBeforeMap = new Map<string, number>();

function pruneRevocationStore(): void {
  const now = Date.now();
  for (const [jti, exp] of revokedJtiMap.entries()) {
    if (now > exp) {
      revokedJtiMap.delete(jti);
    }
  }
}

export function revokeSessionToken(token: string | undefined | null): boolean {
  const decoded = verifySessionToken(token);
  if (!decoded?.jti) return false;
  pruneRevocationStore();
  revokedJtiMap.set(decoded.jti, decoded.exp || Date.now() + SESSION_TTL_MS);
  return true;
}

export function revokeAllUserTokens(userId: string): void {
  if (!userId) return;
  userRevokedBeforeMap.set(String(userId), Date.now());
}

export function isSessionPayloadRevoked(decoded: SessionTokenPayload): boolean {
  if (decoded.jti && revokedJtiMap.has(decoded.jti)) {
    return true;
  }
  const userRevokedAt = userRevokedBeforeMap.get(String(decoded.userId));
  if (typeof userRevokedAt === 'number' && decoded.iat <= userRevokedAt) {
    return true;
  }
  return false;
}

export function createSessionToken(params: {
  userId: string;
  branchId: string;
  username: string;
  role: string;
  isSuperAdmin: boolean;
  ttlMs?: number;
}): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    v: TOKEN_VERSION,
    jti: crypto.randomUUID(),
    userId: String(params.userId),
    branchId: String(params.branchId || 'branch-mahalla'),
    username: String(params.username),
    role: String(params.role || 'viewer'),
    isSuperAdmin: Boolean(params.isSuperAdmin),
    iat: now,
    exp: now + (params.ttlMs || SESSION_TTL_MS),
  };
  const bodyB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSigningSecret())
    .update(bodyB64)
    .digest('base64url');
  return `${bodyB64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const dotIdx = clean.indexOf('.');
  if (dotIdx <= 0) return null;
  const bodyB64 = clean.slice(0, dotIdx);
  const sig = clean.slice(dotIdx + 1);
  if (!bodyB64 || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSigningSecret())
      .update(bodyB64)
      .digest('base64url');
    const actualBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) return null;

    const decoded = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (!decoded || !decoded.userId || !decoded.username) return null;
    if (typeof decoded.exp === 'number' && Date.now() > decoded.exp) return null;
    if (isSessionPayloadRevoked(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

export function sanitizeUserForClient<T extends Partial<AppUser> & Record<string, any>>(
  user: T
): Omit<T, 'password' | 'passwordHash' | 'gmailPassword'> {
  if (!user || typeof user !== 'object') return user;
  const { password: _p, passwordHash: _ph, gmailPassword: _gp, ...safeRest } = user;
  return {
    ...safeRest,
    hasPassword: Boolean(_p || _ph || (user as any).hasPassword),
  } as any;
}

export function sanitizeUsersForClient<T extends Partial<AppUser> & Record<string, any>>(
  users: T[] | undefined | null
): Omit<T, 'password' | 'passwordHash' | 'gmailPassword'>[] {
  if (!Array.isArray(users)) return [];
  return users.map((u) => sanitizeUserForClient(u));
}

export function sanitizeSystemConfigForClient<T extends Record<string, any> | null | undefined>(cfg: T): T {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const clone: Record<string, any> = { ...cfg };
  // Never leak plaintext vault passcodes or branch vault credentials over network responses
  delete clone.vaultPasscode;
  delete clone.vaultUsername;
  delete clone.branchVaultCredentials;
  if (clone.dailyAlertConfig && typeof clone.dailyAlertConfig === 'object') {
    const {
      vaultPasscode: _vp,
      vaultUsername: _vu,
      branchVaultCredentials: _bvc,
      ...restAlertCfg
    } = clone.dailyAlertConfig;
    clone.dailyAlertConfig = restAlertCfg;
  }
  return clone as T;
}

