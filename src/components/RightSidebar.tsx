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
  ChevronLeft,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  AlertTriangle,
  Save,
  Bell,
  Eye,
  ListChecks,
  Layers,
  ShieldAlert,
  Calendar,
  CheckSquare,
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
      icon: <Store className="w-5 h-5 shrink-0 icon-animated" />,
      accentColor: 'from-blue-600 to-indigo-700',
      items: [
        {
          id: 'bakeries-all',
          label: 'إدارة المخابز',
          subtitle: 'السجل الرسمي الشامل لبيانات المخابز',
          icon: <Database className="w-5 h-5 shrink-0 icon-animated" />,
          badge: bakeriesTotal > 0 ? bakeriesTotal : undefined,
          badgeColor: 'blue',
        },
        {
          id: 'data-add-bakery',
          label: 'إضافات بيانات جديدة',
          subtitle: 'إدراج مخبز جديد في قاعدة البيانات',
          icon: <PlusCircle className="w-5 h-5 shrink-0 icon-animated" />,
          badgeColor: 'emerald',
        },
        {
          id: 'search-advanced',
          label: 'البحث والاستعلام',
          subtitle: 'استعلام فوري بالاسم أو الماكينة أو القرية',
          icon: <Search className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'calc-equations-view',
          label: 'الحسابات والمعادلات',
          subtitle: 'مراجعة الحصص والأرغفة والفروق التراكمية',
          icon: <Calculator className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'report-per-capita',
          label: 'تقرير متوسط نصيب الفرد السنوية',
          subtitle: 'معدلات 2023 و2024 و2025 والفرق التراكمي',
          icon: <Percent className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'settings-alerts',
          label: 'مفتاح التنبيهات',
          subtitle: 'التراخيص المنتهية والمخابز الموقوفة',
          icon: <Bell className="w-5 h-5 shrink-0 icon-animated" />,
          badge: alertsTotal > 0 ? alertsTotal : undefined,
          badgeColor: 'amber',
        },
      ],
    },
    {
      id: 'section-edits',
      title: '2. قسم التعديلات',
      subtitle: 'تحديث السجلات والقوائم وإعدادات الجداول',
      icon: <Edit3 className="w-5 h-5 shrink-0 icon-animated" />,
      accentColor: 'from-amber-500 to-orange-600',
      items: [
        {
          id: 'data-edit-bakery',
          label: 'تعديل البيانات',
          subtitle: 'تعديل مباشر لبيانات وحصص المخابز',
          icon: <Edit3 className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'data-edit-master',
          label: 'القوائم',
          subtitle: 'إدارة القرى والوحدات والجهات والمخالفات',
          icon: <ListChecks className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'settings-view-mode',
          label: 'إعدادات العرض',
          subtitle: 'التحكم في نمط العرض والتجميع والصفحات',
          icon: <Eye className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'settings-display',
          label: 'إعدادات الأعمدة',
          subtitle: 'تخصيص وإظهار/إخفاء ومسميات الأعمدة',
          icon: <Sliders className="w-5 h-5 shrink-0 icon-animated" />,
        },
      ],
    },
    {
      id: 'section-debts',
      title: '3. قسم سجل المديونيات',
      subtitle: 'متابعة المخالفات والتحصيل المالي للمخابز',
      icon: <Scale className="w-5 h-5 shrink-0 icon-animated" />,
      accentColor: 'from-rose-600 to-red-700',
      items: [
        {
          id: 'debts-records',
          label: 'سجل المديونيات',
          subtitle: 'الجدول المالي الموحد لمديونيات المخابز',
          icon: <FileText className="w-5 h-5 shrink-0 icon-animated" />,
          badge: debtsTotal > 0 ? debtsTotal : undefined,
          badgeColor: 'red',
        },
        {
          id: 'debts-alerts-key',
          label: 'مفتاح التنبيهات الخاص بسجل المديونيات',
          subtitle: 'المديونيات الحرجة (>20 ألف) والمتأخرات',
          icon: <ShieldAlert className="w-5 h-5 shrink-0 icon-animated" />,
          badge: largeDebtsTotal > 0 ? largeDebtsTotal : undefined,
          badgeColor: 'amber',
        },
      ],
    },
    {
      id: 'section-backup',
      title: '4. قسم الحفظ والنسخ',
      subtitle: 'حفظ التعديلات وتبادل الملفات والنسخ الآمن',
      icon: <HardDrive className="w-5 h-5 shrink-0 icon-animated" />,
      accentColor: 'from-emerald-600 to-teal-700',
      items: [
        {
          id: 'ops-save-data',
          label: 'حفظ البيانات',
          subtitle: 'تثبيت وحفظ كافة التعديلات الحالية فوراً',
          icon: <Save className="w-5 h-5 shrink-0 icon-animated" />,
          badgeColor: 'emerald',
        },
        {
          id: 'data-import',
          label: 'استيراد البيانات',
          subtitle: 'استيراد ملفات Excel أو قواعد البيانات',
          icon: <Upload className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'data-export',
          label: 'تصدير البيانات',
          subtitle: 'تصدير الجداول إلى Excel أو التقرير المطبوع',
          icon: <Download className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'data-backup',
          label: 'النسخ الاحتياطي',
          subtitle: 'إنشاء أو استعادة نسخة احتياطية كاملة',
          icon: <HardDrive className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'workspace-calendar',
          label: 'تقويم Google Calendar',
          subtitle: 'مزامنة مواعيد التراخيص والدفعات الأسبوعية',
          icon: <Calendar className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'workspace-tasks',
          label: 'مهام Google Tasks',
          subtitle: 'إدارة ومزامنة المهام اليومية للمخابز',
          icon: <CheckSquare className="w-5 h-5 shrink-0 icon-animated" />,
        },
        {
          id: 'workspace-forms',
          label: 'نماذج Google Forms',
          subtitle: 'إنشاء نماذج التفتيش التمويني وقراءة الردود',
          icon: <FileText className="w-5 h-5 shrink-0 icon-animated" />,
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
      className={`bg-[#020617] text-slate-100 border-l border-slate-800 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none no-print ${
        isCollapsed ? 'w-[70px]' : 'w-[280px]'
      }`}
    >
      {/* Top Sidebar Identity & Collapse Button */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-[#020617]">
        {!isCollapsed && (
          <div className="flex items-center gap-3 min-w-0">
            {customLogoBase64 ? (
              <img
                src={customLogoBase64}
                alt="شعار المنظومة"
                className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shrink-0 border border-slate-700 shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                <Layers className="w-5 h-5 text-blue-400" />
              </div>
            )}
            <div className="truncate">
              <div className="text-[13px] font-bold text-white truncate tracking-tight leading-tight">
                إدارة تموين المحلة الكبرى
              </div>
              <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                ERP Dashboard v24
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all duration-200 cursor-pointer border border-slate-700"
        >
          {isCollapsed ? (
            <PanelRightOpen className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Active Section Bar */}
      {!isCollapsed && (
        <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] bg-[#0f172a]">
          <span className="text-slate-400 font-medium">الشاشة النشطة</span>
          <span className="text-blue-300 font-bold bg-blue-950/50 px-2 py-0.5 rounded border border-blue-900 truncate max-w-[150px]">
            {activeItemLabel}
          </span>
        </div>
      )}

      {/* Scrollable Navigation Groups — Dashboard v24 Industrial Menu Tree */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3 custom-scrollbar">
        {groups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const isGroupActive = activeGroupId === group.id;

          return (
            <div
              key={group.id}
              className={`rounded-lg transition-all duration-200 overflow-hidden border ${
                isGroupActive
                  ? 'bg-slate-900 border-blue-700 shadow-lg'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-600'
              }`}
            >
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                title={group.title}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-right transition-all duration-200 cursor-pointer ${
                  isGroupActive
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 flex items-center justify-center shrink-0 text-blue-400">
                    {group.icon}
                  </span>
                  {!isCollapsed && (
                    <div className="min-w-0 text-right">
                      <div className="text-[13px] font-bold text-slate-100 truncate tracking-tight transition-colors">
                        {group.title}
                      </div>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                  />
                )}
              </button>

              {/* Group Sub-Items Menu Tree */}
              {isOpen && !isCollapsed && (
                <div className="p-1.5 space-y-1 border-t border-slate-800 bg-[#020617]">
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
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-right cursor-pointer group transition-all duration-150 ${
                          isItemActive
                            ? 'bg-blue-900/40 text-blue-200 font-bold border border-blue-800'
                            : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${isItemActive ? 'text-blue-300' : 'text-slate-500'}`}>
                            {item.icon}
                          </span>
                          <span className="text-[12px] font-medium truncate leading-tight">
                            {item.label}
                          </span>
                        </div>

                        {item.badge !== undefined && (
                          <span
                            className={`px-1.5 py-0 text-[10px] font-bold rounded-sm shrink-0 font-mono text-white ${
                              item.badgeColor === 'red'
                                ? 'bg-red-900 text-red-200'
                                : item.badgeColor === 'amber'
                                ? 'bg-amber-900 text-amber-200'
                                : item.badgeColor === 'emerald'
                                ? 'bg-emerald-900 text-emerald-200'
                                : 'bg-blue-900 text-blue-200'
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
                <div className="p-1 space-y-1 border-t border-slate-800 bg-[#020617] flex flex-col items-center">
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
                        className={`p-2 rounded-md transition-all cursor-pointer relative ${
                          isItemActive
                            ? 'bg-blue-900 text-blue-200'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
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
        <div className="px-4 py-3 border-t border-slate-800 bg-[#020617] text-[11px] text-slate-500 font-medium flex items-center justify-between">
          <span>ERP System v24.0</span>
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
        </div>
      )}
    </aside>
  );
};

