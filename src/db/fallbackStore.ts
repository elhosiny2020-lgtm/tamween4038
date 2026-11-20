import fs from 'fs';
import path from 'path';
import type {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  AppUser,
  DailyBakeryTask,
  InboxChatMessage,
  HighDebtAlertNotification,
  SystemConfig,
  SupplyBranch,
  ColumnTitles,
} from '../types.ts';
import {
  deduplicateSupplyBranches,
  normalizeBranchNameKey,
  resolveCanonicalBranchIdentity,
  markBranchDeleted,
  unmarkBranchDeleted,
  isBranchMarkedDeleted,
  getDeletedBranchKeys,
  clearDeletedBranchesRegistry,
  CANONICAL_DEFAULT_BRANCHES,
  DEFAULT_VAULT_USERNAME,
  DEFAULT_VAULT_PASSCODE,
} from '../utils/branchVaultUtils.ts';
import type {
  NormalizedTableName,
  PostgresBootstrapResult,
  StoredFileEntry,
  UpsertRowResult,
} from './queries.ts';
import {
  hashPasswordScrypt,
  isScryptHash,
  normalizeDigits,
  sanitizeSystemConfigForClient,
  sanitizeUserForClient,
  sanitizeUsersForClient,
  verifyPasswordScrypt,
} from '../utils/serverAuth.ts';
import { INITIAL_USERS } from '../defaultData.ts';
import {
  cloneDefaultBranchDepartmentsStructure,
  wipeSectionFromModulesBundle,
  wipeVillageFromModulesBundle,
  type ResettableSectionKey,
} from '../utils/branchOperations.ts';
import { createEmptyBranchModulesBundle } from '../services/modulesStorage.ts';
import type { BranchDepartmentConfigItem } from '../types.ts';

function getFallbackStorePath(): string {
  return process.env.TAMWEEN_FALLBACK_STORE_PATH || '/tmp/tamween_pg_fallback_store.json';
}
const DEFAULT_BRANCH_ID = 'branch-mahalla';

const DEFAULT_BRANCH: SupplyBranch & { version?: number } = {
  id: DEFAULT_BRANCH_ID,
  name: 'إدارة تموين مركز المحلة الكبرى',
  governorateTitle: 'محافظة الغربية',
  directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
  description: 'الإدارة الرئيسية الافتراضية لمركز المحلة الكبرى',
  createdAt: new Date().toISOString(),
  isDefault: true,
  version: 1,
};

const SAMANOUD_BRANCH: SupplyBranch & { version?: number } = {
  id: 'branch-samanoud',
  name: 'إدارة تموين سمنود',
  governorateTitle: 'محافظة الغربية',
  directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
  description: 'الإدارة التموينية لمركز ومدينة سمنود (قاعدة بيانات مستقلة)',
  createdAt: new Date().toISOString(),
  isDefault: false,
  version: 1,
};

interface FallbackStoreData {
  branches: Array<SupplyBranch & { version?: number }>;
  deleted_branch_keys?: string[];
  villages: Array<VillageHierarchy & { id: string; branchId: string; version?: number }>;
  bakeries: Array<Bakery & { branchId: string; version?: number }>;
  debts: Array<DebtRecord & { branchId: string; version?: number }>;
  app_users: Array<AppUser & { branchId: string; version?: number }>;
  daily_tasks: Array<DailyBakeryTask & { branchId: string; version?: number }>;
  inbox_messages: Array<InboxChatMessage & { branchId: string; version?: number }>;
  high_debt_alerts: Array<HighDebtAlertNotification & { branchId: string; version?: number }>;
  system_config: Array<{
    branchId: string;
    systemConfig: SystemConfig;
    columnTitles: Partial<ColumnTitles>;
    activityStatuses: string[];
    version?: number;
  }>;
  dropdown_lists: Array<{
    id: string;
    branchId: string;
    listKey: string;
    options: string[];
    version?: number;
  }>;
  audit_logs: Array<{
    id: string;
    branchId: string;
    userEmail: string;
    username?: string;
    department?: string;
    operation?: string;
    recordId?: string;
    result?: string;
    action: string;
    details: string;
    ipAddress: string;
    createdAt: string;
  }>;
  audit_deletion_security_log: Array<{
    id: string;
    branchId: string;
    deletedBy: string;
    deletedByFullName: string;
    targetScope: string;
    deletedCount: number;
    reason: string;
    ipAddress: string;
    createdAt: string;
  }>;
  storage_files: Record<string, StoredFileEntry>;
  module_states: Record<
    string,
    { branchId: string; moduleKey: string; payload: any; updatedBy: string; version: number; updatedAt: string }
  >;
}

let memoryStore: FallbackStoreData | null = null;
let memoryStorePath: string | null = null;

function createEmptyStore(): FallbackStoreData {
  return {
    branches: CANONICAL_DEFAULT_BRANCHES.map((b) => ({ ...b, version: 1 })),
    deleted_branch_keys: [],
    villages: [],
    bakeries: [],
    debts: [],
    app_users: [],
    daily_tasks: [],
    inbox_messages: [],
    high_debt_alerts: [],
    system_config: [],
    dropdown_lists: [],
    audit_logs: [],
    audit_deletion_security_log: [],
    storage_files: {},
    module_states: {},
  };
}

function loadStore(): FallbackStoreData {
  const storePath = getFallbackStorePath();
  if (memoryStore && memoryStorePath === storePath) return memoryStore;
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw) as Partial<FallbackStoreData>;
        if (Array.isArray(parsed.deleted_branch_keys)) {
          for (const k of parsed.deleted_branch_keys) {
            if (typeof k === 'string' && k.trim()) {
              markBranchDeleted(k.trim());
            }
          }
        }
        const base = createEmptyStore();
        memoryStorePath = storePath;
        memoryStore = {
          ...base,
          ...parsed,
          deleted_branch_keys: Array.from(getDeletedBranchKeys()),
          branches:
            Array.isArray(parsed.branches) && parsed.branches.length > 0
              ? deduplicateSupplyBranches(parsed.branches)
              : deduplicateSupplyBranches(base.branches),
          audit_deletion_security_log: Array.isArray(parsed.audit_deletion_security_log)
            ? parsed.audit_deletion_security_log
            : [],
          storage_files: parsed.storage_files && typeof parsed.storage_files === 'object' ? parsed.storage_files : {},
          module_states: parsed.module_states && typeof parsed.module_states === 'object' ? parsed.module_states : {},
        };
        return memoryStore;
      }
    }
  } catch {
    // Fall back to fresh empty store if file is unreadable
  }
  memoryStorePath = storePath;
  memoryStore = createEmptyStore();
  return memoryStore;
}

function persistStore(store: FallbackStoreData): void {
  const storePath = getFallbackStorePath();
  store.deleted_branch_keys = Array.from(getDeletedBranchKeys());
  memoryStorePath = storePath;
  memoryStore = store;
  try {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(storePath, JSON.stringify(store), { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Keep in-memory store authoritative even if /tmp write fails
  }
}

function ensureFallbackBranch(store: FallbackStoreData, branchId: string, branchName?: string) {
  const cleanId = branchId || DEFAULT_BRANCH_ID;
  if (isBranchMarkedDeleted(cleanId, branchName)) return;
  if (store.branches.some((b) => b.id === cleanId)) return;
  const { canonicalName, isCanonicalDefault } = resolveCanonicalBranchIdentity(cleanId, branchName);
  if (isBranchMarkedDeleted(cleanId, canonicalName)) return;
  store.branches.push({
    id: cleanId,
    name: canonicalName,
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: '',
    createdAt: new Date().toISOString(),
    isDefault: cleanId === DEFAULT_BRANCH_ID || isCanonicalDefault,
    version: 1,
  });
}

export function isPostgresUnavailableError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  if (code === '42703') return false;
  const msg = String(err.message || '').toLowerCase();
  const isRelationOrDbMissing =
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('database') && msg.includes('does not exist'));
  return (
    code === '42501' || // insufficient_privilege / permission denied
    code === '42P01' || // undefined_table
    code === '3D000' || // invalid_catalog_name
    code === '28P01' || // invalid_password
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    isRelationOrDbMissing ||
    msg.includes('permission denied') ||
    msg.includes('econnrefused') ||
    msg.includes('password authentication failed') ||
    msg.includes('connect') ||
    msg.includes('connection terminated')
  );
}

export function fallbackGetBootstrap(requestedBranchId = DEFAULT_BRANCH_ID): PostgresBootstrapResult {
  const store = loadStore();
  const branchId = requestedBranchId || DEFAULT_BRANCH_ID;
  const dropdownLists: Record<string, string[]> = {};
  for (const dl of store.dropdown_lists) {
    if (dl.branchId === branchId && dl.listKey && Array.isArray(dl.options)) {
      dropdownLists[dl.listKey] = dl.options.map(String);
    }
  }
  const cfg = store.system_config.find((c) => c.branchId === branchId) || null;
  const totalRows =
    store.bakeries.length +
    store.debts.length +
    store.villages.length +
    store.app_users.length +
    store.daily_tasks.length +
    store.inbox_messages.length;

  return {
    branchId,
    branches: deduplicateSupplyBranches(store.branches),
    villages: store.villages
      .filter((v) => v.branchId === branchId)
      .map((v) => ({ village: v.village, localUnits: Array.isArray(v.localUnits) ? v.localUnits : [] })),
    bakeries: store.bakeries.filter((b) => b.branchId === branchId),
    debts: store.debts.filter((d) => d.branchId === branchId),
    users: sanitizeUsersForClient(store.app_users.filter((u) => u.branchId === branchId)) as AppUser[],
    dailyTasks: store.daily_tasks.filter((t) => t.branchId === branchId),
    inboxMessages: store.inbox_messages.filter((m) => m.branchId === branchId),
    highDebtAlerts: store.high_debt_alerts.filter((a) => a.branchId === branchId).slice(0, 250),
    systemConfig: cfg?.systemConfig ? sanitizeSystemConfigForClient(cfg.systemConfig) : null,
    columnTitles: cfg?.columnTitles || null,
    activityStatuses: cfg?.activityStatuses || [],
    dropdownLists,
    hasAnyRows: totalRows > 0,
  };
}

export function fallbackQueryTablePaginated(
  table: NormalizedTableName,
  options: {
    branchId?: string;
    search?: string;
    village?: string;
    localUnit?: string;
    activityStatus?: string;
    bakeryId?: string;
    status?: string;
    priority?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const store = loadStore();
  const branchId = options.branchId || DEFAULT_BRANCH_ID;
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(1000, Math.max(1, Number(options.pageSize || 100)));
  const search = options.search?.trim().toLowerCase() || '';

  let rows: any[] = [];
  if (table === 'branches') {
    rows = deduplicateSupplyBranches(store.branches);
  } else if (table === 'audit_logs' && branchId === 'ALL') {
    rows = [...(store.audit_logs || [])];
  } else {
    rows = ((store as any)[table] || []).filter((r: any) => (r.branchId || DEFAULT_BRANCH_ID) === branchId);
  }

  if (table === 'bakeries') {
    if (options.village && options.village !== 'الكل') {
      rows = rows.filter((b) => b.village === options.village);
    }
    if (options.localUnit && options.localUnit !== 'الكل') {
      rows = rows.filter((b) => b.localUnit === options.localUnit);
    }
    if (options.activityStatus && options.activityStatus !== 'الكل') {
      rows = rows.filter((b) => b.activityStatus === options.activityStatus);
    }
    if (search) {
      rows = rows.filter((b) =>
        [b.bakeryOwnerName, b.machineNumber, b.village, b.localUnit, b.phone, b.nationalId]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(search))
      );
    }
  } else if (table === 'debts') {
    if (options.bakeryId) {
      rows = rows.filter((d) => d.bakeryId === options.bakeryId);
    }
    if (options.village && options.village !== 'الكل') {
      rows = rows.filter((d) => d.village === options.village);
    }
    if (search) {
      rows = rows.filter((d) =>
        [d.bakeryOwnerName, d.machineNumber, d.village, d.violationType, d.notes]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(search))
      );
    }
  } else if (table === 'daily_tasks') {
    if (options.status && options.status !== 'all') {
      rows = rows.filter((t) => t.status === options.status);
    }
    if (options.priority && options.priority !== 'all') {
      rows = rows.filter((t) => t.priority === options.priority);
    }
    if (search) {
      rows = rows.filter((t) =>
        [t.title, t.description, t.bakeryName, t.village]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(search))
      );
    }
  } else if (table === 'audit_logs') {
    if (options.status && options.status !== 'all') {
      if (options.status === 'SUCCESS') {
        rows = rows.filter((a) => ['SUCCESS', 'ALLOWED'].includes(String(a.result || 'ALLOWED')));
      } else {
        rows = rows.filter((a) => String(a.result || 'ALLOWED') === options.status);
      }
    }
    if (search) {
      rows = rows.filter((a) =>
        [a.username, a.userEmail, a.department, a.operation, a.action, a.details, a.recordId, a.result]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(search))
      );
    }
  }

  const total = rows.length;
  const offset = (page - 1) * pageSize;
  const paged = rows.slice(offset, offset + pageSize);
  return {
    rows: table === 'app_users' ? sanitizeUsersForClient(paged) : paged,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function upsertInStoreInternal(
  store: FallbackStoreData,
  table: NormalizedTableName,
  branchId: string,
  payload: any
): UpsertRowResult {
  const effectiveBranchId = String(payload?.branchId || payload?.branch_id || branchId || DEFAULT_BRANCH_ID);
  if (table !== 'branches') {
    ensureFallbackBranch(store, effectiveBranchId);
  }

  const recordId =
    table === 'system_config'
      ? effectiveBranchId
      : table === 'villages'
      ? String(payload?.id || `${effectiveBranchId}__${payload?.village || ''}`)
      : table === 'dropdown_lists'
      ? String(payload?.id || `${effectiveBranchId}__${payload?.listKey || ''}`)
      : String(payload?.id || `rec-${Date.now()}`);

  if (!recordId) {
    return { success: false, operation: 'INSERT', error: 'معرف السجل (id) مفقود.' };
  }

  switch (table) {
    case 'branches': {
      const { canonicalId, canonicalName, isCanonicalDefault } = resolveCanonicalBranchIdentity(
        recordId,
        payload.name
      );
      const targetNorm = normalizeBranchNameKey(canonicalName);
      const matchedExisting = store.branches.find((b) => normalizeBranchNameKey(b.name) === targetNorm);
      const finalId = matchedExisting ? matchedExisting.id : canonicalId;
      const idx = store.branches.findIndex((b) => b.id === finalId);
      const nextRow: SupplyBranch & { version?: number } = {
        id: finalId,
        name: canonicalName,
        governorateTitle: String(payload.governorateTitle || 'محافظة الغربية'),
        directorateTitle: String(payload.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية'),
        description: String(payload.description || ''),
        isDefault: Boolean(payload.isDefault || isCanonicalDefault),
        createdAt: idx >= 0 ? store.branches[idx].createdAt : new Date().toISOString(),
        version: idx >= 0 ? Number(store.branches[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.branches[idx] = nextRow;
      else store.branches.push(nextRow);
      // Automatically provision full cloned department hierarchy for new branches with ZERO operational records
      const hasCfg = store.system_config.some((c) => c.branchId === finalId);
      if (!hasCfg) {
        const mahallaDepts = store.system_config.find((c) => c.branchId === DEFAULT_BRANCH_ID)?.systemConfig
          ?.branchDepartments;
        store.system_config.push({
          branchId: finalId,
          systemConfig: {
            governorateTitle: nextRow.governorateTitle,
            directorateTitle: nextRow.directorateTitle,
            administrationTitle: nextRow.name,
            englishSubtitle: '',
            logoBase64: '',
            branchDepartments: cloneDefaultBranchDepartmentsStructure(mahallaDepts),
          },
          columnTitles: {},
          activityStatuses: ['يعمل', 'متوقف كلي', 'متوقف جزئي', 'ملغى'],
          version: 1,
        });
      }
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'villages': {
      const idx = store.villages.findIndex(
        (v) => v.branchId === effectiveBranchId && v.village === String(payload.village || '')
      );
      const nextRow = {
        id: recordId,
        branchId: effectiveBranchId,
        village: String(payload.village || ''),
        localUnits: Array.isArray(payload.localUnits) ? payload.localUnits : [],
        version: idx >= 0 ? Number(store.villages[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.villages[idx] = nextRow;
      else store.villages.push(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'bakeries': {
      const cleanMachine = String(payload.machineNumber || '').trim();
      if (cleanMachine) {
        const dup = store.bakeries.find(
          (b) => b.branchId === effectiveBranchId && b.machineNumber === cleanMachine && b.id !== recordId
        );
        if (dup) {
          return {
            success: false,
            operation: 'INSERT',
            error: `رقم الماكينة (${cleanMachine}) مسجل بالفعل لمخبز آخر (${dup.bakeryOwnerName}) في نفس الإدارة.`,
          };
        }
      }
      const idx = store.bakeries.findIndex((b) => b.id === recordId);
      const nextRow = {
        ...payload,
        id: recordId,
        branchId: effectiveBranchId,
        version: idx >= 0 ? Number(store.bakeries[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.bakeries[idx] = nextRow;
      else store.bakeries.push(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'debts': {
      const idx = store.debts.findIndex((d) => d.id === recordId);
      const nextRow = {
        ...payload,
        id: recordId,
        branchId: effectiveBranchId,
        version: idx >= 0 ? Number(store.debts[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.debts[idx] = nextRow;
      else store.debts.unshift(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'app_users': {
      const cleanUsername = String(payload.username || '').trim();
      const idxById = store.app_users.findIndex((u) => u.id === recordId && u.branchId === effectiveBranchId);
      const idxByName = cleanUsername
        ? store.app_users.findIndex(
            (u) => u.branchId === effectiveBranchId && u.username.toLowerCase() === cleanUsername.toLowerCase()
          )
        : -1;
      const idx = idxById >= 0 ? idxById : idxByName;
      const existing = idx >= 0 ? store.app_users[idx] : null;
      const incomingPass = typeof payload.password === 'string' ? payload.password.trim() : '';
      const resolvedPassword = incomingPass
        ? isScryptHash(incomingPass)
          ? incomingPass
          : hashPasswordScrypt(incomingPass)
        : existing?.password || '';
      const resolvedRole = String(payload.role || existing?.role || 'inspector');
      const nextRow: AppUser & { branchId: string; version?: number } = {
        ...existing,
        ...payload,
        id: existing ? existing.id : recordId,
        branchId: effectiveBranchId,
        username: cleanUsername || existing?.username || '',
        fullName: String(payload.fullName ?? existing?.fullName ?? ''),
        password: resolvedPassword,
        role: resolvedRole,
        isSuperAdmin:
          typeof payload.isSuperAdmin === 'boolean'
            ? payload.isSuperAdmin
            : resolvedRole === 'super_admin' || (resolvedRole === 'admin' && existing?.isSuperAdmin !== false),
        isActive: payload.isActive !== undefined ? payload.isActive !== false : existing?.isActive !== false,
        notes: String(payload.notes ?? existing?.notes ?? ''),
        departmentPermissions:
          payload.departmentPermissions !== undefined
            ? payload.departmentPermissions
            : existing?.departmentPermissions,
        allowedDepartments:
          Array.isArray(payload.allowedDepartments)
            ? payload.allowedDepartments
            : existing?.allowedDepartments,
        createdAt: existing?.createdAt || payload.createdAt || new Date().toISOString(),
        version: existing ? Number(existing.version || 1) + 1 : 1,
      };
      if (idx >= 0) store.app_users[idx] = nextRow;
      else store.app_users.push(nextRow);
      return {
        success: true,
        operation: idx >= 0 ? 'UPDATE' : 'INSERT',
        row: sanitizeUserForClient(nextRow),
      };
    }

    case 'daily_tasks': {
      const idx = store.daily_tasks.findIndex((t) => t.id === recordId);
      const nextRow = {
        ...payload,
        id: recordId,
        branchId: effectiveBranchId,
        createdAt: idx >= 0 ? store.daily_tasks[idx].createdAt : payload.createdAt || new Date().toISOString(),
        version: idx >= 0 ? Number(store.daily_tasks[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.daily_tasks[idx] = nextRow;
      else store.daily_tasks.push(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'inbox_messages': {
      const idx = store.inbox_messages.findIndex((m) => m.id === recordId);
      const nextRow = {
        ...payload,
        id: recordId,
        branchId: effectiveBranchId,
        version: idx >= 0 ? Number(store.inbox_messages[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.inbox_messages[idx] = nextRow;
      else store.inbox_messages.push(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'high_debt_alerts': {
      const idx = store.high_debt_alerts.findIndex((a) => a.id === recordId);
      const nextRow = {
        ...payload,
        id: recordId,
        branchId: effectiveBranchId,
        version: idx >= 0 ? Number(store.high_debt_alerts[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.high_debt_alerts[idx] = nextRow;
      else store.high_debt_alerts.unshift(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'system_config': {
      const idx = store.system_config.findIndex((c) => c.branchId === effectiveBranchId);
      const existing = idx >= 0 ? store.system_config[idx] : null;
      const cfg = (payload.systemConfig || payload) as SystemConfig;

      const hashVaultPassIfPlain = (candidate: string | undefined, fallbackStored: string): string => {
        const raw = String(candidate || '').trim();
        if (!raw || raw === '••••••••') return fallbackStored;
        return isScryptHash(raw) ? raw : hashPasswordScrypt(raw);
      };

      const existingPass =
        existing?.systemConfig?.vaultPasscode || hashPasswordScrypt(DEFAULT_VAULT_PASSCODE);
      const resolvedVaultPass = hashVaultPassIfPlain(cfg.vaultPasscode, existingPass);

      const rawCredMap =
        cfg.branchVaultCredentials && typeof cfg.branchVaultCredentials === 'object'
          ? cfg.branchVaultCredentials
          : existing?.systemConfig?.branchVaultCredentials;
      let resolvedCredMap: Record<string, any> | undefined = undefined;
      if (rawCredMap && typeof rawCredMap === 'object') {
        resolvedCredMap = {};
        for (const [bKey, cred] of Object.entries(rawCredMap)) {
          if (!cred || typeof cred !== 'object') continue;
          const prevCred = existing?.systemConfig?.branchVaultCredentials?.[bKey];
          const prevCredPass = prevCred?.password || resolvedVaultPass;
          resolvedCredMap[bKey] = {
            ...cred,
            username: normalizeDigits(String((cred as any).username || prevCred?.username || DEFAULT_VAULT_USERNAME)),
            password: hashVaultPassIfPlain((cred as any).password, prevCredPass),
          };
        }
      }

      const resolvedVaultUser = String(
        cfg.vaultUsername ?? existing?.systemConfig?.vaultUsername ?? DEFAULT_VAULT_USERNAME
      );

      const mergedDailyAlertConfig = {
        ...(existing?.systemConfig?.dailyAlertConfig || {}),
        ...(cfg.dailyAlertConfig || {}),
        vaultUsername: resolvedVaultUser,
        vaultPasscode: resolvedVaultPass,
        branchVaultCredentials: resolvedCredMap,
      };
      const nextRow = {
        branchId: effectiveBranchId,
        systemConfig: {
          ...(existing?.systemConfig || {}),
          ...cfg,
          vaultUsername: resolvedVaultUser,
          vaultPasscode: resolvedVaultPass,
          branchVaultCredentials: resolvedCredMap,
          dailyAlertConfig: mergedDailyAlertConfig,
        } as SystemConfig,
        columnTitles: payload.columnTitles || existing?.columnTitles || {},
        activityStatuses: Array.isArray(payload.activityStatuses)
          ? payload.activityStatuses
          : existing?.activityStatuses || [],
        version: existing ? Number(existing.version || 1) + 1 : 1,
      };
      if (idx >= 0) store.system_config[idx] = nextRow;
      else store.system_config.push(nextRow);
      return {
        success: true,
        operation: idx >= 0 ? 'UPDATE' : 'INSERT',
        row: {
          ...nextRow,
          systemConfig: sanitizeSystemConfigForClient(nextRow.systemConfig),
        },
      };
    }

    case 'dropdown_lists': {
      const listKey = String(payload.listKey || '');
      const idx = store.dropdown_lists.findIndex(
        (dl) => dl.branchId === effectiveBranchId && dl.listKey === listKey
      );
      const nextRow = {
        id: recordId,
        branchId: effectiveBranchId,
        listKey,
        options: Array.isArray(payload.options) ? payload.options : [],
        version: idx >= 0 ? Number(store.dropdown_lists[idx].version || 1) + 1 : 1,
      };
      if (idx >= 0) store.dropdown_lists[idx] = nextRow;
      else store.dropdown_lists.push(nextRow);
      return { success: true, operation: idx >= 0 ? 'UPDATE' : 'INSERT', row: nextRow };
    }

    case 'audit_logs': {
      const nextRow = {
        id: recordId,
        branchId: effectiveBranchId,
        userEmail: String(payload.userEmail || payload.username || 'system'),
        username: String(payload.username || payload.userEmail || 'system'),
        department: String(payload.department || 'system'),
        operation: String(payload.operation || payload.action || 'ACTION'),
        recordId: String(payload.recordId || ''),
        result: String(payload.result || 'ALLOWED'),
        action: String(payload.action || 'ACTION'),
        details: String(payload.details || ''),
        ipAddress: String(payload.ipAddress || '127.0.0.1'),
        createdAt: new Date().toISOString(),
      };
      store.audit_logs.unshift(nextRow);
      if (store.audit_logs.length > 2000) store.audit_logs.length = 2000;
      return { success: true, operation: 'INSERT', row: nextRow };
    }
  }
}

export function fallbackUpsertRow(
  table: NormalizedTableName,
  branchId: string,
  payload: any
): UpsertRowResult {
  const store = loadStore();
  if (table === 'branches') {
    unmarkBranchDeleted(payload?.id || branchId, payload?.name);
  }
  const res = upsertInStoreInternal(store, table, branchId, payload);
  if (res.success) {
    persistStore(store);
  }
  return res;
}

export function fallbackDeleteRow(
  table: NormalizedTableName,
  id: string,
  branchId?: string
): { success: boolean; deletedRow?: any; error?: string } {
  const store = loadStore();
  if (table === 'branches') {
    const existing =
      store.branches.find((b) => String(b.id) === String(id)) ||
      CANONICAL_DEFAULT_BRANCHES.find((b) => String(b.id) === String(id));
    markBranchDeleted(id, existing?.name);
    const targetNorm = normalizeBranchNameKey(existing?.name);
    store.branches = store.branches.filter(
      (b) =>
        String(b.id) !== String(id) &&
        (!targetNorm || normalizeBranchNameKey(b.name) !== targetNorm)
    );
    // Clean up child rows for the deleted branch
    store.villages = store.villages.filter((r) => r.branchId !== id);
    store.bakeries = store.bakeries.filter((r) => r.branchId !== id);
    store.debts = store.debts.filter((r) => r.branchId !== id);
    store.app_users = store.app_users.filter((r) => r.branchId !== id);
    store.daily_tasks = store.daily_tasks.filter((r) => r.branchId !== id);
    store.inbox_messages = store.inbox_messages.filter((r) => r.branchId !== id);
    store.high_debt_alerts = store.high_debt_alerts.filter((r) => r.branchId !== id);
    store.system_config = store.system_config.filter((r) => r.branchId !== id);
    store.dropdown_lists = store.dropdown_lists.filter((r) => r.branchId !== id);
    persistStore(store);
    return { success: true, deletedRow: existing || { id } };
  }
  if (table === 'system_config') {
    const idx = store.system_config.findIndex((c) => c.branchId === id);
    if (idx < 0) return { success: true, deletedRow: null };
    const [deleted] = store.system_config.splice(idx, 1);
    persistStore(store);
    return { success: true, deletedRow: deleted };
  }
  const arr = (store as any)[table] as any[];
  if (!Array.isArray(arr)) return { success: true, deletedRow: null };
  const idx = arr.findIndex(
    (r) => String(r.id) === String(id) && (!branchId || r.branchId === branchId)
  );
  if (idx < 0) return { success: true, deletedRow: null };
  const [deleted] = arr.splice(idx, 1);
  persistStore(store);
  return { success: true, deletedRow: deleted };
}

export function fallbackSyncFullBranchState(
  branchId: string,
  stateData: any,
  options?: { pruneRemoved?: boolean }
): { success: boolean; syncedCounts: Record<string, number>; error?: string } {
  const store = loadStore();
  const effectiveBranchId = branchId || stateData?.activeBranchId || DEFAULT_BRANCH_ID;
  const syncedCounts: Record<string, number> = {
    branches: 0,
    villages: 0,
    bakeries: 0,
    debts: 0,
    app_users: 0,
    daily_tasks: 0,
    inbox_messages: 0,
    dropdown_lists: 0,
  };

  if (Array.isArray(stateData?.branches)) {
    for (const br of stateData.branches) {
      if (br?.id && !isBranchMarkedDeleted(br.id, br.name)) {
        upsertInStoreInternal(store, 'branches', br.id, br);
        syncedCounts.branches += 1;
      }
    }
  }
  ensureFallbackBranch(store, effectiveBranchId);

  if (Array.isArray(stateData?.villages)) {
    const names = new Set(stateData.villages.map((v: any) => String(v.village)).filter(Boolean));
    for (const v of stateData.villages) {
      if (v?.village) {
        upsertInStoreInternal(store, 'villages', effectiveBranchId, {
          id: `${effectiveBranchId}__${v.village}`,
          branchId: effectiveBranchId,
          village: v.village,
          localUnits: v.localUnits || [],
        });
        syncedCounts.villages += 1;
      }
    }
    if (options?.pruneRemoved) {
      store.villages = store.villages.filter(
        (v) => v.branchId !== effectiveBranchId || names.has(v.village)
      );
    }
  }

  const incomingBakeryIds = new Set<string>();
  if (Array.isArray(stateData?.bakeries)) {
    for (const b of stateData.bakeries) {
      if (b?.id) {
        const res = upsertInStoreInternal(store, 'bakeries', effectiveBranchId, b);
        if (res.success) {
          incomingBakeryIds.add(String(b.id));
          syncedCounts.bakeries += 1;
        }
      }
    }
  }

  const incomingDebtIds = new Set<string>();
  if (Array.isArray(stateData?.debts)) {
    for (const d of stateData.debts) {
      if (d?.id && d?.bakeryId) {
        const res = upsertInStoreInternal(store, 'debts', effectiveBranchId, d);
        if (res.success) {
          incomingDebtIds.add(String(d.id));
          syncedCounts.debts += 1;
        }
      }
    }
  }

  if (options?.pruneRemoved && Array.isArray(stateData?.debts)) {
    store.debts = store.debts.filter(
      (d) => d.branchId !== effectiveBranchId || incomingDebtIds.has(String(d.id))
    );
  }
  if (options?.pruneRemoved && Array.isArray(stateData?.bakeries)) {
    store.bakeries = store.bakeries.filter(
      (b) => b.branchId !== effectiveBranchId || incomingBakeryIds.has(String(b.id))
    );
  }

  if (Array.isArray(stateData?.users)) {
    const syncedIds = new Set<string>();
    for (const u of stateData.users) {
      if (u?.id && u?.username) {
        const res = upsertInStoreInternal(store, 'app_users', effectiveBranchId, u);
        if (res.success) {
          syncedCounts.app_users += 1;
          if (res.row?.id) syncedIds.add(String(res.row.id));
        }
      }
    }
    if (options?.pruneRemoved && syncedIds.size > 0) {
      store.app_users = store.app_users.filter(
        (u) => u.branchId !== effectiveBranchId || syncedIds.has(String(u.id))
      );
    }
  }

  if (Array.isArray(stateData?.dailyTasks)) {
    const ids = new Set(stateData.dailyTasks.map((t: any) => String(t.id)).filter(Boolean));
    for (const t of stateData.dailyTasks) {
      if (t?.id) {
        upsertInStoreInternal(store, 'daily_tasks', effectiveBranchId, t);
        syncedCounts.daily_tasks += 1;
      }
    }
    if (options?.pruneRemoved) {
      store.daily_tasks = store.daily_tasks.filter(
        (t) => t.branchId !== effectiveBranchId || ids.has(String(t.id))
      );
    }
  }

  if (Array.isArray(stateData?.inboxMessages)) {
    const ids = new Set(stateData.inboxMessages.map((m: any) => String(m.id)).filter(Boolean));
    for (const m of stateData.inboxMessages) {
      if (m?.id) {
        upsertInStoreInternal(store, 'inbox_messages', effectiveBranchId, m);
        syncedCounts.inbox_messages += 1;
      }
    }
    if (options?.pruneRemoved) {
      store.inbox_messages = store.inbox_messages.filter(
        (m) => m.branchId !== effectiveBranchId || ids.has(String(m.id))
      );
    }
  }

  if (stateData?.systemConfig || stateData?.columnTitles || stateData?.activityStatuses) {
    upsertInStoreInternal(store, 'system_config', effectiveBranchId, {
      branchId: effectiveBranchId,
      systemConfig: stateData.systemConfig || {},
      columnTitles: stateData.columnTitles || {},
      activityStatuses: stateData.activityStatuses || [],
    });
  }

  const TOP_LEVEL_DROPDOWN_KEYS = [
    'issuingEntities',
    'violationTypes',
    'activityStatuses',
    'bakeryCategories',
    'breadTypes',
    'breadTypeCounts',
    'lineTypes',
    'fuelTypes',
    'leaseContractTypes',
    'responsibleManagerOptions',
    'paymentMethods',
  ] as const;
  const mergedDropdowns: Record<string, string[]> = {
    ...(stateData?.dropdownLists && typeof stateData.dropdownLists === 'object' ? stateData.dropdownLists : {}),
  };
  for (const k of TOP_LEVEL_DROPDOWN_KEYS) {
    if (Array.isArray(stateData?.[k])) {
      mergedDropdowns[k] = stateData[k];
    }
  }
  for (const [listKey, opts] of Object.entries(mergedDropdowns)) {
    if (Array.isArray(opts)) {
      upsertInStoreInternal(store, 'dropdown_lists', effectiveBranchId, {
        id: `${effectiveBranchId}__${listKey}`,
        branchId: effectiveBranchId,
        listKey,
        options: opts,
      });
      syncedCounts.dropdown_lists += 1;
    }
  }

  persistStore(store);
  return { success: true, syncedCounts };
}

export function fallbackSyncHighDebtAlerts(
  branchId: string,
  alerts: HighDebtAlertNotification[],
  debtAlertThreshold?: number
) {
  const store = loadStore();
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  ensureFallbackBranch(store, effectiveBranchId);
  const ids = new Set(alerts.map((a) => String(a.id)).filter(Boolean));
  for (const a of alerts) {
    upsertInStoreInternal(store, 'high_debt_alerts', a.branchId || effectiveBranchId, a);
  }
  store.high_debt_alerts = store.high_debt_alerts.filter(
    (a) => a.branchId !== effectiveBranchId || ids.has(String(a.id))
  );
  if (typeof debtAlertThreshold === 'number' && debtAlertThreshold > 0) {
    const cfgIdx = store.system_config.findIndex((c) => c.branchId === effectiveBranchId);
    if (cfgIdx >= 0) {
      store.system_config[cfgIdx].systemConfig.debtAlertThreshold = debtAlertThreshold;
    }
  }
  persistStore(store);
}

export function fallbackPurgeAll(): void {
  clearDeletedBranchesRegistry();
  const fresh = createEmptyStore();
  persistStore(fresh);
}

export function fallbackAuthenticateUser(
  branchId: string,
  usernameOrName: string,
  password: string
): { ok: boolean; user?: AppUser; error?: string; status?: number } {
  const store = loadStore();
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  const branchUsers = store.app_users.filter((u) => u.branchId === effectiveBranchId);
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  // Seed initial users into branch store if none exist yet
  if (branchUsers.length === 0) {
    const envAdminPass = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
    if (isProd) {
      if (envAdminPass) {
        const adminSeed = INITIAL_USERS.find((u) => u.role === 'admin');
        if (adminSeed) {
          upsertInStoreInternal(store, 'app_users', effectiveBranchId, {
            ...adminSeed,
            id: effectiveBranchId === DEFAULT_BRANCH_ID ? adminSeed.id : `${adminSeed.id}__${effectiveBranchId}`,
            branchId: effectiveBranchId,
            password: envAdminPass,
            isSuperAdmin: true,
            isActive: true,
          });
          persistStore(store);
        }
      } else {
        console.warn('[SECURITY NOTICE] Production branch has no users and INITIAL_ADMIN_PASSWORD is not set; skipping default user seeding.');
      }
    } else {
      for (const seed of INITIAL_USERS) {
        const resolvedSeedPass =
          seed.role === 'admin' && envAdminPass ? envAdminPass : seed.password;
        upsertInStoreInternal(store, 'app_users', effectiveBranchId, {
          ...seed,
          id: effectiveBranchId === DEFAULT_BRANCH_ID ? seed.id : `${seed.id}__${effectiveBranchId}`,
          branchId: effectiveBranchId,
          password: resolvedSeedPass,
          isSuperAdmin: seed.role === 'admin',
          isActive: seed.isActive !== false,
        });
      }
      persistStore(store);
    }
  }

  const target = usernameOrName.trim().toLowerCase();
  const matched = store.app_users.find(
    (u) =>
      u.branchId === effectiveBranchId &&
      (u.username.trim().toLowerCase() === target || u.fullName.trim().toLowerCase() === target)
  );
  if (!matched) {
    return { ok: false, status: 401, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }
  const seedUser = isProd
    ? null
    : INITIAL_USERS.find(
        (u) => (u.username || '').toLowerCase() === target || (u.fullName || '').toLowerCase() === target
      );
  const effectiveStoredPassword = matched.password || (seedUser ? seedUser.password : '');
  if (!verifyPasswordScrypt(password, effectiveStoredPassword)) {
    return { ok: false, status: 401, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }
  if (matched.isActive === false) {
    return { ok: false, status: 403, error: 'هذا الحساب موقوف حالياً. يرجى مراجعة مدير النظام.' };
  }
  // Auto-upgrade legacy un-hashed or missing password to scrypt upon successful verification
  if (!matched.password || !isScryptHash(matched.password)) {
    matched.password = hashPasswordScrypt(password);
    persistStore(store);
  }
  return { ok: true, user: sanitizeUserForClient(matched) as AppUser };
}

export function fallbackGetUserByIdAndBranch(branchId: string, userId: string): AppUser | null {
  const store = loadStore();
  const found = store.app_users.find(
    (u) => u.id === userId && (!branchId || u.branchId === branchId)
  );
  return found ? (sanitizeUserForClient(found) as AppUser) : null;
}

export function fallbackResetNonMahallaBranches(actorUsername = 'super_admin'): {
  success: boolean;
  backupFileName: string;
  removedBranchesCount: number;
  preservedMahallaCounts: { bakeries: number; debts: number; villages: number; users: number };
} {
  const store = loadStore();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `pre_reset_non_mahalla_branches_${ts}.json`;
  const nonMahallaBranches = store.branches.filter((b) => b.id !== DEFAULT_BRANCH_ID);
  const nonMahallaSnapshot = {
    createdAt: new Date().toISOString(),
    createdBy: actorUsername,
    branches: nonMahallaBranches,
    villages: store.villages.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    bakeries: store.bakeries.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    debts: store.debts.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    app_users: store.app_users
      .filter((r) => r.branchId !== DEFAULT_BRANCH_ID)
      .map((u) => sanitizeUserForClient(u)),
    daily_tasks: store.daily_tasks.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    inbox_messages: store.inbox_messages.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    high_debt_alerts: store.high_debt_alerts.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    system_config: store.system_config.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    dropdown_lists: store.dropdown_lists.filter((r) => r.branchId !== DEFAULT_BRANCH_ID),
    module_states: Object.fromEntries(
      Object.entries(store.module_states || {}).filter(([, v]) => v.branchId !== DEFAULT_BRANCH_ID)
    ),
  };

  const jsonStr = JSON.stringify(nonMahallaSnapshot);
  store.storage_files[`storage__${DEFAULT_BRANCH_ID}__${backupFileName}`] = {
    id: `storage__${DEFAULT_BRANCH_ID}__${backupFileName}`,
    fileName: backupFileName,
    branchId: DEFAULT_BRANCH_ID,
    contentType: 'application/json',
    sizeBytes: Buffer.byteLength(jsonStr, 'utf-8'),
    content: jsonStr,
    updatedAt: new Date().toISOString(),
  };

  // Preserve branch-mahalla 100%, remove/reset all other branches and mark them deleted
  for (const b of nonMahallaBranches) {
    markBranchDeleted(b.id, b.name);
  }
  for (const c of CANONICAL_DEFAULT_BRANCHES) {
    if (c.id !== DEFAULT_BRANCH_ID) {
      markBranchDeleted(c.id, c.name);
    }
  }
  store.branches = store.branches.filter((b) => b.id === DEFAULT_BRANCH_ID);
  store.villages = store.villages.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.bakeries = store.bakeries.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.debts = store.debts.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.app_users = store.app_users.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.daily_tasks = store.daily_tasks.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.inbox_messages = store.inbox_messages.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.high_debt_alerts = store.high_debt_alerts.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.system_config = store.system_config.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  store.dropdown_lists = store.dropdown_lists.filter((r) => r.branchId === DEFAULT_BRANCH_ID);
  for (const key of Object.keys(store.module_states || {})) {
    if (store.module_states[key]?.branchId !== DEFAULT_BRANCH_ID) {
      delete store.module_states[key];
    }
  }

  const preservedMahallaCounts = {
    bakeries: store.bakeries.filter((b) => b.branchId === DEFAULT_BRANCH_ID).length,
    debts: store.debts.filter((d) => d.branchId === DEFAULT_BRANCH_ID).length,
    villages: store.villages.filter((v) => v.branchId === DEFAULT_BRANCH_ID).length,
    users: store.app_users.filter((u) => u.branchId === DEFAULT_BRANCH_ID).length,
  };

  store.audit_logs.unshift({
    id: `aud-${Date.now()}`,
    branchId: DEFAULT_BRANCH_ID,
    userEmail: actorUsername,
    username: actorUsername,
    department: 'branches',
    operation: 'RESET_NON_MAHALLA_BRANCHES',
    recordId: 'non-mahalla',
    result: 'ALLOWED',
    action: 'RESET_NON_MAHALLA_BRANCHES',
    details: `تم أخذ نسخة احتياطية (${backupFileName}) وتصفير (${nonMahallaBranches.length}) إدارات/فروع غير المحلة الكبرى مع الحفاظ الكامل على إدارة تموين مركز المحلة الكبرى (${preservedMahallaCounts.bakeries} مخبز، ${preservedMahallaCounts.debts} مديونية).`,
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
  });

  persistStore(store);
  return {
    success: true,
    backupFileName,
    removedBranchesCount: nonMahallaBranches.length,
    preservedMahallaCounts,
  };
}

export function fallbackUpsertStorageFile(params: {
  id: string;
  fileName: string;
  branchId: string;
  contentType: string;
  sizeBytes: number;
  content: string;
}): StoredFileEntry {
  const store = loadStore();
  const entry: StoredFileEntry = {
    id: params.id,
    fileName: params.fileName,
    branchId: params.branchId,
    contentType: params.contentType,
    sizeBytes: params.sizeBytes,
    content: params.content,
    updatedAt: new Date().toISOString(),
  };
  store.storage_files[params.id] = entry;
  persistStore(store);
  return {
    id: entry.id,
    fileName: entry.fileName,
    branchId: entry.branchId,
    contentType: entry.contentType,
    sizeBytes: entry.sizeBytes,
    updatedAt: entry.updatedAt,
  };
}

export function fallbackListStorageFiles(branchId: string): StoredFileEntry[] {
  const store = loadStore();
  return Object.values(store.storage_files)
    .filter((f) => f.branchId === branchId)
    .map(({ content: _omit, ...rest }) => rest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function fallbackGetStorageFile(candidateId: string): StoredFileEntry | null {
  const store = loadStore();
  return store.storage_files[candidateId] || null;
}

export function fallbackDeleteStorageFile(candidateId: string): boolean {
  const store = loadStore();
  if (!store.storage_files[candidateId]) return false;
  delete store.storage_files[candidateId];
  persistStore(store);
  return true;
}

export function fallbackGetBranchModuleState(
  branchId: string,
  moduleKey = 'all_modules'
): { exists: boolean; payload: any; version: number; updatedAt: string | null } {
  const store = loadStore();
  const key = `${branchId || DEFAULT_BRANCH_ID}::${moduleKey}`;
  const found = store.module_states[key];
  if (!found) return { exists: false, payload: null, version: 0, updatedAt: null };
  return {
    exists: true,
    payload: found.payload,
    version: found.version,
    updatedAt: found.updatedAt,
  };
}

export function fallbackUpsertBranchModuleState(
  branchId: string,
  payload: any,
  updatedBy = 'system',
  moduleKey = 'all_modules'
): { version: number; updatedAt: string } {
  const store = loadStore();
  const cleanBranch = (branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const key = `${cleanBranch}::${moduleKey}`;
  const prev = store.module_states[key];
  const nextVersion = (prev?.version || 0) + 1;
  const nowIso = new Date().toISOString();
  store.module_states[key] = {
    branchId: cleanBranch,
    moduleKey,
    payload,
    updatedBy,
    version: nextVersion,
    updatedAt: nowIso,
  };
  persistStore(store);
  return { version: nextVersion, updatedAt: nowIso };
}

export function fallbackRecordAuditDeletionSecurityLog(entry: {
  branchId?: string;
  deletedBy: string;
  deletedByFullName?: string;
  targetScope: string;
  deletedCount: number;
  reason: string;
  ipAddress?: string;
}) {
  const store = loadStore();
  if (!Array.isArray(store.audit_deletion_security_log)) {
    store.audit_deletion_security_log = [];
  }
  const row = {
    id: `aud-sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    branchId: entry.branchId || DEFAULT_BRANCH_ID,
    deletedBy: entry.deletedBy,
    deletedByFullName: entry.deletedByFullName || entry.deletedBy,
    targetScope: entry.targetScope,
    deletedCount: Math.max(0, Number(entry.deletedCount) || 0),
    reason: entry.reason || '',
    ipAddress: entry.ipAddress || '127.0.0.1',
    createdAt: new Date().toISOString(),
  };
  store.audit_deletion_security_log.unshift(row);
  persistStore(store);
  return row;
}

export function fallbackListAuditDeletionSecurityLogs(branchId?: string) {
  const store = loadStore();
  const list = Array.isArray(store.audit_deletion_security_log)
    ? store.audit_deletion_security_log
    : [];
  if (!branchId || branchId === 'ALL') return [...list];
  return list.filter((item) => item.branchId === branchId);
}

export function fallbackDeleteAuditLogs(params: {
  branchId?: string;
  ids?: string[];
  deletedBy: string;
  deletedByFullName?: string;
  targetScope: string;
  reason: string;
  ipAddress?: string;
}) {
  const store = loadStore();
  const prevLen = store.audit_logs.length;
  const idsSet = Array.isArray(params.ids) && params.ids.length > 0 ? new Set(params.ids.map(String)) : null;

  store.audit_logs = store.audit_logs.filter((row) => {
    const branchMatches = !params.branchId || params.branchId === 'ALL' || row.branchId === params.branchId;
    if (!branchMatches) return true;
    if (idsSet) return !idsSet.has(String(row.id));
    return false;
  });

  const deletedCount = Math.max(0, prevLen - store.audit_logs.length);
  const securityEntry = fallbackRecordAuditDeletionSecurityLog({
    branchId: params.branchId && params.branchId !== 'ALL' ? params.branchId : DEFAULT_BRANCH_ID,
    deletedBy: params.deletedBy,
    deletedByFullName: params.deletedByFullName,
    targetScope: params.targetScope,
    deletedCount,
    reason: params.reason,
    ipAddress: params.ipAddress,
  });
  persistStore(store);
  return { deletedCount, securityEntry };
}

export function fallbackVerifyVaultCredentials(params: {
  branchId: string;
  enteredUsername?: string;
  enteredPassword: string;
}): boolean {
  const store = loadStore();
  const effectiveBranchId = params.branchId || DEFAULT_BRANCH_ID;
  const cfg =
    store.system_config.find((c) => c.branchId === effectiveBranchId)?.systemConfig ||
    store.system_config.find((c) => c.branchId === DEFAULT_BRANCH_ID)?.systemConfig;
  const cred = cfg?.branchVaultCredentials?.[effectiveBranchId];
  const targetUser = normalizeDigits(
    String(cred?.username || cfg?.vaultUsername || DEFAULT_VAULT_USERNAME)
  ).toLowerCase();
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';
  const defaultVaultPass = isProd
    ? String(process.env.INITIAL_VAULT_PASSCODE || '').trim()
    : DEFAULT_VAULT_PASSCODE;
  const targetPass = String(cred?.password || cfg?.vaultPasscode || defaultVaultPass);
  if (!targetPass) return false;
  if (!verifyPasswordScrypt(params.enteredPassword, targetPass)) return false;

  const cleanUser = normalizeDigits(String(params.enteredUsername || '')).toLowerCase();
  if (cleanUser) return cleanUser === targetUser;
  return targetUser === DEFAULT_VAULT_USERNAME.toLowerCase();
}

export function fallbackUpdateVaultCredentials(params: {
  targetScope: 'all' | string;
  newUsername: string;
  newPassword: string;
}): { updatedBranches: string[] } {
  const store = loadStore();
  const cleanUser = normalizeDigits(params.newUsername) || DEFAULT_VAULT_USERNAME;
  const hashedPass = hashPasswordScrypt(params.newPassword);
  const targetIds =
    params.targetScope === 'all' || params.targetScope === 'ALL'
      ? deduplicateSupplyBranches(store.branches).map((b) => b.id)
      : [params.targetScope];
  const nowIso = new Date().toISOString();

  for (const bId of targetIds) {
    const existing = store.system_config.find((c) => c.branchId === bId)?.systemConfig || ({} as SystemConfig);
    const existingMap = { ...(existing.branchVaultCredentials || {}) };
    existingMap[bId] = {
      branchId: bId,
      username: cleanUser,
      password: hashedPass,
      updatedAt: nowIso,
    };
    upsertInStoreInternal(store, 'system_config', bId, {
      branchId: bId,
      systemConfig: {
        ...existing,
        vaultUsername: cleanUser,
        vaultPasscode: hashedPass,
        branchVaultCredentials: existingMap,
      },
    });
  }
  persistStore(store);
  return { updatedBranches: targetIds };
}

export function fallbackUpdateBranchDepartments(
  branchId: string,
  departments: BranchDepartmentConfigItem[],
  actorUsername = 'admin'
): BranchDepartmentConfigItem[] {
  const store = loadStore();
  const effectiveBranchId = branchId || DEFAULT_BRANCH_ID;
  ensureFallbackBranch(store, effectiveBranchId);
  const idx = store.system_config.findIndex((c) => c.branchId === effectiveBranchId);
  const cloned = cloneDefaultBranchDepartmentsStructure(departments);
  if (idx >= 0) {
    store.system_config[idx] = {
      ...store.system_config[idx],
      systemConfig: {
        ...store.system_config[idx].systemConfig,
        branchDepartments: cloned,
      },
      version: Number(store.system_config[idx].version || 1) + 1,
    };
  } else {
    const branchRow = store.branches.find((b) => b.id === effectiveBranchId);
    store.system_config.push({
      branchId: effectiveBranchId,
      systemConfig: {
        governorateTitle: branchRow?.governorateTitle || 'محافظة الغربية',
        directorateTitle: branchRow?.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
        administrationTitle: branchRow?.name || effectiveBranchId,
        englishSubtitle: '',
        logoBase64: '',
        branchDepartments: cloned,
      },
      columnTitles: {},
      activityStatuses: ['يعمل', 'متوقف كلي', 'متوقف جزئي', 'ملغى'],
      version: 1,
    });
  }
  store.audit_logs.unshift({
    id: `aud-depts-${Date.now()}`,
    branchId: effectiveBranchId,
    userEmail: actorUsername,
    username: actorUsername,
    department: 'branches',
    operation: 'UPDATE_BRANCH_DEPARTMENTS',
    recordId: effectiveBranchId,
    result: 'SUCCESS',
    action: 'UPDATE_BRANCH_DEPARTMENTS',
    details: `تحديث هيكل وترتيب وإظهار الأقسام (${cloned.length} قسم) داخل الفرع (${effectiveBranchId})`,
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
  });
  persistStore(store);
  return cloned;
}

export function fallbackResetBranchSection(params: {
  branchId: string;
  sectionKey: ResettableSectionKey;
  villageName?: string;
  actorUsername?: string;
}): { success: boolean; deletedCounts: Record<string, number>; message: string } {
  const store = loadStore();
  const effectiveBranchId = params.branchId || DEFAULT_BRANCH_ID;
  const branchName =
    store.branches.find((b) => b.id === effectiveBranchId)?.name || effectiveBranchId;
  const actor = params.actorUsername || 'admin';
  const deletedCounts: Record<string, number> = { bakeries: 0, debts: 0, alerts: 0 };

  if (params.sectionKey === 'bakeries') {
    const bBefore = store.bakeries.length;
    const dBefore = store.debts.length;
    store.bakeries = store.bakeries.filter((b) => b.branchId !== effectiveBranchId);
    store.debts = store.debts.filter((d) => d.branchId !== effectiveBranchId);
    store.high_debt_alerts = store.high_debt_alerts.filter((a) => a.branchId !== effectiveBranchId);
    deletedCounts.bakeries = Math.max(0, bBefore - store.bakeries.length);
    deletedCounts.debts = Math.max(0, dBefore - store.debts.length);
  } else if (params.sectionKey === 'debts') {
    const dBefore = store.debts.length;
    store.debts = store.debts.filter((d) => d.branchId !== effectiveBranchId);
    store.high_debt_alerts = store.high_debt_alerts.filter((a) => a.branchId !== effectiveBranchId);
    deletedCounts.debts = Math.max(0, dBefore - store.debts.length);
  } else if (
    params.sectionKey === 'commodities' ||
    params.sectionKey === 'internal_trade' ||
    params.sectionKey === 'grain_maintenance' ||
    params.sectionKey === 'hr'
  ) {
    const key = `${effectiveBranchId}::all_modules`;
    const currentPayload =
      store.module_states?.[key]?.payload || createEmptyBranchModulesBundle(effectiveBranchId, branchName, []);
    const wiped = wipeSectionFromModulesBundle(currentPayload, params.sectionKey, actor);
    fallbackUpsertBranchModuleState(effectiveBranchId, wiped, actor, 'all_modules');
    const reloaded = loadStore();
    store.module_states = reloaded.module_states;
  } else if (params.sectionKey === 'village' && params.villageName) {
    const normTarget = params.villageName.trim().toLowerCase();
    const matchingBakeryIds = new Set(
      store.bakeries
        .filter((b) => b.branchId === effectiveBranchId && String(b.village || '').trim().toLowerCase() === normTarget)
        .map((b) => b.id)
    );
    const bBefore = store.bakeries.length;
    const dBefore = store.debts.length;
    store.bakeries = store.bakeries.filter((b) => !matchingBakeryIds.has(b.id));
    store.debts = store.debts.filter(
      (d) =>
        !(
          d.branchId === effectiveBranchId &&
          (String(d.village || '').trim().toLowerCase() === normTarget || matchingBakeryIds.has(d.bakeryId))
        )
    );
    deletedCounts.bakeries = Math.max(0, bBefore - store.bakeries.length);
    deletedCounts.debts = Math.max(0, dBefore - store.debts.length);

    const key = `${effectiveBranchId}::all_modules`;
    const currentPayload =
      store.module_states?.[key]?.payload || createEmptyBranchModulesBundle(effectiveBranchId, branchName, []);
    const wiped = wipeVillageFromModulesBundle(currentPayload, params.villageName, actor);
    fallbackUpsertBranchModuleState(effectiveBranchId, wiped, actor, 'all_modules');
    const reloaded = loadStore();
    store.module_states = reloaded.module_states;
  }

  store.audit_logs.unshift({
    id: `aud-reset-sec-${Date.now()}`,
    branchId: effectiveBranchId,
    userEmail: actor,
    username: actor,
    department: params.sectionKey,
    operation: 'SECTION_FACTORY_RESET',
    recordId: params.villageName || params.sectionKey,
    result: 'SUCCESS',
    action: 'SECTION_FACTORY_RESET',
    details:
      params.sectionKey === 'village'
        ? `تصفير شامل لبيانات قرية (${params.villageName}) داخل (${branchName}) مع الحفاظ التام على الأقسام والقرى الأخرى.`
        : `استعادة ضبط المصنع لبيانات قسم (${params.sectionKey}) داخل (${branchName}) مع الإبقاء التام على كافة الأقسام.`,
    ipAddress: '127.0.0.1',
    createdAt: new Date().toISOString(),
  });
  persistStore(store);
  return {
    success: true,
    deletedCounts,
    message:
      params.sectionKey === 'village'
        ? `تم تصفير كافة البيانات المدخلة داخل قرية "${params.villageName}" بدون مساس بالأقسام أو القرى الأخرى.`
        : `تمت استعادة ضبط المصنع لبيانات القسم داخل "${branchName}" مع الإبقاء التام على كافة الأقسام.`,
  };
}


