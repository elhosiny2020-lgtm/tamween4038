import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderKanban,
  Layers,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { BranchDepartmentConfigItem, SupplyBranch } from '../types';
import {
  applyBranchDepartmentMutation,
  normalizeBranchDepartments,
} from '../utils/branchOperations';

interface BranchDepartmentsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  branch: SupplyBranch | null;
  initialDepartments?: BranchDepartmentConfigItem[];
  onSaveDepartments: (
    branchId: string,
    nextDepartments: BranchDepartmentConfigItem[]
  ) => Promise<{ success?: boolean; error?: string } | void> | void;
}

export const BranchDepartmentsManagerModal: React.FC<BranchDepartmentsManagerModalProps> = ({
  isOpen,
  onClose,
  branch,
  initialDepartments,
  onSaveDepartments,
}) => {
  const [departments, setDepartments] = useState<BranchDepartmentConfigItem[]>(() =>
    normalizeBranchDepartments(initialDepartments)
  );
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [newDeptLabel, setNewDeptLabel] = useState('');
  const [newDeptShortLabel, setNewDeptShortLabel] = useState('');
  const [newDeptKey, setNewDeptKey] = useState('bakeries');
  const [newSubInputs, setNewSubInputs] = useState<Record<string, string>>({});
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptLabel, setEditDeptLabel] = useState('');
  const [editDeptShortLabel, setEditDeptShortLabel] = useState('');
  const [editingSubKey, setEditingSubKey] = useState<{ deptId: string; subId: string } | null>(
    null
  );
  const [editSubLabel, setEditSubLabel] = useState('');
  const [confirmDeleteDeptId, setConfirmDeleteDeptId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  useEffect(() => {
    if (isOpen) {
      setDepartments(normalizeBranchDepartments(initialDepartments));
      setConfirmDeleteDeptId(null);
      setEditingDeptId(null);
      setEditingSubKey(null);
      setStatusMsg(null);
    }
  }, [isOpen, branch?.id, initialDepartments]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !branch) return null;

  const commitDepartments = async (next: BranchDepartmentConfigItem[], toast: string) => {
    setDepartments(next);
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await onSaveDepartments(branch.id, next);
      if (res && res.success === false) {
        setStatusMsg({
          text: res.error || 'تعذر حفظ هيكل الأقسام في قاعدة البيانات.',
          type: 'error',
        });
      } else {
        setStatusMsg({ text: toast, type: 'success' });
      }
    } catch (err: any) {
      setStatusMsg({ text: err?.message || 'حدث خطأ أثناء حفظ هيكل الأقسام.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDepartment = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newDeptLabel.trim();
    if (!clean) return;
    const next = applyBranchDepartmentMutation(departments, {
      type: 'ADD_DEPARTMENT',
      label: clean,
      shortLabel: newDeptShortLabel.trim() || clean,
      key: newDeptKey,
    });
    setNewDeptLabel('');
    setNewDeptShortLabel('');
    void commitDepartments(next, `تمت إضافة القسم "${clean}" داخل فرع ${branch.name} فقط.`);
  };

  const modalContent = (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`إدارة أقسام ${branch.name}`}
      data-testid="branch-departments-manager-modal"
      className="fixed inset-0 z-[9995] bg-[#0A1628]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[#FAF8F5] rounded-3xl shadow-2xl border-2 border-[#D4AF37]/40 w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#0F1E36] to-[#0D9488] px-5 py-4 text-white flex items-center justify-between gap-3 border-b border-[#D4AF37]/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
              <FolderKanban className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white truncate">
                لوحة تحكم إدارة الأقسام المستقلة — {branch.name}
              </h2>
              <p className="text-xs font-bold text-slate-300 truncate">
                تعديل أو إخفاء أو تعطيل أو حذف أو إعادة ترتيب الأقسام داخل هذا الفرع فقط دون التأثير على باقي الفروع أو حذف البيانات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            data-testid="close-branch-departments-modal-btn"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-rose-500/30 text-white flex items-center justify-center border border-white/15 cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {statusMsg && (
            <div
              className={`px-4 py-3 rounded-2xl border text-xs font-black flex items-center gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Add New Department Form + Restore Defaults */}
          <div className="bg-white rounded-2xl border border-[#0D9488]/30 p-4 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0D9488]" />
                <h3 className="text-sm font-black text-[#0A1628]">
                  إضافة قسم جديد مخصص داخل هذا الفرع ({departments.length} قسم مسجل)
                </h3>
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  const next = applyBranchDepartmentMutation(departments, {
                    type: 'RESET_DEFAULT_STRUCTURE',
                  });
                  void commitDepartments(
                    next,
                    `تمت استعادة هيكل الأقسام الافتراضي الكامل لفرع ${branch.name} بنجاح.`
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة هيكل الأقسام الافتراضي</span>
              </button>
            </div>

            <form
              onSubmit={handleAddDepartment}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  اسم القسم الجديد *
                </label>
                <input
                  type="text"
                  data-testid="new-branch-dept-label-input"
                  value={newDeptLabel}
                  onChange={(e) => setNewDeptLabel(e.target.value)}
                  placeholder="مثال: قسم المتابعة الميدانية الخاصة"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-xs font-bold text-[#0A1628]"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  وصف مختصر / شعار فرعي
                </label>
                <input
                  type="text"
                  value={newDeptShortLabel}
                  onChange={(e) => setNewDeptShortLabel(e.target.value)}
                  placeholder="مثال: الرقابة الخاصة"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-xs font-bold text-[#0A1628]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  نطاق الصلاحية
                </label>
                <select
                  value={newDeptKey}
                  onChange={(e) => setNewDeptKey(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-xs font-black text-[#0A1628]"
                >
                  <option value="bakeries">المخابز والعمليات</option>
                  <option value="debts">المديونيات</option>
                  <option value="internal_trade">التجارة الداخلية</option>
                  <option value="commodities">السلع التموينية</option>
                  <option value="grain_maintenance">صيانة الحبوب</option>
                  <option value="hr">الموارد البشرية</option>
                  <option value="reports">التقارير والأمان</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={isSaving || !newDeptLabel.trim()}
                  data-testid="add-branch-dept-submit-btn"
                  className="w-full py-2 px-3 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة قسم</span>
                </button>
              </div>
            </form>
          </div>

          {/* Departments List */}
          <div className="space-y-2.5">
            {departments.map((dept, index) => {
              const isExpanded = expandedDeptId === dept.id;
              const isEditingThis = editingDeptId === dept.id;

              return (
                <div
                  key={dept.id}
                  data-testid={`branch-dept-row-${dept.id}`}
                  className={`rounded-2xl border-2 bg-white transition-all overflow-hidden ${
                    !dept.enabled
                      ? 'border-rose-200 bg-rose-50/30 opacity-85'
                      : !dept.visible
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="p-3.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-xl bg-slate-900 text-[#D4AF37] text-xs font-black flex items-center justify-center shrink-0 tabular-nums">
                        {index + 1}
                      </span>

                      {isEditingThis ? (
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editDeptLabel}
                            onChange={(e) => setEditDeptLabel(e.target.value)}
                            data-testid={`rename-dept-input-${dept.id}`}
                            className="px-2.5 py-1 rounded-lg border-2 border-[#0D9488] text-xs font-black text-slate-900 min-w-[200px] flex-1"
                          />
                          <input
                            type="text"
                            value={editDeptShortLabel}
                            onChange={(e) => setEditDeptShortLabel(e.target.value)}
                            placeholder="الوصف الفرعي"
                            className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 w-44"
                          />
                          <button
                            type="button"
                            data-testid={`save-rename-dept-btn-${dept.id}`}
                            onClick={() => {
                              const next = applyBranchDepartmentMutation(departments, {
                                type: 'RENAME_DEPARTMENT',
                                deptId: dept.id,
                                label: editDeptLabel,
                                shortLabel: editDeptShortLabel,
                              });
                              setEditingDeptId(null);
                              void commitDepartments(next, `تم تعديل مسمى القسم "${editDeptLabel}".`);
                            }}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>حفظ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptId(null)}
                            className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-[#0A1628]">{dept.label}</span>
                            {!dept.visible && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                                مخفي من القائمة
                              </span>
                            )}
                            {!dept.enabled && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-black">
                                معطّل مؤقتاً
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500">
                            {dept.shortLabel || dept.key} • {dept.subItems.length} شاشة / قسم فرعي
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Department Controls */}
                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      <button
                        type="button"
                        disabled={index === 0 || isSaving}
                        onClick={() => {
                          const next = applyBranchDepartmentMutation(departments, {
                            type: 'REORDER_DEPARTMENT',
                            deptId: dept.id,
                            direction: 'up',
                          });
                          void commitDepartments(next, `تم تقديم ترتيب "${dept.label}" للأعلى.`);
                        }}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer"
                        title="تحريك للأعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={index === departments.length - 1 || isSaving}
                        onClick={() => {
                          const next = applyBranchDepartmentMutation(departments, {
                            type: 'REORDER_DEPARTMENT',
                            deptId: dept.id,
                            direction: 'down',
                          });
                          void commitDepartments(next, `تم تأخير ترتيب "${dept.label}" للأسفل.`);
                        }}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer"
                        title="تحريك للأسفل"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        data-testid={`toggle-dept-visible-btn-${dept.id}`}
                        disabled={isSaving}
                        onClick={() => {
                          const next = applyBranchDepartmentMutation(departments, {
                            type: 'TOGGLE_DEPARTMENT_VISIBLE',
                            deptId: dept.id,
                          });
                          void commitDepartments(
                            next,
                            dept.visible
                              ? `تم إخفاء "${dept.label}" في هذا الفرع فقط دون حذف البيانات.`
                              : `تم إظهار "${dept.label}" في هذا الفرع بنجاح.`
                          );
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border cursor-pointer ${
                          dept.visible
                            ? 'bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100'
                            : 'bg-amber-100 text-amber-900 border-amber-400 hover:bg-amber-200'
                        }`}
                      >
                        {dept.visible ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>ظاهر</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>مخفي</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        data-testid={`toggle-dept-enabled-btn-${dept.id}`}
                        disabled={isSaving}
                        onClick={() => {
                          const next = applyBranchDepartmentMutation(departments, {
                            type: 'TOGGLE_DEPARTMENT_ENABLED',
                            deptId: dept.id,
                          });
                          void commitDepartments(
                            next,
                            dept.enabled
                              ? `تم تعطيل "${dept.label}" مؤقتاً في هذا الفرع فقط.`
                              : `تم تفعيل "${dept.label}" في هذا الفرع بنجاح.`
                          );
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border cursor-pointer ${
                          dept.enabled
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{dept.enabled ? 'مفعّل' : 'معطّل'}</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`edit-dept-btn-${dept.id}`}
                        onClick={() => {
                          setEditingDeptId(dept.id);
                          setEditDeptLabel(dept.label);
                          setEditDeptShortLabel(dept.shortLabel || '');
                        }}
                        className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                        title="تعديل مسمى القسم"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDeptId((prev) => (prev === dept.id ? null : dept.id))
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-black cursor-pointer"
                      >
                        {isExpanded ? 'إخفاء الشاشات' : `الأقسام الفرعية (${dept.subItems.length})`}
                      </button>

                      <button
                        type="button"
                        data-testid={`delete-dept-btn-${dept.id}`}
                        onClick={() => setConfirmDeleteDeptId(dept.id)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                        title="حذف القسم من قائمة هذا الفرع"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {confirmDeleteDeptId === dept.id && (
                    <div className="px-4 py-3 bg-rose-50 border-t border-rose-200 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black text-rose-900">
                        هل تريد حذف القسم «{dept.label}» من هذا الفرع؟ (تبقى السجلات المخزنة محفوظة ولا تتأثر الفروع الأخرى)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDeptId(null)}
                          className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          data-testid={`confirm-delete-dept-btn-${dept.id}`}
                          onClick={() => {
                            const next = applyBranchDepartmentMutation(departments, {
                              type: 'DELETE_DEPARTMENT',
                              deptId: dept.id,
                            });
                            setConfirmDeleteDeptId(null);
                            void commitDepartments(
                              next,
                              `تم حذف القسم "${dept.label}" من هيكل فرع ${branch.name}.`
                            );
                          }}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
                        >
                          تأكيد الحذف
                        </button>
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="p-3.5 bg-slate-50 border-t border-slate-200 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newSubInputs[dept.id] || ''}
                          onChange={(e) =>
                            setNewSubInputs((prev) => ({ ...prev, [dept.id]: e.target.value }))
                          }
                          placeholder={`إضافة شاشة فرعية جديدة داخل "${dept.label}"...`}
                          className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const subLabel = (newSubInputs[dept.id] || '').trim();
                            if (!subLabel) return;
                            const next = applyBranchDepartmentMutation(departments, {
                              type: 'ADD_SUBITEM',
                              deptId: dept.id,
                              label: subLabel,
                            });
                            setNewSubInputs((prev) => ({ ...prev, [dept.id]: '' }));
                            void commitDepartments(
                              next,
                              `تمت إضافة الشاشة الفرعية "${subLabel}" إلى "${dept.label}".`
                            );
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة شاشة فرعية</span>
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {dept.subItems.map((sub) => {
                          const isEditingSub =
                            editingSubKey?.deptId === dept.id && editingSubKey?.subId === sub.id;
                          return (
                            <div
                              key={sub.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs"
                            >
                              {isEditingSub ? (
                                <div className="flex items-center gap-1.5 flex-1">
                                  <input
                                    type="text"
                                    value={editSubLabel}
                                    onChange={(e) => setEditSubLabel(e.target.value)}
                                    className="flex-1 px-2.5 py-1 rounded-lg border border-teal-500 text-xs font-bold"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = applyBranchDepartmentMutation(departments, {
                                        type: 'RENAME_SUBITEM',
                                        deptId: dept.id,
                                        subId: sub.id,
                                        label: editSubLabel,
                                      });
                                      setEditingSubKey(null);
                                      void commitDepartments(next, `تم تعديل الشاشة "${editSubLabel}".`);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black cursor-pointer"
                                  >
                                    حفظ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingSubKey(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-bold text-slate-800">{sub.label}</span>
                                    {!sub.visible && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black">
                                        مخفي
                                      </span>
                                    )}
                                    {!sub.enabled && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-black">
                                        معطّل
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = applyBranchDepartmentMutation(departments, {
                                          type: 'TOGGLE_SUBITEM_VISIBLE',
                                          deptId: dept.id,
                                          subId: sub.id,
                                        });
                                        void commitDepartments(next, `تم تحديث ظهور "${sub.label}".`);
                                      }}
                                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-700 cursor-pointer"
                                    >
                                      {sub.visible ? 'إخفاء' : 'إظهار'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = applyBranchDepartmentMutation(departments, {
                                          type: 'TOGGLE_SUBITEM_ENABLED',
                                          deptId: dept.id,
                                          subId: sub.id,
                                        });
                                        void commitDepartments(next, `تم تحديث تفعيل "${sub.label}".`);
                                      }}
                                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-700 cursor-pointer"
                                    >
                                      {sub.enabled ? 'تعطيل' : 'تفعيل'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingSubKey({ deptId: dept.id, subId: sub.id });
                                        setEditSubLabel(sub.label);
                                      }}
                                      className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-[10px] font-black text-amber-800 cursor-pointer"
                                    >
                                      تعديل
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = applyBranchDepartmentMutation(departments, {
                                          type: 'DELETE_SUBITEM',
                                          deptId: dept.id,
                                          subId: sub.id,
                                        });
                                        void commitDepartments(next, `تم حذف الشاشة "${sub.label}".`);
                                      }}
                                      className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-[10px] font-black text-rose-700 cursor-pointer"
                                    >
                                      حذف
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs font-bold text-slate-600">
            يُحفظ هيكل الأقسام لكل فرع على حدة في قاعدة البيانات ولا يتأثر أي فرع آخر.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#0A1628] hover:bg-[#0D9488] text-white text-xs font-black cursor-pointer"
          >
            إغلاق اللوحة
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
export default BranchDepartmentsManagerModal;
