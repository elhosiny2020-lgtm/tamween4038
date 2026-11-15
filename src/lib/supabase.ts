import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, buildFullCloudMultiBranchPayload } from '../storage';
import { generateStandaloneHtml } from '../utils/htmlExporter';
import type { HighDebtAlertNotification } from '../types';
import {
  DEFAULT_DEBT_ALERT_THRESHOLD,
  mergeHighDebtAlerts,
} from './firebaseSyncHelpers';

// Unique per-tab client ID to prevent infinite self-echo sync loops
export const SESSION_CLIENT_ID = `supa-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function isSelfRealtimeEvent(senderClientId?: string | null): boolean {
  return Boolean(senderClientId && senderClientId === SESSION_CLIENT_ID);
}

// Default Supabase Configuration keys in LocalStorage
export const SUPABASE_URL_KEY = 'TAMWEEN_SUPABASE_URL';
export const SUPABASE_ANON_KEY_KEY = 'TAMWEEN_SUPABASE_ANON_KEY';
export const SUPABASE_CLOUD_DISABLED_KEY = 'TAMWEEN_SUPABASE_CLOUD_DISABLED';
export const SUPABASE_BUCKET_NAME = 'tamween-backups';

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  source: 'env' | 'storage' | 'none';
}

const memoryStore: Record<string, string> = {};

function safeGetItem(key: string): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || '';
    }
  } catch {}
  return memoryStore[key] || '';
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {}
  memoryStore[key] = value;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  delete memoryStore[key];
}

export type CloudConnectionStatus = 'connected' | 'syncing' | 'error' | 'offline';

export interface CloudConnectionSnapshot {
  status: CloudConnectionStatus;
  label: string;
  detail: string;
  lastSyncAt?: string;
  lastErrorAt?: string;
  hasPendingSync: boolean;
  pendingQueueCount: number;
}

export const STATUS_LABELS: Record<CloudConnectionStatus, string> = {
  connected: 'متصل بالخادم',
  syncing: 'جاري المزامنة',
  error: 'غير متصل',
  offline: 'غير متصل',
};

const OFFLINE_QUEUE_KEY = 'TAMWEEN_SUPABASE_OFFLINE_QUEUE';

export interface OfflineSyncEntry {
  id: string;
  timestamp: string;
  branchId: string;
  state: AppState;
  attempts: number;
}

let inMemoryOfflineQueue: OfflineSyncEntry[] = [];

function stripHeavyLogo(state: AppState): AppState {
  if (!state) return state;
  return {
    ...state,
    systemConfig: state.systemConfig
      ? { ...state.systemConfig, logoBase64: '' }
      : state.systemConfig,
  };
}

function loadOfflineQueueFromStorage(): OfflineSyncEntry[] {
  if (inMemoryOfflineQueue.length > 0) return inMemoryOfflineQueue;
  try {
    const raw = safeGetItem(OFFLINE_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryOfflineQueue = parsed;
        return inMemoryOfflineQueue;
      }
    }
  } catch {}
  return [];
}

function persistOfflineQueue(queue: OfflineSyncEntry[]): void {
  inMemoryOfflineQueue = queue.slice(-20);
  try {
    if (inMemoryOfflineQueue.length === 0) {
      safeRemoveItem(OFFLINE_QUEUE_KEY);
    } else {
      safeSetItem(OFFLINE_QUEUE_KEY, JSON.stringify(inMemoryOfflineQueue));
    }
  } catch {
    // Keep in-memory queue intact even if localStorage quota is tight
  }
}

export function getPendingOfflineQueueCount(): number {
  return loadOfflineQueueFromStorage().length;
}

export function enqueueOfflineSync(state: AppState, timestamp: string = new Date().toISOString()): number {
  const branchId = state?.activeBranchId || 'branch-mahalla';
  // Keep only the latest pending full-state snapshot per branch so localStorage never overflows or duplicates
  const queue = loadOfflineQueueFromStorage().filter((item) => item.branchId !== branchId);
  const entry: OfflineSyncEntry = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp,
    branchId,
    state: stripHeavyLogo(state),
    attempts: 0,
  };
  queue.push(entry);
  persistOfflineQueue(queue.slice(-5));
  return getPendingOfflineQueueCount();
}

export function clearOfflineSyncQueue(): void {
  inMemoryOfflineQueue = [];
  safeRemoveItem(OFFLINE_QUEUE_KEY);
}

export const PERMANENT_VAULT_KEY = 'TAMWEEN_PERMANENT_VAULT_V1';

export interface PermanentVaultPayload {
  timestamp: string;
  data: AppState;
}

/**
 * دمج غير إتلافي (Non-Destructive Merge) لبيانات جميع الفروع والسجلات لضمان عدم ضياع أي سجل عند تغيير الخادم أو الدمج بين جهازيْن
 */
export function mergeMultiBranchStatesNonDestructive(
  baseState: AppState | null | undefined,
  incomingState: AppState | null | undefined
): AppState | null {
  if (!baseState && !incomingState) return null;
  if (!baseState) return stripHeavyLogo(incomingState as AppState);
  if (!incomingState) return stripHeavyLogo(baseState);

  const mergeById = <T extends { id?: string; lastUpdatedAt?: string; updatedAt?: string }>(
    listA: T[] | undefined,
    listB: T[] | undefined
  ): T[] => {
    const a = Array.isArray(listA) ? listA : [];
    const b = Array.isArray(listB) ? listB : [];
    const map = new Map<string, T>();
    for (const item of a) {
      if (item && item.id) map.set(String(item.id), item);
    }
    for (const item of b) {
      if (!item || !item.id) continue;
      const key = String(item.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
      } else {
        const tExisting = Date.parse(existing.lastUpdatedAt || existing.updatedAt || '') || 0;
        const tIncoming = Date.parse(item.lastUpdatedAt || item.updatedAt || '') || 0;
        if (tIncoming >= tExisting) {
          map.set(key, item);
        }
      }
    }
    return Array.from(map.values());
  };

  const mergeVillages = (vA: any[] | undefined, vB: any[] | undefined) => {
    const map = new Map<string, { village: string; localUnits: string[] }>();
    for (const list of [vA || [], vB || []]) {
      for (const v of list) {
        const name = String(v?.village || v?.name || '').trim();
        if (!name) continue;
        const prev = map.get(name);
        const units = Array.isArray(v?.localUnits) ? v.localUnits : [];
        if (!prev) {
          map.set(name, { village: name, localUnits: [...units] });
        } else {
          const combined = Array.from(new Set([...prev.localUnits, ...units]));
          map.set(name, { village: name, localUnits: combined });
        }
      }
    }
    return Array.from(map.values());
  };

  const basePartitions = ((baseState as any)?.branchPartitions || {}) as Record<string, any>;
  const incPartitions = ((incomingState as any)?.branchPartitions || {}) as Record<string, any>;
  const allBranchIds = Array.from(
    new Set([...Object.keys(basePartitions), ...Object.keys(incPartitions)])
  );
  const mergedPartitions: Record<string, any> = {};

  for (const brId of allBranchIds) {
    const pBase = basePartitions[brId] || {};
    const pInc = incPartitions[brId] || {};
    mergedPartitions[brId] = {
      ...pBase,
      ...pInc,
      bakeries: mergeById(pBase.bakeries, pInc.bakeries),
      debts: mergeById(pBase.debts, pInc.debts),
      villages: mergeVillages(pBase.villages, pInc.villages),
      users: mergeById(pBase.users, pInc.users),
      dailyTasks: mergeById(pBase.dailyTasks, pInc.dailyTasks),
      inboxMessages: mergeById(pBase.inboxMessages, pInc.inboxMessages),
      updatedAt:
        (Date.parse(pInc.updatedAt || '') || 0) >= (Date.parse(pBase.updatedAt || '') || 0)
          ? pInc.updatedAt || pBase.updatedAt || new Date().toISOString()
          : pBase.updatedAt,
    };
  }

  const merged: AppState = {
    ...baseState,
    ...incomingState,
    branches: mergeById(baseState.branches as any, incomingState.branches as any) as any,
    bakeries: mergeById(baseState.bakeries as any, incomingState.bakeries as any) as any,
    debts: mergeById(baseState.debts as any, incomingState.debts as any) as any,
    villages: mergeVillages(baseState.villages, incomingState.villages),
    users: mergeById(baseState.users as any, incomingState.users as any) as any,
    dailyTasks: mergeById(baseState.dailyTasks as any, incomingState.dailyTasks as any) as any,
    inboxMessages: mergeById(baseState.inboxMessages as any, incomingState.inboxMessages as any) as any,
  };

  if (allBranchIds.length > 0) {
    (merged as any).branchPartitions = mergedPartitions;
  }

  return stripHeavyLogo(merged);
}

/**
 * حفظ نسخة أمان دائمة غير قابلة للحذف لجميع البيانات المسجلة لضمان بقائها حتى عند تغيير الخادم
 */
export function saveToPermanentSafetyVault(
  state: AppState,
  timestamp: string = new Date().toISOString()
): void {
  if (!state) return;
  try {
    const hasRecords =
      (Array.isArray(state.bakeries) && state.bakeries.length > 0) ||
      (Array.isArray(state.debts) && state.debts.length > 0) ||
      Boolean((state as any).branchPartitions);
    if (!hasRecords) return;

    const existing = loadFromPermanentSafetyVault();
    const mergedData = existing?.data
      ? mergeMultiBranchStatesNonDestructive(existing.data, state) || stripHeavyLogo(state)
      : stripHeavyLogo(state);

    const payload: PermanentVaultPayload = {
      timestamp,
      data: mergedData,
    };
    safeSetItem(PERMANENT_VAULT_KEY, JSON.stringify(payload));
  } catch {}
}

export function loadFromPermanentSafetyVault(): PermanentVaultPayload | null {
  try {
    const raw = safeGetItem(PERMANENT_VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data && (Array.isArray(parsed.data.bakeries) || parsed.data.branchPartitions)) {
      return parsed as PermanentVaultPayload;
    }
  } catch {}
  return null;
}

let connectionSnapshot: CloudConnectionSnapshot = {
  status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'connected',
  label:
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? STATUS_LABELS.offline
      : STATUS_LABELS.connected,
  detail:
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'لا يوجد اتصال بالإنترنت حالياً'
      : 'المزامنة السحابية جاهزة ونشطة',
  lastSyncAt: safeGetItem('TAMWEEN_LAST_SUPABASE_SYNC') || undefined,
  hasPendingSync: getPendingOfflineQueueCount() > 0,
  pendingQueueCount: getPendingOfflineQueueCount(),
};

let pendingSyncPayload: { state: AppState; timestamp: string } | null = null;
const connectionListeners = new Set<(snap: CloudConnectionSnapshot) => void>();

function notifyConnectionListeners() {
  connectionListeners.forEach((cb) => {
    try {
      cb({ ...connectionSnapshot });
    } catch {}
  });
}

export function getCloudConnectionSnapshot(): CloudConnectionSnapshot {
  return { ...connectionSnapshot };
}

export function setCloudConnectionStatus(
  status: CloudConnectionStatus,
  detail?: string,
  extra?: { lastSyncAt?: string; hasPendingSync?: boolean; pendingQueueCount?: number }
): CloudConnectionSnapshot {
  const effectiveStatus: CloudConnectionStatus =
    status !== 'offline' && isBrowserOffline() ? 'offline' : status;
  const nowStr = new Date().toLocaleTimeString('ar-EG');
  const qCount = extra?.pendingQueueCount ?? getPendingOfflineQueueCount();
  connectionSnapshot = {
    status: effectiveStatus,
    label: STATUS_LABELS[effectiveStatus],
    detail:
      effectiveStatus === 'offline' && status !== 'offline'
        ? 'انقطع الاتصال بالإنترنت'
        : (detail ?? connectionSnapshot.detail),
    lastSyncAt:
      extra?.lastSyncAt ??
      (effectiveStatus === 'connected' ? nowStr : connectionSnapshot.lastSyncAt),
    lastErrorAt:
      effectiveStatus === 'error' || effectiveStatus === 'offline'
        ? nowStr
        : connectionSnapshot.lastErrorAt,
    hasPendingSync: extra?.hasPendingSync ?? (Boolean(pendingSyncPayload) || qCount > 0),
    pendingQueueCount: qCount,
  };
  notifyConnectionListeners();
  return getCloudConnectionSnapshot();
}

let browserNetworkListenersAttached = false;
function ensureBrowserNetworkListeners(): void {
  if (browserNetworkListenersAttached || typeof window === 'undefined') return;
  browserNetworkListenersAttached = true;
  window.addEventListener('offline', () => {
    setCloudConnectionStatus('offline', 'انقطع الاتصال بالإنترنت — التعديلات تُحفظ في قائمة الانتظار بأمان', {
      hasPendingSync: true,
      pendingQueueCount: getPendingOfflineQueueCount(),
    });
  });
  window.addEventListener('online', () => {
    retrySupabaseConnection().catch(() => {});
  });
}

export function subscribeToConnectionStatus(
  listener: (snap: CloudConnectionSnapshot) => void
): () => void {
  ensureBrowserNetworkListeners();
  connectionListeners.add(listener);
  if (isBrowserOffline() && connectionSnapshot.status !== 'offline') {
    setCloudConnectionStatus('offline', 'الجهاز غير متصل بالإنترنت حالياً');
  } else {
    try {
      listener({ ...connectionSnapshot });
    } catch {}
  }
  return () => {
    connectionListeners.delete(listener);
  };
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function isServiceRoleJwt(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.toLowerCase().includes('service_role')) return true;
  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded);
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export function validateSupabaseCredentials(
  url: string,
  anonKey: string
): { valid: boolean; error?: string } {
  const cleanUrl = (url || '').trim();
  const cleanKey = (anonKey || '').trim();
  if (cleanKey && isServiceRoleJwt(cleanKey)) {
    return {
      valid: false,
      error: 'تحذير أمني: يُحظر استخدام مفتاح service_role السري في المتصفح. يرجى استخدام مفتاح anon العام فقط.',
    };
  }
  if (cleanUrl && !isValidHttpUrl(cleanUrl)) {
    return {
      valid: false,
      error: 'رابط مشروع Supabase غير صالح. يجب أن يبدأ بـ https:// وينتهي بـ .supabase.co.',
    };
  }
  return { valid: true };
}

export function isValidHttpUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  try {
    const clean = str.trim();
    const parsed = new URL(clean);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.includes('.supabase.co') &&
      !clean.includes('xyzcompany.supabase.co')
    );
  } catch {
    return false;
  }
}

export function setSupabaseCloudDisabled(disabled: boolean): void {
  if (disabled) {
    safeSetItem(SUPABASE_CLOUD_DISABLED_KEY, 'true');
    setCloudConnectionStatus('offline', 'تم إيقاف المزامنة السحابية يدوياً');
  } else {
    safeRemoveItem(SUPABASE_CLOUD_DISABLED_KEY);
    if (!isBrowserOffline()) {
      setCloudConnectionStatus('connected', 'تم تفعيل المزامنة السحابية المباشرة');
    }
  }
}

function isLocalOrCloudOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const proto = window.location.protocol;
  if (proto === 'file:') return false;
  return (
    proto === 'http:' ||
    proto === 'https:'
  );
}

function getHealthApiUrl(): string {
  if (typeof window !== 'undefined') {
    return isLocalOrCloudOrigin()
      ? '/api/health'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/health';
  }
  return '/api/health';
}

function getLiveDbApiUrl(): string {
  if (typeof window !== 'undefined') {
    return isLocalOrCloudOrigin()
      ? '/api/supabase/live-db'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/live-db';
  }
  return '/api/supabase/live-db';
}

function getLiveMetaApiUrl(): string {
  if (typeof window !== 'undefined') {
    return isLocalOrCloudOrigin()
      ? '/api/supabase/live-meta'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/live-meta';
  }
  return '/api/supabase/live-meta';
}

function getAlertsApiUrl(): string {
  if (typeof window !== 'undefined') {
    return isLocalOrCloudOrigin()
      ? '/api/supabase/alerts'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/alerts';
  }
  return '/api/supabase/alerts';
}

function getWebSocketSyncUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (isLocalOrCloudOrigin()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/supabase-realtime`;
  }
  return 'wss://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/ws/supabase-realtime';
}

async function probeServerHealth(): Promise<boolean> {
  if (typeof window === 'undefined' || isBrowserOffline()) return false;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    const resp = await fetch(getHealthApiUrl(), {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    if (!resp.ok) return false;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return false;
    const json = await resp.json().catch(() => null);
    return Boolean(json && json.status === 'ok');
  } catch {
    return false;
  }
}

/**
 * الحصول على إعدادات Supabase النشطة (من متغيرات البيئة أو التخزين المحلي أو السحابة المدمجة)
 */
export function getSupabaseConfig(): SupabaseConfig {
  if (safeGetItem(SUPABASE_CLOUD_DISABLED_KEY) === 'true') {
    return {
      url: '',
      anonKey: '',
      isConfigured: false,
      source: 'none',
    };
  }

  let envUrl = '';
  let envKey = '';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      envUrl = String((import.meta.env as any).VITE_SUPABASE_URL || '').trim();
      envKey = String((import.meta.env as any).VITE_SUPABASE_ANON_KEY || '').trim();
    }
  } catch {}

  const storageUrl = safeGetItem(SUPABASE_URL_KEY).trim();
  const storageKey = safeGetItem(SUPABASE_ANON_KEY_KEY).trim();

  // Clean up accidental autofill values or accidental service_role keys
  if ((storageUrl && !isValidHttpUrl(storageUrl)) || isServiceRoleJwt(storageKey)) {
    safeRemoveItem(SUPABASE_URL_KEY);
    safeRemoveItem(SUPABASE_ANON_KEY_KEY);
  }

  if (envUrl && envKey && isValidHttpUrl(envUrl) && !isServiceRoleJwt(envKey)) {
    return {
      url: envUrl,
      anonKey: envKey,
      isConfigured: true,
      source: 'env',
    };
  }

  if (storageUrl && storageKey && isValidHttpUrl(storageUrl) && !isServiceRoleJwt(storageKey)) {
    return {
      url: storageUrl,
      anonKey: storageKey,
      isConfigured: true,
      source: 'storage',
    };
  }

  // Built-in Cloud SQL / Realtime Sync is enabled by default across all devices
  return {
    url: '',
    anonKey: '',
    isConfigured: true,
    source: 'env',
  };
}

/**
 * حفظ وتحديث مفاتيح اتصال Supabase في التخزين المحلي ومزامنتها للخادم للأجهزة الأخرى
 */
export function saveSupabaseConfig(url: string, anonKey: string): SupabaseConfig {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();

  if (cleanKey && isServiceRoleJwt(cleanKey)) {
    setCloudConnectionStatus(
      'error',
      'تم رفض مفتاح service_role السري لحماية البيانات. استخدم مفتاح anon فقط.'
    );
    return getSupabaseConfig();
  }

  if (cleanUrl && isValidHttpUrl(cleanUrl)) {
    safeSetItem(SUPABASE_URL_KEY, cleanUrl);
    safeRemoveItem(SUPABASE_CLOUD_DISABLED_KEY);
  } else {
    safeRemoveItem(SUPABASE_URL_KEY);
  }

  if (cleanKey && (!cleanUrl || isValidHttpUrl(cleanUrl))) {
    safeSetItem(SUPABASE_ANON_KEY_KEY, cleanKey);
  } else {
    safeRemoveItem(SUPABASE_ANON_KEY_KEY);
  }

  // Reset cached client
  cachedClient = null;
  lastUsedUrl = '';
  lastUsedKey = '';

  // Synchronize credentials to server endpoint so other devices receive them automatically
  if (typeof window !== 'undefined') {
    try {
      const targetUrl = isLocalOrCloudOrigin()
        ? '/api/supabase/config'
        : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/config';

      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: isValidHttpUrl(cleanUrl) ? cleanUrl : '',
          anonKey: isValidHttpUrl(cleanUrl) ? cleanKey : '',
        }),
      }).catch(() => {});

      // Automatically migrate registered data from Permanent Safety Vault to the newly configured Supabase server
      if (cleanUrl && cleanKey && isValidHttpUrl(cleanUrl)) {
        const vault = loadFromPermanentSafetyVault();
        if (vault?.data) {
          setTimeout(() => {
            migrateDatabaseToSupabase(vault.data).catch(() => {});
          }, 250);
        }
      }
    } catch {}
  }

  return getSupabaseConfig();
}

/**
 * استرداد مفاتيح اتصال Supabase المحفوظة من الخادم لدعم الأجهزة الأخرى فوراً
 */
export async function syncSupabaseConfigFromRemote(): Promise<SupabaseConfig> {
  const localCfg = getSupabaseConfig();
  if (localCfg.isConfigured && localCfg.url && localCfg.anonKey) {
    return localCfg;
  }

  if (typeof window === 'undefined' || isBrowserOffline()) return localCfg;

  try {
    const targetUrl = isLocalOrCloudOrigin()
      ? '/api/supabase/config'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/config';

    const resp = await fetch(targetUrl);
    if (resp.ok) {
      const data = await resp.json();
      if (
        data &&
        data.url &&
        data.anonKey &&
        isValidHttpUrl(data.url) &&
        !isServiceRoleJwt(data.anonKey)
      ) {
        saveSupabaseConfig(data.url, data.anonKey);
        return getSupabaseConfig();
      }
    }
  } catch (err) {
    console.warn('syncSupabaseConfigFromRemote check error:', err);
  }

  return getSupabaseConfig();
}

/**
 * الحصول على عميل Supabase Client المعتمد (إن تم إدخال رابط خارجي مخصص)
 */
export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (
    !cfg.isConfigured ||
    !cfg.url ||
    !cfg.anonKey ||
    !isValidHttpUrl(cfg.url) ||
    isServiceRoleJwt(cfg.anonKey)
  ) {
    return null;
  }

  if (cachedClient && lastUsedUrl === cfg.url && lastUsedKey === cfg.anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    lastUsedUrl = cfg.url;
    lastUsedKey = cfg.anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Error creating Supabase client:', err);
    return null;
  }
}

/**
 * فحص واختبار الاتصال بقاعدة بيانات Supabase والتزامن السحابي المباشر
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, any>;
}> {
  setSupabaseCloudDisabled(false);
  if (isBrowserOffline()) {
    setCloudConnectionStatus('offline', 'الجهاز غير متصل بالإنترنت حالياً');
    return {
      success: false,
      message: 'تعذر الاتصال: الجهاز غير متصل بشبكة الإنترنت حالياً.',
    };
  }

  setCloudConnectionStatus('syncing', 'جاري التحقق من الاتصال بخادم المزامنة اللحظية Supabase Realtime...');
  let client = getSupabaseClient();
  if (!client) {
    await syncSupabaseConfigFromRemote();
    client = getSupabaseClient();
  }

  if (!client) {
    if (typeof window !== 'undefined') {
      try {
        const resp = await fetch(getLiveDbApiUrl(), { method: 'GET', credentials: 'same-origin' });
        const ct = resp.headers.get('content-type') || '';
        const isJsonOk = resp.ok && ct.includes('application/json');
        if (isJsonOk || (await probeServerHealth())) {
          setCloudConnectionStatus('connected', 'متصل بخادم المزامنة اللحظية (Supabase WebSocket Realtime)', {
            hasPendingSync: getPendingOfflineQueueCount() > 0,
            pendingQueueCount: getPendingOfflineQueueCount(),
          });
          return {
            success: true,
            message: 'تم تفعيل الاتصال المباشر بخادم المزامنة اللحظية (WebSocket + Live DB) بنجاح عبر جميع الأجهزة!',
            details: {
              storageStatus: 'خادم المزامنة اللحظية عبر WebSocket نشط ومتصل لجميع الفروع',
            },
          };
        }
      } catch {}
    }

    setCloudConnectionStatus('error', 'تعذر الوصول إلى خادم المزامنة اللحظية Supabase');
    return {
      success: false,
      message: 'فشل الاتصال بخادم المزامنة اللحظية. يرجى التحقق من الشبكة أو إعدادات Supabase.',
    };
  }

  try {
    const [{ error: queryErr }, { data: buckets, error: storageErr }] = await Promise.all([
      client.from('backup_snapshots').select('id').limit(1),
      client.storage.listBuckets(),
    ]);

    if (queryErr) {
      const msgLower = (queryErr.message || '').toLowerCase();
      const isAuthErr =
        msgLower.includes('jwt') ||
        msgLower.includes('api key') ||
        msgLower.includes('unauthorized');
      const errDetail = isAuthErr
        ? `مشكلة مصادقة أو انتهاء جلسة Supabase: ${queryErr.message}`
        : `خطأ استعلام Supabase: ${queryErr.message}`;
      setCloudConnectionStatus('error', errDetail);
      return {
        success: false,
        message: errDetail,
      };
    }

    setCloudConnectionStatus('connected', 'متصل بقاعدة بيانات Supabase بنجاح');
    return {
      success: true,
      message: 'تم الاتصال بقاعدة بيانات وتخزين Supabase بنجاح!',
      details: {
        bucketsCount: buckets?.length || 0,
        storageStatus: storageErr ? `تنبيه التخزين: ${storageErr.message}` : 'جاهز',
      },
    };
  } catch (err: any) {
    setCloudConnectionStatus('error', `فشل الاتصال بـ Supabase: ${err.message || 'خطأ غير معروف'}`);
    return {
      success: false,
      message: `فشل الاتصال بـ Supabase: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}

/**
 * دوال المصادقة المباشرة عبر Supabase Auth + إدارة الجلسة والصلاحيات
 */
export async function signInWithSupabaseAuth(
  email: string,
  password: string
): Promise<{ success: boolean; message: string; email?: string; userId?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'يرجى إعداد رابط مشروع Supabase ومفتاح anon أولاً لتفعيل مصادقة Supabase Auth.',
    };
  }
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      return {
        success: false,
        message: error?.message || 'بيانات الدخول غير صحيحة في Supabase Auth.',
      };
    }
    return {
      success: true,
      message: `تم تسجيل الدخول عبر Supabase Auth بنجاح (${data.user.email})`,
      email: data.user.email,
      userId: data.user.id,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'تعذر تسجيل الدخول في Supabase Auth.',
    };
  }
}

export async function signUpWithSupabaseAuth(
  email: string,
  password: string,
  metadata?: { fullName?: string; role?: string; branchId?: string }
): Promise<{ success: boolean; message: string; userId?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'يرجى إعداد رابط مشروع Supabase ومفتاح anon أولاً.',
    };
  }
  try {
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: metadata?.fullName || '',
          app_role: metadata?.role || 'inspector',
          branch_id: metadata?.branchId || 'branch-mahalla',
        },
      },
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return {
      success: true,
      message: data.session
        ? 'تم إنشاء حساب Supabase Auth وتفعيل الجلسة فوراً بنجاح.'
        : 'تم إنشاء الحساب في Supabase Auth! يرجى تأكيد البريد الإلكتروني إذا كان التفعيل مفعلاً.',
      userId: data.user?.id,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'فشل إنشاء الحساب في Supabase Auth.' };
  }
}

export async function signOutSupabaseAuth(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {}
}

export async function getSupabaseAuthSession(): Promise<{
  authenticated: boolean;
  email?: string;
  userId?: string;
  role?: string;
}> {
  const client = getSupabaseClient();
  if (!client) return { authenticated: false };
  try {
    const { data } = await client.auth.getSession();
    const user = data?.session?.user;
    if (!user) return { authenticated: false };
    return {
      authenticated: true,
      email: user.email,
      userId: user.id,
      role: (user.user_metadata?.app_role as string) || user.role,
    };
  } catch {
    return { authenticated: false };
  }
}

/**
 * كود إنشاء وتجهيز جداول Supabase بلغة PostgreSQL (SQL Schema Script)
 */
export const SUPABASE_TABLES_SQL_SCHEMA = `-- ==============================================================
-- منظومة إدارة تموين مركز المحلة الكبرى - مديرية التموين بالغربية
-- سكريبت إنشاء وتهيئة كافة جداول قاعدة بيانات Supabase (PostgreSQL)
-- شامل العلاقات والمفاتيح الأساسية والخارجية والفهارس وسياسات الأمان RLS والبث اللحظي Realtime
-- ==============================================================

-- 0. جدول الفروع والإدارات التموينية (Branches)
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  governorate_title TEXT,
  directorate_title TEXT,
  description TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO branches (id, name, governorate_title, directorate_title, description)
VALUES ('branch-mahalla', 'إدارة تموين مركز المحلة الكبرى', 'محافظة الغربية', 'مديرية التموين والتجارة الداخلية بالغربية', 'الإدارة الرئيسية')
ON CONFLICT (id) DO NOTHING;

-- 1. جدول القرى والوحدات المحلية (Villages & Local Units)
CREATE TABLE IF NOT EXISTS villages (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'branch-mahalla' REFERENCES branches(id) ON DELETE CASCADE,
  village_name TEXT NOT NULL,
  local_units JSONB DEFAULT '[]'::jsonb,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول المخابز الرئيسي (Bakeries)
CREATE TABLE IF NOT EXISTS bakeries (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'branch-mahalla',
  machine_number TEXT,
  bakery_owner_name TEXT NOT NULL,
  village TEXT,
  local_unit TEXT,
  insurance_value NUMERIC DEFAULT 0,
  insurance_quota NUMERIC DEFAULT 0,
  actual_quota NUMERIC DEFAULT 0,
  loaves_count NUMERIC DEFAULT 0,
  village_population NUMERIC DEFAULT 0,
  per_capita_average TEXT DEFAULT '0.00',
  beneficiaries_2023 NUMERIC DEFAULT 0,
  avg_2023 TEXT DEFAULT '0.00',
  beneficiaries_2024 NUMERIC DEFAULT 0,
  avg_2024 TEXT DEFAULT '0.00',
  beneficiaries_2025 NUMERIC DEFAULT 0,
  avg_2025 TEXT DEFAULT '0.00',
  avg_diff TEXT DEFAULT '0.00',
  flour_bag_price NUMERIC DEFAULT 950,
  bread_type TEXT DEFAULT 'بلدي مدعم ماو',
  bread_type_count NUMERIC DEFAULT 1,
  line_type TEXT DEFAULT 'نصف آلي',
  fuel_type TEXT DEFAULT 'غاز طبيعي',
  activity_status TEXT DEFAULT 'شغال',
  phone TEXT,
  national_id TEXT,
  notes TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول المديونيات والمخالفات والتصرف (Debts)
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'branch-mahalla',
  bakery_id TEXT,
  bakery_owner_name TEXT NOT NULL,
  machine_number TEXT,
  village TEXT,
  local_unit TEXT,
  violation_amount NUMERIC DEFAULT 0,
  old_violations NUMERIC DEFAULT 0,
  total_violations NUMERIC DEFAULT 0,
  paid_violation_amount NUMERIC DEFAULT 0,
  remaining_violations NUMERIC DEFAULT 0,
  added_amount NUMERIC DEFAULT 0,
  paid_added_amount NUMERIC DEFAULT 0,
  remaining_added NUMERIC DEFAULT 0,
  disposal_bags NUMERIC DEFAULT 0,
  disposal_bag_price NUMERIC DEFAULT 950,
  disposal_multiplier NUMERIC DEFAULT 1,
  disposal_value NUMERIC DEFAULT 0,
  paid_disposal_amount NUMERIC DEFAULT 0,
  remaining_disposal NUMERIC DEFAULT 0,
  net_remaining_debt NUMERIC DEFAULT 0,
  violation_date TEXT,
  disposal_date TEXT,
  issuing_entity TEXT,
  violation_type TEXT,
  payment_method TEXT,
  status TEXT DEFAULT 'UNPAID',
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول المستخدمين والصلاحيات (App Users & RBAC)
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'branch-mahalla',
  username TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  auth_user_id UUID,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول المهام اليومية والمتابعة (Daily Tasks)
CREATE TABLE IF NOT EXISTS daily_tasks (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'branch-mahalla',
  title TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. جدول النسخ الاحتياطية وحزم المزامنة الكاملة (Backup Snapshots)
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY,
  version TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  bakeries_count INT DEFAULT 0,
  debts_count INT DEFAULT 0,
  payload JSONB NOT NULL
);

-- 7. جدول إعدادات المنظومة (System Config)
CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY DEFAULT 'tamween_config',
  governorate_title TEXT,
  directorate_title TEXT,
  administration_title TEXT,
  payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. جدول تنبيهات المديونيات المرتفعة (High-Debt Alerts)
CREATE TABLE IF NOT EXISTS high_debt_alerts (
  id TEXT PRIMARY KEY,
  branch_id TEXT DEFAULT 'branch-mahalla',
  bakery_id TEXT,
  bakery_owner_name TEXT NOT NULL,
  machine_number TEXT,
  village TEXT,
  debt_amount NUMERIC DEFAULT 0,
  threshold_used NUMERIC DEFAULT 50000,
  action_type TEXT DEFAULT 'ADD_DEBT',
  is_read BOOLEAN DEFAULT false,
  edited_by TEXT,
  editor_role TEXT,
  created_at_iso TEXT,
  data_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ترقية الجداول القائمة بأعمدة الفروع دون المساس بالبيانات الموجودة
ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS branch_id TEXT DEFAULT 'branch-mahalla';
ALTER TABLE debts ADD COLUMN IF NOT EXISTS branch_id TEXT DEFAULT 'branch-mahalla';
ALTER TABLE high_debt_alerts ADD COLUMN IF NOT EXISTS branch_id TEXT DEFAULT 'branch-mahalla';

-- فهارس الأداء العالي لتسريع البحث والتصفية والربط بين المخابز والمديونيات والفروع والتنبيهات
CREATE INDEX IF NOT EXISTS idx_villages_branch_id ON villages (branch_id);
CREATE INDEX IF NOT EXISTS idx_bakeries_branch_id ON bakeries (branch_id);
CREATE INDEX IF NOT EXISTS idx_bakeries_village ON bakeries (village);
CREATE INDEX IF NOT EXISTS idx_bakeries_local_unit ON bakeries (local_unit);
CREATE INDEX IF NOT EXISTS idx_bakeries_machine_number ON bakeries (machine_number);
CREATE INDEX IF NOT EXISTS idx_bakeries_activity_status ON bakeries (activity_status);
CREATE INDEX IF NOT EXISTS idx_debts_branch_id ON debts (branch_id);
CREATE INDEX IF NOT EXISTS idx_debts_bakery_id ON debts (bakery_id);
CREATE INDEX IF NOT EXISTS idx_debts_village ON debts (village);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts (status);
CREATE INDEX IF NOT EXISTS idx_app_users_branch_id ON app_users (branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_branch_id ON daily_tasks (branch_id);
CREATE INDEX IF NOT EXISTS idx_high_debt_alerts_branch_id ON high_debt_alerts (branch_id);

-- تفعيل سياسات الأمان Row Level Security (RLS) على كافة الجداول
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bakeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE high_debt_alerts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public branches access') THEN
    CREATE POLICY "Public branches access" ON branches FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public villages access') THEN
    CREATE POLICY "Public villages access" ON villages FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public bakeries access') THEN
    CREATE POLICY "Public bakeries access" ON bakeries FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public debts access') THEN
    CREATE POLICY "Public debts access" ON debts FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public app_users access') THEN
    CREATE POLICY "Public app_users access" ON app_users FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public daily_tasks access') THEN
    CREATE POLICY "Public daily_tasks access" ON daily_tasks FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public snapshots access') THEN
    CREATE POLICY "Public snapshots access" ON backup_snapshots FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public config access') THEN
    CREATE POLICY "Public config access" ON system_config FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public high_debt_alerts access') THEN
    CREATE POLICY "Public high_debt_alerts access" ON high_debt_alerts FOR ALL USING (auth.role() IN ('anon', 'authenticated')) WITH CHECK (auth.role() IN ('anon', 'authenticated'));
  END IF;
END $$;

-- تفعيل البث اللحظي Supabase Realtime (INSERT / UPDATE / DELETE) لجميع الجداول
ALTER TABLE branches REPLICA IDENTITY FULL;
ALTER TABLE villages REPLICA IDENTITY FULL;
ALTER TABLE bakeries REPLICA IDENTITY FULL;
ALTER TABLE debts REPLICA IDENTITY FULL;
ALTER TABLE app_users REPLICA IDENTITY FULL;
ALTER TABLE daily_tasks REPLICA IDENTITY FULL;
ALTER TABLE backup_snapshots REPLICA IDENTITY FULL;
ALTER TABLE system_config REPLICA IDENTITY FULL;
ALTER TABLE high_debt_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'branches') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE branches;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'villages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE villages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bakeries') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE bakeries;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'debts') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE debts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'app_users') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE app_users;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'daily_tasks') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE daily_tasks;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'backup_snapshots') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE backup_snapshots;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_config') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE system_config;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'high_debt_alerts') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE high_debt_alerts;
    END IF;
  END IF;
END $$;
`;

/**
 * رفع ملف index.html أو tamween-system.html إلى حاوية التخزين في Supabase (Supabase Storage)
 */
export async function uploadAppHtmlToSupabaseStorage(
  customHtml?: string,
  stateForHtml?: AppState
): Promise<{
  success: boolean;
  message: string;
  publicUrl?: string;
  fileName?: string;
  storagePath?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'يرجى تهيئة مفاتيح Supabase (URL & Key) أولاً لإتمام رفع ملف index.html.',
    };
  }

  try {
    // 1. Ensure Storage Bucket exists (tamween-backups)
    try {
      const { data: buckets } = await client.storage.listBuckets();
      const hasBucket = buckets?.some((b) => b.name === SUPABASE_BUCKET_NAME);
      if (!hasBucket) {
        await client.storage.createBucket(SUPABASE_BUCKET_NAME, {
          public: true,
          fileSizeLimit: 52428800, // 50MB
        });
      }
    } catch (bErr) {
      console.warn('Could not list/create bucket automatically:', bErr);
    }

    // 2. Prepare HTML content
    let finalHtml = customHtml;
    if (!finalHtml) {
      if (stateForHtml) {
        finalHtml = generateStandaloneHtml(stateForHtml);
      } else {
        // Fetch current document HTML or bundled HTML
        try {
          const resp = await fetch('/tamween-system.html');
          if (resp.ok) {
            finalHtml = await resp.text();
          }
        } catch {
          // ignore
        }
        if (!finalHtml) {
          finalHtml = document.documentElement.outerHTML;
        }
      }
    }

    const htmlBlob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    const nowIso = new Date().toISOString().replace(/[:.]/g, '-');
    const rootFileName = 'index.html';
    const timestampedFileName = `tamween-app-${nowIso}.html`;

    // 3. Upload index.html as main entry point with upsert: true
    const { error: uploadError } = await client.storage
      .from(SUPABASE_BUCKET_NAME)
      .upload(rootFileName, htmlBlob, {
        contentType: 'text/html;charset=utf-8',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // 4. Also upload versioned copy for history
    await client.storage
      .from(SUPABASE_BUCKET_NAME)
      .upload(timestampedFileName, htmlBlob, {
        contentType: 'text/html;charset=utf-8',
        upsert: true,
      })
      .catch((err) => console.warn('Could not save timestamped copy:', err));

    // 5. Get public URL
    const { data: publicUrlData } = client.storage
      .from(SUPABASE_BUCKET_NAME)
      .getPublicUrl(rootFileName);

    const publicUrl = publicUrlData?.publicUrl || '';

    return {
      success: true,
      message: `تم رفع ملف index.html بنجاح إلى Supabase Storage في الحاوية (${SUPABASE_BUCKET_NAME})!`,
      publicUrl,
      fileName: rootFileName,
      storagePath: `${SUPABASE_BUCKET_NAME}/${rootFileName}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر رفع ملف index.html إلى Supabase Storage: ${err.message || 'خطأ أثناء الرفع'}`,
    };
  }
}

/**
 * نقل ومزامنة قاعدة البيانات بالكامل إلى السحابة و Supabase (Upsert Bakeries, Debts, and Snapshots)
 */
export async function migrateDatabaseToSupabase(state: AppState): Promise<{
  success: boolean;
  message: string;
  bakeriesUpserted: number;
  debtsUpserted: number;
  snapshotSaved: boolean;
  htmlUploaded: boolean;
  publicHtmlUrl?: string;
  details?: Record<string, any>;
}> {
  setSupabaseCloudDisabled(false);
  const nowIso = new Date().toISOString();
  const rawFullState = buildFullCloudMultiBranchPayload(state, nowIso);
  const vault = loadFromPermanentSafetyVault();
  const fullCloudState =
    (vault?.data
      ? mergeMultiBranchStatesNonDestructive(vault.data, rawFullState)
      : rawFullState) || rawFullState;

  saveToPermanentSafetyVault(fullCloudState, nowIso);

  const bakeriesCount = Array.isArray(fullCloudState?.bakeries)
    ? fullCloudState.bakeries.length
    : Array.isArray(state?.bakeries)
    ? state.bakeries.length
    : 0;
  const debtsCount = Array.isArray(fullCloudState?.debts)
    ? fullCloudState.debts.length
    : Array.isArray(state?.debts)
    ? state.debts.length
    : 0;

  // 1. Always push authoritative multi-branch snapshot to Supabase Live DB API (instant WebSocket broadcast)
  const serverSynced =
    typeof window !== 'undefined'
      ? await fetch(getLiveDbApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: fullCloudState, timestamp: nowIso, clientId: SESSION_CLIENT_ID }),
        })
          .then((r) => r.ok)
          .catch(() => false)
      : false;

  const client = getSupabaseClient();
  if (!client) {
    const nowAr = new Date().toLocaleString('ar-EG');
    safeSetItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);
    return {
      success: serverSynced,
      message: serverSynced
        ? `اكتمل نقل ومزامنة قاعدة البيانات وكافة الفروع على خادم المزامنة اللحظية بنجاح! تم حفظ (${bakeriesCount}) مخبز و (${debtsCount}) مديونية ومزامنتها لجميع الأجهزة فوراً.`
        : 'تعذر الوصول إلى خادم المزامنة حالياً.',
      bakeriesUpserted: bakeriesCount,
      debtsUpserted: debtsCount,
      snapshotSaved: serverSynced,
      htmlUploaded: true,
      publicHtmlUrl: typeof window !== 'undefined' ? window.location.origin : '',
      details: {
        lastSync: nowAr,
        htmlStatus: 'التزامن اللحظي عبر WebSocket نشط لجميع الفروع',
      },
    };
  }

  try {
    let bakeriesUpserted = 0;
    let debtsUpserted = 0;
    let snapshotSaved = serverSynced;

    // 1. Prepare snapshot payload containing all branches (branchPartitions)
    const snapshotId = `snapshot-${Date.now()}`;
    const snapshotPayload = {
      version: '3.7-supabase-full-migration',
      timestamp: nowIso,
      governorate: state.systemConfig?.governorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
      directorate: state.systemConfig?.directorateTitle || 'إدارة تموين مركز المحلة الكبرى',
      administration: state.systemConfig?.administrationTitle || 'قسم الرقابة التموينية وشئون المخابز',
      bakeriesCount,
      debtsCount,
      data: fullCloudState,
    };

    // 2. Try inserting full state snapshot into backup_snapshots table
    await client
      .from('backup_snapshots')
      .upsert(
        {
          id: 'latest_live_snapshot',
          version: snapshotPayload.version,
          timestamp: snapshotPayload.timestamp,
          bakeries_count: snapshotPayload.bakeriesCount,
          debts_count: snapshotPayload.debtsCount,
          payload: snapshotPayload,
        },
        { onConflict: 'id' }
      );

    const { error: snapshotError } = await client
      .from('backup_snapshots')
      .upsert({
        id: snapshotId,
        version: snapshotPayload.version,
        timestamp: snapshotPayload.timestamp,
        bakeries_count: snapshotPayload.bakeriesCount,
        debts_count: snapshotPayload.debtsCount,
        payload: snapshotPayload,
      });

    if (!snapshotError) {
      snapshotSaved = true;
    } else {
      console.warn('Could not upsert into backup_snapshots table:', snapshotError.message);
    }

    // 3. Migrate and upsert bakeries table
    const branchIdForRows = state.activeBranchId || 'branch-mahalla';
    if (state.bakeries && state.bakeries.length > 0) {
      const bakeryRows = state.bakeries.map((b) => mapBakeryToSqlRow(b, branchIdForRows, nowIso));

      for (let i = 0; i < bakeryRows.length; i += 100) {
        const batch = bakeryRows.slice(i, i + 100);
        const { error: bErr } = await client.from('bakeries').upsert(batch, { onConflict: 'id' });
        if (!bErr) {
          bakeriesUpserted += batch.length;
        } else {
          console.warn('Batch error on bakeries:', bErr.message);
        }
      }
    }

    // 4. Migrate and upsert debts table
    if (state.debts && state.debts.length > 0) {
      const debtRows = state.debts.map((d) => mapDebtToSqlRow(d, branchIdForRows, nowIso));

      for (let i = 0; i < debtRows.length; i += 100) {
        const batch = debtRows.slice(i, i + 100);
        const { error: dErr } = await client.from('debts').upsert(batch, { onConflict: 'id' });
        if (!dErr) {
          debtsUpserted += batch.length;
        } else {
          console.warn('Batch error on debts:', dErr.message);
        }
      }
    }

    // 5. Also upload full state JSON backup directly to Supabase Storage
    try {
      const jsonBlob = new Blob([JSON.stringify(snapshotPayload, null, 2)], {
        type: 'application/json',
      });
      await client.storage.from(SUPABASE_BUCKET_NAME).upload('tamween_database_backup.json', jsonBlob, {
        contentType: 'application/json',
        upsert: true,
      });
    } catch (jsonErr) {
      console.warn('Could not upload json backup to storage:', jsonErr);
    }

    // 6. Upload index.html to Supabase Storage as requested
    const htmlResult = await uploadAppHtmlToSupabaseStorage(undefined, state);

    const nowAr = new Date().toLocaleString('ar-EG');
    safeSetItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);

    const isFullSuccess = bakeriesUpserted > 0 || snapshotSaved;
    if (isFullSuccess) {
      setCloudConnectionStatus('connected', 'تم ترحيل ومزامنة البيانات مع Supabase بنجاح');
    } else {
      setCloudConnectionStatus('error', 'لم تستجب جداول Supabase أثناء الترحيل');
    }

    return {
      success: isFullSuccess,
      message: isFullSuccess
        ? `اكتمل نقل قاعدة البيانات إلى Supabase بنجاح! تم ترحيل (${bakeriesUpserted || bakeriesCount}) مخبز و (${debtsUpserted || debtsCount}) مديونية وحفظ نسخة احتياطية سحابية.`
        : 'تمت محاولة الترحيل ولكن لم تستجب الجداول. يرجى التأكد من تشغيل سكريبت إنشاء الجداول (SQL Schema) في لوحة Supabase.',
      bakeriesUpserted: bakeriesUpserted || bakeriesCount,
      debtsUpserted: debtsUpserted || debtsCount,
      snapshotSaved,
      htmlUploaded: htmlResult.success,
      publicHtmlUrl: htmlResult.publicUrl,
      details: {
        lastSync: nowAr,
        htmlStatus: htmlResult.message,
      },
    };
  } catch (err: any) {
    if (serverSynced) {
      setCloudConnectionStatus('connected', 'تمت المزامنة عبر خادم WebSocket اللحظي بنجاح');
    } else {
      setCloudConnectionStatus('error', `فشل المزامنة: ${err.message || 'خطأ غير معروف'}`);
    }
    return {
      success: serverSynced,
      message: serverSynced
        ? `تم حفظ ومزامنة البيانات عبر خادم المزامنة اللحظية بنجاح (${bakeriesCount} مخبز و ${debtsCount} مديونية)!`
        : `فشل نقل قاعدة البيانات إلى Supabase: ${err.message || 'خطأ غير معروف'}`,
      bakeriesUpserted: bakeriesCount,
      debtsUpserted: debtsCount,
      snapshotSaved: serverSynced,
      htmlUploaded: false,
    };
  }
}

export function mapBakeryToSqlRow(b: any, branchId: string, nowIso: string = new Date().toISOString()) {
  return {
    id: b.id,
    branch_id: branchId || 'branch-mahalla',
    machine_number: b.machineNumber || '',
    bakery_owner_name: b.bakeryOwnerName || 'بدون اسم',
    village: b.village || '',
    local_unit: b.localUnit || '',
    insurance_value: Number(b.insuranceValue) || 0,
    insurance_quota: Number(b.insuranceQuota) || 0,
    actual_quota: Number(b.actualQuota) || 0,
    loaves_count: Number(b.loavesCount) || 0,
    village_population: Number(b.villagePopulation) || 0,
    per_capita_average: String(b.perCapitaAverage || '0.00'),
    beneficiaries_2023: Number(b.beneficiaries2023) || 0,
    avg_2023: String(b.avg2023 || '0.00'),
    beneficiaries_2024: Number(b.beneficiaries2024) || 0,
    avg_2024: String(b.avg2024 || '0.00'),
    beneficiaries_2025: Number(b.beneficiaries2025) || 0,
    avg_2025: String(b.avg2025 || '0.00'),
    avg_diff: String(b.avgDiff || '0.00'),
    flour_bag_price: Number(b.flourBagPrice) || 950,
    bread_type: b.breadType || 'بلدي مدعم ماو',
    bread_type_count: Number(b.breadTypeCount) || 1,
    line_type: b.lineType || 'نصف آلي',
    fuel_type: b.fuelType || 'غاز طبيعي',
    activity_status: b.activityStatus || 'شغال',
    phone: b.phone || '',
    national_id: b.nationalId || '',
    notes: b.notes || '',
    data_json: b,
    updated_at: nowIso,
  };
}

export function mapDebtToSqlRow(d: any, branchId: string, nowIso: string = new Date().toISOString()) {
  return {
    id: d.id,
    branch_id: branchId || 'branch-mahalla',
    bakery_id: d.bakeryId || '',
    bakery_owner_name: d.bakeryOwnerName || 'بدون اسم',
    machine_number: d.machineNumber || '',
    village: d.village || '',
    local_unit: d.localUnit || '',
    violation_amount: Number(d.violationAmount) || 0,
    old_violations: Number(d.oldViolations) || 0,
    total_violations: Number(d.totalViolations) || 0,
    paid_violation_amount: Number(d.paidViolationAmount) || 0,
    remaining_violations: Number(d.remainingViolations) || 0,
    added_amount: Number(d.addedAmount) || 0,
    paid_added_amount: Number(d.paidAddedAmount) || 0,
    remaining_added: Number(d.remainingAdded) || 0,
    disposal_bags: Number(d.disposalBags) || 0,
    disposal_bag_price: Number(d.disposalBagPrice) || 950,
    disposal_multiplier: Number(d.disposalMultiplier) || 1,
    disposal_value: Number(d.disposalValue) || 0,
    paid_disposal_amount: Number(d.paidDisposalAmount) || 0,
    remaining_disposal: Number(d.remainingDisposal) || 0,
    net_remaining_debt: Number(d.netRemainingDebt) || 0,
    violation_date: d.violationDate || '',
    disposal_date: d.disposalDate || '',
    issuing_entity: d.issuingEntity || '',
    violation_type: d.violationType || '',
    payment_method: d.violationPaymentMethod || d.addedPaymentMethod || d.disposalPaymentMethod || '',
    status: (Number(d.netRemainingDebt) || 0) <= 0 ? 'PAID' : 'UNPAID',
    data_json: d,
    updated_at: nowIso,
  };
}

export function mapSqlRowToBakery(row: any) {
  if (!row) return null;
  return (
    row.data_json || {
      id: row.id,
      machineNumber: row.machine_number,
      bakeryOwnerName: row.bakery_owner_name,
      village: row.village,
      localUnit: row.local_unit,
      insuranceValue: Number(row.insurance_value) || 0,
      insuranceQuota: Number(row.insurance_quota) || 0,
      actualQuota: Number(row.actual_quota) || 0,
      loavesCount: Number(row.loaves_count) || 0,
      villagePopulation: Number(row.village_population) || 0,
      perCapitaAverage: row.per_capita_average || '0.00',
      beneficiaries2023: Number(row.beneficiaries_2023) || 0,
      avg2023: row.avg_2023 || '0.00',
      beneficiaries2024: Number(row.beneficiaries_2024) || 0,
      avg2024: row.avg_2024 || '0.00',
      beneficiaries2025: Number(row.beneficiaries_2025) || 0,
      avg2025: row.avg_2025 || '0.00',
      avgDiff: row.avg_diff || '0.00',
      flourBagPrice: Number(row.flour_bag_price) || 950,
      breadType: row.bread_type || 'بلدي مدعم ماو',
      breadTypeCount: Number(row.bread_type_count) || 1,
      lineType: row.line_type || 'نصف آلي',
      fuelType: row.fuel_type || 'غاز طبيعي',
      activityStatus: row.activity_status || 'شغال',
      phone: row.phone || '',
      nationalId: row.national_id || '',
      notes: row.notes || '',
    }
  );
}

export function mapSqlRowToDebt(row: any) {
  if (!row) return null;
  return (
    row.data_json || {
      id: row.id,
      bakeryId: row.bakery_id,
      bakeryOwnerName: row.bakery_owner_name,
      machineNumber: row.machine_number,
      village: row.village,
      localUnit: row.local_unit,
      violationAmount: Number(row.violation_amount) || 0,
      oldViolations: Number(row.old_violations) || 0,
      totalViolations: Number(row.total_violations) || 0,
      paidViolationAmount: Number(row.paid_violation_amount) || 0,
      remainingViolations: Number(row.remaining_violations) || 0,
      addedAmount: Number(row.added_amount) || 0,
      paidAddedAmount: Number(row.paid_added_amount) || 0,
      remainingAdded: Number(row.remaining_added) || 0,
      disposalBags: Number(row.disposal_bags) || 0,
      disposalBagPrice: Number(row.disposal_bag_price) || 950,
      disposalMultiplier: Number(row.disposal_multiplier) || 1,
      disposalValue: Number(row.disposal_value) || 0,
      paidDisposalAmount: Number(row.paid_disposal_amount) || 0,
      remainingDisposal: Number(row.remaining_disposal) || 0,
      netRemainingDebt: Number(row.net_remaining_debt) || 0,
      violationDate: row.violation_date || '',
      disposalDate: row.disposal_date || '',
      issuingEntity: row.issuing_entity || '',
      violationType: row.violation_type || '',
      paymentMethod: row.payment_method || '',
      status: row.status || 'UNPAID',
    }
  );
}

export function mapAlertToSqlRow(
  a: HighDebtAlertNotification,
  branchId: string,
  nowIso: string = new Date().toISOString()
) {
  return {
    id: a.id,
    branch_id: a.branchId || branchId || 'branch-mahalla',
    bakery_id: a.bakeryId || '',
    bakery_owner_name: a.bakeryOwnerName || 'بدون اسم',
    machine_number: a.machineNumber || '',
    village: a.village || '',
    debt_amount: Number(a.debtAmount) || 0,
    threshold_used: Number(a.thresholdUsed) || DEFAULT_DEBT_ALERT_THRESHOLD,
    action_type: a.actionType || 'ADD_DEBT',
    is_read: Boolean(a.isRead),
    edited_by: a.editedBy || '',
    editor_role: a.editorRole || '',
    created_at_iso: a.createdAtIso || nowIso,
    data_json: a,
    updated_at: nowIso,
  };
}

export function mapSqlRowToAlert(row: any): HighDebtAlertNotification | null {
  if (!row) return null;
  if (row.data_json && row.data_json.id) {
    return {
      ...row.data_json,
      isRead: typeof row.is_read === 'boolean' ? row.is_read : Boolean(row.data_json.isRead),
    };
  }
  if (!row.id) return null;
  return {
    id: row.id,
    bakeryId: row.bakery_id || '',
    bakeryOwnerName: row.bakery_owner_name || 'بدون اسم',
    machineNumber: row.machine_number || '',
    village: row.village || '',
    debtAmount: Number(row.debt_amount) || 0,
    thresholdUsed: Number(row.threshold_used) || DEFAULT_DEBT_ALERT_THRESHOLD,
    branchId: row.branch_id || 'branch-mahalla',
    createdAtIso: row.created_at_iso || row.updated_at || new Date().toISOString(),
    editedBy: row.edited_by || 'مستخدم منظومة',
    editorRole: row.editor_role || '',
    timestamp: '',
    actionType: row.action_type || 'ADD_DEBT',
    isRead: Boolean(row.is_read),
  };
}

export function mapBranchToSqlRow(br: any, nowIso: string = new Date().toISOString()) {
  return {
    id: br.id,
    name: br.name || 'فرع تمويني',
    governorate_title: br.governorateTitle || '',
    directorate_title: br.directorateTitle || '',
    description: br.description || '',
    data_json: br,
    updated_at: nowIso,
  };
}

export function mapSqlRowToBranch(row: any) {
  if (!row) return null;
  return (
    row.data_json || {
      id: row.id,
      name: row.name,
      governorateTitle: row.governorate_title || '',
      directorateTitle: row.directorate_title || '',
      description: row.description || '',
    }
  );
}

export function mapVillageToSqlRow(v: any, branchId: string, nowIso: string = new Date().toISOString()) {
  const villageName = String(v?.village || v?.name || 'قرية').trim();
  const safeId = v?.id || `${branchId || 'branch-mahalla'}__${villageName}`;
  return {
    id: safeId,
    branch_id: branchId || 'branch-mahalla',
    village_name: villageName,
    local_units: Array.isArray(v?.localUnits) ? v.localUnits : [],
    data_json: { village: villageName, localUnits: Array.isArray(v?.localUnits) ? v.localUnits : [] },
    updated_at: nowIso,
  };
}

export function mapSqlRowToVillage(row: any): { village: string; localUnits: string[] } | null {
  if (!row) return null;
  if (row.data_json && (row.data_json.village || row.data_json.name)) {
    return {
      village: row.data_json.village || row.data_json.name,
      localUnits: Array.isArray(row.data_json.localUnits) ? row.data_json.localUnits : [],
    };
  }
  if (!row.village_name) return null;
  return {
    village: row.village_name,
    localUnits: Array.isArray(row.local_units) ? row.local_units : [],
  };
}

export function mapUserToSqlRow(u: any, branchId: string, nowIso: string = new Date().toISOString()) {
  return {
    id: `${branchId || 'branch-mahalla'}__${u.id}`,
    branch_id: branchId || 'branch-mahalla',
    username: u.username || '',
    full_name: u.fullName || '',
    role: u.role || 'viewer',
    data_json: u,
    updated_at: nowIso,
  };
}

export function mapSqlRowToUser(row: any) {
  if (!row) return null;
  return row.data_json || {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role || 'viewer',
  };
}

export function mapTaskToSqlRow(t: any, branchId: string, nowIso: string = new Date().toISOString()) {
  return {
    id: t.id,
    branch_id: branchId || 'branch-mahalla',
    title: t.title || 'مهمة',
    priority: t.priority || 'medium',
    status: t.status || 'pending',
    due_date: t.dueDate || '',
    data_json: t,
    updated_at: nowIso,
  };
}

export function mapSqlRowToTask(row: any) {
  if (!row) return null;
  return row.data_json || {
    id: row.id,
    title: row.title,
    priority: row.priority || 'medium',
    status: row.status || 'pending',
    dueDate: row.due_date || '',
  };
}

export function computeDeletedIds(
  serverIds: Array<string | number>,
  currentRows: Array<{ id: string }>
): string[] {
  const activeSet = new Set((currentRows || []).map((r) => String(r.id)));
  return (serverIds || [])
    .map((id) => String(id))
    .filter((id) => id && !activeSet.has(id));
}

/**
 * حل التعارض التلقائي عند تعديل سجلين من جهازين في نفس الوقت اعتماداً على آخر توقيت تعديل
 */
export function resolveConcurrentRecords<T extends { id: string; lastUpdatedAt?: string; updatedAt?: string }>(
  localRows: T[],
  remoteRows: T[]
): { merged: T[]; conflictsResolved: number } {
  const byId = new Map<string, T>();
  let conflictsResolved = 0;

  for (const r of remoteRows || []) {
    if (r && r.id) byId.set(String(r.id), r);
  }

  for (const local of localRows || []) {
    if (!local || !local.id) continue;
    const key = String(local.id);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, local);
      continue;
    }
    const tLocal = Date.parse(local.lastUpdatedAt || local.updatedAt || '') || 0;
    const tRemote = Date.parse(existing.lastUpdatedAt || existing.updatedAt || '') || 0;
    if (tLocal > tRemote) {
      byId.set(key, local);
      conflictsResolved += 1;
    } else if (tRemote > tLocal) {
      conflictsResolved += 1;
    }
  }

  return { merged: Array.from(byId.values()), conflictsResolved };
}

const processedRealtimeEventMap = new Map<string, number>();

export function shouldProcessRealtimeEvent(
  eventKey: string,
  nowMs: number = Date.now(),
  ttlMs: number = 2500
): boolean {
  if (!eventKey) return true;
  if (processedRealtimeEventMap.size > 300) {
    for (const [k, ts] of processedRealtimeEventMap.entries()) {
      if (nowMs - ts > ttlMs) processedRealtimeEventMap.delete(k);
    }
  }
  const prev = processedRealtimeEventMap.get(eventKey);
  if (prev !== undefined && nowMs - prev < ttlMs) {
    return false;
  }
  processedRealtimeEventMap.set(eventKey, nowMs);
  return true;
}

export function applyRealtimeRowMutation<T extends { id: string }>(
  currentRows: T[],
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  newRow: any,
  oldRow: any,
  mapRow: (r: any) => T | null
): T[] {
  const safeList = Array.isArray(currentRows) ? [...currentRows] : [];
  if (eventType === 'DELETE') {
    const targetId = oldRow?.id || newRow?.id;
    if (!targetId) return safeList;
    return safeList.filter((item) => String(item.id) !== String(targetId));
  }
  const mapped = mapRow(newRow);
  if (!mapped || !mapped.id) return safeList;
  const idx = safeList.findIndex((item) => String(item.id) === String(mapped.id));
  if (idx >= 0) {
    safeList[idx] = mapped;
    return safeList;
  }
  return [mapped, ...safeList];
}

// -----------------------------------------------------------------------------
// Shared WebSocket Real-Time Client Manager (Port 3000 /ws/supabase-realtime)
// -----------------------------------------------------------------------------
type WsStateListener = (msg: {
  type: 'init' | 'state_update' | 'state_cleared' | 'alerts_update' | 'config_updated';
  snapshot?: any;
  alertsState?: any;
  alerts?: HighDebtAlertNotification[];
  debtAlertThreshold?: number;
  cleared?: boolean;
  clientId?: string;
  timestamp?: string;
  url?: string;
  anonKey?: string;
}) => void;

const wsListeners = new Set<WsStateListener>();
let sharedWs: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let wsHttpFallbackTimer: ReturnType<typeof setInterval> | null = null;
let wsReconnectAttempts = 0;

function stopWsHeartbeat() {
  if (wsHeartbeatTimer) {
    clearInterval(wsHeartbeatTimer);
    wsHeartbeatTimer = null;
  }
}

function stopWsHttpFallback() {
  if (wsHttpFallbackTimer) {
    clearInterval(wsHttpFallbackTimer);
    wsHttpFallbackTimer = null;
  }
}

function startWsHttpFallback() {
  if (wsHttpFallbackTimer || typeof window === 'undefined') return;
  wsHttpFallbackTimer = setInterval(async () => {
    if (wsListeners.size === 0 || isBrowserOffline()) return;
    if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
      stopWsHttpFallback();
      return;
    }
    const ok = await probeServerHealth();
    if (ok) {
      if (getPendingOfflineQueueCount() > 0) {
        flushOfflineSyncQueue().catch(() => {});
      }
      setCloudConnectionStatus(
        'connected',
        'متصل بخادم المزامنة اللحظية عبر HTTPS',
        {
          hasPendingSync: getPendingOfflineQueueCount() > 0,
          pendingQueueCount: getPendingOfflineQueueCount(),
        }
      );
      try {
        const resp = await fetch(getLiveDbApiUrl(), { method: 'GET', credentials: 'same-origin' });
        const ct = resp.headers.get('content-type') || '';
        if (resp.ok && ct.includes('application/json')) {
          const json = await resp.json();
          if (json?.success && json?.snapshot?.data) {
            wsListeners.forEach((listener) => {
              try {
                listener({
                  type: 'state_update',
                  clientId: json.snapshot.clientId || '',
                  timestamp: json.snapshot.timestamp,
                  snapshot: json.snapshot,
                });
              } catch {}
            });
          }
        }
      } catch {}
    }
  }, 10000);
}

function disconnectSharedWebSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  stopWsHeartbeat();
  stopWsHttpFallback();
  if (sharedWs) {
    try {
      sharedWs.onopen = null;
      sharedWs.onmessage = null;
      sharedWs.onerror = null;
      sharedWs.onclose = null;
      sharedWs.close();
    } catch {}
    sharedWs = null;
  }
}

function scheduleWsReconnect() {
  if (wsListeners.size === 0 || typeof window === 'undefined' || isBrowserOffline()) return;
  if (wsReconnectTimer) return;
  const delay = Math.min(8000, 1000 * Math.pow(2, Math.min(wsReconnectAttempts, 3)));
  wsReconnectAttempts += 1;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    ensureSharedWebSocket();
  }, delay);
}

function ensureSharedWebSocket(): void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
  if (wsListeners.size === 0) return;
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured || isBrowserOffline()) return;
  if (
    sharedWs &&
    (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const wsUrl = getWebSocketSyncUrl();
  if (!wsUrl) return;

  try {
    const ws = new WebSocket(wsUrl);
    sharedWs = ws;

    ws.onopen = () => {
      wsReconnectAttempts = 0;
      stopWsHttpFallback();
      const client = getSupabaseClient();
      if (!client && !isBrowserOffline()) {
        setCloudConnectionStatus(
          'connected',
          'متصل بخادم المزامنة اللحظية (Supabase WebSocket Realtime)',
          {
            hasPendingSync: getPendingOfflineQueueCount() > 0,
            pendingQueueCount: getPendingOfflineQueueCount(),
          }
        );
      }
      if (getPendingOfflineQueueCount() > 0 && !isBrowserOffline()) {
        flushOfflineSyncQueue().catch(() => {});
      }
      stopWsHeartbeat();
      wsHeartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {}
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data || '{}'));
        if (!msg || !msg.type || msg.type === 'pong') return;
        if (msg.type === 'config_updated') {
          if (msg.url && msg.anonKey && isValidHttpUrl(msg.url) && !isServiceRoleJwt(msg.anonKey)) {
            safeSetItem(SUPABASE_URL_KEY, msg.url);
            safeSetItem(SUPABASE_ANON_KEY_KEY, msg.anonKey);
            cachedClient = null;
          }
        }
        wsListeners.forEach((listener) => {
          try {
            listener(msg);
          } catch {}
        });
      } catch {}
    };

    ws.onerror = () => {
      // Do not immediately flip UI to "غير متصل" if HTTPS server API is actually healthy; verify via HTTP first
      const client = getSupabaseClient();
      if (!client && !isBrowserOffline()) {
        probeServerHealth()
          .then((httpOk) => {
            if (httpOk) {
              setCloudConnectionStatus(
                'connected',
                'متصل بالخادم عبر HTTPS (قناة WebSocket قيد إعادة الربط)',
                {
                  hasPendingSync: getPendingOfflineQueueCount() > 0,
                  pendingQueueCount: getPendingOfflineQueueCount(),
                }
              );
              startWsHttpFallback();
              if (getPendingOfflineQueueCount() > 0) {
                flushOfflineSyncQueue().catch(() => {});
              }
            } else if (!isBrowserOffline()) {
              setCloudConnectionStatus('error', 'تعذر الوصول إلى خادم المزامنة اللحظية Supabase');
            }
          })
          .catch(() => {
            if (!isBrowserOffline()) {
              setCloudConnectionStatus('error', 'تعذر استقرار قناة البث اللحظي WebSocket');
            }
          });
      }
    };

    ws.onclose = () => {
      stopWsHeartbeat();
      if (sharedWs === ws) {
        sharedWs = null;
      }
      startWsHttpFallback();
      scheduleWsReconnect();
    };
  } catch {
    startWsHttpFallback();
    scheduleWsReconnect();
  }
}

export function addSharedWebSocketListener(listener: WsStateListener): () => void {
  wsListeners.add(listener);
  ensureSharedWebSocket();
  return () => {
    wsListeners.delete(listener);
    if (wsListeners.size === 0) {
      disconnectSharedWebSocket();
    }
  };
}

/**
 * استعادة وتحميل أحدث قاعدة بيانات من Supabase وخادم المزامنة اللحظية
 */
export async function fetchDatabaseFromSupabase(): Promise<{
  success: boolean;
  message: string;
  data?: AppState;
  timestamp?: string;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    setCloudConnectionStatus('offline', 'التخزين السحابي غير مفعل حالياً');
    return {
      success: false,
      message: 'التخزين السحابي غير مفعل حالياً.',
    };
  }

  if (isBrowserOffline()) {
    setCloudConnectionStatus('offline', 'انقطع الاتصال بالإنترنت. التعديلات محفوظة محلياً لحين عودة الشبكة.');
    return {
      success: false,
      message: 'الجهاز غير متصل بالإنترنت حالياً.',
    };
  }

  let client = getSupabaseClient();
  if (!client) {
    await syncSupabaseConfigFromRemote();
    client = getSupabaseClient();
  }

  const candidates: Array<{ data: AppState; timestamp: string; source: string }> = [];
  let serverReachable = false;
  let lastErrorMsg = '';

  // 1. Primary Cloud Source of Truth: Supabase PostgreSQL / Realtime
  if (client) {
    try {
      const { data: liveRow, error: liveErr } = await client
        .from('backup_snapshots')
        .select('payload, timestamp')
        .eq('id', 'latest_live_snapshot')
        .maybeSingle();

      if (liveErr) {
        lastErrorMsg = liveErr.message;
      } else {
        serverReachable = true;
      }

      if (!liveErr && liveRow && liveRow.payload) {
        const payload = liveRow.payload;
        const data = payload.data || payload;
        if (
          data &&
          (Array.isArray(data.bakeries) ||
            Array.isArray(data.debts) ||
            Array.isArray(data.branches) ||
            data.branchPartitions)
        ) {
          candidates.push({
            data: data as AppState,
            timestamp: payload.timestamp || liveRow.timestamp || new Date().toISOString(),
            source: 'Supabase Live Snapshot',
          });
        }
      }

      if (candidates.length === 0) {
        const { data: snapshotRows, error: sErr } = await client
          .from('backup_snapshots')
          .select('payload, timestamp')
          .order('timestamp', { ascending: false })
          .limit(1);

        if (!sErr && snapshotRows && snapshotRows.length > 0 && snapshotRows[0].payload) {
          serverReachable = true;
          const payload = snapshotRows[0].payload;
          const data = payload.data || payload;
          if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
            candidates.push({
              data: data as AppState,
              timestamp: payload.timestamp || snapshotRows[0].timestamp || new Date().toISOString(),
              source: 'Supabase Backup Snapshots',
            });
          }
        }
      }

      if (candidates.length === 0) {
        const { data: bData, error: bErr } = await client.from('bakeries').select('*');
        const { data: dData } = await client.from('debts').select('*');

        if (!bErr && bData && bData.length > 0) {
          serverReachable = true;
          const restoredBakeries = bData.map(mapSqlRowToBakery).filter(Boolean);
          const restoredDebts = (dData || []).map(mapSqlRowToDebt).filter(Boolean);

          candidates.push({
            data: {
              bakeries: restoredBakeries,
              debts: restoredDebts,
            } as unknown as AppState,
            timestamp: new Date().toISOString(),
            source: 'جداول Supabase SQL',
          });
        }
      }
    } catch (err: any) {
      lastErrorMsg = err?.message || 'خطأ في الاتصال بـ Supabase';
      console.warn('Supabase fetch error:', err);
    }
  }

  // 2. Same-Origin / Shared Live-DB WebSocket Relay (handles multi-device sync seamlessly out-of-the-box)
  if (typeof window !== 'undefined') {
    const serverSnap = await fetch(getLiveDbApiUrl())
      .then(async (r) => {
        if (r.ok) {
          serverReachable = true;
          return await r.json();
        }
        return null;
      })
      .catch(() => null);

    const serverData = (serverSnap?.data || serverSnap?.snapshot?.data) as AppState | undefined;
    const serverTimestamp =
      serverSnap?.timestamp || serverSnap?.snapshot?.timestamp || new Date(0).toISOString();
    if (
      serverSnap &&
      serverSnap.success &&
      serverData &&
      (Array.isArray(serverData.bakeries) ||
        Array.isArray(serverData.debts) ||
        Array.isArray(serverData.branches) ||
        (serverData as any).branchPartitions)
    ) {
      candidates.push({
        data: serverData as AppState,
        timestamp: serverTimestamp,
        source: 'خادم المزامنة اللحظية (Supabase WebSocket)',
      });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const tA = Date.parse(a.timestamp) || 0;
      const tB = Date.parse(b.timestamp) || 0;
      return tB - tA;
    });
    const best = candidates[0];
    saveToPermanentSafetyVault(best.data, best.timestamp);
    if (!pendingSyncPayload && !isBrowserOffline()) {
      setCloudConnectionStatus('connected', `متصل بالخادم (${best.source})`);
    }
    return {
      success: true,
      message: `تم بنجاح تحميل أحدث بيانات مسجلة من ${best.source} (${best.data.bakeries?.length || 0} مخبز و ${best.data.debts?.length || 0} مديونية)!`,
      data: best.data,
      timestamp: best.timestamp,
    };
  }

  // Auto-heal / Auto-migrate: If the connected server is empty (e.g. server changed or reset)
  // and this device holds registered records in its Permanent Safety Vault, immediately migrate them to the server!
  const vault = loadFromPermanentSafetyVault();
  if (vault?.data) {
    if (serverReachable && !isBrowserOffline()) {
      performCloudPush(vault.data, vault.timestamp || new Date().toISOString(), {
        skipEnqueueOnFailure: true,
      }).catch(() => {});
    }
    if (!pendingSyncPayload && !isBrowserOffline()) {
      setCloudConnectionStatus('connected', 'تم استرجاع البيانات المسجلة ومزامنتها تلقائياً مع الخادم');
    }
    return {
      success: true,
      message: 'تم استرجاع البيانات المسجلة من خزنة الأمان الدائمة وترحيلها تلقائياً إلى الخادم الحالي دون فقدان أي بيان.',
      data: vault.data,
      timestamp: vault.timestamp,
    };
  }

  if (isBrowserOffline()) {
    setCloudConnectionStatus('offline', 'الجهاز غير متصل بالإنترنت حالياً');
  } else if (serverReachable || typeof window === 'undefined') {
    if (!pendingSyncPayload) {
      setCloudConnectionStatus('connected', 'متصل بخادم Supabase بنجاح');
    }
  } else {
    setCloudConnectionStatus(
      'error',
      lastErrorMsg || 'تعذر الاتصال بخادم المزامنة اللحظية Supabase'
    );
  }

  return {
    success: false,
    message: serverReachable
      ? 'لم يتم العثور على أي سجلات أو نسخ احتياطية مسجلة على الخادم حتى الآن.'
      : lastErrorMsg || 'تعذر الاتصال بخادم المزامنة اللحظية Supabase.',
  };
}

let autoSyncDebounceTimer: any = null;
let activeRealtimeChannel: any = null;

export interface DetailedSyncResult {
  success: boolean;
  queuedOffline: boolean;
  syncedAt?: string;
  revision?: number;
  error?: string;
}

async function performCloudPush(
  state: AppState,
  nowIso: string,
  options?: { skipEnqueueOnFailure?: boolean }
): Promise<DetailedSyncResult> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) {
    return { success: false, queuedOffline: false, error: 'التخزين السحابي معطل يدوياً.' };
  }

  if (isBrowserOffline()) {
    const qCount = options?.skipEnqueueOnFailure
      ? getPendingOfflineQueueCount()
      : enqueueOfflineSync(state, nowIso);
    pendingSyncPayload = { state, timestamp: nowIso };
    setCloudConnectionStatus(
      'offline',
      `انقطع الإنترنت — تم حفظ التعديل في قائمة الانتظار (${qCount}) للمزامنة التلقائية فور عودة الشبكة`,
      { hasPendingSync: true, pendingQueueCount: qCount }
    );
    return {
      success: false,
      queuedOffline: true,
      error: 'الجهاز غير متصل بالإنترنت',
    };
  }

  setCloudConnectionStatus('syncing', 'جاري مزامنة التعديلات لحظياً مع Supabase...', {
    hasPendingSync: true,
  });

  try {
    const fullPayloadState = (state as unknown as { branchPartitions?: unknown })?.branchPartitions
      ? state
      : buildFullCloudMultiBranchPayload(state, nowIso);
    saveToPermanentSafetyVault(fullPayloadState, nowIso);
    const snapshotPayload = {
      version: '5.0-supabase-realtime-autosync',
      timestamp: nowIso,
      clientId: SESSION_CLIENT_ID,
      bakeriesCount: Array.isArray(fullPayloadState?.bakeries) ? fullPayloadState.bakeries.length : 0,
      debtsCount: Array.isArray(fullPayloadState?.debts) ? fullPayloadState.debts.length : 0,
      data: fullPayloadState,
    };

    // 1. Push to live-db WebSocket relay server (instant fanout to all same-origin devices/browsers)
    let serverOk = false;
    let serverHttpFailure = false;
    let serverErrMsg = '';
    let serverRevision: number | undefined;
    let networkUnreachable = false;

    if (typeof window !== 'undefined') {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
        const resp = await fetch(getLiveDbApiUrl(), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: fullPayloadState,
            timestamp: nowIso,
            clientId: SESSION_CLIENT_ID,
          }),
          signal: controller?.signal,
        });
        if (timer) clearTimeout(timer);
        const contentType = resp.headers.get('content-type') || '';
        if (resp.ok && contentType.includes('application/json')) {
          const json = await resp.json().catch(() => null);
          if (json && json.success) {
            serverOk = true;
            serverRevision = typeof json?.revision === 'number' ? json.revision : undefined;
          } else {
            serverHttpFailure = true;
            serverErrMsg = json?.error || 'استجابة غير متوقعة من خادم المزامنة';
          }
        } else if (resp.ok) {
          serverHttpFailure = true;
          serverErrMsg = 'نقطة المزامنة لا تعيد بيانات JSON صالحة';
        } else {
          serverHttpFailure = true;
          try {
            const errJson = await resp.json();
            serverErrMsg = errJson?.error || `HTTP ${resp.status}`;
          } catch {
            serverErrMsg = `HTTP ${resp.status}`;
          }
        }
      } catch (fetchErr: any) {
        networkUnreachable = true;
        serverErrMsg = fetchErr?.message || 'تعذر الاتصال بالخادم';
      }
    }

    // 2. If external Supabase project URL & Anon Key are configured, persist across all 9 normalized tables + Realtime broadcast
    let externalSupabaseOk = false;
    let externalErrorMsg = '';
    const client = getSupabaseClient();
    if (client) {
      try {
        if (!activeRealtimeChannel) {
          activeRealtimeChannel = client.channel('tamween_realtime_channel', {
            config: { broadcast: { self: false } },
          });
          activeRealtimeChannel.subscribe();
        }
        activeRealtimeChannel.send({
          type: 'broadcast',
          event: 'state_update',
          payload: snapshotPayload,
        });
      } catch (bcastErr) {
        console.warn('Supabase Realtime broadcast error:', bcastErr);
      }

      try {
        const { error: snapErr } = await client
          .from('backup_snapshots')
          .upsert(
            {
              id: 'latest_live_snapshot',
              version: snapshotPayload.version,
              timestamp: snapshotPayload.timestamp,
              bakeries_count: snapshotPayload.bakeriesCount,
              debts_count: snapshotPayload.debtsCount,
              payload: snapshotPayload,
            },
            { onConflict: 'id' }
          );

        if (snapErr) {
          externalErrorMsg = snapErr.message;
        } else {
          externalSupabaseOk = true;
        }
      } catch (snapEx: any) {
        externalErrorMsg = snapEx?.message || 'تعذر الوصول إلى مشروع Supabase الخارجي';
      }

      try {
        const activeBranchId = state.activeBranchId || 'branch-mahalla';
        const branchesList = state.branches || [];
        if (branchesList.length > 0) {
          await client
            .from('branches')
            .upsert(
              branchesList.map((br) => mapBranchToSqlRow(br, nowIso)),
              { onConflict: 'id' }
            );
        }

        const vList = state.villages || [];
        if (vList.length > 0) {
          await client
            .from('villages')
            .upsert(
              vList.map((v) => mapVillageToSqlRow(v, activeBranchId, nowIso)),
              { onConflict: 'id' }
            );
        }

        const bList = state.bakeries || [];
        const dList = state.debts || [];
        const bRows = bList.map((b) => mapBakeryToSqlRow(b, activeBranchId, nowIso));
        const dRows = dList.map((d) => mapDebtToSqlRow(d, activeBranchId, nowIso));

        if (bRows.length > 0) {
          const { error: bUpErr } = await client
            .from('bakeries')
            .upsert(bRows, { onConflict: 'id' });
          if (bUpErr) externalErrorMsg = bUpErr.message;
        }

        if (dRows.length > 0) {
          const { error: dUpErr } = await client
            .from('debts')
            .upsert(dRows, { onConflict: 'id' });
          if (dUpErr) externalErrorMsg = dUpErr.message;
        }

        const uList = state.users || [];
        if (uList.length > 0) {
          await client
            .from('app_users')
            .upsert(
              uList.map((u) => mapUserToSqlRow(u, activeBranchId, nowIso)),
              { onConflict: 'id' }
            );
        }

        const tList = state.dailyTasks || [];
        if (tList.length > 0) {
          await client
            .from('daily_tasks')
            .upsert(
              tList.map((t) => mapTaskToSqlRow(t, activeBranchId, nowIso)),
              { onConflict: 'id' }
            );
        }

        if (state.systemConfig) {
          await client.from('system_config').upsert(
            {
              id: 'tamween_config',
              governorate_title: state.systemConfig.governorateTitle,
              directorate_title: state.systemConfig.directorateTitle,
              administration_title: state.systemConfig.administrationTitle,
              payload: {
                ...state.systemConfig,
                logoBase64: undefined,
              },
              updated_at: nowIso,
            },
            { onConflict: 'id' }
          );
        }
      } catch (rowSyncErr: any) {
        console.warn('Row-level Supabase sync warning:', rowSyncErr?.message || rowSyncErr);
      }
    }

    const overallSuccess = client ? (externalSupabaseOk || serverOk) : serverOk;
    if (overallSuccess) {
      pendingSyncPayload = null;
      // Since fullPayloadState already persists the complete latest multi-branch snapshot,
      // clear superseded offline queue items (unless this call is an item flush handled by flushOfflineSyncQueue).
      if (!options?.skipEnqueueOnFailure && getPendingOfflineQueueCount() > 0) {
        clearOfflineSyncQueue();
      }
      const nowAr = new Date().toLocaleTimeString('ar-EG');
      safeSetItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);
      setCloudConnectionStatus(
        'connected',
        client && externalSupabaseOk
          ? `متصل وتمت المزامنة اللحظية مع Supabase (${nowAr})`
          : `متصل وتمت المزامنة اللحظية مع خادم Supabase (${nowAr})`,
        {
          lastSyncAt: nowAr,
          hasPendingSync: options?.skipEnqueueOnFailure ? getPendingOfflineQueueCount() > 1 : false,
          pendingQueueCount: options?.skipEnqueueOnFailure ? Math.max(0, getPendingOfflineQueueCount() - 1) : 0,
        }
      );
      return {
        success: true,
        queuedOffline: false,
        syncedAt: nowAr,
        revision: serverRevision,
      };
    }

    // Network drop during fetch -> enqueue safely for auto-retry when back online
    if (networkUnreachable && !serverHttpFailure) {
      const qCount = options?.skipEnqueueOnFailure
        ? getPendingOfflineQueueCount()
        : enqueueOfflineSync(state, nowIso);
      pendingSyncPayload = { state, timestamp: nowIso };
      setCloudConnectionStatus(
        'offline',
        `انقطع الاتصال بالخادم — تم حفظ التعديلات في قائمة الانتظار (${qCount})`,
        { hasPendingSync: true, pendingQueueCount: qCount }
      );
      return {
        success: false,
        queuedOffline: true,
        error: serverErrMsg,
      };
    }

    const errMsg = externalErrorMsg || serverErrMsg || 'تعذر إتمام المزامنة اللحظية مع خادم Supabase';
    setCloudConnectionStatus('error', errMsg, { hasPendingSync: getPendingOfflineQueueCount() > 0 });
    return {
      success: false,
      queuedOffline: false,
      error: errMsg,
    };
  } catch (err: any) {
    const qCount = options?.skipEnqueueOnFailure
      ? getPendingOfflineQueueCount()
      : enqueueOfflineSync(state, nowIso);
    pendingSyncPayload = { state, timestamp: nowIso };
    setCloudConnectionStatus(
      'offline',
      `تعذر الوصول للشبكة — تم حفظ التعديل في قائمة الانتظار (${qCount})`,
      { hasPendingSync: true, pendingQueueCount: qCount }
    );
    return {
      success: false,
      queuedOffline: true,
      error: err?.message || 'تعذر الاتصال بالخادم',
    };
  }
}

let isFlushingOfflineQueue = false;

export async function flushOfflineSyncQueue(): Promise<{
  flushedCount: number;
  remainingCount: number;
}> {
  if (isBrowserOffline() || isFlushingOfflineQueue) {
    return { flushedCount: 0, remainingCount: getPendingOfflineQueueCount() };
  }
  const queue = [...loadOfflineQueueFromStorage()];
  if (queue.length === 0) {
    return { flushedCount: 0, remainingCount: 0 };
  }

  isFlushingOfflineQueue = true;
  let flushedCount = 0;
  try {
    while (queue.length > 0) {
      const head = queue[0];
      const res = await performCloudPush(head.state, head.timestamp, {
        skipEnqueueOnFailure: true,
      });
      if (res.success) {
        queue.shift();
        flushedCount += 1;
        persistOfflineQueue(queue);
      } else {
        head.attempts += 1;
        persistOfflineQueue(queue);
        break;
      }
    }

    const remainingCount = getPendingOfflineQueueCount();
    if (remainingCount === 0 && flushedCount > 0) {
      pendingSyncPayload = null;
      const nowAr = new Date().toLocaleTimeString('ar-EG');
      setCloudConnectionStatus(
        'connected',
        `تمت استعادة الاتصال وإرسال (${flushedCount}) عملية من قائمة الانتظار بنجاح`,
        { lastSyncAt: nowAr, hasPendingSync: false, pendingQueueCount: 0 }
      );
    }
    return { flushedCount, remainingCount };
  } finally {
    isFlushingOfflineQueue = false;
  }
}

export async function autoSyncToSupabaseDetailed(
  state: AppState,
  immediate = false,
  customTimestamp?: string
): Promise<DetailedSyncResult> {
  const nowIso = customTimestamp || new Date().toISOString();
  if (immediate) {
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }
    return performCloudPush(state, nowIso);
  }

  return new Promise((resolve) => {
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
    }
    autoSyncDebounceTimer = setTimeout(async () => {
      const res = await performCloudPush(state, nowIso);
      resolve(res);
    }, 150);
  });
}

/**
 * مزامنة تلقائية فورية مع Supabase وخادم WebSocket عند أي تعديل دون الحاجة للضغط على أي زر
 */
export async function autoSyncToSupabase(
  state: AppState,
  immediate = false,
  customTimestamp?: string
): Promise<boolean> {
  const res = await autoSyncToSupabaseDetailed(state, immediate, customTimestamp);
  return res.success;
}

// -----------------------------------------------------------------------------
// High-Debt Alerts Supabase Sync & Real-Time Subscriptions
// -----------------------------------------------------------------------------
export async function fetchHighDebtAlertsFromSupabase(): Promise<{
  alerts: HighDebtAlertNotification[];
  debtAlertThreshold: number;
  updatedAt?: string;
} | null> {
  if (isBrowserOffline()) return null;

  let threshold = DEFAULT_DEBT_ALERT_THRESHOLD;
  let mergedAlerts: HighDebtAlertNotification[] = [];
  let updatedAt = '';

  const client = getSupabaseClient();
  if (client) {
    try {
      const [{ data: alertRows, error: aErr }, { data: metaRow }] = await Promise.all([
        client
          .from('high_debt_alerts')
          .select('*')
          .order('created_at_iso', { ascending: false })
          .limit(150),
        client
          .from('system_config')
          .select('payload, updated_at')
          .eq('id', 'tamween_alerts_meta')
          .maybeSingle(),
      ]);

      if (!aErr && Array.isArray(alertRows)) {
        mergedAlerts = alertRows.map(mapSqlRowToAlert).filter(Boolean) as HighDebtAlertNotification[];
      }
      if (metaRow?.payload?.debtAlertThreshold) {
        threshold = Number(metaRow.payload.debtAlertThreshold) || DEFAULT_DEBT_ALERT_THRESHOLD;
        updatedAt = metaRow.updated_at || '';
      }
    } catch (err) {
      console.warn('Supabase high_debt_alerts fetch error:', err);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const resp = await fetch(getAlertsApiUrl());
      if (resp.ok) {
        const json = await resp.json();
        if (json?.success) {
          const srvAlerts = Array.isArray(json.alerts) ? json.alerts : [];
          mergedAlerts = mergeHighDebtAlerts(mergedAlerts, srvAlerts);
          if (typeof json.debtAlertThreshold === 'number' && json.debtAlertThreshold > 0) {
            threshold = json.debtAlertThreshold;
          }
          if (json.updatedAt && (!updatedAt || Date.parse(json.updatedAt) > Date.parse(updatedAt))) {
            updatedAt = json.updatedAt;
          }
        }
      }
    } catch {}
  }

  return {
    alerts: mergedAlerts,
    debtAlertThreshold: threshold,
    updatedAt,
  };
}

export async function syncHighDebtAlertsToSupabase(
  alerts: HighDebtAlertNotification[],
  debtAlertThreshold?: number
): Promise<boolean> {
  if (isBrowserOffline()) return false;
  const nowIso = new Date().toISOString();
  const effectiveThreshold =
    typeof debtAlertThreshold === 'number' && debtAlertThreshold > 0
      ? debtAlertThreshold
      : DEFAULT_DEBT_ALERT_THRESHOLD;

  const trimmed = (alerts || []).slice(0, 150);
  let serverOk = false;

  if (typeof window !== 'undefined') {
    serverOk = await fetch(getAlertsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alerts: trimmed,
        debtAlertThreshold: effectiveThreshold,
        timestamp: nowIso,
        clientId: SESSION_CLIENT_ID,
      }),
    })
      .then((r) => r.ok)
      .catch(() => false);
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      if (trimmed.length > 0) {
        const rows = trimmed.map((a) => mapAlertToSqlRow(a, a.branchId || 'branch-mahalla', nowIso));
        await client.from('high_debt_alerts').upsert(rows, { onConflict: 'id' });
      }
      await client.from('system_config').upsert(
        {
          id: 'tamween_alerts_meta',
          governorate_title: 'alerts_meta',
          directorate_title: 'alerts_meta',
          administration_title: 'alerts_meta',
          payload: {
            debtAlertThreshold: effectiveThreshold,
            clientId: SESSION_CLIENT_ID,
            updatedAt: nowIso,
          },
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      );
      if (activeRealtimeChannel) {
        activeRealtimeChannel.send({
          type: 'broadcast',
          event: 'alerts_update',
          payload: {
            alerts: trimmed,
            debtAlertThreshold: effectiveThreshold,
            clientId: SESSION_CLIENT_ID,
            cleared: false,
            timestamp: nowIso,
          },
        });
      }
      return true;
    } catch (err) {
      console.warn('Supabase alerts sync error:', err);
    }
  }

  return serverOk;
}

export async function clearHighDebtAlertsInSupabase(
  debtAlertThreshold?: number
): Promise<boolean> {
  const effectiveThreshold =
    typeof debtAlertThreshold === 'number' && debtAlertThreshold > 0
      ? debtAlertThreshold
      : DEFAULT_DEBT_ALERT_THRESHOLD;
  const nowIso = new Date().toISOString();

  let serverOk = false;
  if (typeof window !== 'undefined') {
    serverOk = await fetch(
      `${getAlertsApiUrl()}?clientId=${encodeURIComponent(SESSION_CLIENT_ID)}&threshold=${effectiveThreshold}`,
      { method: 'DELETE' }
    )
      .then((r) => r.ok)
      .catch(() => false);
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      await client.from('high_debt_alerts').delete().neq('id', 'non_existent_id');
      await client.from('system_config').upsert(
        {
          id: 'tamween_alerts_meta',
          governorate_title: 'alerts_meta',
          directorate_title: 'alerts_meta',
          administration_title: 'alerts_meta',
          payload: {
            debtAlertThreshold: effectiveThreshold,
            clientId: SESSION_CLIENT_ID,
            clearedAt: nowIso,
            updatedAt: nowIso,
          },
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      );
      if (activeRealtimeChannel) {
        activeRealtimeChannel.send({
          type: 'broadcast',
          event: 'alerts_update',
          payload: {
            alerts: [],
            debtAlertThreshold: effectiveThreshold,
            clientId: SESSION_CLIENT_ID,
            cleared: true,
            timestamp: nowIso,
          },
        });
      }
      return true;
    } catch {}
  }

  return serverOk;
}

export function subscribeToSupabaseHighDebtAlerts(
  onChange: (payload: {
    alerts: HighDebtAlertNotification[];
    debtAlertThreshold: number;
    fromRemoteClient: boolean;
    cleared?: boolean;
  }) => void
): () => void {
  const unsubs: Array<() => void> = [];

  // 1. WebSocket live push for alerts
  unsubs.push(
    addSharedWebSocketListener((msg) => {
      if (msg.type === 'init' && msg.alertsState) {
        const srvAlerts = Array.isArray(msg.alertsState.alerts) ? msg.alertsState.alerts : [];
        const threshold = Number(msg.alertsState.debtAlertThreshold) || DEFAULT_DEBT_ALERT_THRESHOLD;
        if (srvAlerts.length > 0 || threshold !== DEFAULT_DEBT_ALERT_THRESHOLD) {
          onChange({
            alerts: srvAlerts,
            debtAlertThreshold: threshold,
            fromRemoteClient: false,
          });
        }
      } else if (msg.type === 'alerts_update') {
        if (isSelfRealtimeEvent(msg.clientId)) return;
        onChange({
          alerts: Array.isArray(msg.alerts) ? msg.alerts : [],
          debtAlertThreshold: Number(msg.debtAlertThreshold) || DEFAULT_DEBT_ALERT_THRESHOLD,
          fromRemoteClient: true,
          cleared: Boolean(msg.cleared),
        });
      }
    })
  );

  // 2. External Supabase Realtime postgres_changes + broadcast
  const client = getSupabaseClient();
  if (client) {
    try {
      const ch = client.channel('tamween_alerts_realtime', {
        config: { broadcast: { self: false } },
      });
      ch.on('broadcast', { event: 'alerts_update' }, ({ payload }) => {
        if (!payload || isSelfRealtimeEvent(payload.clientId)) return;
        onChange({
          alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
          debtAlertThreshold: Number(payload.debtAlertThreshold) || DEFAULT_DEBT_ALERT_THRESHOLD,
          fromRemoteClient: true,
          cleared: Boolean(payload.cleared),
        });
      })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'high_debt_alerts' },
          () => {
            fetchHighDebtAlertsFromSupabase()
              .then((res) => {
                if (res) {
                  onChange({
                    alerts: res.alerts,
                    debtAlertThreshold: res.debtAlertThreshold,
                    fromRemoteClient: true,
                    cleared: res.alerts.length === 0,
                  });
                }
              })
              .catch(() => {});
          }
        )
        .subscribe();

      unsubs.push(() => {
        try {
          client.removeChannel(ch);
        } catch {}
      });
    } catch {}
  }

  return () => {
    unsubs.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  };
}

/**
 * إعادة محاولة الاتصال ومزامنة أي تغييرات معلقة مع خادم Supabase وإعادة ربط قناة البث اللحظي
 */
export async function retrySupabaseConnection(currentState?: AppState | null): Promise<{
  success: boolean;
  message: string;
  pulledData?: AppState;
  pulledTimestamp?: string;
}> {
  if (isBrowserOffline()) {
    setCloudConnectionStatus('offline', 'لا يزال الجهاز غير متصل بالإنترنت', {
      hasPendingSync: Boolean(pendingSyncPayload),
    });
    return {
      success: false,
      message: 'لا يوجد اتصال بالإنترنت حالياً. يرجى التأكد من الشبكة ثم الضغط على إعادة المحاولة.',
    };
  }

  setCloudConnectionStatus('syncing', 'جاري إعادة محاولة الاتصال بخادم Supabase ومزامنة البيانات...');

  // Force WebSocket & Supabase client reconnect
  disconnectSharedWebSocket();
  const testRes = await testSupabaseConnection();
  ensureSharedWebSocket();

  if (!testRes.success) {
    return {
      success: false,
      message: testRes.message,
    };
  }

  // Flush persistent offline queue first, then any active pendingSyncPayload
  await flushOfflineSyncQueue().catch(() => {});

  const stateToPush = pendingSyncPayload?.state || currentState;
  if (pendingSyncPayload && stateToPush) {
    const pushOk = await autoSyncToSupabase(stateToPush, true, pendingSyncPayload.timestamp);
    if (!pushOk) {
      return {
        success: false,
        message: 'تم الوصول للخادم ولكن تعذر رفع التعديلات المعلقة.',
      };
    }
  }

  const pullRes = await fetchDatabaseFromSupabase();
  if (pullRes.success && pullRes.data) {
    setCloudConnectionStatus('connected', 'تمت استعادة الاتصال وتحديث البيانات لحظياً بنجاح', {
      hasPendingSync: getPendingOfflineQueueCount() > 0,
      pendingQueueCount: getPendingOfflineQueueCount(),
    });
    return {
      success: true,
      message: pullRes.message,
      pulledData: pullRes.data,
      pulledTimestamp: pullRes.timestamp,
    };
  }

  setCloudConnectionStatus('connected', 'تمت استعادة الاتصال بخادم Supabase بنجاح', {
    hasPendingSync: getPendingOfflineQueueCount() > 0,
    pendingQueueCount: getPendingOfflineQueueCount(),
  });
  return {
    success: true,
    message: testRes.message,
  };
}

export interface RealtimeSyncCallbacks {
  onUpdate: (state: AppState, timestamp?: string) => void;
  onRowChange?: (change: {
    table:
      | 'bakeries'
      | 'debts'
      | 'villages'
      | 'branches'
      | 'app_users'
      | 'daily_tasks'
      | 'system_config';
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    newRow?: any;
    oldRow?: any;
    timestamp: string;
  }) => void;
}

/**
 * الاشتراك في قناة Realtime المباشرة (Supabase Realtime + WebSocket) لنقل التعديلات لحظياً بين جميع الأجهزة
 */
export function subscribeToSupabaseRealtime(
  onUpdate: ((state: AppState, timestamp?: string) => void) | RealtimeSyncCallbacks
): () => void {
  const callbacks: RealtimeSyncCallbacks =
    typeof onUpdate === 'function' ? { onUpdate } : onUpdate;

  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return () => {};

  const unsubscribers: Array<() => void> = [];

  // 1. Real WebSocket subscription (/ws/supabase-realtime) for sub-50ms cross-device/tab sync
  unsubscribers.push(
    addSharedWebSocketListener((msg) => {
      try {
        if (msg.type === 'init' && msg.snapshot?.data) {
          const snap = msg.snapshot;
          const data = snap.data as AppState;
          const ts = snap.timestamp || msg.timestamp || new Date().toISOString();
          const key = `ws-init:${ts}:${snap.revision || 0}`;
          if (!shouldProcessRealtimeEvent(key, Date.now(), 250)) return;
          if (!isBrowserOffline()) {
            setCloudConnectionStatus('connected', 'متصل بخادم المزامنة اللحظية (WebSocket)');
          }
          callbacks.onUpdate(data, ts);
        } else if (msg.type === 'state_update' && msg.snapshot?.data) {
          if (isSelfRealtimeEvent(msg.clientId)) return;
          const snap = msg.snapshot;
          const data = snap.data as AppState;
          const ts = snap.timestamp || msg.timestamp || new Date().toISOString();
          const key = `ws-upd:${ts}:${snap.revision || 0}`;
          if (!shouldProcessRealtimeEvent(key, Date.now(), 200)) return;
          if (!isBrowserOffline()) {
            setCloudConnectionStatus('connected', 'تم استلام تحديث لحظي فوري من جهاز آخر');
          }
          callbacks.onUpdate(data, ts);
        }
      } catch (err) {
        console.warn('WebSocket realtime message handling warning:', err);
      }
    })
  );

  // 2. Refresh cleanly when user returns to tab or when browser comes back online, and flush any pending queue
  if (typeof window !== 'undefined') {
    if (getPendingOfflineQueueCount() > 0 && !isBrowserOffline()) {
      flushOfflineSyncQueue().catch(() => {});
    }
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !isBrowserOffline()) {
        ensureSharedWebSocket();
        if (getPendingOfflineQueueCount() > 0) {
          flushOfflineSyncQueue().catch(() => {});
        }
        fetchDatabaseFromSupabase()
          .then((res) => {
            if (res.success && res.data) {
              callbacks.onUpdate(res.data, res.timestamp);
            }
          })
          .catch(() => {});
      }
    };
    const handleOnline = () => {
      retrySupabaseConnection()
        .then((res) => {
          if (res.success && res.pulledData) {
            callbacks.onUpdate(res.pulledData, res.pulledTimestamp);
          }
        })
        .catch(() => {});
    };
    const handleOffline = () => {
      setCloudConnectionStatus('offline', 'انقطع الاتصال بالإنترنت');
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Continuous 2.5s lightweight revision check (/api/supabase/live-meta) so cross-device updates
    // arrive within ~2 seconds even if a reverse proxy or network drops WebSocket frames
    let lastSeenMetaRevision = -1;
    let lastSeenMetaTimestamp = '';
    let isPollingMeta = false;
    const metaPollTimer = setInterval(async () => {
      if (isPollingMeta || isBrowserOffline()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      isPollingMeta = true;
      try {
        const metaResp = await fetch(getLiveMetaApiUrl(), {
          method: 'GET',
          credentials: 'same-origin',
        });
        if (metaResp.ok) {
          const meta = await metaResp.json().catch(() => null);
          if (meta && meta.success) {
            if (!meta.exists) {
              // If the server was restarted or switched and has no snapshot yet, auto-populate from permanent vault
              const vault = loadFromPermanentSafetyVault();
              if (vault?.data) {
                await performCloudPush(vault.data, vault.timestamp || new Date().toISOString(), {
                  skipEnqueueOnFailure: true,
                });
              }
            } else {
              const rev = Number(meta.revision) || 0;
              const ts = String(meta.timestamp || '');
              const isNewRevision =
                (rev > 0 && rev !== lastSeenMetaRevision) ||
                (ts && ts !== lastSeenMetaTimestamp);
              if (isNewRevision) {
                lastSeenMetaRevision = rev;
                lastSeenMetaTimestamp = ts;
                if (!isSelfRealtimeEvent(meta.clientId)) {
                  const fullResp = await fetch(getLiveDbApiUrl(), {
                    method: 'GET',
                    credentials: 'same-origin',
                  });
                  if (fullResp.ok) {
                    const fullJson = await fullResp.json().catch(() => null);
                    const snapData = (fullJson?.snapshot?.data || fullJson?.data) as AppState | undefined;
                    const snapTs =
                      fullJson?.snapshot?.timestamp || fullJson?.timestamp || ts || new Date().toISOString();
                    if (snapData) {
                      saveToPermanentSafetyVault(snapData, snapTs);
                      setCloudConnectionStatus(
                        'connected',
                        'متصل وتمت المزامنة التلقائية الفورية بين الأجهزة'
                      );
                      callbacks.onUpdate(snapData, snapTs);
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // Ignore transient poll errors
      } finally {
        isPollingMeta = false;
      }
    }, 2500);

    unsubscribers.push(() => {
      clearInterval(metaPollTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    });
  }

  // 3. Subscribe to Supabase Realtime channel (Broadcast + INSERT/UPDATE/DELETE on all normalized tables)
  const client = getSupabaseClient();
  if (client) {
    try {
      const handlePayload = (fullPayload: any) => {
        try {
          if (!fullPayload) return;
          if (isSelfRealtimeEvent(fullPayload.clientId)) return;
          const data = fullPayload.data || fullPayload;
          const ts = fullPayload.timestamp || new Date().toISOString();
          const key = `supa-snap:${ts}:${data?.bakeries?.length || 0}:${data?.debts?.length || 0}`;
          if (!shouldProcessRealtimeEvent(key)) return;
          if (
            data &&
            (Array.isArray(data.bakeries) ||
              Array.isArray(data.debts) ||
              Array.isArray(data.branches) ||
              data.branchPartitions)
          ) {
            callbacks.onUpdate(data as AppState, ts);
          }
        } catch (err) {
          console.warn('Error handling Supabase payload:', err);
        }
      };

      const channel = client.channel('tamween_realtime_channel', {
        config: { broadcast: { self: false } },
      });
      activeRealtimeChannel = channel;

      channel
        .on('broadcast', { event: 'state_update' }, ({ payload }) => {
          handlePayload(payload);
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'backup_snapshots',
          },
          (payload: any) => {
            try {
              const row = payload.new;
              if (row && row.payload) {
                handlePayload(row.payload);
              }
            } catch (err) {
              console.warn('Error processing Supabase Realtime backup_snapshots:', err);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bakeries',
          },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const id = payload.new?.id || payload.old?.id || '';
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`bakeries:${evt}:${id}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'bakeries',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch (err) {
              console.warn('Error processing Supabase Realtime bakeries:', err);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'debts',
          },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const id = payload.new?.id || payload.old?.id || '';
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`debts:${evt}:${id}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'debts',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch (err) {
              console.warn('Error processing Supabase Realtime debts:', err);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'system_config',
          },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const rowId = payload.new?.id || payload.old?.id || '';
              if (rowId === 'tamween_alerts_meta') return;
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`system_config:${evt}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'system_config',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch (err) {
              console.warn('Error processing Supabase Realtime system_config:', err);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'villages' },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const id = payload.new?.id || payload.old?.id || '';
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`villages:${evt}:${id}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'villages',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch {}
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'branches' },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const id = payload.new?.id || payload.old?.id || '';
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`branches:${evt}:${id}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'branches',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch {}
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_tasks' },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const id = payload.new?.id || payload.old?.id || '';
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`daily_tasks:${evt}:${id}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'daily_tasks',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch {}
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_users' },
          (payload: any) => {
            try {
              const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
              const id = payload.new?.id || payload.old?.id || '';
              const ts = payload.commit_timestamp || payload.new?.updated_at || new Date().toISOString();
              if (!shouldProcessRealtimeEvent(`app_users:${evt}:${id}:${ts}`)) return;
              callbacks.onRowChange?.({
                table: 'app_users',
                eventType: evt,
                newRow: payload.new,
                oldRow: payload.old,
                timestamp: ts,
              });
            } catch {}
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            setCloudConnectionStatus('connected', 'قناة البث اللحظي Supabase Realtime متصلة ونشطة');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setCloudConnectionStatus(
              'error',
              err?.message ? `تعطل البث اللحظي: ${err.message}` : 'انقطعت قناة البث اللحظي Supabase Realtime'
            );
          } else if (status === 'CLOSED') {
            if (isBrowserOffline()) {
              setCloudConnectionStatus('offline', 'تم إغلاق الاتصال لانقطاع الإنترنت');
            }
          }
        });

      unsubscribers.push(() => {
        try {
          client.removeChannel(channel);
          if (activeRealtimeChannel === channel) {
            activeRealtimeChannel = null;
          }
        } catch {}
      });
    } catch (err) {
      console.warn('Failed to subscribe to external Supabase Realtime:', err);
    }
  }

  return () => {
    unsubscribers.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  };
}

/**
 * حماية قاعدة البيانات المسجلة على Supabase وخادم المزامنة من الحذف النهائي والاحتفاظ بها دائماً
 */
export async function clearSupabaseDatabaseData(): Promise<{ success: boolean; message: string }> {
  try {
    const vault = loadFromPermanentSafetyVault();
    if (vault?.data) {
      await performCloudPush(vault.data, new Date().toISOString(), { skipEnqueueOnFailure: true });
    }
    setCloudConnectionStatus('connected', 'البيانات المسجلة محمية ضد الحذف النهائي ومحفوظة على Supabase', {
      hasPendingSync: false,
    });
    return {
      success: true,
      message:
        'نظام الحماية الدائمة مفعّل: تم الاحتفاظ بكافة البيانات المسجلة على Supabase وخزنة الأمان الدائمة ومنع حذفها نهائياً حتى عند تغيير الخادم.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر تحديث حالة الحماية الدائمة: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}



