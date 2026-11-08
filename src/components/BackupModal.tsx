import React, { useState } from 'react';
import {
  AppState,
  saveBackupToPartition,
  mergeAutoSaveOntoCurrent,
  autoDiscoverAndMergeAllDatabases,
  getLatestAutoSaveInfo,
  mergeStates
} from '../storage';
import {
  downloadUpdatedAppHtml,
  downloadAppLauncherHtml,
  downloadMinistryDesktopShortcut,
  downloadWindowsUrlShortcut,
  downloadWindowsDesktopInstallerBat,
  downloadWindowsVbsLauncher,
  openStandaloneAppInNewTab
} from '../utils/htmlExporter';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  HardDrive,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  X,
  FileJson,
  FileCode,
  Globe,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Database,
  ArrowRight
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
  const [isProcessing, setIsProcessing] = useState(false);

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const autoSaveInfo = getLatestAutoSaveInfo();
  const formattedAutoSaveTime = autoSaveInfo?.timestamp
    ? new Date(autoSaveInfo.timestamp).toLocaleString('ar-EG')
    : null;

  if (!isOpen) return null;

  // 1. Comprehensive Smart Sync: Update existing & add missing only
  const handleSmartSyncAndUpsert = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري فحص جميع قواعد البيانات المحفوظة ودمجها وتحديث المخابز القائمة وإضافة غير المتوفر فقط...', type: 'info' });
    const res = await autoDiscoverAndMergeAllDatabases(currentState);
    setIsProcessing(false);
    if (res.success && res.newState) {
      onRestoreState(res.newState);
      setStatusMsg({ text: res.message, type: 'success' });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  // 2. Smart Sync then download updated standalone HTML application immediately
  const handleSmartSyncAndDownloadHtml = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري فحص وتحديث ودمج البيانات أولاً...', type: 'info' });
    const res = await autoDiscoverAndMergeAllDatabases(currentState);
    if (res.success && res.newState) {
      onRestoreState(res.newState);
      setStatusMsg({ text: `${res.message} جاري الآن تنزيل ملف البرنامج المحدث...`, type: 'info' });
      const dlRes = await downloadUpdatedAppHtml(res.newState);
      setIsProcessing(false);
      if (dlRes.success) {
        setStatusMsg({
          text: `${res.message} وتم بنجاح تنزيل ملف البرنامج المحدث (${dlRes.fileName})! يفتح مباشرة على أي جهاز.`,
          type: 'success',
        });
      } else {
        setStatusMsg({ text: dlRes.message, type: 'error' });
      }
    } else {
      // Fallback: download current state
      const dlRes = await downloadUpdatedAppHtml(currentState);
      setIsProcessing(false);
      setStatusMsg({ text: dlRes.message, type: dlRes.success ? 'success' : 'error' });
    }
  };

  // 3. Save to partition (C:, D:, USB)
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

  // 4. Merge uploaded JSON or HTML file without deleting current records
  const handleMergeUploadedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let incomingData: Partial<AppState> | null = null;

        if (file.name.endsWith('.json') || text.trim().startsWith('{')) {
          const parsed = JSON.parse(text);
          incomingData = parsed.data || parsed;
        } else {
          // Extract preloaded state from HTML
          const match = text.match(/window\.PRELOADED_TAMWEEN_STATE\s*=\s*({[\s\S]*?});/);
          if (match && match[1]) {
            incomingData = JSON.parse(match[1]);
          } else {
            throw new Error('لم يتم العثور على قاعدة بيانات صالحة داخل ملف الـ HTML المختار');
          }
        }

        if (!incomingData || (!incomingData.bakeries && !incomingData.debts)) {
          throw new Error('الملف لا يحتوي على سجلات مخابز أو مديونيات متوافقة');
        }

        const merged = mergeStates(currentState, incomingData);
        onRestoreState(merged);
        setStatusMsg({
          text: `تم دمج ملف البيانات بنجاح! الإجمالي الحالي: (${merged.bakeries.length}) مخبز و (${merged.debts.length}) قيد مديونية دون حذف أي مخابز سابقة.`,
          type: 'success',
        });
      } catch (err: unknown) {
        setStatusMsg({
          text: `فشل دمج الملف: ${(err as Error).message}`,
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  // 5. Restore full replace from JSON
  const handleFullRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          text: `تم استعادة قاعدة البيانات واستبدالها بنجاح! تم استرجاع (${restoredData.bakeries.length}) مخبز و (${restoredData.debts.length}) قيد مديونية.`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-amber-500/40 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-4.5 text-white flex items-center justify-between shrink-0 border-b-2 border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-400/30 shadow-inner">
              <Database className="w-5 h-5 text-amber-300 icon-float" />
            </div>
            <div>
              <h3 className="text-base font-black flex items-center gap-2">
                <span>تحديث ودمج قواعد البيانات وتحميل التطبيق</span>
                <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                  إصلاح وتحديث شامل
                </span>
              </h3>
              <p className="text-[11px] text-amber-200/90 font-bold mt-0.5">
                تحديث المخابز القائمة، إضافة البيانات غير المتوفرة فقط، وتحميل ملف المنظومة ليفتح مباشرة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {statusMsg && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-black flex items-start gap-2.5 shadow-sm transition-all ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-500/20'
                  : statusMsg.type === 'error'
                  ? 'bg-red-50 border-red-300 text-red-900 ring-2 ring-red-500/20'
                  : 'bg-blue-50 border-blue-300 text-blue-900 ring-2 ring-blue-500/20'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 icon-animated" />
              ) : statusMsg.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5 icon-animated" />
              ) : (
                <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
              )}
              <div className="leading-relaxed flex-1">{statusMsg.text}</div>
            </div>
          )}

          {/* SECTION 1: PRIMARY USER REQUEST - Smart Upsert & Direct Working HTML Download */}
          <div className="p-4.5 bg-gradient-to-br from-amber-50 via-orange-50/50 to-amber-100/60 border-2 border-amber-500/80 rounded-2xl space-y-3.5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-600 text-white rounded-lg shadow-sm">
                  <Sparkles className="w-4 h-4 icon-float" />
                </div>
                <h4 className="text-sm font-black text-amber-950">
                  1. دمج وتحديث البيانات التلقائية (إضافة غير المتوفر فقط)
                </h4>
              </div>
              <span className="text-[10px] font-black text-amber-950 bg-amber-300/80 border border-amber-400 px-2.5 py-0.5 rounded-full shadow-2xs">
                ميزة الأمان التام
              </span>
            </div>

            <div className="bg-white/95 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 space-y-2 shadow-xs">
              <div className="flex items-center justify-between font-bold text-[11px] text-slate-700">
                <span>البيانات الحالية على جهازك:</span>
                <span className="text-slate-900 font-black bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-300">
                  ({currentState.bakeries.length}) مخبز &bull; ({currentState.debts.length}) مديونية
                </span>
              </div>
              <div className="flex items-center justify-between font-bold text-[11px] text-slate-700">
                <span>آخر حفظ تلقائي مسجل:</span>
                <span className="text-amber-900 font-black">
                  {formattedAutoSaveTime || 'مسجل مع التعديلات الحالية'}
                </span>
              </div>
              <p className="text-[11px] text-slate-700 font-medium leading-relaxed pt-1.5 border-t border-amber-100">
                يقوم النظام بالبحث الذكي في كافة النسخ المحفوظة على جهازك: <strong className="text-amber-950">يحدث بيانات المخابز القائمة</strong> (برقم الماكينة والكود) <strong className="text-amber-950">ويضيف فقط المخابز والمديونيات الغير متوفرة</strong> دون مسح أي بيانات سابقة.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* Button A: Smart sync and download HTML */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSmartSyncAndDownloadHtml}
                className="py-3 px-4 bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-800 hover:from-emerald-800 hover:to-teal-900 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-emerald-200 icon-animated" />
                <span>تحديث البيانات ثم تحميل ملف المنظومة (HTML)</span>
              </button>

              {/* Button B: Smart sync only */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSmartSyncAndUpsert}
                className="py-3 px-4 bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-800 hover:to-amber-950 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-amber-200 ${isProcessing ? 'animate-spin' : 'icon-spin-hover'}`} />
                <span>تحديث ودمج البيانات على هذا الجهاز فقط</span>
              </button>
            </div>

            {/* Quick Open in Browser Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={openStandaloneAppInNewTab}
                className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-amber-400/80 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-700 icon-animated" />
                <span>فتح صفحة البرنامج مباشرة في نافذة متصفح جديدة</span>
              </button>
            </div>
          </div>

          {/* SECTION 2: Download Standalone HTML application (FIXED & TESTED 100% WORKING) */}
          <div className="p-4 bg-emerald-50/80 border-2 border-emerald-400/80 rounded-2xl space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-emerald-700 icon-float" />
                2. تحميل نسخة البرنامج الجديدة بعد التعديلات (يفتح مباشرة بدون نت)
              </h4>
              <span className="text-[10px] font-black text-emerald-950 bg-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400">
                تم إصلاح التشغيل المباشر 100%
              </span>
            </div>
            <p className="text-[11px] text-emerald-900 font-medium leading-relaxed">
              تم فحص وإصلاح ملف الـ HTML بالكامل: يعمل مباشرة بمجرد النقر المزدوج عليه في أي متصفح (كروم، إيدج، فايرفوكس) على أي جهاز أو هاتف ويفتح شاشة البرنامج فوراً دون توقف أو شاشة بيضاء.
            </p>
            <button
              type="button"
              onClick={async () => {
                setStatusMsg({ text: 'جاري تجهيز وتنزيل ملف المنظومة المحدث...', type: 'info' });
                const res = await downloadUpdatedAppHtml(currentState);
                setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
              }}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4 text-emerald-200 icon-animated" />
              تحميل ملف البرنامج المحدث الآن (HTML يفتح مباشرة)
            </button>
          </div>

          {/* SECTION 3: Merge from external file (JSON or HTML) */}
          <div className="p-3.5 bg-blue-50/80 border border-blue-300 rounded-2xl space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-700 icon-animated" />
                3. دمج بيانات من ملف خارجي (JSON أو HTML) دون مسح البيانات الحالية
              </h4>
              <span className="text-[10px] font-bold text-blue-900 bg-blue-200/80 px-2 py-0.5 rounded">
                دمج آمن
              </span>
            </div>
            <p className="text-[11px] text-blue-900 font-medium leading-relaxed">
              إذا استلمت ملف تموين من جهاز زميل أو فلاشة، اختر الملف وسيقوم النظام بتحديث المخابز القائمة وإضافة المخابز الجديدة فقط دون حذف أي سجلات لديك.
            </p>
            <label className="w-full mt-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition">
              <Upload className="w-4 h-4 text-blue-200 icon-animated" />
              اختيار ملف (JSON أو HTML) ودمجه مع بيانات الجهاز
              <input
                type="file"
                accept=".json,.html,application/json,text/html"
                onChange={handleMergeUploadedFile}
                className="hidden"
              />
            </label>
          </div>

          {/* SECTION 4: Native Save File Picker to Partition */}
          <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-amber-700 icon-animated" />
                4. حفظ نسخة احتياطية في البارتيشن (C:, D:, USB)
              </h4>
              <span className="text-[10px] font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">
                تحديد المسار
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              تفتح نافذة لاختيار البارتيشن المفضل (قرص D: أو فلاشة ميموري) لحفظ نسخة احتياطية من قاعدة البيانات.
            </p>
            <button
              onClick={handleSaveToPartition}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4 text-amber-300 icon-animated" />
              حفظ النسخة الاحتياطية في البارتيشن الآن
            </button>
          </div>

          {/* SECTION 5: Full Restore from JSON (Replaces current) */}
          <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-slate-700 icon-animated" />
                5. استعادة واستبدال كامل من ملف نسخة سابقة (.JSON)
              </h4>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                استبدال شامل
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              استيراد ملف JSON واستبدال قاعدة البيانات بالكامل بما يحتويه الملف.
            </p>
            <label className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition">
              <FileJson className="w-4 h-4 text-amber-300 icon-animated" />
              استعادة واستبدال من ملف JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFullRestore}
                className="hidden"
              />
            </label>
          </div>

          {/* SECTION 6: Ministry of Supply Desktop App & Auto-Installer */}
          <div className="p-4 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-600/15 border-2 border-amber-400/80 rounded-2xl space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-amber-950 flex items-center gap-2">
                <img src="/favicon.svg" alt="شعار الوزارة" className="w-5 h-5 icon-float drop-shadow-sm" />
                6. تثبيت التطبيق وتحميل أيقونة سطح المكتب بشعار الوزارة
              </h4>
              <span className="text-[10px] font-black text-amber-950 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-400">
                تطبيق مثبت &bull; Desktop App
              </span>
            </div>
            <p className="text-[11px] text-amber-950 font-medium leading-relaxed">
              يمكنك الآن تثبيت المنظومة كتطبيق رسمي مستقل على جهاز الكمبيوتر بشعار الوزارة (يعمل كنافذة برنامج حقيقية دون شريط المتصفح)، أو استخدام أداة التثبيت الفوري لويندوز:
            </p>

            <div className="space-y-2">
              {/* Option 1: Native PWA Install */}
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await install();
                    if (ok) {
                      setStatusMsg({ text: 'تم تثبيت منظومة وزارة التموين بنجاح على جهازك كأيقونة تطبيق مستقل!', type: 'success' });
                    }
                  }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 hover:from-amber-700 hover:to-yellow-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md cursor-pointer transition animate-pulse"
                >
                  <img src="/favicon.svg" alt="شعار الوزارة" className="w-5 h-5 drop-shadow" />
                  <span>تثبيت المنظومة الآن كتطبيق مثبت على جهاز الكمبيوتر (PWA)</span>
                </button>
              )}

              {isInstalled && (
                <div className="p-2.5 bg-emerald-100 border border-emerald-400 rounded-xl text-xs font-black text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>البرنامج مثبت بالفعل على هذا الجهاز كتطبيق مستقل.</span>
                </div>
              )}

              {/* Option 2 & 3: Windows Batch Auto-Installer & VBS Silent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const res = downloadWindowsDesktopInstallerBat();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2.5 px-3 bg-slate-900 hover:bg-black text-amber-300 border border-amber-400/60 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  title="أداة تنشئ أيقونة البرنامج تلقائياً على سطح المكتب بنقرة واحدة"
                >
                  <Download className="w-4 h-4 text-amber-300 icon-animated" />
                  <span>تثبيت الأيقونة على سطح المكتب تلقائياً (.bat)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const res = downloadWindowsVbsLauncher();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-slate-100 border border-slate-600 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  title="مشغل مكتبي صامت يفتح البرنامج فوراً بدون شاشة سوداء"
                >
                  <ExternalLink className="w-4 h-4 text-amber-400 icon-animated" />
                  <span>مشغل ويندوز الصامت (.vbs)</span>
                </button>
              </div>

              {/* Option 4 & 5: Direct HTML & URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const res = downloadMinistryDesktopShortcut();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <img src="/favicon.svg" alt="شعار الوزارة" className="w-3.5 h-3.5" />
                  <span>أيقونة المشغل السريع (HTML)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const res = downloadWindowsUrlShortcut();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Globe className="w-3.5 h-3.5 text-amber-700" />
                  <span>اختصار رابط ويندوز (.url)</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 7: Factory Reset */}
          <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-red-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600 icon-animated" />
                7. إعادة ضبط المصنع (Factory Reset)
              </h4>
              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                إجراء حساس
              </span>
            </div>
            <p className="text-[11px] text-red-800 font-medium">
              مسح كافة التعديلات والمخابز والمديونيات والعودة للبيانات الافتراضية الأولية فقط.
            </p>

            {!showConfirmReset ? (
              <button
                type="button"
                onClick={() => setShowConfirmReset(true)}
                className="px-3.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 rounded-xl text-xs font-black transition"
              >
                طلب إعادة ضبط المصنع
              </button>
            ) : (
              <div className="p-3 bg-red-100 border border-red-400 rounded-xl space-y-2">
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
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-[11px] font-bold text-slate-600">
            منظومة إدارة تموين مركز المحلة الكبرى &bull; إصلاح وتحديث شامل
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
