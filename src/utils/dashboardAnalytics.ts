import { Bakery, DebtRecord } from '../types';

export interface ExecutiveSummaryMetrics {
  totalRemainingDebt: number;
  totalPaidDebt: number;
  collectionRatePercent: number;
  totalDebtsCount: number;
  bakeriesCount: number;
  activeCount: number;
  stoppedCount: number;
  operationalRatePercent: number;
  totalActualQuota: number;
  totalInsuranceQuota: number;
  quotaUtilizationPercent: number;
  totalLoaves: number;
  thresholdExceededCount: number;
  debtByBakery: Map<string, number>;
}

export interface DebtRiskTierBucket {
  tierId: 'low' | 'medium' | 'high' | 'critical';
  label: string;
  bakeriesCount: number;
  totalDebt: number;
  color: string;
}

export interface LicenseDocumentAlert {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  activityStatus: string;
  docLabel: string;
  docDate: string;
  daysRemaining: number;
  status: 'expired' | 'expiring_soon' | 'stopped';
}

export interface LicenseSummaryCounts {
  expiredCount: number;
  expiringSoonCount: number;
  validCount: number;
  missingCount: number;
  alerts: LicenseDocumentAlert[];
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isBakeryStoppedStatus(status?: string): boolean {
  return /متوقف|موقوف|مغلق|ملغ/.test(String(status || '').trim());
}

export function formatCurrencyCompact(value: number): string {
  const num = safeNum(value);
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)} م`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(1)} ألف`;
  }
  return num.toLocaleString('en-US');
}

export function formatLoavesCompact(value: number): string {
  const num = safeNum(value);
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)} مليون`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(1)} ألف`;
  }
  return num.toLocaleString('en-US');
}

export function computeExecutiveSummary(
  filteredBakeries: Bakery[],
  filteredDebts: DebtRecord[],
  debtAlertThreshold: number
): ExecutiveSummaryMetrics {
  let totalRemainingDebt = 0;
  let totalPaidDebt = 0;
  const debtByBakery = new Map<string, number>();

  for (const d of filteredDebts || []) {
    const remaining = Math.max(0, safeNum(d.netRemainingDebt));
    const paid =
      Math.max(0, safeNum(d.paidViolationAmount)) +
      Math.max(0, safeNum(d.paidAddedAmount)) +
      Math.max(0, safeNum(d.paidDisposalAmount));
    totalRemainingDebt += remaining;
    totalPaidDebt += paid;
    const key = String(d.bakeryId || d.id);
    debtByBakery.set(key, (debtByBakery.get(key) || 0) + remaining);
  }

  let activeCount = 0;
  let stoppedCount = 0;
  let totalActualQuota = 0;
  let totalInsuranceQuota = 0;
  let totalLoaves = 0;

  for (const b of filteredBakeries || []) {
    const status = (b.activityStatus || '').trim();
    if (!isBakeryStoppedStatus(status)) {
      activeCount++;
    } else {
      stoppedCount++;
    }
    totalActualQuota += Math.max(0, safeNum(b.actualQuota));
    totalInsuranceQuota += Math.max(0, safeNum(b.insuranceQuota));
    totalLoaves += Math.max(0, safeNum(b.loavesCount));
  }

  let thresholdExceededCount = 0;
  const safeThreshold = Math.max(0, safeNum(debtAlertThreshold));
  debtByBakery.forEach((amount) => {
    if (amount >= safeThreshold) thresholdExceededCount++;
  });

  const totalDebtTurnover = totalRemainingDebt + totalPaidDebt;
  const collectionRatePercent =
    totalDebtTurnover > 0 ? Math.round((totalPaidDebt / totalDebtTurnover) * 100) : 0;

  const bakeriesCount = filteredBakeries.length;
  const operationalRatePercent =
    bakeriesCount > 0 ? Math.round((activeCount / bakeriesCount) * 100) : 0;

  const quotaUtilizationPercent =
    totalInsuranceQuota > 0
      ? Math.round((totalActualQuota / totalInsuranceQuota) * 100)
      : totalActualQuota > 0
      ? 100
      : 0;

  return {
    totalRemainingDebt,
    totalPaidDebt,
    collectionRatePercent,
    totalDebtsCount: filteredDebts.length,
    bakeriesCount,
    activeCount,
    stoppedCount,
    operationalRatePercent,
    totalActualQuota: Number(totalActualQuota.toFixed(2)),
    totalInsuranceQuota: Number(totalInsuranceQuota.toFixed(2)),
    quotaUtilizationPercent,
    totalLoaves,
    thresholdExceededCount,
    debtByBakery,
  };
}

export function buildDebtRiskTierBuckets(
  debtByBakery: Map<string, number>,
  threshold: number
): DebtRiskTierBucket[] {
  const buckets: DebtRiskTierBucket[] = [
    { tierId: 'low', label: 'أقل من 10 آلاف', bakeriesCount: 0, totalDebt: 0, color: '#0284C7' },
    { tierId: 'medium', label: '10 - 25 ألف', bakeriesCount: 0, totalDebt: 0, color: '#D97706' },
    { tierId: 'high', label: '25 - 50 ألف', bakeriesCount: 0, totalDebt: 0, color: '#EA580C' },
    {
      tierId: 'critical',
      label: threshold > 50000 ? `أكثر من ${formatCurrencyCompact(threshold)}` : 'أكثر من 50 ألف',
      bakeriesCount: 0,
      totalDebt: 0,
      color: '#DC2626',
    },
  ];

  debtByBakery.forEach((amount) => {
    if (amount <= 0) return;
    if (amount < 10_000) {
      buckets[0].bakeriesCount += 1;
      buckets[0].totalDebt += amount;
    } else if (amount < 25_000) {
      buckets[1].bakeriesCount += 1;
      buckets[1].totalDebt += amount;
    } else if (amount < Math.max(50_000, threshold)) {
      buckets[2].bakeriesCount += 1;
      buckets[2].totalDebt += amount;
    } else {
      buckets[3].bakeriesCount += 1;
      buckets[3].totalDebt += amount;
    }
  });

  return buckets;
}

function parseDocumentDate(dateStr?: string): Date | null {
  const raw = (dateStr || '').trim();
  if (!raw) return null;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (isoMatch) {
    const dt = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slashMatch) {
    const dt = new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function analyzeOperationalAndLicenseAlerts(
  bakeries: Bakery[],
  referenceDate: Date = new Date()
): LicenseSummaryCounts {
  const refStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  let expiredCount = 0;
  let expiringSoonCount = 0;
  let validCount = 0;
  let missingCount = 0;
  const alerts: LicenseDocumentAlert[] = [];

  const docFields: Array<{ key: keyof Bakery; label: string }> = [
    { key: 'bakeryLicenseDate', label: 'رخصة المخبز' },
    { key: 'commercialRegDate', label: 'السجل التجاري' },
    { key: 'leaseAgreementDate', label: 'عقد الإيجار' },
    { key: 'taxCardDate', label: 'البطاقة الضريبية' },
  ];

  for (const b of bakeries || []) {
    const status = (b.activityStatus || '').trim();
    if (status && isBakeryStoppedStatus(status)) {
      alerts.push({
        bakeryId: b.id,
        bakeryOwnerName: b.bakeryOwnerName || 'مخبز غير مسمى',
        machineNumber: b.machineNumber || '—',
        village: b.village || 'غير محدد',
        activityStatus: status,
        docLabel: status,
        docDate: '',
        daysRemaining: 0,
        status: 'stopped',
      });
    }

    for (const field of docFields) {
      const rawVal = String(b[field.key] || '').trim();
      const dt = parseDocumentDate(rawVal);
      if (!dt) {
        missingCount++;
        continue;
      }
      const diffDays = Math.floor((dt.getTime() - refStart) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        expiredCount++;
        alerts.push({
          bakeryId: b.id,
          bakeryOwnerName: b.bakeryOwnerName || 'مخبز غير مسمى',
          machineNumber: b.machineNumber || '—',
          village: b.village || 'غير محدد',
          activityStatus: status || 'غير محدد',
          docLabel: field.label,
          docDate: rawVal,
          daysRemaining: diffDays,
          status: 'expired',
        });
      } else if (diffDays <= 30) {
        expiringSoonCount++;
        alerts.push({
          bakeryId: b.id,
          bakeryOwnerName: b.bakeryOwnerName || 'مخبز غير مسمى',
          machineNumber: b.machineNumber || '—',
          village: b.village || 'غير محدد',
          activityStatus: status || 'غير محدد',
          docLabel: field.label,
          docDate: rawVal,
          daysRemaining: diffDays,
          status: 'expiring_soon',
        });
      } else {
        validCount++;
      }
    }
  }

  const priorityOrder = { expired: 0, expiring_soon: 1, stopped: 2 };
  alerts.sort((a, b) => {
    const pDiff = priorityOrder[a.status] - priorityOrder[b.status];
    if (pDiff !== 0) return pDiff;
    return a.daysRemaining - b.daysRemaining;
  });

  return {
    expiredCount,
    expiringSoonCount,
    validCount,
    missingCount,
    alerts,
  };
}
