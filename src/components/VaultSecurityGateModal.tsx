import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Building2,
  Database,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  verifyVaultPasscode,
  validateNewVaultPasscode,
} from '../utils/branchVaultUtils';

interface VaultSecurityGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSection: 'backup' | 'branches' | 'both';
  targetLabel?: string;
  configuredPasscode: string;
  isVaultUnlocked: boolean;
  onUnlockSuccess: () => void;
  onLockVault: () => void;
  onChangePasscode: (newPasscode: string) => Promise<void> | void;
}

export const VaultSecurityGateModal: React.FC<VaultSecurityGateModalProps> = ({
  isOpen,
  onClose,
  targetSection,
  targetLabel,
  configuredPasscode,
  isVaultUnlocked,
  onUnlockSuccess,
  onLockVault,
  onChangePasscode,
}) => {
  const [activeTab, setActiveTab] = useState<'unlock' | 'change'>('unlock');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Change passcode state
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [showChangeCodes, setShowChangeCodes] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPasscodeInput('');
      setCurrentCode('');
      setNewCode('');
      setConfirmCode('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setShowPasscode(false);
      setShowChangeCodes(false);
      setActiveTab('unlock');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sectionTitle =
    targetLabel ||
    (targetSection === 'backup'
      ? 'قسم الحفظ والنسخ الاحتياطي السحابي'
      : targetSection === 'branches'
      ? 'قسم جميع الفروع والإدارات التموينية'
      : 'قسم الحفظ والنسخ وجميع الفروع');

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!verifyVaultPasscode(passcodeInput, configuredPasscode)) {
      setErrorMsg('الرقم السري غير صحيح! ممنوع الدخول أو العرض أو التشغيل لغير المصرح لهم.');
      return;
    }

    setPasscodeInput('');
    onUnlockSuccess();
  };

  const handleChangePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const validation = validateNewVaultPasscode(
      currentCode,
      newCode,
      confirmCode,
      configuredPasscode
    );

    if (!validation.valid || !validation.normalizedNew) {
      setErrorMsg(validation.error || 'تعذر تغيير الرقم السري.');
      return;
    }

    try {
      setIsSaving(true);
      await onChangePasscode(validation.normalizedNew);
      setCurrentCode('');
      setNewCode('');
      setConfirmCode('');
      setSuccessMsg('تم تغيير الرقم السري الخاص بقسم الحفظ والنسخ وجميع الفروع وحفظه في قاعدة البيانات بنجاح.');
    } catch {
      setErrorMsg('حدث خطأ أثناء حفظ الرقم السري الجديد.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/85 z-[120] flex items-center justify-center p-4 font-sans animate-fade-in"
      dir="rtl"
      data-testid="vault-security-gate-modal"
    >
      <div className="bg-gradient-to-b from-slate-900 via-[#0f172a] to-slate-950 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-amber-500/40 relative">
        {/* Decorative top glowing bar */}
        <div className="h-2 w-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500" />

        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-900/50 border border-amber-400/40">
              <ShieldAlert className="w-7 h-7 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">
                  بوابة الحماية السرية القصوى
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-red-500/20 text-red-300 border border-red-500/40">
                  سري للغاية
                </span>
              </div>
              <p className="text-xs text-amber-300/90 font-bold mt-1">
                حماية مشددة على قسم الحفظ والنسخ وجميع الفروع التموينية
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الحماية"
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Protected Target Banner */}
        <div className="px-6 pt-4">
          <div className="bg-red-950/50 border border-red-500/40 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              {targetSection === 'branches' ? (
                <Building2 className="w-5 h-5" />
              ) : (
                <Database className="w-5 h-5" />
              )}
            </div>
            <div className="text-xs leading-relaxed">
              <div className="font-black text-red-200">
                ممنوع الدخول أو العرض أو التشغيل منعاً باتاً بدون الرقم السري:
              </div>
              <div className="text-amber-300 font-bold mt-0.5">{sectionTitle}</div>
            </div>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            type="button"
            data-testid="vault-mode-unlock-btn"
            onClick={() => {
              setActiveTab('unlock');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all border ${
              activeTab === 'unlock'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-900/30'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            خانة الدخول بالرقم السري
          </button>
          <button
            type="button"
            data-testid="vault-mode-change-btn"
            onClick={() => {
              setActiveTab('change');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all border ${
              activeTab === 'change'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-900/30'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            تغيير الرقم السري في أي وقت
          </button>
        </div>

        {/* Feedback Alerts */}
        <div className="px-6 pt-3">
          {errorMsg && (
            <div
              data-testid="vault-error-alert"
              className="p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-200 text-xs font-black flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div
              data-testid="vault-success-alert"
              className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs font-black flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          {activeTab === 'unlock' ? (
            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="vault-secret-passcode-input"
                  className="block text-xs font-black text-slate-200 mb-2 flex items-center justify-between"
                >
                  <span>أدخل الرقم السري الخاص بالدخول على الحفظ والنسخ وجميع الفروع:</span>
                  <span className="text-[11px] text-amber-400 font-bold">مخفي لحمايتك</span>
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="vault-secret-passcode-input"
                    data-testid="vault-passcode-input"
                    type={showPasscode ? 'text' : 'password'}
                    autoComplete="off"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3.5 text-center text-lg font-black text-white tracking-[0.35em] outline-none transition-all placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    aria-label={showPasscode ? 'إخفاء الرقم السري' : 'إظهار الرقم السري مؤقتاً'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300 p-1.5 rounded-lg"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="submit"
                  data-testid="vault-unlock-submit-btn"
                  className="flex-1 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  فتح القفل والدخول الآن
                </button>
                {isVaultUnlocked && (
                  <button
                    type="button"
                    data-testid="vault-relock-btn"
                    onClick={() => {
                      onLockVault();
                      onClose();
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    قفل الحماية فوراً
                  </button>
                )}
              </div>
            </form>
          ) : (
            <form onSubmit={handleChangePasscodeSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="vault-current-passcode"
                  className="block text-xs font-black text-slate-300 mb-1.5"
                >
                  1. الرقم السري الحالي:
                </label>
                <input
                  id="vault-current-passcode"
                  data-testid="vault-current-passcode-input"
                  type={showChangeCodes ? 'text' : 'password'}
                  autoComplete="off"
                  value={currentCode}
                  onChange={(e) => setCurrentCode(e.target.value)}
                  placeholder="أدخل الرقم السري الحالي"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-4 py-2.5 text-sm font-black text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="vault-new-passcode"
                    className="block text-xs font-black text-slate-300 mb-1.5"
                  >
                    2. الرقم السري الجديد (4 خانات فأكثر):
                  </label>
                  <input
                    id="vault-new-passcode"
                    data-testid="vault-new-passcode-input"
                    type={showChangeCodes ? 'text' : 'password'}
                    autoComplete="off"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="الرقم السري الجديد"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-4 py-2.5 text-sm font-black text-white outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="vault-confirm-passcode"
                    className="block text-xs font-black text-slate-300 mb-1.5"
                  >
                    3. تأكيد الرقم السري الجديد:
                  </label>
                  <input
                    id="vault-confirm-passcode"
                    data-testid="vault-confirm-passcode-input"
                    type={showChangeCodes ? 'text' : 'password'}
                    autoComplete="off"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    placeholder="تأكيد الرقم الجديد"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-4 py-2.5 text-sm font-black text-white outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowChangeCodes((prev) => !prev)}
                  className="text-xs font-bold text-slate-400 hover:text-amber-300 flex items-center gap-1.5"
                >
                  {showChangeCodes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showChangeCodes ? 'إخفاء الأرقام أثناء الكتابة' : 'إظهار الأرقام للتحقق'}
                </button>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                data-testid="vault-save-new-passcode-btn"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black py-3.5 px-5 rounded-2xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                حفظ وتعميم الرقم السري الجديد فوراً
              </button>
            </form>
          )}
        </div>

        {/* Footer Security Note */}
        <div className="px-6 py-3.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-bold">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            حماية مشفرة لقسم الحفظ والنسخ وجميع الفروع
          </span>
          <span>يُغلق القفل تلقائياً عند الخروج</span>
        </div>
      </div>
    </div>
  );
};
