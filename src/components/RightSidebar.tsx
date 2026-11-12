import React, { useState, useEffect } from 'react';
import {
  Store,
  Calculator,
  Percent,
  FileText,
  Search,
  Database,
  PlusCircle,
  Edit3,
  Upload,
  Download,
  HardDrive,
  Sliders,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  Save,
  Bell,
  Eye,
  ListChecks,
  Layers,
  ShieldAlert,
  Calendar,
  CheckSquare,
  CalendarClock,
} from 'lucide-react';

export type SidebarNavId = string;

export interface SidebarSubItem {
  id: SidebarNavId;
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: number | string;
  badgeColor?: 'blue' | 'amber' | 'red' | 'emerald';
}

export interface SidebarGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  iconBg: string;
  activeBorder: string;
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

const SIDEBAR_STORAGE_KEY = 'tamween_sidebar_erp_groups_v4';
const SIDEBAR_COLLAPSED_KEY = 'tamween_sidebar_collapsed_v4';

export const RightSidebar: React.FC<RightSidebarProps> = ({
  activeNavId,
  onSelectNav,
  bakeriesCount,
  debtsCount,
  alertsCount,
  largeDebtsCount,
  administrationTitle,
  totalBakeriesCount,
  totalDebtsCount,
  expiredLicensesCount,
  over20kBakeriesCount,
  customLogoBase64,
}) => {
  const bakeriesTotal = bakeriesCount ?? totalBakeriesCount ?? 0;
  const debtsTotal = debtsCount ?? totalDebtsCount ?? 0;
  const alertsTotal = alertsCount ?? expiredLicensesCount ?? 0;
  const largeDebtsTotal = largeDebtsCount ?? over20kBakeriesCount ?? 0;

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
      'section-bakeries': true,
      'section-edits': true,
      'section-debts': true,
      'section-backup': true,
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
      id: 'section-bakeries',
      title: '1. قسم إدارة المخابز',
      subtitle: 'البيانات الأساسية والحسابات والتقارير',
      icon: <Store className="w-4 h-4 shrink-0" />,
      accentColor: 'from-blue-600 to-indigo-700',
      iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-950',
      activeBorder: 'border-blue-500/60',
      items: [
        {
          id: 'bakeries-all',
          label: 'إدارة المخابز',
          subtitle: 'السجل الرسمي الشامل لبيانات المخابز',
          icon: <Database className="w-4 h-4 shrink-0" />,
          badge: bakeriesTotal > 0 ? bakeriesTotal : undefined,
          badgeColor: 'blue',
        },
        {
          id: 'data-add-bakery',
          label: 'إضافات بيانات جديدة',
          subtitle: 'إدراج مخبز جديد في قاعدة البيانات',
          icon: <PlusCircle className="w-4 h-4 shrink-0" />,
          badgeColor: 'emerald',
        },
        {
          id: 'search-advanced',
          label: 'البحث والاستعلام',
          subtitle: 'استعلام فوري بالاسم أو الماكينة أو القرية',
          icon: <Search className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'calc-equations-view',
          label: 'الحسابات والمعادلات',
          subtitle: 'مراجعة الحصص والأرغفة والفروق التراكمية',
          icon: <Calculator className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'report-per-capita',
          label: 'تقرير متوسط نصيب الفرد السنوية',
          subtitle: 'معدلات 2023 و2024 و2025 والفرق التراكمي',
          icon: <Percent className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-alerts',
          label: 'مفتاح التنبيهات',
          subtitle: 'التراخيص المنتهية والمخابز الموقوفة',
          icon: <Bell className="w-4 h-4 shrink-0" />,
          badge: alertsTotal > 0 ? alertsTotal : undefined,
          badgeColor: 'amber',
        },
      ],
    },
    {
      id: 'section-edits',
      title: '2. قسم التعديلات',
      subtitle: 'تحديث السجلات والقوائم وإعدادات الجداول',
      icon: <Edit3 className="w-4 h-4 shrink-0" />,
      accentColor: 'from-amber-500 to-orange-600',
      iconBg: 'bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950 shadow-sm shadow-amber-950',
      activeBorder: 'border-amber-500/60',
      items: [
        {
          id: 'branches-manage',
          label: 'قسم الفروع والإدارات التموينية',
          subtitle: 'إضافة وحذف الإدارات وتبديل واجهة الفرع',
          icon: <Layers className="w-4 h-4 shrink-0" />,
          badge: 'فروع',
          badgeColor: 'emerald',
        },
        {
          id: 'data-edit-bakery',
          label: 'تعديل البيانات',
          subtitle: 'تعديل مباشر لبيانات وحصص المخابز',
          icon: <Edit3 className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-edit-master',
          label: 'القوائم',
          subtitle: 'إدارة القرى والوحدات والجهات والمخالفات',
          icon: <ListChecks className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-view-mode',
          label: 'إعدادات العرض',
          subtitle: 'التحكم في نمط العرض والتجميع والصفحات',
          icon: <Eye className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'settings-display',
          label: 'إعدادات الأعمدة',
          subtitle: 'تخصيص وإظهار/إخفاء ومسميات الأعمدة',
          icon: <Sliders className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      id: 'section-debts',
      title: '3. قسم سجل المديونيات',
      subtitle: 'متابعة المخالفات والتحصيل المالي للمخابز',
      icon: <Scale className="w-4 h-4 shrink-0" />,
      accentColor: 'from-rose-600 to-red-700',
      iconBg: 'bg-gradient-to-br from-rose-500 to-red-700 text-white shadow-sm shadow-rose-950',
      activeBorder: 'border-rose-500/60',
      items: [
        {
          id: 'debts-records',
          label: 'سجل المديونيات',
          subtitle: 'الجدول المالي الموحد لمديونيات المخابز',
          icon: <FileText className="w-4 h-4 shrink-0" />,
          badge: debtsTotal > 0 ? debtsTotal : undefined,
          badgeColor: 'red',
        },
        {
          id: 'debts-add-schedule',
          label: 'إضافة جدولة مديونيات',
          subtitle: 'جدولة المديونيات والمخالفات على صاحب المخبز',
          icon: <CalendarClock className="w-4 h-4 shrink-0" />,
          badge: 'جديد',
          badgeColor: 'emerald',
        },
        {
          id: 'debts-alerts-key',
          label: 'مفتاح التنبيهات الخاص بسجل المديونيات',
          subtitle: 'المديونيات الحرجة (>20 ألف) والمتأخرات',
          icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
          badge: largeDebtsTotal > 0 ? largeDebtsTotal : undefined,
          badgeColor: 'amber',
        },
      ],
    },
    {
      id: 'section-backup',
      title: '4. قسم الحفظ والنسخ',
      subtitle: 'حفظ التعديلات وتبادل الملفات والنسخ الآمن',
      icon: <HardDrive className="w-4 h-4 shrink-0" />,
      accentColor: 'from-emerald-600 to-teal-700',
      iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm shadow-emerald-950',
      activeBorder: 'border-emerald-500/60',
      items: [
        {
          id: 'ops-save-data',
          label: 'حفظ البيانات',
          subtitle: 'تثبيت وحفظ كافة التعديلات الحالية فوراً',
          icon: <Save className="w-4 h-4 shrink-0" />,
          badgeColor: 'emerald',
        },
        {
          id: 'data-import',
          label: 'استيراد البيانات',
          subtitle: 'استيراد ملفات Excel أو قواعد البيانات',
          icon: <Upload className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-export',
          label: 'تصدير البيانات',
          subtitle: 'تصدير الجداول إلى Excel أو التقرير المطبوع',
          icon: <Download className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'data-backup',
          label: 'النسخ الاحتياطي',
          subtitle: 'إنشاء أو استعادة نسخة احتياطية كاملة',
          icon: <HardDrive className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'workspace-calendar',
          label: 'تقويم Google Calendar',
          subtitle: 'مزامنة مواعيد التراخيص والدفعات الأسبوعية',
          icon: <Calendar className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'workspace-tasks',
          label: 'مهام Google Tasks',
          subtitle: 'إدارة ومزامنة المهام اليومية للمخابز',
          icon: <CheckSquare className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'workspace-forms',
          label: 'نماذج Google Forms',
          subtitle: 'إنشاء نماذج التفتيش التمويني وقراءة الردود',
          icon: <FileText className="w-4 h-4 shrink-0" />,
        },
      ],
    },
  ];

  let activeGroupId = 'section-bakeries';
  let activeItemLabel = 'إدارة المخابز';
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
      aria-label="القائمة الجانبية الرئيسية لمنظومة ERP"
      className={`bg-gradient-to-b from-[#061022] via-[#091730] to-[#050C1A] text-slate-100 border-l border-slate-800/90 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none no-print shadow-2xl ${
        isCollapsed ? 'w-[74px]' : 'w-[295px]'
      }`}
    >
      {/* Top Sidebar Identity & Collapse Button */}
      <div className="px-3.5 py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2.5 bg-[#040B18]/90">
        {!isCollapsed && (
          <div className="flex items-center gap-3 min-w-0">
            {customLogoBase64 ? (
              <img
                src={customLogoBase64}
                alt="شعار المنظومة"
                className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 shrink-0 border-2 border-amber-400/70 shadow-md"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 border border-amber-200 shadow-md">
                <Layers className="w-5 h-5 text-slate-950" />
              </div>
            )}
            <div className="truncate">
              <div className="text-[13px] font-black text-white truncate tracking-tight leading-tight">
                {administrationTitle || 'إدارة تموين مركز المحلة الكبرى'}
              </div>
              <div className="text-[10px] text-amber-300/90 font-bold truncate mt-0.5">
                منظومة الرقابة التموينية الذكية
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
          className="p-2 rounded-xl bg-slate-800/90 hover:bg-amber-500 text-slate-200 hover:text-slate-950 transition-all duration-200 cursor-pointer border border-slate-700 hover:border-amber-300 shadow-sm"
        >
          {isCollapsed ? (
            <PanelRightOpen className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Active Section Indicator Pill */}
      {!isCollapsed && (
        <div className="px-3.5 py-2.5 border-b border-slate-800/80 flex items-center justify-between text-[11px] bg-[#0B1B38]/75">
          <span className="text-slate-300 font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>القسم النشط:</span>
          </span>
          <span className="text-amber-300 font-black bg-amber-500/15 px-2.5 py-0.5 rounded-lg border border-amber-400/40 truncate max-w-[165px]">
            {activeItemLabel}
          </span>
        </div>
      )}

      {/* Scrollable Navigation Groups — Executive Smooth Card Buttons */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-3 custom-scrollbar">
        {groups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const isGroupActive = activeGroupId === group.id;

          return (
            <div
              key={group.id}
              className={`rounded-2xl transition-all duration-200 overflow-hidden border ${
                isGroupActive
                  ? `bg-[#0B1933]/95 ${group.activeBorder} shadow-lg`
                  : 'bg-[#071124]/90 border-slate-800/90 hover:border-slate-700'
              }`}
            >
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                title={group.title}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-right transition-all duration-200 cursor-pointer ${
                  isGroupActive
                    ? 'bg-gradient-to-l from-[#122852] via-[#0E2042] to-[#09152B] text-white'
                    : 'text-slate-200 hover:bg-[#0D1E3A]/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${group.iconBg}`}>
                    {group.icon}
                  </span>
                  {!isCollapsed && (
                    <div className="min-w-0 text-right">
                      <div className="text-[13px] font-black text-white truncate tracking-tight">
                        {group.title}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold truncate">
                        {group.subtitle}
                      </div>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center bg-slate-800/80 border border-slate-700/80 text-slate-300 transition-transform duration-200 ${
                      isOpen ? 'rotate-0 text-amber-300 border-amber-500/40' : '-rotate-90'
                    }`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>

              {/* Group Sub-Items Menu Tree */}
              {isOpen && !isCollapsed && (
                <div className="p-2 space-y-1.5 border-t border-slate-800/80 bg-[#050D1D]/90">
                  {group.items.map((item) => {
                    const isItemActive = activeNavId === item.id;
                    const isScheduleItem = item.id === 'debts-add-schedule';
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
                        className={`w-full relative flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-right cursor-pointer group transition-all duration-200 border ${
                          isItemActive
                            ? 'bg-gradient-to-l from-amber-500/20 via-blue-900/50 to-slate-900 text-white font-black border-amber-400/70 shadow-md'
                            : isScheduleItem
                            ? 'bg-gradient-to-l from-emerald-950/70 to-slate-900/90 hover:from-emerald-900/80 hover:to-slate-800 text-emerald-200 hover:text-white border-emerald-500/40 hover:border-emerald-400 shadow-sm'
                            : 'bg-[#09152B]/70 hover:bg-[#112448] text-slate-300 hover:text-white border-slate-800/80 hover:border-blue-500/40'
                        }`}
                      >
                        {/* Right Active Indicator Bar */}
                        <span
                          className={`w-1 self-stretch rounded-full transition-all duration-200 shrink-0 ${
                            isItemActive
                              ? 'bg-amber-400'
                              : isScheduleItem
                              ? 'bg-emerald-400 group-hover:bg-emerald-300'
                              : 'bg-transparent group-hover:bg-blue-400/70'
                          }`}
                        />

                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 border ${
                              isItemActive
                                ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-sm'
                                : isScheduleItem
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 group-hover:bg-emerald-500 group-hover:text-slate-950'
                                : 'bg-slate-900/90 text-blue-300 border-slate-700/80 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-400'
                            }`}
                          >
                            {item.icon}
                          </span>

                          <div className="min-w-0 flex-1 text-right">
                            <div
                              className={`text-[12.5px] leading-snug truncate ${
                                isItemActive
                                  ? 'font-black text-amber-200'
                                  : isScheduleItem
                                  ? 'font-black text-emerald-200 group-hover:text-white'
                                  : 'font-extrabold text-slate-100 group-hover:text-white'
                              }`}
                            >
                              {item.label}
                            </div>
                            {item.subtitle && (
                              <div className="text-[10px] text-slate-400 group-hover:text-slate-300 font-semibold truncate mt-0.5">
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>

                        {item.badge !== undefined && (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-black rounded-lg shrink-0 font-mono border ${
                              item.badgeColor === 'red'
                                ? 'bg-red-500/20 text-red-200 border-red-500/40'
                                : item.badgeColor === 'amber'
                                ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                : item.badgeColor === 'emerald'
                                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                                : 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Collapsed Icon-Only Sub-Items */}
              {isCollapsed && (
                <div className="p-1.5 space-y-1.5 border-t border-slate-800 bg-[#050D1D] flex flex-col items-center">
                  {group.items.map((item) => {
                    const isItemActive = activeNavId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={`${group.title} — ${item.label}`}
                        onClick={() =>
                          onSelectNav(
                            item.id,
                            group.title.replace(/^\d+\.\s*/, ''),
                            item.label
                          )
                        }
                        className={`p-2 rounded-xl transition-all cursor-pointer relative border ${
                          isItemActive
                            ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-md'
                            : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-blue-600 hover:text-white hover:border-blue-400'
                        }`}
                      >
                        {item.icon}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Sidebar Footer */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-t border-slate-800/90 bg-[#040B18] text-[11px] text-slate-400 font-bold flex items-center justify-between">
          <span>منظومة إدارة التموين والمخابز</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[10px] font-black">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            متصل
          </span>
        </div>
      )}
    </aside>
  );
};
