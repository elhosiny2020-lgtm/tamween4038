import React, { useState } from 'react';
import { SupplyBranch } from '../types';
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
} from 'lucide-react';

interface BranchesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: SupplyBranch[];
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  onCreateBranch: (name: string, directorate: string, governorate: string, description: string) => void;
  onRenameBranch: (branchId: string, name: string, directorate: string, governorate: string, description: string) => void;
  onDeleteBranch: (branchId: string) => void;
  isVaultUnlocked: boolean;
  onRequireVaultUnlock: (label: string, onUnlocked: () => void) => void;
}

export const BranchesManagerModal: React.FC<BranchesManagerModalProps> = ({
  isOpen,
  onClose,
  branches,
  activeBranchId,
  onSelectBranch,
  onCreateBranch,
  onRenameBranch,
  onDeleteBranch,
  isVaultUnlocked,
  onRequireVaultUnlock,
}) => {
  const [newName, setNewName] = useState('');
  const [newDirectorate, setNewDirectorate] = useState('مديرية التموين والتجارة الداخلية بالغربية');
  const [newGovernorate, setNewGovernorate] = useState('محافظة الغربية');
  const [newDescription, setNewDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inline editing state for renaming/editing branch
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDirectorate, setEditDirectorate] = useState('');
  const [editGovernorate, setEditGovernorate] = useState('');
  const [editDescription, setEditDescription] = useState('');

  if (!isOpen) return null;

  const handleAddBranch = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setErrorMsg('يرجى إدخال اسم الفرع أو الإدارة التموينية الجديدة.');
      return;
    }

    const exists = branches.some((b) => b.name.trim() === trimmedName);
    if (exists) {
      setErrorMsg('يوجد فرع بنفس هذا الاسم مسجل بالفعل.');
      return;
    }

    const executeCreate = () => {
      onCreateBranch(
        trimmedName,
        newDirectorate.trim() || 'مديرية التموين والتجارة الداخلية بالغربية',
        newGovernorate.trim() || 'محافظة الغربية',
        newDescription.trim() || `قاعدة بيانات مستقلة (${trimmedName})`
      );
      setNewName('');
      setNewDescription('');
      setSuccessMsg(`تم إنشاء فرع "${trimmedName}" وتخصيص قاعدة بيانات مستقلة له بنجاح.`);
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`إضافة فرع جديد (${trimmedName})`, executeCreate);
      return;
    }

    executeCreate();
  };

  const handleStartEditBranch = (branch: SupplyBranch) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const openEditor = () => {
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

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setErrorMsg('اسم الفرع لا يمكن أن يكون فارغاً.');
      return;
    }

    const duplicate = branches.some(
      (b) => b.id !== branchId && b.name.trim() === trimmedName
    );
    if (duplicate) {
      setErrorMsg('يوجد فرع آخر مسجل بنفس هذا الاسم.');
      return;
    }

    const executeRename = () => {
      onRenameBranch(
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
      onRequireVaultUnlock(`حفظ تعديل اسم الفرع (${trimmedName})`, executeRename);
      return;
    }

    executeRename();
  };

  const handleRequestDelete = (branch: SupplyBranch) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (branches.length <= 1) {
      setErrorMsg('لا يمكن حذف جميع الفروع؛ يجب الإبقاء على فرع تمويني واحد على الأقل في المنظومة.');
      return;
    }

    const askConfirm = () => {
      setEditingBranchId(null);
      setConfirmDeleteId(branch.id);
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock(`حذف فرع (${branch.name})`, askConfirm);
      return;
    }

    askConfirm();
  };

  const handleConfirmDelete = (branchId: string) => {
    const branchObj = branches.find((b) => b.id === branchId);
    const executeDelete = () => {
      onDeleteBranch(branchId);
      setConfirmDeleteId(null);
      setSuccessMsg(
        `تم حذف فرع "${branchObj?.name || branchId}" نهائياً من قائمة الفروع وقاعدة البيانات بنجاح.`
      );
    };

    if (!isVaultUnlocked) {
      onRequireVaultUnlock('تأكيد حذف الفرع التمويني', executeDelete);
      return;
    }

    executeDelete();
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-[#0A1628]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-[#FAF8F5] rounded-3xl shadow-2xl border border-[#D4AF37]/30 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Luxury Midnight Navy & Champagne Gold Header */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#0F1E36] to-[#0D9488] px-6 py-5 text-white flex items-center justify-between border-b border-[#D4AF37]/40">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shadow-inner">
              <Building2 className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2 text-white">
                قسم إدارة الفروع والإدارات التموينية
                <span className="text-xs font-extrabold bg-[#D4AF37]/20 text-[#FDE68A] px-2.5 py-0.5 rounded-full border border-[#D4AF37]/40">
                  {branches.length} فروع مسجلة
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-bold mt-0.5">
                التنقل بين الفروع متاح مباشرة على الواجهة — الإضافة أو التعديل أو الحذف محمي ببيانات الاعتماد
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-rose-500/30 text-white flex items-center justify-center transition-colors border border-white/15 cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
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

          {/* Active Branches Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-[#0A1628] flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-[#0D9488]" />
                اختر الإدارة أو الفرع للتبديل الفوري (أو اضغط تعديل لتغيير اسم الفرع):
              </h3>
              <span className="text-[11px] font-bold text-[#0D9488] bg-[#0D9488]/10 px-3 py-1 rounded-xl border border-[#0D9488]/20 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                الإضافة والتعديل والحذف محمية بـ Username & Password
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {branches.map((branch) => {
                const isActive = branch.id === activeBranchId;
                const isEditing = editingBranchId === branch.id;

                return (
                  <div
                    key={branch.id}
                    data-testid={`branch-card-${branch.id}`}
                    className={`rounded-2xl border-2 p-4 transition-all flex flex-col justify-between ${
                      isActive
                        ? 'border-[#0D9488] bg-gradient-to-br from-[#0D9488]/10 via-white to-[#D4AF37]/10 shadow-lg ring-2 ring-[#0D9488]/20'
                        : 'border-slate-200/90 bg-white hover:border-[#0D9488]/50 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black ${
                              isActive
                                ? 'bg-[#0A1628] text-[#D4AF37] shadow-md border border-[#D4AF37]/40'
                                : 'bg-[#F1F5F9] text-[#0A1628]'
                            }`}
                          >
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-[#0A1628] text-sm">{branch.name}</h4>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#10B981] text-white shadow-xs">
                                  <CheckCircle2 className="w-3 h-3" />
                                  الفرع النشط حالياً
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-[#0D9488]" />
                              {branch.governorateTitle || branch.governorate || 'محافظة الغربية'} -{' '}
                              {branch.directorateTitle ||
                                branch.directorate ||
                                'مديرية التموين والتجارة الداخلية بالغربية'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditBranch(branch)}
                            data-testid={`rename-branch-btn-${branch.id}`}
                            className="text-slate-500 hover:text-[#0D9488] p-1.5 rounded-lg hover:bg-[#0D9488]/10 transition-colors cursor-pointer"
                            title="تعديل اسم الفرع (يتطلب Username & Password)"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {branches.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRequestDelete(branch)}
                              data-testid={`delete-branch-btn-${branch.id}`}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="حذف الفرع (يتطلب Username & Password)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

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

                    <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                        قاعدة بيانات مستقلة ومزامنة لحظية
                      </span>

                      {isActive ? (
                        <span className="text-xs font-black text-[#0D9488] px-3 py-1.5 rounded-xl bg-[#0D9488]/10 border border-[#0D9488]/30">
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

          {/* Add New Branch Form */}
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
                    إضافة فرع أو إدارة تموينية جديدة بنسخة مستقلة
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500">
                    يتطلب إدخال Username & Password عند الضغط على زر الإنشاء
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
                  placeholder="مثال: قاعدة بيانات مخبز بلدي ومديونيات وسجل المستخدمين الخاصة بهذا الفرع"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-[#FAF8F5] text-sm font-bold text-[#0A1628] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                />
              </div>

              <button
                type="submit"
                data-testid="create-branch-submit-btn"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#0A1628] to-[#0D9488] hover:from-[#0F1E36] hover:to-[#0F766E] text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 border border-[#D4AF37]/30 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                إنشاء الفرع وتفعيل نسخته المستقلة
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
