import React, { useState, useEffect } from 'react';
import {
  Lock,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  X,
  EyeOff,
  RefreshCw,
  UserCheck,
  Building2,
  Eye,
} from 'lucide-react';
import { SupplyBranch, BranchVaultCredential } from '../types';
import {
  verifyBranchVaultCredentials,
  validateNewBranchVaultCredentials,
} from '../utils/branchVaultUtils';

interface VaultSecurityGateModalProps {
  isOpen: boolean;
  mode: 'unlock' | 'change_passcode';
  targetLabel: string;
  activeBranchId: string;
  branches: SupplyBranch[];
  globalUsername?: string;
  currentPasscode?: string;
  branchCredentialsMap?: Record<string, BranchVaultCredential>;
  onClose: () => void;
  onUnlockSuccess: () => void;
  onVerifyCredentials?: (params: {
    branchId: string;
    username: string;
    passcode: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onChangeCredentials: (params: {
    targetScope: 'all' | string;
    currentUsername?: string;
    currentPasscode?: string;
    newUsername: string;
    newPasscode: string;
  }) => Promise<void> | void;
}

export const VaultSecurityGateModal: React.FC<VaultSecurityGateModalProps> = ({
  isOpen,
  mode: initialMode,
  targetLabel,
  activeBranchId,
  branches,
  globalUsername,
  currentPasscode,
  branchCredentialsMap,
  onClose,
  onUnlockSuccess,
  onVerifyCredentials,
  onChangeCredentials,
}) => {
  const [activeTab, setActiveTab] = useState<'unlock' | 'change_passcode'>(initialMode);

  // Unlock tab inputs
  const [selectedUnlockBranchId, setSelectedUnlockBranchId] = useState<string>(activeBranchId);
  const [usernameInput, setUsernameInput] = useState('');
  const [showUnlockUsername, setShowUnlockUsername] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  // Change credentials tab inputs
  const [targetScope, setTargetScope] = useState<'all' | string>('all');
  const [oldUsernameInput, setOldUsernameInput] = useState('');
  const [showOldUsername, setShowOldUsername] = useState(false);
  const [oldPasscodeInput, setOldPasscodeInput] = useState('');
  const [showOldPasscode, setShowOldPasscode] = useState(false);
  const [newUsernameInput, setNewUsernameInput] = useState('');
  const [showNewUsername, setShowNewUsername] = useState(false);
  const [newPasscodeInput, setNewPasscodeInput] = useState('');
  const [showNewPasscode, setShowNewPasscode] = useState(false);
  const [confirmPasscodeInput, setConfirmPasscodeInput] = useState('');
  const [showConfirmPasscode, setShowConfirmPasscode] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      setSelectedUnlockBranchId(activeBranchId);
      setTargetScope('all');
      setUsernameInput('');
      setPasscodeInput('');
      setOldUsernameInput('');
      setOldPasscodeInput('');
      setNewUsernameInput('');
      setNewPasscodeInput('');
      setConfirmPasscodeInput('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode, activeBranchId]);

  if (!isOpen) return null;

  const activeBranchObj = branches.find((b) => b.id === selectedUnlockBranchId);

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (onVerifyCredentials) {
      setIsSaving(true);
      try {
        const remoteCheck = await onVerifyCredentials({
          branchId: selectedUnlockBranchId,
          username: usernameInput,
          passcode: passcodeInput,
        });
        if (!remoteCheck.ok) {
          setErrorMsg(
            remoteCheck.error ||
              'اسم المستخدم (Username) أو الرقم السري (Password) غير صحيح! الدخول محظور تماماً لغير المصرح لهم.'
          );
          setPasscodeInput('');
          return;
        }
        onUnlockSuccess();
        return;
      } finally {
        setIsSaving(false);
      }
    }

    const isValid = verifyBranchVaultCredentials({
      branchId: selectedUnlockBranchId,
      enteredUsername: usernameInput,
      enteredPassword: passcodeInput,
      branches,
      credentialsMap: branchCredentialsMap,
      fallbackUsername: globalUsername,
      fallbackPasscode: currentPasscode,
    });

    if (!isValid) {
      setErrorMsg(
        'اسم المستخدم (Username) أو الرقم السري (Password) غير صحيح! الدخول محظور تماماً لغير المصرح لهم.'
      );
      setPasscodeInput('');
      return;
    }

    onUnlockSuccess();
  };

  const handleChangeCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedNewUser = newUsernameInput.trim();
    const trimmedNewPass = newPasscodeInput.trim();
    const trimmedConfirmPass = confirmPasscodeInput.trim();
    if (!oldPasscodeInput.trim() || !trimmedNewUser || !trimmedNewPass) {
      setErrorMsg('يرجى إدخال جميع الحقول المطلوبة.');
      return;
    }
    if (trimmedNewPass.length < 4) {
      setErrorMsg('الرقم السري الجديد يجب أن لا يقل عن 4 أحرف/أرقام.');
      return;
    }
    if (trimmedNewPass !== trimmedConfirmPass) {
      setErrorMsg('تأكيد الرقم السري الجديد غير مطابق.');
      return;
    }

    if (!onVerifyCredentials) {
      const verifyBranchId = targetScope === 'all' ? activeBranchId : targetScope;
      const validationRes = validateNewBranchVaultCredentials({
        branchId: verifyBranchId,
        currentUsername: oldUsernameInput,
        currentPassword: oldPasscodeInput,
        newUsername: trimmedNewUser,
        newPassword: trimmedNewPass,
        confirmNewPassword: trimmedConfirmPass,
        branches,
        credentialsMap: branchCredentialsMap,
        fallbackUsername: globalUsername,
        fallbackPasscode: currentPasscode,
      });

      if (!validationRes.valid) {
        setErrorMsg(validationRes.error || 'بيانات غير صالحة.');
        return;
      }
    }

    try {
      setIsSaving(true);
      await onChangeCredentials({
        targetScope,
        currentUsername: oldUsernameInput.trim(),
        currentPasscode: oldPasscodeInput.trim(),
        newUsername: trimmedNewUser,
        newPasscode: trimmedNewPass,
      });
      setOldUsernameInput('');
      setOldPasscodeInput('');
      setNewUsernameInput('');
      setNewPasscodeInput('');
      setConfirmPasscodeInput('');
      const targetName =
        targetScope === 'all'
          ? 'جميع الفروع بالكامل'
          : branches.find((b) => b.id === targetScope)?.name || targetScope;
      setSuccessMsg(
        `تم تحديث بيانات الحماية (Username & Password) بنجاح على (${targetName}) ومزامنتها سحابياً.`
      );
      setTimeout(() => {
        setActiveTab('unlock');
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ بيانات الحماية الجديدة.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0A1628]/85 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div
        data-testid="vault-security-modal"
        className="relative w-full max-w-lg rounded-3xl bg-[#0A1628] border border-[#D4AF37]/40 shadow-[0_25px_80px_-15px_rgba(10,22,40,0.9)] overflow-hidden text-white animate-in fade-in zoom-in-95 duration-200 my-auto"
      >
        {/* Top Glowing Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-l from-[#D4AF37] via-[#0D9488] to-[#D4AF37]" />

        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-[#0F1E36] to-[#0A1628]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shadow-lg">
              <Lock className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                بوابة الحماية السرية
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#F43F5E]/20 text-rose-300 border border-[#F43F5E]/40">
                  سري للغاية
                </span>
              </h2>
              <p className="text-xs font-bold text-slate-300 mt-0.5">{targetLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('unlock');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border cursor-pointer ${
              activeTab === 'unlock'
                ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-lg shadow-[#0D9488]/25'
                : 'bg-[#0F1E36] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            فتح القفل (Username & Password)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('change_passcode');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            data-testid="vault-switch-change-passcode"
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all border cursor-pointer ${
              activeTab === 'change_passcode'
                ? 'bg-[#D4AF37] text-[#0A1628] border-[#D4AF37] shadow-lg shadow-[#D4AF37]/25'
                : 'bg-[#0F1E36] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            تغيير اليوزر والباسورد
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="bg-[#0F1E36] border border-[#D4AF37]/30 rounded-2xl p-3.5 flex items-start gap-3">
            <EyeOff className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-slate-200 leading-relaxed">
              جميع بيانات الدخول مشفرة ومخفية بالكامل ولا تظهر لأي مستخدم على الشاشة حفاظاً على قاعدة البيانات من التلاعب.
            </p>
          </div>

          {errorMsg && (
            <div
              data-testid="vault-error-msg"
              className="bg-rose-950/90 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2.5"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              data-testid="vault-success-msg"
              className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'unlock' ? (
            <form onSubmit={handleUnlockSubmit} className="space-y-4" autoComplete="off">
              {/* Branch Selection */}
              <div>
                <label className="block text-xs font-black text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                  الفرع التمويني المطلوب التصريح له
                </label>
                <select
                  data-testid="vault-branch-select"
                  value={selectedUnlockBranchId}
                  onChange={(e) => setSelectedUnlockBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#0F1E36] border border-white/15 text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id} className="bg-[#0A1628] text-white">
                      {branch.name} {branch.id === activeBranchId ? '(الفرع الحالي)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hidden/Masked Username Input */}
              <div>
                <label className="block text-xs font-black text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                    اسم المستخدم السري (Username)
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> مخفي تماماً
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showUnlockUsername ? 'text' : 'password'}
                    data-testid="vault-username-input"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                    autoComplete="new-password"
                    className="w-full px-4 py-3 pl-11 rounded-2xl bg-[#0F1E36] border border-white/15 text-white text-center text-base font-black tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUnlockUsername((prev) => !prev)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-1"
                    title={showUnlockUsername ? 'إخفاء اسم المستخدم' : 'إظهار اسم المستخدم'}
                    aria-label={showUnlockUsername ? 'إخفاء اسم المستخدم' : 'إظهار اسم المستخدم'}
                  >
                    {showUnlockUsername ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Hidden/Masked Password Input */}
              <div>
                <label className="block text-xs font-black text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
                    كلمة المرور السرية (Password)
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> مخفي تماماً
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    data-testid="vault-passcode-input"
                    value={passcodeInput}
                    onChange={(e) => setPasscodeInput(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-4 py-3 pl-11 rounded-2xl bg-[#0F1E36] border border-white/15 text-white text-center text-base font-black tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-1"
                    title={showPasscode ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  data-testid="vault-unlock-submit"
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-l from-[#0D9488] to-[#10B981] hover:from-[#0F766E] hover:to-[#059669] text-white font-black text-sm shadow-lg shadow-[#0D9488]/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-5 h-5" />
                  تأكيد الدخول ({activeBranchObj?.name || 'الفرع'})
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs border border-white/10 transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleChangeCredentialsSubmit} className="space-y-3.5" autoComplete="off">
              {/* Target Scope: All Branches vs Specific Branch */}
              <div>
                <label className="block text-xs font-black text-[#D4AF37] mb-1">
                  نطاق تطبيق اسم المستخدم وكلمة المرور الجديدة
                </label>
                <select
                  data-testid="vault-scope-select"
                  value={targetScope}
                  onChange={(e) => setTargetScope(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F1E36] border border-[#D4AF37]/40 text-white font-black text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                >
                  <option value="all" className="bg-[#0A1628] text-[#D4AF37] font-black">
                    تعميم وتغيير على جميع الفروع بالكامل ({branches.length} فروع)
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id} className="bg-[#0A1628] text-white">
                      تخصيص لفرع: {branch.name} فقط
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">
                    اسم المستخدم الحالي (Username)
                  </label>
                  <div className="relative">
                    <input
                      type={showOldUsername ? 'text' : 'password'}
                      data-testid="vault-old-username-input"
                      value={oldUsernameInput}
                      onChange={(e) => setOldUsernameInput(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2 pl-10 rounded-xl bg-[#0F1E36] border border-white/15 text-white text-center text-sm font-black tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldUsername((prev) => !prev)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                      title={showOldUsername ? 'إخفاء' : 'إظهار'}
                    >
                      {showOldUsername ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">
                    الرقم السري الحالي (Password)
                  </label>
                  <div className="relative">
                    <input
                      type={showOldPasscode ? 'text' : 'password'}
                      data-testid="vault-old-passcode-input"
                      value={oldPasscodeInput}
                      onChange={(e) => setOldPasscodeInput(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2 pl-10 rounded-xl bg-[#0F1E36] border border-white/15 text-white text-center text-sm font-black tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPasscode((prev) => !prev)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                      title={showOldPasscode ? 'إخفاء' : 'إظهار'}
                    >
                      {showOldPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-300 mb-1">
                  اسم المستخدم السري الجديد (New Username)
                </label>
                <div className="relative">
                  <input
                    type={showNewUsername ? 'text' : 'password'}
                    data-testid="vault-new-username-input"
                    value={newUsernameInput}
                    onChange={(e) => setNewUsernameInput(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3.5 py-2 pl-10 rounded-xl bg-[#0F1E36] border border-white/15 text-white text-center text-sm font-black tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUsername((prev) => !prev)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                    title={showNewUsername ? 'إخفاء' : 'إظهار'}
                  >
                    {showNewUsername ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">
                    الرقم السري الجديد (New Password)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPasscode ? 'text' : 'password'}
                      data-testid="vault-new-passcode-input"
                      value={newPasscodeInput}
                      onChange={(e) => setNewPasscodeInput(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2 pl-10 rounded-xl bg-[#0F1E36] border border-white/15 text-white text-center text-sm font-black tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPasscode((prev) => !prev)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                      title={showNewPasscode ? 'إخفاء' : 'إظهار'}
                    >
                      {showNewPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">
                    تأكيد الرقم السري الجديد
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPasscode ? 'text' : 'password'}
                      data-testid="vault-confirm-passcode-input"
                      value={confirmPasscodeInput}
                      onChange={(e) => setConfirmPasscodeInput(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2 pl-10 rounded-xl bg-[#0F1E36] border border-white/15 text-white text-center text-sm font-black tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPasscode((prev) => !prev)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer p-0.5"
                      title={showConfirmPasscode ? 'إخفاء' : 'إظهار'}
                    >
                      {showConfirmPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                data-testid="vault-save-new-passcode"
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-l from-[#D4AF37] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#0A1628] font-black text-sm shadow-lg shadow-[#D4AF37]/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {isSaving
                  ? 'جاري التشفير والحفظ السحابي...'
                  : targetScope === 'all'
                  ? 'حفظ وتعميم اليوزر والباسورد على جميع الفروع'
                  : 'حفظ اليوزر والباسورد للفرع المحدد'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
