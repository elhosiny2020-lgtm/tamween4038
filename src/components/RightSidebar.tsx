import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Home,
  BarChart3,
  Activity,
  Clock,
  Store,
  FileSpreadsheet,
  Wheat,
  Layers,
  ShieldCheck,
  Users,
  Calculator,
  Percent,
  TrendingDown,
  RefreshCw,
  FileText,
  Printer,
  Search,
  Hash,
  MapPin,
  Filter,
  Database,
  PlusCircle,
  Edit3,
  Upload,
  Download,
  HardDrive,
  Settings,
  Cloud,
  UserCheck,
  Sliders,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
  ClipboardList,
  BookOpen,
  Mail,
  Map,
  Scale,
  AlertTriangle,
  Globe,
  Save,
  Bell,
  HelpCircle,
  Eye,
  LogOut,
  RotateCcw,
} from 'lucide-react';

export type SidebarNavId = string;

export interface SidebarSubItem {
  id: SidebarNavId;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  badgeColor?: 'blue' | 'amber' | 'red' | 'emerald';
}

export interface SidebarGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: SidebarSubItem[];
}

export interface RightSidebarProps {
  activeNavId: SidebarNavId;
  onSelectNav: (navId: SidebarNavId, groupTitle: string, itemLabel: string) => void;
  bakeriesCount?: number;
  debtsCount?: number;
  alertsCount?: number;
  unreadInboxCount?: number;
  pendingTasksCount?: number;
  largeDebtsCount?: number;
  logoBase64?: string;
  administrationTitle?: string;
  directorateTitle?: string;
  totalBakeriesCount?: number;
  totalDebtsCount?: number;
  expiredLicensesCount?: number;
  over20kBakeriesCount?: number;
  uncompletedTasksCount?: number;
  customLogoBase64?: string;
}

const SIDEBAR_STORAGE_KEY = 'tamween_sidebar_open_groups_v2';
const SIDEBAR_COLLAPSED_KEY = 'tamween_sidebar_collapsed_v2';

export const RightSidebar: React.FC<RightSidebarProps> = ({
  activeNavId,
  onSelectNav,
  bakeriesCount,
  debtsCount,
  alertsCount,
  unreadInboxCount = 0,
  pendingTasksCount,
  largeDebtsCount,
  logoBase64,
  administrationTitle,
  directorateTitle,
  totalBakeriesCount,
  totalDebtsCount,
  expiredLicensesCount,
  over20kBakeriesCount,
  uncompletedTasksCount,
  customLogoBase64,
}) => {
  const bakeriesTotal = bakeriesCount ?? totalBakeriesCount ?? 0;
  const debtsTotal = debtsCount ?? totalDebtsCount ?? 0;
  const alertsTotal = alertsCount ?? expiredLicensesCount ?? 0;
  const largeDebtsTotal = largeDebtsCount ?? over20kBakeriesCount ?? 0;
  const tasksTotal = pendingTasksCount ?? uncompletedTasksCount ?? 0;
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      'group-1': true,
      'group-2': true,
      'group-3': false,
      'group-4': false,
      'group-5': true,
      'group-6': false,
      'group-7': false,
      'group-8': false,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(openGroups));
    } catch {
      // ignore
    }
  }, [openGroups]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
    } catch {
      // ignore
    }
  }, [isCollapsed]);

  const toggleGroup = (groupId: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setOpenGroups((prev) => ({ ...prev, [groupId]: true }));
      return;
    }
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const groups: SidebarGroup[] = [
    {
      id: 'group-1',
      title: '1. الرئيسية',
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
      items: [
        { id: 'dashboard-home', label: 'لوحة التحكم', icon: <Home className="w-4 h-4 shrink-0" /> },
        { id: 'dashboard-main', label: 'الصفحة الرئيسية', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
        { id: 'dashboard-kpis', label: 'المؤشرات العامة', icon: <BarChart3 className="w-4 h-4 shrink-0" /> },
        {
          id: 'dashboard-status',
          label: 'الإحصائيات وملخص المخابز',
          icon: <Activity className="w-4 h-4 shrink-0" />,
          badge: totalBakeriesCount,
          badgeColor: 'blue',
        },
        { id: 'dashboard-recent', label: 'آخر التحديثات', icon: <Clock className="w-4 h-4 shrink-0" /> },
      ],
    },
    {
      id: 'group-2',
      title: '2. إدارة المخابز',
      icon: <Store className="w-5 h-5 shrink-0" />,
      items: [
        {
          id: 'bakeries-all',
          label: 'قاعدة بيانات المخابز',
          icon: <Database className="w-4 h-4 shrink-0" />,
          badge: totalBakeriesCount,
          badgeColor: 'blue',
        },
        {
          id: 'data-add-bakery',
          label: 'إضافة مخبز جديد',
          icon: <PlusCircle className="w-4 h-4 shrink-0" />,
          badgeColor: 'emerald',
        },
        {
          id: 'data-edit-master',
          label: 'تعديل بيانات المخابز',
          icon: <Edit3 className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'bakery-details-view',
          label: 'عرض تفاصيل المخبز',
          icon: <Eye className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'bakeries-basic',
          label: 'تصنيف المخابز والبيانات',
          icon: <FileText className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'bakeries-quotas',
          label: 'بيانات الحصص الفعلية',
          icon: <Layers className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'bakeries-bread',
          label: 'أنواع الخبز والتشغيل',
          icon: <Wheat className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'bakeries-insurance',
          label: 'بيانات المبالغ التأمينية',
          icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'bakeries-beneficiaries',
          label: 'بيانات المستفيدين',
          icon: <Users className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'debts-main',
          label: 'قاعدة بيانات مديونيات المخابز',
          icon: <Scale className="w-4 h-4 shrink-0" />,
          badge: debtsTotal > 0 ? debtsTotal : undefined,
          badgeColor: 'red',
        },
        {
          id: 'debts-weekly',
          label: 'جدول الدفعات الأسبوعية',
          icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
          badge: largeDebtsTotal > 0 ? largeDebtsTotal : undefined,
          badgeColor: 'amber',
        },
      ],
    },
    {
      id: 'group-3',
      title: '3. الحسابات والمؤشرات',
      icon: <Calculator className="w-5 h-5 shrink-0" />,
      items: [
        {
          id: 'calc-insurance-quota',
          label: 'الحصص التأمينية',
          icon: <Calculator className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-loaves-count',
          label: 'عدد الأرغفة',
          icon: <Wheat className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-avg-2023',
          label: 'متوسط نصيب الفرد 2023',
          icon: <Percent className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-avg-2024',
          label: 'متوسط نصيب الفرد 2024',
          icon: <Percent className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-avg-2025',
          label: 'متوسط نصيب الفرد 2025',
          icon: <Percent className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-avg-bakery',
          label: 'متوسط نصيب الفرد للمخبز الواحد',
          icon: <Store className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-cum-diff',
          label: 'الفرق التراكمي',
          icon: <TrendingDown className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-recalculate-all',
          label: 'إعادة احتساب جميع المعادلات',
          icon: <RefreshCw className="w-4 h-4 shrink-0" />,
          badgeColor: 'emerald',
        },
      ],
    },
    {
      id: 'group-4',
      title: '4. البحث والاستعلام',
      icon: <Search className="w-5 h-5 shrink-0" />,
      items: [
        { id: 'search-quick', label: 'البحث السريع', icon: <Search className="w-4 h-4 shrink-0" /> },
        { id: 'search-by-name', label: 'البحث باسم المخبز', icon: <Store className="w-4 h-4 shrink-0" /> },
        { id: 'search-by-machine', label: 'البحث برقم المخبز', icon: <Hash className="w-4 h-4 shrink-0" /> },
        { id: 'search-by-region', label: 'البحث حسب المنطقة', icon: <MapPin className="w-4 h-4 shrink-0" /> },
        { id: 'search-by-bread', label: 'البحث حسب نوع الخبز', icon: <Wheat className="w-4 h-4 shrink-0" /> },
        { id: 'search-by-quota', label: 'البحث المتقدم', icon: <Filter className="w-4 h-4 shrink-0" /> },
      ],
    },
    {
      id: 'group-5',
      title: '5. مركز التقارير والطباعة',
      icon: <FileText className="w-5 h-5 shrink-0" />,
      items: [
        {
          id: 'reports-center',
          label: 'مركز التقارير والطباعة والتصدير',
          icon: <FileText className="w-4 h-4 shrink-0" />,
          badge: 24,
          badgeColor: 'blue',
        },
        {
          id: 'rep-comprehensive',
          label: 'التقارير التفصيلية للمخابز',
          icon: <FileText className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-master-summary',
          label: 'التقارير الإجمالية والملخص',
          icon: <BarChart3 className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-quotas-loaves',
          label: 'تقارير الحصص والأرغفة',
          icon: <Layers className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-beneficiaries-comp',
          label: 'تقارير المستفيدين (2023-2025)',
          icon: <Users className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-averages',
          label: 'تقارير متوسط نصيب الفرد',
          icon: <Percent className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-cum-diff',
          label: 'المقارنات السنوية والفروق',
          icon: <TrendingDown className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-local-units',
          label: 'تقرير ملخص الوحدات المحلية',
          icon: <MapPin className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'rep-expired-licenses',
          label: 'تقرير التراخيص المنتهية',
          icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
          badge: alertsTotal > 0 ? alertsTotal : undefined,
          badgeColor: 'red',
        },
        {
          id: 'rep-export-print',
          label: 'الطباعة وتصدير PDF',
          icon: <Printer className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'group-6',
      title: '6. إدارة البيانات',
      icon: <Database className="w-5 h-5 shrink-0" />,
      items: [
        {
          id: 'data-import',
          label: 'استيراد Excel',
          icon: <Upload className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-export',
          label: 'تصدير Excel',
          icon: <Download className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'ops-refresh-data',
          label: 'تحديث البيانات',
          icon: <RefreshCw className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-review-missing',
          label: 'مراجعة البيانات',
          icon: <CheckSquare className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-backup',
          label: 'النسخ الاحتياطي',
          icon: <HardDrive className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-restore',
          label: 'استعادة البيانات',
          icon: <RotateCcw className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-tasks',
          label: 'المهام اليومية والزيارات',
          icon: <ClipboardList className="w-4 h-4 shrink-0" />,
          badge: tasksTotal > 0 ? tasksTotal : undefined,
          badgeColor: 'amber',
        },
        {
          id: 'data-notes',
          label: 'سجل الملاحظات والردود',
          icon: <BookOpen className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-inbox',
          label: 'الوارد والصادر والردود',
          icon: <Mail className="w-4 h-4 shrink-0" />,
          badge: unreadInboxCount > 0 ? unreadInboxCount : undefined,
          badgeColor: 'blue',
        },
        {
          id: 'data-map',
          label: 'خريطة مواقع المخابز',
          icon: <Map className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'group-7',
      title: '7. أدوات التشغيل',
      icon: <Sliders className="w-5 h-5 shrink-0" />,
      items: [
        {
          id: 'ops-save-data',
          label: 'حفظ البيانات',
          icon: <Save className="w-4 h-4 shrink-0" />,
          badgeColor: 'emerald',
        },
        {
          id: 'ops-refresh-screen',
          label: 'تحديث الشاشة',
          icon: <RefreshCw className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'ops-reload-data',
          label: 'إعادة تحميل البيانات',
          icon: <RotateCcw className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-audit',
          label: 'سجل العمليات والتدقيق',
          icon: <CheckSquare className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'ops-alerts',
          label: 'التنبيهات والإشعارات',
          icon: <Bell className="w-4 h-4 shrink-0" />,
          badge: alertsTotal + largeDebtsTotal > 0 ? alertsTotal + largeDebtsTotal : undefined,
          badgeColor: 'amber',
        },
        {
          id: 'ops-help',
          label: 'المساعدة ودليل المعادلات',
          icon: <HelpCircle className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'group-8',
      title: '8. الإعدادات',
      icon: <Settings className="w-5 h-5 shrink-0" />,
      items: [
        {
          id: 'settings-columns',
          label: 'إعدادات المنظومة والأعمدة',
          icon: <Sliders className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-users',
          label: 'إدارة المستخدمين',
          icon: <UserCheck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-permissions',
          label: 'الصلاحيات والأدوار',
          icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-theme',
          label: 'تخصيص الواجهة والشعار',
          icon: <Settings className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-gdrive',
          label: 'ربط Google Drive',
          icon: <Cloud className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-database',
          label: 'إعدادات قاعدة البيانات',
          icon: <Database className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-publish',
          label: 'نشر وتحديث النظام (Publish)',
          icon: <Globe className="w-4 h-4 shrink-0" />,
          badgeColor: 'emerald',
        },
        {
          id: 'settings-account',
          label: 'إعدادات الحساب',
          icon: <UserCheck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-logout',
          label: 'تسجيل الخروج',
          icon: <LogOut className="w-4 h-4 shrink-0" />,
          badgeColor: 'red',
        },
      ],
    },
  ];

  // Find active group & item label
  let activeGroupId = 'group-2';
  let activeItemLabel = 'قاعدة بيانات المخابز';
  for (const grp of groups) {
    const found = grp.items.find((it) => it.id === activeNavId);
    if (found) {
      activeGroupId = grp.id;
      activeItemLabel = found.label;
      break;
    }
  }

  return (
    <aside
      aria-label="القائمة الجانبية الرئيسية"
      className={`bg-gradient-to-b from-[#08152C] via-[#0F2342] to-[#132C54] text-white border-l border-[#1E3A8A]/70 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none no-print shadow-2xl ${
        isCollapsed ? 'w-[78px]' : 'w-[310px]'
      }`}
    >
      {/* Top Sidebar Identity & Collapse Button */}
      <div className="px-4 py-3.5 border-b border-white/12 flex items-center justify-between gap-2 bg-[#071226]/70">
        {!isCollapsed && (
          <div className="flex items-center gap-3 min-w-0">
            {customLogoBase64 ? (
              <img
                src={customLogoBase64}
                alt="شعار المنظومة"
                className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 shrink-0 border border-blue-300/30 shadow-sm"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[#1E3A8A] flex items-center justify-center shrink-0 border border-blue-400/30">
                <Store className="w-5 h-5 text-white" />
              </div>
            )}
            <div className="truncate">
              <div className="text-sm font-black text-white truncate tracking-tight">
                إدارة تموين المحلة الكبرى
              </div>
              <div className="text-[11px] text-blue-200 font-bold truncate">
                مركز التحكم الرئيسي للمنظومة
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
          className="p-2 rounded-xl bg-white/10 hover:bg-[#2563EB] text-white transition-all duration-200 cursor-pointer mx-auto sm:mx-0 border border-white/10 hover:border-blue-300/50 active:scale-95"
        >
          {isCollapsed ? (
            <PanelRightOpen className="w-5 h-5" />
          ) : (
            <PanelRightClose className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Active Section Quick Indicator when expanded */}
      {!isCollapsed && (
        <div className="px-4 py-2.5 bg-[#0A1931]/90 border-b border-white/10 flex items-center justify-between text-xs">
          <span className="text-blue-200 font-bold">القسم النشط:</span>
          <span className="text-white font-black truncate max-w-[185px] bg-[#1E40AF]/60 px-2.5 py-0.5 rounded-lg border border-blue-400/30">
            {activeItemLabel}
          </span>
        </div>
      )}

      {/* Scrollable Navigation Groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-2 custom-scrollbar">
        {groups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const isGroupActive = activeGroupId === group.id;

          return (
            <div
              key={group.id}
              className={`rounded-2xl transition-all duration-200 ${
                isGroupActive
                  ? 'bg-[#152E59]/90 border border-blue-400/35 shadow-md'
                  : 'bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07]'
              }`}
            >
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                title={group.title}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-right transition-all duration-200 cursor-pointer ${
                  isGroupActive
                    ? 'text-white font-black'
                    : 'text-white font-bold hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`p-1.5 rounded-xl transition-colors ${
                      isGroupActive
                        ? 'bg-[#2563EB] text-white shadow-sm'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    {group.icon}
                  </span>
                  {!isCollapsed && (
                    <span className="text-[14px] font-black text-white truncate tracking-tight">
                      {group.title}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <span className="text-white/80 shrink-0">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                    ) : (
                      <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                    )}
                  </span>
                )}
              </button>

              {/* Group Sub-Items */}
              {isOpen && !isCollapsed && (
                <div className="px-2 pb-2.5 pt-1 space-y-1.5 border-t border-white/10">
                  {group.items.map((item) => {
                    const isItemActive = activeNavId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onSelectNav(
                            item.id,
                            group.title.replace(/^\d+\.\s*/, ''),
                            item.label
                          )
                        }
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200 cursor-pointer group ${
                          isItemActive
                            ? 'bg-gradient-to-l from-[#1D4ED8] to-[#2563EB] text-white font-black shadow-[0_4px_14px_rgba(37,99,235,0.45)] border border-blue-300/60 -translate-x-1'
                            : 'text-white bg-white/[0.03] hover:bg-white/15 hover:-translate-x-1 hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] border border-transparent hover:border-blue-400/30 active:scale-[0.98]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-white shrink-0 transition-transform duration-200 group-hover:scale-110">
                            {item.icon}
                          </span>
                          <span className="truncate text-right text-white font-bold">
                            {item.label}
                          </span>
                        </div>

                        {item.badge !== undefined ? (
                          <span
                            className={`px-2 py-0.5 text-[11px] font-black rounded-full shrink-0 font-mono text-white ${
                              item.badgeColor === 'red'
                                ? 'bg-red-600 shadow-xs'
                                : item.badgeColor === 'amber'
                                ? 'bg-amber-600 shadow-xs'
                                : item.badgeColor === 'emerald'
                                ? 'bg-emerald-600 shadow-xs'
                                : 'bg-blue-600 shadow-xs'
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : isItemActive ? (
                          <ChevronLeft className="w-4 h-4 text-white shrink-0" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Sidebar Status Footer */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-t border-white/12 bg-[#071226]/90 text-[11px] text-white font-bold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>قاعدة البيانات نشطة ومؤمنة</span>
          </span>
          <span className="font-mono text-blue-200 font-black">RTL • v3.5</span>
        </div>
      )}
    </aside>
  );
};
