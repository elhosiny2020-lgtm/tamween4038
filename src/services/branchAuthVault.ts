import { AppUser, CustomJobRole, SupplyBranch, SystemConfig } from '../types';
import { INITIAL_USERS, DEFAULT_SYSTEM_CONFIG } from '../defaultData';
import { getDefaultRolePermissionsMap } from '../permissions';

export const DEFAULT_BRANCH_ID = 'branch-mahalla';
const VAULT_PREFIX = 'TAMWEEN_BRANCH_AUTH_VAULT_V1__';
const VAULT_EXPLICIT_SAVE_PREFIX = 'TAMWEEN_BRANCH_AUTH_EXPLICIT_SAVE__';

export interface BranchAuthVaultRecord {
  branchId: string;
  branchName?: string;
  users: AppUser[];
  rolePermissions: Record<string, string[]>;
  roleLabels?: Record<string, string>;
  customRoles?: CustomJobRole[];
  updatedAt: string;
}

function getScopedUsersKey(branchId: string): string {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  return cleanId === DEFAULT_BRANCH_ID ? 'TAMWEEN_USERS_V3' : `TAMWEEN_USERS_V3__${cleanId}`;
}

function getScopedConfigKey(branchId: string): string {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  return cleanId === DEFAULT_BRANCH_ID ? 'TAMWEEN_CONFIG_V3' : `TAMWEEN_CONFIG_V3__${cleanId}`;
}

export function getBranchAuthVaultKey(branchId: string): string {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  return `${VAULT_PREFIX}${cleanId}`;
}

export function getBranchAuthExplicitSaveKey(branchId: string): string {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  return `${VAULT_EXPLICIT_SAVE_PREFIX}${cleanId}`;
}

/**
 * Ensures every user in a branch vault is strictly tagged with that branchId
 * and filters out any user record that belongs to a different branchId.
 */
export function sanitizeBranchUsers(
  users: AppUser[] | undefined | null,
  branchId: string,
  branchName?: string
): AppUser[] {
  const cleanBranchId = (branchId || DEFAULT_BRANCH_ID).trim();
  if (!Array.isArray(users) || users.length === 0) {
    return INITIAL_USERS.map((u) => ({
      ...u,
      branchId: cleanBranchId,
      department: branchName || u.department,
    }));
  }

  // Strictly reject any user that explicitly belongs to another branch
  const isolated = users.filter(
    (u) => u && u.username && (!u.branchId || u.branchId === cleanBranchId)
  );

  if (isolated.length === 0) {
    return INITIAL_USERS.map((u) => ({
      ...u,
      branchId: cleanBranchId,
      department: branchName || u.department,
    }));
  }

  const seenUsernames = new Set<string>();
  const result: AppUser[] = [];

  for (const u of isolated) {
    const normUsername = u.username.trim().toLowerCase();
    if (!normUsername || seenUsernames.has(normUsername)) continue;
    seenUsernames.add(normUsername);
    result.push({
      ...u,
      username: u.username.trim(),
      password: (u.password || '').trim(),
      branchId: cleanBranchId,
    });
  }

  return result;
}

/**
 * Loads the isolated authentication & permissions vault for a specific Supply Administration / Branch.
 * Each branch has its own completely separate usernames, passwords, and role permissions.
 */
export function loadBranchAuthVault(
  branchId: string,
  branchName?: string
): BranchAuthVaultRecord {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  const defaultPerms = getDefaultRolePermissionsMap();

  if (typeof localStorage === 'undefined') {
    return {
      branchId: cleanId,
      branchName,
      users: sanitizeBranchUsers(INITIAL_USERS, cleanId, branchName),
      rolePermissions: defaultPerms,
      roleLabels: {},
      customRoles: [],
      updatedAt: '',
    };
  }

  // 1. Try reading dedicated branch auth vault first
  try {
    const rawVault = localStorage.getItem(getBranchAuthVaultKey(cleanId));
    if (rawVault) {
      const parsed = JSON.parse(rawVault) as Partial<BranchAuthVaultRecord>;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        const sanitizedUsers = sanitizeBranchUsers(parsed.users, cleanId, branchName || parsed.branchName);
        const mergedRolePerms: Record<string, string[]> = {
          ...defaultPerms,
          ...(parsed.rolePermissions || {}),
        };
        return {
          branchId: cleanId,
          branchName: branchName || parsed.branchName,
          users: sanitizedUsers,
          rolePermissions: mergedRolePerms,
          roleLabels: parsed.roleLabels || {},
          customRoles: Array.isArray(parsed.customRoles) ? parsed.customRoles : [],
          updatedAt: parsed.updatedAt || '',
        };
      }
    }
  } catch (err) {
    console.warn(`Failed to parse branch auth vault for ${cleanId}:`, err);
  }

  // 2. Fallback to branch-scoped USERS and CONFIG keys
  let fallbackUsers: AppUser[] = INITIAL_USERS;
  let fallbackConfig: Partial<SystemConfig> = {};
  try {
    const rawUsers = localStorage.getItem(getScopedUsersKey(cleanId));
    if (rawUsers) {
      const parsedU = JSON.parse(rawUsers);
      if (Array.isArray(parsedU) && parsedU.length > 0) {
        fallbackUsers = parsedU;
      }
    }
    const rawConfig = localStorage.getItem(getScopedConfigKey(cleanId));
    if (rawConfig) {
      fallbackConfig = JSON.parse(rawConfig) || {};
    }
  } catch {}

  const sanitizedFallbackUsers = sanitizeBranchUsers(fallbackUsers, cleanId, branchName);
  const record: BranchAuthVaultRecord = {
    branchId: cleanId,
    branchName: branchName || fallbackConfig.administrationTitle,
    users: sanitizedFallbackUsers,
    rolePermissions: {
      ...defaultPerms,
      ...(fallbackConfig.rolePermissions || {}),
    },
    roleLabels: fallbackConfig.roleLabels || {},
    customRoles: Array.isArray(fallbackConfig.customRoles) ? fallbackConfig.customRoles : [],
    updatedAt: '',
  };

  try {
    localStorage.setItem(getBranchAuthVaultKey(cleanId), JSON.stringify(record));
  } catch {}

  return record;
}

/**
 * Saves the isolated authentication & permissions vault for a specific branch
 * to its dedicated local vault key AND its scoped branch keys.
 */
export function saveBranchAuthVault(
  branchId: string,
  payload: {
    branchName?: string;
    users?: AppUser[];
    rolePermissions?: Record<string, string[]>;
    roleLabels?: Record<string, string>;
    customRoles?: CustomJobRole[];
    updatedAt?: string;
    markExplicitSave?: boolean;
  }
): BranchAuthVaultRecord {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  const current = loadBranchAuthVault(cleanId, payload.branchName);
  const timestamp = payload.updatedAt || new Date().toISOString();

  const nextUsers = payload.users
    ? sanitizeBranchUsers(payload.users, cleanId, payload.branchName || current.branchName)
    : current.users;

  const nextRolePermissions = payload.rolePermissions
    ? { ...getDefaultRolePermissionsMap(), ...payload.rolePermissions }
    : current.rolePermissions;

  const nextRoleLabels = payload.roleLabels ?? current.roleLabels ?? {};
  const nextCustomRoles = payload.customRoles ?? current.customRoles ?? [];

  const updatedVault: BranchAuthVaultRecord = {
    branchId: cleanId,
    branchName: payload.branchName || current.branchName,
    users: nextUsers,
    rolePermissions: nextRolePermissions,
    roleLabels: nextRoleLabels,
    customRoles: nextCustomRoles,
    updatedAt: timestamp,
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(getBranchAuthVaultKey(cleanId), JSON.stringify(updatedVault));
      localStorage.setItem(getScopedUsersKey(cleanId), JSON.stringify(nextUsers));

      const rawCfg = localStorage.getItem(getScopedConfigKey(cleanId));
      const existingCfg: SystemConfig = rawCfg
        ? { ...DEFAULT_SYSTEM_CONFIG, ...JSON.parse(rawCfg) }
        : { ...DEFAULT_SYSTEM_CONFIG };
      const updatedCfg: SystemConfig = {
        ...existingCfg,
        administrationTitle:
          payload.branchName || existingCfg.administrationTitle || DEFAULT_SYSTEM_CONFIG.administrationTitle,
        rolePermissions: nextRolePermissions,
        roleLabels: nextRoleLabels,
        customRoles: nextCustomRoles,
      };
      localStorage.setItem(getScopedConfigKey(cleanId), JSON.stringify(updatedCfg));

      if (payload.markExplicitSave !== false) {
        localStorage.setItem(getBranchAuthExplicitSaveKey(cleanId), 'true');
        localStorage.setItem(
          cleanId === DEFAULT_BRANCH_ID
            ? 'TAMWEEN_EXPLICIT_USER_SAVE'
            : `TAMWEEN_EXPLICIT_USER_SAVE__${cleanId}`,
          'true'
        );
      }
    } catch (err) {
      console.warn(`Error saving branch auth vault for ${cleanId}:`, err);
    }
  }

  return updatedVault;
}

/**
 * Merges two isolated user lists for the same branch so newly registered accounts or
 * updated passwords/permissions from the newer timestamp win while preserving custom branch users.
 */
export function mergeIsolatedBranchUsers(
  olderUsers: AppUser[],
  newerUsers: AppUser[],
  branchId: string,
  branchName?: string
): AppUser[] {
  const cleanId = (branchId || DEFAULT_BRANCH_ID).trim();
  const validNewer = sanitizeBranchUsers(newerUsers, cleanId, branchName);
  const validOlder = sanitizeBranchUsers(olderUsers, cleanId, branchName);

  // If newerUsers was explicitly saved, use validNewer as the authoritative list
  // and also include any custom user from validOlder that wasn't in INITIAL_USERS if timestamps were close
  const byUsername = new Map<string, AppUser>();
  validNewer.forEach((u) => {
    byUsername.set(u.username.trim().toLowerCase(), { ...u, branchId: cleanId });
  });

  // Ensure any custom user created on another device (non-default id) is also preserved unless explicitly replaced
  validOlder.forEach((u) => {
    const key = u.username.trim().toLowerCase();
    const isSeedAccount = u.id === 'u-1' || u.id === 'u-2' || u.id === 'u-3';
    if (!byUsername.has(key) && !isSeedAccount) {
      byUsername.set(key, { ...u, branchId: cleanId });
    }
  });

  return Array.from(byUsername.values());
}

/**
 * Collects the isolated authentication and permissions vaults for all branches
 * so every cloud sync payload carries each branch's independent credentials and permissions.
 */
export function collectAllBranchAuthVaults(
  branches: SupplyBranch[],
  activeBranchId?: string,
  activeUsers?: AppUser[],
  activeSystemConfig?: SystemConfig,
  snapshotTimestamp?: string
): Record<string, BranchAuthVaultRecord> {
  const vaults: Record<string, BranchAuthVaultRecord> = {};
  const ts = snapshotTimestamp || new Date().toISOString();

  branches.forEach((branch) => {
    if (!branch || !branch.id) return;
    if (activeBranchId && branch.id === activeBranchId && activeUsers) {
      vaults[branch.id] = saveBranchAuthVault(branch.id, {
        branchName: branch.name,
        users: activeUsers,
        rolePermissions: activeSystemConfig?.rolePermissions,
        roleLabels: activeSystemConfig?.roleLabels,
        customRoles: activeSystemConfig?.customRoles,
        updatedAt: ts,
        markExplicitSave: false,
      });
    } else {
      vaults[branch.id] = loadBranchAuthVault(branch.id, branch.name);
    }
  });

  return vaults;
}

/**
 * Synchronizes all branch auth vaults from an incoming cloud payload (Supabase / Firestore / Server)
 * into local storage so any username, password, or permission updated on any device works everywhere immediately.
 */
export function syncAllBranchAuthVaultsFromCloud(
  remoteVaults?: Record<string, BranchAuthVaultRecord>,
  remotePartitions?: Record<string, { users?: AppUser[]; systemConfig?: SystemConfig; updatedAt?: string }>,
  fallbackTimestamp?: string
): void {
  if (typeof localStorage === 'undefined') return;

  const branchIds = new Set<string>();
  if (remoteVaults && typeof remoteVaults === 'object') {
    Object.keys(remoteVaults).forEach((id) => branchIds.add(id));
  }
  if (remotePartitions && typeof remotePartitions === 'object') {
    Object.keys(remotePartitions).forEach((id) => branchIds.add(id));
  }

  branchIds.forEach((branchId) => {
    if (!branchId) return;
    const rVault = remoteVaults?.[branchId];
    const rPart = remotePartitions?.[branchId];

    const incomingUsers = rVault?.users || rPart?.users;
    const incomingRolePerms = rVault?.rolePermissions || rPart?.systemConfig?.rolePermissions;
    const incomingRoleLabels = rVault?.roleLabels || rPart?.systemConfig?.roleLabels;
    const incomingCustomRoles = rVault?.customRoles || rPart?.systemConfig?.customRoles;
    const incomingUpdatedAt = rVault?.updatedAt || rPart?.updatedAt || fallbackTimestamp || '';

    if (!incomingUsers && !incomingRolePerms) return;

    const localVault = loadBranchAuthVault(branchId, rVault?.branchName);
    const hasExplicitLocal =
      localStorage.getItem(getBranchAuthExplicitSaveKey(branchId)) === 'true';

    const localTimeMs = hasExplicitLocal && localVault.updatedAt ? Date.parse(localVault.updatedAt) || 0 : 0;
    const remoteTimeMs = incomingUpdatedAt ? Date.parse(incomingUpdatedAt) || Date.now() : Date.now();

    if (!hasExplicitLocal || remoteTimeMs > localTimeMs) {
      const syncedUsers = incomingUsers
        ? sanitizeBranchUsers(incomingUsers, branchId, rVault?.branchName || localVault.branchName)
        : localVault.users;

      saveBranchAuthVault(branchId, {
        branchName: rVault?.branchName || localVault.branchName,
        users: syncedUsers,
        rolePermissions: incomingRolePerms || localVault.rolePermissions,
        roleLabels: incomingRoleLabels || localVault.roleLabels,
        customRoles: incomingCustomRoles || localVault.customRoles,
        updatedAt: incomingUpdatedAt || localVault.updatedAt || new Date().toISOString(),
        markExplicitSave: true,
      });
    } else if (remoteTimeMs === localTimeMs && incomingUsers) {
      const syncedUsers = mergeIsolatedBranchUsers(
        localVault.users,
        incomingUsers,
        branchId,
        rVault?.branchName || localVault.branchName
      );
      saveBranchAuthVault(branchId, {
        branchName: rVault?.branchName || localVault.branchName,
        users: syncedUsers,
        rolePermissions: incomingRolePerms || localVault.rolePermissions,
        roleLabels: incomingRoleLabels || localVault.roleLabels,
        customRoles: incomingCustomRoles || localVault.customRoles,
        updatedAt: incomingUpdatedAt || localVault.updatedAt,
        markExplicitSave: true,
      });
    }
  });
}
