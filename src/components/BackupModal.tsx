import React, { useState } from 'react';
import { AppState, saveBackupToPartition } from '../storage';
import {
  HardDrive,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  X,
  FileJson
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
  onRestoreState: (restored: AppState) => void;
  onFactoryReset: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  currentState,
  onRestoreState,
  onFactoryReset,
}) => {
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  if (!isOpen) return null;

  const handleSaveToPartition = async () => {
    setStatusMsg({ text: 'جاري فتح نافذة النظام لاختيار البارتيشن وحفظ الملف...', type: 'info' });
    const backupPayload = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      governorate: currentState.systemConfig.governorateTitle,
      directorate: currentState.systemConfig.directorateTitle,
      administration: currentState.systemConfig.administrationTitle,
      data: {
        bakeries: currentState.bakeries,
        debts: currentState.debts,
        villages: currentState.villages,
        issuingEntities: currentState.issuingEntities,
        violationTypes: currentState.violationTypes,
        activityStatuses: currentState.activityStatuses,
        columnTitles: currentState.columnTitles,
        systemConfig: currentState.systemConfig,
        users: currentState.users,
      },
    };

    const res = await saveBackupToPartition(backupPayload);
    if (res.success) {
      setStatusMsg({ text: res.message, type: 'success' });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !parsed.data) {
          throw new Error('الملف غير مطابق لبنية النسخ الاحتياطية المعتمدة');
        }

        const restoredData: AppState = {
          bakeries: parsed.data.bakeries || [],
          debts: parsed.data.debts || [],
          villages: parsed.data.villages || currentState.villages,
          activityStatuses: parsed.data.activityStatuses || currentState.activityStatuses,
          issuingEntities: parsed.data.issuingEntities || currentState.issuingEntities,
          violationTypes: parsed.data.violationTypes || currentState.violationTypes,
          columnTitles: parsed.data.columnTitles || currentState.columnTitles,
          systemConfig: parsed.data.systemConfig || currentState.systemConfig,
          users: parsed.data.users || currentState.users,
          currentUser: currentState.currentUser,
        };

        onRestoreState(restoredData);
        setStatusMsg({
          text: `تم استعادة قاعدة البيانات بنجاح! تم استرجاع (${restoredData.bakeries.length}) مخبز و (${restoredData.debts.length}) قيد مديونية.`,
          type: 'success',
        });
      } catch (err: unknown) {
        setStatusMsg({
          text: `فشل استرجاع الملف: ${(err as Error).message}`,
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    onFactoryReset();
    setShowConfirmReset(false);
    setStatusMsg({
      text: 'تمت إعادة ضبط المصنع ومسح كافة البيانات واستعادة الحالة الأولية بنجاح.',
      type: 'success',
    });
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600/40 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-900 to-slate-900 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="text-base font-black">النسخ الاحتياطي واختيار البارتيشن والاستعادة</h3>
              <p className="text-[11px] text-amber-100 font-bold">
                حفظ قاعدة البيانات في البارتيشن المفضل (C:, D:, E: أو فلاشة USB)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {statusMsg && (
            <div
              className={`p-3 rounded-xl border text-xs font-black flex items-center gap-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : statusMsg.type === 'error'
                  ? 'bg-red-50 border-red-300 text-red-800'
                  : 'bg-blue-50 border-blue-300 text-blue-800'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Option 1: Native Save File Picker */}
          <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-amber-700" />
                1. حفظ نسخة احتياطية في البارتيشن (C:, D:, E:)
              </h4>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded">
                تحديد المسار بنفسك
              </span>
            </div>
            <p className="text-[11px] text-amber-900 font-medium">
              تفتح لك نافذة جهاز الكمبيوتر لاختيار القرص (C:, D: أو فلاش ميموري) والمجلد المطلوب حفظ الملف فيه بأمان تام.
            </p>
            <button
              onClick={handleSaveToPartition}
              className="w-full mt-1 py-2.5 px-4 bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-800 hover:to-amber-950 text-white rounded-lg text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4" />
              حفظ النسخة الاحتياطية في البارتيشن الآن
            </button>
          </div>

          {/* Option 2: Restore from JSON */}
          <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl space-y-2">
            <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-slate-700" />
              2. استعادة قاعدة البيانات من ملف نسخة سابقة (.JSON)
            </h4>
            <p className="text-[11px] text-slate-600 font-medium">
              استيراد ملف قاعدة البيانات المحفوظ مسبقاً وتطبيقه على المنظومة فورياً.
            </p>
            <label className="w-full mt-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black shadow-sm flex items-center justify-center gap-2 cursor-pointer transition">
              <FileJson className="w-4 h-4 text-amber-300" />
              اختيار واستعادة ملف النسخة الاحتياطية
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Option 3: Factory Reset with Confirmation */}
          <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-red-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                3. إعادة ضبط المصنع (Factory Reset)
              </h4>
              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                إجراء خطير
              </span>
            </div>
            <p className="text-[11px] text-red-800 font-medium">
              مسح كافة التعديلات والمخابز والمديونيات والعودة للبيانات الافتراضية الأولية فقط.
            </p>

            {!showConfirmReset ? (
              <button
                type="button"
                onClick={() => setShowConfirmReset(true)}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 rounded-lg text-xs font-black transition"
              >
                طلب إعادة ضبط المصنع
              </button>
            ) : (
              <div className="p-3 bg-red-100 border border-red-400 rounded-lg space-y-2">
                <p className="text-xs font-black text-red-950">
                  هل أنت متأكد تماماً؟ سيتم مسح كافة البيانات الحالية نهائياً!
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReset}
                    className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-black"
                  >
                    نعم، امسح كل شيء وأعد للمصنع
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                  >
                    تراجع
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
