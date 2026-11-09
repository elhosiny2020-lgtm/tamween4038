import { AppUser } from './types';

export type UserAction =
  | 'ADD_BAKERY'
  | 'EDIT_BAKERY'
  | 'DELETE_BAKERY'
  | 'ADD_DEBT'
  | 'EDIT_DEBT'
  | 'DELETE_DEBT'
  | 'MANAGE_USERS'
  | 'MANAGE_SYSTEM_CONFIG'
  | 'MANAGE_COLUMN_TITLES'
  | 'MANAGE_VILLAGES'
  | 'MANAGE_ACTIVITIES'
  | 'VIEW_REPORTS'
  | 'VIEW_CHARTS'
  | 'EXPORT_DATA'
  | 'AUDIT_MATH'
  | 'USE_FINES_CALCULATOR';

export function hasPermission(user: AppUser | null | undefined, action: UserAction): boolean {
  if (!user) return false;
  const role = user.role;

  // 1. Admin: Complete 100% full control of the entire system
  if (role === 'admin') return true;

  // 2. Viewer: Pure read-only inspection (No edits, additions, or deletions whatsoever)
  if (role === 'viewer') {
    switch (action) {
      case 'VIEW_REPORTS':
      case 'VIEW_CHARTS':
      case 'EXPORT_DATA':
        return true;
      default:
        // Strictly block all add, edit, delete, and configuration actions
        return false;
    }
  }

  // 3. Financial Auditor
  if (role === 'auditor') {
    switch (action) {
      case 'ADD_DEBT':
      case 'EDIT_DEBT':
      case 'VIEW_REPORTS':
      case 'VIEW_CHARTS':
      case 'EXPORT_DATA':
      case 'AUDIT_MATH':
      case 'USE_FINES_CALCULATOR':
      case 'MANAGE_ACTIVITIES':
        return true;
      default:
        return false;
    }
  }

  // 4. Field Inspector
  if (role === 'inspector') {
    switch (action) {
      case 'ADD_BAKERY':
      case 'EDIT_BAKERY':
      case 'VIEW_REPORTS':
      case 'VIEW_CHARTS':
      case 'EXPORT_DATA':
      case 'USE_FINES_CALCULATOR':
        return true;
      default:
        return false;
    }
  }

  return false;
}

export function getRoleNameArabic(role: 'admin' | 'inspector' | 'auditor' | 'viewer' | string): string {
  if (role === 'admin') return 'مدير نظام (تحكم كامل في المنظومة)';
  if (role === 'viewer') return 'مشاهد / قارئ فقط (عرض وتصفح بدون تعديلات)';
  if (role === 'auditor') return 'مراجع حسابات ومديونيات';
  if (role === 'inspector') return 'مفتش رقابة وتموين';
  return 'مستخدم منظومة';
}
