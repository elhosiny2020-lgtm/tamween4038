import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppUser, SupplyBranch } from '../types';
import { DEFAULT_BRANCH_ID } from '../storage';
import { isSuperAdmin } from '../utils/departmentRbac';
import { CANONICAL_DEFAULT_BRANCHES, normalizeBranchNameKey } from '../utils/branchVaultUtils';
import {
  Building2,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  ArrowLeftRight,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  Check,
  Lock,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface BranchesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: SupplyBranch[];
  activeBranchId: string;
  currentUser?: AppUser | null;
  onSelectBranch: (branchId: string) => void;
  onCreateBranch: (name: string, directorate: string, governorate: string, description: string) => Promise<void> | void;
  onRenameBranch: (branchId: string, name: string, directorate: string, governorate: string, description: string) => Promise<void> | void;
  onDeleteBranch: (branchId: string) => Promise<void> | void;
  onFactoryResetBranch?: (branchId: string) => Promise<{ success: boolean; message?: string; error?: string }> | void;
  isVaultUnlocked: boolean;
  onRequireVaultUnlock: (label: string, onUnlocked: () => void) => void;
}

export const BranchesManagerModal: React.FC<BranchesManagerModalProps> = ({
  isOpen,
  onClose,
  branches,
  activeBranchId,
  currentUser,
  onSelectBranch,
  onCreateBranch,
  onRenameBranch,
  onDeleteBranch,
  onFactoryResetBranch,
  isVaultUnlocked,
  onRequireVaultUnlock,
}) => {
  const canManageBranches = isSuperAdmin(currentUser);
  const [newName, setNewName] = useState('');
  const [newDirectorate, setNewDirectorate] = useState('مديرية التموين والتجارة الداخلية بالغربية');
  const [newGovernorate, setNewGovernorate] = useState('محافظة الغربية');
  const [newDescription, setNewDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [isResettingId, setIsResettingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inline editing state for renaming/editing branch
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDirectorate, setEditDirectorate] = useState('');
  const [editGovernorate, setEditGovernorate] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Lock body scroll & support Escape key while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const findRegisteredPresetBranch = (preset: SupplyBranch): SupplyBranch | undefined => {
    const presetKey = normalizeBranchNameKey(preset.name);
    return branches.find(
      (b) => b.id === preset.id || normalizeBranchNameKey(b.name) === presetKey
    );
  };

  const addedPresetsCount = CANONICAL_DEFAULT_BRANCHES.filter((p) =>
    Boolean(findRegisteredPresetBranch(p))
  ).length;

  const handleQuickAddPresetBranch = (preset: SupplyBranch) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const existing = findRegisteredPresetBranch(preset);
    if (existing) {
      onSelectBranch(existing.id);
      onClose();
      return;
    }

    if (!canManageBranches) {
      setErrorMsg('إضافة الإدارات والفروع الجديدة مقصورة على مدير النظام (Super Admin) فقط.');
      return;
    }

    const executeCreate = async () => {
      await onCreateBranch(
        preset.name,
        preset.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية',
        preset.governorateTitle || 'محافظة الغربية',
        preset.description || `قاعدة بيانات مستقلة (${preset.name})`
      );
      setSuccessMsg(
        `تمت إضافة "${preset.name}" بكامل أقسام وقوالب المنظومة (تصفير المخابز والمديونيات وكافة البيانات = 0) بنجاح.`
      );
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`إضافة فرع (${preset.name}) من قائمة إدارات الغربية`, () => {
        void executeCreate();
      });
      return;
    }

    void executeCreate();
  };

  const handleAddBranch = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!canManageBranches) {
      setErrorMsg('إنشاء الإدارات والفروع الجديدة مقصور على مدير النظام (Super Admin) فقط.');
      return;
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setErrorMsg('يرجى إدخال اسم الفرع أو الإدارة التموينية الجديدة.');
      return;
    }

    const targetKey = normalizeBranchNameKey(trimmedName);
    const exists = branches.some((b) => normalizeBranchNameKey(b.name) === targetKey);
    if (exists) {
      setErrorMsg('يوجد فرع بنفس هذا الاسم مسجل بالفعل.');
      return;
    }

    const executeCreate = async () => {
      await onCreateBranch(
        trimmedName,
        newDirectorate.trim() || 'مديرية التموين والتجارة الداخلية بالغربية',
        newGovernorate.trim() || 'محافظة الغربية',
        newDescription.trim() || `قاعدة بيانات مستقلة (${trimmedName})`
      );
      setNewName('');
      setNewDescription('');
      setSuccessMsg(
        `تم إنشاء فرع "${trimmedName}" بكامل الأقسام والقوائم وتصفير المخابز والمديونيات بنجاح.`
      );
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`إضافة فرع جديد (${trimmedName})`, () => {
        void executeCreate();
      });
      return;
    }

    void executeCreate();
  };

  const handleStartEditBranch = (branch: SupplyBranch) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!canManageBranches) {
      setErrorMsg('تعديل بيانات الإدارات مقصور على مدير النظام (Super Admin) فقط.');
      return;
    }

    const openEditor = () => {
      setConfirmDeleteId(null);
      setConfirmResetId(null);
      setEditingBranchId(branch.id);
      setEditName(branch.name);
      setEditDirectorate(
        branch.directorateTitle || branch.directorate || 'مديرية التموين والتجارة الداخلية بالغربية'
      );
      setEditGovernorate(branch.governorateTitle || branch.governorate || 'محافظة الغربية');
      setEditDescription(branch.description || '');
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`تعديل اسم وبيانات فرع (${branch.name})`, openEditor);
      return;
    }

    openEditor();
  };

  const handleSaveEditBranch = (branchId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!canManageBranches) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setErrorMsg('اسم الفرع لا يمكن أن يكون فارغاً.');
      return;
    }

    const targetKey = normalizeBranchNameKey(trimmedName);
    const duplicate = branches.some(
      (b) => b.id !== branchId && normalizeBranchNameKey(b.name) === targetKey
    );
    if (duplicate) {
      setErrorMsg('يوجد فرع آخر مسجل بنفس هذا الاسم.');
      return;
    }

    const executeRename = async () => {
      await onRenameBranch(
        branchId,
        trimmedName,
        editDirectorate.trim() || 'مديرية التموين والتجارة الداخلية بالغربية',
        editGovernorate.trim() || 'محافظة الغربية',
        editDescription.trim() || `قاعدة بيانات مستقلة (${trimmedName})`
      );
      setEditingBranchId(null);
      setSuccessMsg(`تم تحديث اسم الفرع إلى "${trimmedName}" ومزامنته على جميع الأجهزة بنجاح.`);
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`حفظ تعديل اسم الفرع (${trimmedName})`, () => {
        void executeRename();
      });
      return;
    }

    void executeRename();
  };

  const handleRequestDelete = (branch: SupplyBranch) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!canManageBranches) {
      setErrorMsg('حذف الإدارات مقصور على مدير النظام (Super Admin) فقط.');
      return;
    }
    if (branch.id === DEFAULT_BRANCH_ID || branch.isDefault) {
      setErrorMsg('لا يمكن حذف الإدارة الرئيسية «إدارة تموين مركز المحلة الكبرى»؛ محمية من المسح والحذف.');
      return;
    }
    if (branches.length <= 1) {
      setErrorMsg('لا يمكن حذف جميع الفروع؛ يجب الإبقاء على فرع تمويني واحد على الأقل في المنظومة.');
      return;
    }

    const askConfirm = () => {
      setEditingBranchId(null);
      setConfirmResetId(null);
      setConfirmDeleteId(branch.id);
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`حذف فرع (${branch.name})`, askConfirm);
      return;
    }

    askConfirm();
  };

  const handleConfirmDelete = (branchId: string) => {
    if (!canManageBranches || branchId === DEFAULT_BRANCH_ID) return;
    const branchObj = branches.find((b) => b.id === branchId);
    if (branchObj?.isDefault) return;
    const executeDelete = async () => {
      await onDeleteBranch(branchId);
      setConfirmDeleteId(null);
      setSuccessMsg(
        `تم حذف فرع "${branchObj?.name || branchId}" من قائمة الفروع وقاعدة البيانات بنجاح (يمكن إعادة إضافته من القائمة السريعة بالأعلى).`
      );
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock('تأكيد حذف الفرع التمويني', () => {
        void executeDelete();
      });
      return;
    }

    void executeDelete();
  };

  const handleRequestFactoryReset = (branch: SupplyBranch) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!canManageBranches) {
      setErrorMsg('استعادة ضبط المصنع للبيانات مقصورة على مدير النظام (Super Admin) فقط.');
      return;
    }
    if (!onFactoryResetBranch) return;

    const askConfirm = () => {
      setEditingBranchId(null);
      setConfirmDeleteId(null);
      setConfirmResetId(branch.id);
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`استعادة ضبط المصنع للبيانات داخل (${branch.name})`, askConfirm);
      return;
    }

    askConfirm();
  };

  const handleConfirmFactoryReset = (branch: SupplyBranch) => {
    if (!canManageBranches || !onFactoryResetBranch) return;

    const executeReset = async () => {
      setIsResettingId(branch.id);
      setErrorMsg(null);
      setSuccessMsg(null);
      try {
        const result = await onFactoryResetBranch(branch.id);
        setConfirmResetId(null);
        if (result && result.success === false) {
          setErrorMsg(result.error || 'تعذر تنفيذ استعادة ضبط المصنع لبيانات هذه الإدارة.');
        } else {
          setSuccessMsg(
            result?.message ||
              `تم تنفيذ استعادة ضبط المصنع للبيانات داخل "${branch.name}" فقط (تصفير المخابز والمديونيات وكافة السجلات مع الإبقاء على كامل الأقسام والإدارات الأخرى دون تأثر).`
          );
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'حدث خطأ أثناء تصفير بيانات الإدارة.');
      } finally {
        setIsResettingId(null);
      }
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`تأكيد استعادة ضبط المصنع للبيانات داخل (${branch.name})`, () => {
        void executeReset();
      });
      return;
    }

    void executeReset();
  };

  const modalNode = (
    <div
      data-testid="branches-manager-modal"
      role="dialog"
      aria-modal="true"
      aria-label="قسم إدارة الفروع والإدارات التموينية"
      className="fixed inset-0 z-[9990] bg-[#0A1628]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[#FAF8F5] rounded-3xl shadow-2xl border border-[#D4AF37]/30 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Luxury Midnight Navy & Champagne Gold Header */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#0F1E36] to-[#0D9488] px-6 py-4 text-white flex items-center justify-between border-b border-[#D4AF37]/40 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shadow-inner shrink-0">
              <Building2 className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2 flex-wrap text-white">
                <span>قسم إدارة الفروع والإدارات التموينية</span>
                <span className="text-xs font-extrabold bg-[#D4AF37]/20 text-[#FDE68A] px-2.5 py-0.5 rounded-lg border border-[#D4AF37]/40 tabular-nums">
                  {branches.length} إدارات مسجلة
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-bold mt-0.5 truncate">
                إدارات تموين محافظة الغربية — الإضافة والحذف واستعادة ضبط المصنع للبيانات مقصورة على مدير النظام
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="branches-modal-close-btn"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-rose-500/30 text-white flex items-center justify-center transition-colors border border-white/15 cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Default Quick-Add Gharbia Governorate Supply Administrations (with strikethrough when added) */}
          <div
            data-testid="preset-gharbia-branches-section"
            className="bg-white rounded-2xl border-2 border-[#0D9488]/30 p-4 shadow-xs space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0A1628]">
                    قائمة إدارات تموين محافظة الغربية الـ 11 (إضافة فورية بكامل الأقسام وتصفير المخابز والمديونيات)
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500">
                    اضغط على أي إدارة غير مشطوبة لإضافتها فوراً بنفس هيكل أقسام مركز المحلة الكبرى مع تصفير البيانات — الإدارة المضافة يظهر عليها شطب تلقائي
                  </p>
                </div>
              </div>
              <span className="text-xs font-black text-[#0A1628] bg-[#FAF8F5] border border-slate-200 px-2.5 py-1 rounded-lg tabular-nums">
                {addedPresetsCount} / {CANONICAL_DEFAULT_BRANCHES.length} مضافة
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {CANONICAL_DEFAULT_BRANCHES.map((preset) => {
                const registered = findRegisteredPresetBranch(preset);
                const isAdded = Boolean(registered);
                const isCurrentlyActive = registered?.id === activeBranchId;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`preset-branch-${preset.id}`}
                    data-added={isAdded ? 'true' : 'false'}
                    onClick={() => handleQuickAddPresetBranch(preset)}
                    disabled={!isAdded && !canManageBranches}
                    title={
                      isAdded
                        ? `تمت إضافة ${preset.name} — اضغط للدخول المباشر إليها`
                        : canManageBranches
                        ? `اضغط لإضافة ${preset.name} بكامل الأقسام وتصفير المخابز والمديونيات`
                        : 'إضافة الإدارات مقصورة على مدير النظام فقط'
                    }
                    className={`w-full text-right px-3 py-2 rounded-xl border text-xs font-black transition-all flex items-center justify-between gap-2 ${
                      isAdded
                        ? isCurrentlyActive
                          ? 'bg-emerald-50/90 border-emerald-400 text-slate-500 cursor-pointer hover:bg-emerald-100/80'
                          : 'bg-slate-50 border-slate-200 text-slate-400 cursor-pointer hover:border-teal-400 hover:bg-teal-50/40'
                        : canManageBranches
                        ? 'bg-white border-[#0D9488]/40 text-[#0A1628] hover:bg-[#0D9488] hover:text-white hover:border-[#0D9488] shadow-2xs cursor-pointer'
                        : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
                    }`}
                  >
                    <span
                      className={`truncate ${
                        isAdded ? 'line-through decoration-2 decoration-slate-500 text-slate-500' : ''
                      }`}
                    >
                      {preset.name}
                    </span>
                    {isAdded ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        مُضافة
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-md shrink-0">
                        <Plus className="w-3 h-3" />
                        إضافة
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Branches Grid */}
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="text-sm font-black text-[#0A1628] flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-[#0D9488]" />
                الإدارات والفروع المسجلة حالياً (للتبديل الفوري أو استعادة ضبط المصنع لبيانات الإدارة فقط):
              </h3>
              <span className="text-[11px] font-bold text-[#0D9488] bg-[#0D9488]/10 px-3 py-1 rounded-xl border border-[#0D9488]/20 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                {canManageBranches
                  ? 'صلاحية مدير النظام: الإضافة والتعديل والحذف وتصفير البيانات مفعلة'
                  : 'وضع العرض والتنقل فقط — الإدارة مقصورة على مدير النظام'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {branches.map((branch) => {
                const isActive = branch.id === activeBranchId;
                const isEditing = editingBranchId === branch.id;

                return (
                  <div
                    key={branch.id}
                    data-testid={`branch-card-${branch.id}`}
                    className={`rounded-2xl border-2 p-4 transition-all flex flex-col justify-between ${
                      isActive
                        ? 'border-[#0D9488] bg-gradient-to-br from-[#0D9488]/10 via-white to-[#D4AF37]/10 shadow-md ring-2 ring-[#0D9488]/20'
                        : 'border-slate-200/90 bg-white hover:border-[#0D9488]/50 hover:shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          data-testid={`branch-name-trigger-${branch.id}`}
                          onClick={() => {
                            onSelectBranch(branch.id);
                            onClose();
                          }}
                          className="flex items-center gap-2.5 text-right flex-1 min-w-0 group cursor-pointer focus:outline-none"
                          title={`الضغط للدخول الفوري إلى واجهة ${branch.name} بجميع القوائم والأقسام`}
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black transition-colors ${
                              isActive
                                ? 'bg-[#0A1628] text-[#D4AF37] shadow-md border border-[#D4AF37]/40'
                                : 'bg-[#F1F5F9] text-[#0A1628] group-hover:bg-[#0D9488] group-hover:text-white'
                            }`}
                          >
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-[#0A1628] group-hover:text-[#0D9488] text-sm transition-colors">
                                {branch.name}
                              </h4>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-[#10B981] text-white shadow-xs">
                                  <CheckCircle2 className="w-3 h-3" />
                                  النشط حالياً
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-[#0D9488] shrink-0" />
                              <span className="truncate">
                                {branch.governorateTitle || branch.governorate || 'محافظة الغربية'} -{' '}
                                {branch.directorateTitle ||
                                  branch.directorate ||
                                  'مديرية التموين والتجارة الداخلية بالغربية'}
                              </span>
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          {(branch.id === DEFAULT_BRANCH_ID || branch.isDefault) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              رئيسية
                            </span>
                          )}

                          {canManageBranches && onFactoryResetBranch && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRequestFactoryReset(branch);
                              }}
                              data-testid={`factory-reset-branch-btn-${branch.id}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black transition-colors cursor-pointer whitespace-nowrap"
                              title={`استعادة ضبط المصنع للبيانات فقط داخل ${branch.name} دون التأثير على باقي الإدارات أو هيكل الأقسام`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>ضبط مصنع للبيانات</span>
                            </button>
                          )}

                          {canManageBranches && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditBranch(branch);
                              }}
                              data-testid={`rename-branch-btn-${branch.id}`}
                              className="text-slate-500 hover:text-[#0D9488] p-1.5 rounded-lg hover:bg-[#0D9488]/10 transition-colors cursor-pointer"
                              title="تعديل اسم الفرع"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {canManageBranches &&
                            branches.length > 1 &&
                            branch.id !== DEFAULT_BRANCH_ID &&
                            !branch.isDefault && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRequestDelete(branch);
                                }}
                                data-testid={`delete-branch-btn-${branch.id}`}
                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                title="حذف الفرع"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                        </div>
                      </div>

                      {confirmResetId === branch.id && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                          <p className="text-xs font-black text-amber-950 flex items-start gap-1.5 leading-relaxed">
                            <RotateCcw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <span>
                              تأكيد استعادة ضبط المصنع للبيانات داخل «{branch.name}» فقط؟ سيتم مسح بيانات المخابز والمديونيات والتجار وكافة السجلات داخل هذه الإدارة فقط مع الإبقاء على كامل الأقسام وباقي الإدارات دون أي مساس.
                            </span>
                          </p>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmResetId(null)}
                              disabled={isResettingId === branch.id}
                              className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              data-testid={`confirm-factory-reset-branch-btn-${branch.id}`}
                              onClick={() => handleConfirmFactoryReset(branch)}
                              disabled={isResettingId === branch.id}
                              className="px-3.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs cursor-pointer disabled:opacity-60"
                            >
                              {isResettingId === branch.id ? 'جاري التصفير...' : 'تأكيد تصفير بيانات الإدارة فقط'}
                            </button>
                          </div>
                        </div>
                      )}

                      {confirmDeleteId === branch.id && (
                        <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-300 space-y-2">
                          <p className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            هل أنت متأكد من حذف فرع &quot;{branch.name}&quot; نهائياً؟
                          </p>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              data-testid={`confirm-delete-branch-btn-${branch.id}`}
                              onClick={() => handleConfirmDelete(branch.id)}
                              className="px-3.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs cursor-pointer"
                            >
                              تأكيد الحذف
                            </button>
                          </div>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="mt-3 p-3 rounded-xl bg-[#F1F5F9] border border-[#0D9488]/30 space-y-2.5">
                          <div>
                            <label className="block text-[10px] font-black text-[#0A1628] mb-1">
                              اسم الفرع / الإدارة التموينية
                            </label>
                            <input
                              type="text"
                              data-testid={`rename-branch-input-${branch.id}`}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-black text-[#0A1628] mb-1">
                                المحافظة
                              </label>
                              <input
                                type="text"
                                value={editGovernorate}
                                onChange={(e) => setEditGovernorate(e.target.value)}
                                className="w-full px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-[#0A1628]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-[#0A1628] mb-1">
                                المديرية التموينية
                              </label>
                              <input
                                type="text"
                                value={editDirectorate}
                                onChange={(e) => setEditDirectorate(e.target.value)}
                                className="w-full px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-[#0A1628]"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingBranchId(null)}
                              className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              data-testid={`save-rename-branch-btn-${branch.id}`}
                              onClick={() => handleSaveEditBranch(branch.id)}
                              className="px-3.5 py-1 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-black flex items-center gap-1 shadow-xs cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              حفظ التعديل
                            </button>
                          </div>
                        </div>
                      ) : (
                        branch.description && (
                          <p className="text-xs text-slate-600 font-medium mt-2.5 bg-[#F1F5F9] px-3 py-1.5 rounded-xl border border-slate-200/80">
                            {branch.description}
                          </p>
                        )
                      )}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                        قاعدة بيانات مستقلة بكامل الأقسام
                      </span>

                      {isActive ? (
                        <span className="text-xs font-black text-[#0D9488] px-3 py-1 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/30">
                          أنت تعمل على هذا الفرع الآن
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`switch-to-branch-${branch.id}`}
                          onClick={() => {
                            onSelectBranch(branch.id);
                            onClose();
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-[#0A1628] hover:bg-[#0D9488] text-white text-xs font-black shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                          الدخول على واجهة هذه الإدارة
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Custom Branch Form (Super Admin only) */}
          {canManageBranches ? (
            <form
              onSubmit={handleAddBranch}
              className="bg-white rounded-2xl border border-[#D4AF37]/40 p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#0A1628] text-[#D4AF37] flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[#0A1628]">
                      إضافة فرع أو إدارة تموينية جديدة مخصصة
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500">
                      تنزل الإدارة الجديدة بكامل الأقسام الموجودة بإدارة تموين مركز المحلة الكبرى مع تصفير المخابز والمديونيات
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-black text-[#0A1628] mb-1">
                    اسم الإدارة / الفرع الجديد *
                  </label>
                  <input
                    type="text"
                    data-testid="new-branch-name-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="مثال: إدارة تموين سمنود"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-sm font-bold text-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#0A1628] mb-1">
                    المديرية التابع لها
                  </label>
                  <input
                    type="text"
                    value={newDirectorate}
                    onChange={(e) => setNewDirectorate(e.target.value)}
                    placeholder="مديرية التموين والتجارة الداخلية بالغربية"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-sm font-bold text-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[#0A1628] mb-1">
                    المحافظة
                  </label>
                  <input
                    type="text"
                    value={newGovernorate}
                    onChange={(e) => setNewGovernorate(e.target.value)}
                    placeholder="محافظة الغربية"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-sm font-bold text-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-black text-[#0A1628] mb-1">
                    وصف أو ملاحظات عن نطاق الفرع (اختياري)
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="مثال: قاعدة بيانات مستقلة بكامل الأقسام التموينية"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-sm font-bold text-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>

                <button
                  type="submit"
                  data-testid="create-branch-submit-btn"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#0A1628] to-[#0D9488] hover:from-[#0F1E36] hover:to-[#0F766E] text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 border border-[#D4AF37]/30 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  إنشاء الفرع بكامل الأقسام (بيانات مصفرة)
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-xs font-black text-slate-700 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>إنشاء أو تعديل أو حذف أو استعادة ضبط المصنع لبيانات الإدارات مقصور على مدير النظام (Super Admin) فقط.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};
