import type {
  Bakery,
  BranchDepartmentConfigItem,
  BranchSubDepartmentItem,
  DebtRecord,
  SystemConfig,
} from '../types.ts';
import type { BranchModulesBundle } from '../types/modules.ts';

export type ResettableSectionKey =
  | 'bakeries'
  | 'debts'
  | 'commodities'
  | 'internal_trade'
  | 'grain_maintenance'
  | 'hr'
  | 'village';

export interface SidebarCountsSummary {
  bakeriesCount: number;
  debtsCount: number;
  alertsCount: number;
  largeDebtsCount: number;
  unreadInboxCount: number;
  pendingTasksCount: number;
  merchantsCount: number;
  commoditiesCount: number;
  quotasCount: number;
  cardsCount: number;
  establishmentsCount: number;
  campaignsCount: number;
  violationsCount: number;
  shunasCount: number;
  wheatReceiptsCount: number;
  refrigeratorsCount: number;
  millsCount: number;
  flourQuotasCount: number;
  employeesCount: number;
  publicServiceCount: number;
  externalAssistanceCount: number;
}

export interface UniversalColumnDescriptor {
  key: string;
  defaultLabel: string;
}

export interface UniversalTableDescriptor {
  tableKey: string;
  departmentKey: string;
  departmentLabel: string;
  defaultTitle: string;
  columns: UniversalColumnDescriptor[];
}

export const DEFAULT_BRANCH_DEPARTMENTS_TEMPLATE: BranchDepartmentConfigItem[] = [
  {
    id: 'group-1',
    key: 'bakeries',
    label: '1. قسم إدارة المخابز',
    shortLabel: 'المخابز',
    iconKey: 'store',
    visible: true,
    enabled: true,
    order: 1,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'inspector', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'user-guide', label: 'دليل المستخدم الشامل (PDF وطباعة)', visible: true, enabled: true, order: 1 },
      { id: 'bakeries-all', label: 'سجل بيانات المخابز', visible: true, enabled: true, order: 2 },
      { id: 'data-add-bakery', label: 'إضافة مخبز جديد', visible: true, enabled: true, order: 3 },
      { id: 'search-advanced', label: 'البحث والفلترة والفرز', visible: true, enabled: true, order: 4 },
      { id: 'calc-equations-view', label: 'الحصص والمعادلات السبع ∑', visible: true, enabled: true, order: 5 },
      { id: 'report-per-capita', label: 'المتوسطات السنوية (2023-2025)', visible: true, enabled: true, order: 6 },
      { id: 'settings-alerts', label: 'التراخيص والعقود المنتهية', visible: true, enabled: true, order: 7 },
      { id: 'alerts-scheduled-audio', label: 'التنبيه بمواعيد وإشعار صوتي (تراخيص ومديونيات)', visible: true, enabled: true, order: 8 },
    ],
  },
  {
    id: 'group-3',
    key: 'debts',
    label: '2. قسم سجل المديونيات',
    shortLabel: 'المديونيات',
    iconKey: 'scale',
    visible: true,
    enabled: true,
    order: 2,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'auditor', 'inspector', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'debts-records', label: 'جدول سجل المديونيات', visible: true, enabled: true, order: 1 },
      { id: 'debts-add-schedule', label: 'إضافة مديونية أو جدولة سداد', visible: true, enabled: true, order: 2 },
      { id: 'debts-alerts-key', label: 'مفتاح ألوان وإنذارات التأخير', visible: true, enabled: true, order: 3 },
      { id: 'debts-installments', label: 'الدفعات الأسبوعية (> 20 ألف)', visible: true, enabled: true, order: 4 },
    ],
  },
  {
    id: 'group-7',
    key: 'internal_trade',
    label: '3. قسم التجارة الداخلية',
    shortLabel: 'التجارة الداخلية',
    iconKey: 'building',
    visible: true,
    enabled: true,
    order: 3,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'inspector', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'internal-trade-dashboard', label: 'المركز الرقابي الموحد ولوحة الإحصائيات', visible: true, enabled: true, order: 1 },
      { id: 'internal-trade-establishments', label: '1. قاعدة بيانات المحلات والمنشآت التجارية', visible: true, enabled: true, order: 2 },
      { id: 'internal-trade-activities', label: '2-3. الأنشطة والتراخيص والمنشآت المغلقة', visible: true, enabled: true, order: 3 },
      { id: 'internal-trade-map', label: 'خريطة الرقابة التموينية للفرع', visible: true, enabled: true, order: 4 },
      { id: 'internal-trade-campaigns', label: '4. الحملات التموينية ومؤشر الأداء ∑', visible: true, enabled: true, order: 5 },
      { id: 'internal-trade-violations', label: '5-11. المخالفات والمحاضر والتصالحات', visible: true, enabled: true, order: 6 },
      { id: 'internal-trade-seizures', label: '6. المضبوطات والتحفظات التموينية', visible: true, enabled: true, order: 7 },
      { id: 'internal-trade-complaints', label: '7. الشكاوى والبلاغات التموينية', visible: true, enabled: true, order: 8 },
      { id: 'internal-trade-prices', label: '8-9. الأسعار ومتابعة الأسواق والسلع', visible: true, enabled: true, order: 9 },
      { id: 'internal-trade-lpg', label: 'تداول أسطوانات البوتاجاز ونصيب الفرد ∑', visible: true, enabled: true, order: 10 },
      { id: 'internal-trade-petroleum', label: 'المواد البترولية ونصيب الفرد (باللتر) ∑', visible: true, enabled: true, order: 11 },
      { id: 'internal-trade-fuel-stations', label: 'رقابة محطات الوقود والحركة اليومية', visible: true, enabled: true, order: 12 },
      { id: 'internal-trade-lpg-depots', label: 'مستودعات البوتاجاز وسجل الموزعين', visible: true, enabled: true, order: 13 },
      { id: 'internal-trade-comparison', label: 'شاشة المقارنة بين القرى والوحدات', visible: true, enabled: true, order: 14 },
      { id: 'internal-trade-alerts', label: 'التنبيهات الذكية للتجارة الداخلية (6 فئات)', visible: true, enabled: true, order: 15 },
      { id: 'internal-trade-reports', label: '12. مركز التقارير والطباعة (12 تقريراً)', visible: true, enabled: true, order: 16 },
    ],
  },
  {
    id: 'group-6',
    key: 'commodities',
    label: '4. قسم السلع التموينية',
    shortLabel: 'السلع التموينية',
    iconKey: 'basket',
    visible: true,
    enabled: true,
    order: 4,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'auditor', 'inspector', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'commodities-dashboard', label: 'لوحة التحكم الرئيسية للسلع', visible: true, enabled: true, order: 1 },
      { id: 'commodities-catalog', label: 'قاعدة بيانات السلع التموينية', visible: true, enabled: true, order: 2 },
      { id: 'commodities-merchants', label: 'قاعدة بيانات التجار التموينيين', visible: true, enabled: true, order: 3 },
      { id: 'commodities-quotas', label: 'إدارة الحصص التموينية الشهرية', visible: true, enabled: true, order: 4 },
      { id: 'commodities-warehouses', label: 'حركة المخازن والمشتريات', visible: true, enabled: true, order: 5 },
      { id: 'commodities-cards', label: 'متابعة البطاقات والمستفيدين', visible: true, enabled: true, order: 6 },
      { id: 'commodities-disbursements', label: 'سجل عمليات صرف المواطنين', visible: true, enabled: true, order: 7 },
      { id: 'commodities-inspections', label: 'نظام التنبيهات الذكي والرقابة', visible: true, enabled: true, order: 8 },
      { id: 'commodities-reports', label: 'مركز التقارير والطباعة (10 تقارير)', visible: true, enabled: true, order: 9 },
      { id: 'commodities-settings', label: 'إعدادات القرارات والضوابط', visible: true, enabled: true, order: 10 },
    ],
  },
  {
    id: 'group-8',
    key: 'grain_maintenance',
    label: '5. قسم صيانة الحبوب',
    shortLabel: 'صيانة الحبوب',
    iconKey: 'wrench',
    visible: true,
    enabled: true,
    order: 5,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'auditor', 'inspector', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'grain-dashboard', label: 'لوحة تحكم صيانة الحبوب الشاملة', visible: true, enabled: true, order: 1 },
      { id: 'grain-shunas', label: '1. قاعدة بيانات الشون وتقييم الأصول', visible: true, enabled: true, order: 2 },
      { id: 'grain-wheat-receipts', label: 'دفتر استلام القمح اليومي الرسمي', visible: true, enabled: true, order: 3 },
      { id: 'grain-refrigerators', label: '2. قاعدة بيانات الثلاجات ومخازن التبريد', visible: true, enabled: true, order: 4 },
      { id: 'grain-mills', label: '3. قاعدة بيانات المطاحن والاستخراج', visible: true, enabled: true, order: 5 },
      { id: 'grain-flour-quotas', label: '4. قاعدة بيانات حصص الدقيق للمخابز', visible: true, enabled: true, order: 6 },
      { id: 'grain-financials', label: '5. الحسابات المالية الموحدة للقسم', visible: true, enabled: true, order: 7 },
      { id: 'grain-reports', label: '6. مركز التقارير والطباعة (A4 & Excel)', visible: true, enabled: true, order: 8 },
      { id: 'grain-assets', label: 'الأصول الهندسية والمعدات', visible: true, enabled: true, order: 9 },
      { id: 'grain-orders', label: 'أوامر الصيانة الوقائية والطارئة', visible: true, enabled: true, order: 10 },
      { id: 'grain-parts', label: 'مخزن قطع الغيار وإعادة الطلب', visible: true, enabled: true, order: 11 },
      { id: 'grain-moisture', label: 'تصحيح الرطوبة والفاقد والموازين', visible: true, enabled: true, order: 12 },
      { id: 'grain-alerts', label: 'التنبيهات الهندسية والرقابية الذكية', visible: true, enabled: true, order: 13 },
    ],
  },
  {
    id: 'group-9',
    key: 'hr',
    label: '6. قسم الموارد البشرية',
    shortLabel: 'الموارد البشرية',
    iconKey: 'briefcase',
    visible: true,
    enabled: true,
    order: 6,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'auditor', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'hr-dashboard', label: 'لوحة تحكم الموارد البشرية', visible: true, enabled: true, order: 1 },
      { id: 'hr-employees', label: 'ملف العاملين والرقم القومي والهاتف', visible: true, enabled: true, order: 2 },
      { id: 'hr-public-service', label: 'قسم موظفو الخدمة العامة', visible: true, enabled: true, order: 3 },
      { id: 'hr-external-assistance', label: 'قسم موظفو الاستعانة', visible: true, enabled: true, order: 4 },
      { id: 'hr-attendance', label: 'سجلات الحضور والتأخيرات', visible: true, enabled: true, order: 5 },
      { id: 'hr-leaves', label: 'الإجازات والأرصدة المستقلة', visible: true, enabled: true, order: 6 },
      { id: 'hr-payroll', label: 'مسيرات المرتبات والضرائب والتأمينات', visible: true, enabled: true, order: 7 },
      { id: 'hr-loans-promotions', label: 'السلف والترقيات ونهاية الخدمة', visible: true, enabled: true, order: 8 },
      { id: 'hr-alerts', label: 'تنبيهات عقود الخدمة العامة والاستعانة (30 يوم)', visible: true, enabled: true, order: 9 },
      { id: 'hr-settings', label: 'شرائح الضرائب واللائحة المالية', visible: true, enabled: true, order: 10 },
    ],
  },
  {
    id: 'group-2',
    key: 'bakeries',
    label: '7. قسم التعديلات والعرض',
    shortLabel: 'التعديلات والعرض',
    iconKey: 'edit',
    visible: true,
    enabled: true,
    order: 7,
    defaultPermissions: ['super_admin', 'admin', 'supervisor'],
    subItems: [
      { id: 'branches-manage', label: 'قسم الفروع والإدارات التموينية', visible: true, enabled: true, order: 1 },
      { id: 'data-edit-bakery', label: 'تعديل بيانات مخبز محدد', visible: true, enabled: true, order: 2 },
      { id: 'bakery-change-history', label: 'سجل التغييرات التاريخي للمخابز', visible: true, enabled: true, order: 3 },
      { id: 'data-edit-master', label: 'إدارة القوائم المنسدلة والقرى', visible: true, enabled: true, order: 4 },
      { id: 'settings-view-mode', label: 'إعدادات العرض وتنظيم الجداول', visible: true, enabled: true, order: 5 },
      { id: 'settings-display', label: 'تعديل مسميات الجداول والأعمدة', visible: true, enabled: true, order: 6 },
    ],
  },
  {
    id: 'group-5',
    key: 'reports',
    label: '8. قسم التقارير والأمان',
    shortLabel: 'التقارير والأمان',
    iconKey: 'printer',
    visible: true,
    enabled: true,
    order: 8,
    defaultPermissions: ['super_admin', 'admin', 'supervisor', 'auditor', 'inspector', 'data_entry', 'viewer', 'reader'],
    subItems: [
      { id: 'reports-center', label: 'مركز التقارير والطباعة الرسمية', visible: true, enabled: true, order: 1 },
      { id: 'settings-users', label: 'المستخدمون والصلاحيات', visible: true, enabled: true, order: 2 },
      { id: 'settings-daily-tasks', label: 'المهام اليومية للموظفين', visible: true, enabled: true, order: 3 },
      { id: 'settings-logs', label: 'صندوق الوارد والتعليمات', visible: true, enabled: true, order: 4 },
      { id: 'settings-logout', label: 'حفظ آمن وتسجيل الخروج', visible: true, enabled: true, order: 5 },
    ],
  },
  {
    id: 'group-4',
    key: 'bakeries',
    label: '9. قسم الحفظ والنسخ',
    shortLabel: 'الحفظ والنسخ',
    iconKey: 'database',
    visible: true,
    enabled: true,
    order: 9,
    defaultPermissions: ['super_admin', 'admin'],
    subItems: [
      { id: 'ops-save-data', label: 'حفظ البيانات وتثبيت التغييرات', visible: true, enabled: true, order: 1 },
      { id: 'data-import', label: 'استيراد بيانات (Excel / JSON)', visible: true, enabled: true, order: 2 },
      { id: 'data-export', label: 'تصدير قاعدة البيانات (CSV)', visible: true, enabled: true, order: 3 },
      { id: 'data-backup', label: 'النسخ الاحتياطي والاستعادة', visible: true, enabled: true, order: 4 },
      { id: 'workspace-calendar', label: 'تقويم ومهام العمل الاختيارية', visible: true, enabled: true, order: 5 },
    ],
  },
];

/**
 * ينشئ نسخة مستقلة تماماً من هيكل الأقسام والقوائم الافتراضية دون أي ارتباط مرجعي بفرع المحلة أو غيره.
 */
export function cloneDefaultBranchDepartmentsStructure(
  source?: BranchDepartmentConfigItem[]
): BranchDepartmentConfigItem[] {
  const base = Array.isArray(source) && source.length > 0 ? source : DEFAULT_BRANCH_DEPARTMENTS_TEMPLATE;
  return base
    .map((dept, dIdx) => ({
      id: String(dept.id),
      key: String(dept.key),
      label: String(dept.label),
      shortLabel: dept.shortLabel ? String(dept.shortLabel) : undefined,
      iconKey: dept.iconKey ? String(dept.iconKey) : undefined,
      visible: dept.visible !== false,
      enabled: dept.enabled !== false,
      order: Number.isFinite(Number(dept.order)) ? Number(dept.order) : dIdx + 1,
      defaultPermissions: Array.isArray(dept.defaultPermissions) ? [...dept.defaultPermissions] : undefined,
      subItems: (Array.isArray(dept.subItems) ? dept.subItems : [])
        .map((sub, sIdx) => ({
          id: String(sub.id),
          label: String(sub.label),
          targetTab: sub.targetTab ? String(sub.targetTab) : undefined,
          targetAction: sub.targetAction ? String(sub.targetAction) : undefined,
          visible: sub.visible !== false,
          enabled: sub.enabled !== false,
          order: Number.isFinite(Number(sub.order)) ? Number(sub.order) : sIdx + 1,
          defaultPermissions: Array.isArray(sub.defaultPermissions) ? [...sub.defaultPermissions] : undefined,
        }))
        .sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order);
}

export function normalizeBranchDepartments(
  departments?: BranchDepartmentConfigItem[]
): BranchDepartmentConfigItem[] {
  if (!Array.isArray(departments) || departments.length === 0) {
    return cloneDefaultBranchDepartmentsStructure();
  }
  return cloneDefaultBranchDepartmentsStructure(departments);
}

export type BranchDepartmentMutation =
  | { type: 'ADD_DEPARTMENT'; label: string; shortLabel?: string; key?: string }
  | { type: 'DELETE_DEPARTMENT'; deptId: string }
  | { type: 'RENAME_DEPARTMENT'; deptId: string; label: string; shortLabel?: string }
  | { type: 'TOGGLE_DEPARTMENT_VISIBLE'; deptId: string }
  | { type: 'TOGGLE_DEPARTMENT_ENABLED'; deptId: string }
  | { type: 'REORDER_DEPARTMENT'; deptId: string; direction: 'up' | 'down' }
  | { type: 'ADD_SUBITEM'; deptId: string; label: string; id?: string }
  | { type: 'RENAME_SUBITEM'; deptId: string; subId: string; label: string }
  | { type: 'TOGGLE_SUBITEM_VISIBLE'; deptId: string; subId: string }
  | { type: 'TOGGLE_SUBITEM_ENABLED'; deptId: string; subId: string }
  | { type: 'DELETE_SUBITEM'; deptId: string; subId: string }
  | { type: 'RESET_DEFAULT_STRUCTURE' };

export function applyBranchDepartmentMutation(
  current: BranchDepartmentConfigItem[] | undefined,
  mutation: BranchDepartmentMutation
): BranchDepartmentConfigItem[] {
  if (mutation.type === 'RESET_DEFAULT_STRUCTURE') {
    return cloneDefaultBranchDepartmentsStructure();
  }

  const list = cloneDefaultBranchDepartmentsStructure(current);

  switch (mutation.type) {
    case 'ADD_DEPARTMENT': {
      const cleanLabel = mutation.label.trim();
      if (!cleanLabel) return list;
      const newOrder = list.reduce((max, item) => Math.max(max, item.order), 0) + 1;
      const customId = `custom-dept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      return [
        ...list,
        {
          id: customId,
          key: mutation.key || 'bakeries',
          label: cleanLabel,
          shortLabel: mutation.shortLabel?.trim() || cleanLabel,
          iconKey: 'folder',
          visible: true,
          enabled: true,
          order: newOrder,
          defaultPermissions: ['super_admin', 'admin'],
          subItems: [],
        },
      ];
    }

    case 'DELETE_DEPARTMENT':
      return list
        .filter((d) => d.id !== mutation.deptId)
        .map((d, idx) => ({ ...d, order: idx + 1 }));

    case 'RENAME_DEPARTMENT': {
      const cleanLabel = mutation.label.trim();
      if (!cleanLabel) return list;
      return list.map((d) =>
        d.id === mutation.deptId
          ? {
              ...d,
              label: cleanLabel,
              shortLabel: mutation.shortLabel !== undefined ? mutation.shortLabel.trim() || cleanLabel : d.shortLabel,
            }
          : d
      );
    }

    case 'TOGGLE_DEPARTMENT_VISIBLE':
      return list.map((d) => (d.id === mutation.deptId ? { ...d, visible: !d.visible } : d));

    case 'TOGGLE_DEPARTMENT_ENABLED':
      return list.map((d) => (d.id === mutation.deptId ? { ...d, enabled: !d.enabled } : d));

    case 'REORDER_DEPARTMENT': {
      const sorted = [...list].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((d) => d.id === mutation.deptId);
      if (idx < 0) return list;
      const targetIdx = mutation.direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return list;
      const swapped = [...sorted];
      const temp = swapped[idx];
      swapped[idx] = swapped[targetIdx];
      swapped[targetIdx] = temp;
      return swapped.map((item, i) => ({ ...item, order: i + 1 }));
    }

    case 'ADD_SUBITEM': {
      const cleanLabel = mutation.label.trim();
      if (!cleanLabel) return list;
      return list.map((d) => {
        if (d.id !== mutation.deptId) return d;
        const nextOrder = d.subItems.reduce((m, s) => Math.max(m, s.order), 0) + 1;
        const subId = mutation.id?.trim() || `custom-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const nextSub: BranchSubDepartmentItem = {
          id: subId,
          label: cleanLabel,
          visible: true,
          enabled: true,
          order: nextOrder,
        };
        return { ...d, subItems: [...d.subItems, nextSub] };
      });
    }

    case 'RENAME_SUBITEM': {
      const cleanLabel = mutation.label.trim();
      if (!cleanLabel) return list;
      return list.map((d) =>
        d.id === mutation.deptId
          ? {
              ...d,
              subItems: d.subItems.map((s) => (s.id === mutation.subId ? { ...s, label: cleanLabel } : s)),
            }
          : d
      );
    }

    case 'TOGGLE_SUBITEM_VISIBLE':
      return list.map((d) =>
        d.id === mutation.deptId
          ? {
              ...d,
              subItems: d.subItems.map((s) => (s.id === mutation.subId ? { ...s, visible: !s.visible } : s)),
            }
          : d
      );

    case 'TOGGLE_SUBITEM_ENABLED':
      return list.map((d) =>
        d.id === mutation.deptId
          ? {
              ...d,
              subItems: d.subItems.map((s) => (s.id === mutation.subId ? { ...s, enabled: !s.enabled } : s)),
            }
          : d
      );

    case 'DELETE_SUBITEM':
      return list.map((d) =>
        d.id === mutation.deptId
          ? {
              ...d,
              subItems: d.subItems.filter((s) => s.id !== mutation.subId).map((s, idx) => ({ ...s, order: idx + 1 })),
            }
          : d
      );
  }
}

export function computeBranchSidebarCounts(params: {
  bakeries: Bakery[];
  debts: DebtRecord[];
  alertsCount: number;
  largeDebtsCount: number;
  unreadInboxCount: number;
  pendingTasksCount: number;
  modulesBundle: BranchModulesBundle | null | undefined;
}): SidebarCountsSummary {
  const { bakeries, debts, alertsCount, largeDebtsCount, unreadInboxCount, pendingTasksCount, modulesBundle } = params;
  const rc = modulesBundle?.ration;
  const it = modulesBundle?.internalTrade;
  const gm = modulesBundle?.grainMaintenance;
  const hr = modulesBundle?.hr;
  const employees = hr?.employees || [];

  return {
    bakeriesCount: bakeries.length,
    debtsCount: debts.length,
    alertsCount,
    largeDebtsCount,
    unreadInboxCount,
    pendingTasksCount,
    merchantsCount: rc?.merchants?.length ?? 0,
    commoditiesCount: rc?.commodities?.length ?? 0,
    quotasCount: rc?.requisitions?.length ?? 0,
    cardsCount: rc?.cards?.length ?? 0,
    establishmentsCount: it?.establishments?.length ?? 0,
    campaignsCount: it?.campaigns?.length ?? 0,
    violationsCount: it?.violations?.length ?? 0,
    shunasCount: gm?.shunas?.length ?? 0,
    wheatReceiptsCount: gm?.wheatReceipts?.length ?? 0,
    refrigeratorsCount: gm?.refrigerators?.length ?? 0,
    millsCount: gm?.mills?.length ?? 0,
    flourQuotasCount: gm?.flourQuotaMaster?.length ?? 0,
    employeesCount: employees.length,
    publicServiceCount: employees.filter((e) => e.employeeType === 'خدمة عامة').length,
    externalAssistanceCount: employees.filter((e) => e.employeeType === 'استعانة').length,
  };
}

export const UNIVERSAL_TABLES_CATALOG: UniversalTableDescriptor[] = [
  {
    tableKey: 'bakeries_main',
    departmentKey: 'bakeries',
    departmentLabel: '1. قسم إدارة المخابز',
    defaultTitle: 'جدول قاعدة بيانات المخابز التموينية',
    columns: [
      { key: 'index', defaultLabel: 'م' },
      { key: 'bakeryOwnerName', defaultLabel: 'صاحب المخبز' },
      { key: 'machineNumber', defaultLabel: 'رقم الماكينة' },
      { key: 'village', defaultLabel: 'القرية' },
      { key: 'localUnit', defaultLabel: 'الوحدة المحلية' },
      { key: 'responsibleManager', defaultLabel: 'المدير المسئول' },
      { key: 'remainingDebt', defaultLabel: 'إجمالي المديونية المتبقية' },
      { key: 'insuranceQuota', defaultLabel: 'الحصة التأمينية' },
      { key: 'actualQuota', defaultLabel: 'الحصة الفعلية' },
      { key: 'insuranceValue', defaultLabel: 'القيمة التأمينية' },
      { key: 'loavesCount', defaultLabel: 'عدد الأرغفة' },
      { key: 'villagePopulation', defaultLabel: 'عدد السكان' },
      { key: 'perCapitaAverage', defaultLabel: 'نصيب الفرد' },
      { key: 'beneficiaries2023', defaultLabel: 'مستفيدي 2023' },
      { key: 'avg2023', defaultLabel: 'متوسط 2023' },
      { key: 'beneficiaries2024', defaultLabel: 'مستفيدي 2024' },
      { key: 'avg2024', defaultLabel: 'متوسط 2024' },
      { key: 'beneficiaries2025', defaultLabel: 'مستفيدي 2025' },
      { key: 'avg2025', defaultLabel: 'متوسط 2025' },
      { key: 'avgDiff', defaultLabel: 'الفرق التراكمي' },
      { key: 'activityStatus', defaultLabel: 'نشاط المخبز' },
      { key: 'bakeryCategory', defaultLabel: 'تصنيف المخبز' },
      { key: 'breadType', defaultLabel: 'نوع الخبز' },
      { key: 'flourBagPrice', defaultLabel: 'سعر الشيكارة' },
      { key: 'breadTypeCount', defaultLabel: 'معدل الرغيف' },
      { key: 'lineType', defaultLabel: 'خط الإنتاج' },
      { key: 'fuelType', defaultLabel: 'نوع الوقود' },
      { key: 'phone', defaultLabel: 'رقم التليفون' },
      { key: 'nationalId', defaultLabel: 'الرقم القومي' },
      { key: 'commercialRegNumber', defaultLabel: 'رقم السجل التجاري' },
      { key: 'commercialRegDate', defaultLabel: 'تاريخ السجل التجاري' },
      { key: 'bakeryLicenseNumber', defaultLabel: 'رقم الرخصة' },
      { key: 'bakeryLicenseDate', defaultLabel: 'تاريخ الرخصة' },
      { key: 'leaseContractType', defaultLabel: 'نوع الإيجار' },
      { key: 'leaseAgreementDate', defaultLabel: 'تاريخ الإيجار' },
      { key: 'taxCardNumber', defaultLabel: 'رقم الضريبية' },
      { key: 'taxCardDate', defaultLabel: 'تاريخ الضريبية' },
      { key: 'actions', defaultLabel: 'الإجراءات' },
    ],
  },
  {
    tableKey: 'debts_main',
    departmentKey: 'debts',
    departmentLabel: '2. قسم سجل المديونيات',
    defaultTitle: 'جدول سجل المديونيات والمخالفات والتحصيل',
    columns: [
      { key: 'bakeryOwnerName', defaultLabel: 'صاحب المخبز' },
      { key: 'machineNumber', defaultLabel: 'رقم الماكينة' },
      { key: 'village', defaultLabel: 'القرية' },
      { key: 'localUnit', defaultLabel: 'الوحدة المحلية' },
      { key: 'violationDate', defaultLabel: 'تاريخ المخالفة' },
      { key: 'issuingEntity', defaultLabel: 'الجهة المحررة' },
      { key: 'violationType', defaultLabel: 'نوع المخالفة' },
      { key: 'totalViolations', defaultLabel: 'إجمالي المخالفات' },
      { key: 'paidViolationAmount', defaultLabel: 'المسدد من المخالفات' },
      { key: 'remainingViolations', defaultLabel: 'المتبقي من المخالفات' },
      { key: 'disposalValue', defaultLabel: 'قيمة التصرف' },
      { key: 'netRemainingDebt', defaultLabel: 'صافي المديونية المتبقية' },
      { key: 'scheduleStatus', defaultLabel: 'حالة الجدولة' },
    ],
  },
  {
    tableKey: 'commodities_merchants',
    departmentKey: 'commodities',
    departmentLabel: '4. قسم السلع التموينية',
    defaultTitle: 'جدول قاعدة بيانات التجار التموينيين ومنافذ الصرف',
    columns: [
      { key: 'merchantName', defaultLabel: 'اسم التاجر / البدال' },
      { key: 'traderCode', defaultLabel: 'كود التاجر' },
      { key: 'posMachineNumber', defaultLabel: 'رقم ماكينة الصرف' },
      { key: 'village', defaultLabel: 'القرية' },
      { key: 'localUnit', defaultLabel: 'الوحدة المحلية' },
      { key: 'outletType', defaultLabel: 'نوع المنفذ' },
      { key: 'linkedCardsCount', defaultLabel: 'عدد البطاقات' },
      { key: 'linkedBeneficiariesCount', defaultLabel: 'عدد المستفيدين' },
      { key: 'cashInsuranceAmount', defaultLabel: 'التأمين النقدي' },
      { key: 'nationalId', defaultLabel: 'الرقم القومي' },
      { key: 'phone', defaultLabel: 'رقم الهاتف' },
      { key: 'status', defaultLabel: 'حالة النشاط' },
    ],
  },
  {
    tableKey: 'commodities_catalog',
    departmentKey: 'commodities',
    departmentLabel: '4. قسم السلع التموينية',
    defaultTitle: 'جدول كتالوج وأرصدة السلع التموينية',
    columns: [
      { key: 'code', defaultLabel: 'كود الصنف' },
      { key: 'name', defaultLabel: 'اسم السلعة' },
      { key: 'category', defaultLabel: 'التصنيف' },
      { key: 'unit', defaultLabel: 'الوحدة' },
      { key: 'officialPrice', defaultLabel: 'السعر الرسمي' },
      { key: 'openingBalance', defaultLabel: 'الرصيد الافتتاحي' },
      { key: 'inboundQty', defaultLabel: 'الوارد' },
      { key: 'outboundQty', defaultLabel: 'المنصرف' },
      { key: 'availabilityStatus', defaultLabel: 'حالة التوفر' },
    ],
  },
  {
    tableKey: 'internal_trade_establishments',
    departmentKey: 'internal_trade',
    departmentLabel: '3. قسم التجارة الداخلية',
    defaultTitle: 'جدول المنشآت التجارية والتموينية والمحلات',
    columns: [
      { key: 'name', defaultLabel: 'اسم المنشأة' },
      { key: 'ownerName', defaultLabel: 'اسم المسئول / المالك' },
      { key: 'activityType', defaultLabel: 'نوع النشاط' },
      { key: 'village', defaultLabel: 'القرية / المنطقة' },
      { key: 'commercialRegNo', defaultLabel: 'رقم السجل التجاري' },
      { key: 'licenseStatus', defaultLabel: 'حالة الترخيص' },
      { key: 'phone', defaultLabel: 'رقم الهاتف' },
    ],
  },
  {
    tableKey: 'internal_trade_campaigns',
    departmentKey: 'internal_trade',
    departmentLabel: '3. قسم التجارة الداخلية',
    defaultTitle: 'جدول الحملات التموينية والمحاضر والمضبوطات',
    columns: [
      { key: 'campaignCode', defaultLabel: 'رقم الحملة / المحضر' },
      { key: 'date', defaultLabel: 'التاريخ' },
      { key: 'inspector', defaultLabel: 'المفتش القائم بالضبط' },
      { key: 'village', defaultLabel: 'القرية' },
      { key: 'violationType', defaultLabel: 'نوع المخالفة' },
      { key: 'legalAction', defaultLabel: 'الإجراء القانوني' },
      { key: 'fineAmount', defaultLabel: 'قيمة الغرامة' },
    ],
  },
  {
    tableKey: 'grain_shunas_mills',
    departmentKey: 'grain_maintenance',
    departmentLabel: '5. قسم صيانة الحبوب',
    defaultTitle: 'جدول الشون والثلاجات والمطاحن ودفتر استلام القمح',
    columns: [
      { key: 'name', defaultLabel: 'اسم الشونة / المطحن / الثلاجة' },
      { key: 'village', defaultLabel: 'القرية / الموقع' },
      { key: 'storageCapacityTons', defaultLabel: 'السعة التخزينية (طن)' },
      { key: 'currentWheatStockTons', defaultLabel: 'الرصيد الحالي (طن)' },
      { key: 'moisturePct', defaultLabel: 'نسبة الرطوبة %' },
      { key: 'weightBridgeCode', defaultLabel: 'كود الميزان / السجل' },
      { key: 'status', defaultLabel: 'الحالة الفنية' },
    ],
  },
  {
    tableKey: 'hr_employees',
    departmentKey: 'hr',
    departmentLabel: '6. قسم الموارد البشرية',
    defaultTitle: 'جدول سجل العاملين والخدمة العامة والاستعانة والمرتبات',
    columns: [
      { key: 'empCode', defaultLabel: 'الكود الوظيفي' },
      { key: 'fullName', defaultLabel: 'الاسم الكامل' },
      { key: 'employmentCategory', defaultLabel: 'نوع التوظيف' },
      { key: 'jobTitle', defaultLabel: 'الدرجة / المسمى الوظيفي' },
      { key: 'department', defaultLabel: 'القسم / الإدارة' },
      { key: 'nationalId', defaultLabel: 'الرقم القومي' },
      { key: 'phone', defaultLabel: 'رقم الهاتف' },
      { key: 'basicSalary', defaultLabel: 'الراتب الأساسي' },
      { key: 'status', defaultLabel: 'الحالة الوظيفية' },
    ],
  },
  {
    tableKey: 'reports_official',
    departmentKey: 'reports',
    departmentLabel: '8. قسم التقارير الرسمية',
    defaultTitle: 'جدول مركز التقارير والطباعة الإحصائية الموحدة',
    columns: [
      { key: 'reportTitle', defaultLabel: 'اسم التقرير الرسمي' },
      { key: 'scope', defaultLabel: 'نطاق التغطية' },
      { key: 'period', defaultLabel: 'الفترة الزمنية' },
      { key: 'generatedBy', defaultLabel: 'معد التقرير' },
    ],
  },
];

export function resolveCustomTableTitle(
  systemConfig: SystemConfig | null | undefined,
  tableKey: string,
  fallbackTitle: string
): string {
  const custom = systemConfig?.customTableTitles?.[tableKey];
  return custom && custom.trim() ? custom.trim() : fallbackTitle;
}

export function resolveCustomColumnTitle(
  systemConfig: SystemConfig | null | undefined,
  tableKey: string,
  colKey: string,
  fallbackLabel: string
): string {
  const custom = systemConfig?.customColumnTitles?.[tableKey]?.[colKey];
  return custom && custom.trim() ? custom.trim() : fallbackLabel;
}

/**
 * تصفير بيانات قسم معين فقط داخل الفرع مع الإبقاء التام على هيكل الأقسام والقوائم والإعدادات بدون أي حذف.
 */
export function wipeSectionFromModulesBundle(
  bundle: BranchModulesBundle,
  sectionKey: 'commodities' | 'internal_trade' | 'grain_maintenance' | 'hr',
  resetBy = 'admin'
): BranchModulesBundle {
  const nowIso = new Date().toISOString();
  const next: BranchModulesBundle = {
    ...bundle,
    updatedAt: nowIso,
  };

  if (sectionKey === 'commodities') {
    next.ration = {
      ...bundle.ration,
      commodities: [],
      merchants: [],
      warehouses: [],
      movements: [],
      requisitions: [],
      cards: [],
      disbursements: [],
      inspections: [],
      complaints: [],
      settingsHistory: [],
      auditLogs: [
        {
          id: `aud-reset-rc-${Date.now()}`,
          branchId: bundle.branchId,
          module: 'commodities',
          timestamp: nowIso,
          username: resetBy,
          userFullName: resetBy,
          actionType: 'حذف',
          entityName: 'استعادة ضبط المصنع لقسم السلع',
          entityId: bundle.branchId,
          afterSummary: 'تصفير كافة السلع والتجار والحصص والمخازن والبطاقات مع الإبقاء على القسم وإعداداته.',
        },
      ],
    };
  } else if (sectionKey === 'internal_trade' && bundle.internalTrade) {
    next.internalTrade = {
      ...bundle.internalTrade,
      establishments: [],
      campaigns: [],
      violations: [],
      seizures: [],
      complaints: [],
      marketPrices: [],
      lpgVillageCirculation: [],
      petroleumVillageCirculation: [],
      fuelStations: [],
      fuelStationMovements: [],
      lpgDepots: [],
      lpgDistributors: [],
      readAlertIds: [],
      auditLogs: [
        {
          id: `aud-reset-it-${Date.now()}`,
          branchId: bundle.branchId,
          module: 'internal_trade',
          timestamp: nowIso,
          username: resetBy,
          userFullName: resetBy,
          actionType: 'حذف',
          entityName: 'استعادة ضبط المصنع للتجارة الداخلية',
          entityId: bundle.branchId,
          afterSummary: 'تصفير كافة المنشآت والحملات والمحاضر والوقود والبوتاجاز مع الإبقاء على القسم.',
        },
      ],
    };
  } else if (sectionKey === 'grain_maintenance') {
    next.grainMaintenance = {
      ...bundle.grainMaintenance,
      shunas: [],
      wheatReceipts: [],
      refrigerators: [],
      refrigeratorBatches: [],
      refrigeratorRentals: [],
      mills: [],
      millingBatches: [],
      millExpenses: [],
      flourQuotaMaster: [],
      financialLedger: [],
      assets: [],
      maintenanceOrders: [],
      spareParts: [],
      spareMovements: [],
      moistureInspections: [],
      calibrationRecords: [],
      auditLogs: [
        {
          id: `aud-reset-gm-${Date.now()}`,
          branchId: bundle.branchId,
          module: 'grain_maintenance',
          timestamp: nowIso,
          username: resetBy,
          userFullName: resetBy,
          actionType: 'حذف',
          entityName: 'استعادة ضبط المصنع لصيانة الحبوب',
          entityId: bundle.branchId,
          afterSummary: 'تصفير الشون والقمح والثلاجات والمطاحن وحصص الدقيق مع الإبقاء على هيكل القسم.',
        },
      ],
    };
  } else if (sectionKey === 'hr') {
    next.hr = {
      ...bundle.hr,
      employees: [],
      attendance: [],
      leaves: [],
      leaveBalances: [],
      payrolls: [],
      loans: [],
      promotions: [],
      endOfServiceRecords: [],
      auditLogs: [
        {
          id: `aud-reset-hr-${Date.now()}`,
          branchId: bundle.branchId,
          module: 'hr',
          timestamp: nowIso,
          username: resetBy,
          userFullName: resetBy,
          actionType: 'حذف',
          entityName: 'استعادة ضبط المصنع للموارد البشرية',
          entityId: bundle.branchId,
          afterSummary: 'تصفير كافة بيانات العاملين والحضور والمرتبات مع الإبقاء على اللائحة وهيكل القسم.',
        },
      ],
    };
  }

  return next;
}

function normalizeVillageName(v: string | undefined | null): string {
  return String(v || '').trim().toLowerCase();
}

/**
 * تصفير بيانات قرية محددة داخل الفرع عبر جميع الأقسام (المخابز، المديونيات، التجار، المنشآت، الري/الشون، المكاينات، الأكواد)
 * بدون أي مساس بهيكل الأقسام أو القرى الأخرى أو الفروع الأخرى.
 */
export function wipeVillageFromModulesBundle(
  bundle: BranchModulesBundle,
  villageName: string,
  resetBy = 'admin'
): BranchModulesBundle {
  const target = normalizeVillageName(villageName);
  if (!target) return bundle;
  const nowIso = new Date().toISOString();

  const removedMerchantIds = new Set(
    (bundle.ration?.merchants || [])
      .filter((m) => normalizeVillageName(m.village) === target)
      .map((m) => m.id)
  );
  const removedShunas = (bundle.grainMaintenance?.shunas || []).filter(
    (s) => normalizeVillageName(s.village) === target
  );
  const removedShunaIds = new Set(removedShunas.map((s) => s.id));
  const removedShunaCodes = new Set(removedShunas.map((s) => s.shunaCode).filter(Boolean));
  const removedEsts = (bundle.internalTrade?.establishments || []).filter(
    (e) => normalizeVillageName(e.village) === target
  );
  const removedEstIds = new Set(removedEsts.map((e) => e.id));
  const removedEstCodes = new Set(removedEsts.map((e) => e.establishmentCode).filter(Boolean));

  return {
    ...bundle,
    updatedAt: nowIso,
    ration: {
      ...bundle.ration,
      merchants: (bundle.ration?.merchants || []).filter((m) => !removedMerchantIds.has(m.id)),
      warehouses: (bundle.ration?.warehouses || []).filter((w) => !removedMerchantIds.has(w.merchantId)),
      movements: (bundle.ration?.movements || []).filter((mv) => !removedMerchantIds.has(mv.merchantId)),
      requisitions: (bundle.ration?.requisitions || []).filter((r) => !removedMerchantIds.has(r.merchantId)),
      cards: (bundle.ration?.cards || []).filter(
        (c) => normalizeVillageName(c.village) !== target && !removedMerchantIds.has(c.merchantId)
      ),
      disbursements: (bundle.ration?.disbursements || []).filter((d) => !removedMerchantIds.has(d.merchantId)),
      inspections: (bundle.ration?.inspections || []).filter(
        (i) => normalizeVillageName(i.village) !== target && !removedMerchantIds.has(i.merchantId)
      ),
      complaints: (bundle.ration?.complaints || []).filter((c) => normalizeVillageName(c.village) !== target),
      auditLogs: [
        {
          id: `aud-vreset-rc-${Date.now()}`,
          branchId: bundle.branchId,
          module: 'commodities',
          timestamp: nowIso,
          username: resetBy,
          userFullName: resetBy,
          actionType: 'حذف',
          entityName: 'تصفير بيانات قرية',
          entityId: villageName,
          afterSummary: `تصفير تجار وأكواد وبطاقات وماكينات قرية (${villageName}) مع الإبقاء على هيكل القسم.`,
        },
        ...(bundle.ration?.auditLogs || []),
      ].slice(0, 300),
    },
    internalTrade: bundle.internalTrade
      ? {
          ...bundle.internalTrade,
          establishments: (bundle.internalTrade.establishments || []).filter((e) => !removedEstIds.has(e.id)),
          campaigns: (bundle.internalTrade.campaigns || []).filter((c) => normalizeVillageName(c.village) !== target),
          violations: (bundle.internalTrade.violations || []).filter(
            (v) =>
              normalizeVillageName(v.village) !== target &&
              !removedEstCodes.has(v.establishmentCode || '')
          ),
          seizures: (bundle.internalTrade.seizures || []).filter((s) => normalizeVillageName(s.village) !== target),
          complaints: (bundle.internalTrade.complaints || []).filter((c) => normalizeVillageName(c.village) !== target),
          lpgVillageCirculation: (bundle.internalTrade.lpgVillageCirculation || []).filter(
            (l) => normalizeVillageName(l.village) !== target
          ),
          lpgDepots: (bundle.internalTrade.lpgDepots || []).filter((d) => normalizeVillageName(d.village) !== target),
          petroleumVillageCirculation: (bundle.internalTrade.petroleumVillageCirculation || []).filter(
            (p) => normalizeVillageName(p.village) !== target
          ),
          fuelStations: (bundle.internalTrade.fuelStations || []).filter(
            (f) => normalizeVillageName(f.village) !== target
          ),
        }
      : undefined,
    grainMaintenance: {
      ...bundle.grainMaintenance,
      shunas: (bundle.grainMaintenance?.shunas || []).filter((s) => !removedShunaIds.has(s.id)),
      wheatReceipts: (bundle.grainMaintenance?.wheatReceipts || []).filter(
        (w) => !removedShunaCodes.has(w.shunaCode)
      ),
      flourQuotaMaster: (bundle.grainMaintenance?.flourQuotaMaster || []).filter(
        (fq) => normalizeVillageName(fq.village) !== target
      ),
    },
  };
}
