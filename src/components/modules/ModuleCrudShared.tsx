import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { formatArabicDateTime, type ModulePermissions } from '../../utils/moduleCrudHelpers';

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
  onEdit: () => void;
  onDelete: () => void;
  extraAction?: React.ReactNode;
  testIdPrefix?: string;
}

export const ModuleRowActions: React.FC<ModuleRowActionsProps> = ({
  entityLabel,
  updatedAt,
  permissions,
  onEdit,
  onDelete,
  extraAction,
  testIdPrefix = 'row',
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="inline-flex items-center justify-center gap-1.5 flex-wrap">
        {extraAction}
        {permissions.canEdit && (
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
        {permissions.canDelete && (
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
        {!permissions.canEdit && !permissions.canDelete && (
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
}) => {
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValues({ ...initialValues });
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialValues]);

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
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
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
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:border-[#0A1628] rounded-xl font-bold text-slate-900"
                    />
                  ) : f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl cursor-pointer font-bold">
                      <input
                        id={`crud-field-${f.key}`}
                        type="checkbox"
                        disabled={f.readOnly}
                        checked={Boolean(val)}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [f.key]: e.target.checked }))
                        }
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
                        setValues((prev) => ({
                          ...prev,
                          [f.key]:
                            f.type === 'number'
                              ? e.target.value === ''
                                ? ''
                                : Number(e.target.value)
                              : e.target.value,
                        }))
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
