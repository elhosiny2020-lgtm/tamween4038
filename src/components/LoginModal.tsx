import React, { useState, useEffect } from 'react';
import { AppUser, SystemConfig, SupplyBranch } from '../types';
import { DEFAULT_OFFICIAL_LOGO } from '../defaultData';
import { ParticleCanvas } from './ParticleCanvas';
import { CartoonBakeryScene } from './CartoonBakeryScene';
import { Lock, User, ShieldCheck, LogIn, AlertCircle, Building2, KeyRound, Download, ChevronDown } from 'lucide-react';
import { downloadWindowsExeLauncher } from '../utils/htmlExporter';

interface LoginModalProps {
  systemConfig: SystemConfig;
  users: AppUser[];
  branches?: SupplyBranch[];
  activeBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
  onOpenBranchesManager?: () => void;
  onLoginSuccess: (user: AppUser) => void;
  onRegisterUser?: (newUser: AppUser) => void;
  logoutReason?: string | null;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  systemConfig,
  users,
  branches = [],
  activeBranchId = 'branch-mahalla',
  onSelectBranch,
  onLoginSuccess,
  logoutReason,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userFieldUnlocked, setUserFieldUnlocked] = useState(false);
  const [passFieldUnlocked, setPassFieldUnlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Always clear username & password when the login screen mounts or on logout so user types it manually every time
  useEffect(() => {
    setUsername('');
    setPassword('');
    setUserFieldUnlocked(false);
    setPassFieldUnlocked(false);
    try {
      localStorage.removeItem('TAMWEEN_LAST_USERNAME');
      sessionStorage.removeItem('TAMWEEN_LAST_USERNAME');
    } catch {}
  }, [logoutReason]);

  const activeBranchObj = branches.find((b) => b.id === activeBranchId);
  const activeBranchTitle = activeBranchObj?.name || systemConfig.administrationTitle;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMsg('يرجى كتابة اسم المستخدم وكلمة المرور يدوياً للدخول');
      return;
    }

    const found = users.find(
      (u) =>
        (u.username.toLowerCase() === trimmedUser.toLowerCase() ||
          (u.gmailEmail && u.gmailEmail.toLowerCase() === trimmedUser.toLowerCase())) &&
        u.password === password
    );

    if (found) {
      setSuccessMsg(`تم التحقق بنجاح، جاري الدخول إلى (${activeBranchTitle})...`);
      const authenticatedUser = { ...found };
      setUsername('');
      setPassword('');
      setTimeout(() => {
        onLoginSuccess(authenticatedUser);
      }, 150);
    } else {
      setErrorMsg('بيانات الدخول غير صحيحة، يرجى التحقق من اسم المستخدم والرقم السري');
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 overflow-hidden font-sans">
      {/* Particle Canvas */}
      <ParticleCanvas />

      {/* Modern Ambient Glow Accents */}
      <div className="absolute top-1/6 left-1/5 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/6 right-1/5 w-[28rem] h-[28rem] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-10 my-4">
        {/* Official Ministry Emblem Shield Section */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center">
          <CartoonBakeryScene />
        </div>

        {/* Login Card */}
        <div className="w-full lg:w-1/2 max-w-md bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border-2 border-amber-500/30 overflow-hidden transform transition-all duration-300">
          {/* Top Header with Emblem */}
          <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950 p-5 text-center text-white relative border-b border-amber-500/40">
            <div className="flex justify-center mb-2.5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-xl border-2 border-amber-400 flex items-center justify-center transform hover:scale-105 transition-transform duration-300">
                  <img
                    src={systemConfig.logoBase64 || DEFAULT_OFFICIAL_LOGO}
                    alt="شعار وزارة التموين والتجارة الداخلية"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 p-1 bg-amber-500 rounded-lg text-slate-950">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <div className="inline-block bg-amber-400 px-3 py-0.5 rounded-full shadow-sm mb-1 border border-amber-300">
              <h2 className="text-[11px] font-black text-black tracking-wider">
                جمهورية مصر العربية • وزارة التموين والتجارة الداخلية
              </h2>
            </div>
            <h1 className="text-sm font-black text-white leading-snug">
              {activeBranchObj?.governorateTitle || systemConfig.governorateTitle} — {activeBranchObj?.directorateTitle || systemConfig.directorateTitle}
            </h1>
            <div className="inline-block mt-1.5 px-3.5 py-1 bg-amber-400 border border-amber-300 rounded-full text-xs font-black text-black shadow-sm">
              {activeBranchTitle}
            </div>
          </div>

          {/* Branch Dropdown Selection on Login Interface (Only choosing branch/administration) */}
          <div className="bg-indigo-950/95 text-white p-4 border-b-2 border-amber-400/70" dir="rtl">
            <label
              htmlFor="login-branch-select"
              className="block text-xs font-black text-amber-300 mb-2 flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>اختر الإدارة التموينية أو الفرع للدخول عليه:</span>
            </label>

            <div className="relative">
              <select
                id="login-branch-select"
                value={activeBranchId}
                onChange={(e) => onSelectBranch && onSelectBranch(e.target.value)}
                className="w-full appearance-none bg-slate-900 hover:bg-slate-800 text-amber-300 font-black text-xs sm:text-sm rounded-xl px-3.5 py-2.5 pl-9 border-2 border-amber-400/80 shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer transition"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id} className="bg-slate-900 text-white font-bold">
                    {branch.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-amber-400">
                <ChevronDown className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>

            <p className="text-[10px] font-bold text-indigo-200 mt-2 text-center">
              🔒 كل إدارة تموينية مستقلة ومنفصلة تماماً في البيانات والمخابز والمديونيات
            </p>
          </div>

          {/* Header Bar */}
          <div className="flex border-b border-slate-200 bg-slate-100/90 p-1.5">
            <div className="w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 bg-amber-400 text-black shadow-sm border border-amber-300">
              <LogIn className="w-4 h-4 text-black" />
              <span className="text-black font-black">بوابة تسجيل الدخول المؤمنة</span>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-6">
            {logoutReason && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs">
                <Lock className="w-4 h-4 flex-shrink-0 text-amber-700 icon-float" />
                <span>{logoutReason}</span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-shake shadow-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4" autoComplete="off" noValidate>
              {/* Decoy inputs to prevent browser password managers from prefilling credentials */}
              <input type="text" name="decoy_username_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
              <input type="password" name="decoy_password_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />

              <div>
                <label htmlFor="manual_auth_user_input" className="block text-xs font-black text-slate-700 mb-1.5">
                  اسم المستخدم
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    name="manual_auth_user_input"
                    id="manual_auth_user_input"
                    required
                    readOnly={!userFieldUnlocked}
                    onFocus={() => setUserFieldUnlocked(true)}
                    onMouseDown={() => setUserFieldUnlocked(true)}
                    onTouchStart={() => setUserFieldUnlocked(true)}
                    onKeyDown={() => setUserFieldUnlocked(true)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-form-type="other"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="اكتب اسم المستخدم يدوياً..."
                    className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-right shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="manual_auth_pass_input" className="block text-xs font-black text-slate-700 mb-1.5">
                  الرقم السري / كلمة المرور
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    name="manual_auth_pass_input"
                    id="manual_auth_pass_input"
                    required
                    readOnly={!passFieldUnlocked}
                    onFocus={() => setPassFieldUnlocked(true)}
                    onMouseDown={() => setPassFieldUnlocked(true)}
                    onTouchStart={() => setPassFieldUnlocked(true)}
                    onKeyDown={() => setPassFieldUnlocked(true)}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-form-type="other"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="اكتب الرقم السري..."
                    className="w-full pr-10 pl-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all text-right shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 hover:from-amber-300 hover:to-amber-500 text-black rounded-xl text-xs font-black shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] border border-amber-300"
              >
                <KeyRound className="w-4 h-4 text-black stroke-[2.5]" />
                <span className="text-black font-black text-sm">تسجيل الدخول والبدء في العمل</span>
              </button>

              {/* Direct Download EXE Application Button (تحميل المنظومة بالكامل على ملف EXE للويندوز) */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await downloadWindowsExeLauncher();
                  }}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-red-600 via-rose-700 to-red-600 hover:from-red-500 hover:to-rose-600 text-white rounded-xl text-xs font-black shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] border border-red-400/80 group"
                  title="انقر لتحميل ملف تشغيل الويندوز المباشر (EXE) للعمل على الكمبيوتر بدون إنترنت"
                >
                  <Download className="w-4 h-4 text-amber-300 stroke-[2.5] transition-transform duration-300 group-hover:translate-y-0.5" />
                  <span className="text-white font-black text-xs">تحميل المنظومة بالكامل على ملف (EXE)</span>
                </button>
              </div>
            </form>

            {/* Attribution Watermark */}
            <div className="mt-5 pt-3.5 border-t border-slate-200 text-center">
              <p className="text-[11px] font-black text-slate-600 bg-amber-50/70 border border-amber-200/60 rounded-lg py-1.5 px-2">
                تنفيذ وتصميم م/ أحمد الحسيني - تليفون: 01004414038
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
