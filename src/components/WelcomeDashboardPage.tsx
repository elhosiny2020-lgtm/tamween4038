import React from 'react';
import { AppUser, Bakery, DebtRecord } from '../types';
import {
  Store,
  Scale,
  Bell,
  Plus,
  Printer,
  Clock,
  Volume2,
  VolumeX,
  AlertTriangle,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  Building2,
  CheckSquare,
  Inbox,
  TrendingUp,
} from 'lucide-react';
import { getExpirationAlerts } from './AlertsModal';

interface WelcomeDashboardPageProps {
  currentUser: AppUser;
  branchName: string;
  governorateTitle: string;
  directorateTitle: string;
  bakeries: Bakery[];
  debts: DebtRecord[];
  highDebtCount: number;
  unreadInboxCount: number;
  pendingTasksCount: number;
  isAudioMuted: boolean;
  alertTime: string;
  onToggleAudioMute: () => void;
  onRegisterNewBakery: () => void;
  onOpenAlerts: () => void;
  onOpenDailyBriefing: () => void;
  onOpenAlertSettings: () => void;
  onNavigateBakeries: () => void;
  onNavigateDebts: () => void;
  onNavigateReports: () => void;
  onOpenDailyTasks: () => void;
  onOpenInbox: () => void;
}

export const WelcomeDashboardPage: React.FC<WelcomeDashboardPageProps> = ({
  currentUser,
  branchName,
  governorateTitle,
  directorateTitle,
  bakeries,
  debts,
  highDebtCount,
  unreadInboxCount,
  pendingTasksCount,
  isAudioMuted,
  alertTime,
  onToggleAudioMute,
  onRegisterNewBakery,
  onOpenAlerts,
  onOpenDailyBriefing,
  onOpenAlertSettings,
  onNavigateBakeries,
  onNavigateDebts,
  onNavigateReports,
  onOpenDailyTasks,
  onOpenInbox,
}) => {
  const expirationAlerts = React.useMemo(() => getExpirationAlerts(bakeries), [bakeries]);
  const expiredDocsCount = expirationAlerts.filter((a) => a.isExpired).length;
  const expiringSoonCount = expirationAlerts.filter((a) => !a.isExpired).length;

  const debtSummary = React.useMemo(() => {
    const remainingByBakery: Record<string, number> = {};
    let totalRemaining = 0;
    debts.forEach((d) => {
      const rem = Number(d.netRemainingDebt) || 0;
      totalRemaining += rem;
      if (rem > 0) {
        remainingByBakery[d.bakeryId] = (remainingByBakery[d.bakeryId] || 0) + rem;
      }
    });
    const debtorBakeriesCount = Object.values(remainingByBakery).filter((v) => v > 0).length;
    return {
      totalRemaining,
      debtorBakeriesCount,
    };
  }, [debts]);

  const totalAlertsCount = expirationAlerts.length + highDebtCount;

  const urgentPreviewItems = React.useMemo(() => {
    return expirationAlerts.slice(0, 4);
  }, [expirationAlerts]);

  const todayArabic = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div dir="rtl" data-testid="welcome-dashboard-page" className="space-y-5 animate-fade-in">
      {/* Hero Executive Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0A1628] via-[#0F2342] to-[#0D9488] text-white p-6 sm:p-8 shadow-xl border border-[#D4AF37]/40">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#FDE68A] text-xs font-black">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>مرحباً بعودتك إلى المنظومة التموينية المتكاملة</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-snug">
              أهلاً بك، {currentUser.fullName}
            </h1>

            <p className="text-sm text-slate-200 font-semibold leading-relaxed">
              تعمل الآن على واجهة{' '}
              <span className="text-[#FDE68A] font-black">{branchName}</span>{' '}
              <span className="text-slate-300 text-xs">
                ({governorateTitle} · {directorateTitle})
              </span>{' '}
              — {todayArabic}.
            </p>

            {/* Primary CTA Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {currentUser.role !== 'viewer' && (
                <button
                  type="button"
                  data-testid="welcome-register-bakery-btn"
                  onClick={onRegisterNewBakery}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-l from-[#D4AF37] to-amber-400 hover:from-amber-300 hover:to-amber-400 text-[#0A1628] font-black text-xs sm:text-sm shadow-lg transition transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>تسجيل مخبز جديد</span>
                </button>
              )}

              <button
                type="button"
                data-testid="welcome-view-alerts-btn"
                onClick={onOpenAlerts}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-600/90 hover:bg-rose-500 text-white font-black text-xs sm:text-sm border border-rose-400/50 shadow-md transition cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                <span>عرض التنبيهات ({totalAlertsCount})</span>
              </button>

              <button
                type="button"
                data-testid="welcome-daily-briefing-btn"
                onClick={onOpenDailyBriefing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black text-xs sm:text-sm border border-white/20 transition cursor-pointer"
              >
                <TrendingUp className="w-4 h-4 text-[#5EEAD4]" />
                <span>التقرير اليومي للمديونيات والتراخيص</span>
              </button>
            </div>
          </div>

          {/* Right Quick Status Capsule */}
          <div className="bg-slate-950/60 backdrop-blur-sm border border-[#D4AF37]/30 rounded-2xl p-4 sm:p-5 min-w-[260px] space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-xs font-black text-[#FDE68A]">ملخص الجاهزية اليومي</span>
              </div>
              <span className="text-[11px] font-mono font-black text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 rounded-lg">
                موعد التنبيه {alertTime}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                {isAudioMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
                <span>الإشعارات الصوتية:</span>
                <span className={isAudioMuted ? 'text-rose-300 font-black' : 'text-emerald-300 font-black'}>
                  {isAudioMuted ? 'مكتومة' : 'مفعّلة'}
                </span>
              </div>
              <button
                type="button"
                data-testid="welcome-toggle-mute-btn"
                onClick={onToggleAudioMute}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer border ${
                  isAudioMuted
                    ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-200 border-emerald-400/40'
                    : 'bg-rose-600/20 hover:bg-rose-600/40 text-rose-200 border-rose-400/40'
                }`}
              >
                {isAudioMuted ? 'تفعيل الصوت' : 'كتم الصوت'}
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenAlertSettings}
              className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>ضبط المواعيد وإعدادات الصوت</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4 Core Executive KPI Summary Cards */}
      <section aria-label="ملخص المخابز والمديونيات الحالي" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={onNavigateBakeries}
          className="text-right bg-white rounded-2xl p-5 border border-slate-200 hover:border-[#0D9488] shadow-xs hover:shadow-md transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">إجمالي المخابز المسجلة</span>
            <span className="w-10 h-10 rounded-xl bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center group-hover:bg-[#0D9488] group-hover:text-white transition">
              <Store className="w-5 h-5" />
            </span>
          </div>
          <p className="text-3xl font-black font-mono tabular-nums text-[#0A1628] mt-3">
            {bakeries.length.toLocaleString('en-US')}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-[#0D9488]">
            <span>عرض قاعدة بيانات المخابز</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </div>
        </button>

        <button
          type="button"
          onClick={onNavigateDebts}
          className="text-right bg-white rounded-2xl p-5 border border-slate-200 hover:border-rose-500 shadow-xs hover:shadow-md transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">إجمالي المديونيات الحالية</span>
            <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition">
              <Scale className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-rose-700 mt-3">
            {debtSummary.totalRemaining.toLocaleString('en-US')}{' '}
            <span className="text-xs font-bold text-slate-500">ج.م</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-rose-700">
            <span>{debtSummary.debtorBakeriesCount} مخبز عليه رصيد متبقي</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenAlerts}
          className="text-right bg-white rounded-2xl p-5 border border-slate-200 hover:border-amber-500 shadow-xs hover:shadow-md transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">تنبيهات التراخيص والمديونيات</span>
            <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition">
              <AlertTriangle className="w-5 h-5" />
            </span>
          </div>
          <p className="text-3xl font-black font-mono tabular-nums text-amber-700 mt-3">
            {totalAlertsCount.toLocaleString('en-US')}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-amber-800">
            <span>
              {expiredDocsCount} منتهي · {expiringSoonCount} قريب الانتهاء
            </span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </div>
        </button>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">المهام اليومية والوارد</span>
            <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-4">
            <div>
              <span className="text-2xl font-black font-mono tabular-nums text-[#0A1628]">
                {pendingTasksCount}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mr-1">مهمة مفتوحة</span>
            </div>
            <div>
              <span className="text-2xl font-black font-mono tabular-nums text-indigo-700">
                {unreadInboxCount}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mr-1">رسالة جديدة</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] font-black">
            <button
              type="button"
              onClick={onOpenDailyTasks}
              className="text-[#0D9488] hover:underline cursor-pointer"
            >
              إدارة المهام
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onOpenInbox}
              className="text-indigo-700 hover:underline cursor-pointer flex items-center gap-1"
            >
              <Inbox className="w-3 h-3" />
              <span>صندوق الوارد</span>
            </button>
          </div>
        </div>
      </section>

      {/* Quick Access Tasks & Urgent Expirations Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Frequent Daily Tasks Grid */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-[#0A1628]">
                الوصول السريع للمهام اليومية الأكثر تكراراً
              </h2>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                انتقل بضغطة واحدة إلى أي قسم أو إجراء يومي متكرر في الإدارة
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {currentUser.role !== 'viewer' && (
              <button
                type="button"
                onClick={onRegisterNewBakery}
                className="p-4 rounded-2xl border border-[#0D9488]/30 bg-[#0D9488]/5 hover:bg-[#0D9488]/10 text-right transition cursor-pointer space-y-2"
              >
                <div className="w-9 h-9 rounded-xl bg-[#0D9488] text-white flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div className="text-xs font-black text-[#0A1628]">تسجيل مخبز جديد</div>
                <div className="text-[11px] font-semibold text-slate-600">
                  إضافة بيانات مخبز ورخصه وحصته التموينية
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateBakeries}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-right transition cursor-pointer space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-[#0F2342] text-[#D4AF37] flex items-center justify-center">
                <Store className="w-5 h-5" />
              </div>
              <div className="text-xs font-black text-[#0A1628]">جدول بيانات المخابز</div>
              <div className="text-[11px] font-semibold text-slate-600">
                البحث والتصفية ومتابعة الحصص والأرغفة
              </div>
            </button>

            <button
              type="button"
              onClick={onNavigateDebts}
              className="p-4 rounded-2xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 text-right transition cursor-pointer space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center">
                <Scale className="w-5 h-5" />
              </div>
              <div className="text-xs font-black text-[#0A1628]">سجل المديونيات والتحصيل</div>
              <div className="text-[11px] font-semibold text-slate-600">
                متابعة المخالفات والسداد وجدولة الدفعات
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenAlerts}
              className="p-4 rounded-2xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 text-right transition cursor-pointer space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <div className="text-xs font-black text-[#0A1628]">مركز التنبيهات</div>
              <div className="text-[11px] font-semibold text-slate-600">
                مراجعة السجلات المنتهية والمديونيات الكبرى
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenAlertSettings}
              className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-right transition cursor-pointer space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-xs font-black text-[#0A1628]">التنبيه بمواعيد والصوت</div>
              <div className="text-[11px] font-semibold text-slate-600">
                جدولة التنبيهات اليومية وكتم أو تشغيل الصوت
              </div>
            </button>

            <button
              type="button"
              onClick={onNavigateReports}
              className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-right transition cursor-pointer space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center">
                <Printer className="w-5 h-5" />
              </div>
              <div className="text-xs font-black text-[#0A1628]">مركز التقارير والطباعة</div>
              <div className="text-[11px] font-semibold text-slate-600">
                إصدار وطباعة التقارير الرسمية المعتمدة
              </div>
            </button>
          </div>
        </section>

        {/* Urgent License/Debt Watchlist Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-[#0A1628] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>أقرب التنبيهات للمتابعة</span>
              </h2>
              <button
                type="button"
                onClick={onOpenAlerts}
                className="text-[11px] font-black text-[#0D9488] hover:underline cursor-pointer"
              >
                عرض الكل
              </button>
            </div>

            {urgentPreviewItems.length === 0 ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1.5">
                <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-black text-emerald-900">
                  جميع التراخيص والسجلات التجارية سارية
                </p>
                <p className="text-[11px] font-bold text-emerald-700">
                  لا توجد وثائق منتهية خلال الـ 15 يوماً القادمة.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {urgentPreviewItems.map((item, idx) => (
                  <div
                    key={`${item.bakeryId}-${item.docType}-${idx}`}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      item.isExpired
                        ? 'bg-rose-50/80 border-rose-200'
                        : 'bg-amber-50/80 border-amber-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-black text-[#0A1628] truncate">{item.bakeryOwnerName}</p>
                      <p className="text-[11px] font-bold text-slate-600 truncate">
                        {item.docType} · {item.village}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                        item.isExpired
                          ? 'bg-rose-600 text-white'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      {item.isExpired
                        ? `منتهي (${Math.abs(item.daysRemaining)} ي)`
                        : `خلال ${item.daysRemaining} ي`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenDailyBriefing}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0F2342] hover:bg-[#1E3A8A] text-amber-300 text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>فتح البيان اليومي الموحد</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </section>
      </div>
    </div>
  );
};
