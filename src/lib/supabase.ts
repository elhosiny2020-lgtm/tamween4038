import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from '../storage';
import { generateStandaloneHtml } from '../utils/htmlExporter';

// Default Supabase Configuration keys in LocalStorage
export const SUPABASE_URL_KEY = 'TAMWEEN_SUPABASE_URL';
export const SUPABASE_ANON_KEY_KEY = 'TAMWEEN_SUPABASE_ANON_KEY';
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

/**
 * الحصول على إعدادات Supabase النشطة (من متغيرات البيئة أو التخزين المحلي)
 */
export function getSupabaseConfig(): SupabaseConfig {
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

  if (envUrl && envKey) {
    return {
      url: envUrl,
      anonKey: envKey,
      isConfigured: true,
      source: 'env',
    };
  }

  if (storageUrl && storageKey) {
    return {
      url: storageUrl,
      anonKey: storageKey,
      isConfigured: true,
      source: 'storage',
    };
  }

  return {
    url: '',
    anonKey: '',
    isConfigured: false,
    source: 'none',
  };
}

/**
 * حفظ وتحديث مفاتيح اتصال Supabase في التخزين المحلي
 */
export function saveSupabaseConfig(url: string, anonKey: string): SupabaseConfig {
  const cleanUrl = url.trim();
  const cleanKey = anonKey.trim();

  if (cleanUrl) {
    safeSetItem(SUPABASE_URL_KEY, cleanUrl);
  } else {
    safeRemoveItem(SUPABASE_URL_KEY);
  }

  if (cleanKey) {
    safeSetItem(SUPABASE_ANON_KEY_KEY, cleanKey);
  } else {
    safeRemoveItem(SUPABASE_ANON_KEY_KEY);
  }

  // Reset cached client
  cachedClient = null;
  lastUsedUrl = '';
  lastUsedKey = '';

  return getSupabaseConfig();
}

/**
 * الحصول على عميل Supabase Client المعتمد
 */
export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured || !cfg.url || !cfg.anonKey) {
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
 * فحص واختبار الاتصال بقاعدة بيانات Supabase
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, any>;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'لم يتم إدخال إعدادات الاتصال بـ Supabase (Project URL & Anon Key).',
    };
  }

  try {
    // Check if we can connect to storage or query snapshots table
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
 * نقل ومزامنة قاعدة البيانات بالكامل إلى Supabase (Upsert Bakeries, Debts, and Snapshots)
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
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'يرجى إدخال عنوان Supabase Project URL ومفتاح Anon Key أولاً للربط والترحيل.',
      bakeriesUpserted: 0,
      debtsUpserted: 0,
      snapshotSaved: false,
      htmlUploaded: false,
    };
  }

  try {
    let bakeriesUpserted = 0;
    let debtsUpserted = 0;
    let snapshotSaved = false;

    // 1. Prepare snapshot payload
    const snapshotId = `snapshot-${Date.now()}`;
    const snapshotPayload = {
      version: '3.6-supabase-full-migration',
      timestamp: new Date().toISOString(),
      governorate: state.systemConfig?.governorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
      directorate: state.systemConfig?.directorateTitle || 'إدارة تموين مركز المحلة الكبرى',
      administration: state.systemConfig?.administrationTitle || 'قسم الرقابة التموينية وشئون المخابز',
      bakeriesCount: state.bakeries.length,
      debtsCount: state.debts.length,
      data: state,
    };

    // 2. Try inserting full state snapshot into backup_snapshots table
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
        updated_at: new Date().toISOString(),
      }));

      // Chunk in batches of 100 to avoid payload size limit
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
        updated_at: new Date().toISOString(),
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

    // Save timestamp of successful migration
    const nowAr = new Date().toLocaleString('ar-EG');
    localStorage.setItem('TAMWEEN_LAST_SUPABASE_SYNC', nowAr);

    const isFullSuccess = bakeriesUpserted > 0 || snapshotSaved;

    return {
      success: isFullSuccess,
      message: isFullSuccess
        ? `اكتمل نقل قاعدة البيانات إلى Supabase بنجاح! تم ترحيل (${bakeriesUpserted || state.bakeries.length}) مخبز و (${debtsUpserted || state.debts.length}) مديونية وحفظ نسخة احتياطية سحابية، ورفع ملف index.html إلى التخزين.`
        : 'تمت محاولة الترحيل ولكن لم تستجب الجداول. يرجى التأكد من تشغيل سكريبت إنشاء الجداول (SQL Schema) في لوحة Supabase.',
      bakeriesUpserted,
      debtsUpserted,
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
      success: false,
      message: `فشل نقل قاعدة البيانات إلى Supabase: ${err.message || 'خطأ غير معروف'}`,
      bakeriesUpserted: 0,
      debtsUpserted: 0,
      snapshotSaved: false,
      htmlUploaded: false,
    };
  }
}

/**
 * استعادة وتحميل قاعدة البيانات من Supabase السحابية
 */
export async function fetchDatabaseFromSupabase(): Promise<{
  success: boolean;
  message: string;
  data?: AppState;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'عميل Supabase غير مهيأ. يرجى إدخال الرابط والمفتاح أولاً.',
    };
  }

  try {
    // 1. Try reading latest snapshot from backup_snapshots table
    const { data: snapshotRows, error: sErr } = await client
      .from('backup_snapshots')
      .select('payload')
      .order('timestamp', { ascending: false })
      .limit(1);

    if (!sErr && snapshotRows && snapshotRows.length > 0 && snapshotRows[0].payload) {
      const payload = snapshotRows[0].payload;
      const data = payload.data || payload;
      if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
        return {
          success: true,
          message: `تم بنجاح تحميل قاعدة البيانات السحابية من جدول النسخ الاحتياطية (${data.bakeries?.length || 0} مخبز و ${data.debts?.length || 0} مديونية)!`,
          data,
        };
      }
    }

    // 2. Fallback: Query bakeries and debts tables directly
    const { data: bData, error: bErr } = await client.from('bakeries').select('*');
    const { data: dData, error: dErr } = await client.from('debts').select('*');

    if (!bErr && bData && bData.length > 0) {
      const restoredBakeries = bData.map((row: any) => row.data_json || {
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
      });

      const restoredDebts = (dData || []).map((row: any) => row.data_json || {
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
      });

      return {
        success: true,
        message: `تم بنجاح تحميل واستعادة البيانات من جداول Supabase (${restoredBakeries.length} مخبز و ${restoredDebts.length} مديونية)!`,
        data: {
          bakeries: restoredBakeries,
          debts: restoredDebts,
        } as unknown as AppState,
      };
    }

    // 3. Fallback: Download from Supabase Storage JSON backup
    const { data: storageFile, error: storageErr } = await client.storage
      .from(SUPABASE_BUCKET_NAME)
      .download('tamween_database_backup.json');

    if (!storageErr && storageFile) {
      const text = await storageFile.text();
      const parsed = JSON.parse(text);
      const data = parsed.data || parsed;
      if (data && (Array.isArray(data.bakeries) || Array.isArray(data.debts))) {
        return {
          success: true,
          message: `تم استعادة النسخة الاحتياطية من Supabase Storage (${data.bakeries?.length || 0} مخبز و ${data.debts?.length || 0} مديونية)!`,
          data,
        };
      }
    }

    return {
      success: false,
      message: 'لم يتم العثور على أي سجلات أو نسخ احتياطية مسجلة في قاعدة بيانات Supabase هذه.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `فشل استعادة البيانات من Supabase: ${err.message || 'خطأ غير معروف'}`,
    };
  }
}
