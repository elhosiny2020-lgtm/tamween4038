import {
  SYSTEM_DEPARTMENT_KEYS,
  type AppUser,
  type DepartmentPermissionFlags,
  type DepartmentPermissionsMap,
  type DepartmentScopeId,
  type PermissionAction,
  type SystemDepartmentKey,
} from '../types';

export const FULL_DEPARTMENT_FLAGS: DepartmentPermissionFlags = {
  view: true,
  insert: true,
  update: true,
  delete: true,
  print: true,
  export: true,
};

export const EMPTY_DEPARTMENT_FLAGS: DepartmentPermissionFlags = {
  view: false,
  insert: false,
  update: false,
  delete: false,
  print: false,
  export: false,
};

/**
 * تحديد ما إذا كان المستخدم مديراً عاماً للنظام (Super Admin)
 */
export function isSuperAdmin(user: AppUser | null | undefined): boolean {
  if (!user || user.isActive === false) return false;
  if (user.isSuperAdmin === true || user.role === 'super_admin') return true;
  if (user.role === 'admin' && user.isSuperAdmin !== false) {
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
 * اشتقاق مصفوفة الصلاحيات الافتراضية لقسم بناءً على الدور الوظيفي (للتوافق مع الحسابات السابقة)
 */
export function buildDefaultFlagsForRole(role: string, customPermissions?: string[]): DepartmentPermissionFlags {
  if (role === 'super_admin' || role === 'admin') {
    return { ...FULL_DEPARTMENT_FLAGS };
  }
  const hasCustom = Array.isArray(customPermissions) && customPermissions.length > 0;
  if (role === 'viewer') {
    return {
      view: true,
      insert: false,
      update: false,
      delete: false,
      print: hasCustom ? customPermissions!.includes('VIEW_REPORTS') : true,
      export: hasCustom ? customPermissions!.includes('EXPORT_DATA') : true,
    };
  }
  if (role === 'supervisor') {
    return {
      view: true,
      insert: true,
      update: true,
      delete: true,
      print: true,
      export: true,
    };
  }
  if (role === 'auditor') {
    return {
      view: true,
      insert: true,
      update: true,
      delete: false,
      print: true,
      export: true,
    };
  }
  if (role === 'inspector' || role === 'data_entry') {
    return {
      view: true,
      insert: true,
      update: true,
      delete: false,
      print: hasCustom ? customPermissions!.includes('VIEW_REPORTS') : true,
      export: hasCustom ? customPermissions!.includes('EXPORT_DATA') : role === 'inspector',
    };
  }
  return {
    view: true,
    insert: false,
    update: false,
    delete: false,
    print: false,
    export: false,
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
            insert: Boolean(f.view && f.insert),
            update: Boolean(f.view && f.update),
            delete: Boolean(f.view && f.delete),
            print: Boolean(f.view && f.print),
            export: Boolean(f.view && f.export),
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
 * فحص صلاحية عملية محددة داخل قسم محدد (view | insert | update | delete | print | export)
 */
export function hasDepartmentPermission(
  user: AppUser | null | undefined,
  dept: SystemDepartmentKey | DepartmentScopeId,
  action: PermissionAction = 'view'
): boolean {
  if (!user || user.isActive === false) return false;
  if (isSuperAdmin(user)) return true;
  if (dept === 'all') return false;

  const matrix = resolveUserDepartmentMatrix(user);
  const flags = matrix[dept as SystemDepartmentKey];
  if (!flags) return false;
  if (action === 'view') return Boolean(flags.view);
  return Boolean(flags.view && flags[action]);
}

/**
 * تحديد الأقسام المصرح للمستخدم بالوصول إليها (Fail-Closed لغير المدير العام).
 */
export function getUserAllowedDepartments(user: AppUser | null | undefined): DepartmentScopeId[] {
  if (!user || user.isActive === false) return [];
  if (isSuperAdmin(user)) return ['all'];

  const matrix = resolveUserDepartmentMatrix(user);
  const permitted = SYSTEM_DEPARTMENT_KEYS.filter((k) => matrix[k]?.view);
  return permitted;
}

export function canUserAccessDepartment(
  user: AppUser | null | undefined,
  dept: DepartmentScopeId
): boolean {
  if (!user || user.isActive === false) return false;
  if (isSuperAdmin(user)) return true;
  if (dept === 'all') return false;
  return hasDepartmentPermission(user, dept, 'view');
}

export function canUserPrintDepartment(
  user: AppUser | null | undefined,
  dept: SystemDepartmentKey
): boolean {
  return hasDepartmentPermission(user, dept, 'print');
}

export function canUserExportDepartment(
  user: AppUser | null | undefined,
  dept: SystemDepartmentKey
): boolean {
  return hasDepartmentPermission(user, dept, 'export');
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
      return 'admin_only';
    case 'group-6':
      return 'commodities';
    case 'group-7':
      return 'internal_trade';
    case 'group-8':
      return 'grain_maintenance';
    case 'group-9':
      return 'hr';
    default:
      return 'admin_only';
  }
}

export function getDefaultTabForUser(user: AppUser | null | undefined): string {
  if (!user || user.isActive === false) return 'welcome';
  if (isSuperAdmin(user)) return 'welcome';
  const allowed = getUserAllowedDepartments(user);
  if (allowed.includes('bakeries')) return 'bakeries';
  if (allowed.includes('debts')) return 'debts';
  if (allowed.includes('commodities')) return 'commodities';
  if (allowed.includes('internal_trade')) return 'internal-trade';
  if (allowed.includes('grain_maintenance')) return 'grain-maintenance';
  if (allowed.includes('hr')) return 'hr-personnel';
  if (allowed.includes('reports')) return 'reports';
  return 'welcome';
}

export function canUserAccessTab(user: AppUser | null | undefined, tabId: string): boolean {
  if (!user || user.isActive === false) return false;
  if (isSuperAdmin(user)) return true;

  const dept = getDepartmentForTab(tabId);
  if (dept === 'shared') return true;
  if (dept === 'admin_only') return false;
  return hasDepartmentPermission(user, dept, 'view');
}
