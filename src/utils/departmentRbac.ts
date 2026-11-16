import type { AppUser, DepartmentScopeId } from '../types';

/**
 * تحديد الأقسام المصرح للمستخدم بالوصول إليها.
 * إذا لم يحدد للمستخدم قائمة أقسام، يحافظ المستخدم القديم/المدير على الوصول الكامل توافقياً.
 */
export function getUserAllowedDepartments(user: AppUser | null | undefined): DepartmentScopeId[] {
  if (!user) return [];
  if (user.role === 'admin') {
    if (!Array.isArray(user.allowedDepartments) || user.allowedDepartments.length === 0) {
      return ['all'];
    }
    return user.allowedDepartments;
  }
  if (!Array.isArray(user.allowedDepartments) || user.allowedDepartments.length === 0) {
    return ['all'];
  }
  return user.allowedDepartments;
}

export function canUserAccessDepartment(
  user: AppUser | null | undefined,
  dept: DepartmentScopeId
): boolean {
  if (!user) return false;
  const allowed = getUserAllowedDepartments(user);
  if (allowed.includes('all')) return true;
  if (dept === 'all') return allowed.includes('all');
  return allowed.includes(dept);
}

export function isDepartmentRestrictedUser(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  const allowed = getUserAllowedDepartments(user);
  return !allowed.includes('all');
}

export function getDepartmentForTab(tabId: string): DepartmentScopeId | 'shared' {
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
    case 'realtime-diagnostics':
      return 'shared';
    default:
      return 'shared';
  }
}

export function getDepartmentForSidebarGroup(groupId: string): DepartmentScopeId | 'shared' {
  switch (groupId) {
    case 'group-1':
    case 'group-2':
      return 'bakeries';
    case 'group-3':
      return 'debts';
    case 'group-4':
    case 'group-5':
      return 'shared';
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

export function getDefaultTabForUser(user: AppUser | null | undefined): string {
  const allowed = getUserAllowedDepartments(user);
  if (allowed.includes('all')) return 'welcome';
  if (allowed.includes('bakeries')) return 'bakeries';
  if (allowed.includes('debts')) return 'debts';
  if (allowed.includes('commodities')) return 'commodities';
  if (allowed.includes('internal_trade')) return 'internal-trade';
  if (allowed.includes('grain_maintenance')) return 'grain-maintenance';
  if (allowed.includes('hr')) return 'hr-personnel';
  return 'welcome';
}

export function canUserAccessTab(user: AppUser | null | undefined, tabId: string): boolean {
  if (!user) return false;
  const allowed = getUserAllowedDepartments(user);
  if (allowed.includes('all')) return true;

  const dept = getDepartmentForTab(tabId);
  if (dept === 'shared') return true;
  if (allowed.includes(dept)) return true;

  // Special case: debts manager needs to view bakeries summary only inside debts, not full bakeries tab
  return false;
}
