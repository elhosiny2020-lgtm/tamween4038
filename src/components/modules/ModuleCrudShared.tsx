import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Database,
  Clock,
  ShieldCheck,
  Eye,
  ShieldAlert,
  Bell,
  Filter,
  Lock,
  Printer,
  Check,
  History,
} from 'lucide-react';
import { formatArabicDateTime, type ModulePermissions } from '../../utils/moduleCrudHelpers';
import { getSecurityShieldHeaders } from '../../lib/supabase';
import {
  countUnreadDepartmentAlerts,
  filterDepartmentAlerts,
  type DepartmentAlertItem,
} from '../../utils/moduleAlertsEngine';

export interface CrudFieldOption {
  value: string | number;
  label: string;
}

export interface CrudFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'time' | 'month' | 'datetime-local' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: number;
  options?: CrudFieldOption[];
  colSpan?: 1 | 2;
  readOnly?: boolean;
  helperText?: string;
}

interface ModuleTableToolbarProps {
  title: string;
  subtitle?: string;
  count: number;
  addLabel?: string;
  permissions: ModulePermissions;
  onAddClick?: () => void;
  extraActions?: React.ReactNode;
  testIdPrefix?: string;
}

export const ModuleTableToolbar: React.FC<ModuleTableToolbarProps> = ({
  title,
  subtitle,
  count,
  addLabel = 'إضافة سجل جديد',
  permissions,
  onAddClick,
  extraActions,
  testIdPrefix = 'module-table',
}) => {
  return (
    <div
      className="bg-gradient-to-l from-[#0A1628] to-[#13294B] text-white px-4 py-3 rounded-xl border border-[#D4AF37]/30 flex flex-wrap items-center justify-between gap-2.5 shadow-sm"
      dir="rtl"
    >
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-[#D4AF37] text-[#0A1628] text-xs font-black font-mono tabular-nums">
          {count} سجل
        </span>
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span>{title}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-200">
              <Database className="w-3 h-3 text-emerald-300" />
              <span>مرتبط لحظياً بـ Supabase</span>
            </span>
          </h3>
          {subtitle && <p className="text-[11px] text-slate-300 font-bold mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {extraActions}
        {permissions.canAdd && onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            data-testid={`${testIdPrefix}-add-btn`}
            aria-label={addLabel}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-[#0A1628] border border-[#D4AF37] rounded-xl text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#0D9488]" />
            <span>{addLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface ModuleRowActionsProps {
  entityLabel: string;
  updatedAt?: string;
  permissions: ModulePermissions;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  extraAction?: React.ReactNode;
  testIdPrefix?: string;
}

export const ModuleRowActions: React.FC<ModuleRowActionsProps> = ({
  entityLabel,
  updatedAt,
  permissions,
  onView,
  onEdit,
  onDelete,
  extraAction,
  testIdPrefix = 'row',
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
        {extraAction}
        {onView && (
          <button
            type="button"
            onClick={onView}
            data-testid={`${testIdPrefix}-view-btn`}
            aria-label={`عرض ملف ${entityLabel}`}
            title={`العين السحرية — عرض بيانات ${entityLabel}`}
            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white border border-teal-400/50 rounded-lg text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-xs"
          >
            <Eye className="w-3.5 h-3.5 text-white" />
            <span>عرض</span>
          </button>
        )}
        {permissions.canEdit && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            data-testid={`${testIdPrefix}-edit-btn`}
            aria-label={`تعديل ${entityLabel}`}
            title={`تعديل ${entityLabel}`}
            className="px-2.5 py-1 bg-[#0A1628] hover:bg-[#13294B] text-white border border-[#D4AF37]/50 rounded-lg text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-xs"
          >
            <Edit3 className="w-3 h-3 text-[#D4AF37]" />
            <span>تعديل</span>
          </button>
        )}
        {permissions.canDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            data-testid={`${testIdPrefix}-delete-btn`}
            aria-label={`حذف ${entityLabel}`}
            title={`حذف ${entityLabel}`}
            className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg text-[11px] font-black inline-flex items-center gap-1 transition cursor-pointer shadow-xs"
          >
            <Trash2 className="w-3 h-3 text-rose-600" />
            <span>حذف</span>
          </button>
        )}
        {!onView && !permissions.canEdit && !permissions.canDelete && (
          <span className="text-[10px] text-slate-400 font-bold">للعرض فقط</span>
        )}
      </div>
      {updatedAt && (
        <span
          className="text-[10px] text-slate-500 font-mono inline-flex items-center gap-0.5"
          title={`آخر تعديل: ${formatArabicDateTime(updatedAt)}`}
        >
          <Clock className="w-2.5 h-2.5 text-[#0D9488]" />
          <span>{formatArabicDateTime(updatedAt)}</span>
        </span>
      )}
    </div>
  );
};

interface ModuleFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  title: string;
  subtitle?: string;
  fields: CrudFieldDefinition[];
  initialValues: Record<string, any>;
  onClose: () => void;
  onSubmit: (values: Record<string, any>) => string | null | void;
  onFieldChange?: (key: string, value: any, currentValues: Record<string, any>) => Record<string, any> | void;
}

export const ModuleFormModal: React.FC<ModuleFormModalProps> = ({
  isOpen,
  mode,
  title,
  subtitle,
  fields,
  initialValues,
  onClose,
  onSubmit,
  onFieldChange,
}) => {
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prevOpenRef = useRef<boolean>(false);
  const prevIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentId = initialValues?.id ? String(initialValues.id) : undefined;
    if (isOpen && (!prevOpenRef.current || prevIdRef.current !== currentId)) {
      setValues({ ...initialValues });
      setErrorMsg(null);
      setIsSubmitting(false);
    }
    prevOpenRef.current = isOpen;
    prevIdRef.current = currentId;
  }, [isOpen, initialValues]);

  const updateFieldValue = (key: string, nextVal: any) => {
    setValues((prev) => {
      const updated = { ...prev, [key]: nextVal };
      if (onFieldChange) {
        const extra = onFieldChange(key, nextVal, updated);
        if (extra && typeof extra === 'object') {
          return { ...updated, ...extra };
        }
      }
      return updated;
    });
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    // Check mandatory fields
    for (const f of fields) {
      if (f.required && !f.readOnly) {
        const val = values[f.key];
        if (val === undefined || val === null || String(val).trim() === '') {
          setErrorMsg(`الحقل الإلزامي (${f.label}) مطلوب ولا يمكن تركه فارغاً.`);
          return;
        }
        if (f.type === 'number' && Number.isNaN(Number(val))) {
          setErrorMsg(`يرجى إدخال قيمة رقمية صحيحة في حقل (${f.label}).`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const validationError = onSubmit(values);
      if (typeof validationError === 'string' && validationError.trim()) {
        setErrorMsg(validationError);
        setIsSubmitting(false);
        return;
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ البيانات.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="module-crud-form-modal"
    >
      <div className="bg-white rounded-2xl border-2 border-[#0A1628] shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0A1628] text-white px-5 py-4 flex items-center justify-between border-b border-[#D4AF37]/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#D4AF37] text-[#0A1628]">
              {mode === 'add' ? <Plus className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black">{title}</h3>
              <p className="text-[11px] text-[#5EEAD4] font-bold">
                {subtitle ||
                  (mode === 'add'
                    ? 'إدخال سجل جديد وحفظه مباشرة في قاعدة بيانات Supabase مع المزامنة اللحظية'
                    : 'تعديل بيانات السجل الحالي وتحديث تاريخ ووقت آخر تعديل تلقائياً')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {errorMsg && (
            <div
              className="p-3 rounded-xl bg-rose-50 border border-rose-400 text-rose-900 text-xs font-black flex items-center gap-2"
              data-testid="module-crud-form-error"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {fields.map((f) => {
              const val = values[f.key] ?? (f.type === 'checkbox' ? false : '');
              return (
                <div
                  key={f.key}
                  className={f.colSpan === 2 ? 'sm:col-span-2 space-y-1' : 'space-y-1'}
                >
                  <label
                    htmlFor={`crud-field-${f.key}`}
                    className="block font-black text-[#0A1628]"
                  >
                    <span>{f.label}</span>
                    {f.required && <span className="text-rose-600 mr-1">*</span>}
                  </label>

                  {f.type === 'select' ? (
                    <select
                      id={`crud-field-${f.key}`}
                      disabled={f.readOnly}
                      value={String(val)}
                      onChange={(e) => updateFieldValue(f.key, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:border-[#0A1628] rounded-xl font-bold text-slate-900"
                    >
                      {(f.options || []).map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      id={`crud-field-${f.key}`}
                      disabled={f.readOnly}
                      rows={3}
                      value={String(val)}
                      placeholder={f.placeholder}
                      onChange={(e) => updateFieldValue(f.key, e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:border-[#0A1628] rounded-xl font-bold text-slate-900"
                    />
                  ) : f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl cursor-pointer font-bold">
                      <input
                        id={`crud-field-${f.key}`}
                        type="checkbox"
                        disabled={f.readOnly}
                        checked={Boolean(val)}
                        onChange={(e) => updateFieldValue(f.key, e.target.checked)}
                      />
                      <span>{f.placeholder || f.label}</span>
                    </label>
                  ) : (
                    <input
                      id={`crud-field-${f.key}`}
                      type={f.type}
                      step={f.step || (f.type === 'number' ? 'any' : undefined)}
                      min={f.min}
                      disabled={f.readOnly}
                      value={val}
                      placeholder={f.placeholder}
                      onChange={(e) =>
                        updateFieldValue(
                          f.key,
                          f.type === 'number'
                            ? e.target.value === ''
                              ? ''
                              : Number(e.target.value)
                            : e.target.value
                        )
                      }
                      className={`w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:border-[#0A1628] rounded-xl font-bold text-slate-900 ${
                        f.type === 'number' || f.type === 'date' || f.type === 'time'
                          ? 'font-mono'
                          : ''
                      }`}
                    />
                  )}
                  {f.helperText && (
                    <p className="text-[10px] text-slate-500 font-bold">{f.helperText}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500 inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
              <span>حفظ فوري ومزامنة لحظية عبر Supabase Realtime</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="module-crud-form-submit-btn"
                className="px-5 py-2 bg-[#0A1628] hover:bg-[#13294B] disabled:opacity-50 text-[#D4AF37] border border-[#D4AF37]/50 rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-[#0D9488]" />
                <span>{mode === 'add' ? 'حفظ وإضافة السجل' : 'حفظ التعديلات في القاعدة'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ModuleDeleteConfirmModalProps {
  isOpen: boolean;
  entityTitle: string;
  recordSummary: { label: string; value: string | number }[];
  canDelete: boolean;
  blockReason?: string;
  onClose: () => void;
  onConfirmDelete: () => void;
}

export const ModuleDeleteConfirmModal: React.FC<ModuleDeleteConfirmModalProps> = ({
  isOpen,
  entityTitle,
  recordSummary,
  canDelete,
  blockReason,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) setIsDeleting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`تأكيد حذف ${entityTitle}`}
      data-testid="module-delete-confirm-modal"
    >
      <div className="bg-white rounded-2xl border-2 border-[#0A1628] shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-[#0A1628] text-white px-5 py-3.5 flex items-center justify-between border-b border-rose-500/40">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-600 text-white">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black">تأكيد حذف السجل من قاعدة البيانات</h3>
              <p className="text-[11px] text-rose-300 font-bold">{entityTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الحذف"
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <div className="font-black text-[#0A1628] mb-1">بيانات السجل المراد حذفه:</div>
            {recordSummary.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-1 last:border-0 last:pb-0">
                <span className="text-slate-500 font-bold">{item.label}:</span>
                <span className="font-black text-slate-900 font-mono">{String(item.value)}</span>
              </div>
            ))}
          </div>

          {!canDelete ? (
            <div
              className="p-3 bg-amber-50 border border-amber-400 text-amber-950 rounded-xl font-black flex items-start gap-2"
              data-testid="module-delete-blocked-reason"
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{blockReason}</span>
            </div>
          ) : (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl font-bold">
              هل أنت متأكد من حذف هذا السجل نهائياً؟ سيتم تحديث قاعدة بيانات Supabase ومزامنة الحذف مع جميع الأجهزة المتصلة فوراً.
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black cursor-pointer"
            >
              إلغاء
            </button>
            {canDelete && (
              <button
                type="button"
                disabled={isDeleting}
                data-testid="module-confirm-delete-btn"
                onClick={() => {
                  if (isDeleting) return;
                  setIsDeleting(true);
                  onConfirmDelete();
                  onClose();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-black inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تأكيد الحذف النهائي</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   1. العين السحرية — نافذة العرض الكامل للقراءة فقط (بدون أي تعديل)
   ============================================================================ */

export interface RecordProfileSection {
  title: string;
  fields: { label: string; value: string | number | boolean | null | undefined; mono?: boolean; highlight?: boolean }[];
}

interface ModuleRecordProfileModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  badgeText?: string;
  sections: RecordProfileSection[];
  updatedAt?: string;
  onClose: () => void;
}

export const ModuleRecordProfileModal: React.FC<ModuleRecordProfileModalProps> = ({
  isOpen,
  title,
  subtitle,
  badgeText,
  sections,
  updatedAt,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`بطاقة عرض ${title}`}
      data-testid="module-magic-eye-modal"
    >
      <div className="bg-white rounded-2xl border-2 border-[#0A1628] shadow-2xl w-full max-w-3xl overflow-hidden my-auto">
        <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white px-5 py-4 flex items-center justify-between border-b border-[#D4AF37]/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-400/20 border border-teal-300/40 text-teal-200">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black">{title}</h3>
                {badgeText && (
                  <span className="px-2.5 py-0.5 rounded-md bg-[#D4AF37] text-[#0A1628] text-[11px] font-black">
                    {badgeText}
                  </span>
                )}
              </div>
              {subtitle && <p className="text-xs text-teal-100 font-bold mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-black inline-flex items-center gap-1 cursor-pointer no-print"
              title="طباعة البطاقة التعريفية"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة العرض"
              data-testid="magic-eye-close-btn"
              className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer no-print"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto bg-slate-50/70">
          <div className="px-3 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-teal-700" />
              <span>وضع العرض الكامل للقراءة فقط (العين السحرية) — غير قابل للتعديل من هذه النافذة</span>
            </span>
            {updatedAt && (
              <span className="font-mono text-[11px] text-teal-700">آخر تحديث: {formatArabicDateTime(updatedAt)}</span>
            )}
          </div>

          {sections.map((sec, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 text-xs font-black text-[#0A1628]">
                {sec.title}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 text-xs">
                {sec.fields.map((fld, fIdx) => {
                  const displayVal =
                    fld.value === null || fld.value === undefined || String(fld.value).trim() === ''
                      ? '—'
                      : typeof fld.value === 'boolean'
                      ? fld.value
                        ? 'نعم'
                        : 'لا'
                      : String(fld.value);
                  return (
                    <div
                      key={fIdx}
                      className={`p-2.5 rounded-lg border ${
                        fld.highlight ? 'bg-amber-50 border-amber-300' : 'bg-slate-50/80 border-slate-200/80'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 font-bold mb-0.5">{fld.label}</div>
                      <div
                        className={`font-black text-[#0A1628] break-words ${
                          fld.mono ? 'font-mono' : ''
                        }`}
                      >
                        {displayVal}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-end no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#0A1628] hover:bg-[#13294B] text-white rounded-xl text-xs font-black cursor-pointer"
          >
            إغلاق بطاقة العرض
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   2. صفوف التجميع القياسية: «إجمالي الوحدة المحلية» و «الإجمالي العام للقرية TOTAL»
   ============================================================================ */

export interface TotalRowCell {
  colSpan?: number;
  content: React.ReactNode;
  align?: 'right' | 'center' | 'left';
  mono?: boolean;
}

export const LocalUnitSubtotalRow: React.FC<{
  unitName: string;
  recordCount: number;
  labelColSpan: number;
  metricCells: TotalRowCell[];
}> = ({ unitName, recordCount, labelColSpan, metricCells }) => (
  <tr className="unit-subtotal-row" data-testid="local-unit-subtotal-row">
    <td colSpan={labelColSpan} className="px-3 py-2.5 text-right font-black">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded-md bg-[#0D9488] text-white text-[11px] font-black">
          إجمالي الوحدة المحلية
        </span>
        <span className="text-[#0A1628] font-black">{unitName}</span>
        <span className="text-xs font-mono text-teal-800">({recordCount} سجل)</span>
      </div>
    </td>
    {metricCells.map((cell, idx) => (
      <td
        key={idx}
        colSpan={cell.colSpan}
        className={`px-3 py-2.5 font-black ${
          cell.align === 'right' ? 'text-right' : cell.align === 'left' ? 'text-left' : 'text-center'
        } ${cell.mono ? 'font-mono tabular-nums' : ''}`}
      >
        {cell.content}
      </td>
    ))}
  </tr>
);

export const VillageGrandTotalRow: React.FC<{
  totalCount: number;
  labelColSpan: number;
  metricCells: TotalRowCell[];
  title?: string;
}> = ({ totalCount, labelColSpan, metricCells, title = 'الإجمالي العام للقرية TOTAL' }) => (
  <tr className="grand-total-row" data-testid="village-grand-total-row">
    <td colSpan={labelColSpan} className="px-3 py-3 text-right font-black">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-0.5 rounded-md bg-[#D4AF37] text-[#0A1628] text-xs font-black">
          {title}
        </span>
        <span className="text-xs font-mono text-teal-200">({totalCount} إجمالي السجلات)</span>
      </div>
    </td>
    {metricCells.map((cell, idx) => (
      <td
        key={idx}
        colSpan={cell.colSpan}
        className={`px-3 py-3 font-black ${
          cell.align === 'right' ? 'text-right' : cell.align === 'left' ? 'text-left' : 'text-center'
        } ${cell.mono ? 'font-mono tabular-nums' : ''}`}
      >
        {cell.content}
      </td>
    ))}
  </tr>
);

/* ============================================================================
   3. شريط حذف سجل التدقيق (مقتصر على الإدمن فقط) + سجل الأمان غير القابل للحذف
   ============================================================================ */

export interface AuditDeletionSecurityEntry {
  id: string;
  branchId: string;
  deletedBy: string;
  deletedByFullName: string;
  targetScope: string;
  deletedCount: number;
  reason: string;
  ipAddress: string;
  createdAt: string;
}

interface AuditLogAdminToolbarProps {
  branchId: string;
  sliceKey: 'ration' | 'grainMaintenance' | 'hr' | 'internalTrade';
  scopeLabel: string;
  totalLogsCount: number;
  isSuperAdmin: boolean;
  onAuditLogsCleared: (deletedIds?: string[]) => void;
}

export const AuditLogAdminToolbar: React.FC<AuditLogAdminToolbarProps> = ({
  branchId,
  sliceKey,
  scopeLabel,
  totalLogsCount,
  isSuperAdmin,
  onAuditLogsCleared,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [showSecurityLog, setShowSecurityLog] = useState(false);
  const [securityLogs, setSecurityLogs] = useState<AuditDeletionSecurityEntry[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(false);

  const loadSecurityLog = async () => {
    if (!isSuperAdmin) return;
    setLoadingSecurity(true);
    try {
      const resp = await fetch(
        `/api/audit-deletion-security-log?branchId=${encodeURIComponent(branchId)}`,
        { headers: { ...getSecurityShieldHeaders() } }
      );
      if (resp.ok) {
        const json = await resp.json();
        setSecurityLogs(Array.isArray(json.rows) ? json.rows : []);
      }
    } catch {
      // ignore network issue
    } finally {
      setLoadingSecurity(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div
        className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold flex items-center gap-2"
        dir="rtl"
      >
        <Lock className="w-4 h-4 text-slate-500 shrink-0" />
        <span>
          سجل التدقيق للقراءة والمراجعة فقط — حذف سجل التدقيق مقتصر حصرياً على مدير النظام الرئيسي (Admin).
        </span>
      </div>
    );
  }

  const handleConfirmDeleteAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanWord = confirmWord.trim().toUpperCase();
    if (cleanWord !== 'CONFIRM' && confirmWord.trim() !== 'حذف') {
      setErrorMsg('يرجى كتابة كلمة CONFIRM أو حذف في حقل التأكيد.');
      return;
    }
    if (!confirmChecked) {
      setErrorMsg('يرجى تأكيد أن الحذف يقتصر على سجل التدقيق ولا يمس البيانات التشغيلية.');
      return;
    }
    if (reason.trim().length < 3) {
      setErrorMsg('يرجى كتابة سبب حذف سجل التدقيق (3 أحرف على الأقل).');
      return;
    }

    setIsDeleting(true);
    try {
      const resp = await fetch(`/api/modules/${encodeURIComponent(branchId)}/audit-logs/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSecurityShieldHeaders(),
        },
        body: JSON.stringify({
          sliceKey,
          confirmDelete: true,
          reason: reason.trim(),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success) {
        setErrorMsg(json.error || 'تعذر حذف سجل التدقيق من الخادم.');
        setIsDeleting(false);
        return;
      }
      onAuditLogsCleared();
      setShowDeleteModal(false);
      setConfirmWord('');
      setConfirmChecked(false);
      setReason('');
      setStatusBanner(
        `تم حذف (${json.deletedCount ?? totalLogsCount}) سجل تدقيق من ${scopeLabel} وتسجيل العملية في سجل الأمان غير القابل للحذف. البيانات التشغيلية لم تمس.`
      );
      if (showSecurityLog) {
        void loadSecurityLog();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حذف سجل التدقيق.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 text-xs">
          <ShieldAlert className="w-5 h-5 text-[#D4AF37]" />
          <div>
            <div className="font-black">إدارة سجل التدقيق — صلاحية مدير النظام الرئيسي ({scopeLabel})</div>
            <div className="text-[11px] text-slate-300 font-bold">
              يتم توثيق أي عملية حذف لسجل التدقيق في سجل أمان دائم غير قابل للتعديل أو الحذف مع الحفاظ 100% على السجلات التشغيلية.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !showSecurityLog;
              setShowSecurityLog(next);
              if (next) void loadSecurityLog();
            }}
            data-testid={`audit-security-trail-toggle-${sliceKey}`}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-200 border border-teal-400/40 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل أمان الحذف المحمي</span>
          </button>
          <button
            type="button"
            disabled={totalLogsCount === 0}
            onClick={() => {
              setErrorMsg(null);
              setConfirmWord('');
              setConfirmChecked(false);
              setReason('');
              setShowDeleteModal(true);
            }}
            data-testid={`delete-audit-log-btn-${sliceKey}`}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف سجل التدقيق ({totalLogsCount})</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-400 text-emerald-950 text-xs font-black flex items-center justify-between gap-2">
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner(null)} className="text-emerald-700 font-black cursor-pointer">
            إغلاق
          </button>
        </div>
      )}

      {showSecurityLog && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
          <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-black text-[#0A1628] inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-rose-600" />
              <span>سجل أمان عمليات حذف التدقيق (Audit Deletion Security Log — غير قابل للتعديل أو الحذف)</span>
            </span>
            <button
              type="button"
              onClick={() => void loadSecurityLog()}
              className="text-xs font-black text-teal-700 hover:underline cursor-pointer"
            >
              تحديث
            </button>
          </div>
          {loadingSecurity ? (
            <div className="p-4 text-center text-xs font-bold text-slate-500">جاري تحميل سجل الأمان...</div>
          ) : securityLogs.length === 0 ? (
            <div className="p-4 text-center text-xs font-bold text-slate-500">لا توجد عمليات حذف مسجلة في سجل الأمان.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-[#0A1628] text-white">
                  <tr>
                    <th className="py-2 px-3">التاريخ والوقت</th>
                    <th className="py-2 px-3">المنفذ (الإدمن)</th>
                    <th className="py-2 px-3">النطاق المستهدف</th>
                    <th className="py-2 px-3 text-center">عدد المحذوف</th>
                    <th className="py-2 px-3">السبب الموثق</th>
                    <th className="py-2 px-3">عنوان IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {securityLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2 px-3 font-mono">{formatArabicDateTime(entry.createdAt)}</td>
                      <td className="py-2 px-3 font-black">{entry.deletedByFullName || entry.deletedBy}</td>
                      <td className="py-2 px-3">{entry.targetScope}</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-rose-700">{entry.deletedCount}</td>
                      <td className="py-2 px-3">{entry.reason}</td>
                      <td className="py-2 px-3 font-mono">{entry.ipAddress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          data-testid={`delete-audit-modal-${sliceKey}`}
        >
          <div className="bg-white rounded-2xl border-2 border-rose-600 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                <h4 className="text-sm font-black">تأكيد حذف سجل التدقيق ({scopeLabel})</h4>
              </div>
              <button type="button" onClick={() => setShowDeleteModal(false)} className="p-1 rounded-lg bg-white/15 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmDeleteAudit} className="p-5 space-y-3.5 text-xs">
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-400 text-rose-900 font-black">{errorMsg}</div>
              )}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 font-bold">
                سيتم حذف قيود سجل التدقيق فقط ({totalLogsCount} قيد)، ولن يتأثر أي سجل تشغيلي أو حسابي، كما ستُسجل هذه العملية في سجل الأمان غير القابل للحذف.
              </div>
              <div className="space-y-1">
                <label className="block font-black text-[#0A1628]">سبب الحذف الإلزامي *</label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="اذكر سبب حذف سجل التدقيق..."
                  data-testid="audit-delete-reason-input"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-black text-[#0A1628]">اكتب كلمة CONFIRM أو حذف للتأكيد *</label>
                <input
                  type="text"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  placeholder="CONFIRM"
                  data-testid="audit-delete-confirm-input"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-black"
                />
              </div>
              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  data-testid="audit-delete-confirm-checkbox"
                />
                <span>أؤكد أنني بصفتي مدير النظام الرئيسي أرغب في حذف سجل التدقيق وتوثيق العملية أمنياً.</span>
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-black cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  data-testid="audit-delete-submit-btn"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-black inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تنفيذ حذف سجل التدقيق</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   4. لوحة التنبيهات والإشعارات الداخلية للقسم (السلع التموينية / التجارة الداخلية)
   ============================================================================ */

interface DepartmentAlertsPanelProps {
  title: string;
  departmentLabel: string;
  alerts: DepartmentAlertItem[];
  readAlertIds: string[];
  onMarkRead: (alertId: string) => void;
  onMarkAllRead: (allIds: string[]) => void;
  canDeleteAlerts: boolean;
}

export const DepartmentAlertsPanel: React.FC<DepartmentAlertsPanelProps> = ({
  title,
  departmentLabel,
  alerts,
  readAlertIds,
  onMarkRead,
  onMarkAllRead,
  canDeleteAlerts,
}) => {
  const [typeFilter, setTypeFilter] = useState<string>('الكل');
  const [localUnitFilter, setLocalUnitFilter] = useState<string>('الكل');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const readSet = useMemo(() => new Set(readAlertIds || []), [readAlertIds]);
  const unreadCount = useMemo(() => countUnreadDepartmentAlerts(alerts, readAlertIds), [alerts, readAlertIds]);

  const alertTypes = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts) set.add(a.type);
    return ['الكل', ...Array.from(set)];
  }, [alerts]);

  const localUnits = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts) set.add(a.localUnit);
    return ['الكل', ...Array.from(set)];
  }, [alerts]);

  const filteredAlerts = useMemo(
    () =>
      filterDepartmentAlerts(alerts, {
        type: typeFilter,
        localUnit: localUnitFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        unreadOnly,
        readIds: readAlertIds,
      }),
    [alerts, typeFilter, localUnitFilter, dateFrom, dateTo, unreadOnly, readAlertIds]
  );

  return (
    <div className="space-y-4" dir="rtl" data-testid="department-alerts-panel">
      <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white p-4 rounded-2xl border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#D4AF37] text-[#0A1628] relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-2 -left-2 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black font-mono"
                data-testid="department-alerts-unread-badge"
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black">{title}</h3>
            <p className="text-xs text-teal-100 font-bold">
              مصدر البيانات: قاعدة البيانات الفعلية لـ {departmentLabel} — الإجمالي: {alerts.length} تنبيه | غير مقروء: {unreadCount}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => onMarkAllRead(alerts.map((a) => a.id))}
              data-testid="alerts-mark-all-read-btn"
              className="px-3.5 py-2 rounded-xl bg-white text-[#0A1628] hover:bg-slate-100 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4 text-teal-700" />
              <span>تحديد الكل كمقروء ({unreadCount})</span>
            </button>
          )}
          {!canDeleteAlerts && (
            <span className="px-2.5 py-1.5 rounded-xl bg-white/10 text-[11px] font-bold text-amber-200 inline-flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>حذف التنبيهات لمدير النظام فقط</span>
            </span>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
        <div>
          <label className="block text-[11px] font-black text-slate-600 mb-1">
            <Filter className="w-3 h-3 inline ml-1" />
            نوع التنبيه
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
          >
            {alertTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-black text-slate-600 mb-1">الوحدة المحلية</label>
          <select
            value={localUnitFilter}
            onChange={(e) => setLocalUnitFilter(e.target.value)}
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
          >
            {localUnits.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-black text-slate-600 mb-1">من تاريخ</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
          />
        </div>
        <div>
          <label className="block text-[11px] font-black text-slate-600 mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
          />
        </div>
        <div className="flex items-end">
          <label className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl cursor-pointer font-black">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span>غير المقروءة فقط</span>
          </label>
        </div>
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs font-black text-slate-500">
          لا توجد تنبيهات مطابقة لعوامل التصفية المحددة في {departmentLabel}.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredAlerts.map((alert) => {
            const isRead = readSet.has(alert.id);
            const severityColors =
              alert.severity === 'critical'
                ? 'border-r-4 border-r-rose-600 bg-rose-50/40'
                : alert.severity === 'warning'
                ? 'border-r-4 border-r-amber-500 bg-amber-50/40'
                : 'border-r-4 border-r-teal-600 bg-teal-50/30';

            return (
              <div
                key={alert.id}
                data-testid={`dept-alert-item-${alert.id}`}
                className={`p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 ${severityColors} ${
                  isRead ? 'opacity-75' : ''
                }`}
              >
                <div className="space-y-1 flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {!isRead && <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />}
                    <span className="text-xs sm:text-sm font-black text-[#0A1628]">{alert.title}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-[10px] font-black">
                      {alert.type}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 text-[10px] font-black">
                      الوحدة المحلية: {alert.localUnit}
                    </span>
                    {alert.village && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                        القرية: {alert.village}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700">{alert.message}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-bold">
                    <span>المصدر: {alert.sourceLabel}</span>
                    <span>•</span>
                    <span>القسم: {departmentLabel}</span>
                    <span>•</span>
                    <span className="font-mono">التاريخ: {alert.dateKey}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isRead ? (
                    <button
                      type="button"
                      onClick={() => onMarkRead(alert.id)}
                      data-testid={`alert-mark-read-${alert.id}`}
                      className="px-3 py-1.5 rounded-xl bg-[#0A1628] hover:bg-[#13294B] text-white text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>تمت القراءة</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 text-xs font-black inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>مقروء</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

