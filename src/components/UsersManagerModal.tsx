import React, { useState, useEffect, useCallback } from 'react';
import {
  AppUser,
  DEPARTMENT_SCOPES,
  DepartmentPermissionFlags,
  DepartmentPermissionsMap,
  DepartmentScopeId,
  PermissionAction,
  SYSTEM_DEPARTMENT_KEYS,
  SystemDepartmentKey,
  UserRoleType,
} from '../types';
import {
  getRoleNameArabic,
  ALL_PERMISSIONS_LIST,
  getDefaultPermissionsForRole,
  UserAction,
} from '../permissions';
import {
  buildDefaultFlagsForRole,
  createDepartmentPermissionsMatrix,
  EMPTY_DEPARTMENT_FLAGS,
  FULL_DEPARTMENT_FLAGS,
  isSuperAdmin as checkIsSuperAdmin,
  resolveUserDepartmentMatrix,
} from '../utils/departmentRbac';
import { getSecurityShieldHeaders } from '../lib/supabase';
import { sanitizePhoneInput, validateExactPhone } from '../utils/fieldValidation';
import {
  Users,
  UserPlus,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Key,
  Check,
  Eye,
  EyeOff,
  Edit2,
  Save,
  Briefcase,
  Phone,
  Building2,
  CheckSquare,
  Square,
  History,
  RefreshCw,
  Search,
  Lock,
} from 'lucide-react';

interface UsersManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchName?: string;
  users: AppUser[];
  currentUser: AppUser | null;
  onAddUser: (
    user: AppUser
  ) => Promise<{ success?: boolean; queuedOffline?: boolean; error?: string } | void> | void;
  onUpdateUser?: (
    user: AppUser
  ) => Promise<{ success?: boolean; queuedOffline?: boolean; error?: string } | void> | void;
  onDeleteUser: (
    userId: string
  ) => Promise<{ success?: boolean; queuedOffline?: boolean; error?: string } | void> | void;
}

interface AuditLogEntry {
  id: string;
  branchId: string;
  userEmail: string;
  username: string;
  department: string;
  operation: string;
  recordId: string;
  result: string;
  action: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

const ROLE_DEFINITIONS: {
  role: UserRoleType;
  title: string;
  badgeColor: string;
  summary: string;
}[] = [
  {
    role: 'super_admin',
    title: '👑 مدير عام النظام (Super Admin)',
    badgeColor: 'bg-amber-200 text-amber-950 border-amber-500',
    summary: 'صلاحية مطلقة على كافة الأقسام السبعة، إدارة المستخدمين، وسجل المراقبة والأمان.',
  },
  {
    role: 'admin',
    title: '🏛️ مدير إدارة / رئيس قسم',
    badgeColor: 'bg-amber-100 text-amber-950 border-amber-400',
    summary: 'صلاحية إدارية متقدمة حسب مصفوفة الأقسام والعمليات المحددة للحساب.',
  },
  {
    role: 'supervisor',
    title: '🛡️ مشرف عام رقابة ومخابز',
    badgeColor: 'bg-indigo-100 text-indigo-950 border-indigo-400',
    summary: 'إشراف كامل على المخابز والمديونيات والتقارير وفق الأقسام المصرح بها.',
  },
  {
    role: 'auditor',
    title: '💰 مراجع حسابات ومديونيات',
    badgeColor: 'bg-emerald-100 text-emerald-950 border-emerald-400',
    summary: 'إدارة قيود المديونيات والسداد وحاسبة الغرامات وتدقيق المعادلات والطباعة.',
  },
  {
    role: 'inspector',
    title: '🔍 مفتش رقابة وتموين',
    badgeColor: 'bg-purple-100 text-purple-950 border-purple-400',
    summary: 'إضافة وتعديل السجلات وتسجيل المخالفات الميدانية واستخدام حاسبة الغرامات.',
  },
  {
    role: 'data_entry',
    title: '⌨️ مسئول إدخال وتحديث بيانات',
    badgeColor: 'bg-cyan-100 text-cyan-950 border-cyan-400',
    summary: 'إدخال وتحديث السجلات وعرض التقارير دون صلاحية الحذف النهائي.',
  },
  {
    role: 'viewer',
    title: '👁️ مشاهد / قارئ فقط (بدون تعديل)',
    badgeColor: 'bg-blue-100 text-blue-950 border-blue-400',
    summary: 'عرض وتصفح كافة الجداول والرسوم البيانية دون أي تعديل أو حذف.',
  },
];

const DEPARTMENT_LABELS_MAP: Record<SystemDepartmentKey, string> = {
  bakeries: 'إدارة المخابز والحصص',
  debts: 'مديونيات المخابز والغرامات',
  commodities: 'السلع التموينية والتجار',
  internal_trade: 'التجارة الداخلية والرقابة',
  grain_maintenance: 'صيانة الحبوب (الشون والمطاحن)',
  hr: 'شئون العاملين والموارد البشرية',
  reports: 'التقارير المجمعة والإحصاءات',
};

const ACTION_COLUMNS: { key: PermissionAction; label: string }[] = [
  { key: 'view', label: 'مشاهدة' },
  { key: 'insert', label: 'إضافة' },
  { key: 'update', label: 'تعديل' },
  { key: 'delete', label: 'حذف' },
  { key: 'print', label: 'طباعة' },
  { key: 'export', label: 'تصدير' },
];

function buildFullMatrix(): Record<SystemDepartmentKey, DepartmentPermissionFlags> {
  const m = {} as Record<SystemDepartmentKey, DepartmentPermissionFlags>;
  for (const d of SYSTEM_DEPARTMENT_KEYS) {
    m[d] = { ...FULL_DEPARTMENT_FLAGS };
  }
  return m;
}

function buildEmptyMatrix(): Record<SystemDepartmentKey, DepartmentPermissionFlags> {
  const m = {} as Record<SystemDepartmentKey, DepartmentPermissionFlags>;
  for (const d of SYSTEM_DEPARTMENT_KEYS) {
    m[d] = { ...EMPTY_DEPARTMENT_FLAGS };
  }
  return m;
}

function deriveAllowedDepartmentsFromMatrix(
  matrix: DepartmentPermissionsMap,
  isSuper: boolean
): DepartmentScopeId[] {
  if (isSuper) return ['all'];
  return SYSTEM_DEPARTMENT_KEYS.filter((k) => Boolean(matrix[k]?.view));
}

function deriveLegacyPermissionsFromMatrix(
  matrix: DepartmentPermissionsMap,
  isSuper: boolean,
  role: UserRoleType
): string[] {
  if (isSuper) return ALL_PERMISSIONS_LIST.map((p) => p.id);
  const perms = new Set<string>(getDefaultPermissionsForRole(role));
  const anyInsert = SYSTEM_DEPARTMENT_KEYS.some((k) => matrix[k]?.insert);
  const anyUpdate = SYSTEM_DEPARTMENT_KEYS.some((k) => matrix[k]?.update);
  const anyDelete = SYSTEM_DEPARTMENT_KEYS.some((k) => matrix[k]?.delete);
  const anyPrint = SYSTEM_DEPARTMENT_KEYS.some((k) => matrix[k]?.print);
  const anyExport = SYSTEM_DEPARTMENT_KEYS.some((k) => matrix[k]?.export);

  if (!anyInsert) {
    perms.delete('ADD_BAKERY');
    perms.delete('ADD_DEBT');
    perms.delete('MANAGE_VILLAGES');
  }
  if (!anyUpdate) {
    perms.delete('EDIT_BAKERY');
    perms.delete('EDIT_DEBT');
  }
  if (!anyDelete) {
    perms.delete('DELETE_BAKERY');
    perms.delete('DELETE_DEBT');
  }
  if (!anyPrint && !matrix.reports?.view) {
    perms.delete('VIEW_REPORTS');
  }
  if (!anyExport) {
    perms.delete('EXPORT_DATA');
  }
  if (!matrix.debts?.view) {
    perms.delete('ADD_DEBT');
    perms.delete('EDIT_DEBT');
    perms.delete('DELETE_DEBT');
    perms.delete('VIEW_PENALTIES_CALC');
  }
  if (!matrix.bakeries?.view) {
    perms.delete('ADD_BAKERY');
    perms.delete('EDIT_BAKERY');
    perms.delete('DELETE_BAKERY');
  }
  perms.delete('MANAGE_USERS');
  perms.delete('BACKUP_RESTORE');
  perms.delete('SYSTEM_SETTINGS');
  return Array.from(perms);
}

interface DepartmentPermissionsGridProps {
  matrix: Record<SystemDepartmentKey, DepartmentPermissionFlags>;
  isSuper: boolean;
  onChangeSuperAdmin: (next: boolean) => void;
  onChangeMatrix: (next: Record<SystemDepartmentKey, DepartmentPermissionFlags>) => void;
  testIdPrefix: string;
}

const DepartmentPermissionsGrid: React.FC<DepartmentPermissionsGridProps> = ({
  matrix,
  isSuper,
  onChangeSuperAdmin,
  onChangeMatrix,
  testIdPrefix,
}) => {
  const toggleFlag = (dept: SystemDepartmentKey, action: PermissionAction) => {
    if (isSuper) return;
    const prevFlags = matrix[dept] || { ...EMPTY_DEPARTMENT_FLAGS };
    let nextFlags: DepartmentPermissionFlags;
    if (action === 'view') {
      const nextView = !prevFlags.view;
      nextFlags = nextView
        ? { ...prevFlags, view: true }
        : { ...EMPTY_DEPARTMENT_FLAGS };
    } else {
      const nextVal = !prevFlags[action];
      nextFlags = {
        ...prevFlags,
        view: nextVal ? true : prevFlags.view,
        [action]: nextVal,
      };
    }
    onChangeMatrix({ ...matrix, [dept]: nextFlags });
  };

  const setRowAll = (dept: SystemDepartmentKey, enabled: boolean) => {
    if (isSuper) return;
    onChangeMatrix({
      ...matrix,
      [dept]: enabled ? { ...FULL_DEPARTMENT_FLAGS } : { ...EMPTY_DEPARTMENT_FLAGS },
    });
  };

  return (
    <div className="p-3.5 bg-slate-50 border-2 border-teal-300 rounded-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200 pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-700" />
          <span className="text-xs font-black text-slate-900">
            مصفوفة صلاحيات الأقسام السبعة (6 عمليات دقيقة لكل قسم)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 border border-amber-400 text-amber-950 text-[11px] font-black cursor-pointer">
            <input
              type="checkbox"
              checked={isSuper}
              data-testid={`${testIdPrefix}-super-admin-toggle`}
              onChange={(e) => {
                const checked = e.target.checked;
                onChangeSuperAdmin(checked);
                if (checked) {
                  onChangeMatrix(buildFullMatrix());
                }
              }}
            />
            <span>مدير عام النظام (Super Admin - كافة الصلاحيات)</span>
          </label>
          {!isSuper && (
            <>
              <button
                type="button"
                onClick={() => onChangeMatrix(buildFullMatrix())}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black cursor-pointer"
              >
                ✓ تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => onChangeMatrix(buildEmptyMatrix())}
                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black cursor-pointer"
              >
                ✕ إلغاء الكل
              </button>
            </>
          )}
        </div>
      </div>

      {isSuper ? (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-black text-amber-950 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            هذا الحساب مفعّل بصلاحية مدير عام النظام (Super Admin): يمتلك جميع صلاحيات المشاهدة والإضافة والتعديل والحذف والطباعة والتصدير لجميع الأقسام وسجل المراقبة والأمان.
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-black">
                <th className="p-2 border border-slate-700">القسم التمويني</th>
                {ACTION_COLUMNS.map((col) => (
                  <th key={col.key} className="p-2 border border-slate-700 text-center w-16">
                    {col.label}
                  </th>
                ))}
                <th className="p-2 border border-slate-700 text-center w-28">تحديد سريع</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_DEPARTMENT_KEYS.map((dept, idx) => {
                const flags = matrix[dept] || EMPTY_DEPARTMENT_FLAGS;
                return (
                  <tr
                    key={dept}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}
                  >
                    <td className="p-2 border border-slate-200 font-black text-slate-900">
                      {DEPARTMENT_LABELS_MAP[dept]}
                    </td>
                    {ACTION_COLUMNS.map((col) => {
                      const checked = Boolean(flags[col.key]);
                      return (
                        <td key={col.key} className="p-1.5 border border-slate-200 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            data-testid={`${testIdPrefix}-perm-${dept}-${col.key}`}
                            onChange={() => toggleFlag(dept, col.key)}
                            className="w-4 h-4 accent-teal-600 cursor-pointer"
                            aria-label={`${DEPARTMENT_LABELS_MAP[dept]} - ${col.label}`}
                          />
                        </td>
                      );
                    })}
                    <td className="p-1.5 border border-slate-200 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRowAll(dept, true)}
                          className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-black cursor-pointer"
                        >
                          الكل
                        </button>
                        <button
                          type="button"
                          onClick={() => setRowAll(dept, false)}
                          className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-black cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const UsersManagerModal: React.FC<UsersManagerModalProps> = ({
  isOpen,
  onClose,
  branchName,
  users,
  currentUser,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const viewerIsSuperAdmin = checkIsSuperAdmin(currentUser);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');

  // Add New User Form State
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [jobTitle, setJobTitle] = useState('مفتش تموين أول');
  const [department, setDepartment] = useState('قسم الرقابة التموينية والمخابز');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRoleType>('inspector');
  const [newIsSuperAdmin, setNewIsSuperAdmin] = useState<boolean>(false);
  const [newIsActive, setNewIsActive] = useState<boolean>(true);
  const [newNotes, setNewNotes] = useState('');
  const [newDeptMatrix, setNewDeptMatrix] = useState<
    Record<SystemDepartmentKey, DepartmentPermissionFlags>
  >(() =>
    resolveUserDepartmentMatrix({
      id: 'tmp',
      username: 'tmp',
      fullName: 'tmp',
      role: 'inspector',
      allowedDepartments: ['bakeries'],
    })
  );
  const [applyToAllBranches, setApplyToAllBranches] = useState<boolean>(true);
  const [customPermissions, setCustomPermissions] = useState<string[]>(
    getDefaultPermissionsForRole('inspector')
  );
  const [showAddPermissions, setShowAddPermissions] = useState(false);

  // Edit Existing User State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRoleType>('admin');
  const [editIsSuperAdmin, setEditIsSuperAdmin] = useState<boolean>(false);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editNotes, setEditNotes] = useState('');
  const [editDeptMatrix, setEditDeptMatrix] = useState<
    Record<SystemDepartmentKey, DepartmentPermissionFlags>
  >(() => buildEmptyMatrix());
  const [editApplyToAllBranches, setEditApplyToAllBranches] = useState<boolean>(true);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AppUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audit Log State (Read-Only for Super Admin)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditStatusFilter, setAuditStatusFilter] = useState<'all' | 'SUCCESS' | 'DENIED'>('all');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');

  const fetchAuditLogs = useCallback(async () => {
    if (!viewerIsSuperAdmin) return;
    setAuditLoading(true);
    setAuditError('');
    try {
      const params = new URLSearchParams({
        branchId: 'ALL',
        status: auditStatusFilter,
        page: '1',
        pageSize: '100',
      });
      if (auditSearch.trim()) {
        params.set('search', auditSearch.trim());
      }
      const resp = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: getSecurityShieldHeaders(false),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) {
        setAuditError(json?.error || 'تعذر تحميل سجل المراقبة والأمان.');
        return;
      }
      setAuditLogs(Array.isArray(json.rows) ? json.rows : []);
      setAuditTotal(Number(json.total || 0));
    } catch {
      setAuditError('تعذر الاتصال بالخادم لجلب سجل المراقبة.');
    } finally {
      setAuditLoading(false);
    }
  }, [viewerIsSuperAdmin, auditSearch, auditStatusFilter]);

  useEffect(() => {
    if (isOpen && activeTab === 'audit' && viewerIsSuperAdmin) {
      fetchAuditLogs();
    }
  }, [isOpen, activeTab, viewerIsSuperAdmin, fetchAuditLogs]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleRoleChangeForNewUser = (newRole: UserRoleType) => {
    setRole(newRole);
    const nextIsSuper = newRole === 'super_admin';
    setNewIsSuperAdmin(nextIsSuper);
    setCustomPermissions(getDefaultPermissionsForRole(newRole));
    if (nextIsSuper) {
      setNewDeptMatrix(buildFullMatrix());
    } else {
      const selectedDepts = deriveAllowedDepartmentsFromMatrix(newDeptMatrix, false);
      const targetDepts: DepartmentScopeId[] =
        selectedDepts.length > 0 ? selectedDepts : ['bakeries'];
      const rebuilt = createDepartmentPermissionsMatrix(
        targetDepts,
        newRole,
        getDefaultPermissionsForRole(newRole)
      );
      const next = buildEmptyMatrix();
      for (const k of SYSTEM_DEPARTMENT_KEYS) {
        if (rebuilt[k]) next[k] = { ...rebuilt[k]! };
      }
      setNewDeptMatrix(next);
    }
  };

  const toggleNewUserPermission = (permId: UserAction) => {
    setCustomPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const startEditingUser = (u: AppUser) => {
    const resolvedSuper = checkIsSuperAdmin(u);
    setEditingUserId(u.id);
    setEditFullName(u.fullName || '');
    setEditUsername(u.username || '');
    setEditPassword('');
    setShowEditPassword(false);
    setEditJobTitle(u.jobTitle || 'مسئول تمويني');
    setEditDepartment(u.department || 'إدارة تموين مركز المحلة الكبرى');
    setEditPhone(u.phone || '');
    setEditRole(u.role);
    setEditIsSuperAdmin(resolvedSuper);
    setEditIsActive(u.isActive !== false);
    setEditNotes(u.notes || '');
    setEditDeptMatrix(resolveUserDepartmentMatrix(u));
    setEditApplyToAllBranches(u.applyToAllBranches !== false);
    setEditPermissions(
      Array.isArray(u.customPermissions) && u.customPermissions.length > 0
        ? u.customPermissions
        : getDefaultPermissionsForRole(u.role)
    );
    setError('');
  };

  const handleEditRoleChange = (newRole: UserRoleType) => {
    setEditRole(newRole);
    const nextIsSuper = newRole === 'super_admin';
    setEditIsSuperAdmin(nextIsSuper);
    setEditPermissions(getDefaultPermissionsForRole(newRole));
    if (nextIsSuper) {
      setEditDeptMatrix(buildFullMatrix());
    } else {
      const flags = buildDefaultFlagsForRole(newRole, getDefaultPermissionsForRole(newRole));
      const next = { ...editDeptMatrix };
      for (const k of SYSTEM_DEPARTMENT_KEYS) {
        if (next[k]?.view) {
          next[k] = { ...flags };
        }
      }
      setEditDeptMatrix(next);
    }
  };

  const toggleEditPermission = (permId: UserAction) => {
    setEditPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId || !onUpdateUser || isSubmitting) return;

    const cleanFullName = editFullName.trim();
    const cleanUsername = editUsername.trim();

    if (!cleanFullName) {
      setError('يرجى إدخال الاسم بالكامل للمستخدم');
      return;
    }
    if (!cleanUsername) {
      setError('يرجى إدخال اسم المستخدم للدخول');
      return;
    }
    if (
      users.some(
        (u) => u.id !== editingUserId && u.username.toLowerCase() === cleanUsername.toLowerCase()
      )
    ) {
      setError('اسم المستخدم مسجل بالفعل لحساب آخر');
      return;
    }

    const derivedAllowed = deriveAllowedDepartmentsFromMatrix(editDeptMatrix, editIsSuperAdmin);
    if (!editIsSuperAdmin && derivedAllowed.length === 0) {
      setError('يجب منح المستخدم غير المدير صلاحية مشاهدة قسم واحد على الأقل.');
      return;
    }

    if (editPhone.trim()) {
      const phoneCheck = validateExactPhone(editPhone, true);
      if (!phoneCheck.valid) {
        setError(phoneCheck.error || 'رقم التليفون يجب أن يتكون من 11 رقماً بالضبط.');
        return;
      }
    }

    const originalUser = users.find((u) => u.id === editingUserId);
    if (!originalUser) return;

    const cleanNewPass = editPassword.trim();
    const updatedUser: AppUser = {
      ...originalUser,
      fullName: cleanFullName,
      username: cleanUsername,
      role: editIsSuperAdmin ? 'super_admin' : editRole === 'super_admin' ? 'admin' : editRole,
      isSuperAdmin: editIsSuperAdmin,
      isActive: editIsActive,
      notes: editNotes.trim(),
      jobTitle: editJobTitle.trim(),
      department: editDepartment.trim(),
      phone: editPhone.trim() ? sanitizePhoneInput(editPhone) : '',
      allowedDepartments: derivedAllowed,
      departmentPermissions: editIsSuperAdmin ? buildFullMatrix() : editDeptMatrix,
      applyToAllBranches: editApplyToAllBranches,
      customPermissions: editIsSuperAdmin
        ? ALL_PERMISSIONS_LIST.map((p) => p.id)
        : editPermissions.length > 0
        ? editPermissions
        : deriveLegacyPermissionsFromMatrix(editDeptMatrix, false, editRole),
    };

    if (cleanNewPass) {
      updatedUser.password = cleanNewPass;
    } else {
      delete updatedUser.password;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const res = await onUpdateUser(updatedUser);
      if (res && res.success === false && !res.queuedOffline) {
        setError(res.error || 'تعذر حفظ تعديلات المستخدم في قاعدة البيانات.');
        return;
      }
      setEditingUserId(null);
      showToast(`تم حفظ تعديلات بيانات الحساب والاسم بالكامل (${updatedUser.fullName}) والصلاحيات بنجاح!`);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ تعديلات المستخدم.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');

    const cleanUser = username.trim();
    const cleanName = fullName.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanName || !cleanPass) {
      setError('جميع الحقول الأساسية (الاسم بالكامل، اسم المستخدم، كلمة المرور) مطلوبة');
      return;
    }

    if (users.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
      setError('اسم المستخدم مسجل مسبقاً في المنظومة');
      return;
    }

    const derivedAllowed = deriveAllowedDepartmentsFromMatrix(newDeptMatrix, newIsSuperAdmin);
    if (!newIsSuperAdmin && derivedAllowed.length === 0) {
      setError('يجب تحديد قسم واحد على الأقل بصلاحية (مشاهدة) للمستخدم الجديد.');
      return;
    }

    if (phone.trim()) {
      const phoneCheck = validateExactPhone(phone, true);
      if (!phoneCheck.valid) {
        setError(phoneCheck.error || 'رقم التليفون يجب أن يتكون من 11 رقماً بالضبط.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const effectiveRole = newIsSuperAdmin
        ? 'super_admin'
        : role === 'super_admin'
        ? 'admin'
        : role;
      const res = await onAddUser({
        id: `u-${Date.now()}`,
        username: cleanUser,
        fullName: cleanName,
        password: cleanPass,
        role: effectiveRole,
        isSuperAdmin: newIsSuperAdmin,
        isActive: newIsActive,
        notes: newNotes.trim(),
        jobTitle: jobTitle.trim(),
        department: department.trim(),
        phone: phone.trim() ? sanitizePhoneInput(phone) : '',
        allowedDepartments: derivedAllowed,
        departmentPermissions: newIsSuperAdmin ? buildFullMatrix() : newDeptMatrix,
        applyToAllBranches,
        customPermissions: newIsSuperAdmin
          ? ALL_PERMISSIONS_LIST.map((p) => p.id)
          : deriveLegacyPermissionsFromMatrix(newDeptMatrix, false, effectiveRole),
        createdAt: new Date().toISOString().split('T')[0],
      });
      if (res && res.success === false && !res.queuedOffline) {
        setError(res.error || 'تعذر حفظ الحساب الجديد في قاعدة البيانات.');
        return;
      }

      setUsername('');
      setFullName('');
      setPassword('');
      setPhone('');
      setNewNotes('');
      showToast(`تم إنشاء حساب (${cleanName}) وحفظه في قاعدة البيانات بنجاح!`);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء إنشاء الحساب.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600/40 w-full max-w-6xl overflow-hidden flex flex-col max-h-[94vh] cursor-default">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-900 to-slate-900 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-amber-300" />
            <div>
              <h3 className="text-base font-black flex items-center gap-2 flex-wrap">
                <span>ملف حسابات المستخدمين والصلاحيات التفصيلية وسجل المراقبة</span>
                {branchName && (
                  <span className="text-[11px] bg-emerald-400 text-slate-950 font-black px-2.5 py-0.5 rounded-full">
                    خاص بـ: {branchName}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-amber-200 font-bold">
                مصفوفة صلاحيات دقيقة (7 أقسام × 6 عمليات) مع تشفير كلمات المرور وسجل أمان محصّن ضد العبث
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-red-900/60 hover:bg-red-600 text-white cursor-pointer border border-red-500/50 shadow-md"
            title="إغلاق النافذة فوراً"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-2 flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition ${
              activeTab === 'users'
                ? 'bg-slate-900 text-amber-300 shadow'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>المستخدمون ومصفوفة الصلاحيات ({users.length})</span>
          </button>

          {viewerIsSuperAdmin && (
            <button
              type="button"
              data-testid="audit-log-tab-btn"
              onClick={() => setActiveTab('audit')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition ${
                activeTab === 'audit'
                  ? 'bg-rose-950 text-amber-300 shadow border border-rose-700'
                  : 'bg-white text-rose-900 border border-rose-300 hover:bg-rose-50'
              }`}
            >
              <History className="w-4 h-4" />
              <span>سجل المراقبة والأمان (Tamper-Resistant Audit Log)</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-right">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border-2 border-emerald-400 text-emerald-950 rounded-xl text-xs font-black flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMsg('')}
                className="text-emerald-800 hover:text-emerald-950 font-black px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border-2 border-red-300 text-red-800 rounded-xl text-xs font-black flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-red-700 hover:text-red-950 font-black px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeTab === 'audit' && viewerIsSuperAdmin ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-rose-50 border-2 border-rose-300 rounded-2xl flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-rose-950">
                  <Lock className="w-5 h-5 text-rose-700 shrink-0" />
                  <div>
                    <div className="text-xs font-black">
                      سجل المراقبة والأمان المحصّن (للقراءة فقط — غير قابل للتعديل أو الحذف)
                    </div>
                    <div className="text-[11px] font-bold text-rose-800">
                      يوثّق كل محاولات الدخول، الإضافات، التعديلات، الحذف، والوصول غير المصرح به (403)
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-rose-900 text-white text-xs font-black">
                  إجمالي القيود المسجلة: {auditTotal}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="بحث باسم المستخدم، القسم، العملية، أو التفاصيل..."
                    className="w-full pr-9 pl-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                  />
                </div>
                <select
                  value={auditStatusFilter}
                  onChange={(e) =>
                    setAuditStatusFilter(e.target.value as 'all' | 'SUCCESS' | 'DENIED')
                  }
                  className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                >
                  <option value="all">كل النتائج</option>
                  <option value="SUCCESS">عمليات ناجحة (SUCCESS)</option>
                  <option value="DENIED">محاولات مرفوضة (DENIED)</option>
                </select>
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  disabled={auditLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded-xl text-xs font-black cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                  <span>تحديث السجل</span>
                </button>
              </div>

              {auditError && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-black text-red-800">
                  ⚠️ {auditError}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-300 rounded-xl">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-black">
                      <th className="p-2 border border-slate-700 text-center w-10">#</th>
                      <th className="p-2 border border-slate-700">التاريخ والوقت</th>
                      <th className="p-2 border border-slate-700">المستخدم</th>
                      <th className="p-2 border border-slate-700">القسم / الجدول</th>
                      <th className="p-2 border border-slate-700">العملية</th>
                      <th className="p-2 border border-slate-700 text-center">رقم السجل</th>
                      <th className="p-2 border border-slate-700 text-center">النتيجة</th>
                      <th className="p-2 border border-slate-700 text-center">IP</th>
                      <th className="p-2 border border-slate-700">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="p-6 text-center text-slate-500 font-bold bg-white"
                        >
                          {auditLoading
                            ? 'جاري تحميل سجل المراقبة والأمان...'
                            : 'لا توجد قيود مطابقة لمعايير البحث الحالية.'}
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log, i) => {
                        const isDenied =
                          log.result === 'DENIED' ||
                          log.result === 'BLOCKED' ||
                          log.action?.includes('UNAUTHORIZED') ||
                          log.action?.includes('TAMPER');
                        return (
                          <tr
                            key={log.id}
                            className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}
                          >
                            <td className="p-2 border border-slate-200 text-center font-black">
                              {i + 1}
                            </td>
                            <td className="p-2 border border-slate-200 font-mono text-[11px] whitespace-nowrap">
                              {log.createdAt
                                ? new Date(log.createdAt).toLocaleString('ar-EG')
                                : '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-black text-indigo-900">
                              {log.username || log.userEmail || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-bold text-slate-700">
                              {log.department || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-mono text-[11px] font-black text-slate-900">
                              {log.operation || log.action || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 text-center font-mono text-[11px]">
                              {log.recordId || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  isDenied
                                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                }`}
                              >
                                {isDenied ? 'مرفوض (DENIED)' : 'ناجح (SUCCESS)'}
                              </span>
                            </td>
                            <td className="p-2 border border-slate-200 text-center font-mono text-[11px]">
                              {log.ipAddress || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 text-slate-700 max-w-xs">
                              {log.details || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* 1. REGISTERED USERS LIST & FULL INLINE EDITOR */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-600" />
                    <span>
                      حسابات المستخدمين المسجلة ({users.length} حساب) — تعديل الاسم بالكامل، حالة التفعيل، ومصفوفة الأقسام:
                    </span>
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    كلمات المرور مشفّرة بالكامل ولا تُرسل للمتصفح
                  </span>
                </div>

                <div className="space-y-3">
                  {users.map((u) => {
                    const isEditingThis = editingUserId === u.id;
                    const uIsSuper = checkIsSuperAdmin(u);
                    const uMatrix = resolveUserDepartmentMatrix(u);
                    const allowedDeptCount = SYSTEM_DEPARTMENT_KEYS.filter(
                      (k) => uMatrix[k]?.view
                    ).length;

                    return (
                      <div
                        key={u.id}
                        className={`border-2 rounded-2xl transition-all overflow-hidden ${
                          isEditingThis
                            ? 'border-amber-500 bg-amber-50/30 shadow-xl'
                            : uIsSuper
                            ? 'border-amber-300 bg-amber-50/15'
                            : u.isActive === false
                            ? 'border-rose-300 bg-rose-50/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* User Summary Row */}
                        <div className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-xs shrink-0 ${
                                uIsSuper
                                  ? 'bg-amber-500 text-slate-950'
                                  : u.role === 'viewer'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-800 text-amber-300'
                              }`}
                            >
                              {u.fullName.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-slate-900">
                                  الاسم بالكامل: {u.fullName}
                                </span>
                                {currentUser?.id === u.id && (
                                  <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-black">
                                    الحساب النشط حالياً
                                  </span>
                                )}
                                {uIsSuper && (
                                  <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                                    مدير عام (Super Admin)
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                    u.isActive !== false
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : 'bg-rose-100 text-rose-900 border border-rose-300'
                                  }`}
                                >
                                  {u.isActive !== false ? 'حساب نشط' : 'حساب معطّل'}
                                </span>
                                <span className="text-[11px] font-mono font-black text-indigo-900 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
                                  اليوزر: {u.username}
                                </span>
                                <span className="text-[11px] font-mono font-black text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                                  كلمة المرور: •••••••• (مشفر)
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600 font-bold flex-wrap">
                                <span>الدور: {getRoleNameArabic(u.role)}</span>
                                <span>•</span>
                                <span className="text-teal-800 font-black">
                                  الأقسام المتاحة: {uIsSuper ? 'جميع الأقسام (7/7)' : `${allowedDeptCount} من 7 أقسام`}
                                </span>
                                {u.department && (
                                  <>
                                    <span>•</span>
                                    <span>{u.department}</span>
                                  </>
                                )}
                                {u.phone && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono">{u.phone}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                isEditingThis ? setEditingUserId(null) : startEditingUser(u)
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer border transition ${
                                isEditingThis
                                  ? 'bg-slate-800 text-white border-slate-700'
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-xs'
                              }`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>
                                {isEditingThis ? 'إغلاق التعديل' : 'تعديل البيانات والصلاحيات'}
                              </span>
                            </button>

                            {users.length > 1 && u.id !== currentUser?.id && (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteUser(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-white bg-rose-600 hover:bg-rose-700 rounded-xl text-xs font-black cursor-pointer shadow-xs"
                                title="حذف المستخدم"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Active Departments Preview */}
                        {!isEditingThis && (
                          <div className="px-3.5 pb-3 pt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/60">
                            <span className="text-[10px] font-black text-slate-500 ml-1">
                              صلاحيات الأقسام:
                            </span>
                            {uIsSuper ? (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-950">
                                ✓ صلاحية مطلقة على كافة الأقسام السبعة (مشاهدة • إضافة • تعديل • حذف • طباعة • تصدير)
                              </span>
                            ) : (
                              SYSTEM_DEPARTMENT_KEYS.filter((k) => uMatrix[k]?.view).map((k) => {
                                const fl = uMatrix[k];
                                const ops = [
                                  fl.insert ? 'إضافة' : null,
                                  fl.update ? 'تعديل' : null,
                                  fl.delete ? 'حذف' : null,
                                  fl.print ? 'طباعة' : null,
                                  fl.export ? 'تصدير' : null,
                                ]
                                  .filter(Boolean)
                                  .join('، ');
                                return (
                                  <span
                                    key={k}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-teal-300 text-teal-950"
                                  >
                                    ✓ {DEPARTMENT_LABELS_MAP[k]} {ops ? `(${ops})` : '(مشاهدة فقط)'}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        )}

                        {/* Expandable Full User Data & 7×6 Permissions Editor */}
                        {isEditingThis && (
                          <form
                            onSubmit={handleSaveEditedUser}
                            className="p-4 bg-gradient-to-b from-amber-50/80 to-white border-t-2 border-amber-300 space-y-4"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1">
                                  الاسم بالكامل *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={editFullName}
                                  onChange={(e) => setEditFullName(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border-2 border-amber-400 rounded-xl text-xs font-black text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1">
                                  اسم المستخدم (Username) *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={editUsername}
                                  onChange={(e) => setEditUsername(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 font-mono text-left"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1">
                                  كلمة المرور الجديدة (اتركها فارغة للإبقاء على الحالية)
                                </label>
                                <div className="relative">
                                  <input
                                    type={showEditPassword ? 'text' : 'password'}
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="اتركه فارغاً لعدم التغيير"
                                    autoComplete="new-password"
                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 font-mono text-left"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowEditPassword((prev) => !prev)}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer p-0.5"
                                    aria-label="إظهار أو إخفاء كلمة المرور"
                                  >
                                    {showEditPassword ? (
                                      <EyeOff className="w-4 h-4" />
                                    ) : (
                                      <Eye className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1 flex items-center gap-1">
                                  <Briefcase className="w-3 h-3 text-amber-700" />
                                  <span>المسمى الوظيفي</span>
                                </label>
                                <input
                                  type="text"
                                  value={editJobTitle}
                                  onChange={(e) => setEditJobTitle(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1 flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-amber-700" />
                                  <span>القسم / الإدارة الفرعية</span>
                                </label>
                                <input
                                  type="text"
                                  value={editDepartment}
                                  onChange={(e) => setEditDepartment(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                                />
                              </div>

                              <div>
                                <label className="flex items-center justify-between text-[11px] font-black text-slate-800 mb-1">
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-amber-700" />
                                    <span>رقم التليفون (11 رقماً)</span>
                                  </span>
                                  <span className="text-[10px] font-mono tabular-nums text-slate-500">
                                    {editPhone.replace(/\D/g, '').length} / 11
                                  </span>
                                </label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={11}
                                  value={editPhone}
                                  onChange={(e) => setEditPhone(sanitizePhoneInput(e.target.value))}
                                  placeholder="01012345678"
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 font-mono text-left"
                                />
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1">
                                  الدور الوظيفي الأساسي
                                </label>
                                <select
                                  value={editRole}
                                  onChange={(e) => handleEditRoleChange(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                                >
                                  {ROLE_DEFINITIONS.map((r) => (
                                    <option key={r.role} value={r.role}>
                                      {r.title}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1">
                                  حالة الحساب (تفعيل / إيقاف)
                                </label>
                                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editIsActive}
                                    onChange={(e) => setEditIsActive(e.target.checked)}
                                  />
                                  <span
                                    className={editIsActive ? 'text-emerald-800' : 'text-rose-800'}
                                  >
                                    {editIsActive ? 'الحساب نشط ويسمح بالدخول' : 'الحساب موقوف / معطّل'}
                                  </span>
                                </label>
                              </div>

                              <div>
                                <label className="block text-[11px] font-black text-slate-800 mb-1">
                                  ملاحظات إدارية
                                </label>
                                <input
                                  type="text"
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder="ملاحظات اختيارية..."
                                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between px-1">
                              <label className="inline-flex items-center gap-1.5 text-[11px] font-black text-teal-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editApplyToAllBranches}
                                  onChange={(e) => setEditApplyToAllBranches(e.target.checked)}
                                />
                                <span>تطبيق وتعميم هذا المستخدم على جميع الفروع تلقائياً</span>
                              </label>
                            </div>

                            <DepartmentPermissionsGrid
                              matrix={editDeptMatrix}
                              isSuper={editIsSuperAdmin}
                              onChangeSuperAdmin={setEditIsSuperAdmin}
                              onChangeMatrix={setEditDeptMatrix}
                              testIdPrefix="edit-user"
                            />

                            {/* Legacy Granular Flags (optional compatibility view) */}
                            {!editIsSuperAdmin && (
                              <details className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                <summary className="text-xs font-black text-slate-700 cursor-pointer">
                                  خيارات النوافذ الفرعية الإضافية ({editPermissions.length} مفعلة)
                                </summary>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
                                  {ALL_PERMISSIONS_LIST.map((perm) => {
                                    const checked = editPermissions.includes(perm.id);
                                    return (
                                      <label
                                        key={perm.id}
                                        onClick={() => toggleEditPermission(perm.id)}
                                        className={`p-2 rounded-lg border flex items-start gap-2 cursor-pointer select-none ${
                                          checked
                                            ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950'
                                            : 'bg-white border-slate-200 text-slate-500'
                                        }`}
                                      >
                                        {checked ? (
                                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                        ) : (
                                          <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                        )}
                                        <div>
                                          <div className="text-[11px] font-black leading-tight">
                                            {perm.label}
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </details>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                إلغاء التعديل
                              </button>
                              <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                              >
                                <Save className="w-4 h-4" />
                                <span>
                                  {isSubmitting ? 'جاري الحفظ...' : 'حفظ تعديل المستخدم والصلاحيات ✓'}
                                </span>
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. ADD NEW USER FORM */}
              <form
                onSubmit={handleAdd}
                className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-3.5"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-amber-600" />
                    <span>إضافة حساب مستخدم جديد وتحديد مصفوفة صلاحياته</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddPermissions((prev) => !prev)}
                    className="text-xs font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg cursor-pointer"
                  >
                    {showAddPermissions
                      ? 'إخفاء الصلاحيات الإضافية'
                      : `صلاحيات النوافذ الإضافية (${customPermissions.length}) ⚙️`}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      الاسم بالكامل والصفة *
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="new-user-fullname"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="مثال: أ/ محمد أحمد - مفتش تموين"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      اسم المستخدم للدخول (Username) *
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="new-user-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="مثال: inspector2"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 text-left font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      كلمة المرور (Password) *
                    </label>
                    <div className="relative">
                      <Key className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        data-testid="new-user-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 text-left font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer p-0.5"
                        aria-label="إظهار أو إخفاء كلمة المرور"
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      المسمى الوظيفي
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      القسم / المكتب التابع له
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      مستوى الصلاحية الأساسي *
                    </label>
                    <select
                      value={role}
                      onChange={(e) => handleRoleChangeForNewUser(e.target.value as UserRoleType)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900"
                    >
                      {ROLE_DEFINITIONS.map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-[11px] font-black text-slate-700 mb-1">
                      <span>رقم التليفون (11 رقماً)</span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-500">
                        {phone.replace(/\D/g, '').length} / 11
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={11}
                      value={phone}
                      onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                      placeholder="01012345678"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 font-mono text-left"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      حالة التفعيل
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newIsActive}
                        onChange={(e) => setNewIsActive(e.target.checked)}
                      />
                      <span>حساب نشط ومفعل للدخول</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                      ملاحظات
                    </label>
                    <input
                      type="text"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="اختياري..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-black text-teal-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAllBranches}
                      onChange={(e) => setApplyToAllBranches(e.target.checked)}
                    />
                    <span>ربط وتطبيق الصلاحية على جميع الفروع تلقائياً</span>
                  </label>
                </div>

                <DepartmentPermissionsGrid
                  matrix={newDeptMatrix}
                  isSuper={newIsSuperAdmin}
                  onChangeSuperAdmin={setNewIsSuperAdmin}
                  onChangeMatrix={setNewDeptMatrix}
                  testIdPrefix="new-user"
                />

                {showAddPermissions && !newIsSuperAdmin && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-xs font-black text-slate-800">
                      صلاحيات النوافذ الإضافية:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {ALL_PERMISSIONS_LIST.map((perm) => {
                        const checked = customPermissions.includes(perm.id);
                        return (
                          <label
                            key={perm.id}
                            onClick={() => toggleNewUserPermission(perm.id)}
                            className={`p-2 rounded-lg border flex items-start gap-2 cursor-pointer select-none ${
                              checked
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="text-[11px] font-black">{perm.label}</div>
                              <div className="text-[9.5px] opacity-80">{perm.description}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="submit-new-user-btn"
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'جاري الحفظ في قاعدة البيانات...'
                      : 'إنشاء وحفظ الحساب وتفعيل مصفوفة الصلاحيات'}
                  </span>
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-xs font-bold text-slate-600">
            أي تعديل على المستخدم أو مصفوفة الصلاحيات يُسجّل تلقائياً في سجل المراقبة والأمان
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>

      {pendingDeleteUser && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[70] bg-slate-950/70 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>تأكيد حذف حساب المستخدم</span>
            </h4>
            <p className="text-xs font-bold text-slate-600">
              هل أنت متأكد من حذف حساب &quot;{pendingDeleteUser.fullName}&quot; ({pendingDeleteUser.username})؟
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteUser(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  if (isSubmitting || !pendingDeleteUser) return;
                  setIsSubmitting(true);
                  try {
                    const res = await onDeleteUser(pendingDeleteUser.id);
                    if (res && res.success === false && !res.queuedOffline) {
                      setError(res.error || 'تعذر حذف المستخدم من قاعدة البيانات.');
                    }
                    setPendingDeleteUser(null);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black cursor-pointer"
              >
                {isSubmitting ? 'جاري الحذف...' : 'حذف الحساب نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
