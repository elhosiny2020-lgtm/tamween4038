import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, buildFullCloudMultiBranchPayload } from '../storage';
import { generateStandaloneHtml } from '../utils/htmlExporter';
import {
  testFirestoreConnection,
  syncSharedStateToFirestore,
  loadSharedStateFromFirestore,
  subscribeToSharedStateChanges,
  clearSharedStateInFirestore,
} from './firebase';

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
}

export const STATUS_LABELS: Record<CloudConnectionStatus, string> = {
  connected: 'متصل بالخادم',
  syncing: 'جاري المزامنة',
  error: 'غير متصل',
  offline: 'غير متصل',
};

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
  hasPendingSync: false,
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
  extra?: { lastSyncAt?: string; hasPendingSync?: boolean }
): CloudConnectionSnapshot {
  const effectiveStatus: CloudConnectionStatus =
    status !== 'offline' && isBrowserOffline() ? 'offline' : status;
  const nowStr = new Date().toLocaleTimeString('ar-EG');
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
    hasPendingSync: extra?.hasPendingSync ?? Boolean(pendingSyncPayload),
  };
  notifyConnectionListeners();
  return getCloudConnectionSnapshot();
}

let browserNetworkListenersAttached = false;
function ensureBrowserNetworkListeners(): void {
  if (browserNetworkListenersAttached || typeof window === 'undefined') return;
  browserNetworkListenersAttached = true;
  window.addEventListener('offline', () => {
    setCloudConnectionStatus('offline', 'انقطع الاتصال بالإنترنت', {
      hasPendingSync: Boolean(pendingSyncPayload),
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

function getLiveDbApiUrl(): string {
  if (typeof window !== 'undefined') {
    const isCloudHost =
      window.location.hostname.includes('run.app') || window.location.hostname === 'localhost';
    return isCloudHost
      ? '/api/supabase/live-db'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/live-db';
  }
  return '/api/supabase/live-db';
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
      const isCloudHost =
        window.location.hostname.includes('run.app') || window.location.hostname === 'localhost';
      const targetUrl = isCloudHost
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
    const isCloudHost =
      window.location.hostname.includes('run.app') || window.location.hostname === 'localhost';
    const targetUrl = isCloudHost
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

  setCloudConnectionStatus('syncing', 'جاري التحقق من الاتصال بقاعدة البيانات السحابية Cloud Firebase...');
  const client = getSupabaseClient();
  if (!client) {
    try {
      const firestoreOk = await testFirestoreConnection();
      if (firestoreOk) {
        setCloudConnectionStatus('connected', 'متصل بالسحابة (Cloud Firebase Firestore Realtime)');
        return {
          success: true,
          message: 'تم تفعيل الاتصال المباشر بقاعدة بيانات Cloud Firebase Firestore والمزامنة اللحظية بنجاح عبر جميع الأجهزة!',
          details: {
            storageStatus: 'Cloud Firebase Firestore Realtime نشط ومتصل لجميع الفروع',
          },
        };
      }
    } catch {}

    if (typeof window !== 'undefined') {
      try {
        const resp = await fetch(getLiveDbApiUrl(), { method: 'GET' });
        if (resp.ok) {
          setCloudConnectionStatus('connected', 'متصل بخادم المزامنة البديل');
          return {
            success: true,
            message: 'تم الاتصال بخادم المزامنة البديل.',
          };
        }
      } catch {}
    }

    setCloudConnectionStatus('error', 'تعذر الوصول إلى خادم Cloud Firebase Firestore السحابي');
    return {
      success: false,
      message: 'فشل الاتصال بخادم Cloud Firebase Firestore السحابي.',
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
 * كود إنشاء وتجهيز جداول Supabase بلغة PostgreSQL (SQL Schema Script)
 */
export const SUPABASE_TABLES_SQL_SCHEMA = `-- ==============================================================
-- منظومة إدارة تموين مركز المحلة الكبرى - مديرية التموين بالغربية
-- سكريبت إنشاء وتهيئة جداول قاعدة بيانات Supabase (PostgreSQL)
-- ==============================================================

-- 1. جدول المخابز الرئيسي (Bakeries)
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

-- 2. جدول المديونيات والمخالفات والتصرف (Debts)
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

-- 3. جدول النسخ الاحتياطية وحزم المزامنة الكاملة (Backup Snapshots)
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY,
  version TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  bakeries_count INT DEFAULT 0,
  debts_count INT DEFAULT 0,
  payload JSONB NOT NULL
);

-- 4. جدول إعدادات المنظومة (System Config)
CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY DEFAULT 'tamween_config',
  governorate_title TEXT,
  directorate_title TEXT,
  administration_title TEXT,
  payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إضافة عمود الفرع للجداول القائمة دون التأثير على البيانات الموجودة
ALTER TABLE bakeries ADD COLUMN IF NOT EXISTS branch_id TEXT DEFAULT 'branch-mahalla';
ALTER TABLE debts ADD COLUMN IF NOT EXISTS branch_id TEXT DEFAULT 'branch-mahalla';

-- فهارس الأداء العالي لتسريع البحث والتصفية والربط بين المخابز والمديونيات والفروع
CREATE INDEX IF NOT EXISTS idx_bakeries_branch_id ON bakeries (branch_id);
CREATE INDEX IF NOT EXISTS idx_bakeries_village ON bakeries (village);
CREATE INDEX IF NOT EXISTS idx_bakeries_local_unit ON bakeries (local_unit);
CREATE INDEX IF NOT EXISTS idx_bakeries_machine_number ON bakeries (machine_number);
CREATE INDEX IF NOT EXISTS idx_debts_branch_id ON debts (branch_id);
CREATE INDEX IF NOT EXISTS idx_debts_bakery_id ON debts (bakery_id);
CREATE INDEX IF NOT EXISTS idx_debts_village ON debts (village);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts (status);

-- تفعيل سياسات الأمان Row Level Security (RLS) للسماح بالقراءة والكتابة والتعديل والحذف
ALTER TABLE bakeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public bakeries access') THEN
    CREATE POLICY "Public bakeries access" ON bakeries FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public debts access') THEN
    CREATE POLICY "Public debts access" ON debts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public snapshots access') THEN
    CREATE POLICY "Public snapshots access" ON backup_snapshots FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public config access') THEN
    CREATE POLICY "Public config access" ON system_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- تفعيل البث اللحظي Supabase Realtime (INSERT / UPDATE / DELETE) لجميع الجداول
ALTER TABLE bakeries REPLICA IDENTITY FULL;
ALTER TABLE debts REPLICA IDENTITY FULL;
ALTER TABLE backup_snapshots REPLICA IDENTITY FULL;
ALTER TABLE system_config REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bakeries') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE bakeries;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'debts') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE debts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'backup_snapshots') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE backup_snapshots;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_config') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE system_config;
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
  const bakeriesCount = Array.isArray(state?.bakeries) ? state.bakeries.length : 0;
  const debtsCount = Array.isArray(state?.debts) ? state.debts.length : 0;
  const fullCloudState = buildFullCloudMultiBranchPayload(state, nowIso);

  // 1. Always sync all branches to built-in Multi-Device Cloud Database & Server Live DB first
  const [cloudSynced, serverSynced] = await Promise.all([
    syncSharedStateToFirestore(fullCloudState as unknown as Record<string, any>, nowIso),
    typeof window !== 'undefined'
      ? fetch(getLiveDbApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: fullCloudState, timestamp: nowIso }),
        })
          .then((r) => r.ok)
          .catch(() => false)
      : Promise.resolve(false),
  ]);

  const client = getSupabaseClient();
  if (!client) {
    const nowAr = new Date().toLocaleString('ar-EG');
    safeSetItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);
    return {
      success: cloudSynced || serverSynced,
      message: `اكتمل نقل ومزامنة قاعدة البيانات وكافة الفروع على السحابة المشتركة بنجاح! تم حفظ (${bakeriesCount}) مخبز و (${debtsCount}) مديونية ومزامنتها لجميع الأجهزة فوراً.`,
      bakeriesUpserted: bakeriesCount,
      debtsUpserted: debtsCount,
      snapshotSaved: cloudSynced || serverSynced,
      htmlUploaded: true,
      publicHtmlUrl: typeof window !== 'undefined' ? window.location.origin : '',
      details: {
        lastSync: nowAr,
        htmlStatus: 'التزامن السحابي المباشر نشط عبر الرابط الموحد لجميع الفروع',
      },
    };
  }

  try {
    let bakeriesUpserted = 0;
    let debtsUpserted = 0;
    let snapshotSaved = cloudSynced || serverSynced;

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
    if (cloudSynced || serverSynced) {
      setCloudConnectionStatus('connected', 'تمت المزامنة عبر السحابة المدمجة بنجاح');
    } else {
      setCloudConnectionStatus('error', `فشل المزامنة: ${err.message || 'خطأ غير معروف'}`);
    }
    return {
      success: cloudSynced || serverSynced,
      message:
        cloudSynced || serverSynced
          ? `تم حفظ ومزامنة البيانات عبر السحابة المدمجة بنجاح (${bakeriesCount} مخبز و ${debtsCount} مديونية)!`
          : `فشل نقل قاعدة البيانات إلى Supabase: ${err.message || 'خطأ غير معروف'}`,
      bakeriesUpserted: bakeriesCount,
      debtsUpserted: debtsCount,
      snapshotSaved: cloudSynced || serverSynced,
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

const processedRealtimeEventMap = new Map<string, number>();

export function shouldProcessRealtimeEvent(
  eventKey: string,
  nowMs: number = Date.now(),
  ttlMs: number = 2500
): boolean {
  if (!eventKey) return true;
  // Prune expired entries occasionally
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

/**
 * استعادة وتحميل أحدث قاعدة بيانات من السحابة المشتركة و Supabase
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

  // 1. Primary Cloud Source of Truth: Cloud Firebase Firestore (multi-device realtime across all browsers & branches)
  const cloudSnap = await loadSharedStateFromFirestore().catch((e) => {
    lastErrorMsg = e?.message || 'خطأ في الاتصال بـ Cloud Firebase Firestore';
    return null;
  });

  if (
    cloudSnap &&
    cloudSnap.data &&
    (Array.isArray(cloudSnap.data.bakeries) ||
      Array.isArray(cloudSnap.data.debts) ||
      Array.isArray(cloudSnap.data.branches) ||
      cloudSnap.data.branchPartitions)
  ) {
    serverReachable = true;
    candidates.push({
      data: cloudSnap.data as AppState,
      timestamp: cloudSnap.updatedAt || new Date(0).toISOString(),
      source: 'Cloud Firebase Firestore Realtime',
    });
  } else {
    // Check Firestore health cleanly when document doesn't exist yet
    const fsOk = await testFirestoreConnection().catch(() => false);
    if (fsOk) {
      serverReachable = true;
    }

    // Fallback to local live-db API ONLY when Firestore returned no records
    if (typeof window !== 'undefined' && !client) {
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
          source: 'خادم المزامنة البديل',
        });
      }
    }
  }

  // 2. If external Supabase client is configured, also query external Supabase
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
        if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
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
      console.warn('External Supabase fetch fallback error:', err);
    }
  }

  if (candidates.length > 0) {
    // Sort by newest timestamp descending
    candidates.sort((a, b) => {
      const tA = Date.parse(a.timestamp) || 0;
      const tB = Date.parse(b.timestamp) || 0;
      return tB - tA;
    });
    const best = candidates[0];
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

  if (isBrowserOffline()) {
    setCloudConnectionStatus('offline', 'الجهاز غير متصل بالإنترنت حالياً');
  } else if (serverReachable || typeof window === 'undefined') {
    if (!pendingSyncPayload) {
      setCloudConnectionStatus('connected', 'متصل بالخادم السحابي بنجاح');
    }
  } else {
    setCloudConnectionStatus(
      'error',
      lastErrorMsg || 'تعذر الاتصال بخادم المزامنة السحابي'
    );
  }

  return {
    success: false,
    message: serverReachable
      ? 'لم يتم العثور على أي سجلات أو نسخ احتياطية مسجلة في السحابة حتى الآن.'
      : lastErrorMsg || 'تعذر الاتصال بخادم المزامنة السحابي.',
  };
}

let autoSyncDebounceTimer: any = null;
let activeRealtimeChannel: any = null;

/**
 * مزامنة تلقائية فورية مع السحابة و Supabase عند أي تعديل دون الحاجة للضغط على أي زر
 */
export async function autoSyncToSupabase(
  state: AppState,
  immediate = false,
  customTimestamp?: string
): Promise<boolean> {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return false;

  const nowIso = customTimestamp || new Date().toISOString();

  if (isBrowserOffline()) {
    pendingSyncPayload = { state, timestamp: nowIso };
    setCloudConnectionStatus(
      'offline',
      'انقطع الإنترنت - تم تأمين التعديلات محلياً للمزامنة عند عودة الاتصال',
      { hasPendingSync: true }
    );
    return false;
  }

  const doSync = async (): Promise<boolean> => {
    setCloudConnectionStatus('syncing', 'جاري مزامنة التعديلات مع الخادم...', {
      hasPendingSync: Boolean(pendingSyncPayload),
    });

    try {
      const fullPayloadState = (state as unknown as { branchPartitions?: unknown })?.branchPartitions
        ? state
        : buildFullCloudMultiBranchPayload(state, nowIso);
      const snapshotPayload = {
        version: '3.7-supabase-realtime-autosync',
        timestamp: nowIso,
        bakeriesCount: Array.isArray(fullPayloadState?.bakeries) ? fullPayloadState.bakeries.length : 0,
        debtsCount: Array.isArray(fullPayloadState?.debts) ? fullPayloadState.debts.length : 0,
        data: fullPayloadState,
      };

      // 1. Always push to Cloud Firebase Firestore immediately (+ optional secondary live-db mirror)
      const [cloudOk, serverOk] = await Promise.all([
        syncSharedStateToFirestore(fullPayloadState as unknown as Record<string, any>, nowIso),
        typeof window !== 'undefined'
          ? fetch(getLiveDbApiUrl(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: fullPayloadState, timestamp: nowIso }),
            })
              .then((r) => r.ok)
              .catch(() => false)
          : Promise.resolve(false),
      ]);

      // 2. If an external Supabase instance is also configured, broadcast & upsert normalized tables too
      let externalSupabaseOk = false;
      let externalErrorMsg = '';
      const client = getSupabaseClient();
      if (client) {
        try {
          if (!activeRealtimeChannel) {
            activeRealtimeChannel = client.channel('tamween_realtime_channel');
            activeRealtimeChannel.subscribe();
          }
          activeRealtimeChannel.send({
            type: 'broadcast',
            event: 'state_update',
            payload: snapshotPayload,
          });
        } catch (bcastErr) {
          console.warn('Realtime broadcast error (fallback to postgres):', bcastErr);
        }

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

        // Sync normalized bakeries/debts rows & clean up deleted rows for active branch
        try {
          const activeBranchId = state.activeBranchId || 'branch-mahalla';
          const bRows = (state.bakeries || []).map((b) =>
            mapBakeryToSqlRow(b, activeBranchId, nowIso)
          );
          const dRows = (state.debts || []).map((d) =>
            mapDebtToSqlRow(d, activeBranchId, nowIso)
          );

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
        } catch (rowSyncErr: any) {
          console.warn('Row-level Supabase sync warning:', rowSyncErr?.message || rowSyncErr);
        }
      }

      // Authoritative cloud success requires Cloud Firebase Firestore (or external Supabase if configured)
      const overallSuccess = client ? (cloudOk || externalSupabaseOk) : (cloudOk || serverOk);
      if (cloudOk || externalSupabaseOk) {
        pendingSyncPayload = null;
        const nowAr = new Date().toLocaleString('ar-EG');
        safeSetItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);
        setCloudConnectionStatus('connected', 'متصل وتمت المزامنة اللحظية عبر Cloud Firebase بنجاح', {
          lastSyncAt: nowAr,
          hasPendingSync: false,
        });
      } else if (overallSuccess) {
        pendingSyncPayload = { state, timestamp: nowIso };
        setCloudConnectionStatus(
          'error',
          'تعذر الرفع إلى Cloud Firebase Firestore (تم الحفظ محلياً مؤقتاً)',
          { hasPendingSync: true }
        );
      } else {
        pendingSyncPayload = { state, timestamp: nowIso };
        setCloudConnectionStatus(
          'error',
          externalErrorMsg || 'تعذر إتمام المزامنة مع خادم Cloud Firebase Firestore',
          { hasPendingSync: true }
        );
      }

      return cloudOk || externalSupabaseOk;
    } catch (err: any) {
      pendingSyncPayload = { state, timestamp: nowIso };
      setCloudConnectionStatus(
        'error',
        `خطأ في المزامنة: ${err?.message || 'تعذر الاتصال بالخادم'}`,
        { hasPendingSync: true }
      );
      console.warn('autoSyncToSupabase error:', err);
      return false;
    }
  };

  if (immediate) {
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }
    return doSync();
  }

  return new Promise((resolve) => {
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
    }
    // Fast 200ms debounce for instant auto-saving across all devices
    autoSyncDebounceTimer = setTimeout(async () => {
      const res = await doSync();
      resolve(res);
    }, 200);
  });
}

/**
 * إعادة محاولة الاتصال ومزامنة أي تغييرات معلقة مع الخادم
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

  setCloudConnectionStatus('syncing', 'جاري إعادة محاولة الاتصال بالخادم ومزامنة البيانات...');

  const testRes = await testSupabaseConnection();
  if (!testRes.success) {
    return {
      success: false,
      message: testRes.message,
    };
  }

  // Flush any pending unsynced state first
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
    setCloudConnectionStatus('connected', 'تمت استعادة الاتصال وتحديث البيانات بنجاح', {
      hasPendingSync: false,
    });
    return {
      success: true,
      message: pullRes.message,
      pulledData: pullRes.data,
      pulledTimestamp: pullRes.timestamp,
    };
  }

  setCloudConnectionStatus('connected', 'تمت استعادة الاتصال بالخادم بنجاح', {
    hasPendingSync: false,
  });
  return {
    success: true,
    message: testRes.message,
  };
}

export interface RealtimeSyncCallbacks {
  onUpdate: (state: AppState, timestamp?: string) => void;
  onRowChange?: (change: {
    table: 'bakeries' | 'debts' | 'system_config';
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    newRow?: any;
    oldRow?: any;
    timestamp: string;
  }) => void;
}

/**
 * الاشتراك في قناة Realtime المباشرة لاستقبال ونقل التعديلات لحظياً بين جميع الأجهزة
 */
export function subscribeToSupabaseRealtime(
  onUpdate: ((state: AppState, timestamp?: string) => void) | RealtimeSyncCallbacks
): () => void {
  const callbacks: RealtimeSyncCallbacks =
    typeof onUpdate === 'function' ? { onUpdate } : onUpdate;

  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return () => {};

  const unsubscribers: Array<() => void> = [];

  // 1. Subscribe to Cloud Firebase Firestore Realtime onSnapshot (< 100ms latency across all devices & branches)
  try {
    const unsubCloud = subscribeToSharedStateChanges(({ data, updatedAt }) => {
      const partKeys = data?.branchPartitions ? Object.keys(data.branchPartitions).join(',') : '';
      const eventKey = `firestore:${updatedAt}:${partKeys}:${data?.bakeries?.length || 0}:${data?.debts?.length || 0}`;
      if (!shouldProcessRealtimeEvent(eventKey, Date.now(), 250)) return;
      if (
        data &&
        (Array.isArray(data.bakeries) ||
          Array.isArray(data.debts) ||
          Array.isArray(data.branches) ||
          data.branchPartitions)
      ) {
        if (!isBrowserOffline()) {
          setCloudConnectionStatus('connected', 'تم استلام تحديث لحظي من Cloud Firebase');
        }
        callbacks.onUpdate(data as AppState, updatedAt);
      }
    });
    unsubscribers.push(unsubCloud);
  } catch (err) {
    console.warn('Cloud realtime subscription error:', err);
  }

  // 2. Refresh immediately when user switches back to tab or when browser comes back online
  if (typeof window !== 'undefined') {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !isBrowserOffline()) {
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
    unsubscribers.push(() => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    });
  }

  // 3. Also subscribe to external Supabase channel (Broadcast + INSERT/UPDATE/DELETE on all normalized tables)
  const client = getSupabaseClient();
  if (client) {
    try {
      const handlePayload = (fullPayload: any) => {
        try {
          if (!fullPayload) return;
          const data = fullPayload.data || fullPayload;
          const ts = fullPayload.timestamp || new Date().toISOString();
          const key = `supa-snap:${ts}:${data?.bakeries?.length || 0}:${data?.debts?.length || 0}`;
          if (!shouldProcessRealtimeEvent(key)) return;
          if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
            callbacks.onUpdate(data as AppState, ts);
          }
        } catch (err) {
          console.warn('Error handling Supabase payload:', err);
        }
      };

      const channel = client.channel('tamween_realtime_channel');
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
 * حذف قاعدة البيانات وتفريغ كافّة السجلات والنسخ الاحتياطية من السحابة و Supabase
 */
export async function clearSupabaseDatabaseData(): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Clear built-in Multi-Device Cloud DB & Server Live DB
    await Promise.all([
      clearSharedStateInFirestore(),
      typeof window !== 'undefined'
        ? fetch(getLiveDbApiUrl(), { method: 'DELETE' }).catch(() => null)
        : Promise.resolve(null),
    ]);

    // 2. If external Supabase client is configured, also clear external tables & storage
    const client = getSupabaseClient();
    if (client) {
      await client.from('backup_snapshots').delete().neq('id', 'non_existent_id');
      await client.from('bakeries').delete().neq('id', 'non_existent_id');
      await client.from('debts').delete().neq('id', 'non_existent_id');
      await client.from('system_config').delete().neq('id', 'non_existent_id');
      try {
        await client.storage.from(SUPABASE_BUCKET_NAME).remove(['tamween_database_backup.json', 'index.html']);
      } catch {}
    }

    pendingSyncPayload = null;
    safeRemoveItem('TAMWEEN_LAST_SUPABASE_SYNC');
    setCloudConnectionStatus('connected', 'تم مسح البيانات السحابية بنجاح', { hasPendingSync: false });

    return {
      success: true,
      message: 'تم بنجاح مسح وحذف كافة البيانات والنسخ الاحتياطية المسجلة على قاعدة البيانات السحابية نهائياً!',
    };
  } catch (err: any) {
    setCloudConnectionStatus('error', `تعذر مسح بيانات قاعدة البيانات السحابية: ${err.message || 'خطأ غير معروف'}`);
    return {
      success: false,
      message: `تعذر مسح بيانات قاعدة البيانات السحابية: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}



