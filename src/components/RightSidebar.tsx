import React, { useState } from 'react';
import {
  LayoutDashboard,
  Store,
  Plus,
  Edit3,
  Search,
  Calculator,
  Scale,
  AlertTriangle,
  FileText,
  Printer,
  Database,
  Save,
  Download,
  Upload,
  Settings,
  Users,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sliders,
  CheckSquare,
  LogOut,
  Eye,
  BarChart3,
  Bell,
  Calendar,
  BookOpen,
  Building2,
  Lock,
  Award,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CloudConnectionStatus } from '../lib/supabase';

export type SidebarNavId =
  | 'welcome-home'
  // 1. قسم إدارة المخابز
  | 'user-guide'
  | 'bakeries-all'
  | 'data-add-bakery'
  | 'search-by-name'
  | 'search-by-machine'
  | 'search-by-area'
  | 'search-by-bread'
  | 'search-advanced'
  | 'calc-equations-view'
  | 'calc-insurance-quota'
  | 'calc-loaves'
  | 'calc-avg-2023'
  | 'calc-avg-2024'
  | 'calc-avg-2025'
  | 'calc-per-bakery'
  | 'calc-cum-diff'
  | 'calc-recalculate-all'
  | 'report-per-capita'
  | 'settings-alerts'
  | 'alerts-scheduled-audio'
  // 2. قسم التعديلات
  | 'data-edit-bakery'
  | 'data-edit-master'
  | 'settings-view-mode'
  | 'settings-display'
  // 3. قسم سجل المديونيات
  | 'debts-records'
  | 'debts-add-schedule'
  | 'debts-alerts-key'
  | 'debts-installments'
  // 4. قسم الحفظ والنسخ
  | 'branches-manage'
  | 'ops-save-data'
  | 'data-import'
  | 'data-export'
  | 'data-backup'
  | 'workspace-calendar'
  | 'workspace-tasks'
  | 'workspace-forms'
  // Additional & Dashboard routes
  | 'realtime-diagnostics'
  | 'dashboard-charts'
  | 'alerts-drawer-log'
  | 'dashboard-home'
  | 'dashboard-kpis'
  | 'dashboard-updates'
  | 'reports-center'
  | 'report-detailed'
  | 'report-summary'
  | 'report-years-comparison'
  | 'report-insurance-quotas'
  | 'report-differences'
  | 'data-integrity'
  | 'settings-system'
  | 'settings-users'
  | 'settings-logs'
  | 'settings-daily-tasks'
  | 'settings-logout';

interface SidebarSubItem {
  id: SidebarNavId;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  badgeVariant?: 'info' | 'warning' | 'danger' | 'gold' | 'teal';
}

interface SidebarGroup {
  id: string;
  title: string;
  subtitle: string;
  accentGradient: string;
  icon: React.ReactNode;
  requiresVaultSecret?: boolean;
  items: SidebarSubItem[];
}

interface RightSidebarProps {
  activeNavId: SidebarNavId;
  onSelectNav: (navId: SidebarNavId, groupTitle: string, itemLabel: string) => void;
  bakeriesCount: number;
  debtsCount: number;
  alertsCount: number;
  unreadInboxCount?: number;
  pendingTasksCount?: number;
  largeDebtsCount: number;
  logoBase64?: string;
  administrationTitle?: string;
  directorateTitle?: string;
  connectionStatus?: CloudConnectionStatus;
  connectionLabel?: string;
  isVaultUnlocked?: boolean;
  isAudioMuted?: boolean;
  scheduledAlertsCount?: number;
  onOpenVaultGate?: (section: 'backup' | 'branches' | 'both', label: string) => void;
  onLockVault?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  activeNavId,
  onSelectNav,
  bakeriesCount,
  debtsCount,
  alertsCount,
  unreadInboxCount = 0,
  pendingTasksCount = 0,
  largeDebtsCount,
  logoBase64,
  administrationTitle = 'إدارة تموين مركز المحلة الكبرى',
  directorateTitle = 'مديرية التموين والتجارة الداخلية بالغربية',
  connectionStatus = 'connected',
  connectionLabel = 'متصل بقاعدة البيانات',
  isVaultUnlocked = false,
  isAudioMuted = false,
  scheduledAlertsCount = 0,
  onOpenVaultGate,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'group-1': true,
    'group-2': true,
    'group-3': true,
    'group-4': false,
    'group-5': true,
  });

  const toggleGroup = (group: SidebarGroup) => {
    if (group.requiresVaultSecret && !isVaultUnlocked) {
      onOpenVaultGate?.('backup', 'قسم الحفظ والنسخ (محمي بـ Username & Password)');
      return;
    }
    setExpandedGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }));
  };

  const groups: SidebarGroup[] = [
    {
      id: 'group-1',
      title: '1. قسم إدارة المخابز',
      subtitle: 'البيانات والحصص والمعادلات',
      accentGradient: 'from-[#0D9488] to-[#0F766E]',
      icon: <Store className="w-4 h-4" />,
      items: [
        {
          id: 'user-guide',
          label: 'دليل المستخدم (صور وفيديو)',
          icon: <BookOpen className="w-3.5 h-3.5 text-[#5EEAD4]" />,
          badge: 'شرح',
          badgeVariant: 'teal',
        },
        {
          id: 'bakeries-all',
          label: 'سجل بيانات المخابز',
          icon: <Store className="w-3.5 h-3.5" />,
          badge: bakeriesCount,
          badgeVariant: 'teal',
        },
        {
          id: 'data-add-bakery',
          label: 'إضافة مخبز جديد',
          icon: <Plus className="w-3.5 h-3.5" />,
        },
        {
          id: 'search-advanced',
          label: 'البحث والفلترة والفرز',
          icon: <Search className="w-3.5 h-3.5" />,
        },
        {
          id: 'calc-equations-view',
          label: 'الحصص والمعادلات السبع ∑',
          icon: <Calculator className="w-3.5 h-3.5" />,
          badge: '∑',
          badgeVariant: 'gold',
        },
        {
          id: 'report-per-capita',
          label: 'المتوسطات السنوية (2023-2025)',
          icon: <FileText className="w-3.5 h-3.5" />,
        },
        {
          id: 'settings-alerts',
          label: 'التراخيص والعقود المنتهية',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          badge: alertsCount > 0 ? alertsCount : undefined,
          badgeVariant: 'warning',
        },
        {
          id: 'alerts-scheduled-audio',
          label: 'التنبيه بمواعيد وإشعار صوتي (تراخيص ومديونيات)',
          icon: isAudioMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          ),
          badge: isAudioMuted ? 'مكتوم' : scheduledAlertsCount > 0 ? `${scheduledAlertsCount} صوتي` : 'صوتي',
          badgeVariant: isAudioMuted ? 'danger' : 'teal',
        },
      ],
    },
    {
      id: 'group-2',
      title: '2. قسم التعديلات والعرض',
      subtitle: 'إدارة القوائم والأعمدة والقرى',
      accentGradient: 'from-[#D4AF37] to-amber-600',
      icon: <Edit3 className="w-4 h-4" />,
      items: [
        {
          id: 'branches-manage',
          label: 'قسم الفروع والإدارات التموينية',
          icon: <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />,
          badge: 'تبديل',
          badgeVariant: 'gold',
        },
        {
          id: 'data-edit-bakery',
          label: 'تعديل بيانات مخبز محدد',
          icon: <Edit3 className="w-3.5 h-3.5" />,
        },
        {
          id: 'data-edit-master',
          label: 'إدارة القوائم المنسدلة والقرى',
          icon: <Sliders className="w-3.5 h-3.5" />,
        },
        {
          id: 'settings-view-mode',
          label: 'إعدادات العرض وتنظيم الجداول',
          icon: <Eye className="w-3.5 h-3.5" />,
        },
        {
          id: 'settings-display',
          label: 'تعديل مسميات أعمدة الجداول',
          icon: <Settings className="w-3.5 h-3.5" />,
        },
      ],
    },
    {
      id: 'group-3',
      title: '3. قسم سجل المديونيات',
      subtitle: 'المخالفات والسداد والجدولة',
      accentGradient: 'from-[#10B981] to-[#0D9488]',
      icon: <Scale className="w-4 h-4" />,
      items: [
        {
          id: 'debts-records',
          label: 'جدول سجل المديونيات',
          icon: <Scale className="w-3.5 h-3.5" />,
          badge: debtsCount,
          badgeVariant: 'teal',
        },
        {
          id: 'debts-add-schedule',
          label: 'إضافة مديونية أو جدولة سداد',
          icon: <Plus className="w-3.5 h-3.5" />,
        },
        {
          id: 'debts-alerts-key',
          label: 'مفتاح ألوان وإنذارات التأخير',
          icon: <Clock className="w-3.5 h-3.5" />,
        },
        {
          id: 'debts-installments',
          label: 'الدفعات الأسبوعية (> 20 ألف)',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          badge: largeDebtsCount > 0 ? largeDebtsCount : undefined,
          badgeVariant: 'danger',
        },
      ],
    },
    {
      id: 'group-4',
      title: '4. قسم الحفظ والنسخ',
      subtitle: 'النسخ الاحتياطي وتصدير البيانات',
      accentGradient: 'from-[#0D9488] to-[#D4AF37]',
      icon: <Database className="w-4 h-4" />,
      requiresVaultSecret: true,
      items: [
        {
          id: 'ops-save-data',
          label: 'حفظ البيانات وتثبيت التغييرات',
          icon: <Save className="w-3.5 h-3.5" />,
        },
        {
          id: 'data-import',
          label: 'استيراد بيانات (Excel / JSON)',
          icon: <Upload className="w-3.5 h-3.5" />,
        },
        {
          id: 'data-export',
          label: 'تصدير قاعدة البيانات (CSV)',
          icon: <Download className="w-3.5 h-3.5" />,
        },
        {
          id: 'data-backup',
          label: 'النسخ الاحتياطي والاستعادة',
          icon: <Database className="w-3.5 h-3.5" />,
        },
        {
          id: 'workspace-calendar',
          label: 'تقويم ومهام Google Workspace',
          icon: <Calendar className="w-3.5 h-3.5 text-[#5EEAD4]" />,
        },
      ],
    },
    {
      id: 'group-5',
      title: '5. التقارير والإدارة والأمان',
      subtitle: 'الطباعة والصلاحيات والخروج',
      accentGradient: 'from-[#F43F5E] to-rose-700',
      icon: <Printer className="w-4 h-4" />,
      items: [
        {
          id: 'reports-center',
          label: 'مركز التقارير والطباعة الرسمية',
          icon: <Printer className="w-3.5 h-3.5" />,
        },
        {
          id: 'settings-users',
          label: 'المستخدمون والصلاحيات',
          icon: <Users className="w-3.5 h-3.5" />,
        },
        {
          id: 'settings-daily-tasks',
          label: 'المهام اليومية للموظفين',
          icon: <CheckSquare className="w-3.5 h-3.5" />,
          badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
          badgeVariant: 'warning',
        },
        {
          id: 'settings-logs',
          label: 'صندوق الوارد والتعليمات',
          icon: <FileText className="w-3.5 h-3.5" />,
          badge: unreadInboxCount > 0 ? unreadInboxCount : undefined,
          badgeVariant: 'danger',
        },
        {
          id: 'settings-logout',
          label: 'حفظ آمن وتسجيل الخروج',
          icon: <LogOut className="w-3.5 h-3.5 text-rose-400" />,
        },
      ],
    },
  ];

  const getBadgeClasses = (variant?: SidebarSubItem['badgeVariant']) => {
    switch (variant) {
      case 'danger':
        return 'bg-[#F43F5E] text-white font-black badge-animated-coral animate-pulse';
      case 'warning':
        return 'bg-amber-500 text-[#0A1628] font-black badge-animated-gold';
      case 'gold':
        return 'bg-[#D4AF37]/25 text-[#FDE68A] border border-[#D4AF37]/40 font-black badge-animated-gold';
      case 'teal':
      default:
        return 'bg-[#0D9488]/25 text-[#5EEAD4] border border-[#0D9488]/40 font-black badge-animated-teal';
    }
  };

  return (
    <aside
      dir="rtl"
      aria-label="القائمة الجانبية الرئيسية"
      className={`bg-[#0A1628] text-slate-100 border-l border-[#D4AF37]/25 flex flex-col shrink-0 select-none transition-all duration-300 no-print shadow-[0_0_50px_rgba(10,22,40,0.35)] ${
        isCollapsed ? 'w-20' : 'w-80'
      }`}
    >
      {/* Top Executive Identity Card */}
      <div className="p-4 border-b border-[#D4AF37]/20 bg-gradient-to-b from-[#0F1E36] to-[#0A1628]">
        <div className="flex items-center justify-between gap-2">
          {!isCollapsed && (
            <div className="flex items-center gap-3 min-w-0">
              {logoBase64 ? (
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4AF37] via-amber-400 to-[#0D9488] p-0.5 shadow-lg shadow-[#D4AF37]/20 shrink-0">
                  <div className="w-full h-full rounded-[14px] bg-white p-1 flex items-center justify-center">
                    <img
                      src={logoBase64}
                      alt="شعار التموين"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6 text-[#D4AF37]" />
                </div>
              )}
              <div className="min-w-0">
                <span className="inline-block text-[10px] font-black text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-md border border-[#D4AF37]/30 mb-0.5">
                  محافظة الغربية
                </span>
                <p className="text-[11px] font-bold text-slate-300 truncate">{directorateTitle}</p>
                <h2 className="text-xs font-black text-[#5EEAD4] truncate">{administrationTitle}</h2>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-[#0D9488]/25 border border-[#D4AF37]/25 flex items-center justify-center text-[#D4AF37] hover:text-white transition-all shrink-0 mx-auto cursor-pointer"
          >
            {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Executive Shortcuts */}
        <div className="mt-3.5 space-y-1.5">
          <button
            type="button"
            data-testid="sidebar-welcome-btn"
            onClick={() => onSelectNav('welcome-home', 'الترحيب', 'الصفحة الترحيبية')}
            title="الصفحة الترحيبية"
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
            } py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              activeNavId === 'welcome-home'
                ? 'bg-gradient-to-l from-[#0D9488] to-[#0F766E] text-white border-[#D4AF37]/60 shadow-md'
                : 'bg-[#0F1E36] text-[#5EEAD4] border-[#0D9488]/30 hover:bg-[#0D9488]/15'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-[#D4AF37]" />
              {!isCollapsed && <span>الصفحة الترحيبية</span>}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectNav('dashboard-home', 'لوحة التحكم', 'الصفحة الرئيسية')}
            title="الصفحة الرئيسية"
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
            } py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer border ${
              activeNavId === 'dashboard-home'
                ? 'bg-gradient-to-l from-[#0D9488] to-[#0F766E] text-white border-[#D4AF37]/50 shadow-lg shadow-[#0D9488]/25'
                : 'bg-[#0F1E36] text-slate-200 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 shrink-0 text-[#D4AF37]" />
              {!isCollapsed && <span>الشاشة الرئيسية للمنظومة</span>}
            </div>
            {!isCollapsed && <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />}
          </button>

          <button
            type="button"
            data-testid="sidebar-interactive-dashboard-btn"
            onClick={() =>
              onSelectNav('dashboard-charts', 'لوحة التحكم', 'لوحة القيادة والرسوم البيانية التفاعلية')
            }
            title="لوحة التحكم والرسوم البيانية التفاعلية"
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
            } py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
              activeNavId === 'dashboard-charts'
                ? 'bg-gradient-to-l from-[#D4AF37] to-amber-500 text-[#0A1628] border-[#D4AF37] shadow-md'
                : 'bg-[#0F1E36]/80 text-[#FDE68A] border-[#D4AF37]/30 hover:bg-[#D4AF37]/15'
            }`}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span>لوحة المؤشرات والرسوم البيانية</span>}
            </div>
          </button>

          <button
            type="button"
            data-testid="sidebar-alerts-drawer-btn"
            onClick={() =>
              onSelectNav('alerts-drawer-log', 'سجل التنبيهات', 'سجل تنبيهات المديونيات المتجاوزة للحد')
            }
            title="سجل تنبيهات المديونيات"
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
            } py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 text-rose-200 border-[#F43F5E]/30`}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 shrink-0 text-[#F43F5E]" />
              {!isCollapsed && <span>سجل تنبيهات المديونيات</span>}
            </div>
            {!isCollapsed && largeDebtsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#F43F5E] text-white">
                {largeDebtsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Navigation Sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {groups.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const hasActiveChild = group.items.some((i) => i.id === activeNavId);

          return (
            <div
              key={group.id}
              className={`rounded-2xl border transition-all overflow-hidden ${
                hasActiveChild
                  ? 'bg-[#0F1E36] border-[#0D9488]/50 shadow-md'
                  : 'bg-[#0F1E36]/75 border-white/[0.08]'
              }`}
            >
              {/* Group Header */}
              <button
                type="button"
                data-testid={`sidebar-${group.id}-toggle`}
                onClick={() => toggleGroup(group)}
                title={group.title}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                } py-2.5 text-right transition-colors cursor-pointer hover:bg-white/[0.04]`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-xl bg-gradient-to-br ${group.accentGradient} flex items-center justify-center text-white shadow-sm shrink-0`}
                  >
                    {group.icon}
                  </span>
                  {!isCollapsed && (
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{group.title}</span>
                        {group.requiresVaultSecret && !isVaultUnlocked && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-[#F43F5E]/20 text-rose-300 border border-[#F43F5E]/40 shrink-0">
                            <Lock className="w-2.5 h-2.5" /> محمي
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 truncate">
                        {group.subtitle}
                      </div>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <ChevronDown
                    className={`w-4 h-4 text-[#D4AF37] shrink-0 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {/* Group Sub-Items */}
              {isExpanded && (!group.requiresVaultSecret || isVaultUnlocked) && (
                <div className="px-2.5 pb-2.5 pt-1 space-y-1">
                  {group.items.map((item) => {
                    const isActive = activeNavId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`sidebar-item-${item.id}`}
                        onClick={() => onSelectNav(item.id, group.title, item.label)}
                        title={item.label}
                        className={`w-full flex items-center ${
                          isCollapsed ? 'justify-center px-1.5' : 'justify-between px-3'
                        } py-2 rounded-xl text-xs transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-gradient-to-l from-[#0D9488] to-[#0F766E] text-white font-black border-[#D4AF37]/50 shadow-sm'
                            : 'text-slate-300 font-bold border-transparent hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`shrink-0 icon-bounce-hover ${isActive ? 'text-[#D4AF37]' : 'text-[#5EEAD4]'}`}>
                            {item.icon}
                          </span>
                          {!isCollapsed && (
                            <span className="text-right leading-snug break-words">{item.label}</span>
                          )}
                        </div>
                        {!isCollapsed && item.badge !== undefined && (
                          <span
                            className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${getBadgeClasses(
                              item.badgeVariant
                            )}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Live Cloud Connection Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t border-[#D4AF37]/20 bg-[#060E1A] flex items-center justify-between text-[11px] font-bold">
          <div className="flex items-center gap-2 truncate">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                connectionStatus === 'connected'
                  ? 'bg-[#10B981] animate-pulse'
                  : connectionStatus === 'syncing'
                  ? 'bg-[#D4AF37] animate-ping'
                  : 'bg-[#F43F5E]'
              }`}
            />
            <span className="text-slate-300 truncate">{connectionLabel}</span>
          </div>
          <span className="text-[#D4AF37] font-black shrink-0">Supabase</span>
        </div>
      )}
    </aside>
  );
};
