import React, { useState } from 'react';
import { AppUser, SupplyBranch, SystemConfig, UserRoleType } from '../types';
import { INITIAL_USERS } from '../defaultData';
import { normalizePasscodeInput } from '../utils/branchVaultUtils';
import { getSecurityShieldHeaders, setAuthSessionToken } from '../lib/supabase.ts';
import {
  ShieldCheck,
  Lock,
  User,
  LogIn,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Building2,
  Award,
  Layers,
  UserPlus,
  Eye,
  EyeOff,
} from 'lucide-react';

interface LoginModalProps {
  systemConfig?: SystemConfig;
  users: AppUser[];
  logoutReason?: string | null;
  branches?: SupplyBranch[];
  activeBranchId?: string;
  onSelectBranch?: (branchId: string) => void;
  onLoginSuccess?: (user: AppUser) => void;
  onLogin?: (user: AppUser) => void;
  onRegisterUser?: (newUser: AppUser) => Promise<any> | void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  systemConfig,
  users,
  logoutReason,
  branches = [],
  activeBranchId = 'branch-mahalla',
  onSelectBranch,
  onLoginSuccess,
  onLogin,
  onRegisterUser,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [registerRole, setRegisterRole] = useState<UserRoleType>('viewer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const triggerLogin = onLoginSuccess || onLogin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSuccessMsg(null);

    const trimmedUser = username.trim().toLowerCase();
    const trimmedPass = password.trim();
    const normalizedInputPass = normalizePasscodeInput(trimmedPass);

    if (mode === 'register') {
      if (!fullName.trim() || !trimmedUser || !trimmedPass) {
        setError('يرجى إدخال الاسم بالكامل واسم المستخدم وكلمة المرور');
        return;
      }
      if (
        normalizedInputPass.length < 8 ||
        !/[a-zA-Z\u0600-\u06FF]/.test(normalizedInputPass) ||
        !/\d/.test(normalizedInputPass)
      ) {
        setError('كلمة المرور يجب أن تتكون من 8 أحرف على الأقل وتحتوي على أحرف وأرقام.');
        return;
      }

      const safeRegisterRole: UserRoleType =
        registerRole === 'super_admin' || registerRole === 'admin' ? 'viewer' : registerRole;

      const isHttpOriginReg =
        typeof window !== 'undefined' &&
        (window.location.protocol === 'http:' || window.location.protocol === 'https:');

      if (isHttpOriginReg) {
        setIsSubmitting(true);
        try {
          const resp = await fetch('/api/auth/register', {
            method: 'POST',
            credentials: 'same-origin',
            headers: getSecurityShieldHeaders(true),
            body: JSON.stringify({
              branchId: activeBranchId || 'branch-mahalla',
              username: username.trim(),
              fullName: fullName.trim(),
              password: trimmedPass,
              role: safeRegisterRole,
              department:
                activeBranch?.name ||
                systemConfig?.administrationTitle ||
                'إدارة تموين مركز المحلة الكبرى',
            }),
          });
          const data = await resp.json().catch(() => null);
          if (resp.ok && data?.success && data?.user) {
            setPassword('');
            setFullName('');
            setUsername('');
            setShowPassword(false);
            if (onRegisterUser) {
              await onRegisterUser({
                ...data.user,
                password: '',
              });
            }
            setSuccessMsg('تم إنشاء الحساب بنجاح وحفظه في قاعدة البيانات! يمكنك تسجيل الدخول الآن.');
            setMode('login');
            setIsSubmitting(false);
            return;
          }
          if (resp.status >= 400 && resp.status < 500) {
            setError(data?.error || 'تعذر إنشاء الحساب الجديد.');
            setIsSubmitting(false);
            return;
          }
        } catch {
          // Offline fallback handled below
        } finally {
          setIsSubmitting(false);
        }
      }

      const poolOfUsers = Array.isArray(users) && users.length > 0 ? users : INITIAL_USERS;
      const exists = poolOfUsers.some((u) => (u.username || '').toLowerCase() === trimmedUser);
      if (exists) {
        setError('اسم المستخدم مسجل بالفعل، اختر اسماً آخر.');
        return;
      }
      const newUser: AppUser = {
        id: `user-${Date.now()}`,
        username: username.trim(),
        password: trimmedPass,
        fullName: fullName.trim(),
        role: safeRegisterRole,
        department:
          activeBranch?.name ||
          systemConfig?.administrationTitle ||
          'إدارة تموين مركز المحلة الكبرى',
        isActive: true,
        createdAt: new Date().toISOString().split('T')[0],
      };
      if (onRegisterUser) {
        await onRegisterUser(newUser);
      }
      setPassword('');
      setFullName('');
      setUsername('');
      setShowPassword(false);
      setSuccessMsg('تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن.');
      setMode('login');
      return;
    }

    if (!trimmedUser || !trimmedPass) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    // 1. Primary server authentication (scrypt + HMAC Bearer session token)
    const isHttpOrigin =
      typeof window !== 'undefined' &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:');
    if (isHttpOrigin) {
      setIsSubmitting(true);
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: getSecurityShieldHeaders(true),
          body: JSON.stringify({
            branchId: activeBranchId || 'branch-mahalla',
            username: username.trim(),
            password: trimmedPass,
          }),
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.success && data?.user && data?.token) {
          setAuthSessionToken(data.token);
          setPassword('');
          setShowPassword(false);
          setIsSubmitting(false);
          triggerLogin?.({
            ...data.user,
            isActive: data.user.isActive !== false,
          });
          return;
        }
        if (
          resp.status === 400 ||
          resp.status === 401 ||
          resp.status === 403 ||
          resp.status === 429
        ) {
          setIsSubmitting(false);
          setError(data?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
          return;
        }
      } catch {
        // Fall through to offline fallback ONLY when network/server is unreachable
      } finally {
        setIsSubmitting(false);
      }
    }

    // 2. Offline / file:// fallback ONLY when server is unreachable
    const effectiveUsers = Array.isArray(users) && users.length > 0 ? users : INITIAL_USERS;
    const matched = effectiveUsers.find((u) => {
      const uName = (u.username || '').trim().toLowerCase();
      const uFullName = (u.fullName || '').trim().toLowerCase();
      const nameMatches = uName === trimmedUser || uFullName === trimmedUser;
      if (!nameMatches) return false;

      const uPass = (u.password || '').trim();
      const uPassNorm = normalizePasscodeInput(uPass);

      if (uPass && (uPass === trimmedPass || uPassNorm === normalizedInputPass)) {
        return true;
      }
      return false;
    });

    if (!matched) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة');
      return;
    }

    if (matched.isActive === false) {
      setError('هذا الحساب موقوف حالياً. يرجى مراجعة مدير النظام.');
      return;
    }

    setPassword('');
    setShowPassword(false);
    triggerLogin?.({
      ...matched,
      isActive: true,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-[#0A1628]"
      dir="rtl"
    >
      {/* Luxury Animated Mesh Backdrop (Midnight Navy + Royal Teal + Champagne Gold) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full bg-[#0D9488]/25 blur-[130px]" />
        <div className="absolute top-1/3 -left-32 w-[480px] h-[480px] rounded-full bg-[#D4AF37]/20 blur-[140px]" />
        <div className="absolute -bottom-40 right-1/4 w-[560px] h-[560px] rounded-full bg-[#10B981]/15 blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 2px 2px, rgba(212,175,55,0.8) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Main Executive Glass Container */}
      <div className="relative z-10 w-full max-w-5xl rounded-[32px] border border-[#D4AF37]/35 bg-[#0F1E36]/85 backdrop-blur-2xl shadow-[0_32px_90px_-15px_rgba(0,0,0,0.85)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 my-auto">
        {/* Right Column: Official Emblem & Hierarchy */}
        <div className="lg:col-span-6 p-8 sm:p-10 bg-gradient-to-br from-[#0A1628] via-[#0F1E36] to-[#0D9488]/30 border-b lg:border-b-0 lg:border-l border-[#D4AF37]/25 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-56 h-56 rounded-full bg-[#D4AF37]/10 blur-2xl pointer-events-none" />

          <div>
            {/* Official Top Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#FDE68A] text-xs font-black mb-6 shadow-sm">
              <Award className="w-4 h-4 text-[#D4AF37]" />
              <span>جمهورية مصر العربية • وزارة التموين والتجارة الداخلية</span>
            </div>

            {/* Official Golden Eagle / Emblem Card */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#D4AF37] via-amber-400 to-[#0D9488] p-0.5 shadow-xl shadow-[#D4AF37]/20 shrink-0">
                <div className="w-full h-full rounded-[22px] bg-[#0A1628] flex flex-col items-center justify-center text-center p-2">
                  {systemConfig?.logoBase64 ? (
                    <img
                      src={systemConfig.logoBase64}
                      alt="شعار التموين"
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 object-contain"
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-[#D4AF37]" />
                  )}
                  <span className="text-[9px] font-black text-[#FDE68A] mt-0.5 tracking-tighter">
                    تموين الغربية
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-black text-[#D4AF37] tracking-wide">
                  {activeBranch?.governorate ||
                    activeBranch?.governorateTitle ||
                    systemConfig?.governorateTitle ||
                    'محافظة الغربية'}
                </div>
                <h1 className="text-lg sm:text-xl font-black text-white leading-snug">
                  {activeBranch?.directorate ||
                    activeBranch?.directorateTitle ||
                    systemConfig?.directorateTitle ||
                    'مديرية التموين والتجارة الداخلية بالغربية'}
                </h1>
                <div className="text-base sm:text-lg font-black text-[#5EEAD4]">
                  {activeBranch?.name ||
                    systemConfig?.administrationTitle ||
                    'إدارة تموين مركز المحلة الكبرى'}
                </div>
              </div>
            </div>

            {/* English Subtitle Banner */}
            <div className="px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-[#D4AF37]/25 mb-6">
              <p className="text-[11px] font-black tracking-[0.18em] text-[#D4AF37] text-center uppercase">
                MINISTRY OF SUPPLY AND INTERNAL TRADE
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 font-bold leading-relaxed">
              المنظومة الرقمية المتكاملة لإدارة ومراجعة المخابز البلدية، حصص الدقيق، المطاحن، الرقابة التموينية، وسجل المديونيات والتحصيل اللحظي عبر السحابة الموحدة.
            </p>
          </div>

          {/* Live Security & Cloud Features */}
          <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
              <div>
                <div className="text-xs font-black text-white">مزامنة سحابية فورية</div>
                <div className="text-[10px] font-bold text-slate-400">تحديث لحظي لجميع الأجهزة</div>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#D4AF37] shrink-0" />
              <div>
                <div className="text-xs font-black text-white">حماية وصلاحيات دقيقة</div>
                <div className="text-[10px] font-bold text-slate-400">تأمين كامل لقواعد البيانات</div>
              </div>
            </div>
          </div>
        </div>

        {/* Left Column: Open Branch Selector & Login Form */}
        <div className="lg:col-span-6 p-8 sm:p-10 bg-[#FAF8F5] text-[#0A1628] flex flex-col justify-center">
          <div className="mb-5">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#0D9488] bg-[#0D9488]/10 px-3 py-1 rounded-full border border-[#0D9488]/25 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              بوابة الدخول الرسمية للمنظومة
            </span>
            <h2 className="text-2xl font-black text-[#0A1628]">
              {mode === 'login' ? 'تسجيل الدخول إلى النظام' : 'تسجيل حساب مستخدم جديد'}
            </h2>
            <p className="text-xs font-bold text-slate-500 mt-1">
              اختر الإدارة التموينية أو الفرع مباشرة من القائمة ثم سجل الدخول
            </p>
          </div>

          {logoutReason && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{logoutReason}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {/* Open Branch Selector on the Interface (No Password Required to Switch Branch) */}
            {branches.length > 0 && onSelectBranch && (
              <div className="p-3.5 rounded-2xl bg-white border-2 border-[#0D9488]/30 shadow-xs">
                <label
                  htmlFor="login-branch-select"
                  className="block text-xs font-black text-[#0A1628] mb-1.5 flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#0D9488]" />
                    الإدارة التموينية / الفرع (متاح للاختيار المباشر)
                  </span>
                  <span className="text-[10px] font-black text-[#0D9488] bg-[#0D9488]/10 px-2 py-0.5 rounded-full">
                    {branches.length} فروع
                  </span>
                </label>
                <select
                  id="login-branch-select"
                  data-testid="login-branch-select"
                  value={activeBranchId}
                  onChange={(e) => onSelectBranch(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF8F5] border border-slate-300 text-[#0A1628] font-black text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] cursor-pointer"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} — ({branch.governorate || branch.governorateTitle || 'محافظة الغربية'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-[#0A1628] mb-1.5">
                    الاسم الرباعي للموظف
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    data-testid="register-fullname-input"
                    placeholder="أدخل الاسم بالكامل"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-300 text-[#0A1628] font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-register-role-select"
                    className="block text-xs font-black text-[#0A1628] mb-1.5"
                  >
                    الصلاحية / الدور الوظيفي المطلوب *
                  </label>
                  <select
                    id="login-register-role-select"
                    data-testid="login-register-role-select"
                    value={registerRole}
                    onChange={(e) => setRegisterRole(e.target.value as UserRoleType)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-300 text-[#0A1628] font-black text-xs focus:outline-none focus:ring-2 focus:ring-[#0D9488] cursor-pointer"
                  >
                    <option value="reader">قارئ فقط — Reader (عرض بدون تعديل)</option>
                    <option value="viewer">مشاهد — Viewer (استعراض وطباعة فقط)</option>
                    <option value="data_entry">مسئول إدخال بيانات — Data Entry</option>
                    <option value="inspector">مفتش رقابة وتموين — Inspector</option>
                    <option value="auditor">مراجع حسابات ومديونيات — Auditor</option>
                    <option value="supervisor">مشرف عام — Supervisor</option>
                  </select>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">
                    صلاحيات مدير النظام (Admin / Super Admin) يتم منحها من داخل لوحة المستخدمين بواسطة مدير عام النظام فقط.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-[#0A1628] mb-1.5">
                اسم المستخدم
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#0D9488] absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="tamween_login_user"
                  data-testid="login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  autoComplete="off"
                  className="w-full pr-10 pl-4 py-3 rounded-2xl bg-white border border-slate-300 text-[#0A1628] font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-[#0D9488] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-[#0A1628] mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#D4AF37] absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="tamween_login_pass"
                  data-testid="login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full pr-10 pl-11 py-3 rounded-2xl bg-white border border-slate-300 text-[#0A1628] font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-[#0D9488] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-1">

              {onRegisterUser && (
                <button
                  type="button"
                  data-testid="toggle-login-register-mode-btn"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setPassword('');
                    setShowPassword(false);
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-black text-[#0D9488] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{mode === 'login' ? 'تسجيل مستخدم جديد' : 'العودة لتسجيل الدخول'}</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              data-testid="login-submit-btn"
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-l from-[#0A1628] via-[#0F1E36] to-[#0D9488] hover:from-[#0F1E36] hover:to-[#0F766E] text-white font-black text-sm shadow-xl shadow-[#0A1628]/20 border border-[#D4AF37]/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-5 h-5 text-[#D4AF37]" />
              <span>{mode === 'login' ? 'دخول إلى المنظومة' : 'إنشاء الحساب وحفظه بالسحابة'}</span>
            </button>



            {/* Designer & Engineer Signature */}
            <div className="pt-3 border-t border-slate-200 mt-2 text-center">
              <span className="text-xs font-black text-[#0A1628] bg-amber-50/90 py-1.5 px-3.5 rounded-xl border border-[#D4AF37]/40 inline-flex items-center justify-center gap-1.5 shadow-2xs">
                <span>تنفيذ وتصميم م/ احمد الحسيني 01004414038</span>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
