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
  DEFAULT_LEASE_CONTRACT_TYPES,
  DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
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
  synchronizeBakeryAndDebts,
  scrubProtectedOwnerEmail,
  scrubProtectedOwnerEmailList,
} from './utils/auditHelper';
import {
  autoSyncToSupabase,
  autoSyncToSupabaseDetailed,
  fetchDatabaseFromSupabase,
  getSecurityShieldHeaders,
  SESSION_CLIENT_ID,
  CLEAN_START_RESET_EPOCH,
  clearPermanentSafetyVault,
} from './lib/supabase';
import { cloneDefaultBranchDepartmentsStructure } from './utils/branchOperations';
import {
  BranchAuthVaultRecord,
  loadBranchAuthVault,
  saveBranchAuthVault,
  sanitizeBranchUsers,
  collectAllBranchAuthVaults,
  syncAllBranchAuthVaultsFromCloud,
} from './services/branchAuthVault';
import {
  deduplicateSupplyBranches,
  normalizeBranchNameKey,
  resolveCanonicalBranchIdentity,
  markBranchDeleted,
  unmarkBranchDeleted,
  isBranchMarkedDeleted,
  CANONICAL_DEFAULT_BRANCHES,
} from './utils/branchVaultUtils';

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
  leaseContractTypes?: string[];
  responsibleManagerOptions?: string[];
  paymentMethods?: string[];
  dailyTasks?: DailyBakeryTask[];
  inboxMessages?: InboxChatMessage[];
  columnTitles: ColumnTitles;
  systemConfig: SystemConfig;
  users: AppUser[];
  currentUser: AppUser | null;
  lastUpdatedAt?: string;
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
  LEASE_CONTRACT_TYPES: 'TAMWEEN_LEASE_CONTRACT_TYPES_V3',
  RESPONSIBLE_MANAGER_OPTIONS: 'TAMWEEN_RESPONSIBLE_MANAGER_OPTIONS_V3',
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
    LEASE_CONTRACT_TYPES: `${BASE_KEYS.LEASE_CONTRACT_TYPES}${suffix}`,
    RESPONSIBLE_MANAGER_OPTIONS: `${BASE_KEYS.RESPONSIBLE_MANAGER_OPTIONS}${suffix}`,
    PAYMENT_METHODS: `${BASE_KEYS.PAYMENT_METHODS}${suffix}`,
    DAILY_TASKS: `${BASE_KEYS.DAILY_TASKS}${suffix}`,
    INBOX_MESSAGES: `${BASE_KEYS.INBOX_MESSAGES}${suffix}`,
    COLUMNS: `${BASE_KEYS.COLUMNS}${suffix}`,
    CONFIG: `${BASE_KEYS.CONFIG}${suffix}`,
    USERS: `${BASE_KEYS.USERS}${suffix}`, // Strictly isolated users & permissions per branch
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

export function sanitizeAndDeduplicateBranches(branches: SupplyBranch[]): SupplyBranch[] {
  return deduplicateSupplyBranches(branches);
}

export function getBranchesList(): SupplyBranch[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(BRANCH_META_KEYS.BRANCHES_LIST);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = sanitizeAndDeduplicateBranches(parsed);
          if (sanitized.length !== parsed.length) {
            localStorage.setItem(BRANCH_META_KEYS.BRANCHES_LIST, JSON.stringify(sanitized));
          }
          return sanitized;
        }
      }
      const initial = sanitizeAndDeduplicateBranches(DEFAULT_SUPPLY_BRANCHES);
      localStorage.setItem(BRANCH_META_KEYS.BRANCHES_LIST, JSON.stringify(initial));
      return initial;
    }
  } catch {}
  return sanitizeAndDeduplicateBranches(DEFAULT_SUPPLY_BRANCHES);
}

export function saveBranchesList(branches: SupplyBranch[]): void {
  try {
    if (typeof localStorage !== 'undefined' && Array.isArray(branches) && branches.length > 0) {
      const sanitized = sanitizeAndDeduplicateBranches(branches);
      localStorage.setItem(BRANCH_META_KEYS.BRANCHES_LIST, JSON.stringify(sanitized));
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
  const targetKey = normalizeBranchNameKey(trimmedName);

  const { canonicalId, canonicalName } = resolveCanonicalBranchIdentity(
    `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    trimmedName
  );
  // If this branch was previously deleted, unmark it so the user can restore/re-add it
  unmarkBranchDeleted(canonicalId, canonicalName);
  unmarkBranchDeleted(undefined, trimmedName);

  const branches = getBranchesList();
  const existing = branches.find((b) => normalizeBranchNameKey(b.name) === targetKey);
  if (existing) {
    return existing;
  }

  const existingByCanonicalId = branches.find((b) => b.id === canonicalId);
  if (existingByCanonicalId) {
    return existingByCanonicalId;
  }

  const newBranch: SupplyBranch = {
    id: canonicalId,
    name: canonicalName,
    governorateTitle: governorateTitle.trim() || 'محافظة الغربية',
    directorateTitle: directorateTitle.trim() || 'مديرية التموين والتجارة الداخلية بالغربية',
    description: description.trim() || `قاعدة بيانات مستقلة - ${canonicalName}`,
    createdAt: new Date().toISOString().slice(0, 10),
    isDefault: false,
  };
  const updated = sanitizeAndDeduplicateBranches([...branches, newBranch]);
  saveBranchesList(updated);

  // Initialize isolated empty storage for the new branch so no data ever leaks from other branches
  const scopedKeys = getScopedKeysForBranch(newBranch.id);
  const mahallaDepts = readBranchPartitionFromLocal(DEFAULT_BRANCH_ID)?.systemConfig?.branchDepartments;
  const initialConfig: SystemConfig = {
    ...DEFAULT_SYSTEM_CONFIG,
    governorateTitle: newBranch.governorateTitle,
    directorateTitle: newBranch.directorateTitle,
    administrationTitle: newBranch.name,
    logoBase64: DEFAULT_OFFICIAL_LOGO,
    branchDepartments: cloneDefaultBranchDepartmentsStructure(mahallaDepts),
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
      localStorage.setItem(scopedKeys.USERS, JSON.stringify(INITIAL_USERS));
    }
  } catch {}

  return newBranch;
}

export function createSupplyBranch(
  name: string,
  directorateTitle = 'مديرية التموين والتجارة الداخلية بالغربية',
  governorateTitle = 'محافظة الغربية',
  description = ''
): {
  success: boolean;
  message: string;
  branches: SupplyBranch[];
  newBranch: SupplyBranch;
} {
  const newBranch = addSupplyBranch(name, directorateTitle, governorateTitle, description);
  const branches = getBranchesList();
  return {
    success: true,
    message: 'تم إنشاء الفرع بنجاح',
    branches,
    newBranch,
  };
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
      nextActiveBranchId: branches[0]?.id || DEFAULT_BRANCH_ID,
    };
  }
  const target =
    branches.find((b) => b.id === branchId) ||
    CANONICAL_DEFAULT_BRANCHES.find((b) => b.id === branchId);
  if (!target) {
    return {
      success: false,
      message: 'الفرع المطلوب حذفه غير موجود.',
      branches,
      nextActiveBranchId: getActiveBranchId(),
    };
  }

  // Permanently mark this branch as deleted so deduplicateSupplyBranches / cloud sync never resurrects it
  markBranchDeleted(target.id, target.name);
  if (branchId !== target.id) {
    markBranchDeleted(branchId, target.name);
  }

  const targetNormName = normalizeBranchNameKey(target.name);
  const remaining = branches.filter(
    (b) => b.id !== branchId && b.id !== target.id && normalizeBranchNameKey(b.name) !== targetNormName
  );
  const safeRemaining = remaining.length > 0 ? remaining : [CANONICAL_DEFAULT_BRANCHES[0]];
  saveBranchesList(safeRemaining);

  // Clean up isolated storage for deleted branch (never delete active session key)
  if (branchId !== DEFAULT_BRANCH_ID) {
    const scopedKeys = getScopedKeysForBranch(branchId);
    try {
      if (typeof localStorage !== 'undefined') {
        Object.values(scopedKeys).forEach((k) => {
          if (k !== BASE_KEYS.SESSION) {
            localStorage.removeItem(k);
          }
        });
        localStorage.removeItem(`TAMWEEN_EXPLICIT_USER_SAVE__${branchId}`);
        localStorage.removeItem(`TAMWEEN_BRANCH_AUTH_VAULT_V1__${branchId}`);
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
  const nextActive =
    currentActive === branchId || currentActive === target.id || !safeRemaining.some((b) => b.id === currentActive)
      ? safeRemaining[0].id
      : currentActive;
  setActiveBranchId(nextActive);

  return {
    success: true,
    message: `تم حذف "${target.name}" وجميع بياناته المنفصلة بنجاح.`,
    branches: safeRemaining,
    nextActiveBranchId: nextActive,
  };
}

export function renameSupplyBranch(
  branchId: string,
  newName: string,
  newDirectorate?: string,
  newGovernorate?: string,
  newDescription?: string
): {
  success: boolean;
  message: string;
  branches: SupplyBranch[];
  updatedBranch?: SupplyBranch;
} {
  const list = getBranchesList();
  const trimmedName = newName.trim();
  if (!trimmedName) {
    return {
      success: false,
      message: 'اسم الفرع لا يمكن أن يكون فارغاً.',
      branches: list,
    };
  }

  const updatedList = list.map((b) => {
    if (b.id !== branchId) return b;
    const nextDirectorate =
      (newDirectorate ?? b.directorateTitle ?? b.directorate ?? '').trim() ||
      'مديرية التموين والتجارة الداخلية بالغربية';
    const nextGovernorate =
      (newGovernorate ?? b.governorateTitle ?? b.governorate ?? '').trim() || 'محافظة الغربية';
    return {
      ...b,
      name: trimmedName,
      directorateTitle: nextDirectorate,
      governorateTitle: nextGovernorate,
      directorate: nextDirectorate,
      governorate: nextGovernorate,
      description: (newDescription ?? b.description ?? `قاعدة بيانات مستقلة (${trimmedName})`).trim(),
    };
  });

  saveBranchesList(updatedList);
  const updatedBranch = updatedList.find((b) => b.id === branchId);
  return {
    success: true,
    message: `تم تعديل اسم الفرع إلى "${trimmedName}" بنجاح.`,
    branches: updatedList,
    updatedBranch,
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
        bakeriesCount: 0,
        debtsCount: 0,
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
    leaseContractTypes: Array.from(new Set([...(base.leaseContractTypes || DEFAULT_LEASE_CONTRACT_TYPES), ...(incoming.leaseContractTypes || [])])),
    responsibleManagerOptions: Array.from(new Set([...(base.responsibleManagerOptions || DEFAULT_RESPONSIBLE_MANAGER_OPTIONS), ...(incoming.responsibleManagerOptions || [])])),
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

export interface BranchPartitionPayload extends Partial<AppState> {
  updatedAt?: string;
}

export function readBranchPartitionFromLocal(branchId: string): BranchPartitionPayload {
  const isDefault = branchId === DEFAULT_BRANCH_ID;
  const bKeys = getScopedKeysForBranch(branchId);
  const branches = getBranchesList();
  const branchObj = branches.find((b) => b.id === branchId);

  const safeParse = <T>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  if (typeof localStorage === 'undefined') {
    const fallbackVault = loadBranchAuthVault(branchId, branchObj?.name);
    return {
      activeBranchId: branchId,
      bakeries: [],
      debts: [],
      villages: isDefault ? DEFAULT_VILLAGES_HIERARCHY : [],
      users: fallbackVault.users,
      systemConfig: {
        ...DEFAULT_SYSTEM_CONFIG,
        administrationTitle: branchObj?.name || DEFAULT_SYSTEM_CONFIG.administrationTitle,
        rolePermissions: fallbackVault.rolePermissions,
        roleLabels: fallbackVault.roleLabels,
        customRoles: fallbackVault.customRoles,
        logoBase64: DEFAULT_OFFICIAL_LOGO,
      },
    };
  }

  const rawBake = localStorage.getItem(bKeys.BAKERIES);
  const rawDebts = localStorage.getItem(bKeys.DEBTS);
  const rawVillages = localStorage.getItem(bKeys.VILLAGES);
  const rawConfig = localStorage.getItem(bKeys.CONFIG);

  const parsedBakeries = safeParse<Bakery[]>(rawBake, []);
  const parsedDebts = safeParse<DebtRecord[]>(rawDebts, []);
  // Never re-seed the 7 legacy demo bakeries/debts if they match the old default seed state
  const isLegacyDemoSeed =
    parsedBakeries.length === INITIAL_BAKERIES.length &&
    isDefaultSeedState(parsedBakeries, parsedDebts);
  const bakeries = isLegacyDemoSeed ? [] : parsedBakeries;
  const debts = isLegacyDemoSeed ? [] : parsedDebts;
  const villages = safeParse<VillageHierarchy[]>(
    rawVillages,
    isDefault ? DEFAULT_VILLAGES_HIERARCHY : []
  );

  // Load isolated branch auth vault (usernames, passwords, rolePermissions, customRoles strictly isolated per branch)
  const branchVault = loadBranchAuthVault(branchId, branchObj?.name);
  const users = branchVault.users;

  const parsedConfig = safeParse<SystemConfig>(rawConfig, {
    ...DEFAULT_SYSTEM_CONFIG,
    governorateTitle: branchObj?.governorateTitle || 'محافظة الغربية',
    directorateTitle: branchObj?.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
    administrationTitle: branchObj?.name || DEFAULT_SYSTEM_CONFIG.administrationTitle,
    logoBase64: DEFAULT_OFFICIAL_LOGO,
  });

  return {
    activeBranchId: branchId,
    updatedAt: localStorage.getItem(bKeys.AUTOSAVE_TIMESTAMP) || branchVault.updatedAt || '',
    bakeries,
    debts,
    villages,
    issuingEntities: safeParse<string[]>(localStorage.getItem(bKeys.ENTITIES), DEFAULT_ISSUING_ENTITIES),
    violationTypes: safeParse<string[]>(localStorage.getItem(bKeys.VIOLATIONS), DEFAULT_VIOLATION_TYPES),
    activityStatuses: safeParse<string[]>(localStorage.getItem(bKeys.ACTIVITY_STATUSES), DEFAULT_ACTIVITY_STATUSES),
    bakeryCategories: safeParse<string[]>(localStorage.getItem(bKeys.BAKERY_CATEGORIES), DEFAULT_BAKERY_CATEGORIES),
    breadTypes: safeParse<string[]>(localStorage.getItem(bKeys.BREAD_TYPES), DEFAULT_BREAD_TYPES),
    breadTypeCounts: safeParse<string[]>(localStorage.getItem(bKeys.BREAD_TYPE_COUNTS), DEFAULT_BREAD_TYPE_COUNTS),
    lineTypes: safeParse<string[]>(localStorage.getItem(bKeys.LINE_TYPES), DEFAULT_LINE_TYPES),
    fuelTypes: safeParse<string[]>(localStorage.getItem(bKeys.FUEL_TYPES), DEFAULT_FUEL_TYPES),
    leaseContractTypes: safeParse<string[]>(localStorage.getItem(bKeys.LEASE_CONTRACT_TYPES), DEFAULT_LEASE_CONTRACT_TYPES),
    responsibleManagerOptions: safeParse<string[]>(localStorage.getItem(bKeys.RESPONSIBLE_MANAGER_OPTIONS), DEFAULT_RESPONSIBLE_MANAGER_OPTIONS),
    paymentMethods: safeParse<string[]>(localStorage.getItem(bKeys.PAYMENT_METHODS), PAYMENT_METHODS),
    dailyTasks: safeParse<DailyBakeryTask[]>(
      localStorage.getItem(bKeys.DAILY_TASKS),
      []
    ),
    inboxMessages: safeParse<InboxChatMessage[]>(
      localStorage.getItem(bKeys.INBOX_MESSAGES),
      isDefault ? INITIAL_INBOX_MESSAGES : []
    ),
    columnTitles: safeParse<ColumnTitles>(localStorage.getItem(bKeys.COLUMNS), DEFAULT_COLUMN_TITLES),
    systemConfig: {
      ...DEFAULT_SYSTEM_CONFIG,
      ...parsedConfig,
      administrationTitle: branchObj?.name || parsedConfig.administrationTitle || DEFAULT_SYSTEM_CONFIG.administrationTitle,
      rolePermissions: branchVault.rolePermissions || parsedConfig.rolePermissions,
      roleLabels: branchVault.roleLabels || parsedConfig.roleLabels,
      customRoles: branchVault.customRoles || parsedConfig.customRoles,
      logoBase64: DEFAULT_OFFICIAL_LOGO,
    },
    users,
  };
}

export function shouldApplyIncomingPartitionTimestamp(
  localTs: string | null | undefined,
  remoteTs: string | null | undefined,
  isLocalUntouched: boolean,
  forceRealtimePush: boolean = false
): boolean {
  if (forceRealtimePush) return true;
  if (isLocalUntouched) return true;
  if (!localTs) return true;
  if (!remoteTs) return false;
  const localMs = Date.parse(localTs) || 0;
  const remoteMs = Date.parse(remoteTs) || 0;
  if (!localMs || !remoteMs) return true;
  return remoteMs >= localMs;
}

export function writeBranchPartitionToLocal(
  branchId: string,
  part: BranchPartitionPayload,
  fallbackTimestamp?: string,
  options?: { forceRealtimePush?: boolean }
): boolean {
  if (!part || typeof localStorage === 'undefined') return false;
  const isDefault = branchId === DEFAULT_BRANCH_ID;
  const bKeys = getScopedKeysForBranch(branchId);
  const branches = getBranchesList();
  const branchObj = branches.find((b) => b.id === branchId);

  try {
    const localTs = localStorage.getItem(bKeys.AUTOSAVE_TIMESTAMP) || '';
    const explicitSaveKey = isDefault
      ? 'TAMWEEN_EXPLICIT_USER_SAVE'
      : `TAMWEEN_EXPLICIT_USER_SAVE__${branchId}`;
    const hasExplicitSave = localStorage.getItem(explicitSaveKey) === 'true';

    let existingBake: Bakery[] = [];
    let existingDebts: DebtRecord[] = [];
    let existingConfig: SystemConfig | null = null;

    try {
      const rB = localStorage.getItem(bKeys.BAKERIES);
      if (rB) existingBake = JSON.parse(rB);
      const rD = localStorage.getItem(bKeys.DEBTS);
      if (rD) existingDebts = JSON.parse(rD);
      const rC = localStorage.getItem(bKeys.CONFIG);
      if (rC) existingConfig = JSON.parse(rC);
    } catch {}

    const isLocalUntouched = isDefault
      ? !hasExplicitSave && isDefaultSeedState(existingBake, existingDebts)
      : !hasExplicitSave && existingBake.length === 0 && existingDebts.length === 0;

    const remoteTs = part.updatedAt || fallbackTimestamp || '';
    if (
      !shouldApplyIncomingPartitionTimestamp(
        isLocalUntouched ? '' : localTs,
        remoteTs,
        isLocalUntouched,
        Boolean(options?.forceRealtimePush)
      )
    ) {
      return false;
    }

    // Sync isolated branch auth vault (usernames, passwords, rolePermissions, customRoles) for this branch
    syncAllBranchAuthVaultsFromCloud(
      undefined,
      { [branchId]: part },
      remoteTs
    );
    const updatedVault = loadBranchAuthVault(branchId, branchObj?.name);

    // Adopt incoming cloud partition once freshness is confirmed
    const synced = synchronizeBakeryAndDebts(
      (part.bakeries || []).map(normalizeBakeryPerCapita),
      part.debts || []
    );
      if (Array.isArray(part.bakeries)) {
        localStorage.setItem(bKeys.BAKERIES, JSON.stringify(synced.bakeries));
      }
      if (Array.isArray(part.debts)) {
        localStorage.setItem(bKeys.DEBTS, JSON.stringify(synced.debts));
      }
      if (Array.isArray(part.villages)) {
        localStorage.setItem(bKeys.VILLAGES, JSON.stringify(part.villages));
      }
      if (Array.isArray(part.issuingEntities)) {
        localStorage.setItem(bKeys.ENTITIES, JSON.stringify(part.issuingEntities));
      }
      if (Array.isArray(part.violationTypes)) {
        localStorage.setItem(bKeys.VIOLATIONS, JSON.stringify(part.violationTypes));
      }
      if (Array.isArray(part.activityStatuses)) {
        localStorage.setItem(bKeys.ACTIVITY_STATUSES, JSON.stringify(part.activityStatuses));
      }
      if (Array.isArray(part.bakeryCategories)) {
        localStorage.setItem(bKeys.BAKERY_CATEGORIES, JSON.stringify(part.bakeryCategories));
      }
      if (Array.isArray(part.breadTypes)) {
        localStorage.setItem(bKeys.BREAD_TYPES, JSON.stringify(part.breadTypes));
      }
      if (Array.isArray(part.breadTypeCounts)) {
        localStorage.setItem(bKeys.BREAD_TYPE_COUNTS, JSON.stringify(part.breadTypeCounts));
      }
      if (Array.isArray(part.lineTypes)) {
        localStorage.setItem(bKeys.LINE_TYPES, JSON.stringify(part.lineTypes));
      }
      if (Array.isArray(part.fuelTypes)) {
        localStorage.setItem(bKeys.FUEL_TYPES, JSON.stringify(part.fuelTypes));
      }
      if (Array.isArray(part.leaseContractTypes)) {
        localStorage.setItem(bKeys.LEASE_CONTRACT_TYPES, JSON.stringify(part.leaseContractTypes));
      }
      if (Array.isArray(part.responsibleManagerOptions)) {
        localStorage.setItem(bKeys.RESPONSIBLE_MANAGER_OPTIONS, JSON.stringify(part.responsibleManagerOptions));
      }
      if (Array.isArray(part.paymentMethods)) {
        localStorage.setItem(bKeys.PAYMENT_METHODS, JSON.stringify(part.paymentMethods));
      }
      if (Array.isArray(part.dailyTasks)) {
        localStorage.setItem(bKeys.DAILY_TASKS, JSON.stringify(part.dailyTasks));
      }
      if (Array.isArray(part.inboxMessages)) {
        localStorage.setItem(bKeys.INBOX_MESSAGES, JSON.stringify(part.inboxMessages));
      }
      if (part.columnTitles) {
        localStorage.setItem(
          bKeys.COLUMNS,
          JSON.stringify({ ...DEFAULT_COLUMN_TITLES, ...part.columnTitles })
        );
      }
      if (part.systemConfig || existingConfig) {
        const mergedCfg: SystemConfig = {
          ...DEFAULT_SYSTEM_CONFIG,
          ...(existingConfig || {}),
          ...(part.systemConfig || {}),
          administrationTitle:
            branchObj?.name ||
            part.systemConfig?.administrationTitle ||
            existingConfig?.administrationTitle ||
            DEFAULT_SYSTEM_CONFIG.administrationTitle,
          rolePermissions: updatedVault.rolePermissions,
          roleLabels: updatedVault.roleLabels,
          customRoles: updatedVault.customRoles,
          logoBase64: DEFAULT_OFFICIAL_LOGO,
        };
        localStorage.setItem(bKeys.CONFIG, JSON.stringify(mergedCfg));
      }
      if (remoteTs) {
        localStorage.setItem(bKeys.AUTOSAVE_TIMESTAMP, remoteTs);
      }
      localStorage.setItem(bKeys.INITIALIZED, 'true');
      return true;
  } catch (err) {
    console.warn('Error writing branch partition to local storage:', err);
    return false;
  }
}

export function syncAllBranchesFromCloudPayload(
  cloudData: Partial<AppState> | null | undefined,
  remoteTimestamp?: string,
  options?: { forceRealtimePush?: boolean }
): boolean {
  if (!cloudData) return false;

  // 1. Sync branches list across all devices safely with zero duplicates (and never resurrect deleted branches)
  const currentBranches = getBranchesList();
  const rawBranches: SupplyBranch[] = [
    ...DEFAULT_SUPPLY_BRANCHES.filter((b) => !isBranchMarkedDeleted(b.id, b.name)),
    ...currentBranches.filter((b) => !isBranchMarkedDeleted(b.id, b.name)),
  ];

  if (Array.isArray(cloudData.branches) && cloudData.branches.length > 0) {
    cloudData.branches.forEach((b) => {
      if (b && b.id && b.name && !isBranchMarkedDeleted(b.id, b.name)) {
        rawBranches.push(b);
      }
    });
  }

  // 2. Sync root payload & all branch partitions
  const remotePartitions =
    (cloudData as unknown as { branchPartitions?: Record<string, BranchPartitionPayload> })
      .branchPartitions || {};
  const remoteAuthVaults =
    (cloudData as unknown as { branchAuthVaults?: Record<string, BranchAuthVaultRecord> })
      .branchAuthVaults;

  // Also include any branch ID present in branchPartitions (unless marked deleted)
  Object.keys(remotePartitions).forEach((bId) => {
    if (bId) {
      const pName = remotePartitions[bId]?.systemConfig?.administrationTitle;
      if (pName && !isBranchMarkedDeleted(bId, pName)) {
        rawBranches.push({
          id: bId,
          name: pName,
          directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
          governorateTitle: 'محافظة الغربية',
          description: `إدارة تموينية مستقلة - ${pName}`,
          createdAt: new Date().toISOString().slice(0, 10),
          isDefault: bId === DEFAULT_BRANCH_ID,
        });
      }
    }
  });

  const deduplicatedBranches = sanitizeAndDeduplicateBranches(rawBranches);
  saveBranchesList(deduplicatedBranches);

  const hasPartitionsMap = Boolean(
    (cloudData as unknown as { branchPartitions?: Record<string, BranchPartitionPayload> }).branchPartitions &&
      Object.keys(remotePartitions).length > 0
  );
  let appliedAny = false;

  // Only update DEFAULT_BRANCH_ID if explicitly present in remotePartitions;
  // for flat single-branch snapshots, route strictly to cloudData.activeBranchId || DEFAULT_BRANCH_ID.
  const payloadBranchId = cloudData.activeBranchId || DEFAULT_BRANCH_ID;
  if (remotePartitions[DEFAULT_BRANCH_ID] && !isBranchMarkedDeleted(DEFAULT_BRANCH_ID)) {
    if (
      writeBranchPartitionToLocal(
        DEFAULT_BRANCH_ID,
        remotePartitions[DEFAULT_BRANCH_ID],
        remoteTimestamp,
        options
      )
    ) {
      appliedAny = true;
    }
  } else if (!hasPartitionsMap && !isBranchMarkedDeleted(payloadBranchId)) {
    const flatPartition: BranchPartitionPayload = {
      ...cloudData,
      activeBranchId: payloadBranchId,
      updatedAt: remoteTimestamp,
    };
    if (writeBranchPartitionToLocal(payloadBranchId, flatPartition, remoteTimestamp, options)) {
      appliedAny = true;
    }
  }

  // 3. Sync every isolated branch partition in branchPartitions
  Object.entries(remotePartitions).forEach(([bId, part]) => {
    if (!bId || bId === DEFAULT_BRANCH_ID || !part) return;
    if (isBranchMarkedDeleted(bId, part?.systemConfig?.administrationTitle)) return;
    if (writeBranchPartitionToLocal(bId, part, remoteTimestamp, options)) {
      appliedAny = true;
    }
  });

  // 4. Sync dedicated branch auth vaults across all branches
  if (remoteAuthVaults) {
    syncAllBranchAuthVaultsFromCloud(remoteAuthVaults, remotePartitions, remoteTimestamp);
  }
  return appliedAny;
}

export function buildFullCloudMultiBranchPayload(
  activeState: Omit<AppState, 'currentUser'> & { currentUser?: AppUser | null },
  snapshotTimestamp: string
): AppState & {
  branchPartitions: Record<string, BranchPartitionPayload>;
  branchAuthVaults: Record<string, BranchAuthVaultRecord>;
} {
  const targetBranchId = activeState.activeBranchId || getActiveBranchId();
  const branchesList = sanitizeAndDeduplicateBranches(activeState.branches || getBranchesList());

  const branchAuthVaults = collectAllBranchAuthVaults(
    branchesList,
    targetBranchId,
    activeState.users,
    activeState.systemConfig,
    snapshotTimestamp
  );

  const branchPartitions: Record<string, BranchPartitionPayload> = {};
  branchesList.forEach((b) => {
    const vault = branchAuthVaults[b.id] || loadBranchAuthVault(b.id, b.name);
    if (b.id === targetBranchId) {
      branchPartitions[b.id] = {
        ...activeState,
        activeBranchId: b.id,
        users: vault.users,
        systemConfig: {
          ...DEFAULT_SYSTEM_CONFIG,
          ...(activeState.systemConfig || {}),
          administrationTitle: b.name,
          rolePermissions: vault.rolePermissions,
          roleLabels: vault.roleLabels,
          customRoles: vault.customRoles,
          logoBase64: '',
        },
        updatedAt: snapshotTimestamp,
      };
    } else {
      const localPart = readBranchPartitionFromLocal(b.id);
      const hasLocalBakeries = Array.isArray(localPart.bakeries) && localPart.bakeries.length > 0;
      const hasLocalDebts = Array.isArray(localPart.debts) && localPart.debts.length > 0;
      branchPartitions[b.id] = {
        ...localPart,
        bakeries: hasLocalBakeries ? localPart.bakeries : undefined,
        debts: hasLocalDebts ? localPart.debts : undefined,
        users: vault.users,
        systemConfig: {
          ...DEFAULT_SYSTEM_CONFIG,
          ...(localPart.systemConfig || {}),
          administrationTitle: b.name,
          rolePermissions: vault.rolePermissions,
          roleLabels: vault.roleLabels,
          customRoles: vault.customRoles,
          logoBase64: '',
        },
        updatedAt: localPart.updatedAt || snapshotTimestamp,
      };
    }
  });

  const activePartition = branchPartitions[targetBranchId] || activeState;

  return {
    ...(activePartition as AppState),
    activeBranchId: targetBranchId,
    branches: branchesList,
    bakeries: activeState.bakeries || [],
    debts: activeState.debts || [],
    villages: activeState.villages || (targetBranchId === DEFAULT_BRANCH_ID ? DEFAULT_VILLAGES_HIERARCHY : []),
    users: activePartition.users || activeState.users || INITIAL_USERS,
    systemConfig: {
      ...DEFAULT_SYSTEM_CONFIG,
      ...(activeState.systemConfig || {}),
      logoBase64: '',
    },
    currentUser: null,
    branchPartitions,
    branchAuthVaults,
  };
}

const CLEAN_START_EPOCH_KEY = 'TAMWEEN_CLEAN_START_EPOCH';

export async function ensureCleanStartDatabaseEpoch(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    const currentEpoch = localStorage.getItem(CLEAN_START_EPOCH_KEY);
    if (currentEpoch === CLEAN_START_RESET_EPOCH) return;

    const savedSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(BASE_KEYS.SESSION) : null;
    localStorage.clear();
    clearPermanentSafetyVault();
    localStorage.setItem(CLEAN_START_EPOCH_KEY, CLEAN_START_RESET_EPOCH);
    if (savedSession && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(BASE_KEYS.SESSION, savedSession);
    }

    try {
      const db = await openIndexedDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      await new Promise((res) => {
        tx.oncomplete = res;
        tx.onerror = res;
      });
    } catch {}
  } catch {}
}

export async function loadInitialState(requestedBranchId?: string): Promise<AppState> {
  await ensureCleanStartDatabaseEpoch();
  const initialBranches = getBranchesList();
  const activeBranchId =
    requestedBranchId && initialBranches.some((b) => b.id === requestedBranchId)
      ? requestedBranchId
      : getActiveBranchId();
  setActiveBranchId(activeBranchId);
  const isDefaultBranch = activeBranchId === DEFAULT_BRANCH_ID;
  const scopedKeys = getScopedKeysForBranch(activeBranchId);

  // Session check helper: always require explicit authenticated sign-in on fresh boot and purge any cached session credentials
  const resolveCurrentUser = (_activeUsersList: AppUser[]): AppUser | null => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(BASE_KEYS.SESSION);
        sessionStorage.removeItem(KEYS.SESSION);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(BASE_KEYS.SESSION);
        localStorage.removeItem(KEYS.SESSION);
        localStorage.removeItem('TAMWEEN_GMAIL_DRIVE_PASSWORD');
      }
    } catch {}
    return null;
  };

  try {
    // 0. Read pre-existing local & legacy payloads BEFORE overwriting local cache from bootstrap
    const preSyncLocalPartition = readBranchPartitionFromLocal(activeBranchId);

    // 1. Fetch authoritative state for activeBranchId directly from PostgreSQL / Supabase API first
    let cloudHasData = false;
    let pgAuthoritativeData: any = null;
    try {
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        const bootResp = await fetch(
          `${window.location.protocol}//${window.location.host}/api/db/bootstrap?branchId=${encodeURIComponent(
            activeBranchId
          )}&_t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: getSecurityShieldHeaders(false),
          }
        ).catch(() => null);
        if (bootResp && bootResp.ok) {
          const bootJson = await bootResp.json().catch(() => null);
          if (bootJson?.success) {
            // Safe Pre-Cleanup Migration Gate:
            // Inspect any legacy localStorage JSON keys or unmigrated local records BEFORE retiring them
            const legacyKeysToCheck = ['TAMWEEN_CUSTOM_BACKUP_PAYLOAD', 'TAMWEEN_GMAIL_DRIVE_SYNC_PAYLOAD'];
            for (const legacyKey of legacyKeysToCheck) {
              const rawLegacy = localStorage.getItem(legacyKey);
              if (rawLegacy && rawLegacy.trim().startsWith('{')) {
                try {
                  const parsedLegacy = JSON.parse(rawLegacy);
                  const legacyData = parsedLegacy?.data || parsedLegacy;
                  // 1. Archive raw payload in PostgreSQL fixed-path storage first
                  const archResp = await fetch(
                    `${window.location.protocol}//${window.location.host}/api/storage/files`,
                    {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: getSecurityShieldHeaders(true),
                      body: JSON.stringify({
                        branchId: activeBranchId,
                        fileName: `legacy_localstorage__${legacyKey.toLowerCase()}.json`,
                        content: rawLegacy,
                        contentType: 'application/json',
                      }),
                    }
                  ).catch(() => null);
                  // 2. Migrate any bakeries/debts/users/villages additively (pruneRemoved: false)
                  const migResp = await fetch(
                    `${window.location.protocol}//${window.location.host}/api/db/batch`,
                    {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: getSecurityShieldHeaders(true),
                      body: JSON.stringify({
                        branchId: legacyData?.activeBranchId || activeBranchId,
                        pruneRemoved: false,
                        sqlOperation: 'UPSERT',
                        affectedTable: 'bakeries',
                        data: legacyData,
                      }),
                    }
                  ).catch(() => null);
                  const migJson = migResp ? await migResp.json().catch(() => null) : null;
                  // 3. ONLY remove redundant legacy key after both archive and DB migration succeed
                  if (archResp?.ok && migResp?.ok && migJson?.success) {
                    localStorage.removeItem(legacyKey);
                    if (Array.isArray(migJson?.data?.bakeries) && migJson.data.bakeries.length > (bootJson.bakeries?.length || 0)) {
                      bootJson.bakeries = migJson.data.bakeries;
                      bootJson.debts = migJson.data.debts || bootJson.debts;
                      bootJson.hasAnyRows = true;
                    }
                  }
                } catch {}
              }
            }

            // Only rescue unmigrated pre-init local data on the default branch BEFORE first initialization;
            // NEVER resurrect records that were intentionally deleted on Postgres!
            const alreadyInitialized =
              typeof localStorage !== 'undefined' &&
              localStorage.getItem(scopedKeys.INITIALIZED) === 'true';
            const pgEmptyBakeries = !Array.isArray(bootJson.bakeries) || bootJson.bakeries.length === 0;
            const localHasBakeries =
              Array.isArray(preSyncLocalPartition.bakeries) && preSyncLocalPartition.bakeries.length > 0;
            const pgEmptyDebts = !Array.isArray(bootJson.debts) || bootJson.debts.length === 0;
            const localHasDebts =
              Array.isArray(preSyncLocalPartition.debts) && preSyncLocalPartition.debts.length > 0;

            if (
              !alreadyInitialized &&
              isDefaultBranch &&
              !bootJson.hasAnyRows &&
              ((pgEmptyBakeries && localHasBakeries) || (pgEmptyDebts && localHasDebts))
            ) {
              const rescueResp = await fetch(
                `${window.location.protocol}//${window.location.host}/api/db/batch`,
                {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: getSecurityShieldHeaders(true),
                  body: JSON.stringify({
                    branchId: activeBranchId,
                    pruneRemoved: false,
                    sqlOperation: 'UPSERT',
                    affectedTable: 'bakeries',
                    data: {
                      activeBranchId,
                      bakeries: preSyncLocalPartition.bakeries || [],
                      debts: preSyncLocalPartition.debts || [],
                      villages: preSyncLocalPartition.villages || [],
                      users: preSyncLocalPartition.users || [],
                      dailyTasks: preSyncLocalPartition.dailyTasks || [],
                      inboxMessages: preSyncLocalPartition.inboxMessages || [],
                    },
                  }),
                }
              ).catch(() => null);
              const rescueJson = rescueResp ? await rescueResp.json().catch(() => null) : null;
              if (rescueResp?.ok && rescueJson?.success && rescueJson?.data) {
                bootJson.bakeries = rescueJson.data.bakeries || preSyncLocalPartition.bakeries;
                bootJson.debts = rescueJson.data.debts || preSyncLocalPartition.debts;
                bootJson.hasAnyRows = true;
              }
            }

            // Always treat authoritative PostgreSQL bootstrap response as the live source of truth across all devices
            pgAuthoritativeData = bootJson;
            cloudHasData = true;
            const bootPayload: any = {
              activeBranchId,
              branches: bootJson.branches,
              villages: bootJson.villages?.length ? bootJson.villages : undefined,
              bakeries: Array.isArray(bootJson.bakeries) ? bootJson.bakeries : [],
              debts: Array.isArray(bootJson.debts) ? bootJson.debts : [],
              users: bootJson.users?.length ? bootJson.users : undefined,
              dailyTasks: bootJson.dailyTasks,
              inboxMessages: bootJson.inboxMessages,
              ...(bootJson.systemConfig ? { systemConfig: bootJson.systemConfig } : {}),
              ...(bootJson.columnTitles && Object.keys(bootJson.columnTitles).length > 0
                ? { columnTitles: bootJson.columnTitles }
                : {}),
              ...(bootJson.activityStatuses?.length ? { activityStatuses: bootJson.activityStatuses } : {}),
              ...(bootJson.dropdownLists || {}),
            };
            syncAllBranchesFromCloudPayload(bootPayload, bootJson.timestamp || new Date().toISOString(), {
              forceRealtimePush: true,
            });
          }
        }
      }

      if (!cloudHasData) {
        const supaRes = await fetchDatabaseFromSupabase();
        if (supaRes && supaRes.success && supaRes.data) {
          cloudHasData = true;
          syncAllBranchesFromCloudPayload(supaRes.data, supaRes.timestamp);
        }
      }
    } catch (supaErr) {
      console.warn('Cloud boot load skipped or network offline:', supaErr);
    }

    const updatedBranchesList = getBranchesList();
    const activeBranchObj =
      updatedBranchesList.find((b) => b.id === activeBranchId) ||
      updatedBranchesList[0] ||
      DEFAULT_SUPPLY_BRANCHES[0];

    // 2. Read isolated state for activeBranchId (preferring authoritative PG arrays when server responded cleanly)
    const localPartition = readBranchPartitionFromLocal(activeBranchId);

    let bakeries = pgAuthoritativeData ? pgAuthoritativeData.bakeries : localPartition.bakeries;
    let debts = pgAuthoritativeData ? pgAuthoritativeData.debts : localPartition.debts;
    let villages =
      pgAuthoritativeData?.villages?.length > 0 ? pgAuthoritativeData.villages : localPartition.villages;
    let issuingEntities =
      pgAuthoritativeData?.dropdownLists?.issuingEntities ?? localPartition.issuingEntities;
    let violationTypes =
      pgAuthoritativeData?.dropdownLists?.violationTypes ?? localPartition.violationTypes;
    let activityStatuses =
      pgAuthoritativeData?.activityStatuses?.length > 0
        ? pgAuthoritativeData.activityStatuses
        : pgAuthoritativeData?.dropdownLists?.activityStatuses ?? localPartition.activityStatuses;
    let bakeryCategories =
      pgAuthoritativeData?.dropdownLists?.bakeryCategories ?? localPartition.bakeryCategories;
    let breadTypes = pgAuthoritativeData?.dropdownLists?.breadTypes ?? localPartition.breadTypes;
    let breadTypeCounts =
      pgAuthoritativeData?.dropdownLists?.breadTypeCounts ?? localPartition.breadTypeCounts;
    let lineTypes = pgAuthoritativeData?.dropdownLists?.lineTypes ?? localPartition.lineTypes;
    let fuelTypes = pgAuthoritativeData?.dropdownLists?.fuelTypes ?? localPartition.fuelTypes;
    let leaseContractTypes =
      pgAuthoritativeData?.dropdownLists?.leaseContractTypes ?? localPartition.leaseContractTypes;
    let responsibleManagerOptions =
      pgAuthoritativeData?.dropdownLists?.responsibleManagerOptions ?? localPartition.responsibleManagerOptions;
    let paymentMethods =
      pgAuthoritativeData?.dropdownLists?.paymentMethods ?? localPartition.paymentMethods;
    let dailyTasks = pgAuthoritativeData ? pgAuthoritativeData.dailyTasks : localPartition.dailyTasks;
    let inboxMessages =
      pgAuthoritativeData && Array.isArray(pgAuthoritativeData.inboxMessages)
        ? pgAuthoritativeData.inboxMessages
        : localPartition.inboxMessages;
    let columnTitles =
      pgAuthoritativeData?.columnTitles && Object.keys(pgAuthoritativeData.columnTitles).length > 0
        ? pgAuthoritativeData.columnTitles
        : localPartition.columnTitles;
    let systemConfig = pgAuthoritativeData?.systemConfig ?? localPartition.systemConfig;
    let users =
      pgAuthoritativeData?.users?.length > 0 ? pgAuthoritativeData.users : localPartition.users;

    const syncedInitial = synchronizeBakeryAndDebts(
      (bakeries ?? []).map(normalizeBakeryPerCapita),
      debts ?? []
    );
    bakeries = syncedInitial.bakeries;
    debts = syncedInitial.debts;
    villages = villages ?? (isDefaultBranch ? DEFAULT_VILLAGES_HIERARCHY : []);
    issuingEntities = issuingEntities ?? DEFAULT_ISSUING_ENTITIES;
    violationTypes = violationTypes ?? DEFAULT_VIOLATION_TYPES;
    activityStatuses = (activityStatuses ?? DEFAULT_ACTIVITY_STATUSES).filter(
      (s: string) => String(s).trim() !== 'يعمل'
    );
    bakeryCategories = bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES;
    breadTypes = breadTypes ?? DEFAULT_BREAD_TYPES;
    breadTypeCounts = breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS;
    lineTypes = lineTypes ?? DEFAULT_LINE_TYPES;
    fuelTypes = fuelTypes ?? DEFAULT_FUEL_TYPES;
    leaseContractTypes = leaseContractTypes ?? DEFAULT_LEASE_CONTRACT_TYPES;
    responsibleManagerOptions = responsibleManagerOptions ?? DEFAULT_RESPONSIBLE_MANAGER_OPTIONS;
    paymentMethods = paymentMethods ?? PAYMENT_METHODS;
    dailyTasks = dailyTasks ?? [];
    inboxMessages = inboxMessages ?? (isDefaultBranch ? INITIAL_INBOX_MESSAGES : []);
    columnTitles = columnTitles
      ? { ...DEFAULT_COLUMN_TITLES, ...columnTitles }
      : { ...DEFAULT_COLUMN_TITLES };

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

    systemConfig = {
      ...DEFAULT_SYSTEM_CONFIG,
      ...(systemConfig || {}),
      gmailEmail: scrubProtectedOwnerEmail(systemConfig?.gmailEmail),
      dailyAlertConfig: {
        ...DEFAULT_SYSTEM_CONFIG.dailyAlertConfig!,
        ...(systemConfig?.dailyAlertConfig || {}),
        supervisorEmailRecipients: scrubProtectedOwnerEmailList(
          systemConfig?.dailyAlertConfig?.supervisorEmailRecipients
        ),
      },
      governorateTitle: activeBranchObj.governorateTitle || systemConfig?.governorateTitle || 'محافظة الغربية',
      directorateTitle: activeBranchObj.directorateTitle || systemConfig?.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
      administrationTitle: activeBranchObj.name,
      logoBase64: DEFAULT_OFFICIAL_LOGO,
    };

    const activeUsers = (users && users.length > 0 ? users : INITIAL_USERS).map((u: AppUser) => ({
      ...u,
      gmailEmail: scrubProtectedOwnerEmail(u.gmailEmail),
    }));
    const currentUser = resolveCurrentUser(activeUsers);

    const finalLocalState: AppState = {
      activeBranchId,
      branches: updatedBranchesList,
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
      leaseContractTypes,
      responsibleManagerOptions,
      paymentMethods,
      dailyTasks,
      inboxMessages,
      columnTitles,
      systemConfig,
      users: activeUsers,
      currentUser,
    };

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(scopedKeys.INITIALIZED, 'true');
      }
    } catch {}

    // Only seed cloud on initial boot IF the cloud database was completely empty
    if (!cloudHasData && !isDefaultSeedState(bakeries, debts)) {
      const ts = localPartition.updatedAt || new Date().toISOString();
      const fullPayload = buildFullCloudMultiBranchPayload(finalLocalState, ts);
      autoSyncToSupabase(fullPayload, true, ts).catch(() => {});
    }

    return finalLocalState;
  } catch (criticalErr) {
    console.error('Critical fallback in loadInitialState:', criticalErr);
    const updatedBranchesList = getBranchesList();
    const activeBranchObj =
      updatedBranchesList.find((b) => b.id === activeBranchId) ||
      updatedBranchesList[0] ||
      DEFAULT_SUPPLY_BRANCHES[0];

    if (!isDefaultBranch) {
      return {
        activeBranchId,
        branches: updatedBranchesList,
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
        leaseContractTypes: DEFAULT_LEASE_CONTRACT_TYPES,
        responsibleManagerOptions: DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
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
    return {
      activeBranchId,
      branches: updatedBranchesList,
      bakeries: [],
      debts: [],
      villages: DEFAULT_VILLAGES_HIERARCHY,
      issuingEntities: DEFAULT_ISSUING_ENTITIES,
      violationTypes: DEFAULT_VIOLATION_TYPES,
      activityStatuses: DEFAULT_ACTIVITY_STATUSES,
      bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
      breadTypes: DEFAULT_BREAD_TYPES,
      breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
      lineTypes: DEFAULT_LINE_TYPES,
      fuelTypes: DEFAULT_FUEL_TYPES,
      leaseContractTypes: DEFAULT_LEASE_CONTRACT_TYPES,
      responsibleManagerOptions: DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
      paymentMethods: PAYMENT_METHODS,
      dailyTasks: [],
      inboxMessages: INITIAL_INBOX_MESSAGES,
      columnTitles: DEFAULT_COLUMN_TITLES,
      systemConfig: DEFAULT_SYSTEM_CONFIG,
      users: INITIAL_USERS,
      currentUser: null,
    };
  }
}

export interface PersistFullStateResult {
  localSaved: boolean;
  cloudSynced: boolean;
  queuedOffline: boolean;
  syncedAt?: string;
  error?: string;
}

// Persist to local fallback cache and await central Supabase + WebSocket confirmation (returning structured sync result)
export async function persistFullState(
  state: Omit<AppState, 'currentUser'> & { currentUser?: AppUser | null },
  options?: { skipCloudSync?: boolean; customTimestamp?: string }
): Promise<PersistFullStateResult> {
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
    leaseContractTypes = DEFAULT_LEASE_CONTRACT_TYPES,
    responsibleManagerOptions = DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
    paymentMethods = PAYMENT_METHODS,
    dailyTasks = [],
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
    gmailEmail: scrubProtectedOwnerEmail(systemConfig?.gmailEmail),
    dailyAlertConfig: systemConfig?.dailyAlertConfig
      ? {
          ...systemConfig.dailyAlertConfig,
          supervisorEmailRecipients: scrubProtectedOwnerEmailList(
            systemConfig.dailyAlertConfig.supervisorEmailRecipients
          ),
        }
      : DEFAULT_SYSTEM_CONFIG.dailyAlertConfig,
    administrationTitle: branchObj?.name || systemConfig?.administrationTitle || DEFAULT_SYSTEM_CONFIG.administrationTitle,
    logoBase64: DEFAULT_OFFICIAL_LOGO,
  };

  const snapshotTimestamp = options?.customTimestamp || new Date().toISOString();
  const isolatedBranchUsers = sanitizeBranchUsers(users, targetBranchId, branchObj?.name);

  // Save to dedicated branch auth vault (strictly isolated usernames, passwords, and permissions per branch)
  saveBranchAuthVault(targetBranchId, {
    branchName: branchObj?.name,
    users: isolatedBranchUsers,
    rolePermissions: lockedConfig.rolePermissions,
    roleLabels: lockedConfig.roleLabels,
    customRoles: lockedConfig.customRoles,
    updatedAt: snapshotTimestamp,
    markExplicitSave: !options?.skipCloudSync,
  });

  // LocalStorage (100% isolated per branch, including branch-specific users & role permissions)
  try {
    localStorage.removeItem('TAMWEEN_GMAIL_DRIVE_PASSWORD');
    if (!options?.skipCloudSync) {
      localStorage.setItem(
        isDefaultBranch ? 'TAMWEEN_EXPLICIT_USER_SAVE' : `TAMWEEN_EXPLICIT_USER_SAVE__${targetBranchId}`,
        'true'
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
    localStorage.setItem(scopedKeys.LEASE_CONTRACT_TYPES, JSON.stringify(leaseContractTypes));
    localStorage.setItem(scopedKeys.RESPONSIBLE_MANAGER_OPTIONS, JSON.stringify(responsibleManagerOptions));
    localStorage.setItem(scopedKeys.PAYMENT_METHODS, JSON.stringify(paymentMethods));
    localStorage.setItem(scopedKeys.DAILY_TASKS, JSON.stringify(dailyTasks));
    localStorage.setItem(scopedKeys.INBOX_MESSAGES, JSON.stringify(inboxMessages));
    localStorage.setItem(scopedKeys.COLUMNS, JSON.stringify(columnTitles));
    const sanitizedLocalUsers = isolatedBranchUsers.map(({ password: _p, gmailPassword: _gp, ...rest }) => ({
      ...rest,
      hasPassword: Boolean(_p || rest.hasPassword),
    }));
    localStorage.setItem(scopedKeys.CONFIG, JSON.stringify(lockedConfig));
    localStorage.setItem(scopedKeys.USERS, JSON.stringify(sanitizedLocalUsers));
  } catch (err) {
    console.warn('LocalStorage quota limit reached, relying primarily on IndexedDB', err);
  }

  const sanitizedSnapshotUsers = isolatedBranchUsers.map(({ password: _p, gmailPassword: _gp, ...rest }) => ({
    ...rest,
    hasPassword: Boolean(_p || rest.hasPassword),
  }));

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
      leaseContractTypes,
      responsibleManagerOptions,
      paymentMethods,
      dailyTasks,
      inboxMessages,
      columnTitles,
      systemConfig: lockedConfig,
      users: sanitizedSnapshotUsers,
    },
  };

  // Single-transaction IndexedDB batch write (strictly scoped to branch)
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
    [scopedKeys.LEASE_CONTRACT_TYPES, leaseContractTypes],
    [scopedKeys.RESPONSIBLE_MANAGER_OPTIONS, responsibleManagerOptions],
    [scopedKeys.PAYMENT_METHODS, paymentMethods],
    [scopedKeys.DAILY_TASKS, dailyTasks],
    [scopedKeys.INBOX_MESSAGES, inboxMessages],
    [scopedKeys.COLUMNS, columnTitles],
    [scopedKeys.CONFIG, lockedConfig],
    [scopedKeys.USERS, sanitizedSnapshotUsers],
    [scopedKeys.AUTOSAVE_BACKUP, backupSnapshot],
  ]);

  // Dispatch Supabase Realtime & WebSocket multi-device sync and await server confirmation
  let cloudResult: {
    cloudSynced: boolean;
    queuedOffline: boolean;
    syncedAt?: string;
    error?: string;
  } = {
    cloudSynced: false,
    queuedOffline: false,
  };

  if (!options?.skipCloudSync) {
    const cloudStatePayload = buildFullCloudMultiBranchPayload(
      backupSnapshot.state,
      backupSnapshot.timestamp
    );

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('tamween_cross_device_sync');
        bc.postMessage({
          type: 'STATE_UPDATED',
          timestamp: backupSnapshot.timestamp,
          branchId: targetBranchId,
          clientId: SESSION_CLIENT_ID,
        });
        bc.close();
      } catch {}
    }

    try {
      const syncRes = await autoSyncToSupabaseDetailed(
        cloudStatePayload as unknown as AppState,
        true,
        backupSnapshot.timestamp
      );
      cloudResult = {
        cloudSynced: syncRes.success,
        queuedOffline: syncRes.queuedOffline,
        syncedAt: syncRes.syncedAt,
        error: syncRes.error,
      };
    } catch (syncErr: any) {
      cloudResult = {
        cloudSynced: false,
        queuedOffline: false,
        error: syncErr?.message || 'تعذر المزامنة مع خادم Supabase',
      };
    }
  }

  // Keep only the single branch-scoped fallback cache; never duplicate JSON blobs on every save
  setTimeout(() => {
    try {
      const serializedSnapshot = JSON.stringify(backupSnapshot);
      localStorage.setItem(scopedKeys.AUTOSAVE_BACKUP, serializedSnapshot);
    } catch {
      // Graceful fallback
    }
  }, 0);

  return {
    localSaved: true,
    cloudSynced: cloudResult.cloudSynced,
    queuedOffline: cloudResult.queuedOffline,
    syncedAt: cloudResult.syncedAt,
    error: cloudResult.error,
  };
}

/**
 * مزامنة حالة المنظومة مع الخادم الرئيسي (PostgreSQL / Supabase)
 */
export async function syncStateToServer(state: Partial<AppState>): Promise<boolean> {
  try {
    const res = await autoSyncToSupabaseDetailed(state as AppState, true);
    return res.success;
  } catch {
    return false;
  }
}

export async function fetchLatestServerState(): Promise<{
  savedAt: string;
  data: Partial<AppState>;
  bakeriesCount: number;
  debtsCount: number;
} | null> {
  return null;
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
      // Never persist plaintext passwords or app passwords inside browser storage
      const { password: _pwd, gmailPassword: _gpwd, ...safeUser } = user;
      sessionStorage.setItem(KEYS.SESSION, JSON.stringify(safeUser));
    } else {
      sessionStorage.removeItem(KEYS.SESSION);
      sessionStorage.removeItem(BASE_KEYS.SESSION);
      localStorage.removeItem(KEYS.SESSION);
      localStorage.removeItem(BASE_KEYS.SESSION);
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

/**
 * إعادة ضبط المصنع على مستوى الفرع النشط فقط (مسح بيانات الفرع الحالي فقط دون المساس ببقية الفروع)
 */
export async function factoryResetBranch(branchId?: string): Promise<void> {
  const targetBranchId = (branchId || getActiveBranchId() || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const scopedKeys = getScopedKeysForBranch(targetBranchId);
  const preserveKeys = new Set<string>([
    BASE_KEYS.SESSION,
    BRANCH_META_KEYS.BRANCHES_LIST,
    BRANCH_META_KEYS.ACTIVE_BRANCH_ID,
    BRANCH_META_KEYS.GLOBAL_ROLE_CONFIG,
    BRANCH_META_KEYS.USERS_UPDATED_AT,
  ]);

  try {
    if (typeof localStorage !== 'undefined') {
      // 1. Remove only scoped data keys belonging to this specific branch
      Object.entries(scopedKeys).forEach(([kName, storageKey]) => {
        if (kName === 'SESSION' || kName === 'USERS' || kName === 'CONFIG') return;
        if (preserveKeys.has(storageKey)) return;
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      });

      // 2. Write explicit empty arrays for this branch so initial seed data does NOT resurrect
      localStorage.setItem(scopedKeys.BAKERIES, JSON.stringify([]));
      localStorage.setItem(scopedKeys.DEBTS, JSON.stringify([]));
      localStorage.setItem(scopedKeys.DAILY_TASKS, JSON.stringify([]));
      localStorage.setItem(scopedKeys.INBOX_MESSAGES, JSON.stringify([]));
      localStorage.setItem(scopedKeys.INITIALIZED, 'true');
      localStorage.setItem(`${CLEAN_START_EPOCH_KEY}__${targetBranchId}`, new Date().toISOString());

      // 3. Remove branch-specific module bundles & caches ONLY for this branch
      const modulePrefixKeys = [
        `tamween_branch_modules_v1::${targetBranchId}`,
        `TAMWEEN_MODULES_${targetBranchId}`,
      ];
      modulePrefixKeys.forEach((mk) => {
        try {
          localStorage.removeItem(mk);
        } catch {}
      });

      // Remove any extra keys explicitly tagged with this branchId (never touching other branches!)
      const extraToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || preserveKeys.has(k)) continue;
        if (
          k.startsWith(`tamween_branch_modules_v1::${targetBranchId}`) ||
          (targetBranchId !== DEFAULT_BRANCH_ID &&
            (k.endsWith(`__${targetBranchId}`) || k.includes(`__${targetBranchId}__`)) &&
            k !== scopedKeys.USERS &&
            k !== scopedKeys.CONFIG &&
            k !== scopedKeys.BAKERIES &&
            k !== scopedKeys.DEBTS &&
            k !== scopedKeys.DAILY_TASKS &&
            k !== scopedKeys.INBOX_MESSAGES &&
            k !== scopedKeys.INITIALIZED)
        ) {
          extraToRemove.push(k);
        }
      }
      extraToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
    }
  } catch {}

  // 4. Delete ONLY this branch's IndexedDB record (preserve all other branches in IndexedDB!)
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const branchDbKey = targetBranchId === DEFAULT_BRANCH_ID ? 'current_state' : `current_state__${targetBranchId}`;
    store.delete(branchDbKey);
    store.delete(`state_${targetBranchId}`);
    await new Promise((res) => {
      tx.oncomplete = res;
      tx.onerror = res;
    });
  } catch {}
}

// Branch-scoped Factory Reset (defaults to active branch; never wipes other branches)
export async function factoryReset(branchId?: string): Promise<void> {
  await factoryResetBranch(branchId);
}

/**
 * إعادة ضبط المصنع الانتقائية للفروع غير الرئيسية فقط — تحفظ بيانات "إدارة تموين مركز المحلة الكبرى" بالكامل
 */
export function resetNonMahallaBranchesLocal(): {
  remainingBranches: SupplyBranch[];
  removedCount: number;
} {
  let mahallaOnly: SupplyBranch[] = [DEFAULT_SUPPLY_BRANCHES[0]];
  let removedCount = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      const branches = getBranchesList();
      const nonMahallaBranches = branches.filter((b) => b.id !== DEFAULT_BRANCH_ID);
      const nonMahallaIds = new Set(nonMahallaBranches.map((b) => b.id));
      removedCount = nonMahallaIds.size;

      for (const b of nonMahallaBranches) {
        markBranchDeleted(b.id, b.name);
      }
      for (const c of CANONICAL_DEFAULT_BRANCHES) {
        if (c.id !== DEFAULT_BRANCH_ID) {
          markBranchDeleted(c.id, c.name);
        }
      }

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        for (const brId of nonMahallaIds) {
          if (k.endsWith(`__${brId}`) || k.includes(`__${brId}__`)) {
            keysToRemove.push(k);
            break;
          }
        }
        if (k.startsWith('TAMWEEN_MODULES_') && !k.includes(DEFAULT_BRANCH_ID)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
      mahallaOnly = [branches.find((b) => b.id === DEFAULT_BRANCH_ID) || DEFAULT_SUPPLY_BRANCHES[0]];
      saveBranchesList(mahallaOnly);
      setActiveBranchId(DEFAULT_BRANCH_ID);
    }
  } catch {}
  return { remainingBranches: mahallaOnly, removedCount };
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
