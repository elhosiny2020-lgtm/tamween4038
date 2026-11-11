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
      className={`bg-gradient-to-b from-[#071124] via-[#0C1D3A] to-[#11284E] text-white border-l-2 border-[#1E3A8A]/80 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none no-print shadow-[0_0_40px_rgba(7,17,36,0.45)] ${
        isCollapsed ? 'w-[86px]' : 'w-[340px]'
      }`}
    >
      {/* Top Sidebar Identity & Collapse Button */}
      <div className="px-4 py-4 border-b border-white/15 flex items-center justify-between gap-2.5 bg-[#050D1D]/85">
        {!isCollapsed && (
          <div className="flex items-center gap-3 min-w-0">
            {customLogoBase64 ? (
              <img
                src={customLogoBase64}
                alt="شعار المنظومة"
                className="w-11 h-11 rounded-2xl object-contain bg-white p-1 shrink-0 border-2 border-amber-400/50 shadow-md"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] flex items-center justify-center shrink-0 border border-blue-400/40 shadow-md">
                <Layers className="w-6 h-6 text-amber-300" />
              </div>
            )}
            <div className="truncate">
              <div className="text-[15px] font-black text-white truncate tracking-tight">
                إدارة تموين المحلة الكبرى
              </div>
              <div className="text-[11px] text-amber-300/95 font-bold truncate">
                نظام تخطيط موارد المخابز (ERP)
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'توسيع القائمة الجانبية' : 'تصغير القائمة الجانبية'}
          className="p-2.5 rounded-2xl bg-[#162F57] hover:bg-[#1E40AF] text-amber-300 hover:text-amber-200 transition-all duration-200 cursor-pointer mx-auto sm:mx-0 border border-blue-400/30 hover:border-amber-400/70 shadow-sm"
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
        <div className="px-4 py-3 bg-[#09172E] border-b border-blue-800/50 flex items-center justify-between text-xs">
          <span className="text-blue-200 font-extrabold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>الشاشة النشطة:</span>
          </span>
          <span className="text-amber-300 font-black truncate max-w-[195px] bg-gradient-to-r from-[#1E40AF] to-[#2563EB] px-3 py-1 rounded-xl border border-amber-400/40 shadow-xs">
            {activeItemLabel}
          </span>
        </div>
      )}

      {/* Scrollable Navigation Groups — Enlarged ERP Buttons */}
      <nav className="flex-1 overflow-y-auto py-3.5 px-3 space-y-3 custom-scrollbar">
        {groups.map((group) => {
          const isOpen = !!openGroups[group.id];
          const isGroupActive = activeGroupId === group.id;

          return (
            <div
              key={group.id}
              className={`rounded-2xl transition-all duration-200 overflow-hidden ${
                isGroupActive
                  ? 'bg-[#12284C]/95 border-2 border-amber-400/60 shadow-lg'
                  : 'bg-[#0C1D3A]/90 border border-blue-900/70 hover:bg-[#142D59] hover:border-amber-400/50'
              }`}
            >
              {/* Group Header Button (Enlarged) */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                title={group.title}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-right transition-all duration-200 cursor-pointer group ${
                  isGroupActive
                    ? 'bg-gradient-to-l from-[#173464] to-[#102548] text-amber-300 font-black'
                    : 'text-white font-extrabold hover:bg-[#1E3A8A] hover:text-amber-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`p-2.5 rounded-xl bg-gradient-to-br ${group.accentColor} text-white shadow-md shrink-0 border border-blue-300/30`}
                  >
                    {group.icon}
                  </span>
                  {!isCollapsed && (
                    <div className="min-w-0 text-right">
                      <div className="text-[14.5px] font-black text-white group-hover:text-amber-300 truncate tracking-tight transition-colors">
                        {group.title}
                      </div>
                      <div className="text-[11px] font-bold text-blue-200/80 group-hover:text-amber-200/90 truncate mt-0.5 transition-colors">
                        {group.subtitle}
                      </div>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <span className="w-7 h-7 rounded-lg bg-[#162F57] flex items-center justify-center text-amber-300 shrink-0 group-hover:bg-amber-400 group-hover:text-[#09152B] transition-colors">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                    ) : (
                      <ChevronLeft className="w-4 h-4 transition-transform duration-200" />
                    )}
                  </span>
                )}
              </button>

              {/* Group Sub-Items — Enlarged ERP Action Buttons */}
              {isOpen && !isCollapsed && (
                <div className="p-2.5 space-y-2 border-t border-blue-900/60 bg-[#08142A]/80">
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
                        className={`sidebar-btn-erp w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl text-right cursor-pointer group ${
                          isItemActive
                            ? 'bg-gradient-to-l from-[#1D4ED8] via-[#2563EB] to-[#1E40AF] text-amber-300 font-black shadow-[0_6px_18px_rgba(37,99,235,0.45)] border-2 border-amber-300/80'
                            : 'text-white bg-[#102344] hover:bg-gradient-to-l hover:from-[#1E3A8A] hover:to-[#1D4ED8] hover:text-amber-300 hover:shadow-[0_4px_14px_rgba(30,64,175,0.45)] border border-blue-900/70 hover:border-amber-400/70'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`p-2 rounded-xl shrink-0 transition-all duration-200 ${
                              isItemActive
                                ? 'bg-amber-400 text-[#09152B] shadow-sm'
                                : 'bg-[#162F57] text-amber-300 group-hover:bg-amber-400 group-hover:text-[#09152B]'
                            }`}
                          >
                            {item.icon}
                          </span>
                          <div className="min-w-0 text-right">
                            <div className="text-[14px] font-black text-white group-hover:text-amber-300 truncate leading-snug transition-colors">
                              {item.label}
                            </div>
                            {item.subtitle && (
                              <div
                                className={`text-[10.5px] font-bold truncate mt-0.5 transition-colors ${
                                  isItemActive ? 'text-amber-200' : 'text-blue-200/75 group-hover:text-amber-100'
                                }`}
                              >
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>

                        {item.badge !== undefined ? (
                          <span
                            className={`px-2.5 py-1 text-[11.5px] font-black rounded-xl shrink-0 font-mono text-white shadow-sm border border-amber-300/30 ${
                              item.badgeColor === 'red'
                                ? 'bg-red-600'
                                : item.badgeColor === 'amber'
                                ? 'bg-amber-600'
                                : item.badgeColor === 'emerald'
                                ? 'bg-emerald-600'
                                : 'bg-blue-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : (
                          <ChevronLeft
                            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                              isItemActive
                                ? 'text-amber-300 -translate-x-0.5'
                                : 'text-blue-300/60 group-hover:text-amber-300 group-hover:-translate-x-1'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Collapsed Icon-Only Sub-Items */}
              {isCollapsed && (
                <div className="p-1.5 space-y-1.5 border-t border-blue-900/60 bg-[#08142A]/80 flex flex-col items-center">
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
                        className={`p-2.5 rounded-xl transition-all cursor-pointer relative ${
                          isItemActive
                            ? 'bg-[#2563EB] text-amber-300 border border-amber-300/70 shadow-md'
                            : 'text-blue-100 bg-[#102344] hover:bg-[#1E3A8A] hover:text-amber-300 border border-blue-900/50 hover:border-amber-400/60'
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

      {/* Bottom Sidebar Status Footer */}
      {!isCollapsed && (
        <div className="px-4 py-3.5 border-t border-white/15 bg-[#050D1D]/95 text-[11.5px] text-white font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span>المعادلات والبيانات محمية 100%</span>
          </span>
          <span className="font-mono text-amber-300 font-black">ERP v4.0</span>
        </div>
      )}
    </aside>
  );
};
