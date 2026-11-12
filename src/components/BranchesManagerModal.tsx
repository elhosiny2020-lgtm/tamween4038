import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowLeftRight,
  ShieldCheck,
  X,
  Database,
  AlertTriangle,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { SupplyBranch } from '../types';
import {
  addSupplyBranch,
  deleteSupplyBranch,
  getBranchSummaryStats,
} from '../storage';

interface BranchesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: SupplyBranch[];
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  onBranchesChange: (updatedBranches: SupplyBranch[], nextActiveBranchId: string) => void;
}

const QUICK_SUGGESTED_BRANCHES = [
  'إدارة تموين مركز المحلة الكبرى',
  'إدارة تموين سمنود',
  'إدارة تموين أول المحلة الكبرى',
  'إدارة تموين ثان المحلة الكبرى',
  'إدارة تموين زفتى',
  'إدارة تموين طنطا',
  'إدارة تموين كفر الزيات',
  'إدارة تموين السنطة',
  'إدارة تموين قطور',
  'إدارة تموين بسيون',
];

export const BranchesManagerModal: React.FC<BranchesManagerModalProps> = ({
  isOpen,
  onClose,
  branches,
  activeBranchId,
  onSelectBranch,
  onBranchesChange,
}) => {
  const [newBranchName, setNewBranchName] = useState('');
  const [newGovernorate, setNewGovernorate] = useState('محافظة الغربية');
  const [newDirectorate, setNewDirectorate] = useState('مديرية التموين والتجارة الداخلية بالغربية');
  const [newDescription, setNewDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleAddBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) {
      setStatusBanner({ type: 'error', text: 'يرجى إدخال اسم الإدارة التموينية / الفرع الجديد.' });
      return;
    }
    if (branches.some((b) => b.name.trim() === trimmed)) {
      setStatusBanner({ type: 'error', text: 'هذه الإدارة التموينية مضافة بالفعل في قائمة الفروع.' });
      return;
    }

    const created = addSupplyBranch(trimmed, newDirectorate, newGovernorate, newDescription);
    const updatedList = [...branches, created];
    onBranchesChange(updatedList, activeBranchId);
    setNewBranchName('');
    setNewDescription('');
    setStatusBanner({
      type: 'success',
      text: `تمت إضافة "${created.name}" بقاعدة بيانات مستقلة ومنفصلة تماماً عن باقي الإدارات.`,
    });
  };

  const handleConfirmDelete = (branchId: string) => {
    const res = deleteSupplyBranch(branchId);
    setConfirmDeleteId(null);
    if (!res.success) {
      setStatusBanner({ type: 'error', text: res.message });
      return;
    }
    onBranchesChange(res.branches, res.nextActiveBranchId);
    setStatusBanner({ type: 'success', text: res.message });
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-indigo-200 w-full max-w-4xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-5 flex items-center justify-between border-b-4 border-amber-500">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-inner">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                قسم إدارة الفروع والإدارات التموينية المستقلة
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-md bg-amber-500 text-slate-950">
                  {branches.length} إدارات مسجلة
                </span>
              </h2>
              <p className="text-xs text-indigo-200 font-bold mt-0.5">
                إضافة وحذف الإدارات التموينية والتحكم في الفروع — كل إدارة منفصلة تماماً في البيانات والمخابز والمديونيات
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[82vh] overflow-y-auto space-y-6 bg-slate-50">
          {/* Strict Isolation Notice */}
          <div className="bg-emerald-950 text-emerald-100 rounded-2xl p-4 border border-emerald-700/60 flex items-start gap-3 shadow-sm">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed font-bold">
              <span className="text-emerald-300 font-black block text-sm mb-0.5">
                عزل كامل للبيانات بين جميع الإدارات التموينية (100% Data Isolation):
              </span>
              جميع الإدارات منفصلة في المنظومة عن بعضها في بيانات المخابز، الحصص، المديونيات، القرى، والتقارير. لا يظهر أي سجل أو معلومة لأي إدارة أخرى إلا إذا اخترت الدخول على واجهة تلك الإدارة.
            </div>
          </div>

          {statusBanner && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-black flex items-center justify-between ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <span>{statusBanner.text}</span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-slate-500 hover:text-slate-900 font-black px-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Add New Branch Section */}
          <form
            onSubmit={handleAddBranch}
            className="bg-white rounded-2xl p-5 border-2 border-indigo-100 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                إضافة إدارة تموينية / فرع جديد للمنظومة
              </h3>
              <span className="text-[11px] font-bold text-slate-500">
                يمكنك التحكم في عدد الإدارات في أي وقت بالزيادة أو الحذف
              </span>
            </div>

            {/* Quick suggestions */}
            <div>
              <label className="block text-[11px] font-black text-slate-600 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                اختيار سريع لاسم إدارة مقترحة (أو اكتب أي اسم إدارة بالأسفل):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTED_BRANCHES.map((suggestion) => {
                  const alreadyExists = branches.some((b) => b.name.trim() === suggestion);
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={alreadyExists}
                      onClick={() => setNewBranchName(suggestion)}
                      className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border transition ${
                        alreadyExists
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                          : newBranchName === suggestion
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm cursor-pointer'
                          : 'bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 border-indigo-200 cursor-pointer'
                      }`}
                    >
                      {suggestion} {alreadyExists ? '(مضافة)' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-slate-700 mb-1">
                  اسم الإدارة التموينية / الفرع الجديد <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="مثال: إدارة تموين سمنود / إدارة تموين زفتى / إدارة تموين طنطا..."
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none text-sm font-black text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">المحافظة</label>
                <input
                  type="text"
                  value={newGovernorate}
                  onChange={(e) => setNewGovernorate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">المديرية التموينية</label>
                <input
                  type="text"
                  value={newDirectorate}
                  onChange={(e) => setNewDirectorate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">وصف / ملاحظة للفرع (اختياري)</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="وصف مختصر للإدارة..."
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-none text-xs font-bold text-slate-800"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-gradient-to-l from-indigo-700 to-indigo-600 hover:from-indigo-800 hover:to-indigo-700 text-white font-black text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                إضافة الإدارة التموينية الآن
              </button>
            </div>
          </form>

          {/* List of Existing Branches */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-700" />
                الإدارات التموينية والفروع المتاحة في المنظومة ({branches.length})
              </span>
              <span className="text-xs font-bold text-indigo-700">
                اضغط «الدخول على واجهة الإدارة» لفتح بياناتها المستقلة
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {branches.map((branch) => {
                const isActive = branch.id === activeBranchId;
                const stats = getBranchSummaryStats(branch.id);
                const isConfirmingDelete = confirmDeleteId === branch.id;

                return (
                  <div
                    key={branch.id}
                    className={`rounded-2xl p-4 border-2 transition flex flex-col justify-between gap-3 ${
                      isActive
                        ? 'bg-indigo-950 text-white border-amber-400 shadow-lg ring-2 ring-amber-400/30'
                        : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300 shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black ${
                              isActive
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            <MapPin className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-black text-base leading-snug">{branch.name}</h4>
                            <p
                              className={`text-[11px] font-bold ${
                                isActive ? 'text-indigo-200' : 'text-slate-500'
                              }`}
                            >
                              {branch.directorateTitle} — {branch.governorateTitle}
                            </p>
                          </div>
                        </div>

                        {isActive && (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[11px] flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            الواجهة النشطة حالياً
                          </span>
                        )}
                      </div>

                      {/* Isolated Stats */}
                      <div
                        className={`mt-3 grid grid-cols-3 gap-2 p-2.5 rounded-xl text-center border ${
                          isActive
                            ? 'bg-slate-900/90 border-indigo-800 text-white'
                            : 'bg-slate-50 border-slate-200/80 text-slate-800'
                        }`}
                      >
                        <div>
                          <div
                            className={`text-[10px] font-bold ${
                              isActive ? 'text-indigo-300' : 'text-slate-500'
                            }`}
                          >
                            المخابز المسجلة
                          </div>
                          <div className="text-sm font-black mt-0.5">{stats.bakeriesCount} مخبز</div>
                        </div>
                        <div className="border-x border-slate-500/20">
                          <div
                            className={`text-[10px] font-bold ${
                              isActive ? 'text-indigo-300' : 'text-slate-500'
                            }`}
                          >
                            قيود المديونيات
                          </div>
                          <div className="text-sm font-black mt-0.5">{stats.debtsCount} قيد</div>
                        </div>
                        <div>
                          <div
                            className={`text-[10px] font-bold ${
                              isActive ? 'text-indigo-300' : 'text-slate-500'
                            }`}
                          >
                            القرى والوحدات
                          </div>
                          <div className="text-sm font-black mt-0.5">{stats.villagesCount} قطاع</div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {isConfirmingDelete ? (
                      <div className="bg-rose-950 text-white p-3 rounded-xl border border-rose-500 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-rose-200">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          هل أنت متأكد من حذف «{branch.name}» وكافة بياناته المستقلة نهائياً؟
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(branch.id)}
                            className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black cursor-pointer"
                          >
                            نعم، احذف الفرع نهائياً
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectBranch(branch.id);
                            onClose();
                          }}
                          className={`flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                            isActive
                              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-sm'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                          }`}
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                          {isActive ? 'مفتوحة حالياً (تأكيد الدخول)' : 'الدخول على واجهة هذه الإدارة'}
                        </button>

                        {branches.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(branch.id)}
                            className={`p-2 rounded-xl border transition cursor-pointer ${
                              isActive
                                ? 'bg-rose-500/20 border-rose-400/40 text-rose-200 hover:bg-rose-600 hover:text-white'
                                : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white'
                            }`}
                            title="حذف هذه الإدارة التموينية"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-600">
            الإدارة المختارة حالياً:{' '}
            <span className="font-black text-indigo-900">
              {branches.find((b) => b.id === activeBranchId)?.name || ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition cursor-pointer"
          >
            إغلاق نافذة الفروع
          </button>
        </div>
      </div>
    </div>
  );
};
