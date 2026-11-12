import {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  ColumnTitles,
  SystemConfig,
  AppUser,
  DailyBakeryTask,
  InboxChatMessage,
  SupplyBranch
} from './types';
import {
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_OFFICIAL_LOGO,
  DEFAULT_VILLAGES_HIERARCHY,
  DEFAULT_ISSUING_ENTITIES,
  DEFAULT_VIOLATION_TYPES,
  DEFAULT_ACTIVITY_STATUSES,
  DEFAULT_BAKERY_CATEGORIES,
  DEFAULT_BREAD_TYPES,
  DEFAULT_BREAD_TYPE_COUNTS,
  DEFAULT_LINE_TYPES,
  DEFAULT_FUEL_TYPES,
  PAYMENT_METHODS,
  DEFAULT_COLUMN_TITLES,
  INITIAL_BAKERIES,
  INITIAL_DEBTS,
  INITIAL_USERS,
  INITIAL_DAILY_TASKS,
  INITIAL_INBOX_MESSAGES
} from './defaultData';
import {
  normalizeBakeryCalculations,
  synchronizeBakeryAndDebts
} from './utils/auditHelper';
import {
  auth,
  syncWorkspaceToFirestore,
  syncSharedStateToFirestore,
  loadSharedStateFromFirestore,
} from './lib/firebase';
import { autoSyncToSupabase, fetchDatabaseFromSupabase } from './lib/supabase';

export interface MergeConflictItem {
  id: string;
  recordType: 'bakery' | 'debt';
  recordId: string;
  label: string;
  reason: string;
  timestamp: string;
}

export interface AppState {
  activeBranchId?: string;
  branches?: SupplyBranch[];
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  issuingEntities: string[];
  violationTypes: string[];
  activityStatuses: string[];
  bakeryCategories?: string[];
  breadTypes?: string[];
  breadTypeCounts?: string[];
  lineTypes?: string[];
  fuelTypes?: string[];
  paymentMethods?: string[];
  dailyTasks?: DailyBakeryTask[];
  inboxMessages?: InboxChatMessage[];
  columnTitles: ColumnTitles;
  systemConfig: SystemConfig;
  users: AppUser[];
  currentUser: AppUser | null;
}

const DB_NAME = 'TamweenGharbiaDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

export const DEFAULT_BRANCH_ID = 'branch-mahalla';

export const DEFAULT_SUPPLY_BRANCHES: SupplyBranch[] = [
  {
    id: 'branch-mahalla',
    name: 'إدارة تموين مركز المحلة الكبرى',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز المحلة الكبرى (القاعدة الأساسية)',
    createdAt: '2025-01-01',
    isDefault: true,
  },
  {
    id: 'branch-samanoud',
    name: 'إدارة تموين سمنود',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة سمنود (قاعدة بيانات مستقلة)',
    createdAt: '2025-01-01',
    isDefault: false,
  },
];

const BRANCH_META_KEYS = {
  BRANCHES_LIST: 'TAMWEEN_BRANCHES_LIST_V1',
  ACTIVE_BRANCH_ID: 'TAMWEEN_ACTIVE_BRANCH_ID_V1',
  GLOBAL_ROLE_CONFIG: 'TAMWEEN_GLOBAL_ROLE_CONFIG_V1',
  USERS_UPDATED_AT: 'TAMWEEN_USERS_UPDATED_AT_V1',
};

const BASE_KEYS = {
  INITIALIZED: 'TAMWEEN_INITIALIZED_V3',
  SESSION: 'TAMWEEN_SESSION_V3',
  BAKERIES: 'TAMWEEN_BAKERIES_V3',
  DEBTS: 'TAMWEEN_DEBTS_V3',
  VILLAGES: 'TAMWEEN_VILLAGES_V3',
  ENTITIES: 'TAMWEEN_ENTITIES_V3',
  VIOLATIONS: 'TAMWEEN_VIOLATIONS_V3',
  ACTIVITY_STATUSES: 'TAMWEEN_ACTIVITY_STATUSES_V3',
  BAKERY_CATEGORIES: 'TAMWEEN_BAKERY_CATEGORIES_V3',
  BREAD_TYPES: 'TAMWEEN_BREAD_TYPES_V3',
  BREAD_TYPE_COUNTS: 'TAMWEEN_BREAD_TYPE_COUNTS_V3',
  LINE_TYPES: 'TAMWEEN_LINE_TYPES_V3',
  FUEL_TYPES: 'TAMWEEN_FUEL_TYPES_V3',
  PAYMENT_METHODS: 'TAMWEEN_PAYMENT_METHODS_V3',
  DAILY_TASKS: 'TAMWEEN_DAILY_TASKS_V3',
  INBOX_MESSAGES: 'TAMWEEN_INBOX_MESSAGES_V3',
  COLUMNS: 'TAMWEEN_COLUMNS_V3',
  CONFIG: 'TAMWEEN_CONFIG_V3',
  USERS: 'TAMWEEN_USERS_V3',
  AUTOSAVE_BACKUP: 'TAMWEEN_AUTOSAVE_BACKUP_V3',
  AUTOSAVE_TIMESTAMP: 'TAMWEEN_AUTOSAVE_TIMESTAMP_V3',
  MERGE_CONFLICTS: 'TAMWEEN_MERGE_CONFLICTS_LOG',
};

const KEYS = BASE_KEYS;

export function getScopedKeysForBranch(branchId?: string): typeof BASE_KEYS {
  const targetId = branchId || getActiveBranchId();
  if (!targetId || targetId === DEFAULT_BRANCH_ID) {
    return BASE_KEYS;
  }
  const suffix = `__${targetId}`;
  return {
    INITIALIZED: `${BASE_KEYS.INITIALIZED}${suffix}`,
    SESSION: BASE_KEYS.SESSION,
    BAKERIES: `${BASE_KEYS.BAKERIES}${suffix}`,
    DEBTS: `${BASE_KEYS.DEBTS}${suffix}`,
    VILLAGES: `${BASE_KEYS.VILLAGES}${suffix}`,
    ENTITIES: `${BASE_KEYS.ENTITIES}${suffix}`,
    VIOLATIONS: `${BASE_KEYS.VIOLATIONS}${suffix}`,
    ACTIVITY_STATUSES: `${BASE_KEYS.ACTIVITY_STATUSES}${suffix}`,
    BAKERY_CATEGORIES: `${BASE_KEYS.BAKERY_CATEGORIES}${suffix}`,
    BREAD_TYPES: `${BASE_KEYS.BREAD_TYPES}${suffix}`,
    BREAD_TYPE_COUNTS: `${BASE_KEYS.BREAD_TYPE_COUNTS}${suffix}`,
    LINE_TYPES: `${BASE_KEYS.LINE_TYPES}${suffix}`,
    FUEL_TYPES: `${BASE_KEYS.FUEL_TYPES}${suffix}`,
    PAYMENT_METHODS: `${BASE_KEYS.PAYMENT_METHODS}${suffix}`,
    DAILY_TASKS: `${BASE_KEYS.DAILY_TASKS}${suffix}`,
    INBOX_MESSAGES: `${BASE_KEYS.INBOX_MESSAGES}${suffix}`,
    COLUMNS: `${BASE_KEYS.COLUMNS}${suffix}`,
    CONFIG: `${BASE_KEYS.CONFIG}${suffix}`,
    USERS: BASE_KEYS.USERS, // Unified users, passwords & permissions across ALL branches
    AUTOSAVE_BACKUP: `${BASE_KEYS.AUTOSAVE_BACKUP}${suffix}`,
    AUTOSAVE_TIMESTAMP: `${BASE_KEYS.AUTOSAVE_TIMESTAMP}${suffix}`,
    MERGE_CONFLICTS: `${BASE_KEYS.MERGE_CONFLICTS}${suffix}`,
  };
}

export function mergeUsersList(
  baseUsers: AppUser[] | null | undefined,
  incomingUsers: AppUser[] | null | undefined
): AppUser[] {
  const defaultPassByUsername = new Map<string, string>();
  INITIAL_USERS.forEach((u) => {
    defaultPassByUsername.set(u.username.toLowerCase(), u.password || '');
  });

  const userMap = new Map<string, AppUser>();
  (baseUsers || INITIAL_USERS).forEach((u) => {
    if (u && u.username) {
      userMap.set(u.id || u.username.toLowerCase(), { ...u });
    }
  });

  (incomingUsers || []).forEach((inc) => {
    if (!inc || !inc.username) return;
    let matchedKey: string | null = userMap.has(inc.id) ? inc.id : null;
    if (!matchedKey) {
      for (const [k, ex] of userMap.entries()) {
        if (ex.username.toLowerCase() === inc.username.toLowerCase()) {
          matchedKey = k;
          break;
        }
      }
    }

    if (matchedKey) {
      const existing = userMap.get(matchedKey)!;
      const defaultPass = defaultPassByUsername.get(existing.username.toLowerCase());
      const incHasCustomPass = inc.password && inc.password !== defaultPass;
      const exHasCustomPass = existing.password && existing.password !== defaultPass;

      const resolvedPassword = incHasCustomPass
        ? inc.password
        : exHasCustomPass
        ? existing.password
        : inc.password || existing.password;

      userMap.set(matchedKey, {
        ...existing,
        ...inc,
        id: existing.id,
        password: resolvedPassword,
        customPermissions:
          Array.isArray(inc.customPermissions) && inc.customPermissions.length > 0
            ? inc.customPermissions
            : existing.customPermissions,
      });
    } else {
      userMap.set(inc.id || inc.username.toLowerCase(), { ...inc });
    }
  });

  const result = Array.from(userMap.values());
  return result.length > 0 ? result : INITIAL_USERS;
}

export function getBranchesList(): SupplyBranch[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(BRANCH_META_KEYS.BRANCHES_LIST);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      localStorage.setItem(BRANCH_META_KEYS.BRANCHES_LIST, JSON.stringify(DEFAULT_SUPPLY_BRANCHES));
    }
  } catch {}
  return DEFAULT_SUPPLY_BRANCHES;
}

export function saveBranchesList(branches: SupplyBranch[]): void {
  try {
    if (typeof localStorage !== 'undefined' && Array.isArray(branches) && branches.length > 0) {
      localStorage.setItem(BRANCH_META_KEYS.BRANCHES_LIST, JSON.stringify(branches));
    }
  } catch {}
}

export function getActiveBranchId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(BRANCH_META_KEYS.ACTIVE_BRANCH_ID);
      const branches = getBranchesList();
      if (saved && branches.some((b) => b.id === saved)) {
        return saved;
      }
      return branches[0]?.id || DEFAULT_BRANCH_ID;
    }
  } catch {}
  return DEFAULT_BRANCH_ID;
}

export function setActiveBranchId(branchId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRANCH_META_KEYS.ACTIVE_BRANCH_ID, branchId);
    }
  } catch {}
}

export function getActiveBranch(): SupplyBranch {
  const branches = getBranchesList();
  const activeId = getActiveBranchId();
  return branches.find((b) => b.id === activeId) || branches[0] || DEFAULT_SUPPLY_BRANCHES[0];
}

export function addSupplyBranch(
  name: string,
  directorateTitle = 'مديرية التموين والتجارة الداخلية بالغربية',
  governorateTitle = 'محافظة الغربية',
  description = ''
): SupplyBranch {
  const trimmedName = name.trim();
  const branches = getBranchesList();
  const newBranch: SupplyBranch = {
    id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmedName,
    governorateTitle: governorateTitle.trim() || 'محافظة الغربية',
    directorateTitle: directorateTitle.trim() || 'مديرية التموين والتجارة الداخلية بالغربية',
    description: description.trim() || `قاعدة بيانات مستقلة - ${trimmedName}`,
    createdAt: new Date().toISOString().slice(0, 10),
    isDefault: false,
  };
  const updated = [...branches, newBranch];
  saveBranchesList(updated);

  // Initialize isolated empty storage for the new branch so no data ever leaks from other branches
  const scopedKeys = getScopedKeysForBranch(newBranch.id);
  const initialConfig: SystemConfig = {
    ...DEFAULT_SYSTEM_CONFIG,
    governorateTitle: newBranch.governorateTitle,
    directorateTitle: newBranch.directorateTitle,
    administrationTitle: newBranch.name,
    logoBase64: DEFAULT_OFFICIAL_LOGO,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(scopedKeys.INITIALIZED, 'true');
      localStorage.setItem(scopedKeys.BAKERIES, JSON.stringify([]));
      localStorage.setItem(scopedKeys.DEBTS, JSON.stringify([]));
      localStorage.setItem(scopedKeys.VILLAGES, JSON.stringify([]));
      localStorage.setItem(scopedKeys.DAILY_TASKS, JSON.stringify([]));
      localStorage.setItem(scopedKeys.INBOX_MESSAGES, JSON.stringify([]));
      localStorage.setItem(scopedKeys.CONFIG, JSON.stringify(initialConfig));
    }
  } catch {}

  return newBranch;
}

export function deleteSupplyBranch(branchId: string): {
  success: boolean;
  message: string;
  branches: SupplyBranch[];
  nextActiveBranchId: string;
} {
  const branches = getBranchesList();
  if (branches.length <= 1) {
    return {
      success: false,
      message: 'لا يمكن حذف جميع الفروع؛ يجب الإبقاء على إدارة تموينية واحدة على الأقل في المنظومة.',
      branches,
      nextActiveBranchId: branches[0].id,
    };
  }
  const target = branches.find((b) => b.id === branchId);
  if (!target) {
    return {
      success: false,
      message: 'الفرع المطلوب حذفه غير موجود.',
      branches,
      nextActiveBranchId: getActiveBranchId(),
    };
  }

  const remaining = branches.filter((b) => b.id !== branchId);
  saveBranchesList(remaining);

  // Clean up isolated storage for deleted branch (never delete unified session or users)
  if (branchId !== DEFAULT_BRANCH_ID) {
    const scopedKeys = getScopedKeysForBranch(branchId);
    try {
      if (typeof localStorage !== 'undefined') {
        Object.values(scopedKeys).forEach((k) => {
          if (k !== BASE_KEYS.SESSION && k !== BASE_KEYS.USERS) {
            localStorage.removeItem(k);
          }
        });
      }
    } catch {}
  } else {
    // If the user explicitly deletes the default branch, clear its data keys
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BASE_KEYS.BAKERIES, JSON.stringify([]));
        localStorage.setItem(BASE_KEYS.DEBTS, JSON.stringify([]));
        localStorage.setItem(BASE_KEYS.VILLAGES, JSON.stringify([]));
      }
    } catch {}
  }

  const currentActive = getActiveBranchId();
  const nextActive = currentActive === branchId ? remaining[0].id : currentActive;
  setActiveBranchId(nextActive);

  return {
    success: true,
    message: `تم حذف "${target.name}" وجميع بياناته المنفصلة بنجاح.`,
    branches: remaining,
    nextActiveBranchId: nextActive,
  };
}

export function getBranchSummaryStats(branchId: string): {
  bakeriesCount: number;
  debtsCount: number;
  villagesCount: number;
} {
  try {
    if (typeof localStorage === 'undefined') {
      return { bakeriesCount: 0, debtsCount: 0, villagesCount: 0 };
    }
    const scoped = getScopedKeysForBranch(branchId);
    const rawBakeries = localStorage.getItem(scoped.BAKERIES);
    const rawDebts = localStorage.getItem(scoped.DEBTS);
    const rawVillages = localStorage.getItem(scoped.VILLAGES);

    if (branchId === DEFAULT_BRANCH_ID && !rawBakeries) {
      return {
        bakeriesCount: INITIAL_BAKERIES.length,
        debtsCount: INITIAL_DEBTS.length,
        villagesCount: DEFAULT_VILLAGES_HIERARCHY.length,
      };
    }

    const bakeries = rawBakeries ? JSON.parse(rawBakeries) : [];
    const debts = rawDebts ? JSON.parse(rawDebts) : [];
    const villages = rawVillages ? JSON.parse(rawVillages) : [];
    return {
      bakeriesCount: Array.isArray(bakeries) ? bakeries.length : 0,
      debtsCount: Array.isArray(debts) ? debts.length : 0,
      villagesCount: Array.isArray(villages) ? villages.length : 0,
    };
  } catch {
    return { bakeriesCount: 0, debtsCount: 0, villagesCount: 0 };
  }
}

function normalizeBakeryPerCapita(b: Bakery): Bakery {
  return normalizeBakeryCalculations({
    ...b,
    bakeryCategory: b.bakeryCategory || 'مخبز بلدي مدعم',
    flourBagPrice: b.flourBagPrice !== undefined && b.flourBagPrice !== null ? Number(b.flourBagPrice) : 950,
  });
}

export function getMergeConflictsLog(): MergeConflictItem[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEYS.MERGE_CONFLICTS) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearMergeConflictsLog(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEYS.MERGE_CONFLICTS);
    }
  } catch {}
}

let cachedDbInstance: IDBDatabase | null = null;

// IndexedDB Helper with safety timeout for file:/// and offline environments
function openIndexedDB(): Promise<IDBDatabase> {
  if (cachedDbInstance) {
    return Promise.resolve(cachedDbInstance);
  }
  return new Promise((resolve, reject) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error('IndexedDB connection timeout'));
      }, 250);

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        cachedDbInstance = request.result;
        cachedDbInstance.onclose = () => {
          cachedDbInstance = null;
        };
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('IndexedDB blocked'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, val: unknown): Promise<void> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // fallback gracefully
  }
}

async function idbSetBatch(entries: Array<[string, unknown]>): Promise<void> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const [k, v] of entries) {
        store.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // fallback gracefully
  }
}

/**
 * Mandatory ADD ONLY Smart Merge (قاعدة إلزامية: ADD ONLY):
 * - Preserves all existing records in `base` without deleting, replacing, or overwriting them.
 * - Adds ONLY new records whose ID / machineNumber does not already exist in `base`.
 * - Logs any conflicting records for user review without mutating existing records.
 */
export function mergeStates(base: AppState, incoming: Partial<AppState>): AppState {
  const conflicts: MergeConflictItem[] = getMergeConflictsLog();
  const nowStr = new Date().toISOString();

  const bakeryMap = new Map<string, Bakery>();
  base.bakeries.forEach((b) => bakeryMap.set(b.id, normalizeBakeryPerCapita(b)));
  (incoming.bakeries || []).forEach((b) => {
    let matchedId: string | null = bakeryMap.has(b.id) ? b.id : null;
    if (!matchedId) {
      for (const [id, ex] of bakeryMap.entries()) {
        if (ex.machineNumber && b.machineNumber && ex.machineNumber.trim() === b.machineNumber.trim()) {
          matchedId = id;
          break;
        }
      }
    }
    if (matchedId) {
      // ADD ONLY RULE: Never overwrite existing bakery; log conflict if incoming values differ
      const existing = bakeryMap.get(matchedId)!;
      const incomingNorm = normalizeBakeryPerCapita(b);
      if (
        existing.bakeryOwnerName !== incomingNorm.bakeryOwnerName ||
        Number(existing.insuranceValue) !== Number(incomingNorm.insuranceValue) ||
        Number(existing.insuranceQuota) !== Number(incomingNorm.insuranceQuota)
      ) {
        conflicts.unshift({
          id: `conf-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          recordType: 'bakery',
          recordId: matchedId,
          label: `${existing.bakeryOwnerName} (ماكينة ${existing.machineNumber})`,
          reason: `تعارض عند الاستيراد (تم الحفاظ على السجل الأصلي دون استبدال وفق قاعدة ADD ONLY): الوارد باسم "${incomingNorm.bakeryOwnerName}" وقيمة تأمينية (${incomingNorm.insuranceValue}) مقابل الأصلي (${existing.insuranceValue}).`,
          timestamp: nowStr,
        });
      }
    } else {
      bakeryMap.set(b.id, normalizeBakeryPerCapita(b));
    }
  });

  const debtMap = new Map<string, DebtRecord>();
  base.debts.forEach((d) => debtMap.set(d.id, d));
  (incoming.debts || []).forEach((d) => {
    if (debtMap.has(d.id)) {
      // ADD ONLY RULE: Never overwrite existing debt record; log conflict if amounts differ
      const existingDebt = debtMap.get(d.id)!;
      if (Number(existingDebt.netRemainingDebt) !== Number(d.netRemainingDebt)) {
        conflicts.unshift({
          id: `conf-d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          recordType: 'debt',
          recordId: d.id,
          label: `${existingDebt.bakeryOwnerName} (${existingDebt.violationType})`,
          reason: `تعارض في قيد المديونية رقم (${d.id}): تم الاحتفاظ بالسجل الأصلي بصافي متبقي (${existingDebt.netRemainingDebt}) ج.م وتجاهل تعديل الاستيراد (${d.netRemainingDebt}) ج.م وفق قاعدة ADD ONLY.`,
          timestamp: nowStr,
        });
      }
    } else {
      debtMap.set(d.id, d);
    }
  });

  try {
    if (typeof localStorage !== 'undefined' && conflicts.length > 0) {
      localStorage.setItem(KEYS.MERGE_CONFLICTS, JSON.stringify(conflicts.slice(0, 100)));
    }
  } catch {}

  const synced = synchronizeBakeryAndDebts(
    Array.from(bakeryMap.values()),
    Array.from(debtMap.values())
  );

  const villageMap = new Map<string, Set<string>>();
  base.villages.forEach((v) => villageMap.set(v.village, new Set(v.localUnits)));
  (incoming.villages || []).forEach((v) => {
    if (villageMap.has(v.village)) {
      v.localUnits.forEach((u) => villageMap.get(v.village)!.add(u));
    } else {
      villageMap.set(v.village, new Set(v.localUnits));
    }
  });
  const mergedVillages: VillageHierarchy[] = Array.from(villageMap.entries()).map(([village, units]) => ({
    village,
    localUnits: Array.from(units),
  }));

  const mergedUsers = mergeUsersList(base.users, incoming.users);

  const taskMap = new Map<string, DailyBakeryTask>();
  (base.dailyTasks || INITIAL_DAILY_TASKS).forEach((t) => taskMap.set(t.id, t));
  (incoming.dailyTasks || []).forEach((t) => {
    if (!taskMap.has(t.id)) taskMap.set(t.id, t);
  });

  const msgMap = new Map<string, InboxChatMessage>();
  (base.inboxMessages || INITIAL_INBOX_MESSAGES).forEach((m) => msgMap.set(m.id, m));
  (incoming.inboxMessages || []).forEach((m) => {
    if (!msgMap.has(m.id)) msgMap.set(m.id, m);
  });

  return {
    ...base,
    bakeries: synced.bakeries,
    debts: synced.debts,
    villages: mergedVillages.length > 0 ? mergedVillages : base.villages,
    users: mergedUsers,
    issuingEntities: Array.from(new Set([...base.issuingEntities, ...(incoming.issuingEntities || [])])),
    violationTypes: Array.from(new Set([...base.violationTypes, ...(incoming.violationTypes || [])])),
    activityStatuses: Array.from(new Set([...base.activityStatuses, ...(incoming.activityStatuses || [])])),
    bakeryCategories: Array.from(new Set([...(base.bakeryCategories || DEFAULT_BAKERY_CATEGORIES), ...(incoming.bakeryCategories || [])])),
    breadTypes: Array.from(new Set([...(base.breadTypes || DEFAULT_BREAD_TYPES), ...(incoming.breadTypes || [])])),
    breadTypeCounts: Array.from(new Set([...(base.breadTypeCounts || DEFAULT_BREAD_TYPE_COUNTS), ...(incoming.breadTypeCounts || [])])),
    lineTypes: Array.from(new Set([...(base.lineTypes || DEFAULT_LINE_TYPES), ...(incoming.lineTypes || [])])),
    fuelTypes: Array.from(new Set([...(base.fuelTypes || DEFAULT_FUEL_TYPES), ...(incoming.fuelTypes || [])])),
    paymentMethods: Array.from(new Set([...(base.paymentMethods || PAYMENT_METHODS), ...(incoming.paymentMethods || [])])),
    dailyTasks: Array.from(taskMap.values()),
    inboxMessages: Array.from(msgMap.values()),
    systemConfig: {
      ...(incoming.systemConfig || {}),
      ...(base.systemConfig || {}),
      logoBase64: DEFAULT_OFFICIAL_LOGO,
    },
    columnTitles: base.columnTitles || incoming.columnTitles,
  };
}

export function isDefaultSeedState(
  bakeries?: Bakery[] | null,
  debts?: DebtRecord[] | null
): boolean {
  if (!bakeries || !debts) return true;
  if (bakeries.length === 0 && debts.length === 0) return true;
  if (
    bakeries.length !== INITIAL_BAKERIES.length ||
    debts.length !== INITIAL_DEBTS.length
  ) {
    return false;
  }
  const sameBakeries = bakeries.every((b, idx) => {
    const initB = INITIAL_BAKERIES[idx];
    return (
      initB &&
      b.id === initB.id &&
      b.bakeryOwnerName === initB.bakeryOwnerName &&
      Number(b.actualQuota) === Number(initB.actualQuota) &&
      Number(b.insuranceQuota) === Number(initB.insuranceQuota) &&
      b.machineNumber === initB.machineNumber &&
      b.activityStatus === initB.activityStatus
    );
  });
  const sameDebts = debts.every((d, idx) => {
    const initD = INITIAL_DEBTS[idx];
    return (
      initD &&
      d.id === initD.id &&
      Number(d.violationAmount) === Number(initD.violationAmount) &&
      Number(d.paidViolationAmount) === Number(initD.paidViolationAmount) &&
      Number(d.disposalBags) === Number(initD.disposalBags) &&
      Number(d.paidDisposalAmount) === Number(initD.paidDisposalAmount)
    );
  });
  return sameBakeries && sameDebts;
}

export async function loadInitialState(requestedBranchId?: string): Promise<AppState> {
  const branchesList = getBranchesList();
  const activeBranchId = requestedBranchId && branchesList.some((b) => b.id === requestedBranchId)
    ? requestedBranchId
    : getActiveBranchId();
  setActiveBranchId(activeBranchId);
  const activeBranchObj =
    branchesList.find((b) => b.id === activeBranchId) || branchesList[0] || DEFAULT_SUPPLY_BRANCHES[0];
  const isDefaultBranch = activeBranchId === DEFAULT_BRANCH_ID;
  const scopedKeys = getScopedKeysForBranch(activeBranchId);

  try {
    // 1. Read local state from localStorage first so we can compare timestamps & detect untouched default seed
    interface PreloadedStatePayload extends Partial<AppState> {
      exportTimestamp?: string;
    }
    const preloaded =
      isDefaultBranch && typeof window !== 'undefined'
        ? (window as unknown as { PRELOADED_TAMWEEN_STATE?: PreloadedStatePayload })
            .PRELOADED_TAMWEEN_STATE
        : undefined;

    let bakeries: Bakery[] | null = null;
    let debts: DebtRecord[] | null = null;
    let villages: VillageHierarchy[] | null = null;
    let issuingEntities: string[] | null = null;
    let violationTypes: string[] | null = null;
    let activityStatuses: string[] | null = null;
    let bakeryCategories: string[] | null = null;
    let breadTypes: string[] | null = null;
    let breadTypeCounts: string[] | null = null;
    let lineTypes: string[] | null = null;
    let fuelTypes: string[] | null = null;
    let paymentMethods: string[] | null = null;
    let dailyTasks: DailyBakeryTask[] | null = null;
    let inboxMessages: InboxChatMessage[] | null = null;
    let columnTitles: ColumnTitles | null = null;
    let systemConfig: SystemConfig | null = null;
    let users: AppUser[] | null = null;
    let localTimestamp = '';
    let hasExplicitUserSave = false;

    try {
      localTimestamp = localStorage.getItem(scopedKeys.AUTOSAVE_TIMESTAMP) || '';
      hasExplicitUserSave =
        localStorage.getItem(isDefaultBranch ? 'TAMWEEN_EXPLICIT_USER_SAVE' : `TAMWEEN_EXPLICIT_USER_SAVE__${activeBranchId}`) === 'true';
      if (localStorage.getItem(scopedKeys.BAKERIES)) {
        bakeries = JSON.parse(localStorage.getItem(scopedKeys.BAKERIES)!);
      }
      if (localStorage.getItem(scopedKeys.DEBTS)) {
        debts = JSON.parse(localStorage.getItem(scopedKeys.DEBTS)!);
      }
      if (localStorage.getItem(scopedKeys.VILLAGES)) {
        villages = JSON.parse(localStorage.getItem(scopedKeys.VILLAGES)!);
      }
      if (localStorage.getItem(scopedKeys.ENTITIES)) {
        issuingEntities = JSON.parse(localStorage.getItem(scopedKeys.ENTITIES)!);
      }
      if (localStorage.getItem(scopedKeys.VIOLATIONS)) {
        violationTypes = JSON.parse(localStorage.getItem(scopedKeys.VIOLATIONS)!);
      }
      if (localStorage.getItem(scopedKeys.ACTIVITY_STATUSES)) {
        activityStatuses = JSON.parse(localStorage.getItem(scopedKeys.ACTIVITY_STATUSES)!);
      }
      if (localStorage.getItem(scopedKeys.BAKERY_CATEGORIES)) {
        bakeryCategories = JSON.parse(localStorage.getItem(scopedKeys.BAKERY_CATEGORIES)!);
      }
      if (localStorage.getItem(scopedKeys.BREAD_TYPES)) {
        breadTypes = JSON.parse(localStorage.getItem(scopedKeys.BREAD_TYPES)!);
      }
      if (localStorage.getItem(scopedKeys.BREAD_TYPE_COUNTS)) {
        breadTypeCounts = JSON.parse(localStorage.getItem(scopedKeys.BREAD_TYPE_COUNTS)!);
      }
      if (localStorage.getItem(scopedKeys.LINE_TYPES)) {
        lineTypes = JSON.parse(localStorage.getItem(scopedKeys.LINE_TYPES)!);
      }
      if (localStorage.getItem(scopedKeys.FUEL_TYPES)) {
        fuelTypes = JSON.parse(localStorage.getItem(scopedKeys.FUEL_TYPES)!);
      }
      if (localStorage.getItem(scopedKeys.PAYMENT_METHODS)) {
        paymentMethods = JSON.parse(localStorage.getItem(scopedKeys.PAYMENT_METHODS)!);
      }
      if (localStorage.getItem(scopedKeys.DAILY_TASKS)) {
        dailyTasks = JSON.parse(localStorage.getItem(scopedKeys.DAILY_TASKS)!);
      }
      if (localStorage.getItem(scopedKeys.INBOX_MESSAGES)) {
        inboxMessages = JSON.parse(localStorage.getItem(scopedKeys.INBOX_MESSAGES)!);
      }
      if (localStorage.getItem(scopedKeys.COLUMNS)) {
        columnTitles = JSON.parse(localStorage.getItem(scopedKeys.COLUMNS)!);
      }
      if (localStorage.getItem(scopedKeys.CONFIG)) {
        systemConfig = JSON.parse(localStorage.getItem(scopedKeys.CONFIG)!);
      }
      if (localStorage.getItem(scopedKeys.USERS)) {
        users = JSON.parse(localStorage.getItem(scopedKeys.USERS)!);
      }
    } catch (lsErr) {
      console.warn('LocalStorage read error or restricted:', lsErr);
    }

    // Session check helper
    const resolveCurrentUser = (activeUsersList: AppUser[]): AppUser | null => {
      try {
        const savedSessionStr = sessionStorage.getItem(BASE_KEYS.SESSION);
        localStorage.removeItem('TAMWEEN_GMAIL_DRIVE_PASSWORD');
        if (savedSessionStr) {
          const parsedSession: AppUser = JSON.parse(savedSessionStr);
          const match = activeUsersList.find(
            (u) => u.id === parsedSession.id || u.username === parsedSession.username
          );
          if (match) return match;
        }
      } catch {}
      return null;
    };

    // Read global role permissions & labels shared across all branches
    let globalRoleConfig: { rolePermissions?: SystemConfig['rolePermissions']; roleLabels?: SystemConfig['roleLabels'] } = {};
    try {
      if (typeof localStorage !== 'undefined') {
        const rawGlobalRole = localStorage.getItem(BRANCH_META_KEYS.GLOBAL_ROLE_CONFIG);
        if (rawGlobalRole) {
          globalRoleConfig = JSON.parse(rawGlobalRole) || {};
        }
      }
    } catch {}

    // 2. Fetch latest database from Cloud / Supabase to sync unified users/passwords/permissions, branches list, and branch data across devices
    let cloudHasData = false;
    let supaRes: Awaited<ReturnType<typeof fetchDatabaseFromSupabase>> | null = null;
    try {
      supaRes = await fetchDatabaseFromSupabase();
      if (supaRes && supaRes.success && supaRes.data) {
        // Sync unified users (passwords, roles, permissions) from cloud across all devices & branches
        if (Array.isArray(supaRes.data.users) && supaRes.data.users.length > 0) {
          users = mergeUsersList(users, supaRes.data.users);
          try {
            localStorage.setItem(BASE_KEYS.USERS, JSON.stringify(users));
          } catch {}
        }
        // Sync global rolePermissions & roleLabels across devices
        if (supaRes.data.systemConfig?.rolePermissions || supaRes.data.systemConfig?.roleLabels) {
          globalRoleConfig = {
            rolePermissions: supaRes.data.systemConfig.rolePermissions || globalRoleConfig.rolePermissions,
            roleLabels: supaRes.data.systemConfig.roleLabels || globalRoleConfig.roleLabels,
          };
          try {
            localStorage.setItem(BRANCH_META_KEYS.GLOBAL_ROLE_CONFIG, JSON.stringify(globalRoleConfig));
          } catch {}
        }
        // Sync branches list across devices
        if (Array.isArray(supaRes.data.branches) && supaRes.data.branches.length > 0) {
          const branchMap = new Map<string, SupplyBranch>();
          branchesList.forEach((b) => branchMap.set(b.id, b));
          supaRes.data.branches.forEach((b) => {
            if (b && b.id && b.name) branchMap.set(b.id, b);
          });
          const mergedBranches = Array.from(branchMap.values());
          saveBranchesList(mergedBranches);
        }
        // Sync isolated non-default branch partitions across devices if present
        const remotePartitions = (supaRes.data as unknown as { branchPartitions?: Record<string, Partial<AppState>> }).branchPartitions;
        if (remotePartitions && typeof remotePartitions === 'object') {
          Object.entries(remotePartitions).forEach(([bId, part]) => {
            if (!bId || bId === DEFAULT_BRANCH_ID || !part) return;
            const bKeys = getScopedKeysForBranch(bId);
            try {
              const existingBakeRaw = localStorage.getItem(bKeys.BAKERIES);
              const existingBake = existingBakeRaw ? JSON.parse(existingBakeRaw) : [];
              if ((!existingBake || existingBake.length === 0) && Array.isArray(part.bakeries) && part.bakeries.length > 0) {
                localStorage.setItem(bKeys.BAKERIES, JSON.stringify(part.bakeries));
                if (bId === activeBranchId) bakeries = part.bakeries;
              }
              const existingDebtsRaw = localStorage.getItem(bKeys.DEBTS);
              const existingDebts = existingDebtsRaw ? JSON.parse(existingDebtsRaw) : [];
              if ((!existingDebts || existingDebts.length === 0) && Array.isArray(part.debts) && part.debts.length > 0) {
                localStorage.setItem(bKeys.DEBTS, JSON.stringify(part.debts));
                if (bId === activeBranchId) debts = part.debts;
              }
              const existingVillagesRaw = localStorage.getItem(bKeys.VILLAGES);
              const existingVillages = existingVillagesRaw ? JSON.parse(existingVillagesRaw) : [];
              if ((!existingVillages || existingVillages.length === 0) && Array.isArray(part.villages) && part.villages.length > 0) {
                localStorage.setItem(bKeys.VILLAGES, JSON.stringify(part.villages));
                if (bId === activeBranchId) villages = part.villages;
              }
            } catch {}
          });
        }
      }
    } catch (supaErr) {
      console.warn('Cloud boot load skipped or network offline:', supaErr);
    }

    const updatedBranchesList = getBranchesList();
    const resolvedBranchObj =
      updatedBranchesList.find((b) => b.id === activeBranchId) || activeBranchObj;

    // For non-default branches (e.g., سمنود or any newly added branch), return strictly isolated state with unified users & permissions
    if (!isDefaultBranch) {
      const syncedIsolated = synchronizeBakeryAndDebts(
        (bakeries ?? []).map(normalizeBakeryPerCapita),
        debts ?? []
      );
      const isolatedUsers = users ?? INITIAL_USERS;
      const isolatedConfig: SystemConfig = {
        ...DEFAULT_SYSTEM_CONFIG,
        ...(systemConfig || {}),
        ...(globalRoleConfig.rolePermissions ? { rolePermissions: globalRoleConfig.rolePermissions } : {}),
        ...(globalRoleConfig.roleLabels ? { roleLabels: globalRoleConfig.roleLabels } : {}),
        governorateTitle: resolvedBranchObj.governorateTitle || 'محافظة الغربية',
        directorateTitle: resolvedBranchObj.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
        administrationTitle: resolvedBranchObj.name,
        logoBase64: DEFAULT_OFFICIAL_LOGO,
      };
      const isolatedState: AppState = {
        activeBranchId,
        branches: updatedBranchesList,
        bakeries: syncedIsolated.bakeries,
        debts: syncedIsolated.debts,
        villages: villages ?? [],
        issuingEntities: issuingEntities ?? DEFAULT_ISSUING_ENTITIES,
        violationTypes: violationTypes ?? DEFAULT_VIOLATION_TYPES,
        activityStatuses: activityStatuses ?? DEFAULT_ACTIVITY_STATUSES,
        bakeryCategories: bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES,
        breadTypes: breadTypes ?? DEFAULT_BREAD_TYPES,
        breadTypeCounts: breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS,
        lineTypes: lineTypes ?? DEFAULT_LINE_TYPES,
        fuelTypes: fuelTypes ?? DEFAULT_FUEL_TYPES,
        paymentMethods: paymentMethods ?? PAYMENT_METHODS,
        dailyTasks: dailyTasks ?? [],
        inboxMessages: inboxMessages ?? [],
        columnTitles: columnTitles ? { ...DEFAULT_COLUMN_TITLES, ...columnTitles } : DEFAULT_COLUMN_TITLES,
        systemConfig: isolatedConfig,
        users: isolatedUsers,
        currentUser: resolveCurrentUser(isolatedUsers),
      };
      try {
        localStorage.setItem(scopedKeys.INITIALIZED, 'true');
      } catch {}
      return isolatedState;
    }

    const isUntouchedDefault =
      !hasExplicitUserSave && isDefaultSeedState(bakeries, debts);
    const localTimeMs =
      !isUntouchedDefault && localTimestamp ? Date.parse(localTimestamp) || 0 : 0;

    if (
      supaRes &&
      supaRes.success &&
      supaRes.data &&
      (Array.isArray(supaRes.data.bakeries) || Array.isArray(supaRes.data.debts))
    ) {
      cloudHasData = true;
      const cloudTimeMs = supaRes.timestamp ? Date.parse(supaRes.timestamp) || Date.now() : Date.now();

      // Adopt cloud state if local state is untouched default seed, empty, or older/equal to cloud
      if (
        isUntouchedDefault ||
        !bakeries ||
        bakeries.length === 0 ||
        cloudTimeMs >= localTimeMs
      ) {
        const syncedCloud = synchronizeBakeryAndDebts(
          (supaRes.data.bakeries || []).map(normalizeBakeryPerCapita),
          supaRes.data.debts ?? []
        );
        const adoptedUsers = mergeUsersList(users, supaRes.data.users);
        const adoptedState: AppState = {
          activeBranchId,
          branches: updatedBranchesList,
          bakeries: syncedCloud.bakeries,
          debts: syncedCloud.debts,
          villages: supaRes.data.villages ?? DEFAULT_VILLAGES_HIERARCHY,
          issuingEntities: supaRes.data.issuingEntities ?? DEFAULT_ISSUING_ENTITIES,
          violationTypes: supaRes.data.violationTypes ?? DEFAULT_VIOLATION_TYPES,
          activityStatuses: supaRes.data.activityStatuses ?? DEFAULT_ACTIVITY_STATUSES,
          bakeryCategories: supaRes.data.bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES,
          breadTypes: supaRes.data.breadTypes ?? DEFAULT_BREAD_TYPES,
          breadTypeCounts: supaRes.data.breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS,
          lineTypes: supaRes.data.lineTypes ?? DEFAULT_LINE_TYPES,
          fuelTypes: supaRes.data.fuelTypes ?? DEFAULT_FUEL_TYPES,
          paymentMethods: supaRes.data.paymentMethods ?? PAYMENT_METHODS,
          dailyTasks: supaRes.data.dailyTasks ?? INITIAL_DAILY_TASKS,
          inboxMessages: supaRes.data.inboxMessages ?? INITIAL_INBOX_MESSAGES,
          columnTitles: supaRes.data.columnTitles
            ? { ...DEFAULT_COLUMN_TITLES, ...supaRes.data.columnTitles }
            : DEFAULT_COLUMN_TITLES,
          systemConfig: {
            ...DEFAULT_SYSTEM_CONFIG,
            ...(supaRes.data.systemConfig || {}),
            ...(globalRoleConfig.rolePermissions ? { rolePermissions: globalRoleConfig.rolePermissions } : {}),
            ...(globalRoleConfig.roleLabels ? { roleLabels: globalRoleConfig.roleLabels } : {}),
            administrationTitle: resolvedBranchObj.name,
            logoBase64: DEFAULT_OFFICIAL_LOGO,
          },
          users: adoptedUsers,
          currentUser: resolveCurrentUser(adoptedUsers),
        };

        try {
          localStorage.setItem(scopedKeys.INITIALIZED, 'true');
        } catch {}

        // Persist locally WITHOUT re-pushing to cloud
        persistFullState(adoptedState, {
          skipCloudSync: true,
          customTimestamp: supaRes.timestamp,
        }).catch(() => {});

        return adoptedState;
      }
    }

    // 3. If standalone preloaded file is opened, adopt only if local state is empty
    if (preloaded && preloaded.bakeries && preloaded.bakeries.length > 0) {
      if (!bakeries || bakeries.length === 0) {
        bakeries = preloaded.bakeries.map(normalizeBakeryPerCapita);
        debts = preloaded.debts ?? INITIAL_DEBTS;
        villages = preloaded.villages ?? DEFAULT_VILLAGES_HIERARCHY;
        issuingEntities = preloaded.issuingEntities ?? DEFAULT_ISSUING_ENTITIES;
        violationTypes = preloaded.violationTypes ?? DEFAULT_VIOLATION_TYPES;
        activityStatuses = preloaded.activityStatuses ?? DEFAULT_ACTIVITY_STATUSES;
        bakeryCategories = preloaded.bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES;
        breadTypes = preloaded.breadTypes ?? DEFAULT_BREAD_TYPES;
        breadTypeCounts = preloaded.breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS;
        lineTypes = preloaded.lineTypes ?? DEFAULT_LINE_TYPES;
        fuelTypes = preloaded.fuelTypes ?? DEFAULT_FUEL_TYPES;
        paymentMethods = preloaded.paymentMethods ?? PAYMENT_METHODS;
        dailyTasks = preloaded.dailyTasks ?? INITIAL_DAILY_TASKS;
        inboxMessages = preloaded.inboxMessages ?? INITIAL_INBOX_MESSAGES;
        columnTitles = preloaded.columnTitles ?? DEFAULT_COLUMN_TITLES;
        systemConfig = preloaded.systemConfig ?? DEFAULT_SYSTEM_CONFIG;
        users = preloaded.users ?? INITIAL_USERS;
      }
    } else if (!bakeries || bakeries.length === 0) {
      // First run default seed in memory (do not push default seed to cloud)
      bakeries = INITIAL_BAKERIES.map(normalizeBakeryPerCapita);
      debts = INITIAL_DEBTS;
      villages = DEFAULT_VILLAGES_HIERARCHY;
      issuingEntities = DEFAULT_ISSUING_ENTITIES;
      violationTypes = DEFAULT_VIOLATION_TYPES;
      activityStatuses = DEFAULT_ACTIVITY_STATUSES;
      bakeryCategories = DEFAULT_BAKERY_CATEGORIES;
      breadTypes = DEFAULT_BREAD_TYPES;
      breadTypeCounts = DEFAULT_BREAD_TYPE_COUNTS;
      lineTypes = DEFAULT_LINE_TYPES;
      fuelTypes = DEFAULT_FUEL_TYPES;
      paymentMethods = PAYMENT_METHODS;
      dailyTasks = INITIAL_DAILY_TASKS;
      inboxMessages = INITIAL_INBOX_MESSAGES;
      columnTitles = DEFAULT_COLUMN_TITLES;
      systemConfig = {
        ...DEFAULT_SYSTEM_CONFIG,
        ...(globalRoleConfig.rolePermissions ? { rolePermissions: globalRoleConfig.rolePermissions } : {}),
        ...(globalRoleConfig.roleLabels ? { roleLabels: globalRoleConfig.roleLabels } : {}),
      };
      users = users && users.length > 0 ? users : INITIAL_USERS;

      try {
        localStorage.setItem(scopedKeys.INITIALIZED, 'true');
      } catch {}
    }

    // 4. Fallback defaults if any section is empty
    const syncedInitial = synchronizeBakeryAndDebts(
      (bakeries ?? INITIAL_BAKERIES).map(normalizeBakeryPerCapita),
      debts ?? INITIAL_DEBTS
    );
    bakeries = syncedInitial.bakeries;
    debts = syncedInitial.debts;
    villages = villages ?? DEFAULT_VILLAGES_HIERARCHY;
    issuingEntities = issuingEntities ?? DEFAULT_ISSUING_ENTITIES;
    violationTypes = violationTypes ?? DEFAULT_VIOLATION_TYPES;
    activityStatuses = activityStatuses ?? DEFAULT_ACTIVITY_STATUSES;
    bakeryCategories = bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES;
    breadTypes = breadTypes ?? DEFAULT_BREAD_TYPES;
    breadTypeCounts = breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS;
    lineTypes = lineTypes ?? DEFAULT_LINE_TYPES;
    fuelTypes = fuelTypes ?? DEFAULT_FUEL_TYPES;
    paymentMethods = paymentMethods ?? PAYMENT_METHODS;
    dailyTasks = dailyTasks ?? INITIAL_DAILY_TASKS;
    inboxMessages = inboxMessages ?? INITIAL_INBOX_MESSAGES;
    columnTitles = columnTitles ?? DEFAULT_COLUMN_TITLES;
    systemConfig = systemConfig
      ? {
          ...DEFAULT_SYSTEM_CONFIG,
          ...systemConfig,
          ...(globalRoleConfig.rolePermissions ? { rolePermissions: globalRoleConfig.rolePermissions } : {}),
          ...(globalRoleConfig.roleLabels ? { roleLabels: globalRoleConfig.roleLabels } : {}),
        }
      : {
          ...DEFAULT_SYSTEM_CONFIG,
          ...(globalRoleConfig.rolePermissions ? { rolePermissions: globalRoleConfig.rolePermissions } : {}),
          ...(globalRoleConfig.roleLabels ? { roleLabels: globalRoleConfig.roleLabels } : {}),
        };
    systemConfig.administrationTitle = activeBranchObj.name;
    systemConfig.logoBase64 = DEFAULT_OFFICIAL_LOGO;
    users = users && users.length > 0 ? users : INITIAL_USERS;

    if (columnTitles) {
      columnTitles = {
        ...DEFAULT_COLUMN_TITLES,
        ...columnTitles,
      };
      if (columnTitles.insuranceQuota && columnTitles.insuranceQuota.includes('شوال')) {
        columnTitles.insuranceQuota = columnTitles.insuranceQuota.replace(/شوال/g, 'شيكارة');
      }
      if (columnTitles.actualQuota && columnTitles.actualQuota.includes('شوال')) {
        columnTitles.actualQuota = columnTitles.actualQuota.replace(/شوال/g, 'شيكارة');
      }
      if (
        !columnTitles.bakeryCategory ||
        columnTitles.bakeryCategory === 'تصنيف المخبز' ||
        columnTitles.bakeryCategory === 'مخبز بلدي مدعم'
      ) {
        columnTitles.bakeryCategory = 'نوع المخابز';
      }
      if (!columnTitles.flourBagPrice) {
        columnTitles.flourBagPrice = 'سعر الشيكارة';
      }
      if (
        !columnTitles.perCapitaAverage ||
        columnTitles.perCapitaAverage === 'متوسط الفرد للمخبز'
      ) {
        columnTitles.perCapitaAverage = 'متوسط نصيب الفرد للمخبز';
      }
      if (columnTitles.beneficiaries2023 === 'مستفيدي 2023') {
        columnTitles.beneficiaries2023 = 'مستفيد عام 2023';
      }
      if (columnTitles.beneficiaries2024 === 'مستفيدي 2024') {
        columnTitles.beneficiaries2024 = 'مستفيدين عام 2024';
      }
      if (columnTitles.beneficiaries2025 === 'مستفيدي 2025') {
        columnTitles.beneficiaries2025 = 'مستفيدين عام 2025';
      }
      if (columnTitles.avg2023 === 'متوسط 2023') {
        columnTitles.avg2023 = 'متوسط عام 2023';
      }
      if (columnTitles.avg2024 === 'متوسط 2024') {
        columnTitles.avg2024 = 'متوسط عام 2024';
      }
      if (columnTitles.avg2025 === 'متوسط 2025') {
        columnTitles.avg2025 = 'متوسط عام 2025';
      }
    }

    const activeUsers = users ?? INITIAL_USERS;
    const currentUser = resolveCurrentUser(activeUsers);

    const finalLocalState: AppState = {
      activeBranchId,
      branches: branchesList,
      bakeries,
      debts,
      villages,
      issuingEntities,
      violationTypes,
      activityStatuses,
      bakeryCategories,
      breadTypes,
      breadTypeCounts,
      lineTypes,
      fuelTypes,
      paymentMethods,
      dailyTasks,
      inboxMessages,
      columnTitles,
      systemConfig,
      users: activeUsers,
      currentUser,
    };

    // If this device has newer user-recorded data than the cloud, push it to the cloud immediately so all other devices sync!
    if (isDefaultBranch) {
      if (!isUntouchedDefault && bakeries && bakeries.length > 0) {
        autoSyncToSupabase(
          finalLocalState,
          true,
          localTimestamp || new Date().toISOString()
        ).catch(() => {});
      } else if (!cloudHasData && !isDefaultSeedState(bakeries, debts)) {
        autoSyncToSupabase(
          finalLocalState,
          true,
          localTimestamp || new Date().toISOString()
        ).catch(() => {});
      }
    }

    return finalLocalState;
  } catch (criticalErr) {
    console.error('Critical fallback in loadInitialState:', criticalErr);
    if (!isDefaultBranch) {
      return {
        activeBranchId,
        branches: branchesList,
        bakeries: [],
        debts: [],
        villages: [],
        issuingEntities: DEFAULT_ISSUING_ENTITIES,
        violationTypes: DEFAULT_VIOLATION_TYPES,
        activityStatuses: DEFAULT_ACTIVITY_STATUSES,
        bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
        breadTypes: DEFAULT_BREAD_TYPES,
        breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
        lineTypes: DEFAULT_LINE_TYPES,
        fuelTypes: DEFAULT_FUEL_TYPES,
        paymentMethods: PAYMENT_METHODS,
        dailyTasks: [],
        inboxMessages: [],
        columnTitles: DEFAULT_COLUMN_TITLES,
        systemConfig: {
          ...DEFAULT_SYSTEM_CONFIG,
          governorateTitle: activeBranchObj.governorateTitle,
          directorateTitle: activeBranchObj.directorateTitle,
          administrationTitle: activeBranchObj.name,
          logoBase64: DEFAULT_OFFICIAL_LOGO,
        },
        users: INITIAL_USERS,
        currentUser: null,
      };
    }
    const fallbackSync = synchronizeBakeryAndDebts(
      INITIAL_BAKERIES.map(normalizeBakeryPerCapita),
      INITIAL_DEBTS
    );
    return {
      activeBranchId,
      branches: branchesList,
      bakeries: fallbackSync.bakeries,
      debts: fallbackSync.debts,
      villages: DEFAULT_VILLAGES_HIERARCHY,
      issuingEntities: DEFAULT_ISSUING_ENTITIES,
      violationTypes: DEFAULT_VIOLATION_TYPES,
      activityStatuses: DEFAULT_ACTIVITY_STATUSES,
      bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
      breadTypes: DEFAULT_BREAD_TYPES,
      breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
      lineTypes: DEFAULT_LINE_TYPES,
      fuelTypes: DEFAULT_FUEL_TYPES,
      paymentMethods: PAYMENT_METHODS,
      dailyTasks: INITIAL_DAILY_TASKS,
      inboxMessages: INITIAL_INBOX_MESSAGES,
      columnTitles: DEFAULT_COLUMN_TITLES,
      systemConfig: DEFAULT_SYSTEM_CONFIG,
      users: INITIAL_USERS,
      currentUser: null,
    };
  }
}

// Persist both to IndexedDB and LocalStorage synchronously & asynchronously (strictly scoped to active branch)
export async function persistFullState(
  state: Omit<AppState, 'currentUser'> & { currentUser?: AppUser | null },
  options?: { skipCloudSync?: boolean; customTimestamp?: string }
): Promise<void> {
  const targetBranchId = state.activeBranchId || getActiveBranchId();
  const isDefaultBranch = targetBranchId === DEFAULT_BRANCH_ID;
  const scopedKeys = getScopedKeysForBranch(targetBranchId);
  const branchesList = state.branches || getBranchesList();
  const branchObj = branchesList.find((b) => b.id === targetBranchId);

  const {
    bakeries,
    debts,
    villages,
    issuingEntities,
    violationTypes,
    activityStatuses,
    bakeryCategories = DEFAULT_BAKERY_CATEGORIES,
    breadTypes = DEFAULT_BREAD_TYPES,
    breadTypeCounts = DEFAULT_BREAD_TYPE_COUNTS,
    lineTypes = DEFAULT_LINE_TYPES,
    fuelTypes = DEFAULT_FUEL_TYPES,
    paymentMethods = PAYMENT_METHODS,
    dailyTasks = isDefaultBranch ? INITIAL_DAILY_TASKS : [],
    inboxMessages = isDefaultBranch ? INITIAL_INBOX_MESSAGES : [],
    columnTitles,
    systemConfig,
    users,
  } = state;

  const synced = synchronizeBakeryAndDebts(
    (bakeries || []).map(normalizeBakeryPerCapita),
    debts || []
  );
  const normalizedBakeries = synced.bakeries;
  const normalizedDebts = synced.debts;

  // Guarantee official Egyptian Ministry logo and branch administration title are locked in saved config
  const lockedConfig: SystemConfig = {
    ...(systemConfig || DEFAULT_SYSTEM_CONFIG),
    administrationTitle: branchObj?.name || systemConfig?.administrationTitle || DEFAULT_SYSTEM_CONFIG.administrationTitle,
    logoBase64: DEFAULT_OFFICIAL_LOGO,
  };

  const snapshotTimestamp = options?.customTimestamp || new Date().toISOString();

  // LocalStorage (strictly scoped to targetBranchId, with unified users & role permissions)
  try {
    localStorage.removeItem('TAMWEEN_GMAIL_DRIVE_PASSWORD');
    if (!options?.skipCloudSync) {
      localStorage.setItem(
        isDefaultBranch ? 'TAMWEEN_EXPLICIT_USER_SAVE' : `TAMWEEN_EXPLICIT_USER_SAVE__${targetBranchId}`,
        'true'
      );
    }
    if (lockedConfig.rolePermissions || lockedConfig.roleLabels) {
      localStorage.setItem(
        BRANCH_META_KEYS.GLOBAL_ROLE_CONFIG,
        JSON.stringify({
          rolePermissions: lockedConfig.rolePermissions,
          roleLabels: lockedConfig.roleLabels,
        })
      );
    }
    localStorage.setItem(scopedKeys.AUTOSAVE_TIMESTAMP, snapshotTimestamp);
    localStorage.setItem(scopedKeys.BAKERIES, JSON.stringify(normalizedBakeries));
    localStorage.setItem(scopedKeys.DEBTS, JSON.stringify(normalizedDebts));
    localStorage.setItem(scopedKeys.VILLAGES, JSON.stringify(villages));
    localStorage.setItem(scopedKeys.ENTITIES, JSON.stringify(issuingEntities));
    localStorage.setItem(scopedKeys.VIOLATIONS, JSON.stringify(violationTypes));
    localStorage.setItem(scopedKeys.ACTIVITY_STATUSES, JSON.stringify(activityStatuses));
    localStorage.setItem(scopedKeys.BAKERY_CATEGORIES, JSON.stringify(bakeryCategories));
    localStorage.setItem(scopedKeys.BREAD_TYPES, JSON.stringify(breadTypes));
    localStorage.setItem(scopedKeys.BREAD_TYPE_COUNTS, JSON.stringify(breadTypeCounts));
    localStorage.setItem(scopedKeys.LINE_TYPES, JSON.stringify(lineTypes));
    localStorage.setItem(scopedKeys.FUEL_TYPES, JSON.stringify(fuelTypes));
    localStorage.setItem(scopedKeys.PAYMENT_METHODS, JSON.stringify(paymentMethods));
    localStorage.setItem(scopedKeys.DAILY_TASKS, JSON.stringify(dailyTasks));
    localStorage.setItem(scopedKeys.INBOX_MESSAGES, JSON.stringify(inboxMessages));
    localStorage.setItem(scopedKeys.COLUMNS, JSON.stringify(columnTitles));
    localStorage.setItem(scopedKeys.CONFIG, JSON.stringify(lockedConfig));
    localStorage.setItem(BASE_KEYS.USERS, JSON.stringify(users));
  } catch (err) {
    console.warn('LocalStorage quota limit reached, relying primarily on IndexedDB', err);
  }

  const backupSnapshot = {
    timestamp: snapshotTimestamp,
    branchId: targetBranchId,
    gmailEmail: lockedConfig.gmailEmail ?? localStorage.getItem('TAMWEEN_GMAIL_DRIVE_EMAIL') ?? '',
    state: {
      activeBranchId: targetBranchId,
      branches: branchesList,
      bakeries: normalizedBakeries,
      debts: normalizedDebts,
      villages,
      issuingEntities,
      violationTypes,
      activityStatuses,
      bakeryCategories,
      breadTypes,
      breadTypeCounts,
      lineTypes,
      fuelTypes,
      paymentMethods,
      dailyTasks,
      inboxMessages,
      columnTitles,
      systemConfig: lockedConfig,
      users,
    },
  };

  // Single-transaction IndexedDB batch write (zero UI lag, scoped to branch, unified users)
  await idbSetBatch([
    [scopedKeys.BAKERIES, normalizedBakeries],
    [scopedKeys.DEBTS, normalizedDebts],
    [scopedKeys.VILLAGES, villages],
    [scopedKeys.ENTITIES, issuingEntities],
    [scopedKeys.VIOLATIONS, violationTypes],
    [scopedKeys.ACTIVITY_STATUSES, activityStatuses],
    [scopedKeys.BAKERY_CATEGORIES, bakeryCategories],
    [scopedKeys.BREAD_TYPES, breadTypes],
    [scopedKeys.BREAD_TYPE_COUNTS, breadTypeCounts],
    [scopedKeys.LINE_TYPES, lineTypes],
    [scopedKeys.FUEL_TYPES, fuelTypes],
    [scopedKeys.PAYMENT_METHODS, paymentMethods],
    [scopedKeys.DAILY_TASKS, dailyTasks],
    [scopedKeys.INBOX_MESSAGES, inboxMessages],
    [scopedKeys.COLUMNS, columnTitles],
    [scopedKeys.CONFIG, lockedConfig],
    [BASE_KEYS.USERS, users],
    [scopedKeys.AUTOSAVE_BACKUP, backupSnapshot],
  ]);

  // Defer secondary snapshot serialization & cloud/disk sync off the main UI thread
  setTimeout(() => {
    try {
      const serializedSnapshot = JSON.stringify(backupSnapshot);
      localStorage.setItem(scopedKeys.AUTOSAVE_BACKUP, serializedSnapshot);

      if (!options?.skipCloudSync) {
        // Collect isolated branch partitions for non-default branches so each branch stays 100% isolated across devices
        const branchPartitions: Record<string, { bakeries: Bakery[]; debts: DebtRecord[]; villages: VillageHierarchy[] }> = {};
        branchesList.forEach((b) => {
          if (b.id !== DEFAULT_BRANCH_ID) {
            if (b.id === targetBranchId) {
              branchPartitions[b.id] = {
                bakeries: normalizedBakeries,
                debts: normalizedDebts,
                villages,
              };
            } else {
              try {
                const bKeys = getScopedKeysForBranch(b.id);
                const rawB = localStorage.getItem(bKeys.BAKERIES);
                const rawD = localStorage.getItem(bKeys.DEBTS);
                const rawV = localStorage.getItem(bKeys.VILLAGES);
                branchPartitions[b.id] = {
                  bakeries: rawB ? JSON.parse(rawB) : [],
                  debts: rawD ? JSON.parse(rawD) : [],
                  villages: rawV ? JSON.parse(rawV) : [],
                };
              } catch {}
            }
          }
        });

        let defaultBranchBakeries = normalizedBakeries;
        let defaultBranchDebts = normalizedDebts;
        let defaultBranchVillages = villages;
        if (!isDefaultBranch) {
          try {
            const rawDefB = localStorage.getItem(BASE_KEYS.BAKERIES);
            const rawDefD = localStorage.getItem(BASE_KEYS.DEBTS);
            const rawDefV = localStorage.getItem(BASE_KEYS.VILLAGES);
            defaultBranchBakeries = rawDefB ? JSON.parse(rawDefB) : INITIAL_BAKERIES;
            defaultBranchDebts = rawDefD ? JSON.parse(rawDefD) : INITIAL_DEBTS;
            defaultBranchVillages = rawDefV ? JSON.parse(rawDefV) : DEFAULT_VILLAGES_HIERARCHY;
          } catch {}
        }

        const cloudStatePayload = {
          ...backupSnapshot.state,
          activeBranchId: DEFAULT_BRANCH_ID,
          branches: branchesList,
          bakeries: defaultBranchBakeries,
          debts: defaultBranchDebts,
          villages: defaultBranchVillages,
          users,
          branchPartitions,
        };

        if (isDefaultBranch) {
          const driveAutoSync =
            lockedConfig.googleDriveAutoSync !== false &&
            localStorage.getItem('TAMWEEN_GMAIL_DRIVE_AUTOSYNC') !== 'false';
          if (driveAutoSync) {
            const gmailKey = (
              lockedConfig.gmailEmail ||
              localStorage.getItem('TAMWEEN_GMAIL_DRIVE_EMAIL') ||
              'ELHOSINY2020@gmail.com'
            )
              .trim()
              .toLowerCase();
            const drivePayloadStr = JSON.stringify({
              version: '3.0-google-drive-autosync',
              timestamp: backupSnapshot.timestamp,
              gmailEmail: gmailKey,
              destinationType: 'GOOGLE_DRIVE',
              targetPath: localStorage.getItem('TAMWEEN_CUSTOM_BACKUP_PATH') || 'G:\\My Drive\\Tamween_Backups\\',
              bakeriesCount: defaultBranchBakeries.length,
              debtsCount: defaultBranchDebts.length,
              data: cloudStatePayload,
            });
            localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PAYLOAD', drivePayloadStr);
            localStorage.setItem(`TAMWEEN_GMAIL_DRIVE_SYNC_${gmailKey}`, drivePayloadStr);
          }
        }

        autoSyncToSupabase(
          cloudStatePayload as unknown as AppState,
          true,
          backupSnapshot.timestamp
        ).catch(() => {});

        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('tamween_cross_device_sync');
            bc.postMessage({ type: 'STATE_UPDATED', timestamp: backupSnapshot.timestamp, branchId: targetBranchId });
            bc.close();
          } catch {}
        }
      }
    } catch {
      // Graceful fallback
    }
  }, 0);
}

export const OFFICIAL_CLOUD_API_URL =
  'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app/api/backup/snapshot';

/**
 * إرسال ومزامنة أحدث بيانات المنظومة إلى الخادم السحابي المشترك لمشاركتها مع جميع الأجهزة
 */
export async function syncStateToServer(state: Partial<AppState>): Promise<boolean> {
  try {
    const isCloudHost =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('run.app') || window.location.hostname === 'localhost');
    const targetUrl = isCloudHost ? '/api/backup/snapshot' : OFFICIAL_CLOUD_API_URL;

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return resp.ok;
  } catch (err) {
    console.warn('syncStateToServer background failure (non-critical):', err);
    return false;
  }
}

/**
 * جلب أحدث نسخة احتياطية محفوظة من الخادم السحابي المشترك (لتحديث الأجهزة الأخرى فوراً)
 */
export async function fetchLatestServerState(): Promise<{
  savedAt: string;
  data: Partial<AppState>;
  bakeriesCount: number;
  debtsCount: number;
} | null> {
  try {
    const isCloudHost =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('run.app') || window.location.hostname === 'localhost');
    const targetUrl = isCloudHost ? '/api/backup/snapshot' : OFFICIAL_CLOUD_API_URL;

    const resp = await fetch(targetUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.success && json.exists && json.snapshot?.data) {
      return json.snapshot;
    }
    return null;
  } catch (err) {
    console.warn('fetchLatestServerState failure:', err);
    return null;
  }
}

export function getLatestAutoSaveInfo(): { timestamp: string | null; bakeryCount?: number; debtCount?: number } | null {
  const scopedKeys = getScopedKeysForBranch(getActiveBranchId());
  try {
    const raw = localStorage.getItem(scopedKeys.AUTOSAVE_BACKUP);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        timestamp: parsed.timestamp || localStorage.getItem(scopedKeys.AUTOSAVE_TIMESTAMP) || null,
        bakeryCount: parsed.state?.bakeries?.length,
        debtCount: parsed.state?.debts?.length,
      };
    }
  } catch {}

  const ts = localStorage.getItem(scopedKeys.AUTOSAVE_TIMESTAMP);
  if (ts) {
    return { timestamp: ts };
  }
  return null;
}

export async function getLatestAutoSaveBackup(): Promise<{ timestamp: string; state: Partial<AppState> } | null> {
  const activeBranchId = getActiveBranchId();
  const scopedKeys = getScopedKeysForBranch(activeBranchId);
  // 1. Try LocalStorage
  try {
    const raw = localStorage.getItem(scopedKeys.AUTOSAVE_BACKUP);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.state) return parsed;
    }
  } catch {}

  // 2. Try IndexedDB
  try {
    const idbVal = await idbGet<{ timestamp: string; state: Partial<AppState> }>(scopedKeys.AUTOSAVE_BACKUP);
    if (idbVal && idbVal.state) {
      return idbVal;
    }
  } catch {}

  // 3. Try Preloaded data in HTML window ONLY for default branch
  if (activeBranchId === DEFAULT_BRANCH_ID && typeof window !== 'undefined') {
    const preloaded = (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> & { exportTimestamp?: string } }).PRELOADED_TAMWEEN_STATE;
    if (preloaded && (preloaded.bakeries || preloaded.debts)) {
      return {
        timestamp: preloaded.exportTimestamp || new Date().toISOString(),
        state: preloaded,
      };
    }
  }

  return null;
}

export async function mergeAutoSaveOntoCurrent(currentState: AppState): Promise<{ success: boolean; message: string; newState?: AppState }> {
  try {
    const autoSave = await getLatestAutoSaveBackup();
    if (!autoSave || !autoSave.state) {
      return { success: false, message: 'لا توجد نسخة محفوظة تلقائياً سابقة للدمج في ذاكرة هذه الإدارة.' };
    }
    const mergedState = mergeStates(currentState, autoSave.state);
    await persistFullState(mergedState);
    const dateFormatted = autoSave.timestamp ? new Date(autoSave.timestamp).toLocaleString('ar-EG') : 'الحالية';
    return {
      success: true,
      message: `تم بنجاح دمج آخر قاعدة بيانات محفوظة تلقائياً (${dateFormatted}) مع قاعدة بيانات هذه الإدارة! الإجمالي الحالي: (${mergedState.bakeries.length}) مخبز و (${mergedState.debts.length}) مديونية.`,
      newState: mergedState,
    };
  } catch (err: unknown) {
    return { success: false, message: `فشل الدمج: ${(err as Error).message}` };
  }
}

export function saveSessionUser(user: AppUser | null): void {
  try {
    if (user) {
      sessionStorage.setItem(KEYS.SESSION, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(KEYS.SESSION);
      localStorage.removeItem(KEYS.SESSION);
    }
  } catch {}
}

// Global in-memory reference to user-chosen backup file handle on local hard drive
let activeDiskBackupHandle: FileSystemFileHandle | null = null;
let activeDiskBackupFileName: string | null = null;

export function getActiveDiskBackupInfo(): { hasHandle: boolean; fileName: string | null } {
  return {
    hasHandle: activeDiskBackupHandle !== null,
    fileName: activeDiskBackupFileName,
  };
}

/**
 * Lets the user select or create a continuous auto-backup file on their chosen disk (C:, D:, USB).
 * Once selected, every future modification will write directly to this local file!
 */
export async function setupDiskAutoBackup(): Promise<{ success: boolean; fileName?: string; message: string }> {
  if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
    return {
      success: false,
      message: 'متصفحك لا يدعم خاصية الكتابة المباشرة على القرص الصلب. سيتم الحفظ التلقائي في ذاكرة الجهاز وتنزيل ملفات النسخ الاحتياطي.',
    };
  }

  try {
    const handle = await (window as unknown as {
      showSaveFilePicker: (opts: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker({
      suggestedName: 'نسخة_احتياطية_دائمة_تموين_المحلة.txt',
      types: [
        {
          description: 'ملف نصي للنسخة الاحتياطية الدائمة (*.txt)',
          accept: {
            'text/plain': ['.txt', '.json'],
          },
        },
      ],
    });

    activeDiskBackupHandle = handle;
    activeDiskBackupFileName = handle.name;
    try {
      localStorage.setItem('TAMWEEN_ACTIVE_BACKUP_FILENAME', handle.name);
    } catch {}

    return {
      success: true,
      fileName: handle.name,
      message: `تم تفعيل وتعيين ملف الحفظ التلقائي بنجاح على القرص باسم (${handle.name})! سيتم تحديثه تلقائياً عند أي تعديل.`,
    };
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      return { success: false, message: 'تم إلغاء اختيار الملف.' };
    }
    return { success: false, message: `تعذر اختيار الملف: ${(err as Error).message}` };
  }
}

/**
 * Automatically writes the latest backup state to the user's chosen local disk file if configured.
 */
export async function writeStateToDiskBackupFile(state: object): Promise<boolean> {
  if (!activeDiskBackupHandle) return false;

  try {
    const jsonStr = JSON.stringify(state, null, 2);
    const writable = await activeDiskBackupHandle.createWritable();
    await writable.write(jsonStr);
    await writable.close();
    return true;
  } catch (err) {
    console.warn('Could not write to disk backup file handle:', err);
    return false;
  }
}

// Native Partition Picker Save (window.showSaveFilePicker) with Fallback
export async function saveBackupToPartition(data: object): Promise<{ success: boolean; method: string; message: string }> {
  const jsonStr = JSON.stringify(data, null, 2);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `نسخة_احتياطية_تموين_مركز_المحلة_${dateStr}.txt`;

  // Check if showSaveFilePicker is available
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as {
        showSaveFilePicker: (opts: {
          suggestedName: string;
          types: Array<{ description: string; accept: Record<string, string[]> }>;
        }) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'ملف نصي لقاعدة بيانات تموين المحلة الكبرى TXT/JSON',
            accept: {
              'text/plain': ['.txt', '.json'],
            },
          },
        ],
      });

      activeDiskBackupHandle = handle;
      activeDiskBackupFileName = handle.name;

      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      return {
        success: true,
        method: 'partition_picker',
        message: `تم حفظ النسخة الاحتياطية بنجاح في المكان المحدد باسم: ${handle.name} وتم تعيينه للحفظ التلقائي المستمر!`
      };
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        return { success: false, method: 'aborted', message: 'تم إلغاء عملية حفظ الملف من قبل المستخدم' };
      }
      console.warn('showSaveFilePicker failed or was blocked, falling back to browser download', err);
    }
  }

  // Standard safe download fallback
  try {
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return {
      success: true,
      method: 'download_fallback',
      message: `تم تنزيل النسخة الاحتياطية بنجاح إلى مجلد التنزيلات بجهازك باسم: ${filename}`
    };
  } catch (err) {
    return {
      success: false,
      method: 'error',
      message: `حدث خطأ أثناء تنزيل الملف: ${(err as Error).message}`
    };
  }
}

// Reset everything to factory defaults
export async function factoryReset(): Promise<void> {
  localStorage.clear();
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise((res) => { tx.oncomplete = res; });
  } catch {}
}

export interface MergeResult {
  success: boolean;
  message: string;
  updatedBakeriesCount: number;
  newBakeriesCount: number;
  updatedDebtsCount: number;
  newDebtsCount: number;
  totalBakeries: number;
  totalDebts: number;
  newState?: AppState;
}

/**
 * Discovers and merges ANY saved database (LocalStorage, IndexedDB, preloaded state, or backups)
 * into the original base state: updates existing bakeries by ID/machineNumber and adds missing ones only.
 */
export async function autoDiscoverAndMergeAllDatabases(currentState: AppState): Promise<MergeResult> {
  try {
    const activeBranchId = currentState.activeBranchId || getActiveBranchId();
    const isDefaultBranch = activeBranchId === DEFAULT_BRANCH_ID;
    const scopedKeys = getScopedKeysForBranch(activeBranchId);
    const discoveredDatasets: Array<Partial<AppState>> = [];

    // 1. Check auto-save in localStorage for the active branch
    try {
      const rawAuto = localStorage.getItem(scopedKeys.AUTOSAVE_BACKUP);
      if (rawAuto) {
        const parsed = JSON.parse(rawAuto);
        if (parsed.state) discoveredDatasets.push(parsed.state);
        else if (parsed.bakeries) discoveredDatasets.push(parsed);
      }
    } catch {}

    // 2. Check IndexedDB auto-save for the active branch
    try {
      const idbVal = await idbGet<{ timestamp?: string; state?: Partial<AppState> }>(scopedKeys.AUTOSAVE_BACKUP);
      if (idbVal?.state) discoveredDatasets.push(idbVal.state);
    } catch {}

    // 3. Check window.PRELOADED_TAMWEEN_STATE ONLY for the default branch
    if (isDefaultBranch && typeof window !== 'undefined') {
      const preloaded = (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> }).PRELOADED_TAMWEEN_STATE;
      if (preloaded && (preloaded.bakeries || preloaded.debts)) {
        discoveredDatasets.push(preloaded);
      }
    }

    // 4. Check any backup or snapshot keys in localStorage belonging to this branch
    if (isDefaultBranch) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            !key.includes('__branch-') &&
            (key.includes('backup') || key.includes('BACKUP') || key.includes('snapshot'))
          ) {
            const val = localStorage.getItem(key);
            if (val && val.startsWith('{')) {
              const parsed = JSON.parse(val);
              if (parsed.data) discoveredDatasets.push(parsed.data);
              else if (parsed.state) discoveredDatasets.push(parsed.state);
              else if (parsed.bakeries) discoveredDatasets.push(parsed);
            }
          }
        }
      } catch {}
    }

    if (discoveredDatasets.length === 0) {
      return {
        success: false,
        message: 'لم يتم العثور على أي قواعد بيانات أو نسخ محفوظة سابقة للدمج.',
        updatedBakeriesCount: 0,
        newBakeriesCount: 0,
        updatedDebtsCount: 0,
        newDebtsCount: 0,
        totalBakeries: currentState.bakeries.length,
        totalDebts: currentState.debts.length,
      };
    }

    // Track baseline for accurate stats reporting
    const prevBakeries = new Map<string, Bakery>();
    currentState.bakeries.forEach((b) => prevBakeries.set(b.id, b));
    const prevDebts = new Map<string, DebtRecord>();
    currentState.debts.forEach((d) => prevDebts.set(d.id, d));

    let mergedState = currentState;
    let updatedBakeriesCount = 0;
    let newBakeriesCount = 0;
    let updatedDebtsCount = 0;
    let newDebtsCount = 0;

    for (const dataset of discoveredDatasets) {
      (dataset.bakeries || []).forEach((b) => {
        let match = prevBakeries.get(b.id);
        if (!match && b.machineNumber) {
          for (const ex of prevBakeries.values()) {
            if (ex.machineNumber === b.machineNumber) {
              match = ex;
              break;
            }
          }
        }
        if (match) {
          updatedBakeriesCount++;
        } else {
          newBakeriesCount++;
          prevBakeries.set(b.id, b);
        }
      });

      (dataset.debts || []).forEach((d) => {
        if (prevDebts.has(d.id)) {
          updatedDebtsCount++;
        } else {
          newDebtsCount++;
          prevDebts.set(d.id, d);
        }
      });

      mergedState = mergeStates(mergedState, dataset);
    }

    // Persist unified state
    await persistFullState(mergedState);

    return {
      success: true,
      message: `تم دمج وتحديث قاعدة البيانات بنجاح! تم تحديث بيانات (${updatedBakeriesCount}) مخبز قائم، وإضافة (${newBakeriesCount}) مخبز جديد غير متوفر سابقاً، وضبط المديونيات. الإجمالي: (${mergedState.bakeries.length}) مخبز و (${mergedState.debts.length}) مديونية.`,
      updatedBakeriesCount,
      newBakeriesCount,
      updatedDebtsCount,
      newDebtsCount,
      totalBakeries: mergedState.bakeries.length,
      totalDebts: mergedState.debts.length,
      newState: mergedState,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `حدث خطأ أثناء فحص ودمج قواعد البيانات: ${(err as Error).message}`,
      updatedBakeriesCount: 0,
      newBakeriesCount: 0,
      updatedDebtsCount: 0,
      newDebtsCount: 0,
      totalBakeries: currentState.bakeries.length,
      totalDebts: currentState.debts.length,
    };
  }
}
