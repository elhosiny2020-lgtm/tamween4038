import {
  SYSTEM_DEPARTMENT_KEYS,
  type AppUser,
  type BranchDepartmentConfigItem,
  type DepartmentPermissionFlags,
  type DepartmentPermissionsMap,
  type DepartmentScopeId,
  type PermissionAction,
  type SystemDepartmentKey,
} from '../types.ts';
import {
  buildExtendedFlagsFromRole,
  isDepartmentVisibleInBranchConfig,
  isTabVisibleInBranchConfig,
} from './rbacCatalog.ts';

export const FULL_DEPARTMENT_FLAGS: DepartmentPermissionFlags = {
  view: true,
  enter: true,
  hide: true,
  insert: true,
  update: true,
  delete: true,
  approve: true,
  print: true,
  export: true,
  manageUsers: true,
  assignPermissions: true,
  departmentSettings: true,
};

export const EMPTY_DEPARTMENT_FLAGS: DepartmentPermissionFlags = {
  view: false,
  enter: false,
  hide: false,
  insert: false,
  update: false,
  delete: false,
  approve: false,
  print: false,
  export: false,
  manageUsers: false,
  assignPermissions: false,
  departmentSettings: false,
};

/**
 * تحديد ما إذا كان المستخدم مديراً عاماً للنظام (Super Admin)
 * قاعدة أمنية صارمة: لا يُمنح Super Admin تلقائياً لأي مستخدم جديد بدور admin،
 * وإنما يُمنح صراحةً عبر super_admin أو isSuperAdmin=true بواسطة مدير النظام المخوّل فقط
 * (مع الإبقاء على التوافق الخلفي للحساب الجذري الافتراضي admin).
 */
export function isSuperAdmin(user: AppUser | null | undefined): boolean {
  if (!user || user.isActive === false) return false;
  if (user.isSuperAdmin === true || user.role === 'super_admin') return true;
  const isLegacyRootAdmin =
    user.role === 'admin' &&
    user.isSuperAdmin !== false &&
    String(user.username || '').trim().toLowerCase() === 'admin';
  if (isLegacyRootAdmin) {
    const hasRestrictedScope =
      Array.isArray(user.allowedDepartments) &&
      user.allowedDepartments.length > 0 &&
      !user.allowedDepartments.includes('all');
    const hasCustomDeptMatrix =
      Boolean(user.departmentPermissions) &&
      Object.keys(user.departmentPermissions || {}).length > 0 &&
      SYSTEM_DEPARTMENT_KEYS.some(
        (k) => !(user.departmentPermissions?.[k]?.view && user.departmentPermissions?.[k]?.insert)
      );
    return !hasRestrictedScope && !hasCustomDeptMatrix;
  }
  return false;
}

/**
 * التحقق مما إذا كان المستخدم الحالي مخوّلاً بمنح صلاحية Super Admin لمستخدم آخر
 */
export function canAssignSuperAdmin(actor: AppUser | null | undefined): boolean {
  return isSuperAdmin(actor);
}

/**
 * اشتقاق مصفوفة الصلاحيات الافتراضية لقسم بناءً على الدور الوظيفي (يدعم الأدوار الـ 12 والأدوار السابقة)
 */
export function buildDefaultFlagsForRole(role: string, customPermissions?: string[]): DepartmentPermissionFlags {
  const base = buildExtendedFlagsFromRole(role);
  const hasCustom = Array.isArray(customPermissions) && customPermissions.length > 0;
  if (!hasCustom) return base;
  return {
    ...base,
    print: base.print || customPermissions!.includes('VIEW_REPORTS') || customPermissions!.includes('PRINT_DATA'),
    export: base.export || customPermissions!.includes('EXPORT_DATA'),
    manageUsers: base.manageUsers || customPermissions!.includes('MANAGE_USERS'),
    departmentSettings: base.departmentSettings || customPermissions!.includes('MANAGE_DEPARTMENTS'),
  };
}

/**
 * بناء مصفوفة صلاحيات كاملة لجميع الأقسام لمستخدم جديد أو معدّل
 */
export function createDepartmentPermissionsMatrix(
  selectedDepartments: DepartmentScopeId[],
  role: string,
  customPermissions?: string[]
): DepartmentPermissionsMap {
  const isAll = selectedDepartments.includes('all');
  const flags = buildDefaultFlagsForRole(role, customPermissions);
  const matrix: DepartmentPermissionsMap = {};
  for (const dept of SYSTEM_DEPARTMENT_KEYS) {
    if (isAll || selectedDepartments.includes(dept)) {
      matrix[dept] = { ...flags };
    } else {
      matrix[dept] = { ...EMPTY_DEPARTMENT_FLAGS };
    }
  }
  return matrix;
}

/**
 * استخراج مصفوفة صلاحيات المستخدم الفعلية عبر جميع الأقسام السبعة (Fail-Closed)
 */
export function resolveUserDepartmentMatrix(user: AppUser | null | undefined): Record<SystemDepartmentKey, DepartmentPermissionFlags> {
  const matrix = {} as Record<SystemDepartmentKey, DepartmentPermissionFlags>;
  if (!user || user.isActive === false) {
    for (const dept of SYSTEM_DEPARTMENT_KEYS) {
      matrix[dept] = { ...EMPTY_DEPARTMENT_FLAGS };
    }
    return matrix;
  }

  if (isSuperAdmin(user)) {
    for (const dept of SYSTEM_DEPARTMENT_KEYS) {
      matrix[dept] = { ...FULL_DEPARTMENT_FLAGS };
    }
    return matrix;
  }

  const explicit = user.departmentPermissions;
  if (explicit && typeof explicit === 'object' && Object.keys(explicit).length > 0) {
    for (const dept of SYSTEM_DEPARTMENT_KEYS) {
      const f = explicit[dept];
      matrix[dept] = f
        ? {
            view: Boolean(f.view),
            enter: Boolean(f.view && (f.enter !== undefined ? f.enter : true)),
            hide: Boolean(f.hide),
            insert: Boolean(f.view && f.insert),
            update: Boolean(f.view && f.update),
            delete: Boolean(f.view && f.delete),
            approve: Boolean(f.view && f.approve),
            print: Boolean(f.view && f.print),
            export: Boolean(f.view && f.export),
            manageUsers: Boolean(f.manageUsers),
            assignPermissions: Boolean(f.assignPermissions),
            departmentSettings: Boolean(f.departmentSettings),
          }
        : { ...EMPTY_DEPARTMENT_FLAGS };
    }
    return matrix;
  }

  // Fail-closed: if allowedDepartments is missing/empty for non-Super-Admin, grant NOTHING
  const allowed = Array.isArray(user.allowedDepartments) ? user.allowedDepartments : [];
  if (allowed.length === 0) {
    for (const dept of SYSTEM_DEPARTMENT_KEYS) {
      matrix[dept] = { ...EMPTY_DEPARTMENT_FLAGS };
    }
    return matrix;
  }

  const fallbackFlags = buildDefaultFlagsForRole(user.role, user.customPermissions);
  const hasAll = allowed.includes('all');
  for (const dept of SYSTEM_DEPARTMENT_KEYS) {
    matrix[dept] = hasAll || allowed.includes(dept) ? { ...fallbackFlags } : { ...EMPTY_DEPARTMENT_FLAGS };
  }
  return matrix;
}

/**
 * فحص صلاحية عملية محددة داخل قسم محدد مع مراعاة إظهار/إخفاء القسم على مستوى الفرع
 */
export function hasDepartmentPermission(
  user: AppUser | null | undefined,
  dept: SystemDepartmentKey | DepartmentScopeId,
  action: PermissionAction = 'view',
  branchDepartments?: BranchDepartmentConfigItem[] | null
): boolean {
  if (!user || user.isActive === false) return false;
  if (
    branchDepartments &&
    dept !== 'all' &&
    !isDepartmentVisibleInBranchConfig(branchDepartments, dept)
  ) {
    // القسم المخفي محجوب عن الدخول المباشر والتنفيذ حتى لمدير الفرع (مع بقاء البيانات والصلاحيات محفوظة)
    if (!isSuperAdmin(user)) return false;
  }
  if (isSuperAdmin(user)) return true;
  if (dept === 'all') return false;

  const matrix = resolveUserDepartmentMatrix(user);
  const flags = matrix[dept as SystemDepartmentKey];
  if (!flags) return false;
  if (action === 'view') return Boolean(flags.view);
  if (action === 'enter') return Boolean(flags.view && (flags.enter !== undefined ? flags.enter : true));
  if (action === 'hide' || action === 'manageUsers' || action === 'assignPermissions' || action === 'departmentSettings') {
    return Boolean(flags[action]);
  }
  return Boolean(flags.view && flags[action]);
}

/**
 * تحديد الأقسام المصرح للمستخدم بالوصول إليها (Fail-Closed لغير المدير العام).
 */
export function getUserAllowedDepartments(
  user: AppUser | null | undefined,
  branchDepartments?: BranchDepartmentConfigItem[] | null
): DepartmentScopeId[] {
  if (!user || user.isActive === false) return [];
  if (isSuperAdmin(user)) return ['all'];

  const matrix = resolveUserDepartmentMatrix(user);
  const permitted = SYSTEM_DEPARTMENT_KEYS.filter(
    (k) => matrix[k]?.view && (!branchDepartments || isDepartmentVisibleInBranchConfig(branchDepartments, k))
  );
  return permitted;
}

export function canUserAccessDepartment(
  user: AppUser | null | undefined,
  dept: DepartmentScopeId,
  branchDepartments?: BranchDepartmentConfigItem[] | null
): boolean {
  if (!user || user.isActive === false) return false;
  if (
    branchDepartments &&
    dept !== 'all' &&
    !isDepartmentVisibleInBranchConfig(branchDepartments, dept)
  ) {
    return false;
  }
  if (isSuperAdmin(user)) return true;
  if (dept === 'all') return false;
  return hasDepartmentPermission(user, dept, 'view', branchDepartments);
}

export function canUserPrintDepartment(
  user: AppUser | null | undefined,
  dept: SystemDepartmentKey,
  branchDepartments?: BranchDepartmentConfigItem[] | null
): boolean {
  return hasDepartmentPermission(user, dept, 'print', branchDepartments);
}

export function canUserExportDepartment(
  user: AppUser | null | undefined,
  dept: SystemDepartmentKey,
  branchDepartments?: BranchDepartmentConfigItem[] | null
): boolean {
  return hasDepartmentPermission(user, dept, 'export', branchDepartments);
}

export function isDepartmentRestrictedUser(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  return !isSuperAdmin(user);
}

export function getDepartmentForTab(tabId: string): DepartmentScopeId | 'admin_only' | 'shared' {
  switch (tabId) {
    case 'welcome':
    case 'user-guide':
      return 'shared';
    case 'bakeries':
    case 'dashboard':
    case 'charts':
    case 'executive-analytics':
      return 'bakeries';
    case 'debts':
      return 'debts';
    case 'commodities':
      return 'commodities';
    case 'internal-trade':
      return 'internal_trade';
    case 'grain-maintenance':
      return 'grain_maintenance';
    case 'hr-personnel':
      return 'hr';
    case 'reports':
      return 'reports';
    case 'realtime-diagnostics':
      return 'admin_only';
    default:
      return 'admin_only';
  }
}

export function getDepartmentForSidebarGroup(groupId: string): DepartmentScopeId | 'admin_only' | 'shared' {
  switch (groupId) {
    case 'group-1':
    case 'group-2':
      return 'bakeries';
    case 'group-3':
      return 'debts';
    case 'group-4':
      return 'admin_only';
    case 'group-5':
      return 'reports';
    case 'group-6':
      return 'commodities';
    case 'group-7':
      return 'internal_trade';
    case 'group-8':
      return 'grain_maintenance';
    case 'group-9':
      return 'hr';
    default:
      return 'shared';
  }
}

export function getDefaultTabForUser(
  user: AppUser | null | undefined,
  branchDepartments?: BranchDepartmentConfigItem[] | null
): string {
  if (!user || user.isActive === false) return 'welcome';
  if (isSuperAdmin(user)) return 'welcome';
  const allowed = getUserAllowedDepartments(user, branchDepartments);
  if (allowed.includes('bakeries')) return 'bakeries';
  if (allowed.includes('debts')) return 'debts';
  if (allowed.includes('commodities')) return 'commodities';
  if (allowed.includes('internal_trade')) return 'internal-trade';
  if (allowed.includes('grain_maintenance')) return 'grain-maintenance';
  if (allowed.includes('hr')) return 'hr-personnel';
  if (allowed.includes('reports')) return 'reports';
  return 'welcome';
}

export function canUserAccessTab(
  user: AppUser | null | undefined,
  tabId: string,
  branchDepartments?: BranchDepartmentConfigItem[] | null
): boolean {
  if (!user || user.isActive === false) return false;
  if (branchDepartments && !isTabVisibleInBranchConfig(branchDepartments, tabId)) {
    return false;
  }
  if (isSuperAdmin(user)) return true;

  const dept = getDepartmentForTab(tabId);
  if (dept === 'shared') return true;
  if (dept === 'admin_only') return false;
  return hasDepartmentPermission(user, dept, 'view', branchDepartments);
}
