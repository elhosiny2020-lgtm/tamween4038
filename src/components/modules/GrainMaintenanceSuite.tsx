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
} from 'lucide-react';
import type { AppUser } from '../../types';
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
} from '../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../services/modulesStorage';
import {
  resolveModuleCrudPermissions,
  checkGrainDeleteIntegrity,
} from '../../utils/moduleCrudHelpers';
import {
  ModuleTableToolbar,
  ModuleRowActions,
  ModuleFormModal,
  ModuleDeleteConfirmModal,
  type CrudFieldDefinition,
} from './ModuleCrudShared';

export type GrainSubView =
  | 'dashboard'
  | 'assets'
  | 'orders'
  | 'parts'
  | 'grain_moisture'
  | 'alerts'
  | 'settings'
  | 'audit';

interface GrainMaintenanceSuiteProps {
  state: GrainMaintenanceState;
  branchId: string;
  branchName: string;
  currentUser: AppUser | null;
  initialSubView?: GrainSubView;
  onChangeState: (next: GrainMaintenanceState, actionSummary?: string) => void;
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
  initialSubView = 'dashboard',
  onChangeState,
}) => {
  const [subView, setSubView] = useState<GrainSubView>(initialSubView);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const permissions = useMemo(() => resolveModuleCrudPermissions(currentUser), [currentUser]);
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
  }, [state.spareParts, state.assets, grainSummary, state.settings.maxAcceptableGrainLossPct]);

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

  const navItems: { id: GrainSubView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة الأداء OEE', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'assets', label: 'الصوامع والأصول', icon: <Warehouse className="w-3.5 h-3.5" /> },
    { id: 'orders', label: 'أوامر الصيانة والتكلفة', icon: <Cog className="w-3.5 h-3.5" /> },
    { id: 'parts', label: 'قطع الغيار والفنيون', icon: <Cog className="w-3.5 h-3.5" /> },
    { id: 'grain_moisture', label: 'الحبوب والرطوبة والفاقد', icon: <Droplets className="w-3.5 h-3.5" /> },
    { id: 'alerts', label: `التنبيهات (${smartAlerts.length})`, icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'سجل التدقيق', icon: <History className="w-3.5 h-3.5" /> },
  ];

  const activeDeleteCheck = useMemo(() => {
    if (!deleteModalState) return { canDelete: true };
    return checkGrainDeleteIntegrity(state, deleteModalState.entityType, deleteModalState.entityId);
  }, [deleteModalState, state]);

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-maintenance-suite">
      {/* Banner */}
      <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white rounded-2xl p-5 shadow-lg border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#D4AF37] text-[#0A1628] shadow-md">
            <Wrench className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black">منظومة صيانة الحبوب والصوامع والشون ومؤشرات OEE</h2>
            <p className="text-xs text-[#5EEAD4] font-bold mt-0.5">
              {branchName} • الصوامع والمعدات · أوامر الصيانة · قطع الغيار · معادلة تصحيح الرطوبة والفاقد
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportRowsToArabicCsv(
                `صيانة_الصوامع_${branchName}`,
                ['رقم الأمر', 'التاريخ', 'الموقع', 'النوع', 'ساعات العمل', 'تكلفة العمالة', 'قطع الغيار', 'الإجمالي', 'الحالة'],
                state.orders.map((o) => [
                  o.orderNumber,
                  o.requestDate,
                  o.siteName,
                  o.maintenanceType,
                  o.laborHours,
                  o.laborCost,
                  o.partsCost,
                  o.totalRepairCost,
                  o.status,
                ])
              )
            }
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printModuleReportA4({
                title: 'تقرير صيانة الحبوب والصوامع والشون',
                subtitle: 'مؤشرات الأداء الفني، أوامر الصيانة، وتصحيح الرطوبة',
                branchName,
                headers: ['رقم الأمر', 'الموقع', 'نوع الصيانة', 'التكلفة المباشرة', 'الإجمالي', 'الحالة'],
                rows: state.orders.map((o) => [
                  o.orderNumber,
                  o.siteName,
                  o.maintenanceType,
                  `${o.directCost.toLocaleString()} ج.م`,
                  `${o.totalRepairCost.toLocaleString()} ج.م`,
                  o.status,
                ]),
                summaryItems: [
                  { label: 'الأصول المسجلة', value: String(state.assets.length) },
                  { label: 'إجمالي تكلفة الصيانة', value: `${totalMaintenanceCost.toLocaleString()} ج.م` },
                  { label: 'رصيد الحبوب الدفتري', value: `${grainSummary.bookBalanceTons} طن` },
                  { label: 'تكلفة الصيانة/طن', value: costPerTon ? `${costPerTon} ج.م` : '—' },
                ],
                preparedBy: currentUser?.fullName,
              })
            }
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/25 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#D4AF37]" />
            <span>طباعة A4</span>
          </button>
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

      {/* Nav */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap gap-1.5">
        {navItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubView(tab.id)}
            data-testid={`grain-nav-${tab.id}`}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
              subView === tab.id ? 'bg-[#0A1628] text-[#D4AF37]' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {subView === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">الأصول والصوامع المسجلة</div>
              <div className="text-2xl font-black text-[#0A1628] font-mono mt-1">{state.assets.length}</div>
              <div className="text-[11px] font-bold text-[#0D9488]">
                أوامر الصيانة: {state.orders.length}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي تكلفة الصيانة</div>
              <div className="text-2xl font-black text-rose-700 font-mono mt-1">
                {totalMaintenanceCost.toLocaleString()} ج.م
              </div>
              <div className="text-[11px] font-bold text-slate-500">
                تكلفة الصيانة/طن: {costPerTon ? `${costPerTon} ج.م` : 'لا توجد كمية'}
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">رصيد الحبوب الدفتري المصحح</div>
              <div className="text-2xl font-black text-[#0D9488] font-mono mt-1">
                {grainSummary.bookBalanceTons.toLocaleString()} طن
              </div>
              <div className="text-[11px] font-bold text-amber-700">
                الفاقد المسجل: {grainSummary.recordedLossTons} طن
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">التنبيهات الهندسية والمخزنية</div>
              <div className="text-2xl font-black text-amber-700 font-mono mt-1">{smartAlerts.length}</div>
              <div className="text-[11px] font-bold text-slate-500">قطع الغيار والمعدات والفاقد</div>
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

          {!isViewer && (
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

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
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
                {state.assets.map((a) => {
                  const kpi = computeEquipmentKpis(a, state.orders);
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
                          onEdit={() =>
                            setFormModalState({
                              isOpen: true,
                              mode: 'edit',
                              entityKey: 'asset',
                              targetId: a.id,
                              title: `تعديل بيانات الأصل: ${a.name}`,
                              fields: getAssetFields(),
                              initialValues: { ...a },
                            })
                          }
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
              </tbody>
            </table>
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

          {!isViewer && (
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

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
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
                {state.orders.map((o) => {
                  const asset = state.assets.find((a) => a.id === o.assetId);
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
                          disabled={isViewer}
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
                          onEdit={() =>
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
                            })
                          }
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
              </tbody>
            </table>
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

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
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
                  {state.spareParts.map((sp) => {
                    const st = computeSparePartStatus(sp);
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
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-900 rounded-full text-[11px] font-black">
                              يلزم إعادة طلب
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-full text-[11px] font-black">
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
                            onEdit={() =>
                              setFormModalState({
                                isOpen: true,
                                mode: 'edit',
                                entityKey: 'part',
                                targetId: sp.id,
                                title: `تعديل قطعة الغيار: ${sp.partName}`,
                                fields: getPartFields(),
                                initialValues: { ...sp },
                              })
                            }
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
                </tbody>
              </table>
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
              <table className="w-full text-xs text-center border-collapse">
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
                  {state.technicians.map((tech) => (
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
                          onEdit={() =>
                            setFormModalState({
                              isOpen: true,
                              mode: 'edit',
                              entityKey: 'technician',
                              targetId: tech.id,
                              title: `تعديل بيانات الفني: ${tech.name}`,
                              fields: getTechnicianFields(),
                              initialValues: { ...tech },
                            })
                          }
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
                  ))}
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

          {!isViewer && (
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

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
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
                {state.grainMovements.map((g) => (
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
                        onEdit={() =>
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
                          })
                        }
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
                ))}
              </tbody>
            </table>
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
          {!isViewer && (
            <button type="submit" className="px-5 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
              حفظ الإعدادات
            </button>
          )}
        </form>
      )}

      {subView === 'audit' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-[#0A1628] text-white font-black">
              <tr>
                <th className="py-2 px-2 border border-slate-700">الوقت</th>
                <th className="py-2 px-2 border border-slate-700">المستخدم</th>
                <th className="py-2 px-2 border border-slate-700">الإجراء</th>
                <th className="py-2 px-2 border border-slate-700">الجدول</th>
                <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-bold">
              {state.auditLogs.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 px-2 font-mono">{new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                  <td className="py-2 px-2">{a.userFullName}</td>
                  <td className="py-2 px-2 text-[#0D9488]">{a.actionType}</td>
                  <td className="py-2 px-2">{a.entityName}</td>
                  <td className="py-2 px-2 text-right">{a.afterSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
