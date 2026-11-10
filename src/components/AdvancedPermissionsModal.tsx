import React, { useState } from 'react';
import { X, ShieldCheck, Lock, CheckCircle2, RotateCcw, Save, Layers, Database, UserCheck } from 'lucide-react';
import { SystemConfig, UserRoleType } from '../types';
import {
  ALL_PERMISSIONS_LIST,
  getDefaultPermissionsForRole,
  getDefaultRolePermissionsMap,
  UserAction,
} from '../permissions';

interface AdvancedPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemConfig: SystemConfig;
  onSaveSystemConfig: (newConfig: SystemConfig) => void;
}

interface RoleTabItem {
  role: UserRoleType;
  shortTitle: string;
  fullTitle: string;
  badgeColor: string;
}

const ROLE_TABS: RoleTabItem[] = [
  {
    role: 'inspector',
    shortTitle: 'مفتش (Inspector)',
    fullTitle: 'مفتش رقابة وتموين ميداني',
    badgeColor: 'from-amber-600 to-orange-600',
  },
  {
    role: 'auditor',
    shortTitle: 'مراجع (Auditor)',
    fullTitle: 'مراجع حسابات ومديونيات وتحصيل',
    badgeColor: 'from-indigo-600 to-purple-600',
  },
  {
    role: 'admin',
    shortTitle: 'مدير (Admin)',
    fullTitle: 'مدير النظام (صلاحيات الإدارة العليا)',
    badgeColor: 'from-emerald-600 to-teal-700',
  },
  {
    role: 'supervisor',
    shortTitle: 'مشرف عام',
    fullTitle: 'مشرف عام رقابة ومخابز',
    badgeColor: 'from-blue-600 to-cyan-700',
  },
  {
    role: 'data_entry',
    shortTitle: 'مدخل بيانات',
    fullTitle: 'مسئول إدخال وتحديث بيانات',
    badgeColor: 'from-cyan-600 to-sky-700',
  },
  {
    role: 'viewer',
    shortTitle: 'مشاهد فقط',
    fullTitle: 'مشاهد / قارئ فقط بدون تعديل',
    badgeColor: 'from-slate-600 to-slate-700',
  },
];

export const AdvancedPermissionsModal: React.FC<AdvancedPermissionsModalProps> = ({
  isOpen,
  onClose,
  systemConfig,
  onSaveSystemConfig,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRoleType>('inspector');
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() => {
    const defaults = getDefaultRolePermissionsMap();
    const existing = systemConfig.rolePermissions || {};
    return {
      admin: existing.admin ? [...existing.admin] : [...defaults.admin],
      supervisor: existing.supervisor ? [...existing.supervisor] : [...defaults.supervisor],
      auditor: existing.auditor ? [...existing.auditor] : [...defaults.auditor],
      inspector: existing.inspector ? [...existing.inspector] : [...defaults.inspector],
      data_entry: existing.data_entry ? [...existing.data_entry] : [...defaults.data_entry],
      viewer: existing.viewer ? [...existing.viewer] : [...defaults.viewer],
    };
  });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentRolePerms = rolePermissions[selectedRole] || [];
  const modalPermissions = ALL_PERMISSIONS_LIST.filter((p) => p.level === 'modal');
  const dataPermissions = ALL_PERMISSIONS_LIST.filter((p) => p.level === 'data');

  const togglePermission = (permId: UserAction) => {
    setRolePermissions((prev) => {
      const current = prev[selectedRole] || [];
      const updated = current.includes(permId)
        ? current.filter((id) => id !== permId)
        : [...current, permId];
      return {
        ...prev,
        [selectedRole]: updated,
      };
    });
    setSavedNotice(null);
  };

  const selectAllForRole = () => {
    setRolePermissions((prev) => ({
      ...prev,
      [selectedRole]: ALL_PERMISSIONS_LIST.map((p) => p.id),
    }));
    setSavedNotice(null);
  };

  const clearAllForRole = () => {
    setRolePermissions((prev) => ({
      ...prev,
      [selectedRole]: [],
    }));
    setSavedNotice(null);
  };

  const resetRoleToDefault = () => {
    setRolePermissions((prev) => ({
      ...prev,
      [selectedRole]: getDefaultPermissionsForRole(selectedRole),
    }));
    setSavedNotice('تمت استعادة الصلاحيات الافتراضية لهذا الدور (اضغط حفظ لتأكيد الاعتماد)');
  };

  const handleSave = () => {
    const updatedConfig: SystemConfig = {
      ...systemConfig,
      rolePermissions,
    };
    onSaveSystemConfig(updatedConfig);
    setSavedNotice('تم حفظ إعدادات الصلاحيات المتقدمة لجميع الأدوار في SystemConfig بنجاح!');
    setTimeout(() => {
      setSavedNotice(null);
    }, 3500);
  };

  const activeTabInfo = ROLE_TABS.find((r) => r.role === selectedRole) || ROLE_TABS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-3 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-indigo-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-l from-indigo-950 via-purple-900 to-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-indigo-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wide flex items-center gap-2">
                إعدادات الصلاحيات المتقدمة (حسب الأدوار الوظيفية)
                <span className="text-[11px] bg-amber-500 text-slate-950 font-black px-2.5 py-0.5 rounded-full">
                  SystemConfig
                </span>
              </h2>
              <p className="text-xs text-indigo-200 font-semibold mt-0.5">
                تحديد قائمة العمليات المسموح بها لكل دور (مفتش، مراجع، مدير، مشرف، مشاهد) على مستوى المودالات والبيانات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="text-xs font-black text-slate-600 mb-2 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-indigo-600" />
            اختر الدور الوظيفي لتخصيص صلاحياته على مستوى المودالات والبيانات:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {ROLE_TABS.map((tab) => {
              const isSelected = selectedRole === tab.role;
              const count = (rolePermissions[tab.role] || []).length;
              return (
                <button
                  key={tab.role}
                  type="button"
                  onClick={() => {
                    setSelectedRole(tab.role);
                    setSavedNotice(null);
                  }}
                  className={`px-3 py-2.5 rounded-xl font-black text-xs transition-all flex flex-col items-center justify-center gap-1 border cursor-pointer ${
                    isSelected
                      ? `bg-gradient-to-l ${tab.badgeColor} text-white border-transparent shadow-md scale-[1.02]`
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300'
                  }`}
                >
                  <span>{tab.shortTitle}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-black/25 text-amber-200' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count} / {ALL_PERMISSIONS_LIST.length} عملية
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Role Toolbar */}
        <div className="bg-indigo-50/70 px-5 py-2.5 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-700" />
            <span className="text-xs font-black text-slate-800">
              الدور المحدد حالياً:{' '}
              <span className="text-indigo-700 underline">{activeTabInfo.fullTitle}</span>
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg">
              المسموح: {currentRolePerms.length} من {ALL_PERMISSIONS_LIST.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={selectAllForRole}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition-colors cursor-pointer"
            >
              تفعيل كل العمليات للدور
            </button>
            <button
              type="button"
              onClick={clearAllForRole}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] transition-colors cursor-pointer"
            >
              إلغاء كل العمليات
            </button>
            <button
              type="button"
              onClick={resetRoleToDefault}
              className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-black text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              استعادة افتراضي الدور
            </button>
          </div>
        </div>

        {/* Body: Modals Level + Data Level */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
          {savedNotice && (
            <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-900 px-4 py-2.5 rounded-xl flex items-center gap-2 font-black text-xs shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Section 1: Data Level Operations */}
            <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-gradient-to-l from-emerald-800 to-teal-800 text-white px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-amber-300" />
                  <div>
                    <h3 className="text-sm font-black">أولاً: صلاحيات على مستوى البيانات (Data Operations)</h3>
                    <p className="text-[11px] text-emerald-100">الإضافة، التعديل، الحذف، التصدير، والتدقيق الحسابي</p>
                  </div>
                </div>
                <span className="bg-white/20 text-white text-xs font-black px-2.5 py-0.5 rounded-lg">
                  {dataPermissions.filter((p) => currentRolePerms.includes(p.id)).length} / {dataPermissions.length}
                </span>
              </div>

              <div className="p-3.5 space-y-2 flex-1">
                {dataPermissions.map((perm) => {
                  const checked = currentRolePerms.includes(perm.id);
                  return (
                    <label
                      key={perm.id}
                      onClick={() => togglePermission(perm.id)}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                        checked
                          ? 'bg-emerald-50/70 border-emerald-400 shadow-xs'
                          : 'bg-slate-50 border-slate-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="mt-1 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-xs text-slate-900">{perm.label}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {perm.category}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{perm.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Modal Level Operations */}
            <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-gradient-to-l from-indigo-900 to-purple-900 text-white px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-300" />
                  <div>
                    <h3 className="text-sm font-black">ثانياً: صلاحيات على مستوى المودالات والنوافذ (Modals)</h3>
                    <p className="text-[11px] text-indigo-200">التحكم في فتح النوافذ الفرعية والمودالات الإدارية</p>
                  </div>
                </div>
                <span className="bg-white/20 text-white text-xs font-black px-2.5 py-0.5 rounded-lg">
                  {modalPermissions.filter((p) => currentRolePerms.includes(p.id)).length} / {modalPermissions.length}
                </span>
              </div>

              <div className="p-3.5 space-y-2 flex-1 max-h-[420px] overflow-y-auto">
                {modalPermissions.map((perm) => {
                  const checked = currentRolePerms.includes(perm.id);
                  return (
                    <label
                      key={perm.id}
                      onClick={() => togglePermission(perm.id)}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                        checked
                          ? 'bg-indigo-50/70 border-indigo-400 shadow-xs'
                          : 'bg-slate-50 border-slate-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="mt-1 w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-xs text-slate-900">{perm.label}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                            {perm.category}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">{perm.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-5 py-3.5 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-slate-600">
            يتم حفظ مصفوفة الصلاحيات مباشرة داخل إعدادات النظام (<code className="font-mono text-indigo-700">SystemConfig.rolePermissions</code>) وتطبق فوراً.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              حفظ إعدادات الصلاحيات في SystemConfig
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
