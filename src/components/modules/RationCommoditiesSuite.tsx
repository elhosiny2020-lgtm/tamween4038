import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  ShoppingBasket,
  Store,
  CreditCard,
  Package,
  Warehouse,
  Truck,
  Receipt,
  ShieldAlert,
  Settings,
  History,
  Printer,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Search,
  Users,
  Flame,
  Fuel,
} from 'lucide-react';
import type {
  AppUser,
  VillageHierarchy,
} from '../../types';
import { RationMerchantsDatabaseMay2026 } from './RationMerchantsDatabaseMay2026';
import type {
  RationModuleState,
  RationMerchant,
  RationCommodity,
  RationCardRecord,
  RationBeneficiaryMember,
  RationWarehouseBalance,
  RationInventoryMovement,
  RationRequisition,
  RationDisbursementRecord,
  MerchantFinancialEntry,
  RationInspectionCampaign,
  RationComplaintRecord,
  GasCylinderRecord,
  PetroleumProductRecord,
  RationOfficeAccountingRecord,
  ModuleAuditLog,
  OutletType,
  MerchantActivityStatus,
  CommodityUnit,
  CommodityAvailabilityStatus,
} from '../../types/modules';
import {
  computeCardEntitlementSummary,
  computeWarehouseStockStatus,
  computeRequisitionTotals,
  computeMerchantFinancialStatement,
  validateAndComputeDisbursement,
  countEligibleBeneficiaries,
  computeCommodityCurrentBalance,
  computeCommodityStockValue,
  computeRemainingMonthlyQuota,
  computeMonthlyQuotaExecutionPct,
  computeDisbursedQuantityValue,
  generateSmartRationAlerts,
  round2,
} from '../../utils/rationMathEngine';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../services/modulesStorage';
import {
  checkRationDeleteIntegrity,
  resolveModuleCrudPermissions,
} from '../../utils/moduleCrudHelpers';
import {
  ModuleTableToolbar,
  ModuleRowActions,
  ModuleFormModal,
  ModuleDeleteConfirmModal,
  type CrudFieldDefinition,
} from './ModuleCrudShared';

export type RationSubView =
  | 'dashboard'
  | 'merchants'
  | 'cards'
  | 'commodities'
  | 'disbursements'
  | 'warehouses'
  | 'requisitions'
  | 'financial'
  | 'inspections'
  | 'reports'
  | 'gas_cylinders'
  | 'petroleum'
  | 'ration_accounting'
  | 'settings'
  | 'audit';

export type RationReportType =
  | 'RPT_BALANCES'
  | 'RPT_MOVEMENTS'
  | 'RPT_MONTHLY_QUOTAS'
  | 'RPT_VILLAGE_DIST'
  | 'RPT_VARIANCE'
  | 'RPT_LOW_STOCK'
  | 'RPT_EXPIRY'
  | 'RPT_VALUATION'
  | 'RPT_MERCHANT_PERF'
  | 'RPT_BENEFICIARIES';

interface RationCommoditiesSuiteProps {
  state: RationModuleState;
  branchId: string;
  branchName: string;
  villages: VillageHierarchy[];
  currentUser: AppUser | null;
  bakeriesCount?: number;
  totalBakeryDebts?: number;
  initialMode?: 'commodities' | 'internal_trade';
  initialSubView?: RationSubView;
  onChangeState: (next: RationModuleState, actionSummary?: string) => void;
}

const CHART_COLORS = ['#0D9488', '#1E40AF', '#D4AF37', '#10B981', '#F59E0B', '#EC4899'];

export const RationCommoditiesSuite: React.FC<RationCommoditiesSuiteProps> = ({
  state,
  branchId,
  branchName,
  villages,
  currentUser,
  bakeriesCount = 0,
  totalBakeryDebts = 0,
  initialMode = 'commodities',
  initialSubView,
  onChangeState,
}) => {
  const [subView, setSubView] = useState<RationSubView>(
    initialSubView || (initialMode === 'internal_trade' ? 'merchants' : 'dashboard')
  );
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Reports Center State
  const [selectedReportType, setSelectedReportType] = useState<RationReportType>('RPT_BALANCES');
  const [reportVillage, setReportVillage] = useState<string>('ALL');
  const [reportMerchantId, setReportMerchantId] = useState<string>('ALL');
  const [reportCommodityId, setReportCommodityId] = useState<string>('ALL');
  const [reportFromDate, setReportFromDate] = useState<string>('');
  const [reportToDate, setReportToDate] = useState<string>('');
  const [hiddenReportCols, setHiddenReportCols] = useState<number[]>([]);
  const [commoditySearch, setCommoditySearch] = useState<string>('');

  const permissions = useMemo(
    () => resolveModuleCrudPermissions(currentUser, false),
    [currentUser]
  );
  const isViewer = permissions.isReadOnly;

  // Generic CRUD Modal State
  const [activeModal, setActiveModal] = useState<{
    mode: 'add' | 'edit';
    entity:
      | 'merchant'
      | 'card'
      | 'member'
      | 'commodity'
      | 'disbursement'
      | 'warehouse'
      | 'movement'
      | 'requisition'
      | 'financial'
      | 'inspection'
      | 'complaint';
    title: string;
    fields: CrudFieldDefinition[];
    initialValues: Record<string, any>;
    targetId?: string;
  } | null>(null);

  // Generic Delete Confirm Modal State
  const [deleteTarget, setDeleteTarget] = useState<{
    entityTitle: string;
    summary: { label: string; value: string | number }[];
    canDelete: boolean;
    blockReason?: string;
    onConfirm: () => void;
  } | null>(null);

  // Filters
  const [merchantSearch, setMerchantSearch] = useState('');
  const [villageFilter, setVillageFilter] = useState('ALL');
  const [outletTypeFilter, setOutletTypeFilter] = useState<'ALL' | OutletType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MerchantActivityStatus>('ALL');
  const [selectedMerchantFinId, setSelectedMerchantFinId] = useState<string>(
    state.merchants[0]?.id || ''
  );
  const [selectedCardId, setSelectedCardId] = useState<string>(state.cards[0]?.id || '');

  // Quick Add Merchant Form
  const [newMerchantName, setNewMerchantName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newMerchantVillage, setNewMerchantVillage] = useState(villages[0]?.village || 'بشبيش');
  const [newMerchantOutlet, setNewMerchantOutlet] = useState<OutletType>('تاجر تمويني');
  const [newMerchantInsurance, setNewMerchantInsurance] = useState<number>(40000);
  const [newMerchantPos, setNewMerchantPos] = useState('');

  // Quick Add Commodity Price Update (with immutable priceHistory preservation)
  const [priceEditCommodityId, setPriceEditCommodityId] = useState<string>(
    state.commodities[0]?.id || ''
  );
  const [newOfficialPrice, setNewOfficialPrice] = useState<number>(
    state.commodities[0]?.officialPrice || 12.6
  );
  const [newSupplyPrice, setNewSupplyPrice] = useState<number>(
    state.commodities[0]?.supplyCostPrice || 12.1
  );
  const [priceDecisionRef, setPriceDecisionRef] = useState<string>(state.settings.decisionNumber);

  // Quick Disbursement Form
  const [disbOpNo, setDisbOpNo] = useState('');
  const [disbCardId, setDisbCardId] = useState(state.cards[0]?.id || '');
  const [disbCommodityId, setDisbCommodityId] = useState(state.commodities[0]?.id || '');
  const [disbQty, setDisbQty] = useState<number>(1);
  const [disbSupportUsed, setDisbSupportUsed] = useState<number>(12.6);

  // Quick Financial Entry Form
  const [finDocNo, setFinDocNo] = useState('');
  const [finEntryType, setFinEntryType] =
    useState<MerchantFinancialEntry['entryType']>('PAYMENT_CREDIT');
  const [finAmount, setFinAmount] = useState<number>(5000);
  const [finDesc, setFinDesc] = useState('');

  // Quick Requisition Form
  const [reqNo, setReqNo] = useState('');
  const [reqInvNo, setReqInvNo] = useState('');
  const [reqMerchantId, setReqMerchantId] = useState(state.merchants[0]?.id || '');
  const [reqCommodityId, setReqCommodityId] = useState(state.commodities[0]?.id || '');
  const [reqQty, setReqQty] = useState<number>(200);

  // Quick Inspection & Complaint Form
  const [insReportNo, setInsReportNo] = useState('');
  const [insMerchantId, setInsMerchantId] = useState(state.merchants[0]?.id || '');
  const [insViolType, setInsViolType] = useState('بيع بأزيد من السعر الرسمي');
  const [insFineVal, setInsFineVal] = useState<number>(1500);

  const [cmpCitizenName, setCmpCitizenName] = useState('');
  const [cmpDetails, setCmpDetails] = useState('');

  // Settings Editor Draft
  const [settingsDraft, setSettingsDraft] = useState(state.settings);

  const appendAudit = (
    actionType: ModuleAuditLog['actionType'],
    entityName: string,
    entityId: string,
    afterSummary: string,
    beforeSummary?: string
  ): ModuleAuditLog => ({
    id: `aud-rat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    branchId,
    module: initialMode === 'internal_trade' ? 'internal_trade' : 'commodities',
    timestamp: new Date().toISOString(),
    username: currentUser?.username || 'system',
    userFullName: currentUser?.fullName || 'مستخدم المنظومة',
    actionType,
    entityName,
    entityId,
    beforeSummary,
    afterSummary,
  });

  const notify = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Smart Alerts (7 automatic categories)
  const smartAlerts = useMemo(
    () =>
      generateSmartRationAlerts({
        commodities: state.commodities,
        warehouses: state.warehouses,
        merchants: state.merchants,
        requisitions: state.requisitions,
      }),
    [state.commodities, state.warehouses, state.merchants, state.requisitions]
  );

  // Computed KPIs & Alerts (10 Dashboard Metrics + Equations)
  const kpis = useMemo(() => {
    const activeMerchants = state.merchants.filter((m) => m.activityStatus === 'نشط').length;
    const totalCards = state.cards.filter((c) => c.status === 'سارية').length;
    const totalEligible = state.cards
      .filter((c) => c.status === 'سارية')
      .reduce((s, c) => s + countEligibleBeneficiaries(c.members), 0);
    const activeDisbursements = state.disbursements.filter((d) => !d.isReversed);
    const totalSalesValue = round2(
      activeDisbursements.reduce((s, d) => s + (d.totalSaleValue || 0), 0)
    );
    const totalSupportUsed = round2(
      activeDisbursements.reduce((s, d) => s + (d.supportDeducted || 0), 0)
    );
    const totalCommissions = round2(
      activeDisbursements.reduce((s, d) => s + (d.commissionEarned || 0), 0)
    );
    const stockValuation = round2(
      state.warehouses.reduce((s, w) => {
        const comm = state.commodities.find((c) => c.id === w.commodityId);
        return s + computeWarehouseStockStatus(w, comm?.supplyCostPrice || 0).stockValue;
      }, 0)
    );
    const warehouseAlertsCount = smartAlerts.length;

    const totalInboundQty = round2(
      state.warehouses.reduce((s, w) => s + (Number(w.totalIn) || 0), 0)
    );
    const totalOutboundQty = round2(
      state.warehouses.reduce((s, w) => s + (Number(w.totalOut) || 0), 0)
    );
    const totalRemainingStockQty = round2(
      state.warehouses.reduce(
        (s, w) =>
          s +
          computeCommodityCurrentBalance({
            openingBalance: w.openingBalance,
            inboundQty: w.totalIn,
            outboundQty: w.totalOut,
            inboundReturns: w.inboundReturns,
            outboundReturns: w.outboundReturns,
            approvedAdjustments: w.approvedAdjustments,
          }),
        0
      )
    );
    const lowStockCount = smartAlerts.filter((a) => a.category === 'LOW_STOCK').length;
    const nearExpiryCount = smartAlerts.filter((a) => a.category === 'NEAR_EXPIRY').length;

    const totalPrescribedMonthlyQuota = round2(
      state.requisitions.reduce(
        (s, r) => s + r.lines.reduce((ls, l) => ls + (Number(l.requestedQty) || 0), 0),
        0
      )
    );
    const totalDistributedMonthlyQuota = round2(
      state.requisitions.reduce(
        (s, r) => s + r.lines.reduce((ls, l) => ls + (Number(l.deliveredQty) || 0), 0),
        0
      )
    );
    const monthlyQuotaExecutionPct = computeMonthlyQuotaExecutionPct(
      totalDistributedMonthlyQuota,
      totalPrescribedMonthlyQuota
    );

    return {
      activeMerchants,
      totalMerchants: state.merchants.length,
      totalCommodities: state.commodities.length,
      totalCards,
      totalEligible,
      totalSalesValue,
      totalSupportUsed,
      totalCommissions,
      stockValuation,
      warehouseAlertsCount,
      totalInboundQty,
      totalOutboundQty,
      totalRemainingStockQty,
      lowStockCount,
      nearExpiryCount,
      totalPrescribedMonthlyQuota,
      totalDistributedMonthlyQuota,
      monthlyQuotaExecutionPct,
    };
  }, [state, smartAlerts]);

  // Chart data
  const commodityDisbChartData = useMemo(() => {
    return state.commodities.map((c) => {
      const qty = state.disbursements
        .filter((d) => d.commodityId === c.id && !d.isReversed)
        .reduce((s, d) => s + (d.quantity || 0), 0);
      const val = state.disbursements
        .filter((d) => d.commodityId === c.id && !d.isReversed)
        .reduce((s, d) => s + (d.totalSaleValue || 0), 0);
      return { name: c.name.split(' ').slice(0, 2).join(' '), الكمية: qty, القيمة: round2(val) };
    });
  }, [state.commodities, state.disbursements]);

  const outletPieData = useMemo(() => {
    const counts = new Map<string, number>();
    state.merchants.forEach((m) => {
      counts.set(m.outletType, (counts.get(m.outletType) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [state.merchants]);

  const filteredMerchants = useMemo(() => {
    return state.merchants.filter((m) => {
      if (villageFilter !== 'ALL' && m.village !== villageFilter) return false;
      if (outletTypeFilter !== 'ALL' && m.outletType !== outletTypeFilter) return false;
      if (statusFilter !== 'ALL' && m.activityStatus !== statusFilter) return false;
      if (merchantSearch.trim()) {
        const q = merchantSearch.trim().toLowerCase();
        const hay = `${m.merchantName} ${m.ownerName} ${m.posMachineNumber} ${m.licenseNumber} ${m.nationalId} ${m.commercialRegNumber} ${m.village}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.merchants, villageFilter, outletTypeFilter, statusFilter, merchantSearch]);

  const filteredCommodities = useMemo(() => {
    if (!commoditySearch.trim()) return state.commodities;
    const q = commoditySearch.trim().toLowerCase();
    return state.commodities.filter((c) =>
      `${c.code} ${c.name} ${c.category} ${c.supplierCompany} ${c.batchNumber || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [state.commodities, commoditySearch]);

  const selectedCard = useMemo(
    () => state.cards.find((c) => c.id === selectedCardId) || state.cards[0] || null,
    [state.cards, selectedCardId]
  );

  const selectedCardSummary = useMemo(() => {
    if (!selectedCard) return null;
    return computeCardEntitlementSummary(
      selectedCard,
      state.commodities,
      state.settings,
      state.disbursements
    );
  }, [selectedCard, state.commodities, state.settings, state.disbursements]);

  const selectedMerchantForFin = useMemo(
    () => state.merchants.find((m) => m.id === selectedMerchantFinId) || state.merchants[0] || null,
    [state.merchants, selectedMerchantFinId]
  );

  const selectedMerchantStatement = useMemo(() => {
    if (!selectedMerchantForFin) return null;
    return computeMerchantFinancialStatement(
      selectedMerchantForFin.openingBalance,
      state.financialEntries,
      selectedMerchantForFin.id
    );
  }, [selectedMerchantForFin, state.financialEntries]);

  const villageOptions = useMemo(
    () =>
      (villages.length > 0 ? villages : [{ village: 'بشبيش', localUnits: ['بشبيش'] }]).map((v) => ({
        value: v.village,
        label: v.village,
      })),
    [villages]
  );

  const merchantOptions = useMemo(
    () => state.merchants.map((m) => ({ value: m.id, label: `${m.merchantName} (${m.village})` })),
    [state.merchants]
  );

  const commodityOptions = useMemo(
    () => state.commodities.map((c) => ({ value: c.id, label: `${c.name} (${c.officialPrice} ج.م)` })),
    [state.commodities]
  );

  const cardOptions = useMemo(
    () => state.cards.map((c) => ({ value: c.id, label: `${c.cardNumber} — ${c.headOfFamilyName}` })),
    [state.cards]
  );

  // =========================================================================
  // Field Definitions for Modal Add / Edit across all Ration & Supply Tables
  // =========================================================================
  const merchantFields: CrudFieldDefinition[] = [
    { key: 'ownerName', label: 'اسم التاجر رباعياً', type: 'text', required: true },
    { key: 'merchantName', label: 'اسم منفذ التموين', type: 'text', required: true },
    { key: 'nationalId', label: 'الرقم القومي للتاجر (14 رقم)', type: 'text', required: true },
    { key: 'commercialRegNumber', label: 'رقم السجل التجاري', type: 'text', required: true },
    { key: 'taxCardNumber', label: 'رقم البطاقة الضريبية', type: 'text', required: true },
    { key: 'posMachineNumber', label: 'رقم منفذ التموين / ماكينة POS', type: 'text', required: true },
    {
      key: 'outletType',
      label: 'نوع المنفذ التمويني',
      type: 'select',
      required: true,
      options: [
        { value: 'تاجر تمويني', label: 'تاجر تمويني' },
        { value: 'منفذ جمعيتي', label: 'منفذ جمعيتي' },
        { value: 'مجمع استهلاكي', label: 'مجمع استهلاكي' },
      ],
    },
    { key: 'village', label: 'اسم المنطقة أو القرية', type: 'select', required: true, options: villageOptions },
    { key: 'localUnit', label: 'الوحدة المحلية', type: 'text', required: true },
    { key: 'detailedAddress', label: 'العنوان التفصيلي', type: 'text', required: true },
    { key: 'phone', label: 'رقم الهاتف', type: 'text', required: true },
    { key: 'linkedCardsCount', label: 'عدد البطاقات التموينية المسندة', type: 'number', required: true, min: 0 },
    { key: 'linkedBeneficiariesCount', label: 'عدد المستفيدين', type: 'number', required: true, min: 0 },
    { key: 'monthlyEntitlementQuota', label: 'الحصة الشهرية المستحقة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'cashInsuranceAmount', label: 'قيمة التأمين النقدي (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'openingBalance', label: 'رصيد أول المدة المالي (ج.م)', type: 'number', required: true },
    { key: 'licenseNumber', label: 'رقم الترخيص التمويني', type: 'text', required: true },
    { key: 'activityStartDate', label: 'تاريخ بداية النشاط', type: 'date', required: true },
    { key: 'licenseExpiryDate', label: 'تاريخ نهاية النشاط / الترخيص', type: 'date', required: true },
    {
      key: 'activityStatus',
      label: 'حالة النشاط',
      type: 'select',
      required: true,
      options: [
        { value: 'نشط', label: 'نشط' },
        { value: 'موقوف', label: 'موقوف' },
        { value: 'ملغي', label: 'ملغي' },
      ],
    },
  ];

  const cardFields: CrudFieldDefinition[] = [
    { key: 'cardNumber', label: 'رقم البطاقة التموينية', type: 'text', required: true },
    { key: 'headOfFamilyName', label: 'اسم رب الأسرة', type: 'text', required: true },
    { key: 'headNationalId', label: 'الرقم القومي لرب الأسرة (14 رقم)', type: 'text', required: true },
    { key: 'merchantId', label: 'المنفذ التمويني المربوطة عليه', type: 'select', required: true, options: merchantOptions },
    { key: 'village', label: 'القرية', type: 'select', required: true, options: villageOptions },
    { key: 'localUnit', label: 'الوحدة المحلية', type: 'text', required: true },
    {
      key: 'status',
      label: 'حالة البطاقة',
      type: 'select',
      required: true,
      options: [
        { value: 'سارية', label: 'سارية' },
        { value: 'موقوفة', label: 'موقوفة' },
        { value: 'تحت المراجعة', label: 'تحت المراجعة' },
      ],
    },
    { key: 'additionalGrantAmount', label: 'قيمة المنحة الإضافية (ج.م)', type: 'number', min: 0 },
    { key: 'hasAdditionalGrant', label: 'شمول البطاقة بالمنحة الإضافية', type: 'checkbox' },
  ];

  const memberFields: CrudFieldDefinition[] = [
    { key: 'fullName', label: 'اسم الفرد المستفيد رباعياً', type: 'text', required: true },
    { key: 'nationalId', label: 'الرقم القومي (14 رقم)', type: 'text', required: true },
    {
      key: 'relation',
      label: 'صلة القرابة',
      type: 'select',
      required: true,
      options: [
        { value: 'رب أسرة', label: 'رب أسرة' },
        { value: 'زوجة', label: 'زوجة' },
        { value: 'ابن', label: 'ابن' },
        { value: 'ابنة', label: 'ابنة' },
        { value: 'معال', label: 'معال' },
      ],
    },
    {
      key: 'status',
      label: 'حالة الاستحقاق',
      type: 'select',
      required: true,
      options: [
        { value: 'مستحق', label: 'مستحق' },
        { value: 'موقوف', label: 'موقوف' },
        { value: 'غير مستحق', label: 'غير مستحق' },
      ],
    },
    { key: 'suspensionReason', label: 'سبب الإيقاف (إن وجد)', type: 'text', colSpan: 2 },
  ];

  const commodityFields: CrudFieldDefinition[] = [
    { key: 'code', label: 'كود الصنف (تلقائي وفريد)', type: 'text', required: true },
    { key: 'name', label: 'اسم السلعة التموينية', type: 'text', required: true },
    { key: 'category', label: 'تصنيف السلعة', type: 'text', required: true },
    {
      key: 'unit',
      label: 'الوحدة',
      type: 'select',
      required: true,
      options: [
        { value: 'كيلو', label: 'كيلو' },
        { value: 'جرام', label: 'جرام' },
        { value: 'لتر', label: 'لتر' },
        { value: 'عبوة', label: 'عبوة' },
        { value: 'زجاجة', label: 'زجاجة' },
        { value: 'كيس', label: 'كيس' },
        { value: 'قطعة', label: 'قطعة' },
      ],
    },
    { key: 'officialPrice', label: 'سعر السلعة الرسمي (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'supplyCostPrice', label: 'تكلفة السلعة / سعر التوريد (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'openingBalance', label: 'الرصيد الافتتاحي', type: 'number', required: true, min: 0 },
    { key: 'inboundQty', label: 'الكميات الواردة', type: 'number', required: true, min: 0 },
    { key: 'outboundQty', label: 'الكميات المنصرفة', type: 'number', required: true, min: 0 },
    { key: 'reorderLevel', label: 'الحد الأدنى للمخزون', type: 'number', required: true, min: 0 },
    { key: 'maxStockLevel', label: 'الحد الأقصى للمخزون', type: 'number', required: true, min: 1 },
    { key: 'supplierCompany', label: 'اسم المورد أو الشركة الموردة', type: 'text', required: true },
    { key: 'expiryDate', label: 'تاريخ الصلاحية', type: 'date', required: true },
    { key: 'batchNumber', label: 'رقم التشغيلة', type: 'text', required: true },
    {
      key: 'availabilityStatus',
      label: 'حالة الصنف',
      type: 'select',
      required: true,
      options: [
        { value: 'متاح', label: 'متاح' },
        { value: 'غير متاح', label: 'غير متاح' },
        { value: 'موقوف', label: 'موقوف' },
      ],
    },
    { key: 'monthlyQuotaPerBeneficiary', label: 'المقرر الشهري للفرد', type: 'number', required: true, min: 0 },
    { key: 'maxPerCard', label: 'الحد الأقصى للبطاقة', type: 'number', required: true, min: 1 },
    { key: 'commissionValue', label: 'عمولة التاجر للوحدة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'decisionNumber', label: 'رقم القرار المرجعي', type: 'text', required: true, colSpan: 2 },
  ];

  const disbursementFields: CrudFieldDefinition[] = [
    { key: 'operationNumber', label: 'رقم العملية POS الفريد', type: 'text', required: true },
    { key: 'date', label: 'تاريخ الصرف', type: 'date', required: true },
    { key: 'cardId', label: 'البطاقة التموينية', type: 'select', required: true, options: cardOptions },
    { key: 'commodityId', label: 'السلعة التموينية', type: 'select', required: true, options: commodityOptions },
    { key: 'quantity', label: 'الكمية المنصرفة', type: 'number', required: true, min: 0.5 },
    { key: 'supportDeducted', label: 'قيمة الدعم المخصوم (ج.م)', type: 'number', required: true, min: 0 },
    {
      key: 'collectionMethod',
      label: 'طريقة التحصيل',
      type: 'select',
      required: true,
      options: [
        { value: 'بطاقة تموينية', label: 'بطاقة تموينية' },
        { value: 'مختلط', label: 'مختلط' },
        { value: 'نقدي', label: 'نقدي' },
      ],
    },
    { key: 'employeeName', label: 'اسم القائم بالصرف', type: 'text', required: true },
  ];

  const warehouseFields: CrudFieldDefinition[] = [
    { key: 'warehouseName', label: 'اسم المخزن / المنفذ', type: 'text', required: true },
    { key: 'merchantId', label: 'المنفذ التابع له', type: 'select', required: true, options: merchantOptions },
    { key: 'commodityId', label: 'السلعة التموينية', type: 'select', required: true, options: commodityOptions },
    { key: 'openingBalance', label: 'الرصيد الافتتاحي', type: 'number', required: true, min: 0 },
    { key: 'totalIn', label: 'إجمالي الوارد', type: 'number', required: true, min: 0 },
    { key: 'totalOut', label: 'إجمالي المنصرف', type: 'number', required: true, min: 0 },
    { key: 'inboundReturns', label: 'المرتجعات الداخلة', type: 'number', required: true, min: 0 },
    { key: 'outboundReturns', label: 'المرتجعات الخارجة', type: 'number', required: true, min: 0 },
    { key: 'approvedAdjustments', label: 'تسوية العجز والزيادة (±)', type: 'number', required: true },
    { key: 'physicalCount', label: 'الجرد الفعلي الحالي', type: 'number', required: true, min: 0 },
    { key: 'reorderLevel', label: 'الحد الأدنى للمخزون', type: 'number', required: true, min: 0 },
    { key: 'expiryDate', label: 'تاريخ الصلاحية', type: 'date' },
  ];

  const movementFields: CrudFieldDefinition[] = [
    { key: 'documentNumber', label: 'رقم المستند المخزني', type: 'text', required: true },
    { key: 'movementDate', label: 'تاريخ الحركة', type: 'date', required: true },
    {
      key: 'movementType',
      label: 'نوع الحركة المخزنية',
      type: 'select',
      required: true,
      options: [
        { value: 'RECEIPT_IN', label: 'إذن إضافة مخزنية (وارد)' },
        { value: 'DISBURSEMENT_OUT', label: 'إذن صرف مخزني (منصرف)' },
        { value: 'RETURN_IN', label: 'مرتجع داخل للمخزن' },
        { value: 'RETURN_OUT', label: 'مرتجع خارج للمورد' },
        { value: 'TRANSFER_OUT', label: 'تحويل أصناف بين المخازن (صادر)' },
        { value: 'TRANSFER_IN', label: 'تحويل أصناف بين المخازن (وارد)' },
        { value: 'ADJUSTMENT_SURPLUS', label: 'تسوية جرد (زيادة)' },
        { value: 'ADJUSTMENT_SHORTAGE', label: 'تسوية جرد (عجز)' },
      ],
    },
    { key: 'merchantId', label: 'المنفذ التمويني', type: 'select', required: true, options: merchantOptions },
    { key: 'warehouseName', label: 'اسم المخزن المصدر / المستلم', type: 'text', required: true },
    { key: 'targetWarehouseName', label: 'المخزن المحول إليه (عند التحويل)', type: 'text' },
    { key: 'supplierName', label: 'اسم المورد / شركة الجملة', type: 'text' },
    { key: 'invoiceNumber', label: 'رقم فاتورة التوريد', type: 'text' },
    { key: 'commodityId', label: 'السلعة التموينية', type: 'select', required: true, options: commodityOptions },
    { key: 'quantity', label: 'الكمية', type: 'number', required: true, min: 0.5 },
    { key: 'unitPrice', label: 'سعر الوحدة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'approvedBy', label: 'الموظف المسؤول / المعتمد', type: 'text', required: true },
    { key: 'notes', label: 'ملاحظات الحركة', type: 'text', colSpan: 2 },
  ];

  const requisitionFields: CrudFieldDefinition[] = [
    { key: 'requestNumber', label: 'رقم سجل الحصة / الاستعاضة', type: 'text', required: true },
    { key: 'invoiceNumber', label: 'رقم فاتورة الاستلام', type: 'text', required: true },
    { key: 'monthKey', label: 'الشهر والسنة (YYYY-MM)', type: 'text', required: true },
    { key: 'requestDate', label: 'تاريخ الاستلام', type: 'date', required: true },
    { key: 'merchantId', label: 'اسم التاجر / المنفذ التمويني', type: 'select', required: true, options: merchantOptions },
    { key: 'commodityId', label: 'اسم السلعة التموينية', type: 'select', required: true, options: commodityOptions },
    { key: 'requestedQty', label: 'الكمية المقررة', type: 'number', required: true, min: 1 },
    { key: 'approvedQty', label: 'الكمية المستلمة', type: 'number', required: true, min: 0 },
    { key: 'deliveredQty', label: 'الكمية الموزعة فعلياً', type: 'number', required: true, min: 0 },
    {
      key: 'status',
      label: 'حالة الصرف',
      type: 'select',
      required: true,
      options: [
        { value: 'جديد', label: 'جديد (قيد الاستلام)' },
        { value: 'معتمد', label: 'معتمد' },
        { value: 'تسليم جزئي', label: 'تسليم جزئي' },
        { value: 'مكتمل', label: 'مكتمل الصرف' },
        { value: 'مرفوض', label: 'مرفوض' },
        { value: 'ملغي', label: 'ملغي' },
      ],
    },
    { key: 'notes', label: 'ملاحظات التسويات والتعديلات', type: 'text', colSpan: 2 },
  ];

  const financialFields: CrudFieldDefinition[] = [
    { key: 'documentNumber', label: 'رقم المستند المالي الفريد', type: 'text', required: true },
    { key: 'date', label: 'تاريخ القيد', type: 'date', required: true },
    { key: 'merchantId', label: 'التاجر / المنفذ', type: 'select', required: true, options: merchantOptions },
    {
      key: 'entryType',
      label: 'نوع القيد المالي',
      type: 'select',
      required: true,
      options: [
        { value: 'PAYMENT_CREDIT', label: 'سداد / توريد نقدي (دائن)' },
        { value: 'SUPPLY_INVOICE', label: 'فاتورة بضاعة (مدين)' },
        { value: 'COMMISSION_EARNED', label: 'عمولة تاجر مستحقة' },
        { value: 'RETURN_CREDIT', label: 'مرتجع سلع (دائن)' },
        { value: 'DISCOUNT_PENALTY_DEBIT', label: 'خصم / غرامة مالية (مدين)' },
        { value: 'SETTLEMENT_CREDIT', label: 'تسوية دائنة' },
        { value: 'SETTLEMENT_DEBIT', label: 'تسوية مدينة' },
      ],
    },
    { key: 'amount', label: 'المبلغ (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'description', label: 'البيان المالي التفصيلي', type: 'text', required: true, colSpan: 2 },
  ];

  const inspectionFields: CrudFieldDefinition[] = [
    { key: 'reportNumber', label: 'رقم المحضر التمويني', type: 'text', required: true },
    { key: 'inspectionDateTime', label: 'تاريخ ووقت الحملة', type: 'datetime-local', required: true },
    { key: 'merchantId', label: 'المنفذ التمويني محل التفتيش', type: 'select', required: true, options: merchantOptions },
    { key: 'inspectorName', label: 'اسم المفتش المسؤول', type: 'text', required: true },
    { key: 'violationType', label: 'نوع المخالفة التموينية', type: 'text', required: true },
    { key: 'violationQuantity', label: 'الكمية المضبوطة / المخالفة', type: 'number', required: true, min: 0 },
    { key: 'financialValue', label: 'القيمة المالية / الغرامة (ج.م)', type: 'number', required: true, min: 0 },
    {
      key: 'inspectionResult',
      label: 'نتيجة التفتيش',
      type: 'select',
      required: true,
      options: [
        { value: 'مخالف', label: 'مخالف' },
        { value: 'مطابق', label: 'مطابق' },
        { value: 'إنذار إداري', label: 'إنذار إداري' },
      ],
    },
    {
      key: 'dispositionStatus',
      label: 'حالة التصرف القانوني',
      type: 'select',
      required: true,
      options: [
        { value: 'قيد الفحص', label: 'قيد الفحص' },
        { value: 'محال للنيابة', label: 'محال للنيابة' },
        { value: 'تم التصرف', label: 'تم التصرف' },
        { value: 'حفظ إداري', label: 'حفظ إداري' },
      ],
    },
    { key: 'legalAction', label: 'الإجراء القانوني المتخذ', type: 'text', required: true },
    { key: 'violationDescription', label: 'وصف المخالفة التفصيلي', type: 'textarea', required: true, colSpan: 2 },
  ];

  const complaintFields: CrudFieldDefinition[] = [
    { key: 'ticketNumber', label: 'رقم الشكوى / البلاغ', type: 'text', required: true },
    { key: 'date', label: 'تاريخ الورود', type: 'date', required: true },
    { key: 'citizenName', label: 'اسم المواطن مقدم الشكوى', type: 'text', required: true },
    { key: 'phone', label: 'رقم هاتف المواطن', type: 'text' },
    { key: 'village', label: 'القرية', type: 'select', required: true, options: villageOptions },
    {
      key: 'category',
      label: 'تصنيف الشكوى',
      type: 'select',
      required: true,
      options: [
        { value: 'صرف مقررات', label: 'صرف مقررات' },
        { value: 'نقص سلعة', label: 'نقص سلعة' },
        { value: 'تسعير', label: 'تسعير' },
        { value: 'توقف بطاقة', label: 'توقف بطاقة' },
        { value: 'أخرى', label: 'أخرى' },
      ],
    },
    {
      key: 'status',
      label: 'حالة الشكوى',
      type: 'select',
      required: true,
      options: [
        { value: 'جديدة', label: 'جديدة' },
        { value: 'قيد الفحص', label: 'قيد الفحص' },
        { value: 'تم الحل', label: 'تم الحل' },
        { value: 'مغلقة', label: 'مغلقة' },
      ],
    },
    { key: 'resolution', label: 'نتيجة الفحص والإفادة', type: 'text' },
    { key: 'details', label: 'مضمون الشكوى بالتفصيل', type: 'textarea', required: true, colSpan: 2 },
  ];

  // =========================================================================
  // Unified Modal Submit Handler for All Entities
  // =========================================================================
  const handleModalSubmit = (values: Record<string, any>): string | void => {
    if (!activeModal) return;
    const { mode, entity, targetId } = activeModal;
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    if (entity === 'merchant') {
      const name = String(values.merchantName || '').trim();
      const owner = String(values.ownerName || '').trim();
      if (!name || !owner) return 'يرجى إدخال اسم المنفذ واسم المسؤول.';
      const duplicate = state.merchants.some(
        (m) =>
          m.id !== targetId &&
          m.posMachineNumber.trim().toLowerCase() === String(values.posMachineNumber || '').trim().toLowerCase()
      );
      if (duplicate) return 'رقم ماكينة الصرف POS مسجل لمنفذ آخر بالفعل.';

      if (mode === 'add') {
        const created: RationMerchant = {
          id: `${branchId}-m-${Date.now()}`,
          serialNo: state.merchants.length + 1,
          branchId,
          merchantName: name,
          ownerName: owner,
          posMachineNumber: String(values.posMachineNumber).trim(),
          outletType: values.outletType as OutletType,
          governorate: 'الغربية',
          district: branchName,
          village: String(values.village),
          localUnit: String(values.localUnit).trim(),
          detailedAddress: String(values.detailedAddress || `${values.village} - ${branchName}`).trim(),
          phone: String(values.phone || '').trim(),
          nationalId: String(values.nationalId || '').trim(),
          commercialRegNumber: String(values.commercialRegNumber || '').trim(),
          taxCardNumber: String(values.taxCardNumber || '').trim(),
          licenseNumber: String(values.licenseNumber).trim(),
          licenseIssueDate: String(values.activityStartDate || today),
          licenseExpiryDate: String(values.licenseExpiryDate || '2027-12-31'),
          activityStartDate: String(values.activityStartDate || today),
          activityEndDate: String(values.licenseExpiryDate || '2027-12-31'),
          monthlyEntitlementQuota: Math.max(0, Number(values.monthlyEntitlementQuota) || 0),
          cashInsuranceAmount: Math.max(0, Number(values.cashInsuranceAmount) || 0),
          openingBalance: Number(values.openingBalance) || 0,
          linkedCardsCount: Math.max(0, Number(values.linkedCardsCount) || 0),
          linkedBeneficiariesCount: Math.max(0, Number(values.linkedBeneficiariesCount) || 0),
          activityStatus: values.activityStatus as MerchantActivityStatus,
          wholesaleBranchName: `فرع جملة ${branchName}`,
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            merchants: [...state.merchants, created],
            auditLogs: [appendAudit('إضافة', 'سجل التجار والمنافذ', created.id, created.merchantName), ...state.auditLogs],
          },
          `تم إضافة المنفذ (${created.merchantName}) وحفظه في Supabase`
        );
        notify('ok', `تم إضافة المنفذ (${created.merchantName}) بنجاح.`);
      } else if (targetId) {
        const prev = state.merchants.find((m) => m.id === targetId);
        const updatedList = state.merchants.map((m) =>
          m.id === targetId
            ? {
                ...m,
                merchantName: name,
                ownerName: owner,
                outletType: values.outletType as OutletType,
                village: String(values.village),
                localUnit: String(values.localUnit).trim(),
                detailedAddress: String(values.detailedAddress || m.detailedAddress).trim(),
                nationalId: String(values.nationalId || m.nationalId || '').trim(),
                commercialRegNumber: String(values.commercialRegNumber || m.commercialRegNumber || '').trim(),
                taxCardNumber: String(values.taxCardNumber || m.taxCardNumber || '').trim(),
                posMachineNumber: String(values.posMachineNumber).trim(),
                licenseNumber: String(values.licenseNumber).trim(),
                activityStartDate: String(values.activityStartDate || m.activityStartDate || today),
                activityEndDate: String(values.licenseExpiryDate || m.licenseExpiryDate),
                licenseExpiryDate: String(values.licenseExpiryDate || m.licenseExpiryDate),
                monthlyEntitlementQuota: Math.max(0, Number(values.monthlyEntitlementQuota) || 0),
                cashInsuranceAmount: Math.max(0, Number(values.cashInsuranceAmount) || 0),
                openingBalance: Number(values.openingBalance) || 0,
                linkedCardsCount: Math.max(0, Number(values.linkedCardsCount) || 0),
                linkedBeneficiariesCount: Math.max(0, Number(values.linkedBeneficiariesCount) || 0),
                phone: String(values.phone || '').trim(),
                activityStatus: values.activityStatus as MerchantActivityStatus,
                updatedAt: nowIso,
              }
            : m
        );
        onChangeState(
          {
            ...state,
            merchants: updatedList,
            auditLogs: [
              appendAudit('تعديل', 'سجل التجار والمنافذ', targetId, name, prev?.merchantName),
              ...state.auditLogs,
            ],
          },
          `تم تعديل بيانات المنفذ (${name}) ومزامنتها في Supabase`
        );
        notify('ok', `تم حفظ التعديلات على المنفذ (${name}) بنجاح.`);
      }
      return;
    }

    if (entity === 'card') {
      const cardNo = String(values.cardNumber || '').trim();
      const headName = String(values.headOfFamilyName || '').trim();
      if (!cardNo || !headName) return 'يرجى إدخال رقم البطاقة واسم رب الأسرة.';
      if (state.cards.some((c) => c.id !== targetId && c.cardNumber.trim() === cardNo)) {
        return `رقم البطاقة (${cardNo}) مسجل بالفعل — يُمنع تكرار البطاقات.`;
      }

      if (mode === 'add') {
        const created: RationCardRecord = {
          id: `${branchId}-card-${Date.now()}`,
          branchId,
          cardNumber: cardNo,
          headOfFamilyName: headName,
          headNationalId: String(values.headNationalId).trim(),
          merchantId: String(values.merchantId),
          village: String(values.village),
          localUnit: String(values.localUnit).trim(),
          status: values.status as RationCardRecord['status'],
          hasAdditionalGrant: Boolean(values.hasAdditionalGrant),
          additionalGrantAmount: Number(values.additionalGrantAmount) || 0,
          members: [
            {
              id: `mb-${Date.now()}`,
              fullName: headName,
              nationalId: String(values.headNationalId).trim(),
              relation: 'رب أسرة',
              status: 'مستحق',
            },
          ],
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            cards: [created, ...state.cards],
            auditLogs: [appendAudit('إضافة', 'البطاقات التموينية', created.id, `${cardNo} — ${headName}`), ...state.auditLogs],
          },
          `تم إضافة البطاقة التموينية (${cardNo}) في Supabase`
        );
        setSelectedCardId(created.id);
        notify('ok', `تم إضافة البطاقة (${cardNo}) باسم (${headName}).`);
      } else if (targetId) {
        const updatedCards = state.cards.map((c) =>
          c.id === targetId
            ? {
                ...c,
                cardNumber: cardNo,
                headOfFamilyName: headName,
                headNationalId: String(values.headNationalId).trim(),
                merchantId: String(values.merchantId),
                village: String(values.village),
                localUnit: String(values.localUnit).trim(),
                status: values.status as RationCardRecord['status'],
                hasAdditionalGrant: Boolean(values.hasAdditionalGrant),
                additionalGrantAmount: Number(values.additionalGrantAmount) || 0,
                updatedAt: nowIso,
              }
            : c
        );
        onChangeState(
          {
            ...state,
            cards: updatedCards,
            auditLogs: [appendAudit('تعديل', 'البطاقات التموينية', targetId, `${cardNo} — ${headName}`), ...state.auditLogs],
          },
          `تم تعديل البطاقة التموينية (${cardNo})`
        );
        notify('ok', `تم تحديث بيانات البطاقة (${cardNo}) بنجاح.`);
      }
      return;
    }

    if (entity === 'member' && selectedCard) {
      const mName = String(values.fullName || '').trim();
      const mNid = String(values.nationalId || '').trim();
      if (!mName || !mNid) return 'يرجى إدخال اسم الفرد والرقم القومي.';
      let nextMembers: RationBeneficiaryMember[];
      if (mode === 'add') {
        const createdMember: RationBeneficiaryMember = {
          id: `mb-${Date.now()}`,
          fullName: mName,
          nationalId: mNid,
          relation: String(values.relation),
          status: values.status as RationBeneficiaryMember['status'],
          suspensionReason: String(values.suspensionReason || '').trim() || undefined,
        };
        nextMembers = [...selectedCard.members, createdMember];
      } else {
        nextMembers = selectedCard.members.map((mb) =>
          mb.id === targetId
            ? {
                ...mb,
                fullName: mName,
                nationalId: mNid,
                relation: String(values.relation),
                status: values.status as RationBeneficiaryMember['status'],
                suspensionReason: String(values.suspensionReason || '').trim() || undefined,
              }
            : mb
        );
      }
      const nextCards = state.cards.map((c) =>
        c.id === selectedCard.id ? { ...c, members: nextMembers, updatedAt: nowIso } : c
      );
      onChangeState(
        {
          ...state,
          cards: nextCards,
          auditLogs: [
            appendAudit(mode === 'add' ? 'إضافة' : 'تعديل', 'أفراد البطاقة التموينية', selectedCard.id, mName),
            ...state.auditLogs,
          ],
        },
        `تم تحديث أفراد البطاقة (${selectedCard.cardNumber})`
      );
      notify('ok', `تم حفظ بيانات المستفيد (${mName}) وتحديث استحقاق البطاقة تلقائياً.`);
      return;
    }

    if (entity === 'commodity') {
      const code = String(values.code || '').trim();
      const name = String(values.name || '').trim();
      const offPrice = round2(Number(values.officialPrice) || 0);
      const supPrice = round2(Number(values.supplyCostPrice) || 0);
      if (offPrice <= 0 || supPrice <= 0) return 'يجب أن تكون الأسعار أكبر من الصفر.';
      if (state.commodities.some((c) => c.id !== targetId && c.code.trim().toLowerCase() === code.toLowerCase())) {
        return `كود الصنف (${code}) مستخدم بالفعل لسلعة أخرى — يجب أن يكون فريداً.`;
      }

      const openBal = Math.max(0, Number(values.openingBalance) || 0);
      const inQty = Math.max(0, Number(values.inboundQty) || 0);
      const outQty = Math.max(0, Number(values.outboundQty) || 0);
      const minLvl = Math.max(0, Number(values.reorderLevel) || 200);
      const maxLvl = Math.max(minLvl, Number(values.maxStockLevel) || 5000);
      const availStatus = (values.availabilityStatus || 'متاح') as CommodityAvailabilityStatus;

      if (mode === 'add') {
        const created: RationCommodity = {
          id: `${branchId}-c-${Date.now()}`,
          code,
          name,
          category: String(values.category).trim(),
          unit: values.unit as CommodityUnit,
          packWeightGramsOrMl: 1000,
          officialPrice: offPrice,
          supplyCostPrice: supPrice,
          freeMarketRefPrice: round2(Number(values.freeMarketRefPrice) || offPrice),
          profitMargin: round2(offPrice - supPrice),
          commissionType: 'per_unit',
          commissionValue: round2(Number(values.commissionValue) || 0.5),
          maxPerBeneficiary: Number(values.monthlyQuotaPerBeneficiary) || 1,
          maxPerCard: Number(values.maxPerCard) || 4,
          monthlyQuotaPerBeneficiary: Number(values.monthlyQuotaPerBeneficiary) || 1,
          quotaRuleType: 'custom_rule',
          priceStartDate: today,
          isActive: availStatus === 'متاح',
          availabilityStatus: availStatus,
          openingBalance: openBal,
          inboundQty: inQty,
          outboundQty: outQty,
          minStockLevel: minLvl,
          maxStockLevel: maxLvl,
          batchNumber: String(values.batchNumber || `BCH-${Date.now().toString().slice(-4)}`).trim(),
          expiryDate: String(values.expiryDate || '2027-06-30'),
          supplierCompany: String(values.supplierCompany).trim(),
          reorderLevel: minLvl,
          decisionNumber: String(values.decisionNumber).trim(),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            commodities: [...state.commodities, created],
            auditLogs: [appendAudit('إضافة', 'قاعدة بيانات السلع التموينية', created.id, `${created.name} (${offPrice} ج.م)`), ...state.auditLogs],
          },
          `تم إضافة السلعة (${created.name}) في Supabase`
        );
        notify('ok', `تم إضافة السلعة (${created.name}) بنجاح.`);
      } else if (targetId) {
        const updated = state.commodities.map((c) =>
          c.id === targetId
            ? {
                ...c,
                code,
                name,
                category: String(values.category).trim(),
                unit: values.unit as CommodityUnit,
                officialPrice: offPrice,
                supplyCostPrice: supPrice,
                freeMarketRefPrice: round2(Number(values.freeMarketRefPrice) || offPrice),
                profitMargin: round2(offPrice - supPrice),
                commissionValue: round2(Number(values.commissionValue) || 0),
                monthlyQuotaPerBeneficiary: Number(values.monthlyQuotaPerBeneficiary) || 1,
                maxPerBeneficiary: Number(values.monthlyQuotaPerBeneficiary) || 1,
                maxPerCard: Number(values.maxPerCard) || 4,
                isActive: availStatus === 'متاح',
                availabilityStatus: availStatus,
                openingBalance: openBal,
                inboundQty: inQty,
                outboundQty: outQty,
                minStockLevel: minLvl,
                maxStockLevel: maxLvl,
                batchNumber: String(values.batchNumber || c.batchNumber || '').trim(),
                expiryDate: String(values.expiryDate || c.expiryDate || '2027-06-30'),
                reorderLevel: minLvl,
                supplierCompany: String(values.supplierCompany).trim(),
                decisionNumber: String(values.decisionNumber).trim(),
                updatedAt: nowIso,
              }
            : c
        );
        onChangeState(
          {
            ...state,
            commodities: updated,
            auditLogs: [appendAudit('تعديل', 'قاعدة بيانات السلع التموينية', targetId, `${name} (${offPrice} ج.م)`), ...state.auditLogs],
          },
          `تم تعديل السلعة (${name})`
        );
        notify('ok', `تم تحديث بيانات السلعة (${name}) بنجاح.`);
      }
      return;
    }

    if (entity === 'disbursement') {
      const opNo = String(values.operationNumber || '').trim();
      const card = state.cards.find((c) => c.id === values.cardId);
      const comm = state.commodities.find((c) => c.id === values.commodityId);
      if (!opNo || !card || !comm) return 'يرجى استكمال بيانات عملية الصرف.';
      if (state.disbursements.some((d) => d.id !== targetId && d.operationNumber.trim() === opNo)) {
        return `رقم العملية (${opNo}) مسجل مسبقاً — يُمنع التكرار.`;
      }
      const qty = Math.max(0.5, Number(values.quantity) || 1);
      const unitPrice = comm.officialPrice;
      const totalSale = round2(qty * unitPrice);
      const supportDed = round2(Math.min(totalSale, Math.max(0, Number(values.supportDeducted) || 0)));
      const citizenPaid = round2(Math.max(0, totalSale - supportDed));
      const commEarned = round2(qty * comm.commissionValue);

      if (mode === 'add') {
        const created: RationDisbursementRecord = {
          id: `${branchId}-disb-${Date.now()}`,
          branchId,
          operationNumber: opNo,
          monthKey: state.settings.activeMonth,
          date: String(values.date || today),
          cardId: card.id,
          merchantId: card.merchantId,
          commodityId: comm.id,
          quantity: qty,
          officialUnitPriceAtSale: unitPrice,
          totalSaleValue: totalSale,
          supportDeducted: supportDed,
          citizenPaidAmount: citizenPaid,
          commissionEarned: commEarned,
          collectionMethod: values.collectionMethod as RationDisbursementRecord['collectionMethod'],
          employeeName: String(values.employeeName || 'مسؤول الصرف').trim(),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            disbursements: [created, ...state.disbursements],
            auditLogs: [appendAudit('إضافة', 'صرف المواطنين', created.id, `${opNo}: ${qty} × ${comm.name}`), ...state.auditLogs],
          },
          `تم إضافة عملية الصرف (${opNo})`
        );
        notify('ok', `تم تسجيل عملية الصرف (${opNo}) بنجاح.`);
      } else if (targetId) {
        const updated = state.disbursements.map((d) =>
          d.id === targetId
            ? {
                ...d,
                operationNumber: opNo,
                date: String(values.date || d.date),
                cardId: card.id,
                merchantId: card.merchantId,
                commodityId: comm.id,
                quantity: qty,
                officialUnitPriceAtSale: unitPrice,
                totalSaleValue: totalSale,
                supportDeducted: supportDed,
                citizenPaidAmount: citizenPaid,
                commissionEarned: commEarned,
                collectionMethod: values.collectionMethod as RationDisbursementRecord['collectionMethod'],
                employeeName: String(values.employeeName || d.employeeName).trim(),
                updatedAt: nowIso,
              }
            : d
        );
        onChangeState(
          {
            ...state,
            disbursements: updated,
            auditLogs: [appendAudit('تعديل', 'صرف المواطنين', targetId, `${opNo}: ${qty} × ${comm.name}`), ...state.auditLogs],
          },
          `تم تعديل عملية الصرف (${opNo})`
        );
        notify('ok', `تم تحديث عملية الصرف (${opNo}) وإعادة حساب القيم تلقائياً.`);
      }
      return;
    }

    if (entity === 'warehouse') {
      if (mode === 'add') {
        const created: RationWarehouseBalance = {
          id: `${branchId}-wh-${Date.now()}`,
          branchId,
          merchantId: String(values.merchantId),
          warehouseName: String(values.warehouseName).trim(),
          commodityId: String(values.commodityId),
          openingBalance: Number(values.openingBalance) || 0,
          totalIn: Number(values.totalIn) || 0,
          totalOut: Number(values.totalOut) || 0,
          inboundReturns: Number(values.inboundReturns) || 0,
          outboundReturns: Number(values.outboundReturns) || 0,
          approvedAdjustments: Number(values.approvedAdjustments) || 0,
          physicalCount: Number(values.physicalCount) || 0,
          reorderLevel: Number(values.reorderLevel) || 200,
          lastMovementDate: today,
          expiryDate: String(values.expiryDate || '2027-06-30'),
          stagnantDays: 0,
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            warehouses: [...state.warehouses, created],
            auditLogs: [appendAudit('إضافة', 'أرصدة المخازن والجرد', created.id, created.warehouseName), ...state.auditLogs],
          },
          `تم إضافة سجل مخزن (${created.warehouseName})`
        );
        notify('ok', `تم إضافة رصيد المخزن (${created.warehouseName}) بنجاح.`);
      } else if (targetId) {
        const updated = state.warehouses.map((w) =>
          w.id === targetId
            ? {
                ...w,
                merchantId: String(values.merchantId),
                warehouseName: String(values.warehouseName).trim(),
                commodityId: String(values.commodityId),
                openingBalance: Number(values.openingBalance) || 0,
                totalIn: Number(values.totalIn) || 0,
                totalOut: Number(values.totalOut) || 0,
                inboundReturns: Number(values.inboundReturns) || 0,
                outboundReturns: Number(values.outboundReturns) || 0,
                approvedAdjustments: Number(values.approvedAdjustments) || 0,
                physicalCount: Number(values.physicalCount) || 0,
                reorderLevel: Number(values.reorderLevel) || 200,
                expiryDate: String(values.expiryDate || w.expiryDate || ''),
                updatedAt: nowIso,
              }
            : w
        );
        onChangeState(
          {
            ...state,
            warehouses: updated,
            auditLogs: [appendAudit('تعديل', 'أرصدة المخازن والجرد', targetId, String(values.warehouseName)), ...state.auditLogs],
          },
          `تم تعديل رصيد المخزن (${values.warehouseName})`
        );
        notify('ok', 'تم حفظ تعديلات رصيد المخزن والجرد الفعلي بنجاح.');
      }
      return;
    }

    if (entity === 'movement') {
      const docNo = String(values.documentNumber || '').trim();
      const qty = Math.max(0.5, Number(values.quantity) || 0);
      const uPrice = Math.max(0, Number(values.unitPrice) || 0);
      const totVal = round2(qty * uPrice);
      const mType = values.movementType as RationInventoryMovement['movementType'];
      const commId = String(values.commodityId);
      const mId = String(values.merchantId);

      // Find matching warehouse to verify balance & update automatically (Control #1)
      const matchingWh = state.warehouses.find(
        (w) => w.commodityId === commId && (w.merchantId === mId || w.warehouseName === String(values.warehouseName).trim())
      ) || state.warehouses.find((w) => w.commodityId === commId);

      const currentBal = matchingWh
        ? computeCommodityCurrentBalance({
            openingBalance: matchingWh.openingBalance,
            inboundQty: matchingWh.totalIn,
            outboundQty: matchingWh.totalOut,
            inboundReturns: matchingWh.inboundReturns,
            outboundReturns: matchingWh.outboundReturns,
            approvedAdjustments: matchingWh.approvedAdjustments,
          })
        : 0;

      const isOutflow =
        mType === 'DISBURSEMENT_OUT' ||
        mType === 'RETURN_OUT' ||
        mType === 'TRANSFER_OUT' ||
        mType === 'ADJUSTMENT_SHORTAGE';

      if (mode === 'add' && isOutflow && matchingWh && qty > currentBal && !state.settings.allowNegativeStockWithApproval) {
        return `لا يمكن سحب كمية (${qty}) أكبر من الرصيد المتاح بالمخزن (${currentBal}) — يُمنع السحب بالسالب إلا بإذن استثنائي موثق من الإعدادات.`;
      }

      const balAfter = isOutflow ? round2(currentBal - qty) : round2(currentBal + qty);

      if (mode === 'add') {
        const created: RationInventoryMovement = {
          id: `${branchId}-mv-${Date.now()}`,
          branchId,
          documentNumber: docNo,
          movementDate: String(values.movementDate || today),
          movementType: mType,
          merchantId: mId,
          warehouseName: String(values.warehouseName).trim(),
          targetWarehouseName: String(values.targetWarehouseName || '').trim() || undefined,
          supplierName: String(values.supplierName || '').trim() || undefined,
          invoiceNumber: String(values.invoiceNumber || '').trim() || undefined,
          commodityId: commId,
          quantity: qty,
          unitPrice: uPrice,
          totalValue: totVal,
          balanceBefore: currentBal,
          balanceAfter: balAfter,
          approvedBy: String(values.approvedBy).trim(),
          isApproved: true,
          notes: String(values.notes || '').trim(),
          updatedAt: nowIso,
        };

        // Automatically update warehouse and commodity balances upon movement approval
        const nextWarehouses = state.warehouses.map((w) => {
          if (matchingWh && w.id === matchingWh.id) {
            return {
              ...w,
              totalIn:
                mType === 'RECEIPT_IN' || mType === 'TRANSFER_IN' ? round2(w.totalIn + qty) : w.totalIn,
              totalOut:
                mType === 'DISBURSEMENT_OUT' || mType === 'TRANSFER_OUT'
                  ? round2(w.totalOut + qty)
                  : w.totalOut,
              inboundReturns: mType === 'RETURN_IN' ? round2(w.inboundReturns + qty) : w.inboundReturns,
              outboundReturns: mType === 'RETURN_OUT' ? round2(w.outboundReturns + qty) : w.outboundReturns,
              approvedAdjustments:
                mType === 'ADJUSTMENT_SURPLUS'
                  ? round2(w.approvedAdjustments + qty)
                  : mType === 'ADJUSTMENT_SHORTAGE'
                  ? round2(w.approvedAdjustments - qty)
                  : w.approvedAdjustments,
              lastMovementDate: String(values.movementDate || today),
              updatedAt: nowIso,
            };
          }
          return w;
        });

        const nextCommodities = state.commodities.map((c) => {
          if (c.id === commId) {
            return {
              ...c,
              inboundQty:
                mType === 'RECEIPT_IN' || mType === 'TRANSFER_IN'
                  ? round2((c.inboundQty || 0) + qty)
                  : c.inboundQty,
              outboundQty:
                mType === 'DISBURSEMENT_OUT' || mType === 'TRANSFER_OUT'
                  ? round2((c.outboundQty || 0) + qty)
                  : c.outboundQty,
              updatedAt: nowIso,
            };
          }
          return c;
        });

        onChangeState(
          {
            ...state,
            warehouses: nextWarehouses,
            commodities: nextCommodities,
            movements: [created, ...state.movements],
            auditLogs: [appendAudit('إضافة', 'حركات المخزون والمشتريات', created.id, `${docNo} (${mType}: ${qty})`), ...state.auditLogs],
          },
          `تم اعتماد الحركة المخزنية (${docNo}) وتحديث الأرصدة تلقائياً`
        );
        notify('ok', `تم اعتماد الحركة المخزنية (${docNo}) وتحديث الرصيد تلقائياً.`);
      } else if (targetId) {
        const updated = state.movements.map((mv) =>
          mv.id === targetId
            ? {
                ...mv,
                documentNumber: docNo,
                movementDate: String(values.movementDate || mv.movementDate),
                movementType: mType,
                merchantId: mId,
                warehouseName: String(values.warehouseName).trim(),
                targetWarehouseName: String(values.targetWarehouseName || '').trim() || undefined,
                supplierName: String(values.supplierName || '').trim() || undefined,
                invoiceNumber: String(values.invoiceNumber || '').trim() || undefined,
                commodityId: commId,
                quantity: qty,
                unitPrice: uPrice,
                totalValue: totVal,
                approvedBy: String(values.approvedBy).trim(),
                notes: String(values.notes || '').trim(),
                updatedAt: nowIso,
              }
            : mv
        );
        onChangeState(
          {
            ...state,
            movements: updated,
            auditLogs: [appendAudit('تعديل', 'حركات المخزون والمشتريات', targetId, docNo), ...state.auditLogs],
          },
          `تم تعديل الحركة المخزنية (${docNo})`
        );
        notify('ok', `تم تحديث الحركة المخزنية (${docNo}) بنجاح.`);
      }
      return;
    }

    if (entity === 'requisition') {
      const merchant = state.merchants.find((m) => m.id === values.merchantId);
      const comm = state.commodities.find((c) => c.id === values.commodityId);
      if (!merchant || !comm) return 'يرجى اختيار التاجر والسلعة.';
      const reqQtyVal = Math.max(1, Number(values.requestedQty) || 1);
      const appQtyVal = Math.max(0, Number(values.approvedQty) || 0);
      const delQtyVal = Math.max(0, Number(values.deliveredQty) || 0);
      const lineValue = round2(reqQtyVal * comm.officialPrice);
      const monthKeyVal = String(values.monthKey || state.settings.activeMonth).trim();

      if (mode === 'add') {
        const created: RationRequisition = {
          id: `${branchId}-req-${Date.now()}`,
          branchId,
          requestNumber: String(values.requestNumber).trim(),
          invoiceNumber: String(values.invoiceNumber).trim(),
          monthKey: monthKeyVal,
          merchantId: merchant.id,
          wholesaleBranch: merchant.wholesaleBranchName,
          linkedCardsCount: merchant.linkedCardsCount,
          linkedBeneficiariesCount: merchant.linkedBeneficiariesCount,
          insuranceAmount: merchant.cashInsuranceAmount,
          committedInsuranceBefore: 0,
          previousStockTotalQty: 0,
          requestDate: String(values.requestDate || today),
          deliveryDate: String(values.requestDate || today),
          status: values.status as RationRequisition['status'],
          lines: [
            {
              commodityId: comm.id,
              commodityName: comm.name,
              requestedQty: reqQtyVal,
              approvedQty: appQtyVal,
              deliveredQty: delQtyVal,
              supplyPrice: comm.officialPrice,
            },
          ],
          totalValue: lineValue,
          notes: String(values.notes || '').trim(),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            requisitions: [created, ...state.requisitions],
            auditLogs: [appendAudit('إضافة', 'الحصص التموينية الشهرية', created.id, `${created.requestNumber} (${merchant.merchantName})`), ...state.auditLogs],
          },
          `تم تسجيل الحصة الشهرية (${created.requestNumber}) في Supabase`
        );
        notify('ok', `تم تسجيل الحصة الشهرية (${created.requestNumber}) بنجاح.`);
      } else if (targetId) {
        const updated = state.requisitions.map((r) =>
          r.id === targetId
            ? {
                ...r,
                requestNumber: String(values.requestNumber).trim(),
                invoiceNumber: String(values.invoiceNumber).trim(),
                monthKey: monthKeyVal,
                requestDate: String(values.requestDate || r.requestDate),
                deliveryDate: String(values.requestDate || r.deliveryDate || r.requestDate),
                merchantId: merchant.id,
                linkedCardsCount: merchant.linkedCardsCount,
                linkedBeneficiariesCount: merchant.linkedBeneficiariesCount,
                insuranceAmount: merchant.cashInsuranceAmount,
                status: values.status as RationRequisition['status'],
                lines: [
                  {
                    commodityId: comm.id,
                    commodityName: comm.name,
                    requestedQty: reqQtyVal,
                    approvedQty: appQtyVal,
                    deliveredQty: delQtyVal,
                    supplyPrice: comm.officialPrice,
                  },
                ],
                totalValue: lineValue,
                notes: String(values.notes || '').trim(),
                updatedAt: nowIso,
              }
            : r
        );
        onChangeState(
          {
            ...state,
            requisitions: updated,
            auditLogs: [appendAudit('تعديل', 'الحصص التموينية الشهرية', targetId, String(values.requestNumber)), ...state.auditLogs],
          },
          `تم تعديل الحصة الشهرية (${values.requestNumber})`
        );
        notify('ok', `تم تحديث الحصة الشهرية (${values.requestNumber}) وحفظ سجل التعديلات بنجاح.`);
      }
      return;
    }

    if (entity === 'financial') {
      const docNo = String(values.documentNumber || '').trim();
      if (state.financialEntries.some((x) => x.id !== targetId && !x.isReversed && x.documentNumber.trim() === docNo)) {
        return `رقم المستند (${docNo}) مسجل مسبقاً — يُمنع التكرار.`;
      }
      const eType = values.entryType as MerchantFinancialEntry['entryType'];
      const isDebit =
        eType === 'REQUISITION_DEBIT' ||
        eType === 'SUPPLY_INVOICE' ||
        eType === 'DISCOUNT_PENALTY_DEBIT' ||
        eType === 'SETTLEMENT_DEBIT';
      const amt = Math.max(0, Number(values.amount) || 0);

      if (mode === 'add') {
        const created: MerchantFinancialEntry = {
          id: `${branchId}-fin-${Date.now()}`,
          branchId,
          documentNumber: docNo,
          date: String(values.date || today),
          merchantId: String(values.merchantId),
          entryType: eType,
          debitAmount: isDebit ? amt : 0,
          creditAmount: !isDebit ? amt : 0,
          description: String(values.description).trim(),
          isApproved: true,
          createdBy: currentUser?.fullName || 'المحاسب المختص',
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            financialEntries: [created, ...state.financialEntries],
            auditLogs: [appendAudit('إضافة', 'الحسابات المالية للتجار', created.id, `${docNo} (${amt} ج.م)`), ...state.auditLogs],
          },
          `تم إضافة القيد المالي (${docNo})`
        );
        notify('ok', `تم إضافة القيد المالي (${docNo}) بنجاح.`);
      } else if (targetId) {
        const updated = state.financialEntries.map((x) =>
          x.id === targetId
            ? {
                ...x,
                documentNumber: docNo,
                date: String(values.date || x.date),
                merchantId: String(values.merchantId),
                entryType: eType,
                debitAmount: isDebit ? amt : 0,
                creditAmount: !isDebit ? amt : 0,
                description: String(values.description).trim(),
                updatedAt: nowIso,
              }
            : x
        );
        onChangeState(
          {
            ...state,
            financialEntries: updated,
            auditLogs: [appendAudit('تعديل', 'الحسابات المالية للتجار', targetId, `${docNo} (${amt} ج.م)`), ...state.auditLogs],
          },
          `تم تعديل القيد المالي (${docNo})`
        );
        notify('ok', `تم تحديث القيد المالي (${docNo}) وإعادة احتساب رصيد التاجر فوراً.`);
      }
      return;
    }

    if (entity === 'inspection') {
      const merchant = state.merchants.find((m) => m.id === values.merchantId) || state.merchants[0];
      const rptNo = String(values.reportNumber || '').trim();
      if (mode === 'add') {
        const created: RationInspectionCampaign = {
          id: `${branchId}-ins-${Date.now()}`,
          branchId,
          inspectionDateTime: String(values.inspectionDateTime || nowIso.slice(0, 16)),
          inspectorName: String(values.inspectorName).trim(),
          merchantId: merchant?.id || '',
          village: merchant?.village || 'بشبيش',
          outletType: merchant?.outletType || 'تاجر تمويني',
          violationType: String(values.violationType).trim(),
          violationDescription: String(values.violationDescription).trim(),
          reportNumber: rptNo,
          violationQuantity: Math.max(0, Number(values.violationQuantity) || 0),
          financialValue: Math.max(0, Number(values.financialValue) || 0),
          issuingEntity: branchName,
          dispositionStatus: values.dispositionStatus as RationInspectionCampaign['dispositionStatus'],
          inspectionResult: values.inspectionResult as RationInspectionCampaign['inspectionResult'],
          legalAction: String(values.legalAction).trim(),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            inspections: [created, ...state.inspections],
            auditLogs: [appendAudit('إضافة', 'محاضر التفتيش التمويني', created.id, rptNo), ...state.auditLogs],
          },
          `تم إضافة محضر التفتيش (${rptNo})`
        );
        notify('ok', `تم تسجيل محضر التفتيش (${rptNo}) بنجاح.`);
      } else if (targetId) {
        const updated = state.inspections.map((ins) =>
          ins.id === targetId
            ? {
                ...ins,
                reportNumber: rptNo,
                inspectionDateTime: String(values.inspectionDateTime || ins.inspectionDateTime),
                merchantId: merchant?.id || ins.merchantId,
                village: merchant?.village || ins.village,
                outletType: merchant?.outletType || ins.outletType,
                inspectorName: String(values.inspectorName).trim(),
                violationType: String(values.violationType).trim(),
                violationQuantity: Math.max(0, Number(values.violationQuantity) || 0),
                financialValue: Math.max(0, Number(values.financialValue) || 0),
                inspectionResult: values.inspectionResult as RationInspectionCampaign['inspectionResult'],
                dispositionStatus: values.dispositionStatus as RationInspectionCampaign['dispositionStatus'],
                legalAction: String(values.legalAction).trim(),
                violationDescription: String(values.violationDescription).trim(),
                updatedAt: nowIso,
              }
            : ins
        );
        onChangeState(
          {
            ...state,
            inspections: updated,
            auditLogs: [appendAudit('تعديل', 'محاضر التفتيش التمويني', targetId, rptNo), ...state.auditLogs],
          },
          `تم تعديل محضر التفتيش (${rptNo})`
        );
        notify('ok', `تم تحديث محضر التفتيش (${rptNo}) بنجاح.`);
      }
      return;
    }

    if (entity === 'complaint') {
      const tktNo = String(values.ticketNumber || '').trim();
      if (mode === 'add') {
        const created: RationComplaintRecord = {
          id: `${branchId}-cmp-${Date.now()}`,
          branchId,
          ticketNumber: tktNo,
          date: String(values.date || today),
          citizenName: String(values.citizenName).trim(),
          phone: String(values.phone || '').trim(),
          village: String(values.village),
          category: values.category as RationComplaintRecord['category'],
          details: String(values.details).trim(),
          status: values.status as RationComplaintRecord['status'],
          resolution: String(values.resolution || '').trim() || undefined,
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            complaints: [created, ...state.complaints],
            auditLogs: [appendAudit('إضافة', 'شكاوى المواطنين', created.id, tktNo), ...state.auditLogs],
          },
          `تم إضافة شكوى المواطن (${tktNo})`
        );
        notify('ok', `تم تسجيل شكوى المواطن (${tktNo}) بنجاح.`);
      } else if (targetId) {
        const updated = state.complaints.map((c) =>
          c.id === targetId
            ? {
                ...c,
                ticketNumber: tktNo,
                date: String(values.date || c.date),
                citizenName: String(values.citizenName).trim(),
                phone: String(values.phone || '').trim(),
                village: String(values.village),
                category: values.category as RationComplaintRecord['category'],
                details: String(values.details).trim(),
                status: values.status as RationComplaintRecord['status'],
                resolution: String(values.resolution || '').trim() || undefined,
                updatedAt: nowIso,
              }
            : c
        );
        onChangeState(
          {
            ...state,
            complaints: updated,
            auditLogs: [appendAudit('تعديل', 'شكاوى المواطنين', targetId, tktNo), ...state.auditLogs],
          },
          `تم تعديل شكوى المواطن (${tktNo})`
        );
        notify('ok', `تم تحديث شكوى المواطن (${tktNo}) بنجاح.`);
      }
    }
  };

  // Existing Quick Handlers
  const handleAddMerchant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchantName.trim() || !newOwnerName.trim()) {
      notify('err', 'يرجى إدخال اسم المنفذ واسم المسؤول/التاجر.');
      return;
    }
    const villageObj = villages.find((v) => v.village === newMerchantVillage);
    const created: RationMerchant = {
      id: `${branchId}-m-${Date.now()}`,
      serialNo: state.merchants.length + 1,
      branchId,
      merchantName: newMerchantName.trim(),
      ownerName: newOwnerName.trim(),
      posMachineNumber: newMerchantPos.trim() || `POS-${Math.floor(10000 + Math.random() * 89999)}`,
      outletType: newMerchantOutlet,
      governorate: 'الغربية',
      district: branchName,
      village: newMerchantVillage,
      localUnit: villageObj?.localUnits?.[0] || newMerchantVillage,
      detailedAddress: `${newMerchantVillage} - ${branchName}`,
      phone: '',
      nationalId: '',
      commercialRegNumber: '',
      taxCardNumber: '',
      licenseNumber: `LIC-${Math.floor(1000 + Math.random() * 8999)}`,
      licenseIssueDate: new Date().toISOString().split('T')[0],
      licenseExpiryDate: '2027-12-31',
      cashInsuranceAmount: Math.max(0, Number(newMerchantInsurance) || 0),
      openingBalance: 0,
      linkedCardsCount: 0,
      linkedBeneficiariesCount: 0,
      activityStatus: 'نشط',
      wholesaleBranchName: `فرع جملة ${branchName}`,
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        merchants: [...state.merchants, created],
        auditLogs: [
          appendAudit('إضافة', 'سجل التجار والمنافذ', created.id, created.merchantName),
          ...state.auditLogs,
        ],
      },
      `تم إضافة المنفذ (${created.merchantName}) في Supabase`
    );
    setNewMerchantName('');
    setNewOwnerName('');
    setNewMerchantPos('');
    notify('ok', `تم تسجيل المنفذ التمويني (${created.merchantName}) بنجاح.`);
  };

  const handleUpdateCommodityPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const target = state.commodities.find((c) => c.id === priceEditCommodityId);
    if (!target) return;
    if (newOfficialPrice < 0 || newSupplyPrice < 0) {
      notify('err', 'الأسعار يجب أن تكون قيماً موجبة.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const updatedComm: RationCommodity = {
      ...target,
      officialPrice: round2(newOfficialPrice),
      supplyCostPrice: round2(newSupplyPrice),
      profitMargin: round2(newOfficialPrice - newSupplyPrice),
      priceStartDate: today,
      decisionNumber: priceDecisionRef.trim() || state.settings.decisionNumber,
      updatedAt: new Date().toISOString(),
    };
    const nextHistory = [
      {
        id: `${branchId}-ph-${Date.now()}`,
        commodityId: target.id,
        officialPrice: updatedComm.officialPrice,
        freeMarketRefPrice: updatedComm.freeMarketRefPrice,
        supplyCostPrice: updatedComm.supplyCostPrice,
        profitMargin: updatedComm.profitMargin,
        commissionType: updatedComm.commissionType,
        commissionValue: updatedComm.commissionValue,
        effectiveFrom: today,
        decisionNumber: updatedComm.decisionNumber,
        updatedBy: currentUser?.fullName || 'الإدارة',
        updatedAt: new Date().toISOString(),
      },
      ...state.priceHistory,
    ];
    onChangeState(
      {
        ...state,
        commodities: state.commodities.map((c) => (c.id === target.id ? updatedComm : c)),
        priceHistory: nextHistory,
        auditLogs: [
          appendAudit(
            'تعديل',
            'دليل وأسعار السلع',
            target.id,
            `${target.name}: الرسمي ${updatedComm.officialPrice} ج.م`,
            `السابق ${target.officialPrice} ج.م`
          ),
          ...state.auditLogs,
        ],
      },
      `تم تحديث تسعيرة (${target.name})`
    );
    notify('ok', `تم تحديث تسعيرة (${target.name}) وحفظها بالسجل التاريخي دون تعديل الفواتير القديمة.`);
  };

  const handleRegisterDisbursement = (e: React.FormEvent) => {
    e.preventDefault();
    const card = state.cards.find((c) => c.id === disbCardId);
    const commodity = state.commodities.find((c) => c.id === disbCommodityId);
    if (!card || !commodity) return;
    const wh = state.warehouses.find(
      (w) => w.merchantId === card.merchantId && w.commodityId === commodity.id
    );
    const whBalance = wh
      ? computeWarehouseStockStatus(wh, commodity.supplyCostPrice).bookBalance
      : 9999;

    const validation = validateAndComputeDisbursement({
      operationNumber: disbOpNo,
      card,
      commodity,
      requestedQty: disbQty,
      warehouseBalance: whBalance,
      existingDisbursements: state.disbursements,
      settings: state.settings,
      supportUsedInOperation: disbSupportUsed,
    });

    if (!validation.valid) {
      notify('err', validation.error || 'تعذر تنفيذ عملية الصرف.');
      return;
    }

    const newDisb: RationDisbursementRecord = {
      id: `${branchId}-disb-${Date.now()}`,
      branchId,
      operationNumber: disbOpNo.trim(),
      monthKey: state.settings.activeMonth,
      date: new Date().toISOString().split('T')[0],
      cardId: card.id,
      merchantId: card.merchantId,
      commodityId: commodity.id,
      quantity: disbQty,
      officialUnitPriceAtSale: commodity.officialPrice,
      totalSaleValue: validation.totalSaleValue,
      supportDeducted: round2(Math.min(validation.totalSaleValue, Math.max(0, disbSupportUsed))),
      citizenPaidAmount: validation.citizenPaidAmount,
      commissionEarned: validation.commissionEarned,
      collectionMethod: validation.citizenPaidAmount > 0 ? 'مختلط' : 'بطاقة تموينية',
      employeeName: currentUser?.fullName || 'مسؤول الصرف',
      updatedAt: new Date().toISOString(),
    };

    const nextWarehouses = wh
      ? state.warehouses.map((w) =>
          w.id === wh.id ? { ...w, totalOut: round2(w.totalOut + disbQty) } : w
        )
      : state.warehouses;

    onChangeState(
      {
        ...state,
        disbursements: [newDisb, ...state.disbursements],
        warehouses: nextWarehouses,
        auditLogs: [
          appendAudit(
            'إضافة',
            'صرف البطاقات التموينية',
            newDisb.id,
            `عملية ${newDisb.operationNumber}: ${disbQty} × ${commodity.name}`
          ),
          ...state.auditLogs,
        ],
      },
      `تم تسجيل عملية الصرف (${newDisb.operationNumber})`
    );
    setDisbOpNo('');
    notify('ok', `تم تسجيل الصرف (${newDisb.operationNumber}) وخصم الرصيد آلياً.`);
  };

  const handleAddFinancialEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMerchantForFin || !finDocNo.trim()) {
      notify('err', 'رقم المستند إلزامي لمنع التكرار.');
      return;
    }
    if (
      state.financialEntries.some(
        (x) => !x.isReversed && x.documentNumber.trim() === finDocNo.trim()
      )
    ) {
      notify('err', `رقم المستند (${finDocNo}) مسجل مسبقاً — يُمنع التكرار.`);
      return;
    }
    const isDebit =
      finEntryType === 'REQUISITION_DEBIT' ||
      finEntryType === 'SUPPLY_INVOICE' ||
      finEntryType === 'DISCOUNT_PENALTY_DEBIT' ||
      finEntryType === 'SETTLEMENT_DEBIT';

    const newEntry: MerchantFinancialEntry = {
      id: `${branchId}-fin-${Date.now()}`,
      branchId,
      documentNumber: finDocNo.trim(),
      date: new Date().toISOString().split('T')[0],
      merchantId: selectedMerchantForFin.id,
      entryType: finEntryType,
      debitAmount: isDebit ? Math.max(0, finAmount) : 0,
      creditAmount: !isDebit ? Math.max(0, finAmount) : 0,
      description: finDesc.trim() || `قيد ${finEntryType}`,
      isApproved: true,
      createdBy: currentUser?.fullName || 'المحاسب المختص',
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        financialEntries: [newEntry, ...state.financialEntries],
        auditLogs: [
          appendAudit('اعتماد', 'كشف الحساب المالي للتاجر', newEntry.id, `${newEntry.documentNumber} بمبلغ ${finAmount}`),
          ...state.auditLogs,
        ],
      },
      `تم ترحيل القيد المالي (${newEntry.documentNumber})`
    );
    setFinDocNo('');
    setFinDesc('');
    notify('ok', `تم قيد المستند المالي (${newEntry.documentNumber}) في حساب التاجر.`);
  };

  const handleReverseFinancialEntry = (entry: MerchantFinancialEntry) => {
    const reversalDoc = `REV-${entry.documentNumber}`;
    if (state.financialEntries.some((x) => x.documentNumber === reversalDoc)) return;
    const reversal: MerchantFinancialEntry = {
      id: `${branchId}-fin-rev-${Date.now()}`,
      branchId,
      documentNumber: reversalDoc,
      date: new Date().toISOString().split('T')[0],
      merchantId: entry.merchantId,
      entryType: 'REVERSAL',
      debitAmount: entry.creditAmount,
      creditAmount: entry.debitAmount,
      description: `قيد عكسي لإلغاء المستند رقم ${entry.documentNumber}`,
      isApproved: true,
      createdBy: currentUser?.fullName || 'المراجعة',
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        financialEntries: [
          reversal,
          ...state.financialEntries.map((x) =>
            x.id === entry.id ? { ...x, isReversed: true } : x
          ),
        ],
        auditLogs: [
          appendAudit('عكس قيد', 'الحساب المالي للتاجر', entry.id, reversalDoc, entry.documentNumber),
          ...state.auditLogs,
        ],
      },
      `تم إنشاء قيد عكسي (${reversalDoc})`
    );
    notify('ok', `تم إنشاء قيد عكسي (${reversalDoc}) مع الحفاظ على الأثر المرجعي للمستند الأصلي.`);
  };

  const handleReverseInventoryMovement = (mv: RationInventoryMovement) => {
    const revDoc = `REV-${mv.documentNumber}`;
    if (state.movements.some((x) => x.documentNumber === revDoc)) {
      notify('err', `تم إنشاء قيد عكسي لهذه الحركة مسبقاً (${revDoc}).`);
      return;
    }
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];
    const isOrigOutflow =
      mv.movementType === 'DISBURSEMENT_OUT' ||
      mv.movementType === 'RETURN_OUT' ||
      mv.movementType === 'TRANSFER_OUT' ||
      mv.movementType === 'ADJUSTMENT_SHORTAGE';

    const reversalMv: RationInventoryMovement = {
      id: `${branchId}-mv-rev-${Date.now()}`,
      branchId,
      documentNumber: revDoc,
      movementDate: today,
      movementType: 'REVERSAL',
      merchantId: mv.merchantId,
      warehouseName: mv.warehouseName,
      commodityId: mv.commodityId,
      quantity: mv.quantity,
      unitPrice: mv.unitPrice,
      totalValue: mv.totalValue,
      balanceBefore: mv.balanceAfter,
      balanceAfter: mv.balanceBefore,
      approvedBy: currentUser?.fullName || 'المراجعة المخزنية',
      isApproved: true,
      notes: `قيد عكسي لإلغاء أثر المستند المخزني المعتمد رقم (${mv.documentNumber})`,
      updatedAt: nowIso,
    };

    const nextWarehouses = state.warehouses.map((w) => {
      if (w.commodityId === mv.commodityId && (w.merchantId === mv.merchantId || w.warehouseName === mv.warehouseName)) {
        return {
          ...w,
          approvedAdjustments: isOrigOutflow
            ? round2(w.approvedAdjustments + mv.quantity)
            : round2(w.approvedAdjustments - mv.quantity),
          updatedAt: nowIso,
        };
      }
      return w;
    });

    onChangeState(
      {
        ...state,
        warehouses: nextWarehouses,
        movements: [
          reversalMv,
          ...state.movements.map((x) =>
            x.id === mv.id ? { ...x, isReversed: true, reversedByDoc: revDoc } : x
          ),
        ],
        auditLogs: [
          appendAudit('عكس قيد', 'حركات المخزون والمشتريات', mv.id, revDoc, mv.documentNumber),
          ...state.auditLogs,
        ],
      },
      `تم إنشاء قيد عكسي مخزني (${revDoc}) وتحديث الرصيد تلقائياً`
    );
    notify('ok', `تم إنشاء قيد عكسي مخزني (${revDoc}) مع الحفاظ على سجل المستند الأصلي.`);
  };

  const handleAddRequisition = (e: React.FormEvent) => {
    e.preventDefault();
    const merchant = state.merchants.find((m) => m.id === reqMerchantId);
    const comm = state.commodities.find((c) => c.id === reqCommodityId);
    if (!merchant || !comm || !reqNo.trim()) {
      notify('err', 'يرجى تحديد التاجر ورقم سجل الحصة والكمية.');
      return;
    }
    const lineValue = round2(reqQty * comm.officialPrice);
    const newReq: RationRequisition = {
      id: `${branchId}-req-${Date.now()}`,
      branchId,
      requestNumber: reqNo.trim(),
      invoiceNumber: reqInvNo.trim() || `INV-${Date.now().toString().slice(-5)}`,
      monthKey: state.settings.activeMonth,
      merchantId: merchant.id,
      wholesaleBranch: merchant.wholesaleBranchName,
      linkedCardsCount: merchant.linkedCardsCount,
      linkedBeneficiariesCount: merchant.linkedBeneficiariesCount,
      insuranceAmount: merchant.cashInsuranceAmount,
      committedInsuranceBefore: 0,
      previousStockTotalQty: 0,
      requestDate: new Date().toISOString().split('T')[0],
      deliveryDate: new Date().toISOString().split('T')[0],
      status: 'معتمد',
      lines: [
        {
          commodityId: comm.id,
          commodityName: comm.name,
          requestedQty: reqQty,
          approvedQty: reqQty,
          deliveredQty: reqQty,
          supplyPrice: comm.officialPrice,
        },
      ],
      totalValue: lineValue,
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        requisitions: [newReq, ...state.requisitions],
        auditLogs: [
          appendAudit('إضافة', 'الحصص التموينية الشهرية', newReq.id, `${newReq.requestNumber} بقيمة ${lineValue}`),
          ...state.auditLogs,
        ],
      },
      `تم اعتماد الحصة الشهرية (${newReq.requestNumber})`
    );
    setReqNo('');
    setReqInvNo('');
    notify('ok', `تم تسجيل واعتماد الحصة الشهرية (${newReq.requestNumber}) بنجاح.`);
  };

  const handleAddInspection = (e: React.FormEvent) => {
    e.preventDefault();
    const merchant = state.merchants.find((m) => m.id === insMerchantId);
    if (!merchant || !insReportNo.trim()) {
      notify('err', 'يرجى إدخال رقم المحضر التمويني.');
      return;
    }
    const rec: RationInspectionCampaign = {
      id: `${branchId}-ins-${Date.now()}`,
      branchId,
      inspectionDateTime: new Date().toISOString().slice(0, 16),
      inspectorName: currentUser?.fullName || 'مفتش الرقابة',
      merchantId: merchant.id,
      village: merchant.village,
      outletType: merchant.outletType,
      violationType: insViolType,
      violationDescription: `محضر تفتيش على ${merchant.merchantName}`,
      reportNumber: insReportNo.trim(),
      violationQuantity: 0,
      financialValue: Math.max(0, insFineVal),
      issuingEntity: branchName,
      dispositionStatus: 'قيد الفحص',
      inspectionResult: insFineVal > 0 ? 'مخالف' : 'مطابق',
      legalAction: 'قيد العرض على الشئون القانونية',
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        inspections: [rec, ...state.inspections],
        auditLogs: [
          appendAudit('إضافة', 'الحملات التفتيشية والمخالفات', rec.id, `${rec.reportNumber} — ${rec.violationType}`),
          ...state.auditLogs,
        ],
      },
      `تم تسجيل محضر التفتيش (${rec.reportNumber})`
    );
    setInsReportNo('');
    notify('ok', `تم تسجيل محضر التفتيش (${rec.reportNumber}) بنجاح.`);
  };

  const handleAddComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmpCitizenName.trim() || !cmpDetails.trim()) return;
    const rec: RationComplaintRecord = {
      id: `${branchId}-cmp-${Date.now()}`,
      branchId,
      ticketNumber: `CMP-${Date.now().toString().slice(-5)}`,
      date: new Date().toISOString().split('T')[0],
      citizenName: cmpCitizenName.trim(),
      phone: '',
      village: villages[0]?.village || 'بشبيش',
      category: 'صرف مقررات',
      details: cmpDetails.trim(),
      status: 'جديدة',
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        complaints: [rec, ...state.complaints],
        auditLogs: [appendAudit('إضافة', 'شكاوى المواطنين', rec.id, rec.ticketNumber), ...state.auditLogs],
      },
      `تم تسجيل شكوى المواطن (${rec.ticketNumber})`
    );
    setCmpCitizenName('');
    setCmpDetails('');
    notify('ok', `تم تسجيل شكوى المواطن (${rec.ticketNumber}).`);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...settingsDraft,
      updatedBy: currentUser?.fullName || 'الإدارة',
      updatedAt: new Date().toISOString(),
    };
    onChangeState(
      {
        ...state,
        settings: updated,
        settingsHistory: [updated, ...state.settingsHistory],
        auditLogs: [
          appendAudit(
            'تحديث إعدادات',
            'إعدادات القرارات والمنح',
            updated.decisionNumber,
            `دعم الفرد: ${updated.supportPerBeneficiary} ج.م | المنحة: ${updated.additionalGrantPerCard2026} ج.م`,
            `السابق: ${state.settings.supportPerBeneficiary} ج.م`
          ),
          ...state.auditLogs,
        ],
      },
      'تم حفظ إعدادات القرارات التموينية'
    );
    notify('ok', 'تم حفظ القرار التمويني وإعدادات الدعم والمنحة بالسجل التاريخي.');
  };

  // =========================================================================
  // 10 Comprehensive Reports Generator (Filtered by Date, Village, Merchant, Commodity)
  // =========================================================================
  const activeReportData = useMemo(() => {
    const inDateRange = (dStr?: string) => {
      if (!dStr) return true;
      const day = dStr.slice(0, 10);
      if (reportFromDate && day < reportFromDate) return false;
      if (reportToDate && day > reportToDate) return false;
      return true;
    };

    switch (selectedReportType) {
      case 'RPT_BALANCES': {
        const rows = state.commodities
          .filter((c) => reportCommodityId === 'ALL' || c.id === reportCommodityId)
          .map((c, idx) => {
            const whs = state.warehouses.filter((w) => w.commodityId === c.id);
            const openBal = whs.length > 0 ? whs.reduce((s, w) => s + w.openingBalance, 0) : c.openingBalance || 0;
            const inQty = whs.length > 0 ? whs.reduce((s, w) => s + w.totalIn, 0) : c.inboundQty || 0;
            const outQty = whs.length > 0 ? whs.reduce((s, w) => s + w.totalOut, 0) : c.outboundQty || 0;
            const curBal = computeCommodityCurrentBalance({
              openingBalance: openBal,
              inboundQty: inQty,
              outboundQty: outQty,
            });
            const stockVal = computeCommodityStockValue(curBal, c.officialPrice);
            return [
              idx + 1,
              c.code,
              c.name,
              c.category,
              c.unit,
              `${c.officialPrice} ج.م`,
              openBal,
              inQty,
              outQty,
              curBal,
              `${stockVal.toLocaleString()} ج.م`,
              c.availabilityStatus || (c.isActive ? 'متاح' : 'موقوف'),
            ];
          });
        return {
          title: '1. تقرير أرصدة السلع التموينية الحالية',
          headers: ['م', 'كود الصنف', 'اسم السلعة', 'التصنيف', 'الوحدة', 'السعر الرسمي', 'الافتتاحي', 'الوارد', 'المنصرف', 'الرصيد الحالي', 'قيمة المخزون', 'الحالة'],
          rows,
        };
      }
      case 'RPT_MOVEMENTS': {
        const rows = state.movements
          .filter((mv) => {
            if (reportMerchantId !== 'ALL' && mv.merchantId !== reportMerchantId) return false;
            if (reportCommodityId !== 'ALL' && mv.commodityId !== reportCommodityId) return false;
            return inDateRange(mv.movementDate);
          })
          .map((mv, idx) => {
            const c = state.commodities.find((x) => x.id === mv.commodityId);
            return [
              idx + 1,
              mv.documentNumber,
              mv.movementDate,
              mv.movementType,
              mv.warehouseName,
              c?.name || mv.commodityId,
              mv.quantity,
              `${mv.unitPrice} ج.م`,
              `${mv.totalValue.toLocaleString()} ج.م`,
              mv.approvedBy,
              mv.isReversed ? `معكوس (${mv.reversedByDoc})` : 'معتمد',
            ];
          });
        return {
          title: '2. تقرير حركة الوارد والمنصرف خلال فترة محددة',
          headers: ['م', 'رقم المستند', 'التاريخ', 'نوع الحركة', 'المخزن', 'السلعة', 'الكمية', 'سعر الوحدة', 'القيمة الإجمالية', 'الموظف المسؤول', 'الحالة'],
          rows,
        };
      }
      case 'RPT_MONTHLY_QUOTAS': {
        const rows = state.requisitions
          .filter((r) => {
            if (reportMerchantId !== 'ALL' && r.merchantId !== reportMerchantId) return false;
            if (reportCommodityId !== 'ALL' && !r.lines.some((l) => l.commodityId === reportCommodityId)) return false;
            return inDateRange(r.requestDate);
          })
          .map((r, idx) => {
            const m = state.merchants.find((x) => x.id === r.merchantId);
            const l0 = r.lines[0];
            const prescribed = l0?.requestedQty || 0;
            const received = l0?.approvedQty || 0;
            const distributed = l0?.deliveredQty || 0;
            const rem = computeRemainingMonthlyQuota(prescribed, received);
            const execPct = computeMonthlyQuotaExecutionPct(distributed, prescribed);
            return [
              idx + 1,
              r.monthKey,
              m?.merchantName || r.merchantId,
              l0?.commodityName || '-',
              prescribed,
              received,
              distributed,
              rem,
              `${execPct}%`,
              `${r.totalValue.toLocaleString()} ج.م`,
              r.requestDate,
              r.status,
            ];
          });
        return {
          title: '3. تقرير الحصص التموينية الشهرية لكل تاجر',
          headers: ['م', 'الشهر والسنة', 'اسم التاجر / المنفذ', 'السلعة', 'المقررة', 'المستلمة', 'الموزعة', 'المتبقية', 'نسبة التنفيذ', 'قيمة الحصة', 'تاريخ الاستلام', 'حالة الصرف'],
          rows,
        };
      }
      case 'RPT_VILLAGE_DIST': {
        const vList = villages.length > 0 ? villages.map((v) => v.village) : ['بشبيش', 'دمرو', 'بلقينا'];
        const rows = vList
          .filter((vName) => reportVillage === 'ALL' || vName === reportVillage)
          .map((vName, idx) => {
            const mInV = state.merchants.filter((m) => m.village === vName);
            const mIds = new Set(mInV.map((m) => m.id));
            const cardsCount = mInV.reduce((s, m) => s + m.linkedCardsCount, 0);
            const benCount = mInV.reduce((s, m) => s + m.linkedBeneficiariesCount, 0);
            const disbInV = state.disbursements.filter((d) => mIds.has(d.merchantId) && !d.isReversed);
            const totalQty = round2(disbInV.reduce((s, d) => s + d.quantity, 0));
            const totalVal = round2(disbInV.reduce((s, d) => s + d.totalSaleValue, 0));
            return [
              idx + 1,
              vName,
              mInV.length,
              cardsCount,
              benCount,
              totalQty,
              `${totalVal.toLocaleString()} ج.م`,
            ];
          });
        return {
          title: '4. تقرير توزيع السلع حسب القرى والمناطق',
          headers: ['م', 'القرية / المنطقة', 'عدد المنافذ', 'عدد البطاقات', 'عدد المستفيدين', 'إجمالي الكميات المنصرفة', 'إجمالي قيمة المنصرف'],
          rows,
        };
      }
      case 'RPT_VARIANCE': {
        const rows = state.warehouses
          .filter((w) => {
            if (reportMerchantId !== 'ALL' && w.merchantId !== reportMerchantId) return false;
            if (reportCommodityId !== 'ALL' && w.commodityId !== reportCommodityId) return false;
            return true;
          })
          .map((w, idx) => {
            const c = state.commodities.find((x) => x.id === w.commodityId);
            const st = computeWarehouseStockStatus(w, c?.officialPrice || 0);
            return [
              idx + 1,
              w.warehouseName,
              c?.name || w.commodityId,
              st.bookBalance,
              w.physicalCount ?? st.bookBalance,
              st.inventoryVariance,
              st.varianceType,
              `${round2(Math.abs(st.inventoryVariance) * (c?.officialPrice || 0)).toLocaleString()} ج.م`,
            ];
          });
        return {
          title: '5. تقرير العجز والزيادة المخزنية (مطابقة الجرد الفعلي بالدفتري)',
          headers: ['م', 'المخزن / المنفذ', 'السلعة', 'الرصيد الدفتري', 'الجرد الفعلي', 'فرق الجرد', 'نوع الفرق', 'القيمة المالية للفرق'],
          rows,
        };
      }
      case 'RPT_LOW_STOCK': {
        const rows = state.warehouses
          .filter((w) => {
            const st = computeWarehouseStockStatus(w, 0);
            return st.bookBalance <= w.reorderLevel;
          })
          .map((w, idx) => {
            const c = state.commodities.find((x) => x.id === w.commodityId);
            const st = computeWarehouseStockStatus(w, c?.officialPrice || 0);
            return [
              idx + 1,
              c?.code || '-',
              c?.name || w.commodityId,
              w.warehouseName,
              st.bookBalance,
              w.reorderLevel,
              Math.max(0, w.reorderLevel - st.bookBalance),
              c?.supplierCompany || '-',
            ];
          });
        return {
          title: '6. تقرير الأصناف منخفضة المخزون (تحت الحد الأدنى)',
          headers: ['م', 'كود الصنف', 'اسم السلعة', 'المخزن', 'الرصيد الحالي', 'الحد الأدنى', 'الكمية المطلوبة للاستعاضة', 'المورد'],
          rows,
        };
      }
      case 'RPT_EXPIRY': {
        const rows = state.commodities
          .filter((c) => reportCommodityId === 'ALL' || c.id === reportCommodityId)
          .map((c, idx) => {
            const expStr = c.expiryDate || '2027-06-30';
            const daysLeft = Math.ceil((new Date(expStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return [
              idx + 1,
              c.code,
              c.name,
              c.batchNumber || 'BCH-2026',
              expStr,
              daysLeft,
              daysLeft < 0 ? 'منتهي الصلاحية' : daysLeft <= 60 ? 'قريب الانتهاء' : 'صالح وآمن',
              c.supplierCompany,
            ];
          });
        return {
          title: '7. تقرير السلع المنتهية أو قريبة انتهاء الصلاحية',
          headers: ['م', 'كود الصنف', 'اسم السلعة', 'رقم التشغيلة', 'تاريخ الصلاحية', 'الأيام المتبقية', 'حالة الصلاحية', 'الشركة الموردة'],
          rows,
        };
      }
      case 'RPT_VALUATION': {
        const rows = state.warehouses
          .filter((w) => reportCommodityId === 'ALL' || w.commodityId === reportCommodityId)
          .map((w, idx) => {
            const c = state.commodities.find((x) => x.id === w.commodityId);
            const curBal = computeCommodityCurrentBalance({
              openingBalance: w.openingBalance,
              inboundQty: w.totalIn,
              outboundQty: w.totalOut,
              inboundReturns: w.inboundReturns,
              outboundReturns: w.outboundReturns,
              approvedAdjustments: w.approvedAdjustments,
            });
            const officialVal = computeCommodityStockValue(curBal, c?.officialPrice || 0);
            const costVal = computeCommodityStockValue(curBal, c?.supplyCostPrice || 0);
            const disbursedVal = computeDisbursedQuantityValue(w.totalOut, c?.officialPrice || 0);
            return [
              idx + 1,
              w.warehouseName,
              c?.name || w.commodityId,
              curBal,
              `${c?.officialPrice || 0} ج.م`,
              `${officialVal.toLocaleString()} ج.م`,
              `${costVal.toLocaleString()} ج.م`,
              `${disbursedVal.toLocaleString()} ج.م`,
            ];
          });
        return {
          title: '8. تقرير القيمة المالية للمخزون والمنصرف',
          headers: ['م', 'المخزن', 'السلعة', 'الرصيد الحالي', 'السعر الرسمي', 'قيمة المخزون (رسمي)', 'قيمة المخزون (تكلفة)', 'قيمة الكميات المنصرفة'],
          rows,
        };
      }
      case 'RPT_MERCHANT_PERF': {
        const rows = state.merchants
          .filter((m) => {
            if (reportVillage !== 'ALL' && m.village !== reportVillage) return false;
            if (reportMerchantId !== 'ALL' && m.id !== reportMerchantId) return false;
            return true;
          })
          .map((m, idx) => {
            const reqs = state.requisitions.filter((r) => r.merchantId === m.id);
            const prescribed = reqs.reduce(
              (s, r) => s + r.lines.reduce((ls, l) => ls + l.requestedQty, 0),
              0
            );
            const distributed = reqs.reduce(
              (s, r) => s + r.lines.reduce((ls, l) => ls + l.deliveredQty, 0),
              0
            );
            const execPct = computeMonthlyQuotaExecutionPct(distributed, prescribed);
            const violationsCount = state.inspections.filter(
              (ins) => ins.merchantId === m.id && ins.inspectionResult === 'مخالف'
            ).length;
            return [
              idx + 1,
              m.merchantName,
              m.ownerName,
              m.village,
              m.linkedCardsCount,
              m.linkedBeneficiariesCount,
              prescribed,
              distributed,
              `${execPct}%`,
              violationsCount,
              m.activityStatus,
            ];
          });
        return {
          title: '9. تقرير أداء التجار ومنافذ التوزيع',
          headers: ['م', 'اسم المنفذ', 'اسم التاجر', 'القرية', 'البطاقات', 'المستفيدون', 'الحصة المقررة', 'الكمية الموزعة', 'نسبة التنفيذ', 'المخالفات', 'الحالة'],
          rows,
        };
      }
      case 'RPT_BENEFICIARIES':
      default: {
        const rows = state.merchants
          .filter((m) => {
            if (reportVillage !== 'ALL' && m.village !== reportVillage) return false;
            if (reportMerchantId !== 'ALL' && m.id !== reportMerchantId) return false;
            return true;
          })
          .map((m, idx) => {
            const avgPerCard =
              m.linkedCardsCount > 0 ? round2(m.linkedBeneficiariesCount / m.linkedCardsCount) : 0;
            const monthlySupportTotal = round2(
              m.linkedBeneficiariesCount * state.settings.supportPerBeneficiary
            );
            const disbForM = state.disbursements.filter(
              (d) => d.merchantId === m.id && !d.isReversed
            );
            const actualDisbVal = round2(disbForM.reduce((s, d) => s + d.totalSaleValue, 0));
            return [
              idx + 1,
              m.merchantName,
              m.village,
              m.localUnit,
              m.linkedCardsCount,
              m.linkedBeneficiariesCount,
              avgPerCard,
              `${state.settings.supportPerBeneficiary} ج.م`,
              `${monthlySupportTotal.toLocaleString()} ج.م`,
              `${actualDisbVal.toLocaleString()} ج.م`,
            ];
          });
        return {
          title: '10. تقرير إجمالي المستفيدين والبطاقات التموينية ومتوسط نصيب الفرد',
          headers: ['م', 'المنفذ التمويني', 'القرية', 'الوحدة المحلية', 'عدد البطاقات', 'عدد المستفيدين', 'متوسط الأفراد/بطاقة', 'دعم الفرد الشهري', 'إجمالي الاستحقاق الشهري', 'المنصرف الفعلي'],
          rows,
        };
      }
    }
  }, [
    selectedReportType,
    state,
    villages,
    reportVillage,
    reportMerchantId,
    reportCommodityId,
    reportFromDate,
    reportToDate,
  ]);

  const navItems: { id: RationSubView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة التحكم الرئيسية', icon: <ShoppingBasket className="w-3.5 h-3.5" /> },
    { id: 'commodities', label: 'قاعدة بيانات السلع', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'merchants', label: 'منافذ التموين والتجار', icon: <Store className="w-3.5 h-3.5" /> },
    { id: 'requisitions', label: 'الحصص التموينية الشهرية', icon: <Truck className="w-3.5 h-3.5" /> },
    { id: 'warehouses', label: 'حركة المخازن والمشتريات', icon: <Warehouse className="w-3.5 h-3.5" /> },
    { id: 'cards', label: 'البطاقات والمستفيدين', icon: <CreditCard className="w-3.5 h-3.5" /> },
    { id: 'disbursements', label: 'عمليات صرف المواطنين', icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: 'inspections', label: `التنبيهات الذكية والرقابة (${smartAlerts.length})`, icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    { id: 'reports', label: 'مركز التقارير والطباعة (10)', icon: <Printer className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'إعدادات القرارات', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'audit', label: 'سجل التدقيق', icon: <History className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4" dir="rtl" data-testid="ration-commodities-suite">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white rounded-2xl p-5 shadow-lg border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#D4AF37] text-[#0A1628] shadow-md">
            <ShoppingBasket className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black">
              قسم السلع التموينية وإدارة المنافذ والحصص والمخازن
            </h2>
            <p className="text-xs text-[#5EEAD4] font-bold mt-0.5">
              {branchName} • {state.settings.decisionNumber} • دعم الفرد: {state.settings.supportPerBeneficiary} ج.م
              {state.settings.additionalGrantEnabled && ` + منحة إضافية منفصلة: ${state.settings.additionalGrantPerCard2026} ج.م`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportRowsToArabicCsv(
                `السلع_التموينية_${branchName}`,
                activeReportData.headers,
                activeReportData.rows
              )
            }
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printModuleReportA4({
                title: activeReportData.title,
                subtitle: `${state.settings.decisionNumber} • شهر ${state.settings.activeMonth}`,
                branchName,
                headers: activeReportData.headers,
                rows: activeReportData.rows,
                summaryItems: [
                  { label: 'إجمالي السلع المسجلة', value: String(kpis.totalCommodities) },
                  { label: 'قيمة المخزون الحالي', value: `${kpis.stockValuation.toLocaleString()} ج.م` },
                  { label: 'التجار والمنافذ النشطة', value: `${kpis.activeMerchants} / ${kpis.totalMerchants}` },
                  { label: 'نسبة تنفيذ الحصص الشهرية', value: `${kpis.monthlyQuotaExecutionPct}%` },
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
          className={`p-3 rounded-xl border text-xs font-black flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
              : 'bg-rose-50 border-rose-400 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap gap-1.5">
        {navItems.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubView(tab.id)}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
              subView === tab.id
                ? 'bg-[#0A1628] text-[#D4AF37] shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* SubView 1: Main Dashboard (10 KPIs + Unified Bakeries & Commodities Overview + Charts) */}
      {subView === 'dashboard' && (
        <div className="space-y-4">
          {/* Unified Executive Link Card: Bakeries + Supply Commodities */}
          <div className="bg-gradient-to-r from-[#0A1628] via-[#0F2342] to-[#13294B] text-white p-4 rounded-2xl border border-[#D4AF37]/40 shadow-md flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-black text-[#D4AF37]">
                الربط الإحصائي الموحد للمنظومة التموينية ({branchName})
              </div>
              <h3 className="text-sm font-black mt-0.5">
                نظرة تنفيذية شاملة تربط قطاع المخابز البلدية بقطاع السلع التموينية والمنافذ (مع استقلال قواعد البيانات)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15">
                <span className="text-slate-300 font-bold">إجمالي المخابز المسجلة: </span>
                <span className="font-mono font-black text-[#5EEAD4]">{bakeriesCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15">
                <span className="text-slate-300 font-bold">مديونيات المخابز: </span>
                <span className="font-mono font-black text-[#D4AF37]">{round2(totalBakeryDebts).toLocaleString()} ج.م</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15">
                <span className="text-slate-300 font-bold">منافذ التموين والسلع: </span>
                <span className="font-mono font-black text-[#5EEAD4]">{kpis.totalMerchants} منفذ • {kpis.totalCommodities} سلعة</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15">
                <span className="text-slate-300 font-bold">المستفيدون بالبطاقات: </span>
                <span className="font-mono font-black text-emerald-300">{kpis.totalEligible.toLocaleString()} مستفيد</span>
              </div>
            </div>
          </div>

          {/* 10 Requested KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">1. إجمالي السلع المسجلة</div>
              <div className="text-xl font-black text-[#0A1628] font-mono mt-1">{kpis.totalCommodities} صنف</div>
              <div className="text-[11px] font-bold text-[#0D9488]">متاح للصرف التمويني</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">2. إجمالي قيمة المخزون الحالي</div>
              <div className="text-xl font-black text-[#1E40AF] font-mono mt-1">{kpis.stockValuation.toLocaleString()} ج.م</div>
              <div className="text-[11px] font-bold text-slate-500">الرصيد × السعر المعتمد</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">3. عدد التجار ومنافذ التموين</div>
              <div className="text-xl font-black text-[#0A1628] font-mono mt-1">{kpis.activeMerchants} / {kpis.totalMerchants}</div>
              <div className="text-[11px] font-bold text-emerald-700">{kpis.totalCards} بطاقة مربوطة</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">4. إجمالي الحصص الشهرية</div>
              <div className="text-xl font-black text-[#0D9488] font-mono mt-1">{kpis.totalPrescribedMonthlyQuota.toLocaleString()}</div>
              <div className="text-[11px] font-bold text-slate-500">وحدة مقررة للشهر النشط</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">5. إجمالي الكميات الواردة</div>
              <div className="text-xl font-black text-emerald-700 font-mono mt-1">{kpis.totalInboundQty.toLocaleString()}</div>
              <div className="text-[11px] font-bold text-slate-500">إذن إضافة واستلام مخزني</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">6. إجمالي الكميات المنصرفة</div>
              <div className="text-xl font-black text-blue-700 font-mono mt-1">{kpis.totalOutboundQty.toLocaleString()}</div>
              <div className="text-[11px] font-bold text-slate-500">بقيمة {kpis.totalSalesValue.toLocaleString()} ج.م</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">7. الكميات المتبقية بالمخازن</div>
              <div className="text-xl font-black text-[#0A1628] font-mono mt-1">{kpis.totalRemainingStockQty.toLocaleString()}</div>
              <div className="text-[11px] font-bold text-[#0D9488]">رصيد فعلي متاح</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">8. الأصناف منخفضة المخزون</div>
              <div className="text-xl font-black text-rose-700 font-mono mt-1">{kpis.lowStockCount}</div>
              <div className="text-[11px] font-bold text-rose-600">تحت الحد الأدنى للطلب</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">9. قريبة انتهاء الصلاحية</div>
              <div className="text-xl font-black text-amber-700 font-mono mt-1">{kpis.nearExpiryCount}</div>
              <div className="text-[11px] font-bold text-amber-700">خلال 60 يوماً</div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500">10. نسبة تنفيذ الحصص الشهرية</div>
              <div className="text-xl font-black text-[#0D9488] font-mono mt-1">{kpis.monthlyQuotaExecutionPct}%</div>
              <div className="text-[11px] font-bold text-slate-500">(الموزعة ÷ المقررة) × 100</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <h3 className="text-sm font-black text-[#0A1628]">مقارنة منصرف السلع التموينية (كمية وقيمة)</h3>
              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commodityDisbChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                    <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="الكمية" fill="#0D9488" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="القيمة" fill="#1E40AF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <h3 className="text-sm font-black text-[#0A1628]">توزيع منافذ التموين حسب النوع</h3>
              <div className="h-64 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={outletPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {outletPieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SubView 2: Merchants & Outlets (May 2026 116-Merchants Database + Detailed Registry) */}
      {subView === 'merchants' && (
        <div className="space-y-6">
          <RationMerchantsDatabaseMay2026
            state={state}
            branchId={branchId}
            branchName={branchName}
            villages={villages}
            currentUser={currentUser}
            canWrite={permissions.canAdd || permissions.canEdit}
            onUpdateMerchants={(nextMerchants, nextArchives, summaryText) => {
              onChangeState(
                {
                  ...state,
                  merchants: nextMerchants,
                  merchantMonthlyArchives: nextArchives,
                  auditLogs: [
                    appendAudit(
                      'تعديل',
                      'قاعدة بيانات التجار التموينيين (مايو 2026)',
                      'MERCHANTS-MAY26',
                      summaryText
                    ),
                    ...state.auditLogs,
                  ],
                },
                summaryText
              );
            }}
          />
          <ModuleTableToolbar
            title="سجل بيانات التراخيص والحصص التفصيلية للمنافذ والتجار"
            subtitle="تشمل الرقم القومي، السجل التجاري، البطاقة الضريبية، رقم المنفذ، القرية، الوحدة المحلية، البطاقات، المستفيدين، والحصة الشهرية"
            count={filteredMerchants.length}
            addLabel="إضافة تاجر / منفذ تمويني جديد"
            permissions={permissions}
            testIdPrefix="ration-merchants"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'merchant',
                title: 'إضافة تاجر / منفذ تموين جديد',
                fields: merchantFields,
                initialValues: {
                  ownerName: '',
                  merchantName: '',
                  nationalId: '28501011601234',
                  commercialRegNumber: `CR-${Math.floor(10000 + Math.random() * 89999)}`,
                  taxCardNumber: `TX-${Math.floor(100 + Math.random() * 899)}-400`,
                  posMachineNumber: `POS-${Math.floor(10000 + Math.random() * 89999)}`,
                  outletType: 'تاجر تمويني',
                  village: villages[0]?.village || 'بشبيش',
                  localUnit: villages[0]?.localUnits?.[0] || 'بشبيش',
                  detailedAddress: `الشارع العمومي - ${villages[0]?.village || 'بشبيش'}`,
                  phone: '01000000000',
                  linkedCardsCount: 250,
                  linkedBeneficiariesCount: 950,
                  monthlyEntitlementQuota: 47500,
                  cashInsuranceAmount: 40000,
                  openingBalance: 0,
                  licenseNumber: `LIC-${Math.floor(1000 + Math.random() * 8999)}`,
                  activityStartDate: '2022-01-01',
                  licenseExpiryDate: '2027-12-31',
                  activityStatus: 'نشط',
                },
              })
            }
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={merchantSearch}
                  onChange={(e) => setMerchantSearch(e.target.value)}
                  placeholder="بحث باسم التاجر، المنفذ، الرقم القومي، السجل التجاري، أو رقم الماكينة..."
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <select
                value={villageFilter}
                onChange={(e) => setVillageFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كافة القرى والمناطق</option>
                {villages.map((v) => (
                  <option key={v.village} value={v.village}>{v.village}</option>
                ))}
              </select>
              <select
                value={outletTypeFilter}
                onChange={(e) => setOutletTypeFilter(e.target.value as 'ALL' | OutletType)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كل أنواع المنافذ</option>
                <option value="تاجر تمويني">تاجر تمويني</option>
                <option value="منفذ جمعيتي">منفذ جمعيتي</option>
                <option value="مجمع استهلاكي">مجمع استهلاكي</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MerchantActivityStatus)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كل الحالات</option>
                <option value="نشط">نشط</option>
                <option value="موقوف">موقوف</option>
                <option value="ملغي">ملغي</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2.5 px-2 border border-slate-700">م</th>
                    <th className="py-2.5 px-2 border border-slate-700 text-right">اسم التاجر / المنفذ</th>
                    <th className="py-2.5 px-2 border border-slate-700">الرقم القومي</th>
                    <th className="py-2.5 px-2 border border-slate-700">السجل التجاري / الضريبية</th>
                    <th className="py-2.5 px-2 border border-slate-700">رقم المنفذ POS</th>
                    <th className="py-2.5 px-2 border border-slate-700">القرية / الوحدة المحلية</th>
                    <th className="py-2.5 px-2 border border-slate-700">العنوان والهاتف</th>
                    <th className="py-2.5 px-2 border border-slate-700">البطاقات / المستفيدين</th>
                    <th className="py-2.5 px-2 border border-slate-700">الحصة الشهرية المستحقة</th>
                    <th className="py-2.5 px-2 border border-slate-700">بداية ونهاية النشاط</th>
                    <th className="py-2.5 px-2 border border-slate-700">الحالة</th>
                    <th className="py-2.5 px-2 border border-slate-700">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {filteredMerchants.map((m, idx) => {
                    const monthlyQuota =
                      m.monthlyEntitlementQuota ||
                      round2(m.linkedBeneficiariesCount * state.settings.supportPerBeneficiary);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono">{idx + 1}</td>
                        <td className="py-2 px-2 text-right">
                          <div className="font-black text-[#0A1628]">{m.ownerName}</div>
                          <div className="text-[11px] text-slate-500">{m.merchantName} ({m.outletType})</div>
                        </td>
                        <td className="py-2 px-2 font-mono">{m.nationalId || '-'}</td>
                        <td className="py-2 px-2 font-mono text-[11px]">
                          <div>س.ت: {m.commercialRegNumber || '-'}</div>
                          <div className="text-slate-500">ب.ض: {m.taxCardNumber || '-'}</div>
                        </td>
                        <td className="py-2 px-2 font-mono font-black text-[#0A1628]">{m.posMachineNumber}</td>
                        <td className="py-2 px-2">
                          <div>{m.village}</div>
                          <div className="text-[11px] text-slate-500">{m.localUnit}</div>
                        </td>
                        <td className="py-2 px-2 text-[11px]">
                          <div>{m.detailedAddress}</div>
                          <div className="font-mono text-[#0D9488]">{m.phone || '-'}</div>
                        </td>
                        <td className="py-2 px-2 font-mono tabular-nums">
                          {m.linkedCardsCount} بطاقة / {m.linkedBeneficiariesCount} فرد
                        </td>
                        <td className="py-2 px-2 font-mono tabular-nums text-[#0D9488] font-black">
                          {monthlyQuota.toLocaleString()} ج.م
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px]">
                          <div>من: {m.activityStartDate || m.licenseIssueDate}</div>
                          <div>إلى: {m.activityEndDate || m.licenseExpiryDate}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                              m.activityStatus === 'نشط'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {m.activityStatus}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={m.merchantName}
                            updatedAt={m.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`merchant-${m.id}`}
                            onEdit={() =>
                              setActiveModal({
                                mode: 'edit',
                                entity: 'merchant',
                                targetId: m.id,
                                title: `تعديل بيانات التاجر والمنفذ: ${m.merchantName}`,
                                fields: merchantFields,
                                initialValues: {
                                  ...m,
                                  activityStartDate: m.activityStartDate || m.licenseIssueDate,
                                  monthlyEntitlementQuota: monthlyQuota,
                                },
                              })
                            }
                            onDelete={() => {
                              const check = checkRationDeleteIntegrity(state, 'merchant', m.id);
                              setDeleteTarget({
                                entityTitle: `حذف المنفذ التمويني: ${m.merchantName}`,
                                summary: [
                                  { label: 'اسم المنفذ', value: m.merchantName },
                                  { label: 'اسم التاجر', value: m.ownerName },
                                  { label: 'القرية', value: m.village },
                                  { label: 'رقم المنفذ', value: m.posMachineNumber },
                                ],
                                canDelete: check.canDelete,
                                blockReason: check.reason,
                                onConfirm: () => {
                                  onChangeState(
                                    {
                                      ...state,
                                      merchants: state.merchants.filter((x) => x.id !== m.id),
                                      auditLogs: [
                                        appendAudit('حذف', 'سجل التجار والمنافذ', m.id, `حذف المنفذ ${m.merchantName}`),
                                        ...state.auditLogs,
                                      ],
                                    },
                                    `تم حذف المنفذ (${m.merchantName}) من Supabase`
                                  );
                                  notify('ok', `تم حذف المنفذ (${m.merchantName}) بنجاح.`);
                                },
                              });
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubView 3: Cards & Beneficiaries Follow-up */}
      {subView === 'cards' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="متابعة البطاقات التموينية والمستفيدين ونصيب الفرد"
            subtitle="متابعة عدد البطاقات لكل تاجر، عدد الأفراد المستفيدين، متوسط نصيب الفرد، ومقارنة المخصص بالمنصرف الفعلي"
            count={state.cards.length}
            addLabel="إضافة بطاقة تموينية جديدة"
            permissions={permissions}
            testIdPrefix="ration-cards"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'card',
                title: 'إضافة بطاقة تموينية جديدة',
                fields: cardFields,
                initialValues: {
                  cardNumber: `11700${Math.floor(1000000 + Math.random() * 8999999)}`,
                  headOfFamilyName: '',
                  headNationalId: '',
                  merchantId: state.merchants[0]?.id || '',
                  village: villages[0]?.village || 'بشبيش',
                  localUnit: villages[0]?.localUnits?.[0] || 'بشبيش',
                  status: 'سارية',
                  hasAdditionalGrant: true,
                  additionalGrantAmount: state.settings.additionalGrantPerCard2026,
                },
              })
            }
          />

          {/* Master Cards Table */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم البطاقة</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">اسم رب الأسرة</th>
                  <th className="py-2 px-2 border border-slate-700">الرقم القومي</th>
                  <th className="py-2 px-2 border border-slate-700">المنفذ المربوط</th>
                  <th className="py-2 px-2 border border-slate-700">القرية</th>
                  <th className="py-2 px-2 border border-slate-700">الأفراد (مستحق / إجمالي)</th>
                  <th className="py-2 px-2 border border-slate-700">الحالة</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.cards.map((c) => {
                  const m = state.merchants.find((x) => x.id === c.merchantId);
                  const elig = countEligibleBeneficiaries(c.members);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCardId(c.id)}
                      className={`cursor-pointer transition ${
                        selectedCard?.id === c.id ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-2 font-mono font-black text-[#0A1628]">{c.cardNumber}</td>
                      <td className="py-2 px-2 text-right font-black">{c.headOfFamilyName}</td>
                      <td className="py-2 px-2 font-mono">{c.headNationalId}</td>
                      <td className="py-2 px-2">{m?.merchantName || c.merchantId}</td>
                      <td className="py-2 px-2">{c.village}</td>
                      <td className="py-2 px-2 font-mono text-[#0D9488]">
                        {elig} / {c.members.length}
                      </td>
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-black">
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                        <ModuleRowActions
                          entityLabel={`بطاقة ${c.cardNumber}`}
                          updatedAt={c.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`card-${c.id}`}
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'card',
                              targetId: c.id,
                              title: `تعديل البطاقة التموينية: ${c.cardNumber}`,
                              fields: cardFields,
                              initialValues: { ...c },
                            })
                          }
                          onDelete={() => {
                            const check = checkRationDeleteIntegrity(state, 'card', c.id);
                            setDeleteTarget({
                              entityTitle: `حذف البطاقة التموينية: ${c.cardNumber}`,
                              summary: [
                                { label: 'رقم البطاقة', value: c.cardNumber },
                                { label: 'رب الأسرة', value: c.headOfFamilyName },
                                { label: 'عدد الأفراد', value: c.members.length },
                              ],
                              canDelete: check.canDelete,
                              blockReason: check.reason,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    cards: state.cards.filter((x) => x.id !== c.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'البطاقات التموينية', c.id, `حذف بطاقة ${c.cardNumber}`),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف البطاقة (${c.cardNumber})`
                                );
                                notify('ok', `تم حذف البطاقة التموينية (${c.cardNumber}) بنجاح.`);
                              },
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedCard && selectedCardSummary && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-black text-[#0A1628] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#0D9488]" />
                    <span>
                      تفاصيل أفراد واستحقاق البطاقة المختارة ({selectedCard.cardNumber} — {selectedCard.headOfFamilyName})
                    </span>
                  </h3>
                  <p className="text-xs font-bold text-slate-500">
                    {state.settings.decisionNumber} • شهر {state.settings.activeMonth}
                  </p>
                </div>
                {permissions.canAdd && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveModal({
                        mode: 'add',
                        entity: 'member',
                        title: `إضافة فرد مستفيد للبطاقة (${selectedCard.cardNumber})`,
                        fields: memberFields,
                        initialValues: {
                          fullName: '',
                          nationalId: '',
                          relation: 'ابن',
                          status: 'مستحق',
                          suspensionReason: '',
                        },
                      })
                    }
                    className="px-3.5 py-2 bg-[#0A1628] hover:bg-[#13294B] text-[#D4AF37] rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة فرد للبطاقة</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-slate-800 text-white font-black">
                    <tr>
                      <th className="py-2 px-2 border border-slate-700 text-right">اسم الفرد المستفيد</th>
                      <th className="py-2 px-2 border border-slate-700">الرقم القومي</th>
                      <th className="py-2 px-2 border border-slate-700">صلة القرابة</th>
                      <th className="py-2 px-2 border border-slate-700">حالة الاستحقاق</th>
                      <th className="py-2 px-2 border border-slate-700">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold">
                    {selectedCard.members.map((mb) => (
                      <tr key={mb.id}>
                        <td className="py-1.5 px-2 text-right font-black text-[#0A1628]">{mb.fullName}</td>
                        <td className="py-1.5 px-2 font-mono">{mb.nationalId}</td>
                        <td className="py-1.5 px-2">{mb.relation}</td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                              mb.status === 'مستحق' ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {mb.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          <ModuleRowActions
                            entityLabel={mb.fullName}
                            permissions={permissions}
                            onEdit={() =>
                              setActiveModal({
                                mode: 'edit',
                                entity: 'member',
                                targetId: mb.id,
                                title: `تعديل بيانات الفرد: ${mb.fullName}`,
                                fields: memberFields,
                                initialValues: { ...mb },
                              })
                            }
                            onDelete={() =>
                              setDeleteTarget({
                                entityTitle: `حذف فرد من البطاقة (${selectedCard.cardNumber})`,
                                summary: [
                                  { label: 'الاسم', value: mb.fullName },
                                  { label: 'الرقم القومي', value: mb.nationalId },
                                  { label: 'صلة القرابة', value: mb.relation },
                                ],
                                canDelete: selectedCard.members.length > 1,
                                blockReason:
                                  selectedCard.members.length <= 1
                                    ? 'لا يمكن حذف الفرد الوحيد المتبقي بالبطاقة؛ يمكنك حذف البطاقة بالكامل أو تعديل بياناته.'
                                    : undefined,
                                onConfirm: () => {
                                  const nextMembers = selectedCard.members.filter((x) => x.id !== mb.id);
                                  onChangeState(
                                    {
                                      ...state,
                                      cards: state.cards.map((c) =>
                                        c.id === selectedCard.id ? { ...c, members: nextMembers } : c
                                      ),
                                      auditLogs: [
                                        appendAudit('حذف', 'أفراد البطاقة التموينية', mb.id, mb.fullName),
                                        ...state.auditLogs,
                                      ],
                                    },
                                    `تم حذف الفرد (${mb.fullName}) من البطاقة`
                                  );
                                  notify('ok', `تم حذف الفرد (${mb.fullName}) وتحديث المقررات.`);
                                },
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-slate-500 font-bold">الأفراد المستحقون الفعليون</div>
                  <div className="text-xl font-black text-[#0A1628] font-mono">
                    {selectedCardSummary.eligibleBeneficiaries} من {selectedCard.members.length}
                  </div>
                </div>
                <div className="p-3 bg-teal-50 rounded-xl border border-teal-200">
                  <div className="text-teal-800 font-bold">قيمة الدعم التمويني المتاح</div>
                  <div className="text-xl font-black text-[#0D9488] font-mono">
                    {selectedCardSummary.availableSupportBudget.toLocaleString()} ج.م
                  </div>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="text-amber-800 font-bold">المنحة الإضافية 2026 (منفصلة)</div>
                  <div className="text-xl font-black text-amber-800 font-mono">
                    {selectedCardSummary.additionalGrantAmount.toLocaleString()} ج.م
                  </div>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <div className="text-blue-800 font-bold">الدعم المنصرف / المتبقي</div>
                  <div className="text-xl font-black text-[#1E40AF] font-mono">
                    {selectedCardSummary.disbursedSupportValue} / {selectedCardSummary.remainingSupportBudget}
                  </div>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-xl">
                  <div className="text-slate-300 font-bold">نسبة استهلاك الدعم</div>
                  <div className="text-xl font-black text-[#D4AF37] font-mono">
                    {selectedCardSummary.supportConsumptionPct}%
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead className="bg-[#0A1628] text-white font-black">
                    <tr>
                      <th className="py-2 px-2 border border-slate-700 text-right">السلعة</th>
                      <th className="py-2 px-2 border border-slate-700">السعر الرسمي</th>
                      <th className="py-2 px-2 border border-slate-700">المقرر الفعلي</th>
                      <th className="py-2 px-2 border border-slate-700">المنصرف</th>
                      <th className="py-2 px-2 border border-slate-700">المتبقي</th>
                      <th className="py-2 px-2 border border-slate-700">نسبة الصرف</th>
                      <th className="py-2 px-2 border border-slate-700">نسبة المتبقي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold">
                    {selectedCardSummary.commoditiesBreakdown.map((item) => (
                      <tr key={item.commodityId}>
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{item.commodityName}</td>
                        <td className="py-2 px-2 font-mono">{item.officialUnitPrice} ج.م</td>
                        <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{item.effectiveQuota}</td>
                        <td className="py-2 px-2 font-mono text-blue-700">{item.disbursedQty}</td>
                        <td className="py-2 px-2 font-mono font-black">{item.remainingQty}</td>
                        <td className="py-2 px-2 font-mono">{item.disbursedPct}%</td>
                        <td className="py-2 px-2 font-mono">{item.remainingPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SubView 4: Main Commodities Database (16 Comprehensive Fields + Automatic Equations) */}
      {subView === 'commodities' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="قاعدة البيانات الرئيسية للسلع التموينية"
            subtitle="كود الصنف، الاسم، التصنيف، الوحدة، السعر الرسمي، التكلفة، الافتتاحي، الوارد، المنصرف، الرصيد الحالي، الحد الأدنى والأقصى، المورد، الصلاحية، التشغيلة، والحالة"
            count={filteredCommodities.length}
            addLabel="إضافة سلعة تموينية جديدة"
            permissions={permissions}
            testIdPrefix="ration-commodities"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'commodity',
                title: 'إضافة سلعة تموينية جديدة',
                fields: commodityFields,
                initialValues: {
                  code: `COM-${Math.floor(100 + Math.random() * 899)}`,
                  name: '',
                  category: 'سلع أساسية',
                  unit: 'كيلو',
                  officialPrice: 15,
                  supplyCostPrice: 14.25,
                  openingBalance: 500,
                  inboundQty: 1200,
                  outboundQty: 800,
                  reorderLevel: 250,
                  maxStockLevel: 4000,
                  supplierCompany: 'الشركة العامة لتجارة الجملة',
                  expiryDate: '2027-06-30',
                  batchNumber: `BCH-2026-${Math.floor(10 + Math.random() * 89)}`,
                  availabilityStatus: 'متاح',
                  monthlyQuotaPerBeneficiary: 1,
                  maxPerCard: 4,
                  commissionValue: 0.75,
                  decisionNumber: state.settings.decisionNumber,
                },
              })
            }
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={commoditySearch}
                  onChange={(e) => setCommoditySearch(e.target.value)}
                  placeholder="بحث فوري بكود الصنف، اسم السلعة، التصنيف، الشركة الموردة، أو رقم التشغيلة..."
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2.5 px-2 border border-slate-700">كود الصنف</th>
                    <th className="py-2.5 px-2 border border-slate-700 text-right">اسم السلعة</th>
                    <th className="py-2.5 px-2 border border-slate-700">التصنيف / الوحدة</th>
                    <th className="py-2.5 px-2 border border-slate-700">السعر الرسمي / التكلفة</th>
                    <th className="py-2.5 px-2 border border-slate-700">الافتتاحي</th>
                    <th className="py-2.5 px-2 border border-slate-700">الوارد</th>
                    <th className="py-2.5 px-2 border border-slate-700">المنصرف</th>
                    <th className="py-2.5 px-2 border border-slate-700">الرصيد الحالي</th>
                    <th className="py-2.5 px-2 border border-slate-700">قيمة المخزون</th>
                    <th className="py-2.5 px-2 border border-slate-700">الحد الأدنى / الأقصى</th>
                    <th className="py-2.5 px-2 border border-slate-700">المورد والتشغيلة</th>
                    <th className="py-2.5 px-2 border border-slate-700">تاريخ الصلاحية</th>
                    <th className="py-2.5 px-2 border border-slate-700">حالة الصنف</th>
                    <th className="py-2.5 px-2 border border-slate-700">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {filteredCommodities.map((c) => {
                    const whs = state.warehouses.filter((w) => w.commodityId === c.id);
                    const openBal =
                      typeof c.openingBalance === 'number'
                        ? c.openingBalance
                        : whs.reduce((s, w) => s + w.openingBalance, 0);
                    const inQty =
                      typeof c.inboundQty === 'number'
                        ? c.inboundQty
                        : whs.reduce((s, w) => s + w.totalIn, 0);
                    const outQty =
                      typeof c.outboundQty === 'number'
                        ? c.outboundQty
                        : whs.reduce((s, w) => s + w.totalOut, 0);
                    const curBal = computeCommodityCurrentBalance({
                      openingBalance: openBal,
                      inboundQty: inQty,
                      outboundQty: outQty,
                      inboundReturns: c.inboundReturns,
                      outboundReturns: c.outboundReturns,
                    });
                    const stockVal = computeCommodityStockValue(curBal, c.officialPrice);
                    const minLvl = c.minStockLevel ?? c.reorderLevel;
                    const maxLvl = c.maxStockLevel ?? 5000;
                    const avail = c.availabilityStatus || (c.isActive ? 'متاح' : 'موقوف');
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono font-black text-[#0A1628]">{c.code}</td>
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{c.name}</td>
                        <td className="py-2 px-2">
                          <div>{c.category}</div>
                          <div className="text-[11px] text-[#0D9488]">{c.unit}</div>
                        </td>
                        <td className="py-2 px-2 font-mono">
                          <div className="text-[#0D9488] font-black">{c.officialPrice} ج.م</div>
                          <div className="text-[11px] text-slate-500">تكلفة: {c.supplyCostPrice} ج.م</div>
                        </td>
                        <td className="py-2 px-2 font-mono">{openBal}</td>
                        <td className="py-2 px-2 font-mono text-emerald-700">{inQty}</td>
                        <td className="py-2 px-2 font-mono text-rose-700">{outQty}</td>
                        <td className="py-2 px-2 font-mono font-black text-[#1E40AF]">{curBal}</td>
                        <td className="py-2 px-2 font-mono font-black text-[#0A1628]">
                          {stockVal.toLocaleString()} ج.م
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px]">
                          <div>أدنى: {minLvl}</div>
                          <div>أقصى: {maxLvl}</div>
                        </td>
                        <td className="py-2 px-2 text-[11px]">
                          <div>{c.supplierCompany}</div>
                          <div className="font-mono text-slate-500">{c.batchNumber || 'BCH-2026'}</div>
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px]">{c.expiryDate || '2027-06-30'}</td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                              avail === 'متاح'
                                ? 'bg-emerald-100 text-emerald-900'
                                : avail === 'غير متاح'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {avail}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={c.name}
                            updatedAt={c.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`commodity-${c.id}`}
                            onEdit={() =>
                              setActiveModal({
                                mode: 'edit',
                                entity: 'commodity',
                                targetId: c.id,
                                title: `تعديل السلعة التموينية: ${c.name}`,
                                fields: commodityFields,
                                initialValues: {
                                  ...c,
                                  openingBalance: openBal,
                                  inboundQty: inQty,
                                  outboundQty: outQty,
                                  reorderLevel: minLvl,
                                  maxStockLevel: maxLvl,
                                  batchNumber: c.batchNumber || 'BCH-2026-01',
                                  expiryDate: c.expiryDate || '2027-06-30',
                                  availabilityStatus: avail,
                                },
                              })
                            }
                            onDelete={() => {
                              const check = checkRationDeleteIntegrity(state, 'commodity', c.id);
                              setDeleteTarget({
                                entityTitle: `حذف السلعة التموينية: ${c.name}`,
                                summary: [
                                  { label: 'الكود', value: c.code },
                                  { label: 'السلعة', value: c.name },
                                  { label: 'السعر الرسمي', value: `${c.officialPrice} ج.م` },
                                ],
                                canDelete: check.canDelete,
                                blockReason: check.reason,
                                onConfirm: () => {
                                  onChangeState(
                                    {
                                      ...state,
                                      commodities: state.commodities.filter((x) => x.id !== c.id),
                                      auditLogs: [
                                        appendAudit('حذف', 'قاعدة بيانات السلع التموينية', c.id, c.name),
                                        ...state.auditLogs,
                                      ],
                                    },
                                    `تم حذف السلعة (${c.name})`
                                  );
                                  notify('ok', `تم حذف السلعة (${c.name}) بنجاح.`);
                                },
                              });
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubView 5: Citizen Disbursements */}
      {subView === 'disbursements' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="سجل عمليات صرف المقررات التموينية للمواطنين"
            subtitle="إضافة وتعديل وحذف عمليات صرف البطاقات مع التحديث اللحظي للأرصدة والعمولات في Supabase"
            count={state.disbursements.length}
            addLabel="إضافة عملية صرف جديدة"
            permissions={permissions}
            testIdPrefix="ration-disbursements"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'disbursement',
                title: 'إضافة عملية صرف مقررات تموينية',
                fields: disbursementFields,
                initialValues: {
                  operationNumber: `POS-OP-${Math.floor(10000 + Math.random() * 89999)}`,
                  date: new Date().toISOString().split('T')[0],
                  cardId: state.cards[0]?.id || '',
                  commodityId: state.commodities[0]?.id || '',
                  quantity: 2,
                  supportDeducted: 25.2,
                  collectionMethod: 'بطاقة تموينية',
                  employeeName: currentUser?.fullName || 'مسؤول الصرف',
                },
              })
            }
          />

          {!isViewer && (
            <form onSubmit={handleRegisterDisbursement} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628]">
                تسجيل سريع لعملية صرف مواطن (يتحقق آلياً من عدم التكرار ومن المقرر ومن رصيد المخزن)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
                <input
                  type="text"
                  value={disbOpNo}
                  onChange={(e) => setDisbOpNo(e.target.value)}
                  placeholder="رقم العملية POS *"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <select
                  value={disbCardId}
                  onChange={(e) => setDisbCardId(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  {state.cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.cardNumber} - {c.headOfFamilyName}</option>
                  ))}
                </select>
                <select
                  value={disbCommodityId}
                  onChange={(e) => setDisbCommodityId(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  {state.commodities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.5"
                  value={disbQty}
                  onChange={(e) => setDisbQty(Number(e.target.value) || 0)}
                  placeholder="الكمية"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <input
                  type="number"
                  step="0.5"
                  value={disbSupportUsed}
                  onChange={(e) => setDisbSupportUsed(Number(e.target.value) || 0)}
                  placeholder="المخصوم من الدعم"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <button type="submit" className="px-4 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
                  تنفيذ الصرف
                </button>
              </div>
            </form>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم العملية</th>
                  <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                  <th className="py-2 px-2 border border-slate-700">السلعة</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية</th>
                  <th className="py-2 px-2 border border-slate-700">سعر الوحدة التاريخي</th>
                  <th className="py-2 px-2 border border-slate-700">إجمالي البيع</th>
                  <th className="py-2 px-2 border border-slate-700">دعم مخصوم</th>
                  <th className="py-2 px-2 border border-slate-700">فرق المواطن</th>
                  <th className="py-2 px-2 border border-slate-700">عمولة التاجر</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.disbursements.map((d) => {
                  const comm = state.commodities.find((c) => c.id === d.commodityId);
                  return (
                    <tr key={d.id}>
                      <td className="py-2 px-2 font-mono">{d.operationNumber}</td>
                      <td className="py-2 px-2 font-mono">{d.date}</td>
                      <td className="py-2 px-2">{comm?.name || d.commodityId}</td>
                      <td className="py-2 px-2 font-mono">{d.quantity}</td>
                      <td className="py-2 px-2 font-mono">{d.officialUnitPriceAtSale} ج.م</td>
                      <td className="py-2 px-2 font-mono font-black">{d.totalSaleValue} ج.م</td>
                      <td className="py-2 px-2 font-mono text-[#0D9488]">{d.supportDeducted} ج.م</td>
                      <td className="py-2 px-2 font-mono">{d.citizenPaidAmount} ج.م</td>
                      <td className="py-2 px-2 font-mono text-emerald-700">{d.commissionEarned} ج.م</td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`عملية ${d.operationNumber}`}
                          updatedAt={d.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`disb-${d.id}`}
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'disbursement',
                              targetId: d.id,
                              title: `تعديل عملية الصرف: ${d.operationNumber}`,
                              fields: disbursementFields,
                              initialValues: { ...d },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف عملية الصرف: ${d.operationNumber}`,
                              summary: [
                                { label: 'رقم العملية', value: d.operationNumber },
                                { label: 'السلعة', value: comm?.name || d.commodityId },
                                { label: 'الكمية', value: d.quantity },
                                { label: 'القيمة', value: `${d.totalSaleValue} ج.م` },
                              ],
                              canDelete: true,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    disbursements: state.disbursements.filter((x) => x.id !== d.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'صرف المواطنين', d.id, d.operationNumber),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف عملية الصرف (${d.operationNumber})`
                                );
                                notify('ok', `تم حذف عملية الصرف (${d.operationNumber}) بنجاح.`);
                              },
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

      {/* SubView 6: Warehouses & Inventory Movements (with Reversal-Only Control) */}
      {subView === 'warehouses' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="حركة المخازن والمشتريات والأرصدة الفعلية"
            subtitle="الرصيد الحالي = الرصيد الافتتاحي + الوارد - المنصرف + المرتجعات الداخلة - المرتجعات الخارجة (يتحدث تلقائياً فور اعتماد أي حركة)"
            count={state.warehouses.length}
            addLabel="إضافة رصيد مخزني جديد"
            permissions={permissions}
            testIdPrefix="ration-warehouses"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'warehouse',
                title: 'إضافة رصيد مخزني لسلعة تموينية',
                fields: warehouseFields,
                initialValues: {
                  warehouseName: `مخزن ${state.merchants[0]?.merchantName || branchName}`,
                  merchantId: state.merchants[0]?.id || '',
                  commodityId: state.commodities[0]?.id || '',
                  openingBalance: 300,
                  totalIn: 500,
                  totalOut: 200,
                  inboundReturns: 0,
                  outboundReturns: 0,
                  approvedAdjustments: 0,
                  physicalCount: 600,
                  reorderLevel: 250,
                  expiryDate: '2027-06-30',
                },
              })
            }
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700 text-right">المخزن والسلعة</th>
                  <th className="py-2 px-2 border border-slate-700">الافتتاحي</th>
                  <th className="py-2 px-2 border border-slate-700">الوارد</th>
                  <th className="py-2 px-2 border border-slate-700">المنصرف</th>
                  <th className="py-2 px-2 border border-slate-700">مرتجع (داخل/خارج)</th>
                  <th className="py-2 px-2 border border-slate-700">الرصيد الحالي</th>
                  <th className="py-2 px-2 border border-slate-700">قيمة المخزون</th>
                  <th className="py-2 px-2 border border-slate-700">الجرد الفعلي / الفرق</th>
                  <th className="py-2 px-2 border border-slate-700">التنبيهات الآلية</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.warehouses.map((w) => {
                  const comm = state.commodities.find((c) => c.id === w.commodityId);
                  const status = computeWarehouseStockStatus(w, comm?.officialPrice || 0);
                  return (
                    <tr key={w.id}>
                      <td className="py-2 px-2 text-right font-black text-[#0A1628]">
                        {w.warehouseName} — {comm?.name || w.commodityId}
                      </td>
                      <td className="py-2 px-2 font-mono">{w.openingBalance}</td>
                      <td className="py-2 px-2 font-mono text-emerald-700">{w.totalIn}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{w.totalOut}</td>
                      <td className="py-2 px-2 font-mono text-[11px]">
                        +{w.inboundReturns} / -{w.outboundReturns}
                      </td>
                      <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{status.bookBalance}</td>
                      <td className="py-2 px-2 font-mono font-black text-[#1E40AF]">
                        {status.stockValue.toLocaleString()} ج.م
                      </td>
                      <td className="py-2 px-2 font-mono">
                        {w.physicalCount ?? status.bookBalance} ({status.varianceType}: {status.inventoryVariance})
                      </td>
                      <td className="py-2 px-2 text-[11px]">
                        {status.alerts.length === 0 ? (
                          <span className="text-emerald-700 font-black">مطابق وآمن</span>
                        ) : (
                          <span className="text-rose-700 font-black">{status.alerts.join(' · ')}</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={w.warehouseName}
                          updatedAt={w.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`warehouse-${w.id}`}
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'warehouse',
                              targetId: w.id,
                              title: `تعديل رصيد وجرد المخزن: ${w.warehouseName}`,
                              fields: warehouseFields,
                              initialValues: {
                                ...w,
                                physicalCount: w.physicalCount ?? status.bookBalance,
                              },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف رصيد المخزن: ${w.warehouseName}`,
                              summary: [
                                { label: 'المخزن', value: w.warehouseName },
                                { label: 'السلعة', value: comm?.name || w.commodityId },
                                { label: 'الرصيد الدفتري', value: status.bookBalance },
                              ],
                              canDelete: true,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    warehouses: state.warehouses.filter((x) => x.id !== w.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'أرصدة المخازن والجرد', w.id, w.warehouseName),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف سجل المخزن (${w.warehouseName})`
                                );
                                notify('ok', `تم حذف سجل المخزن (${w.warehouseName}) بنجاح.`);
                              },
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

          {/* Inventory Movements Sub-Table (Control #4: Approved movements cannot be deleted directly; use Reversal Entry) */}
          <ModuleTableToolbar
            title="سجل أذون الإضافة والصرف والمرتجعات والتحويلات وفواتير الموردين"
            subtitle="الحركات المعتمدة لا تُحذف مباشرة لضمان الرقابة المرجعية — يتم التصحيح عبر قيد عكسي موثق (قيد عكسي مخزني)"
            count={state.movements.length}
            addLabel="تسجيل إذن حركة مخزنية / فاتورة مورد"
            permissions={permissions}
            testIdPrefix="ration-movements"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'movement',
                title: 'تسجيل حركة مخزنية جديدة (إذن إضافة / صرف / مرتجع / تحويل / تسوية)',
                fields: movementFields,
                initialValues: {
                  documentNumber: `MOV-${Date.now().toString().slice(-5)}`,
                  movementDate: new Date().toISOString().split('T')[0],
                  movementType: 'RECEIPT_IN',
                  merchantId: state.merchants[0]?.id || '',
                  warehouseName: `مخزن ${state.merchants[0]?.merchantName || branchName}`,
                  targetWarehouseName: '',
                  supplierName: 'الشركة العامة لتجارة الجملة',
                  invoiceNumber: `SUP-INV-${Math.floor(1000 + Math.random() * 8999)}`,
                  commodityId: state.commodities[0]?.id || '',
                  quantity: 100,
                  unitPrice: state.commodities[0]?.supplyCostPrice || 12.1,
                  approvedBy: currentUser?.fullName || 'أمين المخزن',
                  notes: '',
                },
              })
            }
          />
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم المستند</th>
                  <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                  <th className="py-2 px-2 border border-slate-700">نوع الحركة</th>
                  <th className="py-2 px-2 border border-slate-700">المخزن / المورد / الفاتورة</th>
                  <th className="py-2 px-2 border border-slate-700">السلعة</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية</th>
                  <th className="py-2 px-2 border border-slate-700">إجمالي القيمة</th>
                  <th className="py-2 px-2 border border-slate-700">الموظف المسؤول</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الرقابة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.movements.map((mv) => {
                  const comm = state.commodities.find((c) => c.id === mv.commodityId);
                  return (
                    <tr key={mv.id} className={mv.isReversed ? 'opacity-60 bg-slate-100' : ''}>
                      <td className="py-2 px-2 font-mono font-black">{mv.documentNumber}</td>
                      <td className="py-2 px-2 font-mono">{mv.movementDate}</td>
                      <td className="py-2 px-2">{mv.movementType}</td>
                      <td className="py-2 px-2 text-[11px]">
                        <div>{mv.warehouseName}</div>
                        {(mv.supplierName || mv.invoiceNumber) && (
                          <div className="text-slate-500">
                            {mv.supplierName} {mv.invoiceNumber ? `(${mv.invoiceNumber})` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">{comm?.name || mv.commodityId}</td>
                      <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{mv.quantity}</td>
                      <td className="py-2 px-2 font-mono">{mv.totalValue.toLocaleString()} ج.م</td>
                      <td className="py-2 px-2">{mv.approvedBy}</td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`حركة ${mv.documentNumber}`}
                          updatedAt={mv.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`movement-${mv.id}`}
                          extraAction={
                            !isViewer && !mv.isReversed && mv.movementType !== 'REVERSAL' ? (
                              <button
                                type="button"
                                onClick={() => handleReverseInventoryMovement(mv)}
                                className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>قيد عكسي</span>
                              </button>
                            ) : undefined
                          }
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'movement',
                              targetId: mv.id,
                              title: `تعديل بيانات الحركة المخزنية: ${mv.documentNumber}`,
                              fields: movementFields,
                              initialValues: { ...mv },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف الحركة المخزنية: ${mv.documentNumber}`,
                              summary: [
                                { label: 'رقم المستند', value: mv.documentNumber },
                                { label: 'المخزن', value: mv.warehouseName },
                                { label: 'الكمية', value: mv.quantity },
                              ],
                              canDelete: false,
                              blockReason:
                                'وفقاً لضوابط الرقابة المخزنية المعتمدة: لا يُسمح بحذف الحركات المخزنية المعتمدة مباشرة؛ يتم التصحيح عبر زر (قيد عكسي) للاحتفاظ بسجل المراجعة.',
                              onConfirm: () => {},
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

      {/* SubView 7: Monthly Ration Quotas (إدارة الحصص التموينية الشهرية) */}
      {subView === 'requisitions' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="إدارة الحصص التموينية الشهرية للتجار والمنافذ"
            subtitle="الكمية المتبقية = المقررة - المستلمة | نسبة تنفيذ الحصة = (الموزعة ÷ المقررة) × 100 | مربوطة بعدد البطاقات والمستفيدين"
            count={state.requisitions.length}
            addLabel="تسجيل حصة تموينية شهرية جديدة"
            permissions={permissions}
            testIdPrefix="ration-requisitions"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'requisition',
                title: 'تسجيل حصة تموينية شهرية لتاجر / منفذ',
                fields: requisitionFields,
                initialValues: {
                  requestNumber: `QUO-2026-${Math.floor(100 + Math.random() * 899)}`,
                  invoiceNumber: `INV-${Math.floor(10000 + Math.random() * 89999)}`,
                  monthKey: state.settings.activeMonth,
                  requestDate: new Date().toISOString().split('T')[0],
                  merchantId: state.merchants[0]?.id || '',
                  commodityId: state.commodities[0]?.id || '',
                  requestedQty: 500,
                  approvedQty: 450,
                  deliveredQty: 420,
                  status: 'معتمد',
                  notes: '',
                },
              })
            }
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الشهر والسنة</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">اسم التاجر / المنفذ</th>
                  <th className="py-2 px-2 border border-slate-700">البطاقات / المستفيدين</th>
                  <th className="py-2 px-2 border border-slate-700">اسم السلعة</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية المقررة</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية المستلمة</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية الموزعة</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية المتبقية</th>
                  <th className="py-2 px-2 border border-slate-700">نسبة تنفيذ الحصة</th>
                  <th className="py-2 px-2 border border-slate-700">قيمة الحصة بالجنيه</th>
                  <th className="py-2 px-2 border border-slate-700">تاريخ الاستلام</th>
                  <th className="py-2 px-2 border border-slate-700">حالة الصرف</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.requisitions.map((r) => {
                  const m = state.merchants.find((x) => x.id === r.merchantId);
                  const line0 = r.lines[0];
                  const prescribed = line0?.requestedQty || 0;
                  const received = line0?.approvedQty || 0;
                  const distributed = line0?.deliveredQty || 0;
                  const remainingQty = computeRemainingMonthlyQuota(prescribed, received);
                  const execPct = computeMonthlyQuotaExecutionPct(distributed, prescribed);
                  const quotaVal = round2(prescribed * (line0?.supplyPrice || 0));
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono font-black">{r.monthKey}</td>
                      <td className="py-2 px-2 text-right font-black text-[#0A1628]">
                        {m?.merchantName || r.merchantId}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px]">
                        {m?.linkedCardsCount || r.linkedCardsCount} بطاقة / {m?.linkedBeneficiariesCount || r.linkedBeneficiariesCount} فرد
                      </td>
                      <td className="py-2 px-2 font-black text-[#0D9488]">{line0?.commodityName || '-'}</td>
                      <td className="py-2 px-2 font-mono font-black">{prescribed}</td>
                      <td className="py-2 px-2 font-mono text-emerald-700">{received}</td>
                      <td className="py-2 px-2 font-mono text-blue-700">{distributed}</td>
                      <td className="py-2 px-2 font-mono font-black text-amber-700">{remainingQty}</td>
                      <td className="py-2 px-2 font-mono font-black">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] ${
                            execPct >= 85
                              ? 'bg-emerald-100 text-emerald-900'
                              : execPct >= 50
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-rose-100 text-rose-900'
                          }`}
                        >
                          {execPct}%
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono text-[#0A1628] font-black">
                        {quotaVal.toLocaleString()} ج.م
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px]">{r.deliveryDate || r.requestDate}</td>
                      <td className="py-2 px-2 font-black text-emerald-700">{r.status}</td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`حصة ${r.requestNumber}`}
                          updatedAt={r.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`requisition-${r.id}`}
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'requisition',
                              targetId: r.id,
                              title: `تعديل وتسوية الحصة الشهرية: ${r.requestNumber}`,
                              fields: requisitionFields,
                              initialValues: {
                                requestNumber: r.requestNumber,
                                invoiceNumber: r.invoiceNumber,
                                monthKey: r.monthKey,
                                requestDate: r.requestDate,
                                merchantId: r.merchantId,
                                commodityId: line0?.commodityId || state.commodities[0]?.id || '',
                                requestedQty: prescribed,
                                approvedQty: received,
                                deliveredQty: distributed,
                                status: r.status,
                                notes: r.notes || '',
                              },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف سجل الحصة الشهرية: ${r.requestNumber}`,
                              summary: [
                                { label: 'رقم السجل', value: r.requestNumber },
                                { label: 'المنفذ', value: m?.merchantName || r.merchantId },
                                { label: 'القيمة', value: `${quotaVal} ج.م` },
                              ],
                              canDelete: r.status === 'جديد' || r.status === 'ملغي',
                              blockReason:
                                r.status !== 'جديد' && r.status !== 'ملغي'
                                  ? 'لا يمكن حذف حصة شهرية معتمدة أو منفذة مباشرة؛ يمكنك تعديلها لتسجيل تسوية موثقة في سجل التعديلات.'
                                  : undefined,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    requisitions: state.requisitions.filter((x) => x.id !== r.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'الحصص التموينية الشهرية', r.id, r.requestNumber),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف سجل الحصة (${r.requestNumber})`
                                );
                                notify('ok', `تم حذف سجل الحصة (${r.requestNumber}) بنجاح.`);
                              },
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

      {/* SubView 8: Smart Alerts System + Inspections & Citizen Complaints */}
      {subView === 'inspections' && (
        <div className="space-y-5">
          {/* Smart Alerts System (7 Automatic Categories) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-[#0A1628] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>نظام التنبيهات الذكي التلقائي ({smartAlerts.length} تنبيه نشط)</span>
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  يرصد تلقائياً: انخفاض المخزون، قرب انتهاء الصلاحية، تأخر استلام الحصة، العجز المخزني، عدم صرف الحصة بالكامل، فروق الوارد والمنصرف، وانتهاء تراخيص التجار
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">فئة التنبيه الذكي</th>
                    <th className="py-2 px-2 border border-slate-700">الأولوية</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">الجهة / الصنف</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">تفاصيل التنبيه</th>
                    <th className="py-2 px-2 border border-slate-700">المؤشر الرقمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {smartAlerts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-emerald-700 font-black">
                        لا توجد تنبيهات حرجة حالياً — جميع المخازن والحصص والتراخيص ضمن الحدود الآمنة
                      </td>
                    </tr>
                  ) : (
                    smartAlerts.map((al) => (
                      <tr key={al.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-black text-[#0A1628]">{al.categoryLabel}</td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                              al.severity === 'حرجة'
                                ? 'bg-rose-100 text-rose-900'
                                : al.severity === 'متوسطة'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-blue-100 text-blue-900'
                            }`}
                          >
                            {al.severity}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-black">{al.entityName}</td>
                        <td className="py-2 px-2 text-right text-slate-700">{al.message}</td>
                        <td className="py-2 px-2 font-mono font-black text-rose-700">{al.metricValue}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 1: Inspections */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل الحملات التفتيشية والمحاضر التموينية"
              subtitle="إدارة المحاضر التموينية والرقابية وقرارات التصرف القانوني والغرامات"
              count={state.inspections.length}
              addLabel="إضافة محضر تفتيش جديد"
              permissions={permissions}
              testIdPrefix="ration-inspections"
              onAddClick={() =>
                setActiveModal({
                  mode: 'add',
                  entity: 'inspection',
                  title: 'إضافة محضر تفتيش تمويني جديد',
                  fields: inspectionFields,
                  initialValues: {
                    reportNumber: `RPT-2026-${Math.floor(100 + Math.random() * 899)}`,
                    inspectionDateTime: new Date().toISOString().slice(0, 16),
                    merchantId: state.merchants[0]?.id || '',
                    inspectorName: currentUser?.fullName || 'مفتش الرقابة التموينية',
                    violationType: 'بيع بأزيد من السعر الرسمي',
                    violationQuantity: 5,
                    financialValue: 1500,
                    inspectionResult: 'مخالف',
                    dispositionStatus: 'قيد الفحص',
                    legalAction: 'تحرير محضر وإحالة للشئون القانونية',
                    violationDescription: 'ضبط مخالفة أثناء المرور الميداني المفاجئ',
                  },
                })
              }
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">رقم المحضر</th>
                    <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                    <th className="py-2 px-2 border border-slate-700">المنفذ</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">المخالفة</th>
                    <th className="py-2 px-2 border border-slate-700">المفتش</th>
                    <th className="py-2 px-2 border border-slate-700">القيمة المالية</th>
                    <th className="py-2 px-2 border border-slate-700">التصرف</th>
                    <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.inspections.map((ins) => {
                    const m = state.merchants.find((x) => x.id === ins.merchantId);
                    return (
                      <tr key={ins.id}>
                        <td className="py-2 px-2 font-mono font-black">{ins.reportNumber}</td>
                        <td className="py-2 px-2 font-mono">{ins.inspectionDateTime.replace('T', ' ')}</td>
                        <td className="py-2 px-2">{m?.merchantName || ins.village}</td>
                        <td className="py-2 px-2 text-right font-black text-[#0A1628]">{ins.violationType}</td>
                        <td className="py-2 px-2">{ins.inspectorName}</td>
                        <td className="py-2 px-2 font-mono text-rose-700 font-black">{ins.financialValue.toLocaleString()} ج.م</td>
                        <td className="py-2 px-2">{ins.dispositionStatus}</td>
                        <td className="py-2 px-2">
                          <ModuleRowActions
                            entityLabel={`محضر ${ins.reportNumber}`}
                            updatedAt={ins.updatedAt}
                            permissions={permissions}
                            testIdPrefix={`inspection-${ins.id}`}
                            onEdit={() =>
                              setActiveModal({
                                mode: 'edit',
                                entity: 'inspection',
                                targetId: ins.id,
                                title: `تعديل محضر التفتيش: ${ins.reportNumber}`,
                                fields: inspectionFields,
                                initialValues: { ...ins },
                              })
                            }
                            onDelete={() =>
                              setDeleteTarget({
                                entityTitle: `حذف محضر التفتيش: ${ins.reportNumber}`,
                                summary: [
                                  { label: 'رقم المحضر', value: ins.reportNumber },
                                  { label: 'المخالفة', value: ins.violationType },
                                  { label: 'القيمة المالية', value: `${ins.financialValue} ج.م` },
                                ],
                                canDelete: true,
                                onConfirm: () => {
                                  onChangeState(
                                    {
                                      ...state,
                                      inspections: state.inspections.filter((x) => x.id !== ins.id),
                                      auditLogs: [
                                        appendAudit('حذف', 'محاضر التفتيش التمويني', ins.id, ins.reportNumber),
                                        ...state.auditLogs,
                                      ],
                                    },
                                    `تم حذف محضر التفتيش (${ins.reportNumber})`
                                  );
                                  notify('ok', `تم حذف محضر التفتيش (${ins.reportNumber}) بنجاح.`);
                                },
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

          {/* Table 2: Citizen Complaints */}
          <div className="space-y-3">
            <ModuleTableToolbar
              title="سجل شكاوى وبلاغات المواطنين"
              subtitle="متابعة شكاوى المواطنين التموينية وإجراءات الفحص والحل"
              count={state.complaints.length}
              addLabel="إضافة شكوى مواطن جديدة"
              permissions={permissions}
              testIdPrefix="ration-complaints"
              onAddClick={() =>
                setActiveModal({
                  mode: 'add',
                  entity: 'complaint',
                  title: 'إضافة شكوى مواطن جديدة',
                  fields: complaintFields,
                  initialValues: {
                    ticketNumber: `CMP-${Math.floor(1000 + Math.random() * 8999)}`,
                    date: new Date().toISOString().split('T')[0],
                    citizenName: '',
                    phone: '',
                    village: villages[0]?.village || 'بشبيش',
                    category: 'صرف مقررات',
                    status: 'جديدة',
                    resolution: '',
                    details: '',
                  },
                })
              }
            />

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    <th className="py-2 px-2 border border-slate-700">رقم الشكوى</th>
                    <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                    <th className="py-2 px-2 border border-slate-700">اسم المواطن</th>
                    <th className="py-2 px-2 border border-slate-700">القرية</th>
                    <th className="py-2 px-2 border border-slate-700">التصنيف</th>
                    <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل والرد</th>
                    <th className="py-2 px-2 border border-slate-700">الحالة</th>
                    <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {state.complaints.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 px-2 font-mono font-black">{c.ticketNumber}</td>
                      <td className="py-2 px-2 font-mono">{c.date}</td>
                      <td className="py-2 px-2 font-black text-[#0A1628]">{c.citizenName}</td>
                      <td className="py-2 px-2">{c.village}</td>
                      <td className="py-2 px-2">{c.category}</td>
                      <td className="py-2 px-2 text-right">
                        <div>{c.details}</div>
                        {c.resolution && <div className="text-[11px] text-[#0D9488]">الإفادة: {c.resolution}</div>}
                      </td>
                      <td className="py-2 px-2">
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black">{c.status}</span>
                      </td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`شكوى ${c.ticketNumber}`}
                          updatedAt={c.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`complaint-${c.id}`}
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'complaint',
                              targetId: c.id,
                              title: `تعديل شكوى المواطن: ${c.ticketNumber}`,
                              fields: complaintFields,
                              initialValues: { ...c },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف شكوى المواطن: ${c.ticketNumber}`,
                              summary: [
                                { label: 'رقم الشكوى', value: c.ticketNumber },
                                { label: 'المواطن', value: c.citizenName },
                                { label: 'التصنيف', value: c.category },
                              ],
                              canDelete: true,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    complaints: state.complaints.filter((x) => x.id !== c.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'شكاوى المواطنين', c.id, c.ticketNumber),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف الشكوى (${c.ticketNumber})`
                                );
                                notify('ok', `تم حذف شكوى المواطن (${c.ticketNumber}) بنجاح.`);
                              },
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

      {/* SubView 9: Comprehensive 10-Reports Center (التقارير والطباعة والتصدير) */}
      {subView === 'reports' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-[#0A1628]">
                  مركز التقارير التموينية الاحترافي (10 تقارير تفصيلية وإجمالية)
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  فلترة متقدمة حسب التاريخ أو القرية أو التاجر أو السلعة، مع تخصيص الأعمدة والطباعة المباشرة A4 والتصدير إلى Excel
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const visHeaders = activeReportData.headers.filter((_, i) => !hiddenReportCols.includes(i));
                    const visRows = activeReportData.rows.map((r) =>
                      r.filter((_, i) => !hiddenReportCols.includes(i))
                    );
                    exportRowsToArabicCsv(activeReportData.title, visHeaders, visRows);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير التقرير الحالي Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const visHeaders = activeReportData.headers.filter((_, i) => !hiddenReportCols.includes(i));
                    const visRows = activeReportData.rows.map((r) =>
                      r.filter((_, i) => !hiddenReportCols.includes(i))
                    );
                    printModuleReportA4({
                      title: activeReportData.title,
                      subtitle: `${branchName} • ${state.settings.decisionNumber} • شهر ${state.settings.activeMonth}`,
                      branchName,
                      headers: visHeaders,
                      rows: visRows,
                      summaryItems: [
                        { label: 'عدد السجلات بالتقرير', value: String(visRows.length) },
                        { label: 'إجمالي قيمة المخزون', value: `${kpis.stockValuation.toLocaleString()} ج.م` },
                        { label: 'نسبة تنفيذ الحصص', value: `${kpis.monthlyQuotaExecutionPct}%` },
                      ],
                      preparedBy: currentUser?.fullName,
                    });
                  }}
                  className="px-3.5 py-2 bg-[#0A1628] hover:bg-[#13294B] text-[#D4AF37] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة رسمية A4 / PDF</span>
                </button>
              </div>
            </div>

            {/* 10 Report Type Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {(
                [
                  { id: 'RPT_BALANCES', label: '1. أرصدة السلع الحالية' },
                  { id: 'RPT_MOVEMENTS', label: '2. حركة الوارد والمنصرف' },
                  { id: 'RPT_MONTHLY_QUOTAS', label: '3. الحصص الشهرية للتجار' },
                  { id: 'RPT_VILLAGE_DIST', label: '4. توزيع السلع حسب القرى' },
                  { id: 'RPT_VARIANCE', label: '5. العجز والزيادة المخزنية' },
                  { id: 'RPT_LOW_STOCK', label: '6. الأصناف منخفضة المخزون' },
                  { id: 'RPT_EXPIRY', label: '7. السلع المنتهية أو قريبة الانتهاء' },
                  { id: 'RPT_VALUATION', label: '8. القيمة المالية للمخزون' },
                  { id: 'RPT_MERCHANT_PERF', label: '9. أداء التجار والمنافذ' },
                  { id: 'RPT_BENEFICIARIES', label: '10. إجمالي المستفيدين والبطاقات' },
                ] as { id: RationReportType; label: string }[]
              ).map((rt) => (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => {
                    setSelectedReportType(rt.id);
                    setHiddenReportCols([]);
                  }}
                  className={`px-3 py-2 rounded-xl font-black text-right transition cursor-pointer border ${
                    selectedReportType === rt.id
                      ? 'bg-[#0A1628] text-[#D4AF37] border-[#D4AF37]'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>

            {/* Report Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs pt-2 border-t border-slate-200">
              <select
                value={reportVillage}
                onChange={(e) => setReportVillage(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كل القرى والمناطق</option>
                {villages.map((v) => (
                  <option key={v.village} value={v.village}>{v.village}</option>
                ))}
              </select>

              <select
                value={reportMerchantId}
                onChange={(e) => setReportMerchantId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كل التجار والمنافذ</option>
                {state.merchants.map((m) => (
                  <option key={m.id} value={m.id}>{m.merchantName}</option>
                ))}
              </select>

              <select
                value={reportCommodityId}
                onChange={(e) => setReportCommodityId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كل السلع التموينية</option>
                {state.commodities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <input
                type="date"
                value={reportFromDate}
                onChange={(e) => setReportFromDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                title="من تاريخ"
              />

              <input
                type="date"
                value={reportToDate}
                onChange={(e) => setReportToDate(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                title="إلى تاريخ"
              />
            </div>

            {/* Column Selector */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px]">
              <span className="font-black text-slate-600">الأعمدة المعروضة بالجدول والطباعة:</span>
              {activeReportData.headers.map((h, i) => {
                const isVisible = !hiddenReportCols.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      setHiddenReportCols((prev) =>
                        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                      )
                    }
                    className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer border ${
                      isVisible
                        ? 'bg-teal-50 border-teal-400 text-teal-900'
                        : 'bg-slate-100 border-slate-300 text-slate-400 line-through'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>

            {/* Report Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#0A1628] text-white font-black">
                  <tr>
                    {activeReportData.headers.map((h, i) =>
                      hiddenReportCols.includes(i) ? null : (
                        <th key={i} className="py-2.5 px-2 border border-slate-700">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {activeReportData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={activeReportData.headers.length} className="py-6 text-slate-400">
                        لا توجد بيانات مطابقة لمعايير الفلترة المحددة
                      </td>
                    </tr>
                  ) : (
                    activeReportData.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        {row.map((cell, cIdx) =>
                          hiddenReportCols.includes(cIdx) ? null : (
                            <td key={cIdx} className="py-2 px-2 border-x border-slate-100">
                              {cell}
                            </td>
                          )
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubView 10: Configurable Decisions, Grants & Pricing Policy */}
      {subView === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-[#0A1628]">
            إعدادات القرارات التموينية وقيمة الدعم والمنح الاستثنائية وضوابط المخزون
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">الشهر التمويني النشط</label>
              <input
                type="month"
                value={settingsDraft.activeMonth}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, activeMonth: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">قيمة الدعم للفرد (ج.م)</label>
              <input
                type="number"
                step="0.5"
                value={settingsDraft.supportPerBeneficiary}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, supportPerBeneficiary: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-black text-[#0D9488]"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">قيمة المنحة الإضافية للبطاقة 2026 (منفصلة)</label>
              <input
                type="number"
                step="1"
                value={settingsDraft.additionalGrantPerCard2026}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, additionalGrantPerCard2026: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-black text-amber-700"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">رقم القرار / التوجيه الوزاري المرجعي</label>
              <input
                type="text"
                value={settingsDraft.decisionNumber}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, decisionNumber: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              />
            </div>
            <div className="flex flex-col gap-2 pt-3">
              <label className="inline-flex items-center gap-2 font-black text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsDraft.additionalGrantEnabled}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, additionalGrantEnabled: e.target.checked })}
                />
                <span>تفعيل احتساب المنحة الإضافية منفصلة</span>
              </label>
              <label className="inline-flex items-center gap-2 font-black text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsDraft.allowNegativeStockWithApproval}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, allowNegativeStockWithApproval: e.target.checked })}
                />
                <span>إذن استثنائي موثق للسماح بالسحب المخزني بالسالب عند الضرورة</span>
              </label>
            </div>
          </div>
          {!isViewer && (
            <button type="submit" className="px-5 py-2.5 bg-[#0A1628] hover:bg-slate-800 text-[#D4AF37] rounded-xl text-xs font-black cursor-pointer">
              حفظ وتطبيق القرار التمويني مع سجل الإصدارات التاريخي
            </button>
          )}
        </form>
      )}

      {/* SubView 11: Audit Trail */}
      {subView === 'audit' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-black text-[#0A1628] mb-3">
            سجل التدقيق والمراجعة لقسم السلع التموينية ({state.auditLogs.length})
          </h3>
          <table className="w-full text-xs text-center border-collapse">
            <thead className="bg-[#0A1628] text-white font-black">
              <tr>
                <th className="py-2 px-2 border border-slate-700">الوقت</th>
                <th className="py-2 px-2 border border-slate-700">المستخدم</th>
                <th className="py-2 px-2 border border-slate-700">الإجراء</th>
                <th className="py-2 px-2 border border-slate-700">الشاشة</th>
                <th className="py-2 px-2 border border-slate-700 text-right">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-bold">
              {state.auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-slate-400">لم تُسجل حركات تعديل بعد في هذه الجلسة</td>
                </tr>
              ) : (
                state.auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 px-2 font-mono">{new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                    <td className="py-2 px-2">{a.userFullName}</td>
                    <td className="py-2 px-2 font-black text-[#0D9488]">{a.actionType}</td>
                    <td className="py-2 px-2">{a.entityName}</td>
                    <td className="py-2 px-2 text-right">{a.afterSummary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Unified Add / Edit Modal */}
      {activeModal && (
        <ModuleFormModal
          isOpen={true}
          mode={activeModal.mode}
          title={activeModal.title}
          fields={activeModal.fields}
          initialValues={activeModal.initialValues}
          onClose={() => setActiveModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}

      {/* Unified Delete Confirmation Modal */}
      {deleteTarget && (
        <ModuleDeleteConfirmModal
          isOpen={true}
          entityTitle={deleteTarget.entityTitle}
          recordSummary={deleteTarget.summary}
          canDelete={deleteTarget.canDelete}
          blockReason={deleteTarget.blockReason}
          onClose={() => setDeleteTarget(null)}
          onConfirmDelete={deleteTarget.onConfirm}
        />
      )}
    </div>
  );
};
