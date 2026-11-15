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
  UserCheck,
  Layers,
} from 'lucide-react';
import type { SupplyBranch, BranchVaultCredential } from '../types';
import {
  DEFAULT_BRANCH_ID,
  deduplicateSupplyBranches,
  getBranchVaultCredentialsMap,
  verifyBranchVaultCredentials,
  validateNewBranchVaultCredentials,
  maskSecretValue,
} from '../utils/branchVaultUtils';

interface VaultSecurityGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSection: 'backup' | 'branches' | 'both';
  targetLabel?: string;
  initialMode?: 'unlock' | 'change';
  initialTargetBranchId?: string | 'ALL';
  activeBranchId?: string;
  branches?: SupplyBranch[];
  branchVaultCredentials?: Record<string, BranchVaultCredential>;
  configuredUsername?: string;
  configuredPasscode: string;
  isVaultUnlocked: boolean;
  onUnlockSuccess: (unlockedBranchId?: string) => void;
  onLockVault: () => void;
  onChangePasscode: (
    newPasscode: string,
    newUsername?: string,
    targetBranchId?: string | 'ALL'
  ) => Promise<void> | void;
}

export const VaultSecurityGateModal: React.FC<VaultSecurityGateModalProps> = ({
  isOpen,
  onClose,
  targetSection,
  targetLabel,
  initialMode = 'unlock',
  initialTargetBranchId = 'ALL',
  activeBranchId = DEFAULT_BRANCH_ID,
  branches,
  branchVaultCredentials,
  configuredUsername,
  configuredPasscode,
  isVaultUnlocked,
  onUnlockSuccess,
  onLockVault,
  onChangePasscode,
}) => {
  const cleanBranches = deduplicateSupplyBranches(branches);
  const credentialsMap = getBranchVaultCredentialsMap(
    cleanBranches,
    branchVaultCredentials,
    configuredUsername,
    configuredPasscode
  );

  const [activeTab, setActiveTab] = useState<'unlock' | 'change'>(initialMode);
  const [selectedLoginBranchId, setSelectedLoginBranchId] = useState<string>(
    activeBranchId || DEFAULT_BRANCH_ID
  );
  const [usernameInput, setUsernameInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Change credentials state (per branch or ALL branches)
  const [targetScopeBranchId, setTargetScopeBranchId] = useState<string | 'ALL'>(
    initialTargetBranchId || 'ALL'
  );
  const [currentUsername, setCurrentUsername] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [showChangeCodes, setShowChangeCodes] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedLoginBranchId(activeBranchId || DEFAULT_BRANCH_ID);
      setTargetScopeBranchId(initialTargetBranchId || 'ALL');
      setUsernameInput('');
      setPasscodeInput('');
      setCurrentUsername('');
      setCurrentCode('');
      setNewUsername('');
      setNewCode('');
      setConfirmCode('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setShowPasscode(false);
      setShowChangeCodes(false);
      setActiveTab(initialMode || 'unlock');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [isOpen, activeBranchId, initialMode, initialTargetBranchId]);

  if (!isOpen) return null;

  const currentLoginBranchObj =
    cleanBranches.find((b) => b.id === selectedLoginBranchId) || cleanBranches[0];

  const sectionTitle =
    targetLabel ||
    (targetSection === 'backup'
      ? `قسم الحفظ والنسخ الاحتياطي (${currentLoginBranchObj?.name || ''})`
      : targetSection === 'branches'
      ? 'قسم جميع الفروع والإدارات التموينية'
      : 'قسم الحفظ والنسخ وجميع الفروع');

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const isValidForBranch = verifyBranchVaultCredentials({
      branchId: selectedLoginBranchId,
      enteredUsername: usernameInput,
      enteredPassword: passcodeInput,
      branches: cleanBranches,
      credentialsMap,
      fallbackUsername: configuredUsername,
      fallbackPasscode: configuredPasscode,
    });

    if (!isValidForBranch) {
      setErrorMsg(
        'اسم المستخدم (Username) أو كلمة المرور (Password) غير صحيحة لهذا الفرع! ممنوع الدخول حفاظاً على قاعدة البيانات من التلاعب.'
      );
      return;
    }

    setUsernameInput('');
    setPasscodeInput('');
    onUnlockSuccess(selectedLoginBranchId);
  };

  const handleChangePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const verificationBranchId =
      targetScopeBranchId === 'ALL' ? activeBranchId || DEFAULT_BRANCH_ID : targetScopeBranchId;

    const validation = validateNewBranchVaultCredentials({
      branchId: verificationBranchId,
      currentUsername,
      currentPassword: currentCode,
      newUsername: newUsername || currentUsername || 'admin',
      newPassword: newCode,
      confirmNewPassword: confirmCode,
      branches: cleanBranches,
      credentialsMap,
      fallbackUsername: configuredUsername,
      fallbackPasscode: configuredPasscode,
    });

    if (!validation.valid || !validation.normalizedPassword || !validation.normalizedUsername) {
      setErrorMsg(validation.error || 'تعذر تحديث اسم المستخدم وكلمة المرور.');
      return;
    }

    try {
      setIsSaving(true);
      await onChangePasscode(
        validation.normalizedPassword,
        validation.normalizedUsername,
        targetScopeBranchId
      );
      setCurrentUsername('');
      setCurrentCode('');
      setNewUsername('');
      setNewCode('');
      setConfirmCode('');
      const targetScopeLabel =
        targetScopeBranchId === 'ALL'
          ? `جميع الفروع التموينية (${cleanBranches.length} فروع)`
          : cleanBranches.find((b) => b.id === targetScopeBranchId)?.name || targetScopeBranchId;
      setSuccessMsg(
        `تم تحديث وحفظ الـ Username والـ Password لقسم الحفظ والنسخ على (${targetScopeLabel}) في قاعدة البيانات بنجاح.`
      );
    } catch {
      setErrorMsg('حدث خطأ أثناء حفظ بيانات الحماية الجديدة.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/85 z-[120] flex items-center justify-center p-4 font-sans animate-fade-in overflow-y-auto"
      dir="rtl"
      data-testid="vault-security-gate-modal"
    >
      <div className="bg-gradient-to-b from-slate-900 via-[#0f172a] to-slate-950 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border-2 border-amber-500/40 relative my-auto">
        {/* Decorative top glowing bar */}
        <div className="h-2 w-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500" />

        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-900/50 border border-amber-400/40 shrink-0">
              <ShieldAlert className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  بوابة الحماية السرية لقسم الحفظ والنسخ والفروع
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-red-500/20 text-red-300 border border-red-500/40">
                  Username & Password لكل فرع
                </span>
              </div>
              <p className="text-xs text-amber-300/90 font-bold mt-1">
                حماية مشفرة تمنع ظهور اسم المستخدم أو الباسورد لأي شخص حفاظاً على قاعدة البيانات من التلاعب
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الحماية"
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Protected Target Banner */}
        <div className="px-6 pt-3.5">
          <div className="bg-red-950/50 border border-red-500/40 rounded-2xl p-3 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              {targetSection === 'branches' ? (
                <Building2 className="w-5 h-5" />
              ) : (
                <Database className="w-5 h-5" />
              )}
            </div>
            <div className="text-xs leading-relaxed">
              <div className="font-black text-red-200">
                ممنوع فتح أو تشغيل قسم الحفظ والنسخ أو الفروع بدون Username و Password:
              </div>
              <div className="text-amber-300 font-bold mt-0.5">{sectionTitle}</div>
            </div>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-3.5 flex gap-2">
          <button
            type="button"
            data-testid="vault-mode-unlock-btn"
            onClick={() => {
              setActiveTab('unlock');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all border cursor-pointer ${
              activeTab === 'unlock'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-900/30'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            الدخول (Username & Password)
          </button>
          <button
            type="button"
            data-testid="vault-mode-change-btn"
            onClick={() => {
              setActiveTab('change');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all border cursor-pointer ${
              activeTab === 'change'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-lg shadow-emerald-900/30'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            قائمة الفروع وتغيير الباسورد على جميع الفروع
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
        <div className="p-6 max-h-[72vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'unlock' ? (
            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              {/* Branch Selection Dropdown */}
              <div>
                <label
                  htmlFor="vault-login-branch-select"
                  className="block text-xs font-black text-slate-300 mb-1.5 flex items-center justify-between"
                >
                  <span>1. اختر الفرع التمويني المطلوب فتح قسم الحفظ والنسخ به:</span>
                  <span className="text-[10px] text-emerald-400 font-bold">
                    قائمة الفروع ({cleanBranches.length})
                  </span>
                </label>
                <select
                  id="vault-login-branch-select"
                  data-testid="vault-login-branch-select"
                  value={selectedLoginBranchId}
                  onChange={(e) => setSelectedLoginBranchId(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs font-black text-white outline-none transition-all cursor-pointer"
                >
                  {cleanBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.id === activeBranchId ? '(الفرع النشط حالياً)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Masked Username & Password Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="vault-secret-username-input"
                    className="block text-xs font-black text-slate-200 mb-1.5 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>2. اسم المستخدم (Username):</span>
                    </span>
                    <span className="text-[10px] text-amber-400 font-bold">مخفي وغير مرئي</span>
                  </label>
                  <input
                    id="vault-secret-username-input"
                    data-testid="vault-username-input"
                    type={showPasscode ? 'text' : 'password'}
                    autoComplete="off"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-center text-base font-black text-white tracking-[0.25em] outline-none transition-all placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="vault-secret-passcode-input"
                    className="block text-xs font-black text-slate-200 mb-1.5 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                      <span>3. الباسورد (Password):</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold">مشفر تماماً</span>
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
                      className="w-full bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3 text-center text-base font-black text-white tracking-[0.3em] outline-none transition-all placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode((prev) => !prev)}
                      aria-label={showPasscode ? 'إخفاء البيانات السرية' : 'إظهار البيانات مؤقتاً'}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300 p-1.5 rounded-lg cursor-pointer"
                    >
                      {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="submit"
                  data-testid="vault-unlock-submit-btn"
                  className="flex-1 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3.5 px-5 rounded-2xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  فتح قسم الحفظ والنسخ والدخول الآن
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
            <div className="space-y-4">
              {/* Per-Branch Protected Credentials List (Always Masked!) */}
              <div
                data-testid="vault-branches-credentials-list"
                className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-black text-white">
                      قائمة حماية قسم الحفظ والنسخ في كل فرع من الفروع ({cleanBranches.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    data-testid="vault-target-all-branches-btn"
                    onClick={() => setTargetScopeBranchId('ALL')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-black transition cursor-pointer border ${
                      targetScopeBranchId === 'ALL'
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
                        : 'bg-slate-800 text-amber-300 border-amber-500/40 hover:bg-slate-700'
                    }`}
                  >
                    تغيير وتعميم على جميع الفروع دفعة واحدة
                  </button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {cleanBranches.map((branch) => {
                    const cred = credentialsMap[branch.id];
                    const isSelected = targetScopeBranchId === branch.id;
                    return (
                      <div
                        key={branch.id}
                        data-testid={`vault-branch-row-${branch.id}`}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition ${
                          isSelected
                            ? 'bg-emerald-950/60 border-emerald-500/60 text-white'
                            : 'bg-slate-900/90 border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-black text-white truncate flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{branch.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5 flex items-center gap-3">
                            <span>
                              Username:{' '}
                              <strong className="text-amber-300 font-mono tracking-widest">
                                {maskSecretValue(cred?.username)}
                              </strong>
                            </span>
                            <span>
                              Password:{' '}
                              <strong className="text-emerald-300 font-mono tracking-widest">
                                {maskSecretValue(cred?.password)}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid={`vault-select-branch-cred-${branch.id}`}
                          onClick={() => setTargetScopeBranchId(branch.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black shrink-0 cursor-pointer border transition ${
                            isSelected
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          }`}
                        >
                          {isSelected ? 'محدد للتعديل ✓' : 'تخصيص هذا الفرع'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Change Username & Password Form */}
              <form onSubmit={handleChangePasscodeSubmit} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="vault-target-branch-select"
                    className="block text-xs font-black text-amber-300 mb-1"
                  >
                    نطاق تطبيق الـ Username والـ Password الجديد:
                  </label>
                  <select
                    id="vault-target-branch-select"
                    data-testid="vault-target-branch-select"
                    value={targetScopeBranchId}
                    onChange={(e) => setTargetScopeBranchId(e.target.value)}
                    className="w-full bg-slate-950 border border-amber-500/50 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs font-black text-white outline-none cursor-pointer"
                  >
                    <option value="ALL">
                      تعميم وتغيير على جميع الفروع ({cleanBranches.length} فروع) دفعة واحدة
                    </option>
                    {cleanBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        تخصيص فرع: {b.name} فقط
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="vault-current-username"
                      className="block text-xs font-black text-slate-300 mb-1"
                    >
                      1. اسم المستخدم (Username) الحالي:
                    </label>
                    <input
                      id="vault-current-username"
                      data-testid="vault-current-username-input"
                      type={showChangeCodes ? 'text' : 'password'}
                      autoComplete="off"
                      value={currentUsername}
                      onChange={(e) => setCurrentUsername(e.target.value)}
                      placeholder="Username الحالي (مخفي)"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-3.5 py-2.5 text-sm font-black text-white outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="vault-current-passcode"
                      className="block text-xs font-black text-slate-300 mb-1"
                    >
                      2. الباسورد (Password) الحالي:
                    </label>
                    <input
                      id="vault-current-passcode"
                      data-testid="vault-current-passcode-input"
                      type={showChangeCodes ? 'text' : 'password'}
                      autoComplete="off"
                      value={currentCode}
                      onChange={(e) => setCurrentCode(e.target.value)}
                      placeholder="الباسورد الحالي (مخفي)"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-3.5 py-2.5 text-sm font-black text-white outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="vault-new-username"
                      className="block text-xs font-black text-amber-300 mb-1"
                    >
                      3. اسم المستخدم الجديد:
                    </label>
                    <input
                      id="vault-new-username"
                      data-testid="vault-new-username-input"
                      type={showChangeCodes ? 'text' : 'password'}
                      autoComplete="off"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Username جديد (أو اتركه كما هو)"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm font-black text-white outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="vault-new-passcode"
                      className="block text-xs font-black text-emerald-300 mb-1"
                    >
                      4. الباسورد الجديد (4+ خانات):
                    </label>
                    <input
                      id="vault-new-passcode"
                      data-testid="vault-new-passcode-input"
                      type={showChangeCodes ? 'text' : 'password'}
                      autoComplete="off"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="الباسورد الجديد"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-3.5 py-2.5 text-sm font-black text-white outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="vault-confirm-passcode"
                      className="block text-xs font-black text-emerald-300 mb-1"
                    >
                      5. تأكيد الباسورد الجديد:
                    </label>
                    <input
                      id="vault-confirm-passcode"
                      data-testid="vault-confirm-passcode-input"
                      type={showChangeCodes ? 'text' : 'password'}
                      autoComplete="off"
                      value={confirmCode}
                      onChange={(e) => setConfirmCode(e.target.value)}
                      placeholder="تأكيد الباسورد الجديد"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-400 rounded-xl px-3.5 py-2.5 text-sm font-black text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setShowChangeCodes((prev) => !prev)}
                    className="text-xs font-bold text-slate-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    {showChangeCodes ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    {showChangeCodes
                      ? 'إخفاء الحقول السرية فوراً (عدم التباين)'
                      : 'إظهار الحقول أثناء الكتابة للتحقق فقط'}
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
                  {targetScopeBranchId === 'ALL'
                    ? 'حفظ وتعميم الـ Username والـ Password على جميع الفروع فوراً'
                    : 'حفظ الـ Username والـ Password للفرع المحدد فوراً'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer Security Note */}
        <div className="px-6 py-3 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-bold">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            عدم تباين أو إظهار الـ Username والـ Password لأي شخص نهائياً
          </span>
          <span>حماية مستقلة وموحدة لجميع الفروع</span>
        </div>
      </div>
    </div>
  );
};

