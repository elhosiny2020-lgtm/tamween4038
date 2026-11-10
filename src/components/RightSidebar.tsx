import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Store,
  Calculator,
  FileBarChart,
  Search,
  Database,
  Settings,
  ChevronDown,
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
  Home,
  BarChart3,
  Activity,
  Clock,
  FileText,
  Wheat,
  Coins,
  Users,
  Scale,
  Percent,
  TrendingUp,
  Layers,
  GitCompare,
  PieChart,
  Filter,
  MapPin,
  Hash,
  PlusCircle,
  Edit3,
  Upload,
  Download,
  HardDrive,
  ShieldCheck,
  Sliders,
  UserCheck,
  Inbox,
  Columns3,
  LogOut,
  CheckCircle2,
  Receipt,
  ListTodo,
  Bell,
} from 'lucide-react';

export type SidebarNavId =
  // المجموعة الأولى: لوحة التحكم
  | 'dashboard-home'
  | 'dashboard-kpis'
  | 'dashboard-summary'
  | 'dashboard-updates'
  // المجموعة الثانية: إدارة المخابز
  | 'bakeries-all'
  | 'bakeries-basic'
  | 'bakeries-bread-types'
  | 'bakeries-actual-quotas'
  | 'bakeries-insurance'
  | 'bakeries-beneficiaries'
  | 'debts-records'
  | 'debts-installments'
  // المجموعة الثالثة: الحسابات والمعادلات
  | 'calc-insurance-quota'
  | 'calc-loaves'
  | 'calc-avg-2023'
  | 'calc-avg-2024'
  | 'calc-avg-2025'
  | 'calc-per-bakery'
  | 'calc-cum-diff'
  | 'calc-recalculate-all'
  // المجموعة الرابعة: التقارير والإحصائيات
  | 'report-detailed'
  | 'report-summary'
  | 'report-years-comparison'
  | 'report-insurance-quotas'
  | 'report-per-capita'
  | 'report-differences'
  // المجموعة الخامسة: البحث والاستعلام
  | 'search-by-name'
  | 'search-by-machine'
  | 'search-by-area'
  | 'search-by-bread'
  | 'search-advanced'
  // المجموعة السادسة: إدارة البيانات
  | 'data-add-bakery'
  | 'data-edit-master'
  | 'data-import'
  | 'data-export'
  | 'data-backup'
  | 'data-integrity'
  // المجموعة السابعة: الإعدادات والإدارة
  | 'settings-system'
  | 'settings-users'
  | 'settings-logs'
  | 'settings-display'
  | 'settings-daily-tasks'
  | 'settings-alerts'
  | 'settings-logout';

export interface SidebarSubItem {
  id: SidebarNavId;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string | number;
  badgeType?: 'default' | 'warning' | 'danger' | 'success';
}

export interface SidebarGroup {
  id: string;
  shortTitle: string;
  title: string;
  icon: React.FC<{ className?: string }>;
  items: SidebarSubItem[];
}

interface RightSidebarProps {
  activeNavId: SidebarNavId;
  onSelectNav: (navId: SidebarNavId, groupTitle: string, itemLabel: string) => void;
  bakeriesCount: number;
  debtsCount: number;
  alertsCount: number;
  unreadInboxCount: number;
  pendingTasksCount: number;
  largeDebtsCount: number;
  logoBase64: string;
  administrationTitle: string;
  directorateTitle: string;
}

const STORAGE_KEY_GROUPS = 'TAMWEEN_SIDEBAR_OPEN_GROUPS_V1';
const STORAGE_KEY_COLLAPSED = 'TAMWEEN_SIDEBAR_COLLAPSED_V1';

export const RightSidebar: React.FC<RightSidebarProps> = ({
  activeNavId,
  onSelectNav,
  bakeriesCount,
  debtsCount,
  alertsCount,
  unreadInboxCount,
  pendingTasksCount,
  largeDebtsCount,
  logoBase64,
  administrationTitle,
  directorateTitle,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_COLLAPSED) === 'true';
    } catch {
      return false;
    }
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GROUPS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      group1: true,
      group2: true,
      group3: false,
      group4: false,
      group5: false,
      group6: false,
      group7: false,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(isCollapsed));
    } catch {}
  }, [isCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(openGroups));
    } catch {}
  }, [openGroups]);

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
      id: 'group1',
      shortTitle: 'لوحة التحكم',
      title: '1. لوحة التحكم',
      icon: LayoutDashboard,
      items: [
        { id: 'dashboard-home', label: 'الصفحة الرئيسية', icon: Home },
        { id: 'dashboard-kpis', label: 'المؤشرات والإحصائيات', icon: BarChart3 },
        { id: 'dashboard-summary', label: 'ملخص حالة المخابز', icon: Activity, badge: bakeriesCount },
        { id: 'dashboard-updates', label: 'آخر العمليات والتحديثات', icon: Clock },
      ],
    },
    {
      id: 'group2',
      shortTitle: 'إدارة المخابز',
      title: '2. إدارة المخابز',
      icon: Store,
      items: [
        { id: 'bakeries-all', label: 'قاعدة بيانات المخابز', icon: Database, badge: bakeriesCount },
        { id: 'bakeries-basic', label: 'بيانات المخابز الأساسية', icon: FileText },
        { id: 'bakeries-bread-types', label: 'أنواع الخبز والتشغيل', icon: Wheat },
        { id: 'bakeries-actual-quotas', label: 'الحصص الفعلية', icon: Layers },
        { id: 'bakeries-insurance', label: 'بيانات المبالغ التأمينية', icon: Coins },
        { id: 'bakeries-beneficiaries', label: 'بيانات المستفيدين', icon: Users },
        { id: 'debts-records', label: 'سجل مديونيات المخابز', icon: Scale, badge: debtsCount, badgeType: 'danger' },
        {
          id: 'debts-installments',
          label: 'جدول الدفعات الأسبوعية',
          icon: Receipt,
          badge: largeDebtsCount > 0 ? largeDebtsCount : undefined,
          badgeType: 'warning',
        },
      ],
    },
    {
      id: 'group3',
      shortTitle: 'الحسابات والمعادلات',
      title: '3. الحسابات والمعادلات',
      icon: Calculator,
      items: [
        { id: 'calc-insurance-quota', label: 'احتساب الحصة التأمينية', icon: Calculator },
        { id: 'calc-loaves', label: 'احتساب عدد الأرغفة', icon: Wheat },
        { id: 'calc-avg-2023', label: 'متوسط نصيب الفرد لعام 2023', icon: Percent },
        { id: 'calc-avg-2024', label: 'متوسط نصيب الفرد لعام 2024', icon: Percent },
        { id: 'calc-avg-2025', label: 'متوسط نصيب الفرد لعام 2025', icon: Percent },
        { id: 'calc-per-bakery', label: 'متوسط نصيب الفرد للمخبز الواحد', icon: Store },
        { id: 'calc-cum-diff', label: 'الفرق التراكمي لمتوسطات نصيب الفرد', icon: TrendingUp },
        { id: 'calc-recalculate-all', label: 'تدقيق وإعادة احتساب الكل', icon: CheckCircle2, badge: '∑', badgeType: 'success' },
      ],
    },
    {
      id: 'group4',
      shortTitle: 'التقارير والإحصائيات',
      title: '4. التقارير والإحصائيات',
      icon: FileBarChart,
      items: [
        { id: 'report-detailed', label: 'التقارير التفصيلية', icon: FileText },
        { id: 'report-summary', label: 'التقارير الإجمالية والوحدات', icon: PieChart },
        { id: 'report-years-comparison', label: 'مقارنة بيانات الأعوام', icon: GitCompare },
        { id: 'report-insurance-quotas', label: 'تقارير الحصص التأمينية', icon: Coins },
        { id: 'report-per-capita', label: 'تقارير متوسطات نصيب الفرد', icon: Users },
        { id: 'report-differences', label: 'تقارير الفروق والتغيرات', icon: TrendingUp },
      ],
    },
    {
      id: 'group5',
      shortTitle: 'البحث والاستعلام',
      title: '5. البحث والاستعلام',
      icon: Search,
      items: [
        { id: 'search-by-name', label: 'البحث باسم المخبز', icon: Search },
        { id: 'search-by-machine', label: 'البحث برقم المخبز / الماكينة', icon: Hash },
        { id: 'search-by-area', label: 'البحث حسب المنطقة والقرية', icon: MapPin },
        { id: 'search-by-bread', label: 'البحث حسب نوع الخبز', icon: Wheat },
        { id: 'search-advanced', label: 'البحث المتقدم متعدد المعايير', icon: Filter },
      ],
    },
    {
      id: 'group6',
      shortTitle: 'إدارة البيانات',
      title: '6. إدارة البيانات',
      icon: Database,
      items: [
        { id: 'data-add-bakery', label: 'إضافة بيانات جديدة', icon: PlusCircle },
        { id: 'data-edit-master', label: 'تعديل البيانات والقوائم', icon: Edit3 },
        { id: 'data-import', label: 'استيراد البيانات', icon: Upload },
        { id: 'data-export', label: 'تصدير البيانات (Excel)', icon: Download },
        { id: 'data-backup', label: 'النسخ الاحتياطي والنشر السحابي', icon: HardDrive },
        { id: 'data-integrity', label: 'مراجعة سلامة البيانات', icon: ShieldCheck },
      ],
    },
    {
      id: 'group7',
      shortTitle: 'الإعدادات والإدارة',
      title: '7. الإعدادات والإدارة',
      icon: Settings,
      items: [
        { id: 'settings-system', label: 'إعدادات المنظومة والترويسة', icon: Sliders },
        { id: 'settings-users', label: 'إدارة المستخدمين والصلاحيات', icon: UserCheck },
        {
          id: 'settings-logs',
          label: 'سجل العمليات وصندوق الوارد',
          icon: Inbox,
          badge: unreadInboxCount > 0 ? unreadInboxCount : undefined,
          badgeType: 'warning',
        },
        {
          id: 'settings-daily-tasks',
          label: 'إدارة المهام اليومية',
          icon: ListTodo,
          badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
        },
        {
          id: 'settings-alerts',
          label: 'التنبيهات وانتهاء التراخيص',
          icon: Bell,
          badge: alertsCount > 0 ? alertsCount : undefined,
          badgeType: 'danger',
        },
        { id: 'settings-display', label: 'إعدادات العرض والأعمدة', icon: Columns3 },
        { id: 'settings-logout', label: 'تسجيل الخروج', icon: LogOut },
      ],
    },
  ];

  // Find current active label for header inside sidebar
  let activeItemLabel = 'الصفحة الرئيسية';
  for (const g of groups) {
    const found = g.items.find((i) => i.id === activeNavId);
    if (found) {
      activeItemLabel = found.label;
      break;
    }
  }

  return (
    <aside
      aria-label="القائمة الجانبية الرئيسية"
      className={`bg-[#0F2342] text-slate-100 shrink-0 border-l border-[#1E3A5F] shadow-lg transition-all duration-300 flex flex-col select-none no-print ${
        isCollapsed ? 'w-full lg:w-20' : 'w-full lg:w-72 xl:w-76'
      }`}
    >
      {/* Top Sidebar Header & Collapse Toggle */}
      <div className="p-3.5 border-b border-[#1E3A5F] flex items-center justify-between gap-2 bg-[#0B1B34]">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={logoBase64}
              alt="شعار المنظومة"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full bg-white p-0.5 border border-slate-300 object-contain shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-white truncate">{administrationTitle}</div>
              <div className="text-[10px] text-slate-300 truncate">{directorateTitle}</div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
          aria-label={isCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
          className="p-2 rounded-lg bg-[#16315B] hover:bg-[#1E40AF] text-slate-200 hover:text-white transition cursor-pointer mx-auto lg:mx-0 shrink-0"
        >
          {isCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Active Section Indicator Banner */}
      {!isCollapsed && (
        <div className="px-3.5 py-2 bg-[#152E54] border-b border-[#1E3A5F] flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-medium">القسم الحالي:</span>
          <span className="font-bold text-sky-300 truncate max-w-[165px]">{activeItemLabel}</span>
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1.5 max-h-[calc(100vh-140px)]">
        {groups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = !!openGroups[group.id];
          const hasActiveChild = group.items.some((i) => i.id === activeNavId);

          return (
            <div
              key={group.id}
              className={`rounded-xl overflow-hidden transition-colors ${
                hasActiveChild ? 'bg-[#152E54]/90 border border-[#2563EB]/40' : 'bg-transparent'
              }`}
            >
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                title={group.title}
                aria-expanded={isOpen}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  hasActiveChild
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'text-slate-200 hover:bg-[#16315B] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <GroupIcon className={`w-4 h-4 shrink-0 ${hasActiveChild ? 'text-sky-300' : 'text-slate-300'}`} />
                  {!isCollapsed && <span className="truncate">{group.title}</span>}
                </div>
                {!isCollapsed && (
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-slate-300 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-sky-300' : ''
                    }`}
                  />
                )}
              </button>

              {/* Sub-Items List */}
              {!isCollapsed && isOpen && (
                <div className="mt-1 mb-1.5 mr-2 pr-2 border-r border-[#25477A] space-y-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = activeNavId === item.id;
                    const isLogout = item.id === 'settings-logout';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectNav(item.id, group.shortTitle, item.label)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[11.5px] font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#2563EB] text-white font-bold shadow-xs'
                            : isLogout
                            ? 'text-red-300 hover:bg-red-950/50 hover:text-red-200'
                            : 'text-slate-300 hover:bg-[#193561] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ItemIcon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-white' : isLogout ? 'text-red-400' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>

                        {item.badge !== undefined ? (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : item.badgeType === 'danger'
                                ? 'bg-red-600/90 text-white'
                                : item.badgeType === 'warning'
                                ? 'bg-amber-600/90 text-white'
                                : item.badgeType === 'success'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-[#0B1B34] text-slate-300'
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : (
                          isActive && <ChevronLeft className="w-3.5 h-3.5 text-white shrink-0" />
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

      {/* Bottom Status Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t border-[#1E3A5F] bg-[#0B1B34] text-[10px] text-slate-300 flex items-center justify-between">
          <span>حالة القاعدة: متصلة ومؤمنة</span>
          <span className="font-mono text-slate-400">RTL • v3.2</span>
        </div>
      )}
    </aside>
  );
};
