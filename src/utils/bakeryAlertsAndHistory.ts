import type { Bakery, BakeryActivityLogItem } from '../types';

export interface LowFlourQuotaBakeryAlert {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  actualQuota: number;
  insuranceQuota: number;
  minThresholdSacks: number;
  deficitSacks: number;
  activityStatus: string;
}

export interface SearchableBakeryChangeEntry {
  id: string;
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  timestamp: string;
  isoDate: string; // YYYY-MM-DD for exact & range date filtering
  username: string;
  userFullName: string;
  userRole: string;
  action: string;
  details: string;
}

const STOPPED_OR_CANCELLED_PATTERN = /ملغ|متوقف كلي|مغلق نهائ/i;

/**
 * Detects active bakeries whose daily actual flour quota (in sacks / شكائر)
 * has dropped strictly below the configured manager threshold.
 */
export function findLowFlourQuotaBakeries(
  bakeries: Bakery[],
  minSacksThreshold: number
): LowFlourQuotaBakeryAlert[] {
  const threshold = Number(minSacksThreshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return [];

  const alerts: LowFlourQuotaBakeryAlert[] = [];

  for (const b of bakeries || []) {
    const status = String(b.activityStatus || '').trim();
    if (STOPPED_OR_CANCELLED_PATTERN.test(status)) continue;

    const actual = Number(b.actualQuota ?? 0);
    if (!Number.isFinite(actual)) continue;

    if (actual < threshold) {
      alerts.push({
        bakeryId: b.id,
        bakeryOwnerName: b.bakeryOwnerName || 'مخبز بدون اسم',
        machineNumber: b.machineNumber || '—',
        village: b.village || 'غير محدد',
        localUnit: b.localUnit || 'غير محدد',
        actualQuota: Number(actual.toFixed(2)),
        insuranceQuota: Number((Number(b.insuranceQuota) || 0).toFixed(2)),
        minThresholdSacks: threshold,
        deficitSacks: Number(Math.max(0, threshold - actual).toFixed(2)),
        activityStatus: status || 'يعمل',
      });
    }
  }

  return alerts.sort((a, b) => a.actualQuota - b.actualQuota);
}

/**
 * Normalizes any ISO or Arabic/localized date string into YYYY-MM-DD for reliable date filtering.
 */
export function extractIsoDateFromTimestamp(timestamp: string | undefined | null): string {
  const raw = String(timestamp || '').trim();
  if (!raw) return '';

  // Already starts with YYYY-MM-DD
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY (Arabic Egyptian format typically D/M/YYYY)
  const slashMatch = raw.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (slashMatch) {
    const d = Number(slashMatch[1]);
    const m = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Fallback JS Date parse
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

const TRACKED_BAKERY_FIELD_LABELS: Array<{ key: keyof Bakery; label: string }> = [
  { key: 'bakeryOwnerName', label: 'اسم صاحب المخبز' },
  { key: 'machineNumber', label: 'رقم الماكينة' },
  { key: 'village', label: 'القرية' },
  { key: 'localUnit', label: 'الوحدة المحلية' },
  { key: 'actualQuota', label: 'الحصة الفعلية (شكائر)' },
  { key: 'insuranceQuota', label: 'الحصة التأمينية (شكائر)' },
  { key: 'insuranceValue', label: 'القيمة التأمينية' },
  { key: 'activityStatus', label: 'حالة النشاط' },
  { key: 'villagePopulation', label: 'عدد السكان' },
  { key: 'beneficiaries2025', label: 'مستفيدي 2025' },
  { key: 'phone', label: 'رقم التليفون' },
  { key: 'bakeryLicenseDate', label: 'تاريخ رخصة المخبز' },
  { key: 'commercialRegDate', label: 'تاريخ السجل التجاري' },
  { key: 'taxCardDate', label: 'تاريخ البطاقة الضريبية' },
  { key: 'leaseAgreementDate', label: 'تاريخ عقد الإيجار' },
  { key: 'responsibleManager', label: 'المدير المسئول' },
  { key: 'fuelType', label: 'نوع الوقود' },
  { key: 'lineType', label: 'نوع خط الإنتاج' },
];

/**
 * Generates a concise human-readable Arabic summary of modified fields between old and new bakery state.
 */
export function buildBakeryChangeDiffSummary(
  prevBakery: Bakery | undefined,
  nextBakery: Bakery
): string {
  if (!prevBakery) {
    return `إضافة مخبز جديد — الحصة الفعلية: ${nextBakery.actualQuota ?? 0} شيكارة، الوحدة المحلية: ${nextBakery.localUnit || 'غير محدد'}`;
  }

  const diffs: string[] = [];
  for (const field of TRACKED_BAKERY_FIELD_LABELS) {
    const oldVal = prevBakery[field.key];
    const newVal = nextBakery[field.key];
    const oldStr = String(oldVal ?? '').trim();
    const newStr = String(newVal ?? '').trim();
    if (oldStr !== newStr) {
      diffs.push(`${field.label}: (${oldStr || 'فارغ'} ← ${newStr || 'فارغ'})`);
    }
  }

  if (diffs.length === 0) {
    return 'تحديث وحفظ بيانات المخبز';
  }
  return diffs.slice(0, 6).join(' • ') + (diffs.length > 6 ? ` (+${diffs.length - 6} حقول أخرى)` : '');
}

/**
 * Creates a standardized BakeryActivityLogItem with ISO date embedded so searching by date always works.
 */
export function createBakeryActivityLogItem(params: {
  action: string;
  details: string;
  user?: { username?: string; fullName?: string; role?: string } | null;
  now?: Date;
}): BakeryActivityLogItem {
  const now = params.now || new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return {
    id: `blog-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: `${isoDate} ${timeStr}`,
    username: params.user?.username || 'admin',
    userFullName: params.user?.fullName || params.user?.username || 'مدير النظام',
    userRole: params.user?.role || 'admin',
    action: params.action,
    details: params.details,
  };
}

/**
 * Flattens all bakeries' `activityLog` histories into a single searchable array sorted newest-first.
 */
export function extractAllBakeryChangeHistory(
  bakeries: Bakery[],
  extraDeletedOrGlobalLogs: SearchableBakeryChangeEntry[] = []
): SearchableBakeryChangeEntry[] {
  const entries: SearchableBakeryChangeEntry[] = [...extraDeletedOrGlobalLogs];

  for (const bakery of bakeries || []) {
    const logs = Array.isArray(bakery.activityLog) ? bakery.activityLog : [];
    for (const item of logs) {
      const isoDate = extractIsoDateFromTimestamp(item.timestamp);
      entries.push({
        id: item.id || `${bakery.id}-${item.timestamp}`,
        bakeryId: bakery.id,
        bakeryOwnerName: bakery.bakeryOwnerName || 'غير محدد',
        machineNumber: bakery.machineNumber || '—',
        village: bakery.village || 'غير محدد',
        localUnit: bakery.localUnit || 'غير محدد',
        timestamp: item.timestamp || '',
        isoDate,
        username: item.username || 'system',
        userFullName: item.userFullName || item.username || 'مسؤول النظام',
        userRole: item.userRole || 'admin',
        action: item.action || 'تعديل بيانات المخبز',
        details: item.details || '',
      });
    }
  }

  return entries.sort((a, b) => {
    const dateCompare = (b.isoDate || '').localeCompare(a.isoDate || '');
    if (dateCompare !== 0) return dateCompare;
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });
}

function normalizeArabicForSearch(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

export interface BakeryChangeHistoryFilter {
  ownerQuery?: string;
  exactDate?: string; // YYYY-MM-DD
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  actionQuery?: string;
}

/**
 * Filters historical bakery change log entries by bakery owner name and/or modification date.
 */
export function filterBakeryChangeHistory(
  entries: SearchableBakeryChangeEntry[],
  filter: BakeryChangeHistoryFilter
): SearchableBakeryChangeEntry[] {
  const normOwner = normalizeArabicForSearch(filter.ownerQuery || '');
  const exactDate = String(filter.exactDate || '').trim();
  const fromDate = String(filter.fromDate || '').trim();
  const toDate = String(filter.toDate || '').trim();
  const normAction = normalizeArabicForSearch(filter.actionQuery || '');

  return (entries || []).filter((entry) => {
    if (normOwner) {
      const hay = normalizeArabicForSearch(
        `${entry.bakeryOwnerName} ${entry.machineNumber} ${entry.village} ${entry.localUnit}`
      );
      if (!hay.includes(normOwner)) return false;
    }

    if (exactDate) {
      if (entry.isoDate !== exactDate && !entry.timestamp.includes(exactDate)) {
        return false;
      }
    }

    if (fromDate && entry.isoDate && entry.isoDate < fromDate) {
      return false;
    }

    if (toDate && entry.isoDate && entry.isoDate > toDate) {
      return false;
    }

    if (normAction) {
      const actionHay = normalizeArabicForSearch(`${entry.action} ${entry.details} ${entry.userFullName}`);
      if (!actionHay.includes(normAction)) return false;
    }

    return true;
  });
}
