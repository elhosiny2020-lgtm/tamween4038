import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import {
  executePublishProcess,
  getLastConfirmedPublishInfo,
  PublishProgressState,
  PublishResult,
} from '../services/publishService';
import {
  Globe,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  ExternalLink,
  Copy,
  Check,
  X,
  FileCheck,
  Server,
  Layers,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
  currentState,
}) => {
  const [publishState, setPublishState] = useState<PublishProgressState>({
    stage: 'IDLE',
    stageNameArabic: 'جاهز للنشر',
    progressPercent: 0,
    statusMessage: 'اضغط على زر "بدء النشر الآن" لنشر أحدث البيانات والملفات على السحابة.',
    isDelayed: false,
  });

  const [lastPublished, setLastPublished] = useState<PublishResult | null>(() =>
    getLastConfirmedPublishInfo()
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setLastPublished(getLastConfirmedPublishInfo());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isPublishing =
    publishState.stage === 'STARTING' ||
    publishState.stage === 'PREPARING' ||
    publishState.stage === 'UPLOADING' ||
    publishState.stage === 'VERIFYING';

  const handleStartPublish = async () => {
    if (isPublishing) return; // double-click protection

    try {
      const result = await executePublishProcess(currentState, (progress) => {
        setPublishState(progress);
      });
      setLastPublished(result);
    } catch (err: any) {
      // error state is already set by publishService
      console.error('Publish execution caught error in modal:', err);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard?.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const stagesList = [
    { key: 'STARTING', label: '1. بدء النشر وفحص الاتصال' },
    { key: 'PREPARING', label: '2. تجهيز الملفات وقاعدة البيانات' },
    { key: 'UPLOADING', label: '3. رفع الملفات وتأكيد المزامنة' },
    { key: 'VERIFYING', label: '4. إتمام النشر والتحقق من الرابط' },
  ];

  const getStageStatus = (stepKey: string, stepIndex: number) => {
    if (publishState.stage === 'ERROR') return 'error';
    if (publishState.stage === 'SUCCESS') return 'completed';
    const currentStepIndex =
      publishState.stage === 'STARTING'
        ? 0
        : publishState.stage === 'PREPARING'
        ? 1
        : publishState.stage === 'UPLOADING'
        ? 2
        : publishState.stage === 'VERIFYING'
        ? 3
        : -1;

    if (currentStepIndex > stepIndex) return 'completed';
    if (currentStepIndex === stepIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border-2 border-amber-500/70 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col text-right">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-b border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 border border-amber-400/50 rounded-xl text-amber-300">
              <UploadCloud className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-amber-200">
                نشر المنظومة والتحديثات السحابية (Publish Engine)
              </h3>
              <p className="text-xs text-slate-300 font-bold">
                إدارة تموين مركز المحلة الكبرى • تحديث ونشر فوري مع التحقق من الرابط
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isPublishing}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Quick Notice Banner */}
          <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <Server className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                السجلات الجاهزة للنشر: <strong>{currentState.bakeries.length}</strong> مخبز •{' '}
                <strong>{currentState.debts.length}</strong> قيد مديونية
              </span>
            </div>
            <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
              Cloud Ready
            </span>
          </div>

          {/* Progress Bar & Status */}
          <div className="p-4 bg-slate-950/60 border border-amber-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-amber-300">{publishState.stageNameArabic}</span>
              <span className="text-amber-400 num-enlarged">{publishState.progressPercent}%</span>
            </div>

            {/* Progress Bar Track */}
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  publishState.stage === 'ERROR'
                    ? 'bg-red-500'
                    : publishState.stage === 'SUCCESS'
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-amber-500 to-emerald-400 animate-pulse'
                }`}
                style={{ width: `${publishState.progressPercent}%` }}
              />
            </div>

            {/* Status Message */}
            <p
              className={`text-xs font-bold ${
                publishState.stage === 'ERROR'
                  ? 'text-red-400'
                  : publishState.stage === 'SUCCESS'
                  ? 'text-emerald-300'
                  : 'text-slate-300'
              }`}
            >
              {publishState.statusMessage}
            </p>

            {/* Delayed message indicator if taking more than expected */}
            {publishState.isDelayed && (
              <div className="p-2.5 bg-amber-950/50 border border-amber-500/50 rounded-lg text-xs text-amber-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                <span>
                  العملية جارية... نظراً لحجم البيانات، يتم التحقق وتأكيد المزامنة مع الخادم السحابي دون انقطاع.
                </span>
              </div>
            )}
          </div>

          {/* 4 Stages Visual Checklist */}
          <div className="space-y-2">
            <h4 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              مراحل النشر المعتمدة (Execution Stages)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stagesList.map((st, idx) => {
                const status = getStageStatus(st.key, idx);
                return (
                  <div
                    key={st.key}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                      status === 'completed'
                        ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300'
                        : status === 'active'
                        ? 'bg-amber-950/40 border-amber-400 text-amber-200 shadow-sm animate-pulse'
                        : status === 'error'
                        ? 'bg-red-950/20 border-red-500/40 text-red-300'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400'
                    }`}
                  >
                    <span>{st.label}</span>
                    {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {status === 'active' && <RotateCw className="w-4 h-4 text-amber-400 animate-spin" />}
                    {status === 'pending' && <span className="w-2 h-2 rounded-full bg-slate-600" />}
                    {status === 'error' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confirmed Published Link Box */}
          {(publishState.publishedUrl || lastPublished?.publishedUrl) && (
            <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  رابط المنظومة المنشور المعتمد:
                </span>
                <span className="text-[10px] text-slate-400">
                  آخر نشر:{' '}
                  {lastPublished?.publishedAt
                    ? new Date(lastPublished.publishedAt).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : 'الآن'}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                <input
                  type="text"
                  readOnly
                  value={publishState.publishedUrl || lastPublished?.publishedUrl || ''}
                  className="bg-transparent text-emerald-400 text-xs font-mono flex-1 outline-none text-left"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopyUrl(publishState.publishedUrl || lastPublished?.publishedUrl || '')
                  }
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                  title="نسخ الرابط"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? 'تم النسخ' : 'نسخ'}</span>
                </button>
                <a
                  href={publishState.publishedUrl || lastPublished?.publishedUrl || ''}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح الرابط</span>
                </a>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
            <button
              type="button"
              disabled={isPublishing}
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition disabled:opacity-50"
            >
              إغلاق
            </button>

            <div className="flex items-center gap-2">
              {publishState.stage === 'ERROR' && (
                <button
                  type="button"
                  onClick={() => {
                    setRetryCount((c) => c + 1);
                    handleStartPublish();
                  }}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer transition"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>إعادة المحاولة فوراً</span>
                </button>
              )}

              <button
                type="button"
                disabled={isPublishing}
                onClick={handleStartPublish}
                className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                  isPublishing
                    ? 'bg-amber-600/60 text-amber-200 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black hover:scale-105 active:scale-95'
                }`}
              >
                {isPublishing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin text-amber-950" />
                    <span>جاري تنفيذ النشر ({publishState.progressPercent}%)...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-slate-950" />
                    <span>{publishState.stage === 'SUCCESS' ? 'إعادة النشر والتأكيد' : '🚀 بدء النشر الآن'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
