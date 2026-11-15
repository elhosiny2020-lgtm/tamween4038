import type { SupplyBranch } from '../types';

export const DEFAULT_BRANCH_ID = 'branch-mahalla';
export const SAMANOUD_BRANCH_ID = 'branch-samanoud';
export const DEFAULT_VAULT_PASSCODE = '2025';
export const VAULT_PASSCODE_STORAGE_KEY = 'TAMWEEN_MASTER_VAULT_PASSCODE_V1';

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
    id: SAMANOUD_BRANCH_ID,
    name: 'إدارة تموين سمنود',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    description: 'الإدارة التموينية لمركز ومدينة سمنود (قاعدة بيانات مستقلة)',
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

  // If the name was a synthetic placeholder "إدارة تموين (branch-xyz)", keep a clean label
  const finalName = cleanName || `إدارة تموين (${cleanId || 'فرع'})`;
  return {
    canonicalId: cleanId || `branch-${ normKey.replace(/[^a-z0-9\u0600-\u06ff]+/g, '-') }`,
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

  // 1. Seed canonical default branches first so their IDs and clean titles win
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

  // 2. Add any additional user-created branches if neither ID nor normalized Arabic name was seen
  for (const item of sourceList) {
    if (!item || (!item.id && !item.name)) continue;

    // Ignore synthetic auto-generated placeholder rows like "إدارة تموين (branch-17...)" if they have no real name
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
 * Vault Passcode Helpers for protecting "قسم الحفظ والنسخ" and "جميع الفروع"
 */
export function normalizePasscodeInput(input: string | undefined | null): string {
  if (!input) return '';
  // Also convert Arabic-Indic digits (٠-٩) to standard digits (0-9) so users typing in Arabic keyboard layout succeed seamlessly
  return String(input)
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
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

export function setStoredVaultPasscode(newPasscode: string): string {
  const normalized = normalizePasscodeInput(newPasscode) || DEFAULT_VAULT_PASSCODE;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VAULT_PASSCODE_STORAGE_KEY, normalized);
    }
  } catch {}
  return normalized;
}
