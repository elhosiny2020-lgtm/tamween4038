import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Wrench,
  Warehouse,
  Cog,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  Settings,
  History,
  Plus,
  FileText,
  ThermometerSnowflake,
  Factory,
  Wheat,
  Landmark,
  FileBarChart2,
} from 'lucide-react';
import type { AppUser, Bakery, SystemConfig, VillageHierarchy } from '../../types';
import { resolveCustomTableTitle } from '../../utils/branchOperations';
import type {
  GrainMaintenanceState,
  GrainAsset,
  MaintenanceOrder,
  MaintenanceOrderStatus,
  GrainMovementRecord,
  SparePartItem,
  MaintenanceTechnician,
  ModuleAuditLog,
} from '../../types/modules';
import {
  computeEquipmentKpis,
  computeMaintenanceOrderCost,
  computeSparePartStatus,
  computeMoistureCorrectedWeight,
  computeGrainStockAndLossSummary,
  computeCostPerTon,
  computeShunaBookBalanceAndValuation,
} from '../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../services/modulesStorage';
import {
  resolveModuleCrudPermissions,
  checkGrainDeleteIntegrity,
} from '../../utils/moduleCrudHelpers';
import { isSuperAdmin } from '../../utils/departmentRbac';
import {
  ModuleTableToolbar,
  ModuleRowActions,
  ModuleFormModal,
  ModuleDeleteConfirmModal,
  ModuleRecordProfileModal,
  VillageGrandTotalRow,
  SmartTableSearchBar,
  TablePaginationBar,
  AuditLogAdminToolbar,
  ReportToolbar,
  ErrorBoundary,
  SectionFactoryResetButton,
  type CrudFieldDefinition,
  type ProfileFieldItem,
} from './ModuleCrudShared';
import { matchesSmartSearch } from '../../utils/tableSmartHelpers';
import { Trash2 } from 'lucide-react';
import { ShunasAndWheatReceiptsView } from './grain/ShunasAndWheatReceiptsView';
import { RefrigeratorsDatabaseView } from './grain/RefrigeratorsDatabaseView';
import { MillsDatabaseView } from './grain/MillsDatabaseView';
import { FlourQuotasDatabaseView } from './grain/FlourQuotasDatabaseView';
import { GrainFinancialsAndReportsView } from './grain/GrainFinancialsAndReportsView';

export type GrainSubView =
  | 'dashboard'
  | 'shunas'
  | 'wheat_receipts_book'
  | 'refrigerators'
  | 'mills'
  | 'flour_quotas'
  | 'assets'
  | 'orders'
  | 'parts'
  | 'grain_moisture'
  | 'financials'
  | 'reports'
  | 'alerts'
  | 'settings'
  | 'audit';

interface GrainMaintenanceSuiteProps {
  state: GrainMaintenanceState;
  branchId: string;
  branchName: string;
  currentUser: AppUser | null;
  bakeries?: Bakery[];
  villages?: VillageHierarchy[];
  initialSubView?: GrainSubView;
  systemConfig?: SystemConfig;
  onChangeState: (next: GrainMaintenanceState, actionSummary?: string) => void;
  onFactoryResetSection?: () => Promise<void> | void;
}

const ORDER_STATUSES: MaintenanceOrderStatus[] = [
  'جديد',
  'قيد الفحص',
  'معتمد',
  'قيد التنفيذ',
  'متوقف لعدم توافر قطع الغيار',
  'مكتمل',
  'مغلق',
];

export const GrainMaintenanceSuite: React.FC<GrainMaintenanceSuiteProps> = ({
  state,
  branchId,
  branchName,
  currentUser,
  bakeries = [],
  villages = [],
  initialSubView = 'dashboard',
  systemConfig,
  onChangeState,
  onFactoryResetSection,
}) => {
  const [subView, setSubView] = useState<GrainSubView>(initialSubView);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const permissions = useMemo(
    () => resolveModuleCrudPermissions(currentUser, false, 'grain_maintenance'),
    [currentUser]
  );
  const isViewer = permissions.isReadOnly;

  // Add Asset quick form
  const [assetCode, setAssetCode] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<GrainAsset['assetType']>('صومعة');
  const [assetSite, setAssetSite] = useState(`مجمع صوامع ${branchName}`);

  // Add Order quick form
  const [orderAssetId, setOrderAssetId] = useState(state.assets[0]?.id || '');
  const [orderType, setOrderType] = useState<MaintenanceOrder['maintenanceType']>('علاجية طارئة');
  const [orderFault, setOrderFault] = useState('');
  const [orderHours, setOrderHours] = useState<number>(6);
  const [orderHourlyRate, setOrderHourlyRate] = useState<number>(120);
  const [orderPartId, setOrderPartId] = useState<string>(state.spareParts[0]?.id || '');
  const [orderPartQty, setOrderPartQty] = useState<number>(1);
  const [orderConsumables, setOrderConsumables] = useState<number>(250);

  // Grain Moisture Correction & Movement quick form
  const [gmDocNo, setGmDocNo] = useState('');
  const [gmSilo, setGmSilo] = useState(state.assets[0]?.siloOrWarehouseName || 'صومعة حبوب رقم 1');
  const [gmType, setGmType] = useState<GrainMovementRecord['movementType']>('وارد');
  const [gmOriginalTons, setGmOriginalTons] = useState<number>(500);
  const [gmActualMoisture, setGmActualMoisture] = useState<number>(13.5);
  const [gmRefMoisture, setGmRefMoisture] = useState<number>(
    state.settings.defaultReferenceMoisturePct || 12
  );
  const [gmPhysicalCount, setGmPhysicalCount] = useState<number>(0);

  const [settingsDraft, setSettingsDraft] = useState(state.settings);

  // Unified CRUD modal state
  const [formModalState, setFormModalState] = useState<{
    isOpen: boolean;
    mode: 'add' | 'edit';
    entityKey: 'asset' | 'order' | 'part' | 'technician' | 'grain_movement';
    title: string;
    fields: CrudFieldDefinition[];
    initialValues: Record<string, any>;
    targetId?: string;
  } | null>(null);

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    entityType: 'asset' | 'order' | 'part' | 'technician' | 'grain_movement';
    entityTitle: string;
    entityId: string;
    recordSummary: { label: string; value: string | number }[];
  } | null>(null);

  const [profileModalState, setProfileModalState] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    entityType: string;
    fields: ProfileFieldItem[];
    onEdit?: () => void;
  } | null>(null);

  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState<number>(25);

  const notify = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const appendAudit = (
    actionType: ModuleAuditLog['actionType'],
    entityName: string,
    entityId: string,
    afterSummary: string,
    beforeSummary?: string
  ): ModuleAuditLog => ({
    id: `aud-gm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    branchId,
    module: 'grain_maintenance',
    timestamp: new Date().toISOString(),
    username: currentUser?.username || 'system',
    userFullName: currentUser?.fullName || 'مستخدم المنظومة',
    actionType,
    entityName,
    entityId,
    beforeSummary,
    afterSummary,
  });

  const grainSummary = useMemo(
    () => computeGrainStockAndLossSummary(state.grainMovements),
    [state.grainMovements]
  );

  const totalMaintenanceCost = useMemo(
    () => state.orders.reduce((s, o) => s + (o.totalRepairCost || 0), 0),
    [state.orders]
  );

  const costPerTon = useMemo(
    () => computeCostPerTon(totalMaintenanceCost, grainSummary.openingTons + grainSummary.inboundTons),
    [totalMaintenanceCost, grainSummary]
  );

  const assetOeeChartData = useMemo(
    () =>
      state.assets.map((a) => {
        const kpi = computeEquipmentKpis(a, state.orders);
        return {
          name: a.assetCode,
          الإتاحة: kpi.availabilityPct ?? 0,
          الكفاءة_OEE: kpi.oeePct ?? 0,
        };
      }),
    [state.assets, state.orders]
  );

  const smartAlerts = useMemo(() => {
    const list: { level: 'high' | 'med'; msg: string }[] = [];
    state.spareParts.forEach((p) => {
      const st = computeSparePartStatus(p);
      if (st.needsReorder) {
        list.push({
          level: 'high',
          msg: `قطعة الغيار (${p.partName}) بلغت حد إعادة الطلب (${st.availableBalance} ≤ ${st.reorderPoint})`,
        });
      }
    });
    state.assets.forEach((a) => {
      if (a.operationalStatus !== 'عاملة') {
        list.push({
          level: 'high',
          msg: `المعدة/الصومعة (${a.name}) حالتها: ${a.operationalStatus}`,
        });
      }
    });
    (state.refrigeratorTempLogs || []).forEach((t) => {
      if (t.alarmStatus !== 'طبيعي') {
        list.push({
          level: 'high',
          msg: `إنذار ثلاجة (${t.refrigeratorName} - ${t.roomNumber}): ${t.alarmStatus} (الحرارة الفعلية ${t.actualTempCelsius}°C مقابل المطلوبة ${t.requiredTempCelsius}°C)`,
        });
      }
    });
    (state.millLicenses || []).forEach((lic) => {
      if (lic.documentStatus !== 'سارية') {
        list.push({
          level: 'med',
          msg: `تراخيص ومستندات المطحن (${lic.millName}): ${lic.documentStatus} — تاريخ الانتهاء ${lic.expiryDate}`,
        });
      }
    });
    (state.flourDailyDistributions || []).forEach((fd) => {
      if (fd.disbursementStatus === 'لم يتم الصرف' || fd.disbursementStatus === 'صرف جزئي') {
        list.push({
          level: fd.disbursementStatus === 'لم يتم الصرف' ? 'high' : 'med',
          msg: `حصة دقيق المخبز (${fd.bakeryName} - ${fd.village}): ${fd.disbursementStatus} — المتبقي اليومي ${fd.remainingDailyTons} طن`,
        });
      }
    });
    (state.shunaReconciliations || []).forEach((rec) => {
      if (rec.reconciliationStatus !== 'مطابق') {
        list.push({
          level: 'high',
          msg: `فرق جرد بالشونة (${rec.shunaName}): ${rec.reconciliationStatus} بمقدار (${rec.varianceTons} طن) بمحضر رقم ${rec.reconciliationNumber}`,
        });
      }
    });
    if (
      grainSummary.lossPercentage !== null &&
      grainSummary.lossPercentage > state.settings.maxAcceptableGrainLossPct
    ) {
      list.push({
        level: 'high',
        msg: `نسبة فاقد الحبوب (${grainSummary.lossPercentage}%) تجاوزت الحد المسموح (${state.settings.maxAcceptableGrainLossPct}%)`,
      });
    }
    return list;
  }, [
    state.spareParts,
    state.assets,
    state.refrigeratorTempLogs,
    state.millLicenses,
    state.flourDailyDistributions,
    state.shunaReconciliations,
    grainSummary,
    state.settings.maxAcceptableGrainLossPct,
  ]);

  const handleUpdateGrainSubState = (
    updater: (prev: GrainMaintenanceState) => GrainMaintenanceState,
    summary: string
  ) => {
    const next = updater(state);
    onChangeState(
      {
        ...next,
        auditLogs: [
          appendAudit('تعديل', 'قسم صيانة الحبوب', branchId, summary),
          ...(next.auditLogs || []),
        ],
      },
      summary
    );
  };

  const totalShunaApprovedWheatTons = useMemo(() => {
    return (state.shunas || []).reduce((sum, sh) => {
      const m = computeShunaBookBalanceAndValuation({
        shuna: sh,
        wheatReceipts: state.wheatReceipts || [],
        wheatIssues: state.wheatIssues || [],
      });
      return sum + m.currentBookBalanceTons;
    }, 0);
  }, [state.shunas, state.wheatReceipts, state.wheatIssues]);

  const totalDailyFlourQuotaTons = useMemo(() => {
    return Number(
      (state.flourQuotaMaster || [])
        .reduce((s, q) => s + (Number(q.dailyQuotaTons) || 0), 0)
        .toFixed(3)
    );
  }, [state.flourQuotaMaster]);

  const previewCorrectedWeight = useMemo(
    () => computeMoistureCorrectedWeight(gmOriginalTons, gmActualMoisture, gmRefMoisture),
    [gmOriginalTons, gmActualMoisture, gmRefMoisture]
  );

  // Field definitions for Unified CRUD Modal
  const getAssetFields = (): CrudFieldDefinition[] => [
    { key: 'assetCode', label: 'كود الصومعة / المعدة', type: 'text', required: true, placeholder: 'مثال: SILO-101' },
    { key: 'name', label: 'اسم الصومعة / المعدة', type: 'text', required: true, placeholder: 'صومعة حبوب معدنية 1' },
    {
      key: 'assetType',
      label: 'نوع الأصل',
      type: 'select',
      required: true,
      options: [
        { value: 'صومعة', label: 'صومعة' },
        { value: 'شونة', label: 'شونة' },
        { value: 'مصعد', label: 'مصعد' },
        { value: 'سير ناقل', label: 'سير ناقل' },
        { value: 'غربال ومنقي', label: 'غربال ومنقي' },
        { value: 'ميزان', label: 'ميزان' },
        { value: 'لوحة تحكم', label: 'لوحة تحكم' },
        { value: 'مولد', label: 'مولد' },
        { value: 'شفاط غبار', label: 'شفاط غبار' },
        { value: 'مروحة تهوية', label: 'مروحة تهوية' },
        { value: 'حساس رطوبة وحرارة', label: 'حساس رطوبة وحرارة' },
      ],
    },
    { key: 'locationSite', label: 'الموقع الهندسي', type: 'text', required: true },
    { key: 'siloOrWarehouseName', label: 'اسم الصومعة / المخزن التابع', type: 'text', required: true },
    {
      key: 'operationalStatus',
      label: 'الحالة التشغيلية',
      type: 'select',
      required: true,
      options: [
        { value: 'عاملة', label: 'عاملة' },
        { value: 'تحت الصيانة', label: 'تحت الصيانة' },
        { value: 'متوقفة جزئياً', label: 'متوقفة جزئياً' },
        { value: 'متوقفة كلياً', label: 'متوقفة كلياً' },
        { value: 'مكهنة', label: 'مكهنة' },
      ],
    },
    { key: 'ratedCapacityTonPerHour', label: 'القدرة التصميمية (طن/ساعة)', type: 'number', required: true, min: 0 },
    { key: 'purchaseValue', label: 'القيمة الدفترية / الشراء (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'plannedHoursPerPeriod', label: 'ساعات التشغيل المخططة', type: 'number', required: true, min: 1 },
    { key: 'downtimeHours', label: 'ساعات التوقف والأعطال', type: 'number', required: true, min: 0 },
    { key: 'actualProductionTons', label: 'الإنتاج الفعلي (طن)', type: 'number', required: true, min: 0 },
    { key: 'designProductionTons', label: 'الإنتاج التصميمي (طن)', type: 'number', required: true, min: 1 },
    { key: 'conformingTons', label: 'الكمية المطابقة للمواصفات (طن)', type: 'number', required: true, min: 0 },
    { key: 'nextMaintenanceDate', label: 'تاريخ الصيانة الدورية القادمة', type: 'date', required: true },
  ];

  const getOrderFields = (): CrudFieldDefinition[] => [
    { key: 'orderNumber', label: 'رقم أمر الصيانة', type: 'text', required: true },
    { key: 'requestDate', label: 'تاريخ الطلب', type: 'date', required: true },
    {
      key: 'assetId',
      label: 'الصومعة / المعدة',
      type: 'select',
      required: true,
      options: state.assets.map((a) => ({ value: a.id, label: `${a.assetCode} — ${a.name}` })),
    },
    {
      key: 'maintenanceType',
      label: 'نوع الصيانة',
      type: 'select',
      required: true,
      options: [
        { value: 'وقائية', label: 'وقائية' },
        { value: 'دورية', label: 'دورية' },
        { value: 'علاجية طارئة', label: 'علاجية طارئة' },
        { value: 'تنبؤية', label: 'تنبؤية' },
        { value: 'عمرة شاملة', label: 'عمرة شاملة' },
        { value: 'معايرة موازين', label: 'معايرة موازين' },
        { value: 'معايرة حساسات رطوبة وحرارة', label: 'معايرة حساسات رطوبة وحرارة' },
      ],
    },
    { key: 'faultDescription', label: 'وصف العطل / الأعمال المنفذة', type: 'textarea', required: true, colSpan: 2 },
    {
      key: 'severity',
      label: 'درجة الخطورة',
      type: 'select',
      required: true,
      options: [
        { value: 'منخفضة', label: 'منخفضة' },
        { value: 'متوسطة', label: 'متوسطة' },
        { value: 'عالية', label: 'عالية' },
        { value: 'حرجة', label: 'حرجة' },
      ],
    },
    {
      key: 'status',
      label: 'حالة أمر الصيانة',
      type: 'select',
      required: true,
      options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
    },
    { key: 'technicianNames', label: 'المهندسون والفنيون المكلفون', type: 'text', required: true },
    { key: 'technicianCount', label: 'عدد الفنيين', type: 'number', required: true, min: 1 },
    { key: 'laborHours', label: 'ساعات العمل', type: 'number', required: true, min: 0 },
    { key: 'hourlyRate', label: 'تكلفة الساعة (ج.م)', type: 'number', required: true, min: 0 },
    {
      key: 'partId',
      label: 'قطعة الغيار المستخدمة',
      type: 'select',
      options: [
        { value: '', label: 'بدون قطع غيار' },
        ...state.spareParts.map((p) => ({
          value: p.id,
          label: `${p.partCode} — ${p.partName} (${p.unitCost} ج.م)`,
        })),
      ],
    },
    { key: 'partQty', label: 'كمية قطع الغيار', type: 'number', min: 0 },
    { key: 'consumablesCost', label: 'تكلفة المستهلكات والزيوت (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'transportAndOpCost', label: 'تكلفة النقل والتشغيل (ج.م)', type: 'number', required: true, min: 0 },
  ];

  const getPartFields = (): CrudFieldDefinition[] => [
    { key: 'partCode', label: 'كود قطعة الغيار', type: 'text', required: true, placeholder: 'SP-201' },
    { key: 'partName', label: 'اسم قطعة الغيار', type: 'text', required: true, placeholder: 'رولمان بلي محوري' },
    { key: 'unit', label: 'وحدة القياس', type: 'text', required: true, placeholder: 'قطعة / متر / طقم' },
    { key: 'unitCost', label: 'سعر الوحدة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'openingStock', label: 'رصيد أول المدة', type: 'number', required: true, min: 0 },
    { key: 'inboundQty', label: 'الكمية الواردة', type: 'number', required: true, min: 0 },
    { key: 'outboundQty', label: 'الكمية المنصرفة', type: 'number', required: true, min: 0 },
    { key: 'damagedQty', label: 'التالف / المرتجع', type: 'number', required: true, min: 0 },
    { key: 'avgDailyConsumption', label: 'معدل الاستهلاك اليومي', type: 'number', required: true, min: 0, step: '0.1' },
    { key: 'supplyLeadDays', label: 'فترة التوريد (أيام)', type: 'number', required: true, min: 1 },
    { key: 'safetyStock', label: 'مخزون الأمان', type: 'number', required: true, min: 0 },
    { key: 'targetStockLevel', label: 'المستوى المستهدف للمخزون', type: 'number', required: true, min: 1 },
  ];

  const getTechnicianFields = (): CrudFieldDefinition[] => [
    { key: 'name', label: 'اسم المهندس / الفني', type: 'text', required: true, placeholder: 'م. أحمد محمود' },
    { key: 'specialty', label: 'التخصص الفني', type: 'text', required: true, placeholder: 'ميكانيكا صوامع / تحكم آلي PLC' },
    { key: 'hourlyWage', label: 'أجر الساعة القياسي (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'phone', label: 'رقم الهاتف', type: 'text', required: true, placeholder: '01012345678' },
    { key: 'isActive', label: 'نشط بالخدمة', type: 'checkbox' },
  ];

  const getGrainMovementFields = (): CrudFieldDefinition[] => [
    { key: 'documentNumber', label: 'رقم المستند المخزني', type: 'text', required: true, placeholder: 'GRN-2026-01' },
    { key: 'date', label: 'تاريخ الحركة', type: 'date', required: true },
    { key: 'siloName', label: 'الصومعة / الشونة', type: 'text', required: true },
    { key: 'grainType', label: 'نوع الحبوب', type: 'text', required: true, placeholder: 'قمح تمويني محلي / مستورد' },
    {
      key: 'movementType',
      label: 'نوع الحركة',
      type: 'select',
      required: true,
      options: [
        { value: 'رصيد افتتاحي', label: 'رصيد افتتاحي' },
        { value: 'وارد', label: 'وارد' },
        { value: 'منصرف', label: 'منصرف' },
        { value: 'فاقد طبيعي', label: 'فاقد طبيعي' },
        { value: 'فاقد تشغيلي', label: 'فاقد تشغيلي' },
        { value: 'جرد فعلي', label: 'جرد فعلي' },
      ],
    },
    { key: 'originalWeightTons', label: 'الوزن الأصلي القائم (طن)', type: 'number', required: true, min: 0, step: '0.01' },
    { key: 'actualMoisturePct', label: 'نسبة الرطوبة الفعلية %', type: 'number', required: true, min: 0, step: '0.1' },
    { key: 'referenceMoisturePct', label: 'نسبة الرطوبة المرجعية %', type: 'number', required: true, min: 0, step: '0.1' },
    { key: 'actualPhysicalCountTons', label: 'الجرد الفعلي إن وجد (طن)', type: 'number', min: 0, step: '0.01' },
    { key: 'notes', label: 'ملاحظات اللجنة الفنية', type: 'textarea', colSpan: 2 },
  ];

  const handleModalSubmit = (values: Record<string, any>): string | null => {
    if (!formModalState) return null;
    const nowIso = new Date().toISOString();
    const { mode, entityKey, targetId } = formModalState;

    if (entityKey === 'asset') {
      const code = String(values.assetCode || '').trim();
      const name = String(values.name || '').trim();
      if (!code || !name) return 'يرجى إدخال كود واسم الصومعة أو المعدة.';
      const duplicate = state.assets.some(
        (a) => a.assetCode === code && (mode === 'add' || a.id !== targetId)
      );
      if (duplicate) return `كود الأصل (${code}) مسجل مسبقاً في هذا الفرع.`;

      if (mode === 'add') {
        const created: GrainAsset = {
          id: `${branchId}-asset-${Date.now()}`,
          branchId,
          assetCode: code,
          name,
          assetType: values.assetType as GrainAsset['assetType'],
          locationSite: String(values.locationSite || `مجمع صوامع ${branchName}`).trim(),
          siloOrWarehouseName: String(values.siloOrWarehouseName || name).trim(),
          manufacturer: 'معتمد محلياً',
          model: 'STD-2026',
          serialNumber: `SN-${Date.now().toString().slice(-6)}`,
          supplyDate: nowIso.split('T')[0],
          installDate: nowIso.split('T')[0],
          purchaseValue: Number(values.purchaseValue) || 0,
          ratedCapacityTonPerHour: Number(values.ratedCapacityTonPerHour) || 0,
          operationalStatus: values.operationalStatus as GrainAsset['operationalStatus'],
          lastMaintenanceDate: nowIso.split('T')[0],
          nextMaintenanceDate: String(values.nextMaintenanceDate || '2027-01-01'),
          operatingLifeYears: 15,
          warrantyEndDate: '2028-01-01',
          plannedHoursPerPeriod: Math.max(1, Number(values.plannedHoursPerPeriod) || 200),
          downtimeHours: Math.max(0, Number(values.downtimeHours) || 0),
          actualProductionTons: Math.max(0, Number(values.actualProductionTons) || 0),
          designProductionTons: Math.max(1, Number(values.designProductionTons) || 1000),
          conformingTons: Math.max(0, Number(values.conformingTons) || 0),
          energyConsumptionKwh: 1200,
          fuelConsumptionLiters: 50,
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            assets: [created, ...state.assets],
            auditLogs: [appendAudit('إضافة', 'سجل الأصول والصوامع', created.id, created.name), ...state.auditLogs],
          },
          `إضافة أصل: ${created.name}`
        );
        notify('ok', `تم إضافة الأصل (${created.name}) وحفظه في قاعدة البيانات بنجاح.`);
      } else {
        const existing = state.assets.find((a) => a.id === targetId);
        if (!existing) return 'السجل غير موجود.';
        const updated: GrainAsset = {
          ...existing,
          assetCode: code,
          name,
          assetType: values.assetType as GrainAsset['assetType'],
          locationSite: String(values.locationSite || existing.locationSite).trim(),
          siloOrWarehouseName: String(values.siloOrWarehouseName || name).trim(),
          purchaseValue: Number(values.purchaseValue) || 0,
          ratedCapacityTonPerHour: Number(values.ratedCapacityTonPerHour) || 0,
          operationalStatus: values.operationalStatus as GrainAsset['operationalStatus'],
          nextMaintenanceDate: String(values.nextMaintenanceDate || existing.nextMaintenanceDate),
          plannedHoursPerPeriod: Math.max(1, Number(values.plannedHoursPerPeriod) || 200),
          downtimeHours: Math.max(0, Number(values.downtimeHours) || 0),
          actualProductionTons: Math.max(0, Number(values.actualProductionTons) || 0),
          designProductionTons: Math.max(1, Number(values.designProductionTons) || 1000),
          conformingTons: Math.max(0, Number(values.conformingTons) || 0),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            assets: state.assets.map((a) => (a.id === targetId ? updated : a)),
            auditLogs: [
              appendAudit('تعديل', 'سجل الأصول والصوامع', updated.id, `${updated.name} (${updated.operationalStatus})`, existing.name),
              ...state.auditLogs,
            ],
          },
          `تعديل أصل: ${updated.name}`
        );
        notify('ok', `تم تعديل بيانات (${updated.name}) وتحديث مؤشرات OEE تلقائياً.`);
      }
      return null;
    }

    if (entityKey === 'order') {
      const asset = state.assets.find((a) => a.id === values.assetId);
      if (!asset) return 'يرجى اختيار المعدة / الصومعة.';
      const part = state.spareParts.find((p) => p.id === values.partId);
      const partQty = Math.max(0, Number(values.partQty) || 0);
      const partsUsed =
        part && partQty > 0
          ? [{ partId: part.id, partName: part.partName, quantity: partQty, unitCost: part.unitCost }]
          : [];
      const techCount = Math.max(1, Number(values.technicianCount) || 1);
      const laborHours = Math.max(0, Number(values.laborHours) || 0);
      const hourlyRate = Math.max(0, Number(values.hourlyRate) || 0);
      const consumablesCost = Math.max(0, Number(values.consumablesCost) || 0);
      const transportAndOpCost = Math.max(0, Number(values.transportAndOpCost) || 0);

      const costs = computeMaintenanceOrderCost({
        technicianCount: techCount,
        laborHours,
        hourlyRate,
        partsUsed,
        consumablesCost,
        transportAndOpCost,
        indirectOverheadPercent: state.settings.defaultIndirectOverheadPct,
        taxPercent: state.settings.defaultTaxPct,
      });

      if (mode === 'add') {
        const order: MaintenanceOrder = {
          id: `${branchId}-mo-${Date.now()}`,
          branchId,
          orderNumber: String(values.orderNumber || `MNT-${Date.now().toString().slice(-5)}`).trim(),
          requestDate: String(values.requestDate || nowIso.split('T')[0]),
          siteName: asset.locationSite,
          assetId: asset.id,
          maintenanceType: values.maintenanceType as MaintenanceOrder['maintenanceType'],
          faultDescription: String(values.faultDescription || '').trim(),
          severity: values.severity as MaintenanceOrder['severity'],
          stopStartDate: nowIso.slice(0, 16),
          technicianCount: techCount,
          technicianNames: String(values.technicianNames || 'مهندس الصيانة').trim(),
          laborHours,
          hourlyRate,
          consumablesCost,
          transportAndOpCost,
          indirectOverheadPercent: state.settings.defaultIndirectOverheadPct,
          taxPercent: state.settings.defaultTaxPct,
          partsUsed,
          ...costs,
          status: (values.status as MaintenanceOrderStatus) || 'جديد',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const nextParts =
          part && partQty > 0
            ? state.spareParts.map((sp) =>
                sp.id === part.id ? { ...sp, outboundQty: sp.outboundQty + partQty, updatedAt: nowIso } : sp
              )
            : state.spareParts;
        onChangeState(
          {
            ...state,
            orders: [order, ...state.orders],
            spareParts: nextParts,
            auditLogs: [
              appendAudit('إضافة', 'أوامر الصيانة', order.id, `${order.orderNumber} — ${order.totalRepairCost} ج.م`),
              ...state.auditLogs,
            ],
          },
          `إضافة أمر صيانة: ${order.orderNumber}`
        );
        notify('ok', `تم إضافة أمر الصيانة (${order.orderNumber}) واحتساب التكلفة (${order.totalRepairCost} ج.م).`);
      } else {
        const existing = state.orders.find((o) => o.id === targetId);
        if (!existing) return 'أمر الصيانة غير موجود.';
        const updated: MaintenanceOrder = {
          ...existing,
          orderNumber: String(values.orderNumber || existing.orderNumber).trim(),
          requestDate: String(values.requestDate || existing.requestDate),
          siteName: asset.locationSite,
          assetId: asset.id,
          maintenanceType: values.maintenanceType as MaintenanceOrder['maintenanceType'],
          faultDescription: String(values.faultDescription || '').trim(),
          severity: values.severity as MaintenanceOrder['severity'],
          technicianCount: techCount,
          technicianNames: String(values.technicianNames || existing.technicianNames).trim(),
          laborHours,
          hourlyRate,
          consumablesCost,
          transportAndOpCost,
          partsUsed: partsUsed.length > 0 ? partsUsed : existing.partsUsed,
          ...costs,
          status: (values.status as MaintenanceOrderStatus) || existing.status,
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            orders: state.orders.map((o) => (o.id === targetId ? updated : o)),
            auditLogs: [
              appendAudit('تعديل', 'أوامر الصيانة', updated.id, `${updated.orderNumber} — ${updated.totalRepairCost} ج.م`),
              ...state.auditLogs,
            ],
          },
          `تعديل أمر صيانة: ${updated.orderNumber}`
        );
        notify('ok', `تم تحديث أمر الصيانة (${updated.orderNumber}) وإعادة حساب التكاليف.`);
      }
      return null;
    }

    if (entityKey === 'part') {
      const partCode = String(values.partCode || '').trim();
      const partName = String(values.partName || '').trim();
      if (!partCode || !partName) return 'يرجى إدخال كود واسم قطعة الغيار.';
      const item: SparePartItem = {
        id: mode === 'add' ? `${branchId}-sp-${Date.now()}` : String(targetId),
        branchId,
        partCode,
        partName,
        unit: String(values.unit || 'قطعة').trim(),
        unitCost: Math.max(0, Number(values.unitCost) || 0),
        openingStock: Math.max(0, Number(values.openingStock) || 0),
        inboundQty: Math.max(0, Number(values.inboundQty) || 0),
        outboundQty: Math.max(0, Number(values.outboundQty) || 0),
        damagedQty: Math.max(0, Number(values.damagedQty) || 0),
        avgDailyConsumption: Math.max(0, Number(values.avgDailyConsumption) || 0),
        supplyLeadDays: Math.max(1, Number(values.supplyLeadDays) || 1),
        safetyStock: Math.max(0, Number(values.safetyStock) || 0),
        targetStockLevel: Math.max(1, Number(values.targetStockLevel) || 20),
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          spareParts:
            mode === 'add'
              ? [item, ...state.spareParts]
              : state.spareParts.map((sp) => (sp.id === targetId ? item : sp)),
          auditLogs: [
            appendAudit(mode === 'add' ? 'إضافة' : 'تعديل', 'مخزون قطع الغيار', item.id, `${item.partCode} — ${item.partName}`),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} قطعة غيار: ${item.partName}`
      );
      notify('ok', `تم ${mode === 'add' ? 'إضافة' : 'تعديل'} قطعة الغيار (${item.partName}) بنجاح.`);
      return null;
    }

    if (entityKey === 'technician') {
      const name = String(values.name || '').trim();
      if (!name) return 'يرجى إدخال اسم المهندس أو الفني.';
      const tech: MaintenanceTechnician = {
        id: mode === 'add' ? `${branchId}-tech-${Date.now()}` : String(targetId),
        branchId,
        name,
        specialty: String(values.specialty || 'صيانة عامة').trim(),
        hourlyWage: Math.max(0, Number(values.hourlyWage) || 0),
        phone: String(values.phone || '').trim(),
        isActive: values.isActive !== false,
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          technicians:
            mode === 'add'
              ? [tech, ...state.technicians]
              : state.technicians.map((t) => (t.id === targetId ? tech : t)),
          auditLogs: [
            appendAudit(mode === 'add' ? 'إضافة' : 'تعديل', 'سجل الفنيين والمهندسين', tech.id, `${tech.name} (${tech.specialty})`),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} فني/مهندس: ${tech.name}`
      );
      notify('ok', `تم ${mode === 'add' ? 'إضافة' : 'تعديل'} بيانات الفني/المهندس (${tech.name}).`);
      return null;
    }

    if (entityKey === 'grain_movement') {
      const origTons = Math.max(0, Number(values.originalWeightTons) || 0);
      const actMoist = Math.max(0, Number(values.actualMoisturePct) || 0);
      const refMoist = Math.max(0, Number(values.referenceMoisturePct) || state.settings.defaultReferenceMoisturePct || 12);
      const corrected = computeMoistureCorrectedWeight(origTons, actMoist, refMoist);
      const mType = values.movementType as GrainMovementRecord['movementType'];
      const rec: GrainMovementRecord = {
        id: mode === 'add' ? `${branchId}-gm-${Date.now()}` : String(targetId),
        branchId,
        documentNumber: String(values.documentNumber || '').trim(),
        date: String(values.date || nowIso.split('T')[0]),
        siloName: String(values.siloName || '').trim(),
        grainType: String(values.grainType || 'قمح تمويني').trim(),
        movementType: mType,
        originalWeightTons: origTons,
        actualMoisturePct: actMoist,
        referenceMoisturePct: refMoist,
        correctedWeightTons: corrected,
        actualPhysicalCountTons:
          mType === 'جرد فعلي' || Number(values.actualPhysicalCountTons) > 0
            ? Number(values.actualPhysicalCountTons)
            : undefined,
        notes: String(values.notes || 'احتساب رطوبة آلي بالمعادلة المرجعية'),
        updatedAt: nowIso,
      };
      onChangeState(
        {
          ...state,
          grainMovements:
            mode === 'add'
              ? [rec, ...state.grainMovements]
              : state.grainMovements.map((g) => (g.id === targetId ? rec : g)),
          auditLogs: [
            appendAudit(
              mode === 'add' ? 'إضافة' : 'تعديل',
              'حركات الحبوب والرطوبة',
              rec.id,
              `${rec.documentNumber} — مصحح ${corrected} طن`
            ),
            ...state.auditLogs,
          ],
        },
        `${mode === 'add' ? 'إضافة' : 'تعديل'} حركة حبوب: ${rec.documentNumber}`
      );
      notify('ok', `تم ${mode === 'add' ? 'تسجيل' : 'تعديل'} حركة الحبوب (${rec.documentNumber}) بالوزن المصحح (${corrected} طن).`);
      return null;
    }

    return null;
  };

  const handleConfirmDelete = () => {
    if (!deleteModalState) return;
    const { entityType, entityId, entityTitle } = deleteModalState;
    const check = checkGrainDeleteIntegrity(state, entityType, entityId);
    if (!check.canDelete) {
      notify('err', check.reason || 'لا يمكن حذف هذا السجل لارتباطه بسجلات أخرى.');
      return;
    }

    if (entityType === 'asset') {
      onChangeState(
        {
          ...state,
          assets: state.assets.filter((a) => a.id !== entityId),
          auditLogs: [appendAudit('حذف', 'سجل الأصول والصوامع', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف أصل: ${entityTitle}`
      );
    } else if (entityType === 'order') {
      onChangeState(
        {
          ...state,
          orders: state.orders.filter((o) => o.id !== entityId),
          auditLogs: [appendAudit('حذف', 'أوامر الصيانة', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف أمر صيانة: ${entityTitle}`
      );
    } else if (entityType === 'part') {
      onChangeState(
        {
          ...state,
          spareParts: state.spareParts.filter((p) => p.id !== entityId),
          auditLogs: [appendAudit('حذف', 'مخزون قطع الغيار', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف قطعة غيار: ${entityTitle}`
      );
    } else if (entityType === 'technician') {
      onChangeState(
        {
          ...state,
          technicians: state.technicians.filter((t) => t.id !== entityId),
          auditLogs: [appendAudit('حذف', 'سجل الفنيين والمهندسين', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف فني/مهندس: ${entityTitle}`
      );
    } else if (entityType === 'grain_movement') {
      onChangeState(
        {
          ...state,
          grainMovements: state.grainMovements.filter((g) => g.id !== entityId),
          auditLogs: [appendAudit('حذف', 'حركات الحبوب والرطوبة', entityId, entityTitle), ...state.auditLogs],
        },
        `حذف حركة حبوب: ${entityTitle}`
      );
    }

    notify('ok', `تم حذف (${entityTitle}) وتحديث الجداول والمؤشرات في قاعدة البيانات.`);
  };

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetCode.trim() || !assetName.trim()) {
      notify('err', 'يرجى إدخال كود واسم الأصل/الصومعة.');
      return;
    }
    const nowIso = new Date().toISOString();
    const created: GrainAsset = {
      id: `${branchId}-asset-${Date.now()}`,
      branchId,
      assetCode: assetCode.trim(),
      name: assetName.trim(),
      assetType,
      locationSite: assetSite,
      siloOrWarehouseName: assetName.trim(),
      manufacturer: 'معتمد محلياً',
      model: 'STD-2026',
      serialNumber: `SN-${Date.now().toString().slice(-6)}`,
      supplyDate: nowIso.split('T')[0],
      installDate: nowIso.split('T')[0],
      purchaseValue: 1000000,
      ratedCapacityTonPerHour: 80,
      operationalStatus: 'عاملة',
      lastMaintenanceDate: nowIso.split('T')[0],
      nextMaintenanceDate: '2027-01-01',
      operatingLifeYears: 15,
      warrantyEndDate: '2028-01-01',
      plannedHoursPerPeriod: 200,
      downtimeHours: 0,
      actualProductionTons: 1000,
      designProductionTons: 1200,
      conformingTons: 995,
      energyConsumptionKwh: 1200,
      fuelConsumptionLiters: 50,
      updatedAt: nowIso,
    };
    onChangeState(
      {
        ...state,
        assets: [...state.assets, created],
        auditLogs: [appendAudit('إضافة', 'سجل الأصول والصوامع', created.id, created.name), ...state.auditLogs],
      },
      `إضافة أصل: ${created.name}`
    );
    setAssetCode('');
    setAssetName('');
    notify('ok', `تم إضافة الأصل (${created.name}) إلى سجل الصوامع والمعدات.`);
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const asset = state.assets.find((a) => a.id === orderAssetId);
    const part = state.spareParts.find((p) => p.id === orderPartId);
    if (!asset || !orderFault.trim()) {
      notify('err', 'يرجى اختيار المعدة ووصف العطل.');
      return;
    }
    const nowIso = new Date().toISOString();
    const partsUsed =
      part && orderPartQty > 0
        ? [{ partId: part.id, partName: part.partName, quantity: orderPartQty, unitCost: part.unitCost }]
        : [];
    const costs = computeMaintenanceOrderCost({
      technicianCount: 1,
      laborHours: orderHours,
      hourlyRate: orderHourlyRate,
      partsUsed,
      consumablesCost: orderConsumables,
      transportAndOpCost: 0,
      indirectOverheadPercent: state.settings.defaultIndirectOverheadPct,
      taxPercent: state.settings.defaultTaxPct,
    });
    const order: MaintenanceOrder = {
      id: `${branchId}-mo-${Date.now()}`,
      branchId,
      orderNumber: `MNT-${Date.now().toString().slice(-5)}`,
      requestDate: nowIso.split('T')[0],
      siteName: asset.locationSite,
      assetId: asset.id,
      maintenanceType: orderType,
      faultDescription: orderFault.trim(),
      severity: 'متوسطة',
      stopStartDate: nowIso.slice(0, 16),
      technicianCount: 1,
      technicianNames: state.technicians[0]?.name || 'مهندس الصيانة',
      laborHours: orderHours,
      hourlyRate: orderHourlyRate,
      consumablesCost: orderConsumables,
      transportAndOpCost: 0,
      indirectOverheadPercent: state.settings.defaultIndirectOverheadPct,
      taxPercent: state.settings.defaultTaxPct,
      partsUsed,
      ...costs,
      status: 'جديد',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const nextParts =
      part && orderPartQty > 0
        ? state.spareParts.map((sp) =>
            sp.id === part.id ? { ...sp, outboundQty: sp.outboundQty + orderPartQty, updatedAt: nowIso } : sp
          )
        : state.spareParts;

    onChangeState(
      {
        ...state,
        orders: [order, ...state.orders],
        spareParts: nextParts,
        auditLogs: [
          appendAudit('إضافة', 'أوامر الصيانة', order.id, `${order.orderNumber} — تكلفة ${order.totalRepairCost} ج.م`),
          ...state.auditLogs,
        ],
      },
      `إضافة أمر صيانة: ${order.orderNumber}`
    );
    setOrderFault('');
    notify('ok', `تم إنشاء أمر الصيانة (${order.orderNumber}) وحساب التكلفة الكلية آلياً.`);
  };

  const handleAdvanceOrderStatus = (orderId: string, nextStatus: MaintenanceOrderStatus) => {
    const nowIso = new Date().toISOString();
    onChangeState(
      {
        ...state,
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, status: nextStatus, updatedAt: nowIso } : o
        ),
        auditLogs: [appendAudit('تعديل', 'حالة أمر الصيانة', orderId, nextStatus), ...state.auditLogs],
      },
      `تحديث حالة أمر صيانة إلى ${nextStatus}`
    );
    notify('ok', `تم تحديث حالة أمر الصيانة إلى (${nextStatus}).`);
  };

  const handleAddGrainMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gmDocNo.trim()) {
      notify('err', 'يرجى إدخال رقم المستند المخزني للحبوب.');
      return;
    }
    const nowIso = new Date().toISOString();
    const rec: GrainMovementRecord = {
      id: `${branchId}-gm-${Date.now()}`,
      branchId,
      documentNumber: gmDocNo.trim(),
      date: nowIso.split('T')[0],
      siloName: gmSilo,
      grainType: 'قمح تمويني',
      movementType: gmType,
      originalWeightTons: gmOriginalTons,
      actualMoisturePct: gmActualMoisture,
      referenceMoisturePct: gmRefMoisture,
      correctedWeightTons: previewCorrectedWeight,
      actualPhysicalCountTons: gmType === 'جرد فعلي' ? gmPhysicalCount : undefined,
      notes: 'احتساب رطوبة آلي بالمعادلة المرجعية',
      updatedAt: nowIso,
    };
    onChangeState(
      {
        ...state,
        grainMovements: [rec, ...state.grainMovements],
        auditLogs: [
          appendAudit('إضافة', 'حركات الحبوب والرطوبة', rec.id, `${rec.documentNumber} — مصحح ${previewCorrectedWeight} طن`),
          ...state.auditLogs,
        ],
      },
      `إضافة حركة حبوب: ${rec.documentNumber}`
    );
    setGmDocNo('');
    notify('ok', `تم تسجيل حركة الحبوب (${rec.documentNumber}) بالوزن المصحح (${previewCorrectedWeight} طن).`);
  };

  const navGroups: Array<{
    groupTitle: string;
    items: Array<{ id: GrainSubView; label: string; icon: React.ReactNode; count?: number }>;
  }> = [
    {
      groupTitle: '1. الشون والقمح والمطاحن وحصص الدقيق',
      items: [
        { id: 'dashboard', label: 'لوحة التحكم الشاملة', icon: <Wrench className="w-3.5 h-3.5" /> },
        { id: 'shunas', label: 'الشون وتقييم الأصول', icon: <Warehouse className="w-3.5 h-3.5" />, count: (state.shunas || []).length },
        { id: 'wheat_receipts_book', label: 'دفتر استلام القمح اليومي', icon: <FileText className="w-3.5 h-3.5" />, count: (state.wheatReceipts || []).length },
        { id: 'mills', label: 'قاعدة بيانات المطاحن', icon: <Factory className="w-3.5 h-3.5" />, count: (state.mills || []).length },
        { id: 'flour_quotas', label: 'حصص الدقيق والمخابز', icon: <Wheat className="w-3.5 h-3.5" />, count: (state.flourQuotaMaster || []).length },
      ],
    },
    {
      groupTitle: '2. الثلاجات والصوامع وأوامر الصيانة',
      items: [
        { id: 'refrigerators', label: 'قاعدة بيانات الثلاجات', icon: <ThermometerSnowflake className="w-3.5 h-3.5" />, count: (state.refrigerators || []).length },
        { id: 'assets', label: 'الصوامع والمعدات OEE', icon: <Warehouse className="w-3.5 h-3.5" />, count: (state.assets || []).length },
        { id: 'orders', label: 'أوامر الصيانة المركزية', icon: <Cog className="w-3.5 h-3.5" />, count: (state.orders || []).length },
        { id: 'parts', label: 'قطع الغيار والفنيون', icon: <Cog className="w-3.5 h-3.5" />, count: (state.spareParts || []).length },
        { id: 'grain_moisture', label: 'معادلة تصحيح الرطوبة', icon: <Droplets className="w-3.5 h-3.5" />, count: (state.grainMovements || []).length },
      ],
    },
    {
      groupTitle: '3. الحسابات والتقارير والتنبيهات',
      items: [
        { id: 'financials', label: 'الحسابات والتقييم المالي', icon: <Landmark className="w-3.5 h-3.5" />, count: (state.centralFinancialLedger || []).length },
        { id: 'reports', label: 'مركز التقارير الرسمية', icon: <FileBarChart2 className="w-3.5 h-3.5" />, count: 7 },
        { id: 'alerts', label: 'التنبيهات الذكية', icon: <AlertTriangle className="w-3.5 h-3.5" />, count: smartAlerts.length },
        { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-3.5 h-3.5" /> },
        { id: 'audit', label: 'سجل التدقيق', icon: <History className="w-3.5 h-3.5" />, count: (state.auditLogs || []).length },
      ],
    },
  ];

  const activeDeleteCheck = useMemo(() => {
    if (!deleteModalState) return { canDelete: true };
    return checkGrainDeleteIntegrity(state, deleteModalState.entityType, deleteModalState.entityId);
  }, [deleteModalState, state]);

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-maintenance-suite">
      {/* Executive Header & Categorized Sub-Navigation matching InternalTradeSuite */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#0A1931] text-white flex items-center justify-center shadow-xs shrink-0">
              <Wrench className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-600">
                  مديرية التموين والتجارة الداخلية بالغربية · إدارة تموين مركز المحلة الكبرى
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#0A1931] text-[10px] font-black border border-slate-200">
                  قطاع صيانة الحبوب والمطاحن
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-[#0A1931]">
                {resolveCustomTableTitle(
                  systemConfig,
                  'grain_shunas_mills',
                  'منظومة قسم صيانة الحبوب المتكاملة (الشون • استلام القمح • الثلاجات • المطاحن • حصص الدقيق)'
                )}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubView('wheat_receipts_book')}
              className="px-3 py-2 bg-[#0A1931] hover:bg-[#13294B] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition"
            >
              <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>دفتر استلام القمح اليومي</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('mills')}
              className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition"
            >
              <Factory className="w-3.5 h-3.5" />
              <span>قاعدة بيانات المطاحن</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('reports')}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>مركز التقارير الرسمية A4 و Excel</span>
            </button>

            <SectionFactoryResetButton
              currentUser={currentUser}
              sectionLabel="صيانة الحبوب والشون والمطاحن"
              branchName={branchName}
              onConfirm={onFactoryResetSection}
              testId="grain-factory-reset-btn"
            />
          </div>
        </div>

        {/* Unified Top Responsive KPI Cards Grid matching InternalTradeSuite */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-start">
            <div className="text-[11px] font-bold text-slate-600">الشون التموينية ومحاضر القمح</div>
            <div className="text-lg font-black text-[#0A1931] font-mono tabular-nums mt-0.5">
              {(state.shunas || []).length.toLocaleString('en-US')} شونة
            </div>
            <div className="text-[10px] font-bold text-slate-600 mt-0.5 font-mono tabular-nums">
              {(state.wheatReceipts || []).length.toLocaleString('en-US')} محضر استلام قمح
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-start">
            <div className="text-[11px] font-bold text-slate-600">المطاحن والثلاجات التموينية</div>
            <div className="text-lg font-black text-[#0A1931] font-mono tabular-nums mt-0.5">
              {(state.mills || []).length.toLocaleString('en-US')} مطحن
            </div>
            <div className="text-[10px] font-bold text-slate-600 mt-0.5 font-mono tabular-nums">
              {(state.refrigerators || []).length.toLocaleString('en-US')} ثلاجة ومخزن تبريد
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-start">
            <div className="text-[11px] font-bold text-slate-600">حصص الدقيق للمخابز</div>
            <div className="text-lg font-black text-teal-800 font-mono tabular-nums mt-0.5">
              {(state.flourQuotaMaster || []).length.toLocaleString('en-US')} مخبز
            </div>
            <div className="text-[10px] font-bold text-teal-700 mt-0.5">
              ربط حي بالحصص والاستخراج
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-start">
            <div className="text-[11px] font-bold text-slate-600">أوامر الصيانة والتنبيهات</div>
            <div className="text-lg font-black text-amber-800 font-mono tabular-nums mt-0.5">
              {(state.orders || []).length.toLocaleString('en-US')} أمر صيانة
            </div>
            <div className="text-[10px] font-bold text-rose-700 mt-0.5 font-mono tabular-nums">
              {smartAlerts.length.toLocaleString('en-US')} تنبيه هندسي ورقابي نشط
            </div>
          </div>
        </div>

        {/* Categorized Sub-Navigation Tabs */}
        <div className="pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {navGroups.map((grp) => (
            <div
              key={grp.groupTitle}
              className="bg-slate-50/90 border border-slate-200 rounded-xl p-2 space-y-1.5"
            >
              <div className="text-[11px] font-black text-[#0A1931] px-2 py-0.5 rounded-md bg-slate-200/70 inline-block">
                {grp.groupTitle}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {grp.items.map((item) => {
                  const isActive = subView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSubView(item.id);
                        setTableSearch('');
                        setTablePage(1);
                      }}
                      data-testid={`grain-nav-${item.id}`}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                        isActive
                          ? 'bg-[#0A1931] text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-[#0A1931] border border-slate-300'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      {typeof item.count === 'number' && (
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                            isActive
                              ? 'bg-[#D4AF37] text-[#0A1931] font-black'
                              : 'bg-slate-200 text-[#0A1931] font-bold'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          data-testid="grain-feedback-banner"
          className={`p-3 rounded-xl border text-xs font-black flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
              : 'bg-rose-50 border-rose-400 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Unified ReportToolbar above active Grain Maintenance tables */}
      <ReportToolbar
        title="قسم صيانة الحبوب — الجداول التشغيلية والتقارير الرسمية"
        subtitle={`الشون • القمح • الثلاجات • المطاحن • حصص الدقيق (${branchName})`}
        count={
          (state.shunas || []).length +
          (state.mills || []).length +
          (state.refrigerators || []).length +
          (state.flourQuotaMaster || []).length
        }
        countLabel="سجل"
        testIdPrefix={`grain-${subView}`}
        onExportExcel={
          permissions.canExport
            ? () =>
                exportRowsToArabicCsv(
                  `صيانة_الحبوب_${branchName}`,
                  ['الكود', 'اسم الشونة', 'الوحدة المحلية', 'القرية', 'السعة (طن)', 'الرصيد الدفتري (طن)'],
                  (state.shunas || []).map((sh) => {
                    const bal = computeShunaBookBalanceAndValuation({
                      shuna: sh,
                      wheatReceipts: state.wheatReceipts || [],
                      wheatIssues: state.wheatIssues || [],
                    });
                    return [
                      sh.shunaCode || sh.id,
                      sh.shunaName,
                      sh.localUnit || 'غير محدد',
                      sh.village || 'غير محدد',
                      sh.storageCapacityTons || 0,
                      bal.currentBookBalanceTons || 0,
                    ];
                  })
                )
            : undefined
        }
        onPrint={
          permissions.canPrint
            ? () =>
                printModuleReportA4({
                  title: `التقرير الرسمي الموحد لقسم صيانة الحبوب (${branchName})`,
                  subtitle: 'الشون التموينية والمطاحن والثلاجات وحصص الدقيق',
                  branchName,
                  headers: ['الكود', 'اسم الشونة', 'الوحدة المحلية', 'القرية', 'السعة التخزينية (طن)', 'الرصيد الدفتري (طن)'],
                  rows: (state.shunas || []).map((sh) => {
                    const bal = computeShunaBookBalanceAndValuation({
                      shuna: sh,
                      wheatReceipts: state.wheatReceipts || [],
                      wheatIssues: state.wheatIssues || [],
                    });
                    return [
                      sh.shunaCode || sh.id,
                      sh.shunaName,
                      sh.localUnit || 'غير محدد',
                      sh.village || 'غير محدد',
                      sh.storageCapacityTons || 0,
                      bal.currentBookBalanceTons || 0,
                    ];
                  }),
                  summaryItems: [
                    { label: 'عدد الشون التموينية', value: String((state.shunas || []).length) },
                    { label: 'محاضر استلام القمح', value: String((state.wheatReceipts || []).length) },
                    { label: 'المطاحن التموينية', value: String((state.mills || []).length) },
                    { label: 'حصص الدقيق للمخابز', value: String((state.flourQuotaMaster || []).length) },
                  ],
                  preparedBy: currentUser?.fullName,
                })
            : undefined
        }
        onExportPdf={
          permissions.canPrint
            ? () => setSubView('reports')
            : undefined
        }
      />

      <ErrorBoundary key={subView} fallbackTitle="تعذر عرض جدول قسم صيانة الحبوب مؤقتاً دون تأثر باقي المنظومة">
      {subView === 'shunas' && (
        <ShunasAndWheatReceiptsView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          currentUser={currentUser}
          permissions={permissions}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canEdit={permissions.canEdit}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          villages={villages}
          initialTab="shunas"
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'wheat_receipts_book' && (
        <ShunasAndWheatReceiptsView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          currentUser={currentUser}
          permissions={permissions}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canEdit={permissions.canEdit}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          villages={villages}
          initialTab="receipts_book"
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'refrigerators' && (
        <RefrigeratorsDatabaseView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          currentUser={currentUser}
          permissions={permissions}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          villages={villages}
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'mills' && (
        <MillsDatabaseView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          currentUser={currentUser}
          permissions={permissions}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          villages={villages}
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'flour_quotas' && (
        <FlourQuotasDatabaseView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          currentUser={currentUser}
          permissions={permissions}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          bakeries={bakeries}
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'financials' && (
        <GrainFinancialsAndReportsView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          initialMode="financials"
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'reports' && (
        <GrainFinancialsAndReportsView
          state={state}
          branchName={branchName}
          currentUserFullName={currentUser?.fullName || 'مستخدم المنظومة'}
          isViewer={isViewer}
          canAdd={permissions.canAdd}
          canPrint={permissions.canPrint}
          canExport={permissions.canExport}
          initialMode="reports"
          onUpdateState={handleUpdateGrainSubState}
          onNotify={notify}
        />
      )}

      {subView === 'dashboard' && (
        <div className="space-y-4">
          {/* المؤشرات التنفيذية الكبرى لقسم صيانة الحبوب */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              onClick={() => setSubView('shunas')}
              className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm cursor-pointer hover:border-amber-400 transition-all"
            >
              <div className="text-xs font-bold text-slate-500">
                الشون وأرصدة القمح المعتمدة ({(state.shunas || []).length} شونة)
              </div>
              <div className="text-2xl font-black text-amber-800 font-mono mt-1">
                {totalShunaApprovedWheatTons.toLocaleString('ar-EG')} طن
              </div>
              <div className="text-[11px] font-bold text-emerald-700">
                أذون استلام القمح: {(state.wheatReceipts || []).length} إذن رسمي
              </div>
            </div>

            <div
              onClick={() => setSubView('refrigerators')}
              className="bg-white p-4 rounded-2xl border border-sky-200 shadow-sm cursor-pointer hover:border-sky-400 transition-all"
            >
              <div className="text-xs font-bold text-slate-500">
                قاعدة بيانات الثلاجات ومخازن التبريد
              </div>
              <div className="text-2xl font-black text-sky-800 font-mono mt-1">
                {(state.refrigerators || []).length} ثلاجة
              </div>
              <div className="text-[11px] font-bold text-slate-600">
                إجمالي غرف التبريد والتجميد المسجلة: {(state.refrigeratorRooms || []).length} غرفة
              </div>
            </div>

            <div
              onClick={() => setSubView('mills')}
              className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm cursor-pointer hover:border-indigo-400 transition-all"
            >
              <div className="text-xs font-bold text-slate-500">
                المطاحن التموينية ونسب الاستخراج (82%)
              </div>
              <div className="text-2xl font-black text-indigo-900 font-mono mt-1">
                {(state.mills || []).length} مطحن
              </div>
              <div className="text-[11px] font-bold text-emerald-700">
                القدرة اليومية: {(state.mills || []).reduce((s, m) => s + m.dailyMillingCapacityTons, 0)} طن/يوم
              </div>
            </div>

            <div
              onClick={() => setSubView('flour_quotas')}
              className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-sm cursor-pointer hover:border-emerald-400 transition-all"
            >
              <div className="text-xs font-bold text-slate-500">
                حصص الدقيق المربوطة بالمخابز
              </div>
              <div className="text-2xl font-black text-emerald-800 font-mono mt-1">
                {totalDailyFlourQuotaTons} طن/يوم
              </div>
              <div className="text-[11px] font-bold text-slate-600">
                عدد الحصص: {(state.flourQuotaMaster || []).length} مخبز • التنبيهات: {smartAlerts.length}
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <h3 className="text-sm font-black text-[#0A1628]">مقارنة كفاءة المعدات OEE (%) ونسبة الإتاحة</h3>
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assetOeeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="الإتاحة" fill="#1E40AF" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="الكفاءة_OEE" fill="#0D9488" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {subView === 'assets' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="سجل الصوامع والشون والمعدات الهندسية"
            subtitle="إدارة كاملة للأصول ومؤشرات الكفاءة الكلية للمعدات (OEE) والاعتمادية"
            count={state.assets.length}
            addLabel="إضافة صومعة / معدة جديدة"
            permissions={permissions}
            testIdPrefix="grain-assets"
            onAddClick={() =>
              setFormModalState({
                isOpen: true,
                mode: 'add',
                entityKey: 'asset',
                title: 'إضافة صومعة أو معدة جديدة',
                fields: getAssetFields(),
                initialValues: {
                  assetCode: `SILO-${100 + state.assets.length + 1}`,
                  name: '',
                  assetType: 'صومعة',
                  locationSite: `مجمع صوامع ${branchName}`,
                  siloOrWarehouseName: `صومعة ${branchName}`,
                  operationalStatus: 'عاملة',
                  ratedCapacityTonPerHour: 80,
                  purchaseValue: 1200000,
                  plannedHoursPerPeriod: 200,
                  downtimeHours: 4,
                  actualProductionTons: 1100,
                  designProductionTons: 1200,
                  conformingTons: 1090,
                  nextMaintenanceDate: '2027-01-01',
                },
              })
            }
          />

          {permissions.canAdd && (
            <form onSubmit={handleAddAsset} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
              <input type="text" value={assetCode} onChange={(e) => setAssetCode(e.target.value)} placeholder="كود الأصل *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="اسم الصومعة / المعدة *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
              <select value={assetType} onChange={(e) => setAssetType(e.target.value as GrainAsset['assetType'])} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                <option value="صومعة">صومعة</option>
                <option value="شونة">شونة</option>
                <option value="مصعد">مصعد</option>
                <option value="سير ناقل">سير ناقل</option>
                <option value="غربال ومنقي">غربال ومنقي</option>
                <option value="ميزان">ميزان</option>
              </select>
              <input type="text" value={assetSite} onChange={(e) => setAssetSite(e.target.value)} placeholder="الموقع" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold" />
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" />
                <span>إضافة سريعة</span>
              </button>
            </form>
          )}

          <SmartTableSearchBar
            query={tableSearch}
            onQueryChange={(q) => {
              setTableSearch(q);
              setTablePage(1);
            }}
            totalMatches={state.assets.filter((a) =>
              matchesSmartSearch(tableSearch, [a.assetCode, a.name, a.assetType, a.locationSite, a.operationalStatus])
            ).length}
            totalAll={state.assets.length}
            placeholder="بحث ذكي بالكود أو اسم الصومعة/المعدة أو الموقع أو الحالة..."
            testId="grain-assets-search"
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            {(() => {
              const filteredAssets = state.assets.filter((a) =>
                matchesSmartSearch(tableSearch, [a.assetCode, a.name, a.assetType, a.locationSite, a.operationalStatus])
              );
              const pagedAssets = tablePageSize >= 999999
                ? filteredAssets
                : filteredAssets.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);
              const avgAvail = filteredAssets.length
                ? Number((filteredAssets.reduce((s, a) => s + (computeEquipmentKpis(a, state.orders).availabilityPct || 0), 0) / filteredAssets.length).toFixed(1))
                : 0;
              const avgOee = filteredAssets.length
                ? Number((filteredAssets.reduce((s, a) => s + (computeEquipmentKpis(a, state.orders).oeePct || 0), 0) / filteredAssets.length).toFixed(1))
                : 0;
              return (
                <>
                  <table className="w-full text-xs text-center border-collapse compact-erp-table">
                    <thead className="bg-[#0A1628] text-white font-black">
                      <tr>
                        <th className="py-2 px-2 border border-slate-700">الكود</th>
                        <th className="py-2 px-2 border border-slate-700 text-right">المعدة / الصومعة</th>
                        <th className="py-2 px-2 border border-slate-700">النوع والموقع</th>
                        <th className="py-2 px-2 border border-slate-700">الإتاحة %</th>
                        <th className="py-2 px-2 border border-slate-700">OEE %</th>
                        <th className="py-2 px-2 border border-slate-700">MTBF / MTTR</th>
                        <th className="py-2 px-2 border border-slate-700">الحالة التشغيلية</th>
                        <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold">
                      {pagedAssets.map((a) => {
                        const kpi = computeEquipmentKpis(a, state.orders);
                        const openEdit = () =>
                          setFormModalState({
                            isOpen: true,
                            mode: 'edit',
                            entityKey: 'asset',
                            targetId: a.id,
                            title: `تعديل بيانات الأصل: ${a.name}`,
                            fields: getAssetFields(),
                            initialValues: { ...a },
                          });
                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-mono">{a.assetCode}</td>
                            <td className="py-2 px-2 text-right font-black text-[#0A1628]">{a.name}</td>
                            <td className="py-2 px-2 text-slate-600">{a.assetType} — {a.locationSite}</td>
                            <td className="py-2 px-2 font-mono text-[#1E40AF]">{kpi.availabilityPct ?? '—'}%</td>
                            <td className="py-2 px-2 font-mono text-[#0D9488] font-black">{kpi.oeePct ?? '—'}%</td>
                            <td className="py-2 px-2 font-mono">
                              {kpi.mtbfHours ?? '—'} س / {kpi.mttrHours ?? '—'} س
                            </td>
                            <td className="py-2 px-2">{a.operationalStatus}</td>
                            <td className="py-2 px-2">
                              <ModuleRowActions
                                entityLabel={a.name}
                                updatedAt={a.updatedAt}
                                permissions={permissions}
                                testIdPrefix={`grain-asset-${a.id}`}
                                onView={() =>
                                  setProfileModalState({
                                    isOpen: true,
                                    title: a.name,
                                    subtitle: `${a.assetCode} — ${a.assetType} (${a.locationSite})`,
                                    entityType: 'أصل هندسي / صومعة',
                                    onEdit: openEdit,
                                    fields: [
                                      { label: 'كود الأصل', value: a.assetCode },
                                      { label: 'الاسم', value: a.name },
                                      { label: 'النوع', value: a.assetType },
                                      { label: 'الموقع الهندسي', value: a.locationSite },
                                      { label: 'الحالة التشغيلية', value: a.operationalStatus },
                                      { label: 'القدرة التصميمية (طن/ساعة)', value: `${a.ratedCapacityTonPerHour} طن/ساعة` },
                                      { label: 'القيمة الدفترية', value: `${a.purchaseValue.toLocaleString('ar-EG')} ج.م` },
                                      { label: 'نسبة الإتاحة', value: `${kpi.availabilityPct ?? 0}%` },
                                      { label: 'كفاءة المعدات OEE', value: `${kpi.oeePct ?? 0}%` },
                                      { label: 'تاريخ الصيانة القادمة', value: a.nextMaintenanceDate },
                                    ],
                                  })
                                }
                                onEdit={openEdit}
                                onDelete={() =>
                                  setDeleteModalState({
                                    isOpen: true,
                                    entityType: 'asset',
                                    entityTitle: a.name,
                                    entityId: a.id,
                                    recordSummary: [
                                      { label: 'كود الأصل', value: a.assetCode },
                                      { label: 'الاسم', value: a.name },
                                      { label: 'النوع', value: a.assetType },
                                      { label: 'الحالة التشغيلية', value: a.operationalStatus },
                                    ],
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <VillageGrandTotalRow
                        totalCount={filteredAssets.length}
                        labelColSpan={3}
                        title="الإجمالي والمتوسط العام للصوامع والمعدات TOTAL"
                        metricCells={[
                          { content: `متوسط الإتاحة: ${avgAvail}%`, mono: true },
                          { content: `متوسط OEE: ${avgOee}%`, mono: true },
                          { content: `إجمالي القدرة: ${filteredAssets.reduce((s, a) => s + (a.ratedCapacityTonPerHour || 0), 0)} طن/س`, colSpan: 3, mono: true },
                        ]}
                      />
                    </tbody>
                  </table>
                  <TablePaginationBar
                    currentPage={tablePage}
                    pageSize={tablePageSize}
                    totalItems={filteredAssets.length}
                    onPageChange={setTablePage}
                    onPageSizeChange={(sz) => {
                      setTablePageSize(sz);
                      setTablePage(1);
                    }}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {subView === 'orders' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="سجل أوامر الصيانة الوقائية والعلاجية والتكاليف"
            subtitle="حساب آلي لتكلفة العمالة، قطع الغيار، التكاليف المباشرة وغير المباشرة والضرائب"
            count={state.orders.length}
            addLabel="إضافة أمر صيانة جديد"
            permissions={permissions}
            testIdPrefix="grain-orders"
            onAddClick={() =>
              setFormModalState({
                isOpen: true,
                mode: 'add',
                entityKey: 'order',
                title: 'فتح أمر صيانة هندسي جديد',
                fields: getOrderFields(),
                initialValues: {
                  orderNumber: `MNT-${Date.now().toString().slice(-5)}`,
                  requestDate: new Date().toISOString().split('T')[0],
                  assetId: state.assets[0]?.id || '',
                  maintenanceType: 'علاجية طارئة',
                  faultDescription: '',
                  severity: 'متوسطة',
                  status: 'جديد',
                  technicianNames: state.technicians[0]?.name || 'مهندس الصيانة',
                  technicianCount: 1,
                  laborHours: 6,
                  hourlyRate: 120,
                  partId: state.spareParts[0]?.id || '',
                  partQty: 1,
                  consumablesCost: 250,
                  transportAndOpCost: 0,
                },
              })
            }
          />

          {permissions.canAdd && (
            <form onSubmit={handleAddOrder} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-7 gap-2 text-xs">
              <select value={orderAssetId} onChange={(e) => setOrderAssetId(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value as MaintenanceOrder['maintenanceType'])} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                <option value="وقائية">وقائية</option>
                <option value="علاجية طارئة">علاجية طارئة</option>
                <option value="معايرة موازين">معايرة موازين</option>
              </select>
              <input type="text" value={orderFault} onChange={(e) => setOrderFault(e.target.value)} placeholder="وصف العطل *" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold sm:col-span-2" />
              <input type="number" value={orderHours} onChange={(e) => setOrderHours(Number(e.target.value) || 0)} placeholder="ساعات" className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
              <select value={orderPartId} onChange={(e) => setOrderPartId(e.target.value)} className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                {state.spareParts.map((p) => <option key={p.id} value={p.id}>{p.partName}</option>)}
              </select>
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                فتح أمر سريع
              </button>
            </form>
          )}

          <SmartTableSearchBar
            query={tableSearch}
            onQueryChange={(q) => {
              setTableSearch(q);
              setTablePage(1);
            }}
            totalMatches={state.orders.filter((o) => {
              const asset = state.assets.find((a) => a.id === o.assetId);
              return matchesSmartSearch(tableSearch, [o.orderNumber, asset?.name, o.faultDescription, o.maintenanceType, o.status, o.technicianNames]);
            }).length}
            totalAll={state.orders.length}
            placeholder="بحث برقم الأمر أو المعدة أو العطل أو الحالة أو الفني..."
            testId="grain-orders-search"
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            {(() => {
              const filteredOrders = state.orders.filter((o) => {
                const asset = state.assets.find((a) => a.id === o.assetId);
                return matchesSmartSearch(tableSearch, [o.orderNumber, asset?.name, o.faultDescription, o.maintenanceType, o.status, o.technicianNames]);
              });
              const pagedOrders = tablePageSize >= 999999
                ? filteredOrders
                : filteredOrders.slice((tablePage - 1) * tablePageSize, tablePage * tablePageSize);
              const totalLaborAndParts = filteredOrders.reduce((s, o) => s + (o.laborCost || 0) + (o.partsCost || 0), 0);
              const totalDirect = filteredOrders.reduce((s, o) => s + (o.directCost || 0), 0);
              const totalFinal = filteredOrders.reduce((s, o) => s + (o.totalRepairCost || 0), 0);
              return (
                <>
                  <table className="w-full text-xs text-center border-collapse compact-erp-table">
                    <thead className="bg-[#0A1628] text-white font-black">
                      <tr>
                        <th className="py-2 px-2 border border-slate-700">رقم الأمر</th>
                        <th className="py-2 px-2 border border-slate-700 text-right">المعدة والوصف</th>
                        <th className="py-2 px-2 border border-slate-700">العمالة + قطع الغيار</th>
                        <th className="py-2 px-2 border border-slate-700">المباشرة / غير المباشرة</th>
                        <th className="py-2 px-2 border border-slate-700">الإجمالي النهائي</th>
                        <th className="py-2 px-2 border border-slate-700">الحالة</th>
                        <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold">
                      {pagedOrders.map((o) => {
                        const asset = state.assets.find((a) => a.id === o.assetId);
                        const openEdit = () =>
                          setFormModalState({
                            isOpen: true,
                            mode: 'edit',
                            entityKey: 'order',
                            targetId: o.id,
                            title: `تعديل أمر الصيانة: ${o.orderNumber}`,
                            fields: getOrderFields(),
                            initialValues: {
                              ...o,
                              partId: o.partsUsed[0]?.partId || '',
                              partQty: o.partsUsed[0]?.quantity || 0,
                            },
                          });
                        return (
                          <tr key={o.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-mono">{o.orderNumber}</td>
                            <td className="py-2 px-2 text-right">
                              <div className="font-black text-[#0A1628]">{asset?.name || o.assetId}</div>
                              <div className="text-[11px] text-slate-500">{o.faultDescription}</div>
                            </td>
                            <td className="py-2 px-2 font-mono">{o.laborCost} + {o.partsCost} ج.م</td>
                            <td className="py-2 px-2 font-mono">{o.directCost} / {o.indirectCost} ج.م</td>
                            <td className="py-2 px-2 font-mono font-black text-rose-700">{o.totalRepairCost.toLocaleString()} ج.م</td>
                            <td className="py-2 px-2">
                              <select
                                disabled={!permissions.canEdit}
                                value={o.status}
                                onChange={(e) => handleAdvanceOrderStatus(o.id, e.target.value as MaintenanceOrderStatus)}
                                className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-[11px] font-black cursor-pointer"
                              >
                                {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                              </select>
                            </td>
                            <td className="py-2 px-2">
                              <ModuleRowActions
                                entityLabel={o.orderNumber}
                                updatedAt={o.updatedAt}
                                permissions={permissions}
                                testIdPrefix={`grain-order-${o.id}`}
                                onView={() =>
                                  setProfileModalState({
                                    isOpen: true,
                                    title: `أمر صيانة رقم ${o.orderNumber}`,
                                    subtitle: `${asset?.name || o.assetId} — ${o.maintenanceType}`,
                                    entityType: 'أمر صيانة هندسي',
                                    onEdit: openEdit,
                                    fields: [
                                      { label: 'رقم الأمر', value: o.orderNumber },
                                      { label: 'تاريخ الطلب', value: o.requestDate },
                                      { label: 'المعدة / الصومعة', value: asset?.name || o.assetId },
                                      { label: 'نوع الصيانة', value: o.maintenanceType },
                                      { label: 'درجة الخطورة', value: o.severity },
                                      { label: 'الحالة', value: o.status },
                                      { label: 'الفنيون المكلفون', value: o.technicianNames },
                                      { label: 'تكلفة العمالة', value: `${o.laborCost} ج.م` },
                                      { label: 'تكلفة قطع الغيار', value: `${o.partsCost} ج.م` },
                                      { label: 'التكلفة الكلية للإصلاح', value: `${o.totalRepairCost.toLocaleString('ar-EG')} ج.م` },
                                      { label: 'وصف العطل', value: o.faultDescription },
                                    ],
                                  })
                                }
                                onEdit={openEdit}
                                onDelete={() =>
                                  setDeleteModalState({
                                    isOpen: true,
                                    entityType: 'order',
                                    entityTitle: o.orderNumber,
                                    entityId: o.id,
                                    recordSummary: [
                                      { label: 'رقم الأمر', value: o.orderNumber },
                                      { label: 'المعدة', value: asset?.name || o.assetId },
                                      { label: 'التكلفة الكلية', value: `${o.totalRepairCost} ج.م` },
                                      { label: 'الحالة', value: o.status },
                                    ],
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <VillageGrandTotalRow
                        totalCount={filteredOrders.length}
                        labelColSpan={2}
                        title="الإجمالي العام لأوامر الصيانة والتكاليف TOTAL"
                        metricCells={[
                          { content: `${totalLaborAndParts.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: `${totalDirect.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: `${totalFinal.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: '—', colSpan: 2 },
                        ]}
                      />
                    </tbody>
                  </table>
                  <TablePaginationBar
                    currentPage={tablePage}
                    pageSize={tablePageSize}
                    totalItems={filteredOrders.length}
                    onPageChange={setTablePage}
                    onPageSizeChange={(sz) => {
                      setTablePageSize(sz);
                      setTablePage(1);
                    }}
                  />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {subView === 'parts' && (
        <div className="space-y-5">
          {/* Spare Parts Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="مخزون قطع الغيار ونقطة إعادة الطلب"
              subtitle="متابعة الرصيد المتاح، حد إعادة الطلب، والكميات المطلوب شراؤها"
              count={state.spareParts.length}
              addLabel="إضافة قطعة غيار جديدة"
              permissions={permissions}
              testIdPrefix="grain-parts"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'part',
                  title: 'إضافة قطعة غيار جديدة للمخزن الهندسي',
                  fields: getPartFields(),
                  initialValues: {
                    partCode: `SP-${200 + state.spareParts.length + 1}`,
                    partName: '',
                    unit: 'قطعة',
                    unitCost: 450,
                    openingStock: 10,
                    inboundQty: 5,
                    outboundQty: 2,
                    damagedQty: 0,
                    avgDailyConsumption: 0.5,
                    supplyLeadDays: 7,
                    safetyStock: 3,
                    targetStockLevel: 25,
                  },
                })
              }
            />

            <SmartTableSearchBar
              query={tableSearch}
              onQueryChange={(q) => {
                setTableSearch(q);
                setTablePage(1);
              }}
              totalMatches={state.spareParts.filter((sp) =>
                matchesSmartSearch(tableSearch, [sp.partCode, sp.partName, sp.unit])
              ).length}
              totalAll={state.spareParts.length}
              placeholder="بحث بكود أو اسم قطعة الغيار أو اسم الفني..."
              testId="grain-parts-search"
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              {(() => {
                const filteredParts = state.spareParts.filter((sp) =>
                  matchesSmartSearch(tableSearch, [sp.partCode, sp.partName, sp.unit])
                );
                const totalBalance = filteredParts.reduce((s, sp) => s + computeSparePartStatus(sp).availableBalance, 0);
                const totalNeeded = filteredParts.reduce((s, sp) => s + computeSparePartStatus(sp).neededQty, 0);
                return (
                  <table className="w-full text-xs text-center border-collapse compact-erp-table">
                    <thead className="bg-[#0A1628] text-white font-black">
                      <tr>
                        <th className="py-2 px-2 border border-slate-700">الكود</th>
                        <th className="py-2 px-2 border border-slate-700 text-right">اسم قطعة الغيار</th>
                        <th className="py-2 px-2 border border-slate-700">سعر الوحدة</th>
                        <th className="py-2 px-2 border border-slate-700">الرصيد المتاح</th>
                        <th className="py-2 px-2 border border-slate-700">حد إعادة الطلب</th>
                        <th className="py-2 px-2 border border-slate-700">الكمية المطلوب شراؤها</th>
                        <th className="py-2 px-2 border border-slate-700">حالة التنبيه</th>
                        <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold">
                      {filteredParts.map((sp) => {
                        const st = computeSparePartStatus(sp);
                        const openEdit = () =>
                          setFormModalState({
                            isOpen: true,
                            mode: 'edit',
                            entityKey: 'part',
                            targetId: sp.id,
                            title: `تعديل قطعة الغيار: ${sp.partName}`,
                            fields: getPartFields(),
                            initialValues: { ...sp },
                          });
                        return (
                          <tr key={sp.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-mono">{sp.partCode}</td>
                            <td className="py-2 px-2 text-right font-black text-[#0A1628]">{sp.partName}</td>
                            <td className="py-2 px-2 font-mono">{sp.unitCost} ج.م</td>
                            <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{st.availableBalance}</td>
                            <td className="py-2 px-2 font-mono">{st.reorderPoint}</td>
                            <td className="py-2 px-2 font-mono">{st.neededQty}</td>
                            <td className="py-2 px-2">
                              {st.needsReorder ? (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-900 rounded-md text-[11px] font-black">
                                  يلزم إعادة طلب
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-md text-[11px] font-black">
                                  متوافر
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <ModuleRowActions
                                entityLabel={sp.partName}
                                updatedAt={sp.updatedAt}
                                permissions={permissions}
                                testIdPrefix={`grain-part-${sp.id}`}
                                onView={() =>
                                  setProfileModalState({
                                    isOpen: true,
                                    title: sp.partName,
                                    subtitle: `كود قطعة الغيار: ${sp.partCode}`,
                                    entityType: 'قطعة غيار هندسية',
                                    onEdit: openEdit,
                                    fields: [
                                      { label: 'كود القطعة', value: sp.partCode },
                                      { label: 'اسم قطعة الغيار', value: sp.partName },
                                      { label: 'وحدة القياس', value: sp.unit },
                                      { label: 'سعر الوحدة', value: `${sp.unitCost} ج.م` },
                                      { label: 'الرصيد المتاح', value: st.availableBalance },
                                      { label: 'حد إعادة الطلب', value: st.reorderPoint },
                                      { label: 'الكمية المطلوب شراؤها', value: st.neededQty },
                                    ],
                                  })
                                }
                                onEdit={openEdit}
                                onDelete={() =>
                                  setDeleteModalState({
                                    isOpen: true,
                                    entityType: 'part',
                                    entityTitle: sp.partName,
                                    entityId: sp.id,
                                    recordSummary: [
                                      { label: 'الكود', value: sp.partCode },
                                      { label: 'الاسم', value: sp.partName },
                                      { label: 'الرصيد المتاح', value: st.availableBalance },
                                    ],
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <VillageGrandTotalRow
                        totalCount={filteredParts.length}
                        labelColSpan={3}
                        title="الإجمالي العام لقطع الغيار TOTAL"
                        metricCells={[
                          { content: `${totalBalance} قطعة`, mono: true },
                          { content: '—' },
                          { content: `${totalNeeded} مطلوب`, mono: true },
                          { content: '—', colSpan: 2 },
                        ]}
                      />
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          {/* Maintenance Technicians Table */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل المهندسين والفنيين المختصين بالصيانة"
              subtitle="متابعة التخصصات الهندسية، أجر الساعة، وأرقام التواصل"
              count={state.technicians.length}
              addLabel="إضافة مهندس / فني جديد"
              permissions={permissions}
              testIdPrefix="grain-technicians"
              onAddClick={() =>
                setFormModalState({
                  isOpen: true,
                  mode: 'add',
                  entityKey: 'technician',
                  title: 'إضافة مهندس أو فني صيانة جديد',
                  fields: getTechnicianFields(),
                  initialValues: {
                    name: '',
                    specialty: 'ميكانيكا صوامع وموازين',
                    hourlyWage: 125,
                    phone: '01012345678',
                    isActive: true,
                  },
                })
              }
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse compact-erp-table">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700 text-right">اسم المهندس / الفني</th>
                    <th className="py-2 px-2 border border-slate-700">التخصص</th>
                    <th className="py-2 px-2 border border-slate-700">أجر الساعة</th>
                    <th className="py-2 px-2 border border-slate-700">رقم الهاتف</th>
                    <th className="py-2 px-2 border border-slate-700">الحالة</th>
                    <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.technicians
                    .filter((tech) => matchesSmartSearch(tableSearch, [tech.name, tech.specialty, tech.phone]))
                    .map((tech) => {
                      const openEdit = () =>
                        setFormModalState({
                          isOpen: true,
                          mode: 'edit',
                          entityKey: 'technician',
                          targetId: tech.id,
                          title: `تعديل بيانات الفني: ${tech.name}`,
                          fields: getTechnicianFields(),
                          initialValues: { ...tech },
                        });
                      return (
                        <tr key={tech.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2 text-right font-black text-[#0A1628]">{tech.name}</td>
                          <td className="py-2 px-2">{tech.specialty}</td>
                          <td className="py-2 px-2 font-mono text-[#0D9488]">{tech.hourlyWage} ج.م</td>
                          <td className="py-2 px-2 font-mono">{tech.phone}</td>
                          <td className="py-2 px-2">{tech.isActive ? 'نشط' : 'غير نشط'}</td>
                          <td className="py-2 px-2">
                            <ModuleRowActions
                              entityLabel={tech.name}
                              updatedAt={tech.updatedAt}
                              permissions={permissions}
                              testIdPrefix={`grain-tech-${tech.id}`}
                              onView={() =>
                                setProfileModalState({
                                  isOpen: true,
                                  title: tech.name,
                                  subtitle: tech.specialty,
                                  entityType: 'مهندس / فني صيانة',
                                  onEdit: openEdit,
                                  fields: [
                                    { label: 'الاسم', value: tech.name },
                                    { label: 'التخصص', value: tech.specialty },
                                    { label: 'أجر الساعة', value: `${tech.hourlyWage} ج.م` },
                                    { label: 'رقم الهاتف', value: tech.phone },
                                    { label: 'الحالة', value: tech.isActive ? 'نشط' : 'غير نشط' },
                                  ],
                                })
                              }
                              onEdit={openEdit}
                              onDelete={() =>
                                setDeleteModalState({
                                  isOpen: true,
                                  entityType: 'technician',
                                  entityTitle: tech.name,
                                  entityId: tech.id,
                                  recordSummary: [
                                    { label: 'الاسم', value: tech.name },
                                    { label: 'التخصص', value: tech.specialty },
                                    { label: 'أجر الساعة', value: `${tech.hourlyWage} ج.م` },
                                  ],
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  <VillageGrandTotalRow
                    totalCount={state.technicians.length}
                    labelColSpan={2}
                    title="الإجمالي العام للمهندسين والفنيين TOTAL"
                    metricCells={[
                      { content: `${state.technicians.reduce((s, t) => s + (t.hourlyWage || 0), 0)} ج.م/س`, mono: true },
                      { content: `نشط: ${state.technicians.filter((t) => t.isActive).length}`, colSpan: 3, mono: true },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subView === 'grain_moisture' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="دفتر حركات الحبوب وتصحيح الرطوبة والفاقد"
            subtitle="الوزن المصحح = الوزن الأصلي × (100 - الرطوبة الفعلية) ÷ (100 - الرطوبة المرجعية)"
            count={state.grainMovements.length}
            addLabel="إضافة حركة حبوب جديدة"
            permissions={permissions}
            testIdPrefix="grain-movements"
            onAddClick={() =>
              setFormModalState({
                isOpen: true,
                mode: 'add',
                entityKey: 'grain_movement',
                title: 'تسجيل حركة حبوب وتصحيح الرطوبة',
                fields: getGrainMovementFields(),
                initialValues: {
                  documentNumber: `GRN-${Date.now().toString().slice(-5)}`,
                  date: new Date().toISOString().split('T')[0],
                  siloName: state.assets[0]?.siloOrWarehouseName || 'صومعة حبوب رقم 1',
                  grainType: 'قمح تمويني',
                  movementType: 'وارد',
                  originalWeightTons: 500,
                  actualMoisturePct: 13.5,
                  referenceMoisturePct: state.settings.defaultReferenceMoisturePct || 12,
                  actualPhysicalCountTons: 0,
                  notes: 'احتساب رطوبة آلي بالمعادلة المرجعية',
                },
              })
            }
          />

          {permissions.canAdd && (
            <form onSubmit={handleAddGrainMovement} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628]">
                حركة الحبوب وتصحيح الوزن حسب الرطوبة المرجعية: الوزن المصحح = الأصلي × (100 - الرطوبة الفعلية) ÷ (100 - المرجعية)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
                <input type="text" value={gmDocNo} onChange={(e) => setGmDocNo(e.target.value)} placeholder="رقم المستند *" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <select value={gmType} onChange={(e) => setGmType(e.target.value as GrainMovementRecord['movementType'])} className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold">
                  <option value="وارد">وارد</option>
                  <option value="منصرف">منصرف</option>
                  <option value="جرد فعلي">جرد فعلي</option>
                </select>
                <input type="number" step="0.1" value={gmOriginalTons} onChange={(e) => setGmOriginalTons(Number(e.target.value) || 0)} placeholder="الوزن الأصلي (طن)" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <input type="number" step="0.1" value={gmActualMoisture} onChange={(e) => setGmActualMoisture(Number(e.target.value) || 0)} placeholder="الرطوبة الفعلية %" className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
                <div className="px-3 py-2 bg-teal-50 border border-teal-300 rounded-xl font-mono font-black text-[#0D9488] flex items-center justify-center">
                  المصحح: {previewCorrectedWeight} طن
                </div>
                <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                  تسجيل سريع
                </button>
              </div>
            </form>
          )}

          <SmartTableSearchBar
            query={tableSearch}
            onQueryChange={(q) => {
              setTableSearch(q);
              setTablePage(1);
            }}
            totalMatches={state.grainMovements.filter((g) =>
              matchesSmartSearch(tableSearch, [g.documentNumber, g.date, g.siloName, g.movementType, g.grainType])
            ).length}
            totalAll={state.grainMovements.length}
            placeholder="بحث برقم المستند أو الصومعة أو نوع الحركة..."
            testId="grain-moisture-search"
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            {(() => {
              const filteredMovements = state.grainMovements.filter((g) =>
                matchesSmartSearch(tableSearch, [g.documentNumber, g.date, g.siloName, g.movementType, g.grainType])
              );
              const totalOriginal = Number(filteredMovements.reduce((s, g) => s + (g.originalWeightTons || 0), 0).toFixed(3));
              const totalCorrected = Number(filteredMovements.reduce((s, g) => s + (g.correctedWeightTons || 0), 0).toFixed(3));
              return (
                <table className="w-full text-xs text-center border-collapse compact-erp-table">
                  <thead className="bg-[#0A1628] text-white font-black">
                    <tr>
                      <th className="py-2 px-2 border border-slate-700">رقم المستند</th>
                      <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                      <th className="py-2 px-2 border border-slate-700">الصومعة / الشونة</th>
                      <th className="py-2 px-2 border border-slate-700">الحركة</th>
                      <th className="py-2 px-2 border border-slate-700">الوزن الأصلي</th>
                      <th className="py-2 px-2 border border-slate-700">الرطوبة الفعلية / المرجعية</th>
                      <th className="py-2 px-2 border border-slate-700">الوزن المصحح (طن)</th>
                      <th className="py-2 px-2 border border-slate-700">إدارة السجل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold">
                    {filteredMovements.map((g) => {
                      const openEdit = () =>
                        setFormModalState({
                          isOpen: true,
                          mode: 'edit',
                          entityKey: 'grain_movement',
                          targetId: g.id,
                          title: `تعديل حركة الحبوب: ${g.documentNumber}`,
                          fields: getGrainMovementFields(),
                          initialValues: {
                            ...g,
                            actualPhysicalCountTons: g.actualPhysicalCountTons ?? 0,
                          },
                        });
                      return (
                        <tr key={g.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2 font-mono">{g.documentNumber}</td>
                          <td className="py-2 px-2 font-mono">{g.date}</td>
                          <td className="py-2 px-2">{g.siloName}</td>
                          <td className="py-2 px-2">{g.movementType}</td>
                          <td className="py-2 px-2 font-mono">{g.originalWeightTons} طن</td>
                          <td className="py-2 px-2 font-mono">{g.actualMoisturePct}% / {g.referenceMoisturePct}%</td>
                          <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{g.correctedWeightTons} طن</td>
                          <td className="py-2 px-2">
                            <ModuleRowActions
                              entityLabel={g.documentNumber}
                              updatedAt={g.updatedAt}
                              permissions={permissions}
                              testIdPrefix={`grain-mov-${g.id}`}
                              onView={() =>
                                setProfileModalState({
                                  isOpen: true,
                                  title: `مستند حركة حبوب رقم ${g.documentNumber}`,
                                  subtitle: `${g.siloName} — ${g.movementType}`,
                                  entityType: 'حركة حبوب وتصحيح رطوبة',
                                  onEdit: openEdit,
                                  fields: [
                                    { label: 'رقم المستند', value: g.documentNumber },
                                    { label: 'التاريخ', value: g.date },
                                    { label: 'الصومعة / الشونة', value: g.siloName },
                                    { label: 'نوع الحركة', value: g.movementType },
                                    { label: 'الوزن الأصلي القائم', value: `${g.originalWeightTons} طن` },
                                    { label: 'نسبة الرطوبة الفعلية', value: `${g.actualMoisturePct}%` },
                                    { label: 'نسبة الرطوبة المرجعية', value: `${g.referenceMoisturePct}%` },
                                    { label: 'الوزن المصحح النهائي', value: `${g.correctedWeightTons} طن` },
                                    { label: 'ملاحظات', value: g.notes || '—' },
                                  ],
                                })
                              }
                              onEdit={openEdit}
                              onDelete={() =>
                                setDeleteModalState({
                                  isOpen: true,
                                  entityType: 'grain_movement',
                                  entityTitle: g.documentNumber,
                                  entityId: g.id,
                                  recordSummary: [
                                    { label: 'رقم المستند', value: g.documentNumber },
                                    { label: 'الصومعة', value: g.siloName },
                                    { label: 'نوع الحركة', value: g.movementType },
                                    { label: 'الوزن المصحح', value: `${g.correctedWeightTons} طن` },
                                  ],
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                    <VillageGrandTotalRow
                      totalCount={filteredMovements.length}
                      labelColSpan={4}
                      title="الإجمالي العام لحركات الحبوب والوزن المصحح TOTAL"
                      metricCells={[
                        { content: `${totalOriginal} طن`, mono: true },
                        { content: '—' },
                        { content: `${totalCorrected} طن`, mono: true },
                        { content: '—' },
                      ]}
                    />
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {subView === 'alerts' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
          <h3 className="text-sm font-black text-[#0A1628]">التنبيهات الذكية للصيانة وقطع الغيار والفاقد</h3>
          {smartAlerts.length === 0 ? (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-black text-emerald-900">
              كافة الصوامع والمعدات وقطع الغيار ومؤشرات الفاقد ضمن الحدود الآمنة ✓
            </div>
          ) : (
            smartAlerts.map((a, i) => (
              <div key={i} className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-black text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{a.msg}</span>
              </div>
            ))
          )}
        </div>
      )}

      {subView === 'settings' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onChangeState(
              {
                ...state,
                settings: settingsDraft,
                auditLogs: [appendAudit('تحديث إعدادات', 'إعدادات صيانة الحبوب', branchId, settingsDraft.decisionNote), ...state.auditLogs],
              },
              'تحديث إعدادات صيانة الحبوب'
            );
            notify('ok', 'تم حفظ إعدادات ومعادلات صيانة الحبوب والصوامع.');
          }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">نسبة التحميل غير المباشر %</label>
              <input type="number" step="0.5" value={settingsDraft.defaultIndirectOverheadPct} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultIndirectOverheadPct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">نسبة الضرائب %</label>
              <input type="number" step="0.5" value={settingsDraft.defaultTaxPct} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultTaxPct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الحد الأقصى المقبول للفاقد %</label>
              <input type="number" step="0.1" value={settingsDraft.maxAcceptableGrainLossPct} onChange={(e) => setSettingsDraft({ ...settingsDraft, maxAcceptableGrainLossPct: Number(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">الرطوبة المرجعية الافتراضية %</label>
              <input type="number" step="0.1" value={settingsDraft.defaultReferenceMoisturePct} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultReferenceMoisturePct: Number(e.target.value) || 12 })} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold" />
            </div>
          </div>
          {permissions.canEdit && (
            <button type="submit" className="px-5 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
              حفظ الإعدادات
            </button>
          )}
        </form>
      )}

      {subView === 'audit' && (
        <div className="space-y-4">
          <AuditLogAdminToolbar
            sliceKey="grainMaintenance"
            branchId={branchId}
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin(currentUser) || permissions.canDelete}
            totalLogsCount={(state.auditLogs || []).length}
            onAuditLogsCleared={() => {
              onChangeState(
                { ...state, auditLogs: [] },
                'تم إفراغ سجل التدقيق لقسم صيانة الحبوب بواسطة المشرف العام بعد التحقق الأمني المزدوج'
              );
            }}
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse compact-erp-table">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الوقت</th>
                  <th className="py-2 px-2 border border-slate-700">المستخدم</th>
                  <th className="py-2 px-2 border border-slate-700">الإجراء</th>
                  <th className="py-2 px-2 border border-slate-700">الجدول</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل</th>
                  {(isSuperAdmin(currentUser) || permissions.canDelete) && (
                    <th className="py-2 px-2 border border-slate-700">إجراءات الحذف</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.auditLogs.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-mono">{new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                    <td className="py-2 px-2">{a.userFullName}</td>
                    <td className="py-2 px-2 text-[#0D9488]">{a.actionType}</td>
                    <td className="py-2 px-2">{a.entityName}</td>
                    <td className="py-2 px-2 text-right">{a.afterSummary}</td>
                    {(isSuperAdmin(currentUser) || permissions.canDelete) && (
                      <td className="py-2 px-2">
                        <button
                          type="button"
                          data-testid={`grain-audit-delete-btn-${a.id}`}
                          onClick={() => {
                            onChangeState(
                              { ...state, auditLogs: state.auditLogs.filter((x) => x.id !== a.id) },
                              `حذف قيد تدقيق فردي (${a.entityName})`
                            );
                            notify('ok', 'تم حذف قيد التدقيق الفردي من سجل صيانة الحبوب بنجاح.');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 text-[11px] font-black cursor-pointer transition-colors"
                          title="حذف قيد التدقيق"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                <VillageGrandTotalRow
                  totalCount={state.auditLogs.length}
                  labelColSpan={4}
                  title="إجمالي قيود سجل التدقيق والرقابة TOTAL"
                  metricCells={[
                    { content: `${state.auditLogs.length} قيد مسجل`, colSpan: isSuperAdmin(currentUser) || permissions.canDelete ? 2 : 1, mono: true },
                  ]}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Magic Eye View Profile Modal */}
      </ErrorBoundary>

      {profileModalState && (
        <ModuleRecordProfileModal
          isOpen={profileModalState.isOpen}
          title={profileModalState.title}
          subtitle={profileModalState.subtitle}
          entityType={profileModalState.entityType}
          fields={profileModalState.fields}
          canEdit={permissions.canEdit}
          onEdit={profileModalState.onEdit}
          onClose={() => setProfileModalState(null)}
        />
      )}

      {/* Unified Add/Edit Modal */}
      {formModalState && (
        <ModuleFormModal
          isOpen={formModalState.isOpen}
          mode={formModalState.mode}
          title={formModalState.title}
          fields={formModalState.fields}
          initialValues={formModalState.initialValues}
          onClose={() => setFormModalState(null)}
          onSubmit={handleModalSubmit}
        />
      )}

      {/* Unified Delete Confirmation Modal */}
      {deleteModalState && (
        <ModuleDeleteConfirmModal
          isOpen={deleteModalState.isOpen}
          entityTitle={deleteModalState.entityTitle}
          recordSummary={deleteModalState.recordSummary}
          canDelete={activeDeleteCheck.canDelete}
          blockReason={activeDeleteCheck.reason}
          onClose={() => setDeleteModalState(null)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </div>
  );
};
