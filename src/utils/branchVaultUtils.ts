import type { SupplyBranch, BranchVaultCredential } from '../types.ts';

export const DEFAULT_BRANCH_ID = 'branch-mahalla';
export const SAMANOUD_BRANCH_ID = 'branch-samanoud';
export const DEFAULT_VAULT_USERNAME = 'admin';
export const DEFAULT_VAULT_PASSCODE = '2025';
export const VAULT_PASSCODE_STORAGE_KEY = 'TAMWEEN_MASTER_VAULT_PASSCODE_V1';
export const VAULT_USERNAME_STORAGE_KEY = 'TAMWEEN_MASTER_VAULT_USERNAME_V1';
export const VAULT_CREDENTIALS_MAP_KEY = 'TAMWEEN_BRANCH_VAULT_CREDENTIALS_V2';

export const CANONICAL_DEFAULT_BRANCHES: SupplyBranch[] = [
  {
    id: DEFAULT_BRANCH_ID,
    name: 'إدارة تموين مركز المحلة الكبرى',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز المحلة الكبرى (القاعدة الأساسية)',
    createdAt: '2025-01-01',
    isDefault: true,
  },
  {
    id: 'branch-mahalla-city',
    name: 'إدارة تموين بندر المحلة الكبرى',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لبندر المحلة الكبرى (حي أول وحي ثان)',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-tanta-center',
    name: 'إدارة تموين مركز طنطا',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز طنطا',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-tanta-city',
    name: 'إدارة تموين بندر طنطا',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لبندر طنطا (أول وثان طنطا)',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: SAMANOUD_BRANCH_ID,
    name: 'إدارة تموين سمنود',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة سمنود (قاعدة بيانات مستقلة)',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-zefta',
    name: 'إدارة تموين زفتى',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة زفتى',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-santa',
    name: 'إدارة تموين السنطة',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة السنطة',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-kafr-elzayat',
    name: 'إدارة تموين كفر الزيات',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة كفر الزيات',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-basyoun',
    name: 'إدارة تموين بسيون',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة بسيون',
    createdAt: '2025-01-01',
    isDefault: false,
  },
  {
    id: 'branch-qutour',
    name: 'إدارة تموين قطور',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة قطور',
    createdAt: '2025-01-01',
    isDefault: false,
  },
];

/**
 * Normalizes Arabic branch names so variations in hamza (أ/إ/آ -> ا),
 * ta-marbuta (ة -> ه), alef maqsura (ى -> ي), tatweel, or extra spaces
 * always resolve to the exact same comparison key.
 */
export function normalizeBranchNameKey(rawName: string | undefined | null): string {
  if (!rawName) return '';
  let cleaned = String(rawName)
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove diacritics & tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  // Check if it's a synthetic placeholder like "اداره تموين (branch-samanoud)"
  const placeholderMatch = cleaned.match(/اداره تموين\s*\(\s*([^)]+)\s*\)/i);
  if (placeholderMatch && placeholderMatch[1]) {
    const innerId = placeholderMatch[1].trim().toLowerCase();
    if (innerId === DEFAULT_BRANCH_ID || innerId.includes('mahalla')) {
      return 'اداره تموين مركز المحله الكبري';
    }
    if (innerId === SAMANOUD_BRANCH_ID || innerId.includes('samanoud')) {
      return 'اداره تموين سمنود';
    }
  }

  // Canonicalize common aliases for Mahalla and Samanoud
  if (
    cleaned === 'اداره تموين المحله الكبري' ||
    cleaned === 'اداره تموين مركز المحله الكبري' ||
    cleaned === 'تموين مركز المحله الكبري'
  ) {
    return 'اداره تموين مركز المحله الكبري';
  }

  if (
    cleaned === 'اداره تموين سمنود' ||
    cleaned === 'اداره تموين مركز سمنود' ||
    cleaned === 'اداره تموين مركز ومدينه سمنود' ||
    cleaned === 'تموين سمنود'
  ) {
    return 'اداره تموين سمنود';
  }

  return cleaned;
}

/**
 * Resolves canonical ID and display name for known supply branches
 * so duplicate rows with random IDs are unified.
 */
export function resolveCanonicalBranchIdentity(
  id: string | undefined | null,
  name: string | undefined | null
): { canonicalId: string; canonicalName: string; isCanonicalDefault: boolean } {
  const cleanId = String(id || '').trim();
  const cleanName = String(name || '').trim();
  const normKey = normalizeBranchNameKey(cleanName);

  if (
    cleanId === DEFAULT_BRANCH_ID ||
    normKey === 'اداره تموين مركز المحله الكبري'
  ) {
    return {
      canonicalId: DEFAULT_BRANCH_ID,
      canonicalName: 'إدارة تموين مركز المحلة الكبرى',
      isCanonicalDefault: true,
    };
  }

  if (
    cleanId === SAMANOUD_BRANCH_ID ||
    normKey === 'اداره تموين سمنود'
  ) {
    return {
      canonicalId: SAMANOUD_BRANCH_ID,
      canonicalName: 'إدارة تموين سمنود',
      isCanonicalDefault: false,
    };
  }

  const finalName = cleanName || `إدارة تموين (${cleanId || 'فرع'})`;
  return {
    canonicalId: cleanId || `branch-${normKey.replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')}`,
    canonicalName: finalName,
    isCanonicalDefault: false,
  };
}

/**
 * Deduplicates an array of SupplyBranch records by both canonical ID and
 * normalized Arabic branch name. Ensures canonical branches always come first
 * and never repeat regardless of spelling variations or random IDs.
 */
export function deduplicateSupplyBranches(
  branches: SupplyBranch[] | undefined | null
): SupplyBranch[] {
  const sourceList = Array.isArray(branches) && branches.length > 0
    ? branches
    : CANONICAL_DEFAULT_BRANCHES;

  const result: SupplyBranch[] = [];
  const seenIds = new Set<string>();
  const seenNormNames = new Set<string>();

  for (const canonical of CANONICAL_DEFAULT_BRANCHES) {
    const matching = sourceList.find(
      (b) =>
        b &&
        (b.id === canonical.id ||
          normalizeBranchNameKey(b.name) === normalizeBranchNameKey(canonical.name))
    );
    const merged: SupplyBranch = {
      ...canonical,
      ...(matching || {}),
      id: canonical.id,
      name: canonical.name,
      governorateTitle: matching?.governorateTitle?.trim() || canonical.governorateTitle,
      directorateTitle: matching?.directorateTitle?.trim() || canonical.directorateTitle,
      description:
        matching?.description && !matching.description.includes('branch-')
          ? matching.description.trim()
          : canonical.description,
      isDefault: canonical.id === DEFAULT_BRANCH_ID,
    };
    const nameKey = normalizeBranchNameKey(merged.name);
    seenIds.add(merged.id);
    seenNormNames.add(nameKey);
    result.push(merged);
  }

  for (const item of sourceList) {
    if (!item || (!item.id && !item.name)) continue;

    const rawName = String(item.name || '').trim();
    if (/^إدارة تموين\s*\(branch-/i.test(rawName) || /^ادارة تموين\s*\(branch-/i.test(rawName)) {
      continue;
    }

    const { canonicalId, canonicalName, isCanonicalDefault } = resolveCanonicalBranchIdentity(
      item.id,
      rawName
    );
    const nameKey = normalizeBranchNameKey(canonicalName);
    if (!nameKey || seenIds.has(canonicalId) || seenNormNames.has(nameKey)) {
      continue;
    }

    seenIds.add(canonicalId);
    seenNormNames.add(nameKey);
    result.push({
      ...item,
      id: canonicalId,
      name: canonicalName,
      governorateTitle: item.governorateTitle?.trim() || 'محافظة الغربية',
      directorateTitle: item.directorateTitle?.trim() || 'مديرية التموين والتجارة الداخلية بالغربية',
      description: item.description?.trim() || `قاعدة بيانات مستقلة - ${canonicalName}`,
      createdAt: item.createdAt || '2025-01-01',
      isDefault: isCanonicalDefault,
    });
  }

  return result.length > 0 ? result : CANONICAL_DEFAULT_BRANCHES;
}

/**
 * Vault Username & Passcode Helpers for protecting "قسم الحفظ والنسخ" and "جميع الفروع"
 */
export function normalizePasscodeInput(input: string | undefined | null): string {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function normalizeVaultUsername(input: string | undefined | null): string {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * Strictly masks any username or password so it is never visible to unauthorized viewers
 * ("عدم تباينه لاي حد حفاظا على قاعده البيانات من التلاعب").
 */
export function maskSecretValue(_secret?: string | null): string {
  return '••••••••';
}

export function verifyVaultPasscode(
  enteredPasscode: string,
  configuredPasscode?: string | null
): boolean {
  const cleanEntered = normalizePasscodeInput(enteredPasscode);
  const target = normalizePasscodeInput(configuredPasscode) || DEFAULT_VAULT_PASSCODE;
  if (!cleanEntered) return false;
  return cleanEntered === target;
}

export function validateNewVaultPasscode(
  currentEntered: string,
  newPasscode: string,
  confirmNewPasscode: string,
  configuredPasscode?: string | null
): { valid: boolean; error?: string; normalizedNew?: string } {
  if (!verifyVaultPasscode(currentEntered, configuredPasscode)) {
    return {
      valid: false,
      error: 'الرقم السري الحالي غير صحيح. يرجى إدخال الرقم السري الحالي بشكل سليم.',
    };
  }
  const cleanNew = normalizePasscodeInput(newPasscode);
  const cleanConfirm = normalizePasscodeInput(confirmNewPasscode);

  if (!cleanNew || cleanNew.length < 4) {
    return {
      valid: false,
      error: 'الرقم السري الجديد يجب أن يتكون من 4 أرقام أو حروف على الأقل.',
    };
  }
  if (cleanNew !== cleanConfirm) {
    return {
      valid: false,
      error: 'الرقم السري الجديد وتأكيده غير متطابقين.',
    };
  }
  return {
    valid: true,
    normalizedNew: cleanNew,
  };
}

export function getStoredVaultPasscode(configPasscode?: string | null): string {
  const fromConfig = normalizePasscodeInput(configPasscode);
  if (fromConfig) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(VAULT_PASSCODE_STORAGE_KEY, fromConfig);
      }
    } catch {}
    return fromConfig;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = normalizePasscodeInput(localStorage.getItem(VAULT_PASSCODE_STORAGE_KEY));
      if (saved) return saved;
    }
  } catch {}
  return DEFAULT_VAULT_PASSCODE;
}

export function getStoredVaultUsername(configUsername?: string | null): string {
  const fromConfig = normalizeVaultUsername(configUsername);
  if (fromConfig) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(VAULT_USERNAME_STORAGE_KEY, fromConfig);
      }
    } catch {}
    return fromConfig;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = normalizeVaultUsername(localStorage.getItem(VAULT_USERNAME_STORAGE_KEY));
      if (saved) return saved;
    }
  } catch {}
  return DEFAULT_VAULT_USERNAME;
}

export function setStoredVaultPasscode(newPasscode: string, newUsername?: string): string {
  const normalized = normalizePasscodeInput(newPasscode) || DEFAULT_VAULT_PASSCODE;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VAULT_PASSCODE_STORAGE_KEY, normalized);
      if (newUsername && normalizeVaultUsername(newUsername)) {
        localStorage.setItem(VAULT_USERNAME_STORAGE_KEY, normalizeVaultUsername(newUsername));
      }
    }
  } catch {}
  return normalized;
}

/**
 * Per-Branch & All-Branches Vault Credentials Map Management
 */
export function getBranchVaultCredentialsMap(
  branches?: SupplyBranch[] | null,
  configCredentialsMap?: Record<string, BranchVaultCredential> | null,
  fallbackUsername?: string | null,
  fallbackPasscode?: string | null
): Record<string, BranchVaultCredential> {
  const cleanBranches = deduplicateSupplyBranches(branches);
  const masterUsername = getStoredVaultUsername(fallbackUsername);
  const masterPasscode = getStoredVaultPasscode(fallbackPasscode);

  let localStoredMap: Record<string, BranchVaultCredential> = {};
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(VAULT_CREDENTIALS_MAP_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          localStoredMap = parsed;
        }
      }
    }
  } catch {}

  const mergedMap: Record<string, BranchVaultCredential> = {};

  for (const branch of cleanBranches) {
    const fromConfig = configCredentialsMap?.[branch.id];
    const fromLocal = localStoredMap?.[branch.id];
    const resolvedUsername =
      normalizeVaultUsername(fromConfig?.username) ||
      normalizeVaultUsername(fromLocal?.username) ||
      masterUsername ||
      DEFAULT_VAULT_USERNAME;
    const resolvedPassword =
      normalizePasscodeInput(fromConfig?.password) ||
      normalizePasscodeInput(fromLocal?.password) ||
      masterPasscode ||
      DEFAULT_VAULT_PASSCODE;

    mergedMap[branch.id] = {
      branchId: branch.id,
      branchName: branch.name,
      username: resolvedUsername,
      password: resolvedPassword,
      updatedAt: fromConfig?.updatedAt || fromLocal?.updatedAt || '2025-01-01',
    };
  }

  return mergedMap;
}

export function getBranchVaultCredential(
  branchId: string | undefined | null,
  branches?: SupplyBranch[] | null,
  configCredentialsMap?: Record<string, BranchVaultCredential> | null,
  fallbackUsername?: string | null,
  fallbackPasscode?: string | null
): BranchVaultCredential {
  const targetId = String(branchId || DEFAULT_BRANCH_ID).trim() || DEFAULT_BRANCH_ID;
  const map = getBranchVaultCredentialsMap(
    branches,
    configCredentialsMap,
    fallbackUsername,
    fallbackPasscode
  );
  if (map[targetId]) return map[targetId];
  return (
    map[DEFAULT_BRANCH_ID] || {
      branchId: targetId,
      username: getStoredVaultUsername(fallbackUsername),
      password: getStoredVaultPasscode(fallbackPasscode),
    }
  );
}

export function verifyBranchVaultCredentials(params: {
  branchId?: string | null;
  enteredUsername?: string | null;
  enteredPassword?: string | null;
  branches?: SupplyBranch[] | null;
  credentialsMap?: Record<string, BranchVaultCredential> | null;
  fallbackUsername?: string | null;
  fallbackPasscode?: string | null;
}): boolean {
  const cred = getBranchVaultCredential(
    params.branchId,
    params.branches,
    params.credentialsMap,
    params.fallbackUsername,
    params.fallbackPasscode
  );

  const cleanPass = normalizePasscodeInput(params.enteredPassword);
  const targetPass = normalizePasscodeInput(cred.password) || DEFAULT_VAULT_PASSCODE;
  if (!cleanPass || cleanPass !== targetPass) {
    return false;
  }

  const cleanUser = normalizeVaultUsername(params.enteredUsername).toLowerCase();
  const targetUser = (normalizeVaultUsername(cred.username) || DEFAULT_VAULT_USERNAME).toLowerCase();

  // If the user entered a username, it must match targetUser
  if (cleanUser) {
    return cleanUser === targetUser;
  }

  // If username input was left empty, only allow if targetUser is still the initial default ('admin')
  return targetUser === DEFAULT_VAULT_USERNAME.toLowerCase();
}

export function validateNewBranchVaultCredentials(params: {
  branchId?: string | null;
  currentUsername?: string | null;
  currentPassword?: string | null;
  newUsername?: string | null;
  newPassword?: string | null;
  confirmNewPassword?: string | null;
  branches?: SupplyBranch[] | null;
  credentialsMap?: Record<string, BranchVaultCredential> | null;
  fallbackUsername?: string | null;
  fallbackPasscode?: string | null;
}): {
  valid: boolean;
  error?: string;
  normalizedUsername?: string;
  normalizedPassword?: string;
} {
  const isCurrentValid = verifyBranchVaultCredentials({
    branchId: params.branchId,
    enteredUsername: params.currentUsername,
    enteredPassword: params.currentPassword,
    branches: params.branches,
    credentialsMap: params.credentialsMap,
    fallbackUsername: params.fallbackUsername,
    fallbackPasscode: params.fallbackPasscode,
  });

  if (!isCurrentValid) {
    return {
      valid: false,
      error: 'اسم المستخدم الحالي أو كلمة المرور الحالية غير صحيحة! يرجى التأكد من بيانات الدخول الحالية.',
    };
  }

  const cleanNewUser = normalizeVaultUsername(params.newUsername) || DEFAULT_VAULT_USERNAME;
  const cleanNewPass = normalizePasscodeInput(params.newPassword);
  const cleanConfirmPass = normalizePasscodeInput(params.confirmNewPassword);

  if (!cleanNewUser || cleanNewUser.length < 3) {
    return {
      valid: false,
      error: 'اسم المستخدم (Username) الجديد يجب أن يتكون من 3 حروف أو أرقام على الأقل.',
    };
  }

  if (!cleanNewPass || cleanNewPass.length < 4) {
    return {
      valid: false,
      error: 'كلمة المرور (Password) الجديدة يجب أن تتكون من 4 أرقام أو حروف على الأقل.',
    };
  }

  if (cleanNewPass !== cleanConfirmPass) {
    return {
      valid: false,
      error: 'كلمة المرور الجديدة وتأكيد كلمة المرور غير متطابقين.',
    };
  }

  return {
    valid: true,
    normalizedUsername: cleanNewUser,
    normalizedPassword: cleanNewPass,
  };
}

export function updateBranchVaultCredentialsMap(params: {
  targetBranchId: string | 'ALL';
  newUsername: string;
  newPassword: string;
  branches?: SupplyBranch[] | null;
  existingMap?: Record<string, BranchVaultCredential> | null;
  fallbackUsername?: string | null;
  fallbackPasscode?: string | null;
}): Record<string, BranchVaultCredential> {
  const cleanBranches = deduplicateSupplyBranches(params.branches);
  const currentMap = getBranchVaultCredentialsMap(
    cleanBranches,
    params.existingMap,
    params.fallbackUsername,
    params.fallbackPasscode
  );

  const normalizedUsername = normalizeVaultUsername(params.newUsername) || DEFAULT_VAULT_USERNAME;
  const normalizedPassword = normalizePasscodeInput(params.newPassword) || DEFAULT_VAULT_PASSCODE;
  const nowIso = new Date().toISOString();

  const nextMap: Record<string, BranchVaultCredential> = { ...currentMap };

  if (params.targetBranchId === 'ALL') {
    for (const branch of cleanBranches) {
      nextMap[branch.id] = {
        branchId: branch.id,
        branchName: branch.name,
        username: normalizedUsername,
        password: normalizedPassword,
        updatedAt: nowIso,
      };
    }
    setStoredVaultPasscode(normalizedPassword, normalizedUsername);
  } else {
    const branchObj = cleanBranches.find((b) => b.id === params.targetBranchId);
    nextMap[params.targetBranchId] = {
      branchId: params.targetBranchId,
      branchName: branchObj?.name || nextMap[params.targetBranchId]?.branchName || params.targetBranchId,
      username: normalizedUsername,
      password: normalizedPassword,
      updatedAt: nowIso,
    };
    if (params.targetBranchId === DEFAULT_BRANCH_ID) {
      setStoredVaultPasscode(normalizedPassword, normalizedUsername);
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VAULT_CREDENTIALS_MAP_KEY, JSON.stringify(nextMap));
    }
  } catch {}

  return nextMap;
}

