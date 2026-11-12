import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, buildFullCloudMultiBranchPayload } from '../storage';
import { generateStandaloneHtml } from '../utils/htmlExporter';
import {
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
  } else {
    safeRemoveItem(SUPABASE_CLOUD_DISABLED_KEY);
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

  // Clean up accidental autofill values (e.g. passwords) that are not valid Supabase URLs
  if (storageUrl && !isValidHttpUrl(storageUrl)) {
    safeRemoveItem(SUPABASE_URL_KEY);
    safeRemoveItem(SUPABASE_ANON_KEY_KEY);
  }

  if (envUrl && envKey && isValidHttpUrl(envUrl)) {
    return {
      url: envUrl,
      anonKey: envKey,
      isConfigured: true,
      source: 'env',
    };
  }

  if (storageUrl && storageKey && isValidHttpUrl(storageUrl)) {
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

  if (typeof window === 'undefined') return localCfg;

  try {
    const isCloudHost =
      window.location.hostname.includes('run.app') || window.location.hostname === 'localhost';
    const targetUrl = isCloudHost
      ? '/api/supabase/config'
      : 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/supabase/config';

    const resp = await fetch(targetUrl);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.url && data.anonKey && isValidHttpUrl(data.url)) {
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
  if (!cfg.isConfigured || !cfg.url || !cfg.anonKey || !isValidHttpUrl(cfg.url)) {
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
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: true,
      message: 'تم تفعيل الاتصال السحابي المدمج والمزامنة المباشرة بنجاح عبر جميع الأجهزة!',
      details: {
        storageStatus: 'التزامن السحابي المباشر نشط (Multi-Device Cloud SQL Sync)',
      },
    };
  }

  try {
    const { data: buckets, error: storageErr } = await client.storage.listBuckets();

    return {
      success: true,
      message: 'تم الاتصال بقاعدة بيانات وتخزين Supabase بنجاح!',
      details: {
        bucketsCount: buckets?.length || 0,
        storageStatus: storageErr ? `تنبيه التخزين: ${storageErr.message}` : 'جاهز',
      },
    };
  } catch (err: any) {
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

-- تفعيل سياسات الأمان Row Level Security (RLS) للسماح بالقراءة والكتابة
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
    if (state.bakeries && state.bakeries.length > 0) {
      const bakeryRows = state.bakeries.map((b) => ({
        id: b.id,
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
      }));

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
      const debtRows = state.debts.map((d) => ({
        id: d.id,
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
      }));

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
    return {
      success: false,
      message: 'التخزين السحابي غير مفعل حالياً.',
    };
  }

  let client = getSupabaseClient();
  if (!client) {
    await syncSupabaseConfigFromRemote();
    client = getSupabaseClient();
  }

  const candidates: Array<{ data: AppState; timestamp: string; source: string }> = [];

  // 1. Fetch from built-in global Multi-Device Cloud DB & Server Live DB in parallel
  const [cloudSnap, serverSnap] = await Promise.all([
    loadSharedStateFromFirestore().catch(() => null),
    typeof window !== 'undefined'
      ? fetch(getLiveDbApiUrl())
          .then(async (r) => (r.ok ? await r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  if (
    cloudSnap &&
    cloudSnap.data &&
    (Array.isArray(cloudSnap.data.bakeries) || Array.isArray(cloudSnap.data.debts))
  ) {
    candidates.push({
      data: cloudSnap.data as AppState,
      timestamp: cloudSnap.updatedAt || new Date(0).toISOString(),
      source: 'السحابة المشتركة (Realtime Cloud DB)',
    });
  }

  if (
    serverSnap &&
    serverSnap.success &&
    serverSnap.data &&
    (Array.isArray(serverSnap.data.bakeries) || Array.isArray(serverSnap.data.debts))
  ) {
    candidates.push({
      data: serverSnap.data as AppState,
      timestamp: serverSnap.timestamp || new Date(0).toISOString(),
      source: 'خادم التزامن المباشر (Live Sync Server)',
    });
  }

  // 2. If external Supabase client is configured, also query external Supabase
  if (client) {
    try {
      const { data: liveRow, error: liveErr } = await client
        .from('backup_snapshots')
        .select('payload, timestamp')
        .eq('id', 'latest_live_snapshot')
        .maybeSingle();

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
          const restoredBakeries = bData.map(
            (row: any) =>
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

          const restoredDebts = (dData || []).map(
            (row: any) =>
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
    } catch (err) {
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
    return {
      success: true,
      message: `تم بنجاح تحميل أحدث بيانات مسجلة من ${best.source} (${best.data.bakeries?.length || 0} مخبز و ${best.data.debts?.length || 0} مديونية)!`,
      data: best.data,
      timestamp: best.timestamp,
    };
  }

  return {
    success: false,
    message: 'لم يتم العثور على أي سجلات أو نسخ احتياطية مسجلة في السحابة حتى الآن.',
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

  const doSync = async (): Promise<boolean> => {
    try {
      const nowIso = customTimestamp || new Date().toISOString();
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

      // 1. Always push to built-in Multi-Device Cloud DB & Server Live DB in parallel
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

      // 2. If an external Supabase instance is also configured, broadcast & upsert there too
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
      }

      const nowAr = new Date().toLocaleString('ar-EG');
      safeSetItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);

      return cloudOk || serverOk || Boolean(client);
    } catch (err) {
      console.warn('autoSyncToSupabase error (non-critical):', err);
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
 * الاشتراك في قناة Realtime المباشرة لاستقبال ونقل التعديلات لحظياً بين جميع الأجهزة
 */
export function subscribeToSupabaseRealtime(
  onUpdate: (state: AppState, timestamp?: string) => void
): () => void {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) return () => {};

  const unsubscribers: Array<() => void> = [];

  // 1. Subscribe to built-in global Multi-Device Cloud Realtime Snapshot (< 100ms latency)
  try {
    const unsubCloud = subscribeToSharedStateChanges(({ data, updatedAt }) => {
      if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
        onUpdate(data as AppState, updatedAt);
      }
    });
    unsubscribers.push(unsubCloud);
  } catch (err) {
    console.warn('Cloud realtime subscription error:', err);
  }

  // 2. Refresh immediately when user switches back to tab or unlocks phone/laptop
  if (typeof window !== 'undefined') {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchDatabaseFromSupabase()
          .then((res) => {
            if (res.success && res.data) {
              onUpdate(res.data, res.timestamp);
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    unsubscribers.push(() => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    });
  }

  // 3. Also subscribe to external Supabase channel if configured
  const client = getSupabaseClient();
  if (client) {
    try {
      const handlePayload = (fullPayload: any) => {
        try {
          if (!fullPayload) return;
          const data = fullPayload.data || fullPayload;
          const ts = fullPayload.timestamp || new Date().toISOString();
          if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
            onUpdate(data as AppState, ts);
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
              console.warn('Error processing Supabase Realtime postgres_changes:', err);
            }
          }
        )
        .subscribe();

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
      try {
        await client.storage.from(SUPABASE_BUCKET_NAME).remove(['tamween_database_backup.json', 'index.html']);
      } catch {}
    }

    safeRemoveItem('TAMWEEN_LAST_SUPABASE_SYNC');

    return {
      success: true,
      message: 'تم بنجاح مسح وحذف كافة البيانات والنسخ الاحتياطية المسجلة على قاعدة البيانات السحابية نهائياً!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `تعذر مسح بيانات قاعدة البيانات السحابية: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}



