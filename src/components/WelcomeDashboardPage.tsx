import React from 'react';
import { AppUser, Bakery, DailyBakeryTask, DebtRecord } from '../types';
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
  Calendar,
  CheckCircle2,
  FileText,
  ListTodo,
} from 'lucide-react';
import { getExpirationAlerts } from './AlertsModal';
import {
  formatDateDDMMYYYY,
  getWelcomeDashboardReminderTasks,
} from '../utils/auditHelper';
import {
  canUserAccessDepartment,
  hasDepartmentPermission,
} from '../utils/departmentRbac';

interface WelcomeDashboardPageProps {
  currentUser: AppUser;
  branchName: string;
  governorateTitle: string;
  directorateTitle: string;
  bakeries: Bakery[];
  debts: DebtRecord[];
  dailyTasks?: DailyBakeryTask[];
  highDebtCount: number;
  unreadInboxCount: number;
  pendingTasksCount: number;
  isAudioMuted: boolean;
  alertTime: string;
  onToggleAudioMute: () => void;
  onRegisterNewBakery: () => void;
  onOpenAlerts: () => void;
  onOpenDailyBriefing: () => void;
  onOpenDailyPerformanceSummary?: () => void;
  onOpenAlertSettings: () => void;
  onNavigateBakeries: () => void;
  onNavigateDebts: () => void;
  onNavigateReports: () => void;
  onOpenDailyTasks: () => void;
  onCompleteTask?: (taskId: string) => void;
  onToggleTaskWelcomeReminder?: (taskId: string) => void;
  onOpenInbox: () => void;
}

export const WelcomeDashboardPage: React.FC<WelcomeDashboardPageProps> = ({
  currentUser,
  branchName,
  governorateTitle,
  directorateTitle,
  bakeries,
  debts,
  dailyTasks = [],
  highDebtCount,
  unreadInboxCount,
  pendingTasksCount,
  isAudioMuted,
  alertTime,
  onToggleAudioMute,
  onRegisterNewBakery,
  onOpenAlerts,
  onOpenDailyBriefing,
  onOpenDailyPerformanceSummary,
  onOpenAlertSettings,
  onNavigateBakeries,
  onNavigateDebts,
  onNavigateReports,
  onOpenDailyTasks,
  onCompleteTask,
  onToggleTaskWelcomeReminder,
  onOpenInbox,
}) => {
  const canAccessBakeries = canUserAccessDepartment(currentUser, 'bakeries');
  const canInsertBakery = hasDepartmentPermission(currentUser, 'bakeries', 'insert');
  const canUpdateBakery = hasDepartmentPermission(currentUser, 'bakeries', 'update');
  const canAccessDebts = canUserAccessDepartment(currentUser, 'debts');
  const canAccessReports = canUserAccessDepartment(currentUser, 'reports');

  const expirationAlerts = React.useMemo(() => getExpirationAlerts(bakeries), [bakeries]);
  const expiredDocsCount = expirationAlerts.filter((a) => a.isExpired).length;
  const expiringSoonCount = expirationAlerts.filter((a) => !a.isExpired).length;

  const welcomeReminderTasks = React.useMemo(
    () => getWelcomeDashboardReminderTasks(dailyTasks),
    [dailyTasks]
  );

  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

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
    <div dir="rtl" data-testid="welcome-dashboard-page" className="space-y-3 animate-fade-in">
      {/* Compact Hero Executive Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#0A1628] via-[#0F2342] to-[#0D9488] text-white p-3.5 sm:p-4 shadow-md border border-[#D4AF37]/40">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#FDE68A] text-[11px] font-black">
                <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                <span>أهلاً ومرحباً بعودتك إلى المنظومة</span>
              </div>
              <span className="text-[11px] text-slate-200 font-bold">
                — {todayArabic}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                أهلاً بك، {currentUser.fullName}
              </h1>
              <p className="text-xs text-slate-200 font-semibold">
                ({branchName} · {governorateTitle} · {directorateTitle})
              </p>
            </div>

            {/* Compact Primary CTA Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {canInsertBakery && (
                <button
                  type="button"
                  data-testid="welcome-register-bakery-btn"
                  onClick={onRegisterNewBakery}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-l from-[#D4AF37] to-amber-400 hover:from-amber-300 hover:to-amber-400 text-[#0A1628] font-black text-xs shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>تسجيل مخبز جديد</span>
                </button>
              )}

              <button
                type="button"
                data-testid="welcome-view-alerts-btn"
                onClick={onOpenAlerts}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-black text-xs border border-rose-400/50 shadow-xs transition cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>عرض التنبيهات ({totalAlertsCount})</span>
              </button>

              {canAccessReports && onOpenDailyPerformanceSummary && (
                <button
                  type="button"
                  data-testid="welcome-open-daily-performance-btn"
                  onClick={onOpenDailyPerformanceSummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white font-black text-xs border border-emerald-400/50 shadow-xs transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-200" />
                  <span>التقرير الإحصائي اليومي (PDF)</span>
                </button>
              )}

              {canAccessReports && (
                <button
                  type="button"
                  data-testid="welcome-daily-briefing-btn"
                  onClick={onOpenDailyBriefing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs border border-white/20 transition cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-[#5EEAD4]" />
                  <span>التقرير اليومي للمديونيات والتراخيص</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Quick Status Capsule (Compact) */}
          <div className="bg-slate-950/60 backdrop-blur-sm border border-[#D4AF37]/30 rounded-xl p-2.5 sm:p-3 min-w-[230px] space-y-1.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="text-[11px] font-black text-[#FDE68A]">ملخص الجاهزية اليومي</span>
              </div>
              <span className="text-[10px] font-mono font-black text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-1.5 py-0.5 rounded-md">
                التنبيه {alertTime}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
                {isAudioMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>الصوت:</span>
                <span className={isAudioMuted ? 'text-rose-300 font-black' : 'text-emerald-300 font-black'}>
                  {isAudioMuted ? 'مكتوم' : 'مفعّل'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="welcome-toggle-mute-btn"
                  onClick={onToggleAudioMute}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black transition cursor-pointer border ${
                    isAudioMuted
                      ? 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-200 border-emerald-400/40'
                      : 'bg-rose-600/20 hover:bg-rose-600/40 text-rose-200 border-rose-400/40'
                  }`}
                >
                  {isAudioMuted ? 'تفعيل' : 'كتم'}
                </button>
                <button
                  type="button"
                  onClick={onOpenAlertSettings}
                  className="px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-[10px] font-black flex items-center gap-1 transition cursor-pointer"
                >
                  <Clock className="w-3 h-3" />
                  <span>المواعيد</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Core Executive KPI Summary Cards (Compact) */}
      <section aria-label="ملخص المخابز والمديونيات الحالي" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {canAccessBakeries && (
          <button
            type="button"
            onClick={onNavigateBakeries}
            className="text-right bg-white rounded-xl p-3.5 border border-slate-200 hover:border-[#0D9488] shadow-xs hover:shadow-md transition group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-600">إجمالي المخابز المسجلة</span>
              <span className="w-8 h-8 rounded-lg bg-[#0D9488]/10 text-[#0D9488] flex items-center justify-center group-hover:bg-[#0D9488] group-hover:text-white transition">
                <Store className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-black font-mono tabular-nums text-[#0A1628] mt-1.5">
              {bakeries.length.toLocaleString('en-US')}
            </p>
            <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-[#0D9488]">
              <span>عرض قاعدة بيانات المخابز</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </div>
          </button>
        )}

        {canAccessDebts && (
          <button
            type="button"
            onClick={onNavigateDebts}
            className="text-right bg-white rounded-xl p-3.5 border border-slate-200 hover:border-rose-500 shadow-xs hover:shadow-md transition group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-600">إجمالي المديونيات الحالية</span>
              <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition">
                <Scale className="w-4 h-4" />
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-black font-mono tabular-nums text-rose-700 mt-1.5">
              {debtSummary.totalRemaining.toLocaleString('en-US')}{' '}
              <span className="text-xs font-bold text-slate-500">ج.م</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-rose-700">
              <span>{debtSummary.debtorBakeriesCount} مخبز عليه رصيد متبقي</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenAlerts}
          className="text-right bg-white rounded-xl p-3.5 border border-slate-200 hover:border-amber-500 shadow-xs hover:shadow-md transition group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">تنبيهات التراخيص والمديونيات</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black font-mono tabular-nums text-amber-700 mt-1.5">
            {totalAlertsCount.toLocaleString('en-US')}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-amber-800">
            <span>
              {expiredDocsCount} منتهي · {expiringSoonCount} قريب الانتهاء
            </span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </div>
        </button>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600">المهام اليومية والوارد</span>
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-4">
            <div>
              <span className="text-xl font-black font-mono tabular-nums text-[#0A1628]">
                {pendingTasksCount}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mr-1">مهمة مفتوحة</span>
            </div>
            <div>
              <span className="text-xl font-black font-mono tabular-nums text-indigo-700">
                {unreadInboxCount}
              </span>
              <span className="text-[11px] font-bold text-slate-500 mr-1">رسالة جديدة</span>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px] font-black">
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

      {/* Assigned Daily Tasks Reminders on Welcome Dashboard */}
      <section
        data-testid="welcome-assigned-tasks-reminders"
        className="bg-gradient-to-l from-[#0A1628] via-[#0F2342] to-[#1E3A8A] rounded-2xl border border-[#D4AF37]/50 p-5 shadow-md text-white space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shrink-0">
              <ListTodo className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-white">
                  إشعارات التذكير بالمهام المعينة لصفحة الترحيب (Welcome Dashboard Reminders)
                </h2>
                <span
                  data-testid="welcome-reminders-count-badge"
                  className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black font-mono"
                >
                  {welcomeReminderTasks.length} تذكير نشط
                </span>
              </div>
              <p className="text-xs font-bold text-slate-300 mt-0.5">
                المهام اليومية المعينة للظهور كإشعار تذكيري في صفحة الترحيب (مراجعة مديونية، تفتيش مخبز، متابعة ترخيص) مع تاريخ اليوم المحدد للتنفيذ
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="welcome-assign-new-task-btn"
            onClick={onOpenDailyTasks}
            className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-amber-400 text-[#0A1628] text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>تعيين مهمة ليوم محدد</span>
          </button>
        </div>

        {welcomeReminderTasks.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>لا توجد مهام تذكيرية مثبتة حالياً في صفحة الترحيب. يمكنك تعيين أي مهمة ليوم محدد من نافذة المهام اليومية.</span>
            </div>
            <button
              type="button"
              onClick={onOpenDailyTasks}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-300 font-black transition cursor-pointer"
            >
              فتح نافذة المهام اليومية
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {welcomeReminderTasks.map((item) => {
              const { task, targetDate, isDueToday, isOverdue, categoryLabel } = item;

              return (
                <div
                  key={task.id}
                  data-testid="welcome-reminder-task-card"
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition ${
                    isOverdue
                      ? 'bg-rose-950/60 border-rose-400/50'
                      : isDueToday
                      ? 'bg-amber-950/50 border-amber-400/60'
                      : 'bg-slate-900/80 border-slate-700/80'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[11px] font-black">
                        {categoryLabel}
                      </span>
                      <span
                        data-testid="welcome-reminder-date-badge"
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-black font-mono flex items-center gap-1 ${
                          isOverdue
                            ? 'bg-rose-600 text-white'
                            : isDueToday
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>
                          {isDueToday
                            ? `اليوم (${formatDateDDMMYYYY(targetDate)})`
                            : isOverdue
                            ? `متأخرة (${formatDateDDMMYYYY(targetDate)})`
                            : `موعد التذكير: ${formatDateDDMMYYYY(targetDate)}`}
                        </span>
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-white leading-snug">{task.title}</h3>

                    {task.description && (
                      <p className="text-xs font-semibold text-slate-300 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {(task.bakeryName || task.village) && (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-300 bg-teal-950/60 border border-teal-500/30 px-2.5 py-1 rounded-lg">
                        <Store className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {task.bakeryName || 'مخبز غير محدد'}
                          {task.village ? ` (${task.village})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {onCompleteTask && canUpdateBakery && (
                        <button
                          type="button"
                          data-testid="welcome-complete-task-btn"
                          onClick={() => onCompleteTask(task.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1 transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>إنجاز المهمة ✓</span>
                        </button>
                      )}
                      {task.taskType === 'debt_review' && canAccessDebts ? (
                        <button
                          type="button"
                          onClick={onNavigateDebts}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-rose-200 text-[11px] font-bold transition cursor-pointer"
                        >
                          سجل المديونيات
                        </button>
                      ) : canAccessBakeries ? (
                        <button
                          type="button"
                          onClick={onNavigateBakeries}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sky-200 text-[11px] font-bold transition cursor-pointer"
                        >
                          جدول المخابز
                        </button>
                      ) : null}
                    </div>

                    {onToggleTaskWelcomeReminder && canUpdateBakery && (
                      <button
                        type="button"
                        data-testid="welcome-unpin-task-btn"
                        onClick={() => onToggleTaskWelcomeReminder(task.id)}
                        className="text-[11px] font-bold text-slate-300 hover:text-amber-300 underline cursor-pointer"
                      >
                        إخفاء من الترحيب
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            {canInsertBakery && (
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

            {canAccessBakeries && (
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
            )}

            {canAccessDebts && (
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
            )}

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

            {canAccessReports && (
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
            )}

            {canAccessReports && onOpenDailyPerformanceSummary && (
              <button
                type="button"
                onClick={onOpenDailyPerformanceSummary}
                className="p-4 rounded-2xl border border-teal-300 bg-teal-50/80 hover:bg-teal-100/80 text-right transition cursor-pointer space-y-2"
              >
                <div className="w-9 h-9 rounded-xl bg-teal-700 text-amber-300 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="text-xs font-black text-[#0A1628]">
                  التقرير الإحصائي اليومي للمدير العام (PDF)
                </div>
                <div className="text-[11px] font-semibold text-slate-600">
                  ملخص الأرغفة المنتجة وحصص الدقيق والمديونيات الجديدة مع تحميل PDF
                </div>
              </button>
            )}
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

          {canAccessReports && (
            <button
              type="button"
              onClick={onOpenDailyBriefing}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0F2342] hover:bg-[#1E3A8A] text-amber-300 text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>فتح البيان اليومي الموحد</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </section>
      </div>
    </div>
  );
};
