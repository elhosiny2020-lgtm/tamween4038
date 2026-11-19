import React, { useState, useMemo, useEffect } from 'react';
import { Bakery, DailyAlertConfig, DebtRecord, AppUser } from '../types';
import {
  Bell,
  Clock,
  Check,
  X,
  Volume2,
  VolumeX,
  Globe,
  ShieldAlert,
  FileCheck,
  AlertTriangle,
  Play,
  Save,
  Lock,
  Mail,
  Send,
  UserPlus,
  Trash2,
  History,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  XCircle,
} from 'lucide-react';
import { playGentleAlertChime } from '../utils/audioNotifications';
import {
  collectCriticalDebtBakeries,
  isValidEmailAddress,
  resolveSupervisorEmailRecipients,
} from '../utils/criticalDebtEmailAlerts';
import { findLowFlourQuotaBakeries } from '../utils/bakeryAlertsAndHistory';
import {
  getGoogleWorkspaceConnectionInfo,
  signInWithGoogleWorkspace,
  verifyGmailApiConnection,
  GmailApiVerificationResult,
} from '../lib/firebase';

interface DailyAlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DailyAlertConfig;
  bakeries: Bakery[];
  debts?: DebtRecord[];
  users?: AppUser[];
  systemGmailEmail?: string;
  defaultDebtThreshold?: number;
  currentUser: AppUser | null;
  onSaveConfig: (updatedConfig: DailyAlertConfig) => void;
  onToggleMute?: (muted: boolean) => void;
  onTriggerTestAlert: (matchingBakeries: { bakery: Bakery; docName: string; expiryDate: string; daysDiff: number }[]) => void;
  onOpenDebtEmailHistory?: () => void;
  onSendCriticalDebtEmailNow?: (params: {
    criticalThreshold: number;
    recipients: string[];
    alertTime: string;
  }) => Promise<{ status: 'sent' | 'needs_auth' | 'failed'; message: string }>;
}

const DOCUMENT_OPTIONS = [
  { id: 'bakeryLicenseDate', label: 'رخصة تشغيل المخبز التمويني', default: true },
  { id: 'commercialRegDate', label: 'السجل التجاري', default: true },
  { id: 'leaseAgreementDate', label: 'عقد الإيجار / سند الحيازة', default: true },
  { id: 'taxCardDate', label: 'البطاقة الضريبية', default: true },
];

const PRESET_TIMES = [
  { time: '08:00', label: '08:00 ص (بداية العمل)' },
  { time: '09:00', label: '09:00 ص (الموصى به)' },
  { time: '10:00', label: '10:00 ص' },
  { time: '12:00', label: '12:00 م (منتصف النهار)' },
  { time: '14:00', label: '02:00 م (قبل نهاية الدوام)' },
];

export const DailyAlertSettingsModal: React.FC<DailyAlertSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  bakeries,
  debts = [],
  users = [],
  systemGmailEmail = '',
  defaultDebtThreshold = 50000,
  currentUser,
  onSaveConfig,
  onToggleMute,
  onTriggerTestAlert,
  onOpenDebtEmailHistory,
  onSendCriticalDebtEmailNow,
}) => {
  const isAdmin =
    Boolean(currentUser?.isSuperAdmin) ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'supervisor';

  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [alertTime, setAlertTime] = useState(config?.alertTime || '09:00');
  const [notifyBrowser, setNotifyBrowser] = useState(config?.notifyBrowser ?? true);
  const [notifySound, setNotifySound] = useState(config?.notifySound ?? true);
  const [targetDocs, setTargetDocs] = useState<string[]>(
    config?.targetDocs && config.targetDocs.length > 0
      ? config.targetDocs
      : ['bakeryLicenseDate', 'commercialRegDate', 'leaseAgreementDate', 'taxCardDate']
  );
  const [daysThreshold, setDaysThreshold] = useState<number>(config?.daysThreshold ?? 0);
  const [browserPermission, setBrowserPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [toastMsg, setToastMsg] = useState('');

  // Critical Debt Daily Email Alerts state
  const [debtEmailEnabled, setDebtEmailEnabled] = useState<boolean>(config?.debtEmailEnabled ?? true);
  const [debtEmailAlertTime, setDebtEmailAlertTime] = useState<string>(
    config?.debtEmailAlertTime || config?.alertTime || '09:00'
  );
  const [debtEmailCriticalThreshold, setDebtEmailCriticalThreshold] = useState<number>(
    config?.debtEmailCriticalThreshold || defaultDebtThreshold || 50000
  );
  const [includeSystemSupervisors, setIncludeSystemSupervisors] = useState<boolean>(
    config?.includeSystemSupervisors !== false
  );
  const [supervisorEmailRecipients, setSupervisorEmailRecipients] = useState<string[]>(
    Array.isArray(config?.supervisorEmailRecipients) ? config.supervisorEmailRecipients : []
  );
  const [newSupervisorEmail, setNewSupervisorEmail] = useState('');
  const [emailInputError, setEmailInputError] = useState('');
  const [googleConn, setGoogleConn] = useState(() => getGoogleWorkspaceConnectionInfo(systemGmailEmail));
  const [gmailVerifyResult, setGmailVerifyResult] = useState<GmailApiVerificationResult | null>(null);
  const [isVerifyingGmail, setIsVerifyingGmail] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConfirmSendEmailOpen, setIsConfirmSendEmailOpen] = useState(false);
  const [isSendingDebtEmail, setIsSendingDebtEmail] = useState(false);

  // Low Daily Flour Quota In-App PUSH Alerts (in sacks / شكائر)
  const [lowFlourQuotaAlertEnabled, setLowFlourQuotaAlertEnabled] = useState<boolean>(
    config?.lowFlourQuotaAlertEnabled ?? true
  );
  const [lowFlourQuotaMinSacks, setLowFlourQuotaMinSacks] = useState<number>(
    config?.lowFlourQuotaMinSacks ?? 10
  );

  useEffect(() => {
    if (isOpen && config) {
      setEnabled(config.enabled ?? true);
      setAlertTime(config.alertTime || '09:00');
      setNotifyBrowser(config.notifyBrowser ?? true);
      setNotifySound(config.notifySound ?? true);
      setTargetDocs(
        config.targetDocs && config.targetDocs.length > 0
          ? config.targetDocs
          : ['bakeryLicenseDate', 'commercialRegDate', 'leaseAgreementDate', 'taxCardDate']
      );
      setDaysThreshold(config.daysThreshold ?? 0);
      setDebtEmailEnabled(config.debtEmailEnabled ?? true);
      setDebtEmailAlertTime(config.debtEmailAlertTime || config.alertTime || '09:00');
      setDebtEmailCriticalThreshold(config.debtEmailCriticalThreshold || defaultDebtThreshold || 50000);
      setIncludeSystemSupervisors(config.includeSystemSupervisors !== false);
      setSupervisorEmailRecipients(
        Array.isArray(config.supervisorEmailRecipients) ? config.supervisorEmailRecipients : []
      );
      setGoogleConn(getGoogleWorkspaceConnectionInfo(systemGmailEmail));
      setGmailVerifyResult(null);
      setEmailInputError('');
      setIsConfirmSendEmailOpen(false);
      setLowFlourQuotaAlertEnabled(config.lowFlourQuotaAlertEnabled ?? true);
      setLowFlourQuotaMinSacks(config.lowFlourQuotaMinSacks ?? 10);
    }
  }, [isOpen, config, defaultDebtThreshold, systemGmailEmail]);

  // Escape key closing is intentionally disabled per user preference

  // Check browser notification permission
  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setBrowserPermission(perm);
        if (perm === 'granted') {
          setToastMsg('تم تفعيل إشعارات المتصفح بنجاح! ستظهر لك الإخطارات في الوقت المحدد');
          setTimeout(() => setToastMsg(''), 3000);
        } else {
          setToastMsg('تم رفض إذن الإشعارات من إعدادات المتصفح');
          setTimeout(() => setToastMsg(''), 3000);
        }
      } catch {
        // ignore
      }
    }
  };

  // Find currently matching bakeries that would trigger this alert
  const matchingExpiredBakeries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matches: { bakery: Bakery; docName: string; expiryDate: string; daysDiff: number }[] = [];

    bakeries.forEach((b) => {
      DOCUMENT_OPTIONS.forEach((doc) => {
        if (!targetDocs.includes(doc.id)) return;
        const dateStr = (b as any)[doc.id];
        if (!dateStr || !String(dateStr).trim()) return;

        const d = new Date(String(dateStr).trim());
        if (isNaN(d.getTime())) return;
        d.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Matching condition based on threshold
        // threshold 0 = diffDays <= 0 (expired already)
        // threshold 15 = diffDays <= 15
        // threshold 30 = diffDays <= 30
        if (diffDays <= daysThreshold) {
          matches.push({
            bakery: b,
            docName: doc.label,
            expiryDate: dateStr,
            daysDiff: diffDays,
          });
        }
      });
    });

    return matches;
  }, [bakeries, targetDocs, daysThreshold]);

  const criticalDebtBakeries = useMemo(
    () => collectCriticalDebtBakeries(bakeries, debts, debtEmailCriticalThreshold),
    [bakeries, debts, debtEmailCriticalThreshold]
  );

  const lowFlourQuotaBakeries = useMemo(
    () => findLowFlourQuotaBakeries(bakeries, lowFlourQuotaMinSacks),
    [bakeries, lowFlourQuotaMinSacks]
  );

  const resolvedRecipients = useMemo(
    () =>
      resolveSupervisorEmailRecipients(users, {
        extraEmails: supervisorEmailRecipients,
        includeSystemSupervisors,
        fallbackDirectorateEmail: systemGmailEmail,
      }),
    [users, supervisorEmailRecipients, includeSystemSupervisors, systemGmailEmail]
  );

  const handleAddSupervisorEmail = () => {
    const clean = newSupervisorEmail.trim();
    if (!isValidEmailAddress(clean)) {
      setEmailInputError('يرجى إدخال بريد إلكتروني صحيح للمشرف (مثال: supervisor@gmail.com)');
      return;
    }
    if (supervisorEmailRecipients.some((e) => e.toLowerCase() === clean.toLowerCase())) {
      setEmailInputError('هذا البريد مضاف بالفعل في قائمة المشرفين.');
      return;
    }
    setSupervisorEmailRecipients((prev) => [...prev, clean]);
    setNewSupervisorEmail('');
    setEmailInputError('');
  };

  const handleRemoveSupervisorEmail = (emailToRemove: string) => {
    setSupervisorEmailRecipients((prev) =>
      prev.filter((e) => e.toLowerCase() !== emailToRemove.toLowerCase())
    );
  };

  const handleConnectGoogleForEmail = async () => {
    setIsConnectingGoogle(true);
    try {
      const res = await signInWithGoogleWorkspace();
      const verified = await verifyGmailApiConnection({ fallbackEmail: systemGmailEmail });
      setGmailVerifyResult(verified);
      setGoogleConn(getGoogleWorkspaceConnectionInfo(systemGmailEmail));
      setToastMsg(`تم ربط حساب Google Gmail بنجاح (${res.email || 'متصل'}) للإرسال اليومي التلقائي.`);
      setTimeout(() => setToastMsg(''), 4000);
    } catch (err: any) {
      setEmailInputError(err?.message || 'تعذر إتمام الربط بحساب Google.');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleVerifyGmailConnection = async () => {
    setIsVerifyingGmail(true);
    setEmailInputError('');
    try {
      const res = await verifyGmailApiConnection({ fallbackEmail: systemGmailEmail });
      setGmailVerifyResult(res);
      setGoogleConn(getGoogleWorkspaceConnectionInfo(systemGmailEmail));
      if (res.status === 'active') {
        setToastMsg(res.detail);
        setTimeout(() => setToastMsg(''), 4000);
      }
    } finally {
      setIsVerifyingGmail(false);
    }
  };

  const handleConfirmedSendDebtEmailNow = async () => {
    if (!onSendCriticalDebtEmailNow || isSendingDebtEmail) return;
    setIsSendingDebtEmail(true);
    try {
      const res = await onSendCriticalDebtEmailNow({
        criticalThreshold: debtEmailCriticalThreshold,
        recipients: resolvedRecipients.map((r) => r.email),
        alertTime: debtEmailAlertTime,
      });
      setGoogleConn(getGoogleWorkspaceConnectionInfo(systemGmailEmail));
      setGmailVerifyResult(null);
      setIsConfirmSendEmailOpen(false);
      if (res.status === 'sent') {
        setToastMsg(res.message);
      } else {
        setEmailInputError(res.message);
      }
      setTimeout(() => setToastMsg(''), 5000);
    } finally {
      setIsSendingDebtEmail(false);
    }
  };

  const toggleDoc = (docId: string) => {
    if (!isAdmin) return;
    setTargetDocs((prev) => {
      if (prev.includes(docId)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((d) => d !== docId);
      } else {
        return [...prev, docId];
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setToastMsg('تعديل وقت التنبيه اليومي وإعداداته مخصص لمديري النظام والمشرفين فقط');
      setTimeout(() => setToastMsg(''), 3500);
      return;
    }

    const updated: DailyAlertConfig = {
      enabled,
      alertTime,
      notifyBrowser,
      notifySound,
      targetDocs,
      daysThreshold,
      lastAlertDate: config?.lastAlertDate || '',
      debtEmailEnabled,
      debtEmailAlertTime,
      debtEmailCriticalThreshold: Math.max(1000, Math.round(Number(debtEmailCriticalThreshold) || 50000)),
      supervisorEmailRecipients,
      includeSystemSupervisors,
      lastDebtEmailAlertDate: config?.lastDebtEmailAlertDate || '',
      debtEmailHistory: Array.isArray(config?.debtEmailHistory) ? config.debtEmailHistory : [],
      lowFlourQuotaAlertEnabled,
      lowFlourQuotaMinSacks: Math.max(1, Number(lowFlourQuotaMinSacks) || 10),
    };

    onSaveConfig(updated);
    onClose();
  };

  const handleTestAlert = () => {
    onTriggerTestAlert(matchingExpiredBakeries);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 overflow-y-auto cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-slate-950 text-white rounded-2xl shadow-2xl border-2 border-amber-500/50 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden cursor-default">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 p-4 border-b border-amber-500/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-400/40 rounded-xl shadow-md text-amber-300">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>التنبيه بمواعيد والإشعار الصوتي (تراخيص المخابز والمديونيات)</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full font-mono">
                  صلاحية الإدارة 👑
                </span>
              </h3>
              <p className="text-xs text-amber-200/90 mt-0.5 font-medium">
                تحديد موعد الإخطار اليومي وعدد الأيام قبل انتهاء التراخيص (السجل التجاري، البطاقة الضريبية، رخصة المخبز، عقد الإيجار) وإعدادات الصوت للتراخيص والمديونيات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-red-950/70 hover:bg-red-700 text-white cursor-pointer border border-red-500/40"
            title="إغلاق النافذة فوراً"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Success Toast Bar */}
        {toastMsg && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-black flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Modal Body Form */}
        <form onSubmit={handleSave} className="overflow-y-auto p-5 space-y-5 flex-1 text-right">
          {/* Admin Role Notice if Viewer */}
          {!isAdmin && (
            <div className="bg-amber-950/80 border border-amber-600/60 p-3 rounded-xl flex items-center gap-2 text-amber-200 text-xs font-bold">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                أنت الآن مسجل بحساب للقراءة فقط. يمكنك الاطلاع على إعدادات التنبيه ومواعيده، بينما تعديل الإعدادات مقتصر على مديري النظام.
              </span>
            </div>
          )}

          {/* Section 1: Activation Switch */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 shadow-md">
            <div>
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span>تفعيل نظام التذكير اليومي التلقائي</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                عند التفعيل، ستقوم المنظومة تلقائياً بفحص السجلات وإظهار إشعار تذكيري في الوقت المحدد يومياً
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={enabled}
                disabled={!isAdmin}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-13 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-amber-600"></div>
            </label>
          </div>

          {/* Section 2: Daily Scheduled Time */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <label className="text-sm font-black text-amber-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>موعد التنبيه اليومي المحدد (ساعة : دقيقة):</span>
              </label>

              <span className="text-xs font-mono font-black text-amber-400 bg-amber-950/70 border border-amber-600/50 px-2.5 py-1 rounded-lg">
                {alertTime} (بتوقيت القاهرة)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <input
                  type="time"
                  value={alertTime}
                  disabled={!isAdmin || !enabled}
                  onChange={(e) => setAlertTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-black border-2 border-amber-500/60 rounded-xl font-mono text-lg font-black text-amber-300 text-center focus:outline-none focus:border-amber-400 cursor-pointer disabled:opacity-50"
                  required
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TIMES.map((p) => (
                  <button
                    key={p.time}
                    type="button"
                    disabled={!isAdmin || !enabled}
                    onClick={() => setAlertTime(p.time)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                      alertTime === p.time
                        ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                        : 'bg-black text-slate-300 hover:bg-slate-800 border border-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Criteria & Days Threshold before License Expiry */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>تحديد عدد الأيام قبل انتهاء أي ترخيص (السجل التجاري / البطاقة الضريبية / الرخصة):</span>
              </h4>
              <div className="flex items-center gap-2 bg-black px-3 py-1.5 rounded-xl border border-amber-500/60">
                <span className="text-xs font-black text-amber-300">عدد الأيام قبل الانتهاء:</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  disabled={!isAdmin || !enabled}
                  value={daysThreshold}
                  onChange={(e) => setDaysThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-16 bg-slate-900 text-amber-300 font-black text-sm text-center rounded-lg border border-amber-400/50 py-0.5 font-mono focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs font-bold text-slate-300">يوماً</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                disabled={!isAdmin || !enabled}
                onClick={() => setDaysThreshold(0)}
                className={`p-3 rounded-xl border text-right transition cursor-pointer disabled:opacity-50 ${
                  daysThreshold === 0
                    ? 'bg-gradient-to-r from-red-950/80 to-slate-900 border-red-500 text-white shadow-md'
                    : 'bg-black/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">المنتهية بالفعل (0 يوم)</span>
                  {daysThreshold === 0 && <Check className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <p className="text-[10px] text-slate-400">
                  تنبيه عاجل بالمخابز التي انقضى تاريخ صلاحيتها
                </p>
              </button>

              <button
                type="button"
                disabled={!isAdmin || !enabled}
                onClick={() => setDaysThreshold(7)}
                className={`p-3 rounded-xl border text-right transition cursor-pointer disabled:opacity-50 ${
                  daysThreshold === 7
                    ? 'bg-gradient-to-r from-orange-950/80 to-slate-900 border-orange-500 text-white shadow-md'
                    : 'bg-black/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">قبل الانتهاء بـ 7 أيام</span>
                  {daysThreshold === 7 && <Check className="w-3.5 h-3.5 text-orange-400" />}
                </div>
                <p className="text-[10px] text-slate-400">
                  تنبيه قبل أسبوع كامل من انتهاء الترخيص
                </p>
              </button>

              <button
                type="button"
                disabled={!isAdmin || !enabled}
                onClick={() => setDaysThreshold(15)}
                className={`p-3 rounded-xl border text-right transition cursor-pointer disabled:opacity-50 ${
                  daysThreshold === 15
                    ? 'bg-gradient-to-r from-amber-950/80 to-slate-900 border-amber-500 text-white shadow-md'
                    : 'bg-black/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">قبل الانتهاء بـ 15 يوماً</span>
                  {daysThreshold === 15 && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <p className="text-[10px] text-slate-400">
                  إنذار مبكر للمخابز التي تنتهي خلال أسبوعين
                </p>
              </button>

              <button
                type="button"
                disabled={!isAdmin || !enabled}
                onClick={() => setDaysThreshold(30)}
                className={`p-3 rounded-xl border text-right transition cursor-pointer disabled:opacity-50 ${
                  daysThreshold === 30
                    ? 'bg-gradient-to-r from-blue-950/80 to-slate-900 border-blue-500 text-white shadow-md'
                    : 'bg-black/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black">قبل الانتهاء بـ 30 يوماً</span>
                  {daysThreshold === 30 && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </div>
                <p className="text-[10px] text-slate-400">
                  متابعة شاملة للمستندات المطلوب تجديدها خلال شهر
                </p>
              </button>
            </div>
          </div>

          {/* Section 4: Target Document Types */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-amber-400" />
              <span>المستندات والتراخيص المطلوب إدراجها في التنبيه اليومي:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DOCUMENT_OPTIONS.map((doc) => {
                const isChecked = targetDocs.includes(doc.id);
                return (
                  <label
                    key={doc.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition select-none ${
                      isChecked
                        ? 'bg-slate-950 border-amber-500/60 text-amber-200'
                        : 'bg-black/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold">{doc.label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!isAdmin || !enabled}
                      onChange={() => toggleDoc(doc.id)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Section 5: Notification Delivery Channels */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>قنوات استلام التنبيه:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Browser Notification */}
              <div className="p-3 bg-black/60 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <span className="text-xs font-black text-white block">إشعارات المتصفح (Web Notification)</span>
                    <span className="text-[10px] text-slate-400">
                      ظهور نافذة إشعار على سطح المكتب حتى لو كانت النافذة مصغرة
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyBrowser}
                    disabled={!isAdmin || !enabled}
                    onChange={(e) => setNotifyBrowser(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  {browserPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={requestNotificationPermission}
                      className="text-[9px] text-cyan-400 hover:underline font-bold"
                    >
                      طلب الإذن
                    </button>
                  )}
                </div>
              </div>

              {/* Sound Alert & Mute Option */}
              <div className="p-3 bg-black/60 border border-slate-800 rounded-xl flex flex-col justify-between gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {notifySound ? (
                      <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <span className="text-xs font-black text-white block">
                        الإشعار الصوتي للتنبيهات ({notifySound ? 'مفعّل' : 'مكتوم'})
                      </span>
                      <span className="text-[10px] text-slate-400">
                        تشغيل نغمة خفيفة عند فتح شاشات تنبيه المديونيات والتراخيص أو المداومة اليومية
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="toggle-alert-sound-mute"
                    onClick={() => {
                      const nextSound = !notifySound;
                      setNotifySound(nextSound);
                      if (onToggleMute) {
                        onToggleMute(!nextSound);
                      }
                      if (nextSound) {
                        playGentleAlertChime({ muted: false, type: 'test' });
                        setToastMsg('تم تفعيل الإشعار الصوتي للتنبيهات');
                      } else {
                        setToastMsg('تم كتم صوت الإشعارات والتنبيهات');
                      }
                      setTimeout(() => setToastMsg(''), 2500);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer border shrink-0 ${
                      !notifySound
                        ? 'bg-rose-950/80 text-rose-200 border-rose-500/60 hover:bg-rose-900'
                        : 'bg-emerald-950/80 text-emerald-200 border-emerald-500/60 hover:bg-emerald-900'
                    }`}
                  >
                    {notifySound ? 'كتم الصوت' : 'إلغاء الكتم'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-400 font-bold">
                    {notifySound ? 'صوت التنبيه اللطيف يعمل تلقائياً' : 'تم تفعيل كتم الصوت (Mute) لجميع التنبيهات'}
                  </span>
                  <button
                    type="button"
                    data-testid="test-alert-chime-btn"
                    onClick={() => playGentleAlertChime({ muted: false, type: 'license' })}
                    className="text-[10px] font-black text-amber-300 hover:text-amber-200 underline cursor-pointer"
                  >
                    سماع نغمة التنبيه الآن
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Live Matching Bakeries Insight & Test Button */}
          <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-black border-2 border-amber-600/50 rounded-xl p-4 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-black text-white">
                  المخابز المنطبقة عليها شروط التنبيه اليومي حالياً:
                </span>
                <span className="px-2 py-0.5 rounded-full font-mono font-black text-xs bg-amber-400 text-slate-950">
                  {matchingExpiredBakeries.length} حالة
                </span>
              </div>

              {/* Test Alert Button */}
              <button
                type="button"
                onClick={handleTestAlert}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 rounded-lg text-xs font-black shadow-sm transition transform hover:scale-105 active:scale-95 cursor-pointer"
                title="تجربة فحص وإظهار التنبيه اليومي كما يظهر في الموعد المحدد"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950 stroke-none" />
                <span>تجربة إطلاق التنبيه الآن</span>
              </button>
            </div>

            {/* Quick preview list of matching bakeries */}
            {matchingExpiredBakeries.length > 0 ? (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {matchingExpiredBakeries.slice(0, 5).map((m, idx) => (
                  <div
                    key={`${m.bakery.id}-${m.docName}-${idx}`}
                    className="p-2 bg-slate-950/80 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                      <span className="font-black text-slate-100">{m.bakery.bakeryOwnerName}</span>
                      <span className="text-[10px] text-amber-300 font-mono">({m.bakery.village})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-300">{m.docName}</span>
                      <span className="text-[10px] font-mono text-red-300 bg-red-950 px-1.5 py-0.5 rounded border border-red-800">
                        {m.expiryDate} ({m.daysDiff < 0 ? `منتهية منذ ${Math.abs(m.daysDiff)} يوم` : m.daysDiff === 0 ? 'تنتهي اليوم' : `خلال ${m.daysDiff} يوم`})
                      </span>
                    </div>
                  </div>
                ))}
                {matchingExpiredBakeries.length > 5 && (
                  <p className="text-[10px] text-center text-slate-400 font-bold">
                    وعدد ({matchingExpiredBakeries.length - 5}) مخابز إضافية أخرى...
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-center text-xs text-emerald-300 font-bold">
                ✨ ممتاز! لا توجد مخابز منتهية التراخيص مطابقة للمعايير الحالية.
              </div>
            )}
          </div>

          {/* Section 6.5: Automated Daily Critical Debt Email Alerts to Supervisors */}
          <div
            data-testid="daily-debt-email-section"
            className="bg-gradient-to-br from-rose-950/35 via-slate-900 to-slate-950 border-2 border-rose-500/50 rounded-xl p-4 shadow-xl space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-500/30 pb-3">
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-rose-400" />
                  <span>التنبيه البريدي اليومي التلقائي للمشرفين (الحد الحرج للمديونية)</span>
                </h4>
                <p className="text-[11px] text-slate-300 mt-1">
                  إرسال تقرير يومي تلقائي عبر Gmail للمشرفين والمديرين ببيان جميع المخابز التي بلغت أو تجاوزت الحد الحرج للمديونية
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  data-testid="toggle-debt-email-enabled"
                  checked={debtEmailEnabled}
                  disabled={!isAdmin}
                  onChange={(e) => setDebtEmailEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-13 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-rose-500 peer-checked:to-amber-500"></div>
              </label>
            </div>

            {/* Schedule Time + Critical Threshold */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-black/50 border border-slate-800 rounded-xl p-3 space-y-2">
                <label className="text-xs font-black text-rose-200 flex items-center justify-between">
                  <span>موعد الإرسال البريدي اليومي:</span>
                  <span className="font-mono text-amber-300 tabular-nums">{debtEmailAlertTime}</span>
                </label>
                <input
                  type="time"
                  data-testid="debt-email-time-input"
                  value={debtEmailAlertTime}
                  disabled={!isAdmin || !debtEmailEnabled}
                  onChange={(e) => setDebtEmailAlertTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-rose-500/40 rounded-lg font-mono text-sm font-black text-amber-300 text-center focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="bg-black/50 border border-slate-800 rounded-xl p-3 space-y-2">
                <label className="text-xs font-black text-rose-200 flex items-center justify-between">
                  <span>حد المديونية الحرج لإطلاق البريد (ج.م):</span>
                  <span className="font-mono text-rose-300 tabular-nums">
                    {Number(debtEmailCriticalThreshold || 0).toLocaleString('en-US')} ج.م
                  </span>
                </label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  data-testid="debt-email-threshold-input"
                  value={debtEmailCriticalThreshold}
                  disabled={!isAdmin || !debtEmailEnabled}
                  onChange={(e) =>
                    setDebtEmailCriticalThreshold(Math.max(1000, parseInt(e.target.value, 10) || 50000))
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-rose-500/40 rounded-lg font-mono tabular-nums text-sm font-black text-white text-center focus:outline-none focus:border-rose-400"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[25000, 50000, 75000, 100000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!isAdmin || !debtEmailEnabled}
                      onClick={() => setDebtEmailCriticalThreshold(preset)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold border cursor-pointer transition ${
                        debtEmailCriticalThreshold === preset
                          ? 'bg-rose-600 text-white border-rose-400'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {preset.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Supervisor Recipients Management */}
            <div className="bg-black/50 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-white">
                  قائمة المشرفين المستلمين للتنبيه البريدي اليومي ({resolvedRecipients.length}):
                </span>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSystemSupervisors}
                    disabled={!isAdmin}
                    onChange={(e) => setIncludeSystemSupervisors(e.target.checked)}
                    className="rounded border-slate-700 text-rose-500 focus:ring-rose-500 cursor-pointer"
                  />
                  <span>تضمين بريد المشرفين والمديرين المسجلين تلقائياً</span>
                </label>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    dir="ltr"
                    data-testid="add-supervisor-email-input"
                    value={newSupervisorEmail}
                    onChange={(e) => {
                      setNewSupervisorEmail(e.target.value);
                      if (emailInputError) setEmailInputError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSupervisorEmail();
                      }
                    }}
                    placeholder="supervisor@gmail.com"
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-rose-400"
                  />
                  <button
                    type="button"
                    data-testid="add-supervisor-email-btn"
                    onClick={handleAddSupervisorEmail}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black cursor-pointer transition"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>إضافة مشرف</span>
                  </button>
                </div>
              )}

              {emailInputError && (
                <div className="p-2 bg-red-950/80 border border-red-500/60 rounded-lg text-[11px] font-bold text-red-200">
                  {emailInputError}
                </div>
              )}

              {/* Explicit chips + Auto-resolved supervisors */}
              <div className="flex flex-wrap gap-1.5">
                {resolvedRecipients.map((r) => {
                  const isManual = supervisorEmailRecipients.some(
                    (e) => e.toLowerCase() === r.email.toLowerCase()
                  );
                  return (
                    <div
                      key={r.email}
                      data-testid="supervisor-email-chip"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px]"
                    >
                      <Mail className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="font-mono font-bold text-slate-100">{r.email}</span>
                      <span className="text-[10px] text-slate-400">({r.roleLabel})</span>
                      {isAdmin && isManual && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSupervisorEmail(r.email)}
                          className="text-rose-400 hover:text-rose-300 cursor-pointer p-0.5"
                          title="إزالة البريد من قائمة المشرفين"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {resolvedRecipients.length === 0 && (
                  <span className="text-[11px] text-amber-300 font-bold">
                    لم يتم تحديد بريد مشرفين بعد. أضف بريد مشرف واحد على الأقل أعلاه.
                  </span>
                )}
              </div>
            </div>

            {/* Gmail API Service Readiness Badge + Connection Verification + Google OAuth */}
            {(() => {
              const effectiveStatus = gmailVerifyResult?.status ?? googleConn.status;
              const isServiceAvailable =
                gmailVerifyResult?.serviceAvailable ?? googleConn.serviceAvailable;
              const activeEmail = gmailVerifyResult?.email || googleConn.email;
              return (
                <div className="bg-black/50 border border-slate-800 rounded-xl p-3 space-y-3">
                  <div
                    data-testid="gmail-api-status-badge"
                    className={`rounded-xl border p-3 space-y-2 ${
                      effectiveStatus === 'active'
                        ? 'bg-emerald-950/35 border-emerald-500/50'
                        : effectiveStatus === 'needs_renewal'
                        ? 'bg-amber-950/35 border-amber-500/50'
                        : 'bg-slate-900/90 border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          data-testid="gmail-service-available-badge"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border ${
                            isServiceAvailable
                              ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
                              : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>
                            {isServiceAvailable
                              ? 'خدمة Gmail API متاحة (gmail.send)'
                              : 'خدمة Gmail API غير مهيأة'}
                          </span>
                        </span>

                        {effectiveStatus === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-950 border border-emerald-500/60 text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              الربط فعّال وجاهز{activeEmail ? ` (${activeEmail})` : ''}
                            </span>
                          </span>
                        ) : effectiveStatus === 'needs_renewal' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-950 border border-amber-500/60 text-amber-300">
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>
                              يحتاج تجديد صلاحية الدخول{activeEmail ? ` (${activeEmail})` : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-950/80 border border-rose-500/50 text-rose-200">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>غير مربوط بالجلسة الحالية</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          data-testid="verify-gmail-status-btn"
                          disabled={isVerifyingGmail}
                          onClick={handleVerifyGmailConnection}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-[11px] font-bold cursor-pointer transition disabled:opacity-60"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingGmail ? 'animate-spin' : ''}`} />
                          <span>{isVerifyingGmail ? 'جاري الفحص...' : 'فحص صلاحية الربط الآن'}</span>
                        </button>

                        {effectiveStatus !== 'active' && (
                          <button
                            type="button"
                            data-testid="google-signin-email-alert-btn"
                            disabled={isConnectingGoogle}
                            onClick={handleConnectGoogleForEmail}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-900 rounded-lg text-xs font-bold border border-slate-300 shadow-xs cursor-pointer transition disabled:opacity-60"
                          >
                            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            </svg>
                            <span>
                              {isConnectingGoogle
                                ? 'جاري الربط...'
                                : effectiveStatus === 'needs_renewal'
                                ? 'تجديد صلاحية الدخول (Google)'
                                : 'Sign in with Google'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] font-bold text-slate-300 leading-relaxed">
                      {gmailVerifyResult?.detail ||
                        (effectiveStatus === 'active'
                          ? 'صلاحية الإرسال عبر Gmail API سارية داخل الجلسة الحالية ويمكن الإرسال التلقائي واليدوي فوراً.'
                          : effectiveStatus === 'needs_renewal'
                          ? 'البريد مهيأ في الإعدادات أو انتهت صلاحية الجلسة السابقة — يرجى الضغط على "تجديد صلاحية الدخول" لمنح تصريح إرسال حي.'
                          : 'اضغط على "Sign in with Google" لمنح صلاحية إرسال رسائل التنبيه اليومية عبر بريد Gmail الرسمي.')}
                    </p>
                  </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white">المخابز البالغة للحد الحرج حالياً:</span>
                  <span
                    data-testid="critical-debt-preview-count"
                    className="px-2 py-0.5 rounded-full font-mono tabular-nums font-black text-xs bg-rose-600 text-white"
                  >
                    {criticalDebtBakeries.length} مخبز
                  </span>
                </div>

                {onSendCriticalDebtEmailNow && (
                  <button
                    type="button"
                    data-testid="send-critical-debt-email-now-btn"
                    disabled={criticalDebtBakeries.length === 0 || resolvedRecipients.length === 0}
                    onClick={() => setIsConfirmSendEmailOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-lg text-xs font-black shadow-sm cursor-pointer transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>معاينة وإرسال التقرير للمشرفين الآن</span>
                  </button>
                )}
              </div>

              {criticalDebtBakeries.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {criticalDebtBakeries.slice(0, 5).map((b) => (
                    <div
                      key={b.bakeryId}
                      className="p-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        <span className="font-black text-white">{b.bakeryOwnerName}</span>
                        <span className="text-[10px] text-amber-300 font-mono">
                          (ماكينة {b.machineNumber} • {b.village})
                        </span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums font-black text-rose-300">
                        {b.totalRemainingDebt.toLocaleString('en-US')} ج.م
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-center text-[11px] text-emerald-300 font-bold">
                  لا توجد مخابز حالياً تجاوزت الحد الحرج ({debtEmailCriticalThreshold.toLocaleString('en-US')} ج.م).
                </div>
              )}

              {/* Recent Email Delivery Audit Log & Full Screen Shortcut */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-300">
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      سجل الإرسال اليومي ({Array.isArray(config?.debtEmailHistory) ? config.debtEmailHistory.length : 0} محاولة):
                    </span>
                  </div>
                  {onOpenDebtEmailHistory && (
                    <button
                      type="button"
                      data-testid="open-debt-email-history-btn"
                      onClick={() => {
                        onClose();
                        onOpenDebtEmailHistory();
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-200 text-[11px] font-black cursor-pointer transition"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>عرض السجل التاريخي الكامل</span>
                    </button>
                  )}
                </div>

                {Array.isArray(config?.debtEmailHistory) && config.debtEmailHistory.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {config.debtEmailHistory.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between text-[10px] bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 font-mono"
                      >
                        <span className="text-slate-300">
                          {entry.sentDate} ({entry.mode === 'auto' ? 'تلقائي' : 'يدوي'}) • {entry.criticalBakeriesCount} مخبز • {entry.recipients.length} مشرف
                        </span>
                        <span
                          className={`font-black px-1.5 py-0.5 rounded ${
                            entry.status === 'sent'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : entry.status === 'needs_auth'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700'
                              : 'bg-rose-950 text-rose-300 border border-rose-700'
                          }`}
                        >
                          {entry.status === 'sent'
                            ? 'تم الإرسال'
                            : entry.status === 'needs_auth'
                            ? 'بانتظار ربط Google'
                            : 'فشل الإرسال'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
            })()}
          </div>

          {/* Section 7: In-App PUSH Alert for Low Daily Flour Quota (in Sacks) */}
          <div
            data-testid="low-flour-quota-settings-section"
            className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-2 border-amber-500/50 rounded-xl p-4 shadow-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 pb-3">
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>تنبيه PUSH فوري للمدراء — الحد الأدنى لرصيد حصة الدقيق اليومي (بالشكائر)</span>
                </h4>
                <p className="text-[11px] text-slate-300 mt-1">
                  يظهر إشعار PUSH فوري داخل واجهة المنظومة للمدراء والمشرفين عند انخفاض الحصة الفعلية اليومية لأي مخبز نشط عن الحد الأدنى المحدد بالشكائر.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  data-testid="toggle-low-flour-quota-enabled"
                  checked={lowFlourQuotaAlertEnabled}
                  disabled={!isAdmin}
                  onChange={(e) => setLowFlourQuotaAlertEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-13 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-rose-500"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="bg-black/50 border border-slate-800 rounded-xl p-3 space-y-2">
                <label className="text-xs font-black text-amber-200 flex items-center justify-between">
                  <span>الحد الأدنى لرصيد حصة الدقيق اليومي (شيكارة):</span>
                  <span className="font-mono tabular-nums text-amber-300">
                    {lowFlourQuotaMinSacks} شيكارة
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  data-testid="low-flour-quota-threshold-input"
                  value={lowFlourQuotaMinSacks}
                  disabled={!isAdmin || !lowFlourQuotaAlertEnabled}
                  onChange={(e) =>
                    setLowFlourQuotaMinSacks(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-lg font-mono tabular-nums text-sm font-black text-white text-center focus:outline-none focus:border-amber-400"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 15, 20].map((sacks) => (
                    <button
                      key={sacks}
                      type="button"
                      disabled={!isAdmin || !lowFlourQuotaAlertEnabled}
                      onClick={() => setLowFlourQuotaMinSacks(sacks)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-black border cursor-pointer transition ${
                        lowFlourQuotaMinSacks === sacks
                          ? 'bg-amber-500 text-slate-950 border-amber-300'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {sacks} شكائر
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/50 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">المخابز النشطة تحت الحد حالياً:</span>
                  <span className="px-2.5 py-0.5 rounded-full font-mono tabular-nums font-black text-xs bg-rose-500 text-white">
                    {lowFlourQuotaBakeries.length} مخبز
                  </span>
                </div>
                {lowFlourQuotaBakeries.length > 0 ? (
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[11px]">
                    {lowFlourQuotaBakeries.slice(0, 4).map((b) => (
                      <div
                        key={b.bakeryId}
                        className="flex items-center justify-between bg-slate-950/90 px-2 py-1 rounded border border-slate-800"
                      >
                        <span className="font-bold text-slate-100 truncate">{b.bakeryOwnerName}</span>
                        <span className="font-mono tabular-nums text-rose-300 font-black shrink-0">
                          {b.actualQuota} شيكارة
                        </span>
                      </div>
                    ))}
                    {lowFlourQuotaBakeries.length > 4 && (
                      <div className="text-[10px] text-amber-300 text-center font-bold">
                        +{lowFlourQuotaBakeries.length - 4} مخابز أخرى...
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-emerald-300">
                    جميع المخابز النشطة تمتلك حصة يومية تساوي أو تفوق {lowFlourQuotaMinSacks} شكائر.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              إلغاء (ESC)
            </button>

            {isAdmin && (
              <button
                type="submit"
                data-testid="save-daily-alert-settings-btn"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-900/30 border border-amber-300 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Save className="w-4 h-4 text-slate-950" />
                <span>حفظ إعدادات التنبيه اليومي</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Explicit User Confirmation Modal before Sending Supervisor Email via Gmail */}
      {isConfirmSendEmailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="confirm-send-debt-email-modal"
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[70] bg-slate-950/80 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border-2 border-rose-500 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-right text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm font-black flex items-center gap-2 text-rose-300">
                <Send className="w-4 h-4" />
                <span>تأكيد إرسال تنبيه المديونيات الحرجة عبر Gmail</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsConfirmSendEmailOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <p className="text-slate-200 font-bold leading-relaxed">
                سيتم إرسال تقرير رسمي عبر بريد Gmail الخاص بك إلى المشرفين التاليين بشأن{' '}
                <strong className="text-rose-300 font-mono tabular-nums">
                  {criticalDebtBakeries.length}
                </strong>{' '}
                مخبز تجاوزت مديونيته الحد الحرج (
                <strong className="text-amber-300 font-mono tabular-nums">
                  {debtEmailCriticalThreshold.toLocaleString('en-US')} ج.م
                </strong>
                ):
              </p>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1">
                <div className="text-[11px] font-black text-amber-300">المستلمون ({resolvedRecipients.length}):</div>
                <div className="text-[11px] font-mono text-slate-200 break-words">
                  {resolvedRecipients.map((r) => r.email).join(' ، ')}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 max-h-40 overflow-y-auto space-y-1">
                <div className="text-[11px] font-black text-rose-300">المخابز المشمولة في البريد:</div>
                {criticalDebtBakeries.map((b) => (
                  <div key={b.bakeryId} className="flex items-center justify-between text-[11px] border-b border-slate-900 pb-1 last:border-0">
                    <span className="font-bold text-slate-100">{b.bakeryOwnerName} (ماكينة {b.machineNumber})</span>
                    <span className="font-mono tabular-nums text-rose-300 font-black">
                      {b.totalRemainingDebt.toLocaleString('en-US')} ج.م
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmSendEmailOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                data-testid="confirm-send-debt-email-proceed-btn"
                disabled={isSendingDebtEmail}
                onClick={handleConfirmedSendDebtEmailNow}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-black cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingDebtEmail ? 'جاري الإرسال...' : 'تأكيد وإرسال البريد الآن'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
