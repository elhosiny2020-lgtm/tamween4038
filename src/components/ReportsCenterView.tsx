import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Bakery, DebtRecord, VillageHierarchy, SystemConfig, AppUser } from '../types';
import {
  calculateAnnualWeightedAveragesReport,
  calculateBakeriesColumnTotals,
  extractBreadLoafMultiplier,
  formatDateDDMMYYYY,
  matchesVillageOrUnitFilter,
  normalizeArabicText,
} from '../utils/auditHelper';
import { exportElementToPdf, printHtmlElementA4 } from '../utils/pdfHelper';
import {
  FileText,
  Printer,
  FileSpreadsheet,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Bookmark,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Wheat,
  Users,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Eye,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

export type ReportTemplateId =
  | 'bak-all'
  | 'bak-single'
  | 'bak-region'
  | 'bak-bread'
  | 'bak-quota'
  | 'ins-values'
  | 'ins-quotas'
  | 'ins-compare'
  | 'ins-totals'
  | 'loaves-bakery'
  | 'loaves-total'
  | 'loaves-mult'
  | 'loaves-actual'
  | 'ben-2023'
  | 'ben-2024'
  | 'ben-2025'
  | 'avg-yearly'
  | 'avg-bakery'
  | 'avg-cumdiff'
  | 'comp-3years'
  | 'comp-diffs'
  | 'comp-totals'
  | 'comp-review'
  | 'comp-master';

interface ReportDefinition {
  id: ReportTemplateId;
  groupId: number;
  groupTitle: string;
  title: string;
  subtitle: string;
  defaultColumns: string[];
}

export const OFFICIAL_REPORTS_CATALOG: ReportDefinition[] = [
  // 1. تقارير قاعدة بيانات المخابز
  {
    id: 'bak-all',
    groupId: 1,
    groupTitle: '1. تقارير قاعدة بيانات المخابز',
    title: 'تقرير شامل بجميع المخابز',
    subtitle: 'بيان تفصيلي بكافة المخابز المسجلة والحصص والأرغفة والمستفيدين والمديونيات والتراخيص',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'activityStatus',
      'breadType',
      'breadTypeCount',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'loavesCount',
      'beneficiaries2023',
      'beneficiaries2024',
      'beneficiaries2025',
      'avg2023',
      'avg2024',
      'avg2025',
      'perCapitaAverage',
      'avgDiff',
      'remainingDebt',
    ],
  },
  {
    id: 'bak-single',
    groupId: 1,
    groupTitle: '1. تقارير قاعدة بيانات المخابز',
    title: 'تقرير بيانات مخبز محدد',
    subtitle: 'بطاقة تفصيلية شاملة لبيانات مخبز محدد شاملة المعادلات السبع والموقف المالي والتراخيص',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'activityStatus',
      'breadType',
      'breadTypeCount',
      'flourBagPrice',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'loavesCount',
      'beneficiaries2023',
      'beneficiaries2024',
      'beneficiaries2025',
      'avg2023',
      'avg2024',
      'avg2025',
      'perCapitaAverage',
      'avgDiff',
      'remainingDebt',
      'phone',
      'bakeryLicenseDate',
    ],
  },
  {
    id: 'bak-region',
    groupId: 1,
    groupTitle: '1. تقارير قاعدة بيانات المخابز',
    title: 'تقرير المخابز حسب المنطقة',
    subtitle: 'توزيع المخابز والحصص الفعلية والأرغفة والمستفيدين حسب القرية والوحدة المحلية',
    defaultColumns: [
      'index',
      'village',
      'localUnit',
      'bakeryOwnerName',
      'machineNumber',
      'activityStatus',
      'actualQuota',
      'loavesCount',
      'villagePopulation',
      'beneficiaries2025',
      'perCapitaAverage',
      'remainingDebt',
    ],
  },
  {
    id: 'bak-bread',
    groupId: 1,
    groupTitle: '1. تقارير قاعدة بيانات المخابز',
    title: 'تقرير المخابز حسب نوع الخبز',
    subtitle: 'حصر المخابز مصنفة حسب نوع الخبز ونوع عدد الخبز (660 / 725) وخط الإنتاج والوقود',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'bakeryCategory',
      'breadType',
      'breadTypeCount',
      'lineType',
      'fuelType',
      'actualQuota',
      'loavesCount',
      'activityStatus',
    ],
  },
  {
    id: 'bak-quota',
    groupId: 1,
    groupTitle: '1. تقارير قاعدة بيانات المخابز',
    title: 'تقرير المخابز حسب الحصة الفعلية',
    subtitle: 'ترتيب وتحليل المخابز وفقاً للحصة الفعلية اليومية وعدد الأرغفة المنتجة',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'actualQuota',
      'insuranceQuota',
      'breadTypeCount',
      'loavesCount',
      'beneficiaries2025',
      'perCapitaAverage',
    ],
  },

  // 2. التقارير التأمينية
  {
    id: 'ins-values',
    groupId: 2,
    groupTitle: '2. التقارير التأمينية',
    title: 'تقرير المبالغ التأمينية',
    subtitle: 'بيان القيم والمبالغ التأمينية المسددة بالجنيه المصري لكل مخبز وسعر الشيكارة',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'flourBagPrice',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'activityStatus',
    ],
  },
  {
    id: 'ins-quotas',
    groupId: 2,
    groupTitle: '2. التقارير التأمينية',
    title: 'تقرير الحصص التأمينية',
    subtitle: 'احتساب الحصة التأمينية وفق المعادلة الرسمية (المبلغ التأميني ÷ 235 ÷ 3)',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'loavesCount',
    ],
  },
  {
    id: 'ins-compare',
    groupId: 2,
    groupTitle: '2. التقارير التأمينية',
    title: 'تقرير مقارنة الحصص بين المخابز',
    subtitle: 'مقارنة الحصة التأمينية المحسوبة بالحصة الفعلية المنصرفة لكل مخبز',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'breadTypeCount',
      'loavesCount',
    ],
  },
  {
    id: 'ins-totals',
    groupId: 2,
    groupTitle: '2. التقارير التأمينية',
    title: 'تقرير إجمالي المبالغ والحصص',
    subtitle: 'ملخص إجمالي المبالغ التأمينية والحصص التأمينية والفعلية على مستوى المركز',
    defaultColumns: [
      'index',
      'village',
      'localUnit',
      'bakeryOwnerName',
      'machineNumber',
      'flourBagPrice',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'loavesCount',
    ],
  },

  // 3. تقارير الأرغفة والحصص
  {
    id: 'loaves-bakery',
    groupId: 3,
    groupTitle: '3. تقارير الأرغفة والحصص',
    title: 'تقرير عدد الأرغفة لكل مخبز',
    subtitle: 'احتساب عدد الأرغفة اليومية (الحصة الفعلية × معامل عدد الأرغفة 660 أو 725)',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'breadType',
      'breadTypeCount',
      'actualQuota',
      'loavesCount',
      'beneficiaries2025',
      'perCapitaAverage',
    ],
  },
  {
    id: 'loaves-total',
    groupId: 3,
    groupTitle: '3. تقارير الأرغفة والحصص',
    title: 'تقرير إجمالي الأرغفة',
    subtitle: 'حصر إجمالي الطاقة الإنتاجية اليومية من الأرغفة البلدية المدعمة وتوزيعها الجغرافي',
    defaultColumns: [
      'index',
      'village',
      'localUnit',
      'bakeryOwnerName',
      'machineNumber',
      'actualQuota',
      'breadTypeCount',
      'loavesCount',
      'villagePopulation',
    ],
  },
  {
    id: 'loaves-mult',
    groupId: 3,
    groupTitle: '3. تقارير الأرغفة والحصص',
    title: 'تقرير مقارنة معاملات 660 و725',
    subtitle: 'مقارنة المخابز العاملة بمعامل 660 رغيفاً/شيكارة والمخابز العاملة بمعامل 725 رغيفاً/شيكارة',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'breadType',
      'breadTypeCount',
      'actualQuota',
      'loavesCount',
      'lineType',
      'fuelType',
    ],
  },
  {
    id: 'loaves-actual',
    groupId: 3,
    groupTitle: '3. تقارير الأرغفة والحصص',
    title: 'تقرير الحصص الفعلية',
    subtitle: 'بيان الحصص الفعلية اليومية بالشكاير ومعادلها من الأرغفة لكل مخبز',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'actualQuota',
      'insuranceQuota',
      'loavesCount',
      'activityStatus',
    ],
  },

  // 4. تقارير المستفيدين ومتوسط نصيب الفرد
  {
    id: 'ben-2023',
    groupId: 4,
    groupTitle: '4. تقارير المستفيدين ومتوسط نصيب الفرد',
    title: 'تقرير مستفيدي عام 2023',
    subtitle: 'بيان أعداد المستفيدين لعام 2023 ومتوسط نصيب الفرد (الأرغفة ÷ مستفيدي 2023)',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'actualQuota',
      'loavesCount',
      'beneficiaries2023',
      'avg2023',
    ],
  },
  {
    id: 'ben-2024',
    groupId: 4,
    groupTitle: '4. تقارير المستفيدين ومتوسط نصيب الفرد',
    title: 'تقرير مستفيدي عام 2024',
    subtitle: 'بيان أعداد المستفيدين لعام 2024 ومتوسط نصيب الفرد (الأرغفة ÷ مستفيدي 2024)',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'actualQuota',
      'loavesCount',
      'beneficiaries2024',
      'avg2024',
    ],
  },
  {
    id: 'ben-2025',
    groupId: 4,
    groupTitle: '4. تقارير المستفيدين ومتوسط نصيب الفرد',
    title: 'تقرير مستفيدي عام 2025',
    subtitle: 'بيان أعداد المستفيدين لعام 2025 ومتوسط نصيب الفرد (الأرغفة ÷ مستفيدي 2025)',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'actualQuota',
      'loavesCount',
      'beneficiaries2025',
      'avg2025',
      'perCapitaAverage',
    ],
  },
  {
    id: 'avg-yearly',
    groupId: 4,
    groupTitle: '4. تقارير المستفيدين ومتوسط نصيب الفرد',
    title: 'تقرير متوسط نصيب الفرد لكل سنة',
    subtitle: 'بيان متوسطات نصيب الفرد للأعوام 2023 و2024 و2025 لكل مخبز',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'loavesCount',
      'beneficiaries2023',
      'avg2023',
      'beneficiaries2024',
      'avg2024',
      'beneficiaries2025',
      'avg2025',
    ],
  },
  {
    id: 'avg-bakery',
    groupId: 4,
    groupTitle: '4. تقارير المستفيدين ومتوسط نصيب الفرد',
    title: 'تقرير متوسط نصيب الفرد للمخبز الواحد',
    subtitle: 'احتساب متوسط نصيب الفرد للمخبز الواحد (إجمالي عدد الأرغفة ÷ مستفيدي عام 2025)',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'actualQuota',
      'breadTypeCount',
      'loavesCount',
      'beneficiaries2025',
      'perCapitaAverage',
    ],
  },
  {
    id: 'avg-cumdiff',
    groupId: 4,
    groupTitle: '4. تقارير المستفيدين ومتوسط نصيب الفرد',
    title: 'تقرير الفرق التراكمي لمتوسطات نصيب الفرد',
    subtitle: 'احتساب الفرق التراكمي وفق المعادلة الرسمية: ف = متوسط 2023 - متوسط 2024 - متوسط 2025',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'loavesCount',
      'avg2023',
      'avg2024',
      'avg2025',
      'avgDiff',
    ],
  },

  // 5. التقارير المقارنة والإجمالية
  {
    id: 'comp-3years',
    groupId: 5,
    groupTitle: '5. التقارير المقارنة والإجمالية',
    title: 'تقرير مقارنة الأعوام الثلاثة (2023 - 2024 - 2025)',
    subtitle: 'مقارنة شاملة لأعداد المستفيدين ومتوسطات نصيب الفرد للأعوام 2023 و2024 و2025',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'loavesCount',
      'beneficiaries2023',
      'avg2023',
      'beneficiaries2024',
      'avg2024',
      'beneficiaries2025',
      'avg2025',
      'avgDiff',
    ],
  },
  {
    id: 'comp-diffs',
    groupId: 5,
    groupTitle: '5. التقارير المقارنة والإجمالية',
    title: 'تقرير الفروق بين متوسطات نصيب الفرد',
    subtitle: 'تحليل التغير السنوي والفرق التراكمي بين متوسطات نصيب الفرد عبر الأعوام الثلاثة',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'loavesCount',
      'avg2023',
      'avg2024',
      'avg2025',
      'perCapitaAverage',
      'avgDiff',
    ],
  },
  {
    id: 'comp-totals',
    groupId: 5,
    groupTitle: '5. التقارير المقارنة والإجمالية',
    title: 'تقرير إجمالي المخابز والمستفيدين',
    subtitle: 'ملخص إحصائي لإجمالي المخابز والسكان والمستفيدين والحصص والأرغفة',
    defaultColumns: [
      'index',
      'village',
      'localUnit',
      'bakeryOwnerName',
      'machineNumber',
      'villagePopulation',
      'beneficiaries2023',
      'beneficiaries2024',
      'beneficiaries2025',
      'actualQuota',
      'loavesCount',
      'perCapitaAverage',
    ],
  },
  {
    id: 'comp-review',
    groupId: 5,
    groupTitle: '5. التقارير المقارنة والإجمالية',
    title: 'تقرير المخابز التي تحتاج إلى مراجعة',
    subtitle: 'حصر المخابز التي بها بيانات ناقصة أو اختلاف بين الحصة التأمينية والفعلية أو مديونية مرتفعة',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'activityStatus',
      'insuranceQuota',
      'actualQuota',
      'loavesCount',
      'beneficiaries2025',
      'remainingDebt',
      'bakeryLicenseDate',
    ],
  },
  {
    id: 'comp-master',
    groupId: 5,
    groupTitle: '5. التقارير المقارنة والإجمالية',
    title: 'تقرير إحصائي شامل للمنظومة',
    subtitle: 'التقرير الرسمي المجمع لبيانات المخابز والحصص والمعادلات السبع والمديونيات والتراخيص',
    defaultColumns: [
      'index',
      'bakeryOwnerName',
      'machineNumber',
      'village',
      'localUnit',
      'breadType',
      'breadTypeCount',
      'insuranceValue',
      'insuranceQuota',
      'actualQuota',
      'loavesCount',
      'beneficiaries2023',
      'beneficiaries2024',
      'beneficiaries2025',
      'avg2023',
      'avg2024',
      'avg2025',
      'perCapitaAverage',
      'avgDiff',
      'remainingDebt',
    ],
  },
];

interface ColumnMeta {
  key: string;
  label: string;
  align: 'right' | 'center';
  isNumeric?: boolean;
  isCalculated?: boolean;
}

const ALL_REPORT_COLUMNS: ColumnMeta[] = [
  { key: 'index', label: 'م', align: 'center', isNumeric: true },
  { key: 'bakeryOwnerName', label: 'اسم صاحب المخبز', align: 'right' },
  { key: 'machineNumber', label: 'رقم الماكينة', align: 'center', isNumeric: true },
  { key: 'village', label: 'القرية / المنطقة', align: 'right' },
  { key: 'localUnit', label: 'الوحدة المحلية', align: 'right' },
  { key: 'activityStatus', label: 'حالة التشغيل', align: 'center' },
  { key: 'bakeryCategory', label: 'تصنيف المخبز', align: 'center' },
  { key: 'breadType', label: 'نوع الخبز', align: 'center' },
  { key: 'flourBagPrice', label: 'سعر الشيكارة', align: 'center' },
  { key: 'breadTypeCount', label: 'معامل الخبز', align: 'center', isNumeric: true },
  { key: 'lineType', label: 'خط الإنتاج', align: 'center' },
  { key: 'fuelType', label: 'نوع الوقود', align: 'center' },
  { key: 'insuranceValue', label: 'المبلغ التأميني (ج.م)', align: 'center', isNumeric: true },
  { key: 'insuranceQuota', label: 'الحصة التأمينية ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'actualQuota', label: 'الحصة الفعلية', align: 'center', isNumeric: true },
  { key: 'loavesCount', label: 'عدد الأرغفة ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'villagePopulation', label: 'عدد السكان', align: 'center', isNumeric: true },
  { key: 'beneficiaries2023', label: 'مستفيدي 2023', align: 'center', isNumeric: true },
  { key: 'avg2023', label: 'متوسط 2023 ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'beneficiaries2024', label: 'مستفيدي 2024', align: 'center', isNumeric: true },
  { key: 'avg2024', label: 'متوسط 2024 ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'beneficiaries2025', label: 'مستفيدي 2025', align: 'center', isNumeric: true },
  { key: 'avg2025', label: 'متوسط 2025 ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'perCapitaAverage', label: 'متوسط المخبز ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'avgDiff', label: 'الفرق التراكمي ∑', align: 'center', isNumeric: true, isCalculated: true },
  { key: 'remainingDebt', label: 'المديونية المتبقية (ج.م)', align: 'center', isNumeric: true },
  { key: 'phone', label: 'رقم التليفون', align: 'center', isNumeric: true },
  { key: 'bakeryLicenseDate', label: 'تاريخ الرخصة', align: 'center' },
];

const FAVORITE_PRESET_KEY = 'tamween_favorite_report_preset_v1';

interface ReportsCenterViewProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  systemConfig: SystemConfig;
  currentUser?: AppUser | null;
  initialReportId?: ReportTemplateId;
  onSelectBakeryDetails?: (bakery: Bakery) => void;
  onOpenLegacyReportModal?: () => void;
}

function safeFormatNum(val: unknown, decimals = 0): string {
  const num = Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return decimals > 0 ? (0).toFixed(decimals) : '0';
  }
  if (decimals > 0) {
    return num.toFixed(decimals);
  }
  return Math.round(num).toLocaleString('en-US');
}

export const ReportsCenterView: React.FC<ReportsCenterViewProps> = ({
  bakeries,
  debts,
  villages,
  systemConfig,
  currentUser,
  initialReportId = 'bak-all',
  onSelectBakeryDetails,
  onOpenLegacyReportModal,
}) => {
  const [selectedReportId, setSelectedReportId] = useState<ReportTemplateId>(initialReportId);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<number | 'ALL'>('ALL');

  // Filter States
  const [filterVillage, setFilterVillage] = useState<string>('ALL');
  const [filterLocalUnit, setFilterLocalUnit] = useState<string>('ALL');
  const [filterBreadType, setFilterBreadType] = useState<string>('ALL');
  const [filterBakeryId, setFilterBakeryId] = useState<string>('ALL');
  const [filterMultiplier, setFilterMultiplier] = useState<'ALL' | '660' | '725'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Page & Preview Settings
  const [paperSize, setPaperSize] = useState<'a4' | 'a3'>('a4');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>('normal');
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [showColumnCustomizer, setShowColumnCustomizer] = useState<boolean>(false);

  // Active Columns & Order
  const currentReportDef = useMemo(
    () => OFFICIAL_REPORTS_CATALOG.find((r) => r.id === selectedReportId) || OFFICIAL_REPORTS_CATALOG[0],
    [selectedReportId]
  );

  const [orderedColumnKeys, setOrderedColumnKeys] = useState<string[]>(currentReportDef.defaultColumns);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfStageMessage, setPdfStageMessage] = useState<string>('');
  const [presetToast, setPresetToast] = useState<string>('');

  const reportPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialReportId) {
      setSelectedReportId(initialReportId);
    }
  }, [initialReportId]);

  useEffect(() => {
    setOrderedColumnKeys(currentReportDef.defaultColumns);
    // Auto-select landscape when columns > 8
    if (currentReportDef.defaultColumns.length > 8) {
      setOrientation('landscape');
    }
    if (currentReportDef.id === 'bak-single' && filterBakeryId === 'ALL' && bakeries.length > 0) {
      setFilterBakeryId(bakeries[0].id);
    }
  }, [currentReportDef, bakeries]);

  // Debt map per bakery
  const bakeryDebtMap = useMemo(() => {
    const map: Record<string, number> = {};
    debts.forEach((d) => {
      map[d.bakeryId] = (map[d.bakeryId] || 0) + (Number(d.netRemainingDebt) || 0);
    });
    return map;
  }, [debts]);

  const availableUnitsForReport = useMemo(() => {
    const units = new Set<string>();
    if (filterVillage === 'ALL') {
      villages.forEach((v) => v.localUnits.forEach((u) => units.add(u)));
      bakeries.forEach((b) => {
        if (b.localUnit) units.add(b.localUnit);
      });
    } else {
      const targetNorm = normalizeArabicText(filterVillage);
      villages.forEach((v) => {
        if (
          normalizeArabicText(v.village) === targetNorm ||
          v.localUnits.some((u) => normalizeArabicText(u) === targetNorm)
        ) {
          v.localUnits.forEach((u) => units.add(u));
        }
      });
      bakeries.forEach((b) => {
        if (
          b.localUnit &&
          (normalizeArabicText(b.village) === targetNorm ||
            normalizeArabicText(b.localUnit) === targetNorm)
        ) {
          units.add(b.localUnit);
        }
      });
    }
    return Array.from(units);
  }, [villages, bakeries, filterVillage]);

  // Filtered bakeries for the active report
  const filteredBakeries = useMemo(() => {
    return bakeries.filter((b) => {
      if (selectedReportId === 'bak-single' && filterBakeryId !== 'ALL' && b.id !== filterBakeryId) {
        return false;
      }
      if (filterBakeryId !== 'ALL' && b.id !== filterBakeryId) {
        return false;
      }
      if (!matchesVillageOrUnitFilter(b, filterVillage, filterLocalUnit, villages)) {
        return false;
      }
      if (filterBreadType !== 'ALL' && b.breadType !== filterBreadType) {
        return false;
      }
      if (filterMultiplier !== 'ALL') {
        const mult = String(extractBreadLoafMultiplier(b.breadTypeCount));
        if (mult !== filterMultiplier) return false;
      }
      if (selectedReportId === 'comp-review') {
        const hasMissing =
          !b.bakeryOwnerName ||
          !b.machineNumber ||
          Number(b.actualQuota) <= 0 ||
          Number(b.beneficiaries2025) <= 0;
        const quotaDiff = Math.abs((Number(b.actualQuota) || 0) - (Number(b.insuranceQuota) || 0)) > 0.01;
        const hasDebt = (bakeryDebtMap[b.id] || 0) > 0;
        if (!hasMissing && !quotaDiff && !hasDebt) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          b.bakeryOwnerName.toLowerCase().includes(q) ||
          b.machineNumber.toLowerCase().includes(q) ||
          b.village.toLowerCase().includes(q) ||
          b.localUnit.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [
    bakeries,
    selectedReportId,
    filterBakeryId,
    filterVillage,
    filterLocalUnit,
    villages,
    filterBreadType,
    filterMultiplier,
    searchQuery,
    bakeryDebtMap,
  ]);

  // Annual Weighted Report for filtered bakeries
  const annualReport = useMemo(
    () => calculateAnnualWeightedAveragesReport(filteredBakeries),
    [filteredBakeries]
  );

  // Column-by-column totals for footer row
  const colTotals = useMemo(
    () => calculateBakeriesColumnTotals(filteredBakeries, bakeryDebtMap),
    [filteredBakeries, bakeryDebtMap]
  );

  // Totals for footer row
  const totals = useMemo(() => {
    return {
      sumInsVal: colTotals.insuranceValue,
      sumInsQuota: colTotals.insuranceQuota,
      sumActualQuota: colTotals.actualQuota,
      sumLoaves: colTotals.loavesCount,
      sumPop: colTotals.villagePopulation,
      sumBen23: colTotals.beneficiaries2023,
      sumBen24: colTotals.beneficiaries2024,
      sumBen25: colTotals.beneficiaries2025,
      sumDebt: colTotals.remainingDebt,
      avg2023: colTotals.avg2023,
      avg2024: colTotals.avg2024,
      avg2025: colTotals.avg2025,
      perCapitaAvg: colTotals.perCapitaAverage,
      cumDiff: colTotals.avgDiff,
      weightedAvg2025: annualReport.weightedGeneralAvg2025,
    };
  }, [colTotals, annualReport]);

  const activeColumnsMeta = useMemo(() => {
    const mandatoryKeys = ['index', 'bakeryOwnerName', 'machineNumber', 'village', 'localUnit'];
    const combinedKeys = Array.from(new Set([...mandatoryKeys, ...orderedColumnKeys]));
    return combinedKeys
      .map((key) => ALL_REPORT_COLUMNS.find((c) => c.key === key))
      .filter((c): c is ColumnMeta => Boolean(c));
  }, [orderedColumnKeys]);

  // Toggle column visibility (keep the 4 core identifying columns protected)
  const handleToggleColumn = (key: string) => {
    if (['index', 'bakeryOwnerName', 'machineNumber', 'village', 'localUnit'].includes(key)) {
      return;
    }
    setOrderedColumnKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 2) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  // Reorder column left/right
  const handleMoveColumn = (key: string, dir: 'up' | 'down') => {
    setOrderedColumnKeys((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Save/Load Favorite Preset
  const handleSaveFavoritePreset = () => {
    try {
      const payload = {
        selectedReportId,
        orderedColumnKeys,
        paperSize,
        orientation,
        margins,
        filterVillage,
        filterBreadType,
      };
      localStorage.setItem(FAVORITE_PRESET_KEY, JSON.stringify(payload));
      setPresetToast('تم حفظ إعدادات التقرير المفضلة بنجاح');
      setTimeout(() => setPresetToast(''), 3500);
    } catch {
      // ignore
    }
  };

  const handleLoadFavoritePreset = () => {
    try {
      const raw = localStorage.getItem(FAVORITE_PRESET_KEY);
      if (!raw) {
        setPresetToast('لا توجد إعدادات مفضلة محفوظة مسبقاً');
        setTimeout(() => setPresetToast(''), 3000);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed.selectedReportId) setSelectedReportId(parsed.selectedReportId);
      if (Array.isArray(parsed.orderedColumnKeys) && parsed.orderedColumnKeys.length > 0) {
        setOrderedColumnKeys(parsed.orderedColumnKeys);
      }
      if (parsed.paperSize) setPaperSize(parsed.paperSize);
      if (parsed.orientation) setOrientation(parsed.orientation);
      if (parsed.margins) setMargins(parsed.margins);
      if (parsed.filterVillage) setFilterVillage(parsed.filterVillage);
      if (parsed.filterBreadType) setFilterBreadType(parsed.filterBreadType);
      setPresetToast('تم استرجاع إعدادات التقرير المحفوظة بنجاح');
      setTimeout(() => setPresetToast(''), 3500);
    } catch {
      // ignore
    }
  };

  // Export PDF Handler
  const handleExportPdf = async () => {
    if (isExportingPdf || !reportPrintRef.current) return;
    setIsExportingPdf(true);
    setPdfStageMessage('بدء تجهيز ملف PDF...');
    try {
      const success = await exportElementToPdf(reportPrintRef.current, {
        title: currentReportDef.title,
        paperSize,
        orientation,
        margins,
        onProgress: (msg) => setPdfStageMessage(msg),
      });
      if (!success) {
        printHtmlElementA4(reportPrintRef.current, currentReportDef.title, 'report-font-standard', {
          paperSize,
          orientation,
          margins,
        });
      }
      setPresetToast(`تم تصدير وتنزيل ملف PDF (${currentReportDef.title}) بنجاح`);
      setTimeout(() => setPresetToast(''), 4000);
    } catch (err) {
      console.warn('PDF export fallback triggered:', err);
      printHtmlElementA4(reportPrintRef.current, currentReportDef.title, 'report-font-standard', {
        paperSize,
        orientation,
        margins,
      });
    } finally {
      setIsExportingPdf(false);
      setPdfStageMessage('');
    }
  };

  // Print Handler
  const handlePrintReport = (mode: 'CURRENT' | 'ALL_BAKERIES' = 'CURRENT') => {
    if (mode === 'ALL_BAKERIES' && (filterVillage !== 'ALL' || filterBakeryId !== 'ALL' || searchQuery)) {
      setFilterVillage('ALL');
      setFilterBakeryId('ALL');
      setSearchQuery('');
      setTimeout(() => {
        printHtmlElementA4(reportPrintRef.current, currentReportDef.title, 'report-font-standard', {
          paperSize,
          orientation,
          margins,
        });
      }, 150);
      return;
    }
    printHtmlElementA4(reportPrintRef.current, currentReportDef.title, 'report-font-standard', {
      paperSize,
      orientation,
      margins,
    });
  };

  // Export Excel (UTF-8 BOM CSV)
  const handleExportExcel = () => {
    const headers = activeColumnsMeta.map((c) => `"${c.label}"`).join(',');
    const rows = filteredBakeries.map((b, idx) => {
      return activeColumnsMeta
        .map((col) => {
          const val = renderCellRawValue(b, idx, col.key);
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',');
    });
    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `${currentReportDef.title.replace(/\s+/g, '_')}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderCellRawValue = (b: Bakery, idx: number, key: string): string => {
    switch (key) {
      case 'index':
        return String(idx + 1);
      case 'bakeryOwnerName':
        return b.bakeryOwnerName || '—';
      case 'machineNumber':
        return b.machineNumber || '—';
      case 'village':
        return b.village || '—';
      case 'localUnit':
        return b.localUnit || '—';
      case 'activityStatus':
        return b.activityStatus || '—';
      case 'bakeryCategory':
        return b.bakeryCategory || 'مخبز بلدي مدعم';
      case 'breadType':
        return b.breadType || '—';
      case 'flourBagPrice':
        return typeof b.flourBagPrice === 'number' ? `${b.flourBagPrice} ج.م` : String(b.flourBagPrice || '950 ج.م');
      case 'breadTypeCount':
        return String(extractBreadLoafMultiplier(b.breadTypeCount));
      case 'lineType':
        return b.lineType || '—';
      case 'fuelType':
        return b.fuelType || '—';
      case 'insuranceValue':
        return safeFormatNum(b.insuranceValue, 0);
      case 'insuranceQuota':
        return safeFormatNum(b.insuranceQuota, Number(b.insuranceQuota) % 1 !== 0 ? 2 : 0);
      case 'actualQuota':
        return safeFormatNum(b.actualQuota, 0);
      case 'loavesCount':
        return safeFormatNum(b.loavesCount, 0);
      case 'villagePopulation':
        return safeFormatNum(b.villagePopulation, 0);
      case 'beneficiaries2023':
        return safeFormatNum(b.beneficiaries2023, 0);
      case 'avg2023':
        return safeFormatNum(b.avg2023, 2);
      case 'beneficiaries2024':
        return safeFormatNum(b.beneficiaries2024, 0);
      case 'avg2024':
        return safeFormatNum(b.avg2024, 2);
      case 'beneficiaries2025':
        return safeFormatNum(b.beneficiaries2025, 0);
      case 'avg2025':
        return safeFormatNum(b.avg2025, 2);
      case 'perCapitaAverage':
        return safeFormatNum(b.perCapitaAverage, 2);
      case 'avgDiff':
        return safeFormatNum(b.avgDiff, 2);
      case 'remainingDebt':
        return safeFormatNum(bakeryDebtMap[b.id] || 0, 0);
      case 'phone':
        return b.phone || '—';
      case 'bakeryLicenseDate':
        return formatDateDDMMYYYY(b.bakeryLicenseDate) || '—';
      default:
        return '—';
    }
  };

  const renderFooterCell = (key: string, idx: number): string => {
    if (idx === 0) return '∑';
    if (key === 'bakeryOwnerName') return `صف الإجماليات TOTAL SUMMARY (${filteredBakeries.length} مخبز)`;
    switch (key) {
      case 'machineNumber':
        return `${colTotals.bakeryCount} ماكينة`;
      case 'village':
        return colTotals.uniqueVillagesLabel;
      case 'localUnit':
        return colTotals.uniqueUnitsLabel;
      case 'activityStatus':
        return colTotals.activitySummaryLabel;
      case 'bakeryCategory':
        return colTotals.bakeryCategorySummaryLabel;
      case 'breadType':
        return colTotals.breadTypeSummaryLabel;
      case 'flourBagPrice':
        return `${safeFormatNum(colTotals.flourBagPriceSum, 0)} ج.م`;
      case 'breadTypeCount':
        return safeFormatNum(colTotals.breadTypeCountSum, 0);
      case 'lineType':
        return colTotals.lineTypeSummaryLabel;
      case 'fuelType':
        return colTotals.fuelTypeSummaryLabel;
      case 'insuranceValue':
        return safeFormatNum(totals.sumInsVal, 0);
      case 'insuranceQuota':
        return safeFormatNum(totals.sumInsQuota, totals.sumInsQuota % 1 !== 0 ? 2 : 0);
      case 'actualQuota':
        return safeFormatNum(totals.sumActualQuota, 0);
      case 'loavesCount':
        return safeFormatNum(totals.sumLoaves, 0);
      case 'villagePopulation':
        return safeFormatNum(totals.sumPop, 0);
      case 'beneficiaries2023':
        return safeFormatNum(totals.sumBen23, 0);
      case 'avg2023':
        return safeFormatNum(totals.avg2023, 2);
      case 'beneficiaries2024':
        return safeFormatNum(totals.sumBen24, 0);
      case 'avg2024':
        return safeFormatNum(totals.avg2024, 2);
      case 'beneficiaries2025':
        return safeFormatNum(totals.sumBen25, 0);
      case 'avg2025':
        return safeFormatNum(totals.avg2025, 2);
      case 'perCapitaAverage':
        return safeFormatNum(totals.perCapitaAvg, 2);
      case 'avgDiff':
        return safeFormatNum(totals.cumDiff, 2);
      case 'remainingDebt':
        return safeFormatNum(totals.sumDebt, 0);
      case 'phone':
        return `${colTotals.validPhonesCount} رقم مسجل`;
      case 'bakeryLicenseDate':
        return `${colTotals.validLicenseCount} رخصة`;
      default:
        return `${colTotals.bakeryCount} سجل`;
    }
  };

  const reportSerialNumber = useMemo(() => {
    const d = new Date();
    return `RPT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${selectedReportId.toUpperCase()}`;
  }, [selectedReportId]);

  const issueTimestamp = useMemo(() => {
    return new Date().toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [selectedReportId, filteredBakeries.length]);

  const groupsList = [
    { id: 1, title: '1. تقارير قاعدة بيانات المخابز', icon: <Building2 className="w-4 h-4" /> },
    { id: 2, title: '2. التقارير التأمينية', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 3, title: '3. تقارير الأرغفة والحصص', icon: <Wheat className="w-4 h-4" /> },
    { id: 4, title: '4. تقارير المستفيدين ومتوسط نصيب الفرد', icon: <Users className="w-4 h-4" /> },
    { id: 5, title: '5. التقارير المقارنة والإجمالية', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      {/* 1. Top Header Banner of Reports Center */}
      <div className="bg-gradient-to-l from-[#0A1931] via-[#0F2342] to-[#1E3A8A] text-white rounded-2xl p-5 shadow-md border border-blue-900/40 flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white/10 rounded-xl border border-white/20">
            <FileText className="w-7 h-7 text-blue-200" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black tracking-tight text-white">
              مركز التقارير والطباعة والتصدير الموحد (PDF & Print)
            </h2>
            <p className="text-xs text-blue-200 font-bold mt-0.5">
              استخراج ومعاينة وطباعة وتصدير كافة التقارير الحكومية المعتمدة باللغة العربية (RTL) من واقع قاعدة البيانات الفعلية
            </p>
          </div>
        </div>

        {/* Primary Export PDF & Print Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            disabled={isExportingPdf}
            onClick={handleExportPdf}
            className="px-4 py-2.5 bg-[#1D4ED8] hover:bg-[#2563EB] active:scale-[0.98] disabled:opacity-60 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm border border-blue-400/40 transition cursor-pointer"
          >
            {isExportingPdf ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            <span>{isExportingPdf ? pdfStageMessage || 'جاري تجهيز PDF...' : 'تصدير التقرير PDF'}</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrintReport('CURRENT')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير الحالي</span>
          </button>

          <button
            type="button"
            onClick={() => handlePrintReport('ALL_BAKERIES')}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة جميع المخابز</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
            <span>تصدير Excel</span>
          </button>

          {onOpenLegacyReportModal && (
            <button
              type="button"
              onClick={onOpenLegacyReportModal}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-blue-100 border border-white/15 rounded-xl text-xs font-bold transition cursor-pointer"
              title="فتح نافذة كشوف الحسابات والمديونيات التفصيلية"
            >
              <span>كشوف المديونيات المتخصصة</span>
            </button>
          )}
        </div>
      </div>

      {presetToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{presetToast}</span>
        </div>
      )}

      {/* 2. Functional Report Groups Selector (المجموعات الخمس للتقارير) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedGroupFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedGroupFilter === 'ALL'
                  ? 'bg-[#0F2342] text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              كافة مجموعات التقارير (24 تقريراً)
            </button>
            {groupsList.map((grp) => (
              <button
                key={grp.id}
                type="button"
                onClick={() => setSelectedGroupFilter(grp.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  selectedGroupFilter === grp.id
                    ? 'bg-[#1E40AF] text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {grp.icon}
                <span>{grp.title}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSaveFavoritePreset}
              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="حفظ إعدادات التقرير الحالي كمفضلة"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>حفظ الإعدادات</span>
            </button>
            <button
              type="button"
              onClick={handleLoadFavoritePreset}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              <span>استعادة تقرير محفوظ</span>
            </button>
          </div>
        </div>

        {/* Grid of Reports */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {OFFICIAL_REPORTS_CATALOG.filter(
            (r) => selectedGroupFilter === 'ALL' || r.groupId === selectedGroupFilter
          ).map((rep) => {
            const isActive = rep.id === selectedReportId;
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => setSelectedReportId(rep.id)}
                className={`p-3 rounded-xl border text-right transition flex flex-col justify-between cursor-pointer ${
                  isActive
                    ? 'bg-[#0F2342] text-white border-[#1E40AF] shadow-sm'
                    : 'bg-slate-50/70 hover:bg-blue-50/50 text-slate-800 border-slate-200 hover:border-blue-300'
                }`}
              >
                <div>
                  <span
                    className={`text-[10px] font-bold block mb-0.5 ${
                      isActive ? 'text-blue-200' : 'text-slate-500'
                    }`}
                  >
                    {rep.groupTitle}
                  </span>
                  <span className="text-xs font-black block leading-snug">{rep.title}</span>
                </div>
                <span
                  className={`text-[11px] mt-1.5 line-clamp-1 ${
                    isActive ? 'text-slate-200' : 'text-slate-500'
                  }`}
                >
                  {rep.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Report Filters, Page Setup (A4/A3, Orientation, Margins, Zoom) & Column Customizer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
          {/* Specific Bakery Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">اختيار مخبز محدد</label>
            <select
              value={filterBakeryId}
              onChange={(e) => setFilterBakeryId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="ALL">جميع المخابز ({bakeries.length})</option>
              {bakeries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bakeryOwnerName} ({b.village})
                </option>
              ))}
            </select>
          </div>

          {/* Village Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">المنطقة / القرية</label>
            <select
              value={filterVillage}
              onChange={(e) => {
                setFilterVillage(e.target.value);
                setFilterLocalUnit('ALL');
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="ALL">كافة القرى ({villages.length})</option>
              {villages.map((v) => (
                <option key={v.village} value={v.village}>
                  قرية {v.village}
                </option>
              ))}
            </select>
          </div>

          {/* Local Unit Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">الوحدة المحلية التابعة</label>
            <select
              value={filterLocalUnit}
              onChange={(e) => setFilterLocalUnit(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="ALL">كافة الوحدات المحلية ({availableUnitsForReport.length})</option>
              {availableUnitsForReport.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Bread Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع الخبز</label>
            <select
              value={filterBreadType}
              onChange={(e) => setFilterBreadType(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="ALL">كافة الأنواع</option>
              {Array.from(new Set(bakeries.map((b) => b.breadType).filter(Boolean))).map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </div>

          {/* Multiplier Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">معامل الأرغفة (660/725)</label>
            <select
              value={filterMultiplier}
              onChange={(e) => setFilterMultiplier(e.target.value as 'ALL' | '660' | '725')}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="ALL">الكل (660 و 725)</option>
              <option value="660">معامل 660 رغيف/شيكارة</option>
              <option value="725">معامل 725 رغيف/شيكارة</option>
            </select>
          </div>

          {/* Paper Size */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">حجم الورق (PDF / طباعة)</label>
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as 'a4' | 'a3')}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="a4">مقاس A4 قياسي</option>
              <option value="a3">مقاس A3 عريض للتقارير الكبيرة</option>
            </select>
          </div>

          {/* Orientation */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">اتجاه الصفحة</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="landscape">أفقي (Landscape)</option>
              <option value="portrait">رأسي (Portrait)</option>
            </select>
          </div>

          {/* Margins */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">الهوامش</label>
            <select
              value={margins}
              onChange={(e) => setMargins(e.target.value as 'normal' | 'narrow' | 'wide')}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-800"
            >
              <option value="normal">متوازنة (10 ملم)</option>
              <option value="narrow">ضيقة (5 ملم - عرض أقصى)</option>
              <option value="wide">واسعة (15 ملم)</option>
            </select>
          </div>
        </div>

        {/* Bottom bar of controls: Search, Zoom, Column Customizer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث داخل التقرير بالاسم أو الماكينة أو القرية..."
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 w-64"
            />
            <button
              type="button"
              onClick={() => setShowColumnCustomizer((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                showColumnCustomizer
                  ? 'bg-[#0F2342] text-white border-[#0F2342]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>تخصيص وترتيب أعمدة التقرير ({activeColumnsMeta.length})</span>
            </button>
          </div>

          {/* Preview Zoom Controls */}
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>حجم المعاينة:</span>
            <button
              type="button"
              onClick={() => setPreviewZoom((z) => Math.max(70, z - 10))}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              title="تصغير المعاينة"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[#0F2342] w-12 text-center">{previewZoom}%</span>
            <button
              type="button"
              onClick={() => setPreviewZoom((z) => Math.min(120, z + 10))}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              title="تكبير المعاينة"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Column Customizer Panel */}
        {showColumnCustomizer && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#0F2342]">
                اختر الأعمدة المطلوب إظهارها ورتب أولوية ظهورها في التقرير:
              </span>
              <button
                type="button"
                onClick={() => setOrderedColumnKeys(currentReportDef.defaultColumns)}
                className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
              >
                استعادة الأعمدة الافتراضية للتقرير
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_REPORT_COLUMNS.map((col) => {
                const isSelected = orderedColumnKeys.includes(col.key);
                return (
                  <div
                    key={col.key}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold ${
                      isSelected
                        ? 'bg-[#EFF6FF] border-blue-300 text-[#0F2342]'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleColumn(col.key)}
                      className="rounded text-[#1E40AF] cursor-pointer"
                    />
                    <span>{col.label}</span>
                    {isSelected && (
                      <div className="flex items-center gap-0.5 mr-1">
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(col.key, 'up')}
                          className="p-0.5 hover:bg-blue-200 rounded cursor-pointer"
                          title="تحريك لليمين"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(col.key, 'down')}
                          className="p-0.5 hover:bg-blue-200 rounded cursor-pointer"
                          title="تحريك لليسار"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Live Official Print & PDF Preview Sheet (معاينة التقرير النهائي قبل الطباعة والتصدير) */}
      <div className="bg-slate-200/70 border border-slate-300 rounded-2xl p-4 md:p-6 overflow-x-auto shadow-inner">
        <div
          ref={reportPrintRef}
          style={{ zoom: previewZoom / 100 }}
          className="print-container bg-white text-slate-900 rounded-xl shadow-lg border border-slate-300 p-6 md:p-8 mx-auto max-w-[1800px] space-y-5"
        >
          {/* 4.1 Official Report Header (رأس التقرير الموحد) */}
          <div className="border-b-2 border-[#0F2342] pb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {systemConfig.logoBase64 && (
                <img
                  src={systemConfig.logoBase64}
                  alt="شعار المديرية"
                  className="w-14 h-14 object-contain rounded-lg border border-slate-200 p-1 bg-white"
                />
              )}
              <div>
                <p className="text-xs font-extrabold text-slate-700">
                  محافظة الغربية · مديرية التموين والتجارة الداخلية بالغربية
                </p>
                <p className="text-sm font-black text-[#0F2342] mt-0.5">
                  إدارة تموين مركز المحلة الكبرى — منظومة إدارة بيانات المخابز والتموين
                </p>
              </div>
            </div>

            <div className="text-center flex-1 min-w-[260px]">
              <h1 className="text-base md:text-lg font-black text-[#0F2342] bg-slate-50 border border-slate-200 px-4 py-1.5 rounded-xl inline-block">
                {currentReportDef.title}
              </h1>
              <p className="text-xs font-bold text-slate-600 mt-1">{currentReportDef.subtitle}</p>
            </div>

            <div className="text-left text-xs font-bold text-slate-700 space-y-0.5 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500">رقم التقرير: </span>
                <span className="font-mono font-black text-[#0F2342]">{reportSerialNumber}</span>
              </div>
              <div>
                <span className="text-slate-500">تاريخ الاستخراج: </span>
                <span>{issueTimestamp}</span>
              </div>
              <div>
                <span className="text-slate-500">عدد السجلات: </span>
                <span className="font-mono font-black text-[#1E40AF]">{filteredBakeries.length} مخبز</span>
              </div>
              <div className="pt-1 mt-1 border-t border-slate-200 text-right font-black text-[#0F2342]">
                أعده: {currentUser?.fullName || 'م/ أحمد الحسيني'} ({currentUser?.username || 'admin'})
              </div>
            </div>
          </div>

          {/* 4.2 Executive Summary Strip inside Report */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-center">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-slate-600 block">عدد المخابز</span>
              <span className="text-sm font-black text-[#0F2342] font-mono">
                {safeFormatNum(filteredBakeries.length)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-slate-600 block">المبالغ التأمينية</span>
              <span className="text-sm font-black text-[#0F2342] font-mono">
                {safeFormatNum(totals.sumInsVal)} ج.م
              </span>
            </div>
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-[#1E3A8A] block">الحصص التأمينية ∑</span>
              <span className="text-sm font-black text-[#1E3A8A] font-mono">
                {safeFormatNum(totals.sumInsQuota, totals.sumInsQuota % 1 !== 0 ? 2 : 0)} شيكارة
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-slate-600 block">الحصص الفعلية</span>
              <span className="text-sm font-black text-[#0F2342] font-mono">
                {safeFormatNum(totals.sumActualQuota)} شيكارة
              </span>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-emerald-800 block">إجمالي الأرغفة ∑</span>
              <span className="text-sm font-black text-emerald-800 font-mono">
                {safeFormatNum(totals.sumLoaves)} رغيف
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-slate-600 block">مستفيدي 2025</span>
              <span className="text-sm font-black text-[#0F2342] font-mono">
                {safeFormatNum(totals.sumBen25)}
              </span>
            </div>
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-[#1E3A8A] block">متوسط الفرد (2025)</span>
              <span className="text-sm font-black text-[#1E3A8A] font-mono">{totals.avg2025}</span>
            </div>
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5">
              <span className="text-[11px] font-bold text-amber-900 block">الفرق التراكمي ∑</span>
              <span className="text-sm font-black text-amber-900 font-mono" dir="ltr">
                {totals.cumDiff}
              </span>
            </div>
          </div>

          {/* 4.3 Official Report Data Table (Deep Navy Header + White Bold Text + Alternating Rows) */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-[#0F2342] text-white font-bold">
                  {activeColumnsMeta.map((col) => (
                    <th
                      key={col.key}
                      className={`py-2.5 px-2 border border-[#1E3A8A] font-extrabold whitespace-nowrap ${
                        col.align === 'right' ? 'text-right' : 'text-center'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                  {onSelectBakeryDetails && (
                    <th className="py-2.5 px-2 border border-[#1E3A8A] text-center no-print">تفاصيل</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredBakeries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeColumnsMeta.length + 1}
                      className="py-8 text-center text-slate-500 font-bold"
                    >
                      لا توجد سجلات مطابقة لمعايير التصفية الحالية
                    </td>
                  </tr>
                ) : (
                  filteredBakeries.map((b, idx) => (
                    <tr
                      key={b.id}
                      className={`border-b border-slate-200 transition ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'
                      } hover:bg-blue-50/60`}
                    >
                      {activeColumnsMeta.map((col) => {
                        const val = renderCellRawValue(b, idx, col.key);
                        const isDiff = col.key === 'avgDiff';
                        const isDebt = col.key === 'remainingDebt' && (bakeryDebtMap[b.id] || 0) > 0;
                        return (
                          <td
                            key={col.key}
                            dir={isDiff ? 'ltr' : undefined}
                            className={`py-2 px-2 border border-slate-200 font-bold ${
                              col.align === 'right' ? 'text-right' : 'text-center'
                            } ${col.isNumeric ? 'font-mono tabular-nums' : ''} ${
                              col.isCalculated
                                ? 'bg-blue-50/30 text-[#1E3A8A] font-extrabold'
                                : 'text-slate-800'
                            } ${isDebt ? 'text-red-700 font-black' : ''}`}
                          >
                            {val}
                          </td>
                        );
                      })}
                      {onSelectBakeryDetails && (
                        <td className="py-2 px-2 border border-slate-200 text-center no-print">
                          <button
                            type="button"
                            onClick={() => onSelectBakeryDetails(b)}
                            className="p-1 text-[#1E40AF] hover:bg-blue-100 rounded-md transition cursor-pointer"
                            title="عرض البطاقة التفصيلية للمخبز"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {filteredBakeries.length > 0 && (
                <tfoot>
                  <tr className="bg-[#0F2342] text-amber-300 font-black border-t-2 border-amber-500 total-summary-row">
                    {activeColumnsMeta.map((col, idx) => (
                      <td
                        key={col.key}
                        dir={col.key === 'avgDiff' ? 'ltr' : undefined}
                        className={`py-2.5 px-2 border border-[#1E3A8A] font-black ${
                          col.align === 'right' ? 'text-right' : 'text-center'
                        } ${col.isNumeric ? 'font-mono tabular-nums' : ''}`}
                      >
                        {renderFooterCell(col.key, idx)}
                      </td>
                    ))}
                    {onSelectBakeryDetails && (
                      <td className="py-2.5 px-2 border border-[#1E3A8A] text-center font-mono text-[10px] text-amber-200 no-print">
                        100% مكتمل
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 4.4 Official Report Footer & Signatures (تذييل التقرير والاعتماد الإداري) */}
          <div className="pt-4 border-t-2 border-slate-300 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs font-extrabold text-slate-800 pt-2">
              <div className="border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-[#0F2342]">إعداد المختص</p>
                <p className="text-[11px] font-black text-amber-950 mt-1">
                  أعده: {currentUser?.fullName || 'م/ أحمد الحسيني'} ({currentUser?.username || 'admin'})
                </p>
                <p className="text-slate-400 mt-3 text-[11px]">التوقيع: ........................</p>
              </div>
              <div className="border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-[#0F2342]">مراجعة رئيس القسم</p>
                <p className="text-slate-400 mt-5 text-[11px]">التوقيع: ........................</p>
              </div>
              <div className="border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-[#0F2342]">مدير إدارة تموين مركز المحلة الكبرى</p>
                <p className="text-slate-400 mt-5 text-[11px]">التوقيع: ........................</p>
              </div>
              <div className="border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-[#0F2342]">يعتمد ،،، مدير المديرية</p>
                <p className="text-slate-400 mt-5 text-[11px]">التوقيع والختم: ..................</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500 pt-2 border-t border-slate-200">
              <span>
                منظومة إدارة تموين مركز المحلة الكبرى — استخراج آلي معتمد من قاعدة البيانات الفعلية
              </span>
              <span>
                تاريخ الإصدار: {issueTimestamp} · رقم التقرير: {reportSerialNumber} · صفحة 1 من 1
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
