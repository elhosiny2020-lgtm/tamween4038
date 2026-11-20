import type {
  AppUser,
  BranchDepartmentConfigItem,
  DepartmentPermissionFlags,
  SystemDepartmentKey,
} from '../types.ts';

export interface SystemRoleSeed {
  id: string;
  code: string;
  nameAr: string;
  hierarchyLevel: number;
  isCentral: boolean;
  isSystem: boolean;
  isActive: boolean;
  badgeColor: string;
  description: string;
  defaultPermissions: string[];
}

export interface GranularPermissionItem {
  code: string;
  nameAr: string;
  category: string;
  description: string;
}

export interface AdministrationSeed {
  id: string;
  name: string;
  governorateTitle: string;
  directorateTitle: string;
  isActive: boolean;
}

export const GRANULAR_PERMISSIONS_CATALOG: GranularPermissionItem[] = [
  { code: 'view', nameAr: 'عرض', category: 'الأقسام', description: 'عرض البيانات والشاشات المصرح بها داخل القسم' },
  { code: 'hide', nameAr: 'إخفاء', category: 'الأقسام', description: 'إخفاء وإظهار الأقسام في قائمة الفرع' },
  { code: 'enter', nameAr: 'دخول', category: 'الأقسام', description: 'الدخول المباشر إلى شاشات ونماذج القسم' },
  { code: 'insert', nameAr: 'إضافة', category: 'العمليات', description: 'إضافة سجلات وبيانات جديدة داخل القسم' },
  { code: 'update', nameAr: 'تعديل', category: 'العمليات', description: 'تعديل وتحديث السجلات القائمة' },
  { code: 'delete', nameAr: 'حذف', category: 'العمليات', description: 'حذف السجلات داخل القسم المصرح به' },
  { code: 'approve', nameAr: 'اعتماد', category: 'الرقابة', description: 'اعتماد القرارات والمحاضر والتقارير الرسمية' },
  { code: 'print', nameAr: 'طباعة', category: 'التقارير', description: 'طباعة الكشوف والتقارير الرسمية A4' },
  { code: 'export', nameAr: 'تصدير', category: 'التقارير', description: 'تصدير الجداول والتقارير إلى Excel / CSV / PDF' },
  { code: 'manage_users', nameAr: 'إدارة مستخدمين', category: 'الإدارة', description: 'إضافة وتعديل وتعطيل حسابات المستخدمين في النطاق المصرح به' },
  { code: 'assign_permissions', nameAr: 'توزيع صلاحيات', category: 'الإدارة', description: 'توزيع وتخصيص صلاحيات المستخدمين على الأقسام' },
  { code: 'department_settings', nameAr: 'إعدادات القسم', category: 'الإدارة', description: 'التحكم في ظهور وتفعيل وإعدادات الأقسام' },
];

/**
 * الأدوار الوظيفية الاثنا عشر الأساسية المحفوظة ديناميكياً في قاعدة البيانات
 * مرتبة تنازلياً حسب مستوى الصلاحية لمنع تصعيد الصلاحيات (Privilege Escalation).
 */
export const CANONICAL_12_ROLES: SystemRoleSeed[] = [
  {
    id: 'role-super-admin',
    code: 'super_admin',
    nameAr: 'مدير النظام الرئيسي',
    hierarchyLevel: 100,
    isCentral: true,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-amber-200 text-amber-950 border-amber-500',
    description: 'صلاحية مركزية كاملة على جميع الإدارات والفروع والأقسام والأدوار وسجل التدقيق.',
    defaultPermissions: GRANULAR_PERMISSIONS_CATALOG.map((p) => p.code),
  },
  {
    id: 'role-main-admin-manager',
    code: 'main_admin_manager',
    nameAr: 'مدير الإدارة الرئيسية',
    hierarchyLevel: 90,
    isCentral: true,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-amber-100 text-amber-950 border-amber-400',
    description: 'إدارة ومتابعة الإدارات الفرعية والفروع والأقسام واعتماد التقارير وإدارة المستخدمين.',
    defaultPermissions: [
      'view', 'hide', 'enter', 'insert', 'update', 'delete', 'approve', 'print', 'export',
      'manage_users', 'assign_permissions', 'department_settings',
    ],
  },
  {
    id: 'role-supply-admin-manager',
    code: 'supply_admin_manager',
    nameAr: 'مدير إدارة التموين',
    hierarchyLevel: 85,
    isCentral: true,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-teal-100 text-teal-950 border-teal-400',
    description: 'إدارة وتشغيل إدارة التموين والفروع التابعة لها واعتماد السجلات والتحكم بالأقسام.',
    defaultPermissions: [
      'view', 'hide', 'enter', 'insert', 'update', 'approve', 'print', 'export',
      'manage_users', 'assign_permissions', 'department_settings',
    ],
  },
  {
    id: 'role-branch-manager',
    code: 'branch_manager',
    nameAr: 'مدير الفرع',
    hierarchyLevel: 75,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-emerald-100 text-emerald-950 border-emerald-400',
    description: 'إدارة كاملة داخل الفرع المخصص فقط، إظهار وإخفاء الأقسام، وإدارة مستخدمي الفرع وصلاحياتهم.',
    defaultPermissions: [
      'view', 'hide', 'enter', 'insert', 'update', 'delete', 'approve', 'print', 'export',
      'manage_users', 'assign_permissions', 'department_settings',
    ],
  },
  {
    id: 'role-deputy-branch-manager',
    code: 'deputy_branch_manager',
    nameAr: 'نائب مدير الفرع',
    hierarchyLevel: 70,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-sky-100 text-sky-950 border-sky-400',
    description: 'معاونة مدير الفرع في المتابعة والاعتماد وإدارة الأقسام والمستخدمين ضمن صلاحيات الفرع.',
    defaultPermissions: [
      'view', 'hide', 'enter', 'insert', 'update', 'approve', 'print', 'export',
      'manage_users', 'assign_permissions', 'department_settings',
    ],
  },
  {
    id: 'role-system-officer',
    code: 'system_officer',
    nameAr: 'مسؤول النظام',
    hierarchyLevel: 65,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-indigo-100 text-indigo-950 border-indigo-400',
    description: 'إدارة إعدادات التشغيل والمستخدمين وتوزيع الصلاحيات وإعدادات الأقسام داخل الفرع.',
    defaultPermissions: [
      'view', 'hide', 'enter', 'insert', 'update', 'print', 'export',
      'manage_users', 'assign_permissions', 'department_settings',
    ],
  },
  {
    id: 'role-department-manager',
    code: 'department_manager',
    nameAr: 'مدير القسم',
    hierarchyLevel: 55,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-purple-100 text-purple-950 border-purple-400',
    description: 'إدارة كاملة للقسم المخصص له مع صلاحيات الإضافة والتعديل والاعتماد والطباعة والتصدير.',
    defaultPermissions: ['view', 'enter', 'insert', 'update', 'approve', 'print', 'export', 'department_settings'],
  },
  {
    id: 'role-department-head',
    code: 'department_head',
    nameAr: 'رئيس قسم',
    hierarchyLevel: 50,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-violet-100 text-violet-950 border-violet-400',
    description: 'إشراف تشغيلي ومراجعة واعتماد العمليات داخل القسم المخصص له.',
    defaultPermissions: ['view', 'enter', 'insert', 'update', 'approve', 'print', 'export'],
  },
  {
    id: 'role-department-officer',
    code: 'department_officer',
    nameAr: 'مسؤول القسم',
    hierarchyLevel: 45,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-cyan-100 text-cyan-950 border-cyan-400',
    description: 'تشغيل القسم المخصص وإدخال وتعديل البيانات وطباعة وتصدير التقارير.',
    defaultPermissions: ['view', 'enter', 'insert', 'update', 'print', 'export'],
  },
  {
    id: 'role-employee',
    code: 'employee',
    nameAr: 'موظف',
    hierarchyLevel: 30,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-blue-100 text-blue-950 border-blue-400',
    description: 'إدخال وتحديث البيانات اليومية وعرض وطباعة السجلات ضمن القسم المخصص فقط.',
    defaultPermissions: ['view', 'enter', 'insert', 'update', 'print'],
  },
  {
    id: 'role-auditor',
    code: 'auditor',
    nameAr: 'مراقب',
    hierarchyLevel: 25,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-slate-100 text-slate-900 border-slate-400',
    description: 'مراقبة ومراجعة السجلات والتقارير والطباعة والتصدير دون صلاحية حذف أو تعديل الإعدادات.',
    defaultPermissions: ['view', 'enter', 'print', 'export'],
  },
  {
    id: 'role-custom-user',
    code: 'custom_user',
    nameAr: 'مستخدم بصلاحيات مخصصة',
    hierarchyLevel: 20,
    isCentral: false,
    isSystem: true,
    isActive: true,
    badgeColor: 'bg-fuchsia-100 text-fuchsia-950 border-fuchsia-400',
    description: 'مستخدم تُحدد صلاحياته وأقسامه يدوياً بدقة لكل قسم ولكل عملية.',
    defaultPermissions: ['view', 'enter'],
  },
];

export const DEFAULT_ADMINISTRATIONS: AdministrationSeed[] = [
  {
    id: 'admin-gharbia-directorate',
    name: 'مديرية التموين والتجارة الداخلية بالغربية',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    isActive: true,
  },
  {
    id: 'admin-mahalla-sector',
    name: 'قطاع إدارات تموين المحلة الكبرى',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    isActive: true,
  },
  {
    id: 'admin-tanta-sector',
    name: 'قطاع إدارات تموين طنطا والمراكز',
    governorateTitle: 'محافظة الغربية',
    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
    isActive: true,
  },
];

export function resolveDefaultAdministrationIdForBranch(branchId: string): string {
  const id = String(branchId || '').toLowerCase();
  if (id.includes('mahalla') || id.includes('samanoud')) {
    return 'admin-mahalla-sector';
  }
  if (id.includes('directorate') || id.includes('hq')) {
    return 'admin-gharbia-directorate';
  }
  return 'admin-tanta-sector';
}

const LEGACY_ROLE_LEVELS: Record<string, number> = {
  admin: 80,
  supervisor: 55,
  inspector: 35,
  data_entry: 30,
  viewer: 20,
  reader: 15,
  custom_role: 20,
};

const LEGACY_ROLE_NAMES_AR: Record<string, string> = {
  admin: 'مدير نظام',
  supervisor: 'مشرف عام',
  inspector: 'مفتش رقابة وتموين',
  data_entry: 'مسئول إدخال بيانات',
  viewer: 'مشاهد',
  reader: 'قارئ فقط',
  custom_role: 'مستخدم بصلاحيات مخصصة',
};

export function getRoleHierarchyLevel(
  roleCode: string | null | undefined,
  dynamicRoles?: Array<{ code: string; hierarchyLevel?: number }>
): number {
  const clean = String(roleCode || '').trim().toLowerCase();
  if (!clean) return 0;
  if (Array.isArray(dynamicRoles)) {
    const found = dynamicRoles.find((r) => String(r.code || '').toLowerCase() === clean);
    if (found && Number.isFinite(Number(found.hierarchyLevel))) {
      return Number(found.hierarchyLevel);
    }
  }
  const canonical = CANONICAL_12_ROLES.find((r) => r.code === clean);
  if (canonical) return canonical.hierarchyLevel;
  if (clean in LEGACY_ROLE_LEVELS) return LEGACY_ROLE_LEVELS[clean];
  return 20;
}

export function getEffectiveUserHierarchyLevel(
  user: AppUser | null | undefined,
  dynamicRoles?: Array<{ code: string; hierarchyLevel?: number }>
): number {
  if (!user || user.isActive === false) return 0;
  if (user.isSuperAdmin === true || user.role === 'super_admin') return 100;
  if (
    user.role === 'admin' &&
    user.isSuperAdmin !== false &&
    String(user.username || '').trim().toLowerCase() === 'admin'
  ) {
    return 100;
  }
  return getRoleHierarchyLevel(user.role, dynamicRoles);
}

export function isCentralRoleCode(
  roleCode: string | null | undefined,
  dynamicRoles?: Array<{ code: string; isCentral?: boolean }>
): boolean {
  const clean = String(roleCode || '').trim().toLowerCase();
  if (Array.isArray(dynamicRoles)) {
    const found = dynamicRoles.find((r) => String(r.code || '').toLowerCase() === clean);
    if (found) return Boolean(found.isCentral);
  }
  const canonical = CANONICAL_12_ROLES.find((r) => r.code === clean);
  return Boolean(canonical?.isCentral);
}

export function isCentralUser(user: AppUser | null | undefined): boolean {
  if (!user || user.isActive === false) return false;
  if (user.isSuperAdmin === true || user.role === 'super_admin') return true;
  if (user.isCentral === true || user.applyToAllBranches === true) return true;
  if (
    user.role === 'admin' &&
    user.isSuperAdmin !== false &&
    String(user.username || '').trim().toLowerCase() === 'admin'
  ) {
    return true;
  }
  return isCentralRoleCode(user.role);
}

/**
 * منع تصعيد الصلاحيات: لا يمكن للمستخدم منح دور أعلى من مستواه الوظيفي أو مساوٍ لـ super_admin إلا إذا كان super_admin
 */
export function canActorAssignRole(
  actor: AppUser | null | undefined,
  targetRoleCode: string,
  dynamicRoles?: Array<{ code: string; hierarchyLevel?: number }>
): boolean {
  if (!actor || actor.isActive === false) return false;
  const actorLevel = getEffectiveUserHierarchyLevel(actor, dynamicRoles);
  const targetLevel = getRoleHierarchyLevel(targetRoleCode, dynamicRoles);
  if (actorLevel >= 100) return true;
  if (targetRoleCode === 'super_admin' || targetLevel >= 100) return false;
  return actorLevel >= targetLevel && actorLevel >= 65;
}

export function canActorManageTargetUser(
  actor: AppUser | null | undefined,
  targetUser: AppUser | null | undefined,
  dynamicRoles?: Array<{ code: string; hierarchyLevel?: number }>
): boolean {
  if (!actor || actor.isActive === false || !targetUser) return false;
  const actorLevel = getEffectiveUserHierarchyLevel(actor, dynamicRoles);
  if (actorLevel >= 100) return true;
  const targetLevel = getEffectiveUserHierarchyLevel(targetUser, dynamicRoles);
  if (targetLevel >= 100) return false;
  // Cannot manage someone with strictly higher hierarchy
  if (targetLevel > actorLevel) return false;
  // Non-central managers can only manage users within their own branch
  if (!isCentralUser(actor)) {
    if (!actor.branchId || !targetUser.branchId || actor.branchId !== targetUser.branchId) {
      return false;
    }
  }
  return true;
}

export function getCanonicalRoleLabelAr(
  roleCode: string | null | undefined,
  dynamicRoles?: Array<{ code: string; nameAr: string }>
): string {
  const clean = String(roleCode || '').trim().toLowerCase();
  if (!clean) return 'غير محدد';
  if (Array.isArray(dynamicRoles)) {
    const found = dynamicRoles.find((r) => String(r.code || '').toLowerCase() === clean);
    if (found?.nameAr) return found.nameAr;
  }
  const canonical = CANONICAL_12_ROLES.find((r) => r.code === clean);
  if (canonical) return canonical.nameAr;
  if (clean in LEGACY_ROLE_NAMES_AR) return LEGACY_ROLE_NAMES_AR[clean];
  return String(roleCode);
}

/**
 * خريطة ربط مفاتيح الأقسام البرمجية بمعرفات مجموعات القائمة الجانبية الحقيقية للمحلة
 */
export function mapDeptKeyToGroupIds(deptKey: string): string[] {
  switch (deptKey) {
    case 'bakeries':
      return ['group-1'];
    case 'debts':
      return ['group-3'];
    case 'internal_trade':
      return ['group-7'];
    case 'commodities':
      return ['group-6'];
    case 'grain_maintenance':
      return ['group-8'];
    case 'hr':
      return ['group-9'];
    case 'reports':
      return ['group-5'];
    default:
      return [deptKey];
  }
}

export function mapTabIdToDepartmentGroupAndKey(tabId: string): {
  groupId: string | null;
  deptKey: SystemDepartmentKey | 'shared' | 'admin_only';
} {
  switch (tabId) {
    case 'welcome':
    case 'user-guide':
      return { groupId: null, deptKey: 'shared' };
    case 'bakeries':
    case 'dashboard':
    case 'charts':
    case 'executive-analytics':
      return { groupId: 'group-1', deptKey: 'bakeries' };
    case 'debts':
      return { groupId: 'group-3', deptKey: 'debts' };
    case 'internal-trade':
      return { groupId: 'group-7', deptKey: 'internal_trade' };
    case 'commodities':
      return { groupId: 'group-6', deptKey: 'commodities' };
    case 'grain-maintenance':
      return { groupId: 'group-8', deptKey: 'grain_maintenance' };
    case 'hr-personnel':
      return { groupId: 'group-9', deptKey: 'hr' };
    case 'reports':
      return { groupId: 'group-5', deptKey: 'reports' };
    default:
      return { groupId: null, deptKey: 'admin_only' };
  }
}

/**
 * يتحقق مما إذا كان القسم ظاهراً ومفعلاً ومُتاحاً في إعدادات الفرع الحالية.
 * إذا كان مخفياً أو معطلاً أو موقوفاً من مدير النظام -> يُمنع الدخول المباشر إليه دون حذف بياناته.
 */
export function isDepartmentVisibleInBranchConfig(
  branchDepartments: BranchDepartmentConfigItem[] | null | undefined,
  deptKeyOrGroupId: string
): boolean {
  if (!Array.isArray(branchDepartments) || branchDepartments.length === 0) {
    return true;
  }
  const clean = String(deptKeyOrGroupId || '').trim();
  if (!clean || clean === 'shared' || clean === 'all') return true;

  // Match by exact group id first (e.g. group-1, group-3, group-7...)
  const exactById = branchDepartments.find((d) => d.id === clean);
  if (exactById) {
    return (
      exactById.visible !== false &&
      exactById.enabled !== false &&
      exactById.allowedBySuperAdmin !== false
    );
  }

  // Otherwise match primary operational group for the SystemDepartmentKey
  const primaryGroupIds = mapDeptKeyToGroupIds(clean);
  const matched = branchDepartments.find(
    (d) => primaryGroupIds.includes(d.id) || d.key === clean
  );
  if (!matched) {
    return true;
  }
  return (
    matched.visible !== false &&
    matched.enabled !== false &&
    matched.allowedBySuperAdmin !== false
  );
}

export function isTabVisibleInBranchConfig(
  branchDepartments: BranchDepartmentConfigItem[] | null | undefined,
  tabId: string
): boolean {
  const mapped = mapTabIdToDepartmentGroupAndKey(tabId);
  if (mapped.deptKey === 'shared') return true;
  if (mapped.groupId) {
    return isDepartmentVisibleInBranchConfig(branchDepartments, mapped.groupId);
  }
  return true;
}

export function canUserManageBranchDepartments(user: AppUser | null | undefined): boolean {
  if (!user || user.isActive === false) return false;
  const level = getEffectiveUserHierarchyLevel(user);
  if (level >= 65) return true;
  if (Array.isArray(user.customPermissions) && user.customPermissions.includes('MANAGE_DEPARTMENTS')) {
    return true;
  }
  if (user.departmentPermissions) {
    return Object.values(user.departmentPermissions).some((f) => Boolean(f?.departmentSettings || f?.hide));
  }
  return false;
}

export function canUserManageBranchUsers(user: AppUser | null | undefined): boolean {
  if (!user || user.isActive === false) return false;
  const level = getEffectiveUserHierarchyLevel(user);
  if (level >= 65) return true;
  if (Array.isArray(user.customPermissions) && user.customPermissions.includes('MANAGE_USERS')) {
    return true;
  }
  if (user.departmentPermissions) {
    return Object.values(user.departmentPermissions).some((f) => Boolean(f?.manageUsers || f?.assignPermissions));
  }
  return false;
}

export function buildExtendedFlagsFromRole(roleCode: string): DepartmentPermissionFlags {
  const clean = String(roleCode || '').trim().toLowerCase();
  const level = getRoleHierarchyLevel(clean);
  if (level >= 90) {
    return {
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
  }
  if (level >= 75) {
    return {
      view: true,
      enter: true,
      hide: true,
      insert: true,
      update: true,
      delete: clean === 'branch_manager' || clean === 'admin',
      approve: true,
      print: true,
      export: true,
      manageUsers: true,
      assignPermissions: true,
      departmentSettings: true,
    };
  }
  if (level >= 65) {
    return {
      view: true,
      enter: true,
      hide: true,
      insert: true,
      update: true,
      delete: false,
      approve: clean === 'deputy_branch_manager',
      print: true,
      export: true,
      manageUsers: true,
      assignPermissions: true,
      departmentSettings: true,
    };
  }
  if (level >= 50) {
    return {
      view: true,
      enter: true,
      hide: false,
      insert: true,
      update: true,
      delete: clean === 'supervisor',
      approve: true,
      print: true,
      export: true,
      manageUsers: false,
      assignPermissions: false,
      departmentSettings: clean === 'department_manager',
    };
  }
  if (level >= 30) {
    return {
      view: true,
      enter: true,
      hide: false,
      insert: true,
      update: true,
      delete: false,
      approve: false,
      print: true,
      export: clean === 'department_officer' || clean === 'inspector',
      manageUsers: false,
      assignPermissions: false,
      departmentSettings: false,
    };
  }
  if (clean === 'auditor' || clean === 'viewer') {
    return {
      view: true,
      enter: true,
      hide: false,
      insert: false,
      update: false,
      delete: false,
      approve: false,
      print: true,
      export: true,
      manageUsers: false,
      assignPermissions: false,
      departmentSettings: false,
    };
  }
  return {
    view: true,
    enter: true,
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
}
