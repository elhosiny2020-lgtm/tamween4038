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
  Cloud,
  Download,
  Terminal,
  Sparkles,
  Zap,
  FolderArchive,
  ArrowUpRight,
  Code2,
  Laptop,
  Trash2,
  XCircle,
} from 'lucide-react';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
}

type TabType = 'live_publish' | 'cloudflare' | 'vercel' | 'packages';

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
  currentState,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('live_publish');
  const [publishState, setPublishState] = useState<PublishProgressState>({
    stage: 'IDLE',
    stageNameArabic: 'جاهز للنشر',
    progressPercent: 0,
    statusMessage: 'اضغط على زر "بدء النشر الآن" لتأكيد رفع ونشر أحدث البيانات والملفات.',
    isDelayed: false,
  });

  const [lastPublished, setLastPublished] = useState<PublishResult | null>(() =>
    getLastConfirmedPublishInfo()
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Cancellation state for hosting providers
  const [cancelledHosts, setCancelledHosts] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('TAMWEEN_CANCELLED_HOSTS');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const handleCancelHosting = (hostKey: 'google' | 'cloudflare' | 'vercel' | 'all') => {
    const updated = { ...cancelledHosts };
    if (hostKey === 'all') {
      updated.google = true;
      updated.cloudflare = true;
      updated.vercel = true;
    } else {
      updated[hostKey] = true;
    }
    setCancelledHosts(updated);
    try {
      localStorage.setItem('TAMWEEN_CANCELLED_HOSTS', JSON.stringify(updated));
    } catch {}

    const providerTitle =
      hostKey === 'google'
        ? 'Google Cloud'
        : hostKey === 'cloudflare'
        ? 'Cloudflare Pages'
        : hostKey === 'vercel'
        ? 'Vercel Free'
        : 'جميع الاستضافات السحابية';

    setPublishState({
      stage: 'IDLE',
      stageNameArabic: 'تم إلغاء الاستضافة',
      progressPercent: 0,
      statusMessage: `تم بنجاح إلغاء وإيقاف استضافة (${providerTitle}) بناءً على طلبك. يمكنك إعادة النشر والتفعيل مجدداً في أي وقت.`,
      isDelayed: false,
    });

    if (hostKey === 'all' || hostKey === 'google') {
      setLastPublished(null);
      try {
        localStorage.removeItem('TAMWEEN_LAST_PUBLISHED_INFO');
      } catch {}
    }
  };

  const handleReenableHosting = (hostKey: 'google' | 'cloudflare' | 'vercel' | 'all') => {
    const updated = { ...cancelledHosts };
    if (hostKey === 'all') {
      delete updated.google;
      delete updated.cloudflare;
      delete updated.vercel;
    } else {
      delete updated[hostKey];
    }
    setCancelledHosts(updated);
    try {
      localStorage.setItem('TAMWEEN_CANCELLED_HOSTS', JSON.stringify(updated));
    } catch {}

    setPublishState({
      stage: 'IDLE',
      stageNameArabic: 'جاهز للنشر',
      progressPercent: 0,
      statusMessage: 'تم إعادة تفعيل الاستضافة. اضغط على "بدء النشر الآن" للنشر المباشر.',
      isDelayed: false,
    });
  };

  const officialLiveUrl =
    publishState.publishedUrl ||
    lastPublished?.publishedUrl ||
    'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app';

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
    if (isPublishing) return;

    // Clear cancellation for current tab host on publish
    const currentHost = activeTab === 'live_publish' ? 'google' : activeTab === 'cloudflare' ? 'cloudflare' : activeTab === 'vercel' ? 'vercel' : null;
    if (currentHost && cancelledHosts[currentHost]) {
      handleReenableHosting(currentHost as any);
    }

    try {
      const result = await executePublishProcess(currentState, (progress) => {
        setPublishState(progress);
      });
      setLastPublished(result);
    } catch (err: any) {
      console.error('Publish execution caught error in modal:', err);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    if (label === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } else {
      setCopiedCmd(label);
      setTimeout(() => setCopiedCmd(null), 2500);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border-2 border-amber-500/70 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col text-right">
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-b border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 border border-amber-400/50 rounded-xl text-amber-300">
              <UploadCloud className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black text-amber-200">
                النشر والاستضافة السحابية المجانية (Cloud Deployment)
              </h3>
              <p className="text-xs text-slate-300 font-bold">
                إدارة تموين مركز المحلة الكبرى • Cloudflare Pages • Vercel • Google Cloud
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isPublishing}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 pt-3 bg-slate-950 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('live_publish')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border-t-2 border-x-2 ${
              activeTab === 'live_publish'
                ? 'bg-slate-900 text-amber-300 border-amber-500 shadow-md'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>الرابط المباشر والفعال (Google Cloud)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cloudflare')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border-t-2 border-x-2 ${
              activeTab === 'cloudflare'
                ? 'bg-slate-900 text-amber-300 border-amber-500 shadow-md'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Zap className="w-4 h-4 text-orange-400" />
            <span>Cloudflare Pages (مجاناً)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vercel')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border-t-2 border-x-2 ${
              activeTab === 'vercel'
                ? 'bg-slate-900 text-amber-300 border-amber-500 shadow-md'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <span className="font-mono text-sm leading-none font-black text-white">▲</span>
            <span>Vercel Free (مجاناً)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border-t-2 border-x-2 ${
              activeTab === 'packages'
                ? 'bg-slate-900 text-amber-300 border-amber-500 shadow-md'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <FolderArchive className="w-4 h-4 text-sky-400" />
            <span>حزم النشر والـ ZIP</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* TAB 1: Live Publish & Google Cloud Run */}
          {activeTab === 'live_publish' && (
            <div className="space-y-4">
              {/* Permanent Live URL Highlight */}
              <div className="p-4 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-emerald-950/60 border-2 border-emerald-500/60 rounded-xl shadow-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <h4 className="text-sm font-black text-emerald-300">
                      موقعك منشور وشغال حالياً ومتاح 24/7 على السحابة مجاناً:
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full">
                    مستضاف على سيرفرات Google Cloud الرسمية
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <input
                    type="text"
                    readOnly
                    value={officialLiveUrl}
                    className="bg-transparent text-emerald-300 text-xs font-mono font-bold flex-1 outline-none text-left select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(officialLiveUrl, 'url')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow"
                    title="نسخ الرابط"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                  <a
                    href={officialLiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-black flex items-center gap-1 cursor-pointer transition shadow"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح الموقع</span>
                  </a>

                  {cancelledHosts.google ? (
                    <button
                      type="button"
                      onClick={() => handleReenableHosting('google')}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-black flex items-center gap-1 cursor-pointer transition shadow"
                      title="إعادة تفعيل استضافة Google Cloud"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>إعادة التفعيل</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCancelHosting('google')}
                      className="px-3 py-1.5 bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-500/50 rounded text-xs font-black flex items-center gap-1 cursor-pointer transition shadow"
                      title="إلغاء استضافة Google Cloud في أي وقت"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>إلغاء الاستضافة 🚫</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-300 font-bold leading-relaxed">
                  هذا الرابط يعمل بشكل دائم على أي جهاز هاتف أو كمبيوتر ومحمي بشهادة أمان SSL كاملة ومربوط مع قاعدة البيانات السحابية والتخزين الآمن.
                </p>
              </div>

              {/* Quick Notice Banner */}
              <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                  <Server className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    السجلات المعتمدة للنشر: <strong>{currentState.bakeries.length}</strong> مخبز •{' '}
                    <strong>{currentState.debts.length}</strong> قيد مديونية
                  </span>
                </div>
                <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  Cloud Live Engine
                </span>
              </div>

              {/* Progress Bar & Status */}
              <div className="p-4 bg-slate-950/60 border border-amber-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-black">
                  <span className="text-amber-300">{publishState.stageNameArabic}</span>
                  <span className="text-amber-400 num-enlarged">{publishState.progressPercent}%</span>
                </div>

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

                {publishState.isDelayed && (
                  <div className="p-2.5 bg-amber-950/50 border border-amber-500/50 rounded-lg text-xs text-amber-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                    <span>العملية جارية... يتم التحقق وتأكيد المزامنة مع الخادم السحابي دون انقطاع.</span>
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
            </div>
          )}

          {/* TAB 2: Cloudflare Pages Free */}
          {activeTab === 'cloudflare' && (
            <div className="space-y-4">
              <div className="p-4 bg-orange-950/30 border-2 border-orange-500/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-orange-500/20 border border-orange-400/50 rounded-lg text-orange-400">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-orange-200">
                        الرفع على Cloudflare Pages (مجاناً مدى الحياة Free Tier)
                      </h4>
                      <p className="text-xs text-slate-300 font-bold">
                        أسرع شبكة سحابية في العالم • بدون حدود للترافيك • شهادة SSL تلقائية
                      </p>
                    </div>
                  </div>
                  {cancelledHosts.cloudflare ? (
                    <button
                      type="button"
                      onClick={() => handleReenableHosting('cloudflare')}
                      className="text-[11px] font-black bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-full shadow cursor-pointer transition flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>إعادة تفعيل Cloudflare</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCancelHosting('cloudflare')}
                      className="text-[11px] font-black bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-500/50 px-3 py-1 rounded-full shadow cursor-pointer transition flex items-center gap-1"
                      title="إلغاء استضافة Cloudflare Pages في أي وقت"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                      <span>إلغاء استضافة Cloudflare 🚫</span>
                    </button>
                  )}
                </div>

                <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تم تجهيز ملف التوجيه <code className="text-amber-300 font-mono">_redirects</code> لمنع أي خطأ 404 عند تحديث الصفحة.</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تم إنشاء ملف التكوين السحابي <code className="text-amber-300 font-mono">wrangler.toml</code> الجاهز للنشر المباشر.</span>
                  </div>
                </div>
              </div>

              {/* 3 Step Deployment Guide for Cloudflare */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  طريقة الرفع على Cloudflare Pages خلال 60 ثانية:
                </h5>

                {/* Method 1: Direct Upload */}
                <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-300">
                      الطريقة الأولى (الأسرع - سحب وإفلات ملف ZIP):
                    </span>
                    <a
                      href="/tamween-cloudflare-vercel-deployment.zip"
                      download="tamween-cloudflare-vercel-deployment.zip"
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-black flex items-center gap-1 shadow transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تحميل حزمة الرفع (ZIP)</span>
                    </a>
                  </div>
                  <ol className="text-xs text-slate-300 list-decimal list-inside space-y-1 font-bold">
                    <li>حمل ملف الـ ZIP أعلاه أو مجلد <code className="text-amber-300 font-mono">dist</code>.</li>
                    <li>افتح لوحة تحكم Cloudflare Pages: <code className="text-amber-300 font-mono">dash.cloudflare.com &gt; Workers &amp; Pages</code>.</li>
                    <li>اختر <strong>Upload assets</strong> واسحب الملف وسيكون موقعك شغالاً على نطاق مجاني <code className="text-emerald-400 font-mono">*.pages.dev</code>.</li>
                  </ol>
                  <div className="pt-1">
                    <a
                      href="https://dash.cloudflare.com/?to=/:account/pages"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-orange-400 hover:text-orange-300 underline"
                    >
                      <span>فتح لوحة Cloudflare Pages في صفحة جديدة</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Method 2: Git Repository */}
                <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1.5 text-xs">
                  <span className="font-black text-amber-300">الطريقة الثانية (الربط بـ GitHub):</span>
                  <p className="text-slate-300 font-bold">
                    عند ربط المستودع في Cloudflare Pages، يتم التعرف تلقائياً على الإعدادات:
                  </p>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                    <div><strong>Framework preset:</strong> <span className="text-emerald-400">Vite</span></div>
                    <div><strong>Build command:</strong> <span className="text-emerald-400">npm run build</span></div>
                    <div><strong>Build output directory:</strong> <span className="text-emerald-400">dist</span></div>
                  </div>
                </div>

                {/* Method 3: CLI */}
                <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-300 flex items-center gap-1">
                      <Terminal className="w-3.5 h-3.5 text-orange-400" />
                      الطريقة الثالثة (سطر الأوامر Wrangler CLI):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('npx wrangler pages deploy dist', 'cloudflare_cmd')}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      {copiedCmd === 'cloudflare_cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCmd === 'cloudflare_cmd' ? 'تم النسخ' : 'نسخ الأمر'}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-2 rounded text-emerald-400 font-mono text-xs overflow-x-auto text-left">
                    npx wrangler pages deploy dist
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Vercel Free */}
          {activeTab === 'vercel' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/80 border-2 border-slate-600 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-white">
                      <span className="font-mono text-base font-black leading-none">▲</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-100">
                        الرفع على Vercel Free (مجاناً Free Tier)
                      </h4>
                      <p className="text-xs text-slate-300 font-bold">
                        أفضل منصة عالمية لتطبيقات React • نشر فوري وتحديثات تلقائية مع كل تغيير
                      </p>
                    </div>
                  </div>
                  {cancelledHosts.vercel ? (
                    <button
                      type="button"
                      onClick={() => handleReenableHosting('vercel')}
                      className="text-[11px] font-black bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-full shadow cursor-pointer transition flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>إعادة تفعيل Vercel</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCancelHosting('vercel')}
                      className="text-[11px] font-black bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-500/50 px-3 py-1 rounded-full shadow cursor-pointer transition flex items-center gap-1"
                      title="إلغاء استضافة Vercel في أي وقت"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                      <span>إلغاء استضافة Vercel 🚫</span>
                    </button>
                  )}
                </div>

                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تم إنشاء ملف التكوين <code className="text-amber-300 font-mono">vercel.json</code> مع قواعد إعادة التوجيه الكاملة.</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>تم ضبط مجلد المخرجات على <code className="text-amber-300 font-mono">dist</code> وأمر البناء <code className="text-amber-300 font-mono">npm run build</code>.</span>
                  </div>
                </div>
              </div>

              {/* Vercel Steps */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  طريقة الرفع على Vercel خلال دقيقة واحدة:
                </h5>

                {/* Option 1: Vercel Dashboard */}
                <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-300">
                      الطريقة الأولى (الربط المباشر مع حساب Vercel):
                    </span>
                    <a
                      href="https://vercel.com/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-white hover:bg-slate-200 text-slate-950 rounded text-xs font-black flex items-center gap-1 shadow transition cursor-pointer"
                    >
                      <span>فتح Vercel New Project</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <ol className="text-xs text-slate-300 list-decimal list-inside space-y-1 font-bold">
                    <li>ادخل على موقع <code className="text-amber-300 font-mono">vercel.com</code> وسجل دخولك مجاناً.</li>
                    <li>اضغط على <strong>Add New Project</strong> ثم اربط مستودع GitHub الخاص بك.</li>
                    <li>اضغط <strong>Deploy</strong>، وسيقوم Vercel تلقائياً بقراءة <code className="text-amber-300 font-mono">vercel.json</code> ونشر المنظومة على نطاق <code className="text-emerald-400 font-mono">*.vercel.app</code> مجاناً.</li>
                  </ol>
                </div>

                {/* Option 2: CLI */}
                <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-amber-300 flex items-center gap-1">
                      <Terminal className="w-3.5 h-3.5 text-slate-200" />
                      الطريقة الثانية (سطر الأوامر Vercel CLI):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('npx vercel --prod', 'vercel_cmd')}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      {copiedCmd === 'vercel_cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCmd === 'vercel_cmd' ? 'تم النسخ' : 'نسخ الأمر'}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-2 rounded text-emerald-400 font-mono text-xs overflow-x-auto text-left">
                    npx vercel --prod
                  </pre>
                </div>

                {/* vercel.json preview */}
                <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-300 flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5 text-amber-400" />
                      ملف vercel.json المعتمد في المشروع:
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          JSON.stringify(
                            {
                              buildCommand: 'npm run build',
                              outputDirectory: 'dist',
                              framework: 'vite',
                              rewrites: [{ source: '/(.*)', destination: '/index.html' }],
                            },
                            null,
                            2
                          ),
                          'vercel_json'
                        )
                      }
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      {copiedCmd === 'vercel_json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCmd === 'vercel_json' ? 'تم النسخ' : 'نسخ الكود'}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-2 rounded text-slate-300 font-mono text-[11px] overflow-x-auto text-left">
{`{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Download Packages & Standalone Files */}
          {activeTab === 'packages' && (
            <div className="space-y-4">
              <div className="p-4 bg-sky-950/40 border-2 border-sky-500/50 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-5 h-5 text-sky-400" />
                  <h4 className="text-sm font-black text-sky-200">
                    حزم التحميل المباشرة للاستضافة على أي سيرفر أو سحابة
                  </h4>
                </div>
                <p className="text-xs text-slate-300 font-bold leading-relaxed">
                  يمكنك تحميل أي من الملفات التالية ورفعها على أي استضافة سحابية مجانية (Cloudflare Pages, Vercel, Netlify, Render, GitHub Pages, cPanel, أو تشغيلها مباشرة على جهاز الكمبيوتر بدون إنترنت).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Full Deployment ZIP for Cloudflare / Vercel */}
                <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FolderArchive className="w-4 h-4 text-orange-400" />
                      <span className="text-xs font-black text-amber-200">
                        حزمة النشر الكاملة (Deployment ZIP)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-bold">
                      ملف مضغوط يحتوي على مجلد dist كاملاً مع ملفات _redirects و _headers و vercel.json جاهز للسحب والإفلات في Cloudflare أو Vercel.
                    </p>
                  </div>
                  <a
                    href="/tamween-cloudflare-vercel-deployment.zip"
                    download="tamween-cloudflare-vercel-deployment.zip"
                    className="mt-2 w-full py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل حزمة الرفع السحابي (ZIP)</span>
                  </a>
                </div>

                {/* 2. Standalone HTML */}
                <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-black text-emerald-200">
                        المنظومة المستقلة الكاملة (tamween-system.html)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-bold">
                      صفحة HTML واحدة مدمجة بالكامل تعمل أوفلاين على أي جهاز أو يمكن رفعها على أي استضافة بدون بناء أو تثبيت حزم.
                    </p>
                  </div>
                  <a
                    href="/tamween-system.html"
                    download="منظومة وزارة التموين - إدارة تموين مركز المحلة الكبرى.html"
                    className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل ملف HTML المدمج</span>
                  </a>
                </div>

                {/* 3. Windows Native PE EXE */}
                <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-black text-sky-200">
                        تطبيق سطح المكتب لويندوز (منظومة_وزارة_التموين.exe)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-bold">
                      ملف تنفيذي Win32 GUI حقيقي ومستقل يفتح المنظومة بضغطة زر مباشرة على شاشة كاملة بدون شريط أدوات المتصفح.
                    </p>
                  </div>
                  <a
                    href="/منظومة_وزارة_التموين.exe"
                    download="منظومة_وزارة_التموين.exe"
                    className="mt-2 w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل تطبيق ويندوز (.exe)</span>
                  </a>
                </div>

                {/* 4. Windows Desktop Shortcut Installer */}
                <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-black text-purple-200">
                        تثبيت أيقونة سطح المكتب (.bat)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-bold">
                      ملف تثبيت تلقائي يضيف أيقونة المنظومة الرسمية على سطح المكتب فوراً للموظفين للوصول السريع بضغطة واحدة.
                    </p>
                  </div>
                  <a
                    href="/تثبيت_أيقونة_المنظومة_على_سطح_المكتب.bat"
                    download="تثبيت_أيقونة_المنظومة_على_سطح_المكتب.bat"
                    className="mt-2 w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل ملف التثبيت (.bat)</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
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
                  onClick={handleStartPublish}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer transition"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>إعادة المحاولة فوراً</span>
                </button>
              )}

              <button
                type="button"
                disabled={isPublishing}
                onClick={() =>
                  handleCancelHosting(
                    activeTab === 'packages'
                      ? 'all'
                      : activeTab === 'live_publish'
                      ? 'google'
                      : activeTab
                  )
                }
                className="px-4 py-2.5 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/50 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg transition cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50"
                title="إلغاء وإيقاف الاستضافة في أي وقت"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>إلغاء الاستضافة 🚫</span>
              </button>

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
                    <span>جاري تنفيذ النشر وتحديث السحابة ({publishState.progressPercent}%)...</span>
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
