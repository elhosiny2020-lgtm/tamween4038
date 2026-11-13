import { Bakery, DebtRecord, HighDebtAlertNotification, SystemConfig, SupplyBranch } from '../types';

export const FIRESTORE_DIRECTORY_DOC_ID = 'tamween_directory';
export const FIRESTORE_ALERTS_DOC_ID = 'alerts_log';
export const FIRESTORE_MAX_DOC_BYTES = 850_000;
export const DEFAULT_DEBT_ALERT_THRESHOLD = 50_000;

/**
 * Generates a Firestore-safe document ID (matching ^[a-zA-Z0-9_\-]+$) for a SupplyBranch.
 */
export function buildFirestoreBranchDocId(branchId: string): string {
  const clean = (branchId || 'branch-mahalla')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 100);
  return `branch__${clean || 'default'}`;
}

/**
 * Compacts a branch partition payload so it stays safely under Firestore's 1 MiB document ceiling
 * without dropping any operational bakery, debt, user, permission, or reference list data.
 */
export function compactBranchPartitionForFirestore<T extends Record<string, any>>(
  partition: T,
  maxBytes: number = FIRESTORE_MAX_DOC_BYTES
): T {
  const clone: Record<string, any> = {
    ...partition,
    systemConfig: partition.systemConfig
      ? { ...partition.systemConfig, logoBase64: undefined }
      : undefined,
  };

  let serialized = JSON.stringify(clone);
  if (serialized.length <= maxBytes) {
    return clone as T;
  }

  // Prune verbose activityLog history per bakery if size exceeds limit
  if (Array.isArray(clone.bakeries)) {
    clone.bakeries = clone.bakeries.map((b: Bakery) =>
      Array.isArray(b.activityLog) && b.activityLog.length > 5
        ? { ...b, activityLog: b.activityLog.slice(0, 5) }
        : b
    );
    serialized = JSON.stringify(clone);
    if (serialized.length <= maxBytes) return clone as T;

    clone.bakeries = clone.bakeries.map((b: Bakery) => {
      const { activityLog: _omit, ...rest } = b;
      return rest;
    });
  }

  return clone as T;
}

/**
 * Computes a complete structural checksum string covering ALL operational fields in a branch state
 * so remote edits to any field (phone, notes, beneficiaries, quotas, debts, tasks, users, config)
 * are never silently skipped by real-time sync.
 */
export function computeFullBranchDigest(params: {
  bakeries?: Bakery[];
  debts?: DebtRecord[];
  users?: any[];
  villages?: any[];
  dailyTasks?: any[];
  inboxMessages?: any[];
  systemConfig?: Partial<SystemConfig>;
  branches?: SupplyBranch[];
}): string {
  const bakeriesPart = (params.bakeries || []).map((b) => ({
    id: b.id,
    owner: b.bakeryOwnerName,
    machine: b.machineNumber,
    v: b.village,
    u: b.localUnit,
    iv: b.insuranceValue,
    iq: b.insuranceQuota,
    aq: b.actualQuota,
    lc: b.loavesCount,
    pop: b.villagePopulation,
    b23: b.beneficiaries2023,
    b24: b.beneficiaries2024,
    b25: b.beneficiaries2025,
    st: b.activityStatus,
    cat: b.bakeryCategory,
    bt: b.breadType,
    btc: b.breadTypeCount,
    bp: b.flourBagPrice,
    lt: b.lineType,
    ft: b.fuelType,
    ph: b.phone,
    nid: b.nationalId,
    tc: b.taxCardDate,
    cr: b.commercialRegDate,
    bl: b.bakeryLicenseDate,
    la: b.leaseAgreementDate,
    n: b.notes,
  }));

  const debtsPart = (params.debts || []).map((d) => ({
    id: d.id,
    bid: d.bakeryId,
    vd: d.violationDate,
    ie: d.issuingEntity,
    vt: d.violationType,
    va: d.violationAmount,
    ov: d.oldViolations,
    pva: d.paidViolationAmount,
    aa: d.addedAmount,
    paa: d.paidAddedAmount,
    db: d.disposalBags,
    dbp: d.disposalBagPrice,
    dm: d.disposalMultiplier,
    pda: d.paidDisposalAmount,
    net: d.netRemainingDebt,
    sch: d.isScheduled,
    sc: d.scheduleInstallmentsCount,
    sp: d.schedulePaidInstallments,
    ss: d.scheduleStatus,
    n: d.notes,
  }));

  const cfgClean = params.systemConfig
    ? { ...params.systemConfig, logoBase64: undefined }
    : undefined;

  return JSON.stringify({
    b: bakeriesPart,
    d: debtsPart,
    u: params.users || [],
    vil: params.villages || [],
    t: params.dailyTasks || [],
    m: params.inboxMessages || [],
    c: cfgClean,
    br: (params.branches || []).map((br) => `${br.id}:${br.name}:${br.directorateTitle}`),
  });
}

/**
 * Evaluates whether a debt record triggers a high-debt user alert based on configurable threshold.
 */
export function shouldTriggerDebtAlert(debtAmount: number, threshold?: number): boolean {
  const effectiveThreshold =
    typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0
      ? threshold
      : DEFAULT_DEBT_ALERT_THRESHOLD;
  return Number(debtAmount) >= effectiveThreshold;
}

/**
 * Merges incoming remote alerts with local alerts idempotently without duplicates,
 * preserving read state where known locally and ordering newest first.
 */
export function mergeHighDebtAlerts(
  localAlerts: HighDebtAlertNotification[],
  remoteAlerts: HighDebtAlertNotification[],
  maxItems: number = 150
): HighDebtAlertNotification[] {
  const byId = new Map<string, HighDebtAlertNotification>();

  for (const item of remoteAlerts || []) {
    if (item && item.id) {
      byId.set(item.id, { ...item });
    }
  }

  for (const local of localAlerts || []) {
    if (!local || !local.id) continue;
    const existing = byId.get(local.id);
    if (existing) {
      byId.set(local.id, {
        ...existing,
        isRead: existing.isRead || local.isRead,
      });
    } else {
      byId.set(local.id, { ...local });
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    const tA = a.createdAtIso ? Date.parse(a.createdAtIso) || 0 : 0;
    const tB = b.createdAtIso ? Date.parse(b.createdAtIso) || 0 : 0;
    if (tA !== tB) return tB - tA;
    return String(b.id).localeCompare(String(a.id));
  });

  return merged.slice(0, maxItems);
}
