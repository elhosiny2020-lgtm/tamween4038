import crypto from 'node:crypto';
import type { AppUser } from '../types';

const SCRYPT_PREFIX = 'scrypt$';
const TOKEN_VERSION = 'v1';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Ephemeral fallback secret per process run if env secret is absent, derived deterministically with project salt when env var provided
const PROCESS_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSigningSecret(): string {
  return (
    process.env.TAMWEEN_SESSION_SECRET ||
    process.env.APP_SECURITY_SALT ||
    process.env.API_SECURITY_SHIELD_TOKEN ||
    PROCESS_FALLBACK_SECRET
  );
}

export function isScryptHash(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(SCRYPT_PREFIX) && value.split('$').length === 3;
}

function normalizeDigits(input: string): string {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(input || '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
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

  // Legacy un-migrated plain/digit-normalized password comparison using timingSafeEqual
  const normalizedStored = normalizeDigits(stored);
  const inputBuf = Buffer.from(input, 'utf8');
  const storedBuf = Buffer.from(normalizedStored, 'utf8');
  if (inputBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(inputBuf, storedBuf);
}

export interface SessionTokenPayload {
  v: string;
  userId: string;
  branchId: string;
  username: string;
  role: string;
  isSuperAdmin: boolean;
  iat: number;
  exp: number;
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
    userId: String(params.userId),
    branchId: String(params.branchId || 'branch-mahalla'),
    username: String(params.username),
    role: String(params.role || 'viewer'),
    isSuperAdmin: Boolean(params.isSuperAdmin),
    iat: now,
    exp: now + (params.ttlMs || TOKEN_TTL_MS),
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
    return decoded;
  } catch {
    return null;
  }
}

export function sanitizeUserForClient<T extends Partial<AppUser> & Record<string, any>>(user: T): Omit<T, 'password' | 'passwordHash' | 'gmailPassword'> {
  if (!user || typeof user !== 'object') return user;
  const { password: _p, passwordHash: _ph, gmailPassword: _gp, ...safeRest } = user;
  return {
    ...safeRest,
    hasPassword: Boolean(_p || _ph),
  } as any;
}

export function sanitizeUsersForClient<T extends Partial<AppUser> & Record<string, any>>(
  users: T[] | undefined | null
): Omit<T, 'password' | 'passwordHash' | 'gmailPassword'>[] {
  if (!Array.isArray(users)) return [];
  return users.map((u) => sanitizeUserForClient(u));
}
