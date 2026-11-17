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
} from '../../types/modules';
import {
  computeCardEntitlementSummary,
  computeWarehouseStockStatus,
  computeRequisitionTotals,
  computeMerchantFinancialStatement,
  validateAndComputeDisbursement,
  countEligibleBeneficiaries,
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
  | 'gas_cylinders'
  | 'petroleum'
  | 'ration_accounting'
  | 'settings'
  | 'audit';

interface RationCommoditiesSuiteProps {
  state: RationModuleState;
  branchId: string;
  branchName: string;
  villages: VillageHierarchy[];
  currentUser: AppUser | null;
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
  initialMode = 'commodities',
  initialSubView,
  onChangeState,
}) => {
  const [subView, setSubView] = useState<RationSubView>(
    initialSubView || (initialMode === 'internal_trade' ? 'merchants' : 'dashboard')
  );
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  // Computed KPIs & Alerts
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
    const warehouseAlertsCount = state.warehouses.reduce((s, w) => {
      const comm = state.commodities.find((c) => c.id === w.commodityId);
      return s + computeWarehouseStockStatus(w, comm?.supplyCostPrice || 0).alerts.length;
    }, 0);

    return {
      activeMerchants,
      totalMerchants: state.merchants.length,
      totalCards,
      totalEligible,
      totalSalesValue,
      totalSupportUsed,
      totalCommissions,
      stockValuation,
      warehouseAlertsCount,
    };
  }, [state]);

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
        const hay = `${m.merchantName} ${m.ownerName} ${m.posMachineNumber} ${m.licenseNumber} ${m.village}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.merchants, villageFilter, outletTypeFilter, statusFilter, merchantSearch]);

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
  // Field Definitions for Modal Add / Edit across all Ration & Internal Trade Tables
  // =========================================================================
  const merchantFields: CrudFieldDefinition[] = [
    { key: 'merchantName', label: 'اسم المنفذ التمويني', type: 'text', required: true },
    { key: 'ownerName', label: 'اسم التاجر / المسؤول', type: 'text', required: true },
    {
      key: 'outletType',
      label: 'نوع المنفذ',
      type: 'select',
      required: true,
      options: [
        { value: 'تاجر تمويني', label: 'تاجر تمويني' },
        { value: 'منفذ جمعيتي', label: 'منفذ جمعيتي' },
        { value: 'مجمع استهلاكي', label: 'مجمع استهلاكي' },
      ],
    },
    { key: 'village', label: 'القرية', type: 'select', required: true, options: villageOptions },
    { key: 'localUnit', label: 'الوحدة المحلية', type: 'text', required: true },
    { key: 'posMachineNumber', label: 'رقم ماكينة الصرف POS', type: 'text', required: true },
    { key: 'licenseNumber', label: 'رقم الترخيص التمويني', type: 'text', required: true },
    { key: 'licenseExpiryDate', label: 'تاريخ انتهاء الترخيص', type: 'date', required: true },
    { key: 'cashInsuranceAmount', label: 'قيمة التأمين النقدي (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'openingBalance', label: 'رصيد أول المدة المالي (ج.م)', type: 'number', required: true },
    { key: 'linkedCardsCount', label: 'عدد البطاقات المربوطة', type: 'number', required: true, min: 0 },
    { key: 'linkedBeneficiariesCount', label: 'عدد الأفراد المستفيدين', type: 'number', required: true, min: 0 },
    { key: 'phone', label: 'رقم الهاتف', type: 'text' },
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
    { key: 'code', label: 'كود السلعة', type: 'text', required: true },
    { key: 'name', label: 'اسم السلعة التموينية', type: 'text', required: true },
    { key: 'category', label: 'التصنيف السلعي', type: 'text', required: true },
    {
      key: 'unit',
      label: 'وحدة القياس',
      type: 'select',
      required: true,
      options: [
        { value: 'كيلو', label: 'كيلو' },
        { value: 'عبوة', label: 'عبوة' },
        { value: 'لتر', label: 'لتر' },
        { value: 'جرام', label: 'جرام' },
        { value: 'قطعة', label: 'قطعة' },
      ],
    },
    { key: 'officialPrice', label: 'السعر الرسمي للمواطن (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'supplyCostPrice', label: 'سعر التوريد للتاجر (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'freeMarketRefPrice', label: 'السعر الاسترشادي الحر (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'commissionValue', label: 'عمولة التاجر للوحدة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'monthlyQuotaPerBeneficiary', label: 'المقرر الشهري للفرد', type: 'number', required: true, min: 0 },
    { key: 'maxPerCard', label: 'الحد الأقصى للبطاقة', type: 'number', required: true, min: 1 },
    { key: 'reorderLevel', label: 'حد إعادة الطلب المخزني', type: 'number', required: true, min: 0 },
    { key: 'supplierCompany', label: 'الشركة الموردة', type: 'text', required: true },
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
    { key: 'openingBalance', label: 'رصيد أول المدة', type: 'number', required: true, min: 0 },
    { key: 'totalIn', label: 'إجمالي الوارد', type: 'number', required: true, min: 0 },
    { key: 'totalOut', label: 'إجمالي المنصرف', type: 'number', required: true, min: 0 },
    { key: 'inboundReturns', label: 'مرتجع وارد', type: 'number', required: true, min: 0 },
    { key: 'outboundReturns', label: 'مرتجع صادر', type: 'number', required: true, min: 0 },
    { key: 'approvedAdjustments', label: 'التسويات المعتمدة (±)', type: 'number', required: true },
    { key: 'physicalCount', label: 'الجرد الفعلي الحالي', type: 'number', required: true, min: 0 },
    { key: 'reorderLevel', label: 'حد إعادة الطلب', type: 'number', required: true, min: 0 },
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
        { value: 'RECEIPT_IN', label: 'وارد استلام (RECEIPT_IN)' },
        { value: 'DISBURSEMENT_OUT', label: 'منصرف تمويني (DISBURSEMENT_OUT)' },
        { value: 'RETURN_IN', label: 'مرتجع داخل (RETURN_IN)' },
        { value: 'RETURN_OUT', label: 'مرتجع خارج (RETURN_OUT)' },
        { value: 'ADJUSTMENT_SURPLUS', label: 'تسوية زيادة (ADJUSTMENT_SURPLUS)' },
        { value: 'ADJUSTMENT_SHORTAGE', label: 'تسوية عجز (ADJUSTMENT_SHORTAGE)' },
      ],
    },
    { key: 'merchantId', label: 'المنفذ التمويني', type: 'select', required: true, options: merchantOptions },
    { key: 'warehouseName', label: 'اسم المخزن', type: 'text', required: true },
    { key: 'commodityId', label: 'السلعة', type: 'select', required: true, options: commodityOptions },
    { key: 'quantity', label: 'الكمية', type: 'number', required: true, min: 0.5 },
    { key: 'unitPrice', label: 'سعر الوحدة (ج.م)', type: 'number', required: true, min: 0 },
    { key: 'approvedBy', label: 'المعتمد', type: 'text', required: true },
    { key: 'notes', label: 'ملاحظات الحركة', type: 'text' },
  ];

  const requisitionFields: CrudFieldDefinition[] = [
    { key: 'requestNumber', label: 'رقم طلب الاستعاضة', type: 'text', required: true },
    { key: 'invoiceNumber', label: 'رقم الفاتورة', type: 'text', required: true },
    { key: 'requestDate', label: 'تاريخ الطلب', type: 'date', required: true },
    { key: 'merchantId', label: 'التاجر / المنفذ التمويني', type: 'select', required: true, options: merchantOptions },
    { key: 'commodityId', label: 'السلعة التموينية', type: 'select', required: true, options: commodityOptions },
    { key: 'requestedQty', label: 'الكمية المطلوبة', type: 'number', required: true, min: 1 },
    { key: 'approvedQty', label: 'الكمية المعتمدة', type: 'number', required: true, min: 0 },
    { key: 'deliveredQty', label: 'الكمية المسلمة فعلياً', type: 'number', required: true, min: 0 },
    {
      key: 'status',
      label: 'حالة الاستعاضة',
      type: 'select',
      required: true,
      options: [
        { value: 'جديد', label: 'جديد' },
        { value: 'معتمد', label: 'معتمد' },
        { value: 'تسليم جزئي', label: 'تسليم جزئي' },
        { value: 'مكتمل', label: 'مكتمل' },
        { value: 'مرفوض', label: 'مرفوض' },
        { value: 'ملغي', label: 'ملغي' },
      ],
    },
    { key: 'notes', label: 'ملاحظات', type: 'text' },
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
          detailedAddress: `${values.village} - ${branchName}`,
          phone: String(values.phone || '').trim(),
          nationalId: '',
          commercialRegNumber: '',
          taxCardNumber: '',
          licenseNumber: String(values.licenseNumber).trim(),
          licenseIssueDate: today,
          licenseExpiryDate: String(values.licenseExpiryDate || '2027-12-31'),
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
                posMachineNumber: String(values.posMachineNumber).trim(),
                licenseNumber: String(values.licenseNumber).trim(),
                licenseExpiryDate: String(values.licenseExpiryDate),
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
          isActive: true,
          supplierCompany: String(values.supplierCompany).trim(),
          reorderLevel: Number(values.reorderLevel) || 200,
          decisionNumber: String(values.decisionNumber).trim(),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            commodities: [...state.commodities, created],
            auditLogs: [appendAudit('إضافة', 'دليل السلع والأسعار', created.id, `${created.name} (${offPrice} ج.م)`), ...state.auditLogs],
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
                reorderLevel: Number(values.reorderLevel) || 200,
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
            auditLogs: [appendAudit('تعديل', 'دليل السلع والأسعار', targetId, `${name} (${offPrice} ج.م)`), ...state.auditLogs],
          },
          `تم تعديل السلعة (${name})`
        );
        notify('ok', `تم تحديث بيانات وتسعيرة السلعة (${name}) بنجاح.`);
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
      if (mode === 'add') {
        const created: RationInventoryMovement = {
          id: `${branchId}-mv-${Date.now()}`,
          branchId,
          documentNumber: docNo,
          movementDate: String(values.movementDate || today),
          movementType: values.movementType as RationInventoryMovement['movementType'],
          merchantId: String(values.merchantId),
          warehouseName: String(values.warehouseName).trim(),
          commodityId: String(values.commodityId),
          quantity: qty,
          unitPrice: uPrice,
          totalValue: totVal,
          balanceBefore: 0,
          balanceAfter: qty,
          approvedBy: String(values.approvedBy).trim(),
          notes: String(values.notes || '').trim(),
          updatedAt: nowIso,
        };
        onChangeState(
          {
            ...state,
            movements: [created, ...state.movements],
            auditLogs: [appendAudit('إضافة', 'حركات المخزون', created.id, docNo), ...state.auditLogs],
          },
          `تم إضافة الحركة المخزنية (${docNo})`
        );
        notify('ok', `تم تسجيل الحركة المخزنية (${docNo}) بنجاح.`);
      } else if (targetId) {
        const updated = state.movements.map((mv) =>
          mv.id === targetId
            ? {
                ...mv,
                documentNumber: docNo,
                movementDate: String(values.movementDate || mv.movementDate),
                movementType: values.movementType as RationInventoryMovement['movementType'],
                merchantId: String(values.merchantId),
                warehouseName: String(values.warehouseName).trim(),
                commodityId: String(values.commodityId),
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
            auditLogs: [appendAudit('تعديل', 'حركات المخزون', targetId, docNo), ...state.auditLogs],
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
      const appQtyVal = Math.max(0, Number(values.approvedQty) || reqQtyVal);
      const delQtyVal = Math.max(0, Number(values.deliveredQty) || appQtyVal);
      const lineValue = round2(delQtyVal * comm.supplyCostPrice);

      if (mode === 'add') {
        const created: RationRequisition = {
          id: `${branchId}-req-${Date.now()}`,
          branchId,
          requestNumber: String(values.requestNumber).trim(),
          invoiceNumber: String(values.invoiceNumber).trim(),
          monthKey: state.settings.activeMonth,
          merchantId: merchant.id,
          wholesaleBranch: merchant.wholesaleBranchName,
          linkedCardsCount: merchant.linkedCardsCount,
          linkedBeneficiariesCount: merchant.linkedBeneficiariesCount,
          insuranceAmount: merchant.cashInsuranceAmount,
          committedInsuranceBefore: 0,
          previousStockTotalQty: 0,
          requestDate: String(values.requestDate || today),
          status: values.status as RationRequisition['status'],
          lines: [
            {
              commodityId: comm.id,
              commodityName: comm.name,
              requestedQty: reqQtyVal,
              approvedQty: appQtyVal,
              deliveredQty: delQtyVal,
              supplyPrice: comm.supplyCostPrice,
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
            auditLogs: [appendAudit('إضافة', 'الاستعاضات التموينية', created.id, created.requestNumber), ...state.auditLogs],
          },
          `تم إضافة طلب الاستعاضة (${created.requestNumber})`
        );
        notify('ok', `تم إضافة طلب الاستعاضة (${created.requestNumber}) بنجاح.`);
      } else if (targetId) {
        const updated = state.requisitions.map((r) =>
          r.id === targetId
            ? {
                ...r,
                requestNumber: String(values.requestNumber).trim(),
                invoiceNumber: String(values.invoiceNumber).trim(),
                requestDate: String(values.requestDate || r.requestDate),
                merchantId: merchant.id,
                insuranceAmount: merchant.cashInsuranceAmount,
                status: values.status as RationRequisition['status'],
                lines: [
                  {
                    commodityId: comm.id,
                    commodityName: comm.name,
                    requestedQty: reqQtyVal,
                    approvedQty: appQtyVal,
                    deliveredQty: delQtyVal,
                    supplyPrice: comm.supplyCostPrice,
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
            auditLogs: [appendAudit('تعديل', 'الاستعاضات التموينية', targetId, String(values.requestNumber)), ...state.auditLogs],
          },
          `تم تعديل طلب الاستعاضة (${values.requestNumber})`
        );
        notify('ok', `تم تحديث طلب الاستعاضة (${values.requestNumber}) بنجاح.`);
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

  const handleAddRequisition = (e: React.FormEvent) => {
    e.preventDefault();
    const merchant = state.merchants.find((m) => m.id === reqMerchantId);
    const comm = state.commodities.find((c) => c.id === reqCommodityId);
    if (!merchant || !comm || !reqNo.trim()) {
      notify('err', 'يرجى تحديد التاجر ورقم طلب الاستعاضة والكمية.');
      return;
    }
    const lineValue = round2(reqQty * comm.supplyCostPrice);
    if (lineValue > merchant.cashInsuranceAmount) {
      notify(
        'err',
        `تحذير سقف التأمين: قيمة الاستعاضة (${lineValue.toLocaleString()} ج.م) تتجاوز التأمين النقدي المودع (${merchant.cashInsuranceAmount.toLocaleString()} ج.م).`
      );
      return;
    }
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
      status: 'معتمد',
      lines: [
        {
          commodityId: comm.id,
          commodityName: comm.name,
          requestedQty: reqQty,
          approvedQty: reqQty,
          deliveredQty: reqQty,
          supplyPrice: comm.supplyCostPrice,
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
          appendAudit('إضافة', 'الاستعاضة التموينية', newReq.id, `${newReq.requestNumber} بقيمة ${lineValue}`),
          ...state.auditLogs,
        ],
      },
      `تم اعتماد استعاضة (${newReq.requestNumber})`
    );
    setReqNo('');
    setReqInvNo('');
    notify('ok', `تم اعتماد استعاضة (${newReq.requestNumber}) والتحقق من سقف التأمين.`);
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

  const navItems: { id: RationSubView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'لوحة المؤشرات', icon: <ShoppingBasket className="w-3.5 h-3.5" /> },
    { id: 'merchants', label: 'التجار والمنافذ', icon: <Store className="w-3.5 h-3.5" /> },
    { id: 'cards', label: 'البطاقات والمقررات', icon: <CreditCard className="w-3.5 h-3.5" /> },
    { id: 'commodities', label: 'السلع والأسعار', icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'disbursements', label: 'صرف المواطنين', icon: <Receipt className="w-3.5 h-3.5" /> },
    { id: 'warehouses', label: 'المخازن والجرد', icon: <Warehouse className="w-3.5 h-3.5" /> },
    { id: 'requisitions', label: 'الاستعاضات', icon: <Truck className="w-3.5 h-3.5" /> },
    { id: 'inspections', label: 'الرقابة والشكاوى', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
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
              {initialMode === 'internal_trade'
                ? 'منظومة التجارة التموينية والداخلية والمنافذ'
                : 'منظومة السلع التموينية والمقررات والدعم'}
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
                ['اسم المنفذ', 'النوع', 'القرية', 'رقم الماكينة', 'التأمين النقدي', 'البطاقات', 'الأفراد', 'الحالة'],
                filteredMerchants.map((m) => [
                  m.merchantName,
                  m.outletType,
                  m.village,
                  m.posMachineNumber,
                  m.cashInsuranceAmount,
                  m.linkedCardsCount,
                  m.linkedBeneficiariesCount,
                  m.activityStatus,
                ])
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
                title: 'التقرير الشامل للسلع التموينية والتجارة الداخلية',
                subtitle: `${state.settings.decisionNumber} • شهر ${state.settings.activeMonth}`,
                branchName,
                headers: ['م', 'اسم المنفذ', 'النوع', 'القرية', 'الماكينة', 'التأمين النقدي', 'البطاقات', 'الحالة'],
                rows: filteredMerchants.map((m, i) => [
                  i + 1,
                  m.merchantName,
                  m.outletType,
                  m.village,
                  m.posMachineNumber,
                  `${m.cashInsuranceAmount.toLocaleString()} ج.م`,
                  m.linkedCardsCount,
                  m.activityStatus,
                ]),
                summaryItems: [
                  { label: 'المنافذ النشطة', value: String(kpis.activeMerchants) },
                  { label: 'الأفراد المستحقين', value: kpis.totalEligible.toLocaleString() },
                  { label: 'قيمة المنصرف', value: `${kpis.totalSalesValue.toLocaleString()} ج.م` },
                  { label: 'قيمة المخزون', value: `${kpis.stockValuation.toLocaleString()} ج.م` },
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

      {/* SubView 1: Executive Dashboard */}
      {subView === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">التجار والمنافذ النشطة</div>
              <div className="text-2xl font-black text-[#0A1628] font-mono tabular-nums mt-1">
                {kpis.activeMerchants} / {kpis.totalMerchants}
              </div>
              <div className="text-[11px] font-bold text-[#0D9488]">
                البطاقات السارية: {kpis.totalCards} ({kpis.totalEligible} مستحق)
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">إجمالي قيمة المبيعات والدعم</div>
              <div className="text-2xl font-black text-[#0D9488] font-mono tabular-nums mt-1">
                {kpis.totalSalesValue.toLocaleString()} ج.م
              </div>
              <div className="text-[11px] font-bold text-slate-500">
                دعم مخصوم: {kpis.totalSupportUsed.toLocaleString()} ج.م
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">صافي قيمة المخزون بالمخازن</div>
              <div className="text-2xl font-black text-[#1E40AF] font-mono tabular-nums mt-1">
                {kpis.stockValuation.toLocaleString()} ج.م
              </div>
              <div className="text-[11px] font-bold text-amber-700">
                تنبيهات المخزون النشطة: {kpis.warehouseAlertsCount}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-500">العمولات والحملات الرقابية</div>
              <div className="text-2xl font-black text-emerald-700 font-mono tabular-nums mt-1">
                {kpis.totalCommissions.toLocaleString()} ج.م
              </div>
              <div className="text-[11px] font-bold text-rose-700">
                محاضر تفتيش: {state.inspections.length} • شكاوى: {state.complaints.length}
              </div>
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
              <h3 className="text-sm font-black text-[#0A1628]">توزيع المنافذ التموينية والداخلية</h3>
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

      {/* SubView 2: Merchants & Outlets */}
      {subView === 'merchants' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="سجل التجار والمنافذ التموينية والداخلية"
            subtitle="إدارة كاملة لبيانات التجار، منافذ جمعيتي، والمجمعات الاستهلاكية مع الحفظ المباشر في Supabase"
            count={filteredMerchants.length}
            addLabel="إضافة منفذ تمويني جديد"
            permissions={permissions}
            testIdPrefix="ration-merchants"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'merchant',
                title: 'إضافة منفذ تمويني / تاجر جديد',
                fields: merchantFields,
                initialValues: {
                  merchantName: '',
                  ownerName: '',
                  outletType: 'تاجر تمويني',
                  village: villages[0]?.village || 'بشبيش',
                  localUnit: villages[0]?.localUnits?.[0] || 'بشبيش',
                  posMachineNumber: `POS-${Math.floor(10000 + Math.random() * 89999)}`,
                  licenseNumber: `LIC-${Math.floor(1000 + Math.random() * 8999)}`,
                  licenseExpiryDate: '2027-12-31',
                  cashInsuranceAmount: 40000,
                  openingBalance: 0,
                  linkedCardsCount: 150,
                  linkedBeneficiariesCount: 550,
                  phone: '',
                  activityStatus: 'نشط',
                },
              })
            }
          />

          {!isViewer && (
            <form onSubmit={handleAddMerchant} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#0D9488]" />
                <span>إضافة سريعة لمنفذ تمويني / منفذ جمعيتي / مجمع استهلاكي</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
                <input
                  type="text"
                  value={newMerchantName}
                  onChange={(e) => setNewMerchantName(e.target.value)}
                  placeholder="اسم المنفذ التمويني *"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <input
                  type="text"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  placeholder="اسم التاجر / المسؤول *"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <select
                  value={newMerchantOutlet}
                  onChange={(e) => setNewMerchantOutlet(e.target.value as OutletType)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="تاجر تمويني">تاجر تمويني</option>
                  <option value="منفذ جمعيتي">منفذ جمعيتي</option>
                  <option value="مجمع استهلاكي">مجمع استهلاكي</option>
                </select>
                <select
                  value={newMerchantVillage}
                  onChange={(e) => setNewMerchantVillage(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  {villages.map((v) => (
                    <option key={v.village} value={v.village}>{v.village}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={newMerchantInsurance}
                  onChange={(e) => setNewMerchantInsurance(Number(e.target.value) || 0)}
                  placeholder="التأمين النقدي"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0A1628] hover:bg-[#13294B] text-[#D4AF37] rounded-xl font-black cursor-pointer"
                >
                  إضافة منفذ
                </button>
              </div>
            </form>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={merchantSearch}
                  onChange={(e) => setMerchantSearch(e.target.value)}
                  placeholder="بحث باسم المنفذ أو رقم الماكينة أو الترخيص..."
                  className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <select
                value={villageFilter}
                onChange={(e) => setVillageFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="ALL">كافة القرى</option>
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
                    <th className="py-2.5 px-2 border border-slate-700 text-right">اسم المنفذ</th>
                    <th className="py-2.5 px-2 border border-slate-700">المسؤول</th>
                    <th className="py-2.5 px-2 border border-slate-700">نوع المنفذ</th>
                    <th className="py-2.5 px-2 border border-slate-700">القرية / الوحدة</th>
                    <th className="py-2.5 px-2 border border-slate-700">رقم الماكينة</th>
                    <th className="py-2.5 px-2 border border-slate-700">التأمين النقدي</th>
                    <th className="py-2.5 px-2 border border-slate-700">البطاقات / الأفراد</th>
                    <th className="py-2.5 px-2 border border-slate-700">الحالة</th>
                    <th className="py-2.5 px-2 border border-slate-700">إجراءات الإدارة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {filteredMerchants.map((m, idx) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono">{idx + 1}</td>
                      <td className="py-2 px-2 text-right font-black text-[#0A1628]">{m.merchantName}</td>
                      <td className="py-2 px-2">{m.ownerName}</td>
                      <td className="py-2 px-2">{m.outletType}</td>
                      <td className="py-2 px-2">{m.village} / {m.localUnit}</td>
                      <td className="py-2 px-2 font-mono">{m.posMachineNumber}</td>
                      <td className="py-2 px-2 font-mono tabular-nums text-[#0D9488]">
                        {m.cashInsuranceAmount.toLocaleString()} ج.م
                      </td>
                      <td className="py-2 px-2 font-mono tabular-nums">
                        {m.linkedCardsCount} / {m.linkedBeneficiariesCount}
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
                              title: `تعديل بيانات المنفذ: ${m.merchantName}`,
                              fields: merchantFields,
                              initialValues: { ...m },
                            })
                          }
                          onDelete={() => {
                            const check = checkRationDeleteIntegrity(state, 'merchant', m.id);
                            setDeleteTarget({
                              entityTitle: `حذف المنفذ التمويني: ${m.merchantName}`,
                              summary: [
                                { label: 'اسم المنفذ', value: m.merchantName },
                                { label: 'المسؤول', value: m.ownerName },
                                { label: 'القرية', value: m.village },
                                { label: 'رقم الماكينة', value: m.posMachineNumber },
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubView 3: Cards & Automatic Monthly Entitlements */}
      {subView === 'cards' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="سجل البطاقات التموينية والمستفيدين"
            subtitle="إضافة وتعديل وحذف البطاقات التموينية وأفرادها مع احتساب الدعم الشهري والمنحة الإضافية تلقائياً"
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

              {/* Beneficiaries Table for Selected Card */}
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

      {/* SubView 4: Commodities Directory & Immutable Price History */}
      {subView === 'commodities' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="دليل السلع التموينية والأسعار الرسمية"
            subtitle="إضافة وتعديل وحذف السلع التموينية وتحديث أسعارها مع الاحتفاظ بالسجل التاريخي للأسعار"
            count={state.commodities.length}
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
                  freeMarketRefPrice: 25,
                  commissionValue: 0.75,
                  monthlyQuotaPerBeneficiary: 1,
                  maxPerCard: 4,
                  reorderLevel: 250,
                  supplierCompany: 'الشركة العامة لتجارة الجملة',
                  decisionNumber: state.settings.decisionNumber,
                },
              })
            }
          />

          {!isViewer && (
            <form onSubmit={handleUpdateCommodityPrice} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628]">
                تحديث تسعيرة سلعة (يُحفظ في السجل التاريخي ولا يغير الفواتير القديمة)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
                <select
                  value={priceEditCommodityId}
                  onChange={(e) => {
                    const c = state.commodities.find((x) => x.id === e.target.value);
                    setPriceEditCommodityId(e.target.value);
                    if (c) {
                      setNewOfficialPrice(c.officialPrice);
                      setNewSupplyPrice(c.supplyCostPrice);
                    }
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  {state.commodities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.05"
                  value={newOfficialPrice}
                  onChange={(e) => setNewOfficialPrice(Number(e.target.value) || 0)}
                  placeholder="السعر الرسمي الجديد"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <input
                  type="number"
                  step="0.05"
                  value={newSupplyPrice}
                  onChange={(e) => setNewSupplyPrice(Number(e.target.value) || 0)}
                  placeholder="سعر التوريد للتاجر"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <input
                  type="text"
                  value={priceDecisionRef}
                  onChange={(e) => setPriceDecisionRef(e.target.value)}
                  placeholder="مرجع القرار"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0A1628] hover:bg-slate-800 text-[#D4AF37] rounded-xl font-black cursor-pointer"
                >
                  اعتماد التسعيرة الجديدة
                </button>
              </div>
            </form>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">الكود</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">السلعة</th>
                  <th className="py-2 px-2 border border-slate-700">السعر الرسمي</th>
                  <th className="py-2 px-2 border border-slate-700">التوريد للتاجر</th>
                  <th className="py-2 px-2 border border-slate-700">الهامش</th>
                  <th className="py-2 px-2 border border-slate-700">الحر الاسترشادي</th>
                  <th className="py-2 px-2 border border-slate-700">المقرر / الحد الأقصى</th>
                  <th className="py-2 px-2 border border-slate-700">مرجع القرار</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.commodities.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-2 font-mono">{c.code}</td>
                    <td className="py-2 px-2 text-right font-black text-[#0A1628]">{c.name}</td>
                    <td className="py-2 px-2 font-mono text-[#0D9488] font-black">{c.officialPrice} ج.م</td>
                    <td className="py-2 px-2 font-mono">{c.supplyCostPrice} ج.م</td>
                    <td className="py-2 px-2 font-mono text-emerald-700">{c.profitMargin} ج.م</td>
                    <td className="py-2 px-2 font-mono text-slate-500">{c.freeMarketRefPrice} ج.م</td>
                    <td className="py-2 px-2 font-mono">
                      {c.monthlyQuotaPerBeneficiary}/فرد (حد {c.maxPerCard}/بطاقة)
                    </td>
                    <td className="py-2 px-2 text-[11px]">{c.decisionNumber}</td>
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
                            initialValues: { ...c },
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
                                    appendAudit('حذف', 'دليل السلع والأسعار', c.id, c.name),
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
                ))}
              </tbody>
            </table>
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

      {/* SubView 6: Warehouses & Inventory Balance Equation */}
      {subView === 'warehouses' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="أرصدة المخازن والجرد الفعلي والتنبيهات الآلية"
            subtitle="الرصيد الدفتري = أول المدة + الوارد + مرتجع داخل - منصرف - مرتجع خارج ± التسويات المعتمدة"
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
                  <th className="py-2 px-2 border border-slate-700">أول المدة</th>
                  <th className="py-2 px-2 border border-slate-700">الوارد</th>
                  <th className="py-2 px-2 border border-slate-700">المنصرف</th>
                  <th className="py-2 px-2 border border-slate-700">الرصيد الدفتري</th>
                  <th className="py-2 px-2 border border-slate-700">الجرد الفعلي</th>
                  <th className="py-2 px-2 border border-slate-700">فارق الجرد</th>
                  <th className="py-2 px-2 border border-slate-700">التنبيهات الآلية</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.warehouses.map((w) => {
                  const comm = state.commodities.find((c) => c.id === w.commodityId);
                  const status = computeWarehouseStockStatus(w, comm?.supplyCostPrice || 0);
                  return (
                    <tr key={w.id}>
                      <td className="py-2 px-2 text-right font-black text-[#0A1628]">
                        {w.warehouseName} — {comm?.name || w.commodityId}
                      </td>
                      <td className="py-2 px-2 font-mono">{w.openingBalance}</td>
                      <td className="py-2 px-2 font-mono text-emerald-700">{w.totalIn}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{w.totalOut}</td>
                      <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{status.bookBalance}</td>
                      <td className="py-2 px-2 font-mono">{w.physicalCount ?? status.bookBalance}</td>
                      <td className="py-2 px-2 font-mono font-black">
                        {status.varianceType} ({status.inventoryVariance})
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

          {/* Inventory Movements Sub-Table */}
          <ModuleTableToolbar
            title="دفتر الحركات المخزنية التفصيلي (وارد / منصرف / مرتجعات / تسويات)"
            count={state.movements.length}
            addLabel="إضافة حركة مخزنية جديدة"
            permissions={permissions}
            testIdPrefix="ration-movements"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'movement',
                title: 'إضافة حركة مخزنية جديدة',
                fields: movementFields,
                initialValues: {
                  documentNumber: `MOV-${Date.now().toString().slice(-5)}`,
                  movementDate: new Date().toISOString().split('T')[0],
                  movementType: 'RECEIPT_IN',
                  merchantId: state.merchants[0]?.id || '',
                  warehouseName: `مخزن ${state.merchants[0]?.merchantName || branchName}`,
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
                  <th className="py-2 px-2 border border-slate-700">المخزن</th>
                  <th className="py-2 px-2 border border-slate-700">الكمية</th>
                  <th className="py-2 px-2 border border-slate-700">إجمالي القيمة</th>
                  <th className="py-2 px-2 border border-slate-700">المعتمد</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.movements.map((mv) => (
                  <tr key={mv.id}>
                    <td className="py-2 px-2 font-mono">{mv.documentNumber}</td>
                    <td className="py-2 px-2 font-mono">{mv.movementDate}</td>
                    <td className="py-2 px-2">{mv.movementType}</td>
                    <td className="py-2 px-2">{mv.warehouseName}</td>
                    <td className="py-2 px-2 font-mono font-black text-[#0D9488]">{mv.quantity}</td>
                    <td className="py-2 px-2 font-mono">{mv.totalValue.toLocaleString()} ج.م</td>
                    <td className="py-2 px-2">{mv.approvedBy}</td>
                    <td className="py-2 px-2">
                      <ModuleRowActions
                        entityLabel={`حركة ${mv.documentNumber}`}
                        updatedAt={mv.updatedAt}
                        permissions={permissions}
                        testIdPrefix={`movement-${mv.id}`}
                        onEdit={() =>
                          setActiveModal({
                            mode: 'edit',
                            entity: 'movement',
                            targetId: mv.id,
                            title: `تعديل الحركة المخزنية: ${mv.documentNumber}`,
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
                            canDelete: true,
                            onConfirm: () => {
                              onChangeState(
                                {
                                  ...state,
                                  movements: state.movements.filter((x) => x.id !== mv.id),
                                  auditLogs: [
                                    appendAudit('حذف', 'حركات المخزون', mv.id, mv.documentNumber),
                                    ...state.auditLogs,
                                  ],
                                },
                                `تم حذف الحركة المخزنية (${mv.documentNumber})`
                              );
                              notify('ok', `تم حذف الحركة المخزنية (${mv.documentNumber}) بنجاح.`);
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
      )}

      {/* SubView 7: Supply Requisitions */}
      {subView === 'requisitions' && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="طلبات الاستعاضة التموينية وفواتير الجملة"
            subtitle="إدارة طلبات الاستعاضة ومطابقتها مع سقف التأمين النقدي المودع لكل تاجر"
            count={state.requisitions.length}
            addLabel="إضافة طلب استعاضة جديد"
            permissions={permissions}
            testIdPrefix="ration-requisitions"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'requisition',
                title: 'إضافة طلب استعاضة تموينية جديد',
                fields: requisitionFields,
                initialValues: {
                  requestNumber: `REQ-2026-${Math.floor(100 + Math.random() * 899)}`,
                  invoiceNumber: `INV-${Math.floor(10000 + Math.random() * 89999)}`,
                  requestDate: new Date().toISOString().split('T')[0],
                  merchantId: state.merchants[0]?.id || '',
                  commodityId: state.commodities[0]?.id || '',
                  requestedQty: 200,
                  approvedQty: 200,
                  deliveredQty: 200,
                  status: 'معتمد',
                  notes: '',
                },
              })
            }
          />

          {!isViewer && (
            <form onSubmit={handleAddRequisition} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
              <input
                type="text"
                value={reqNo}
                onChange={(e) => setReqNo(e.target.value)}
                placeholder="رقم طلب الاستعاضة *"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
              <input
                type="text"
                value={reqInvNo}
                onChange={(e) => setReqInvNo(e.target.value)}
                placeholder="رقم الفاتورة"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
              <select
                value={reqMerchantId}
                onChange={(e) => setReqMerchantId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                {state.merchants.map((m) => (
                  <option key={m.id} value={m.id}>{m.merchantName}</option>
                ))}
              </select>
              <select
                value={reqCommodityId}
                onChange={(e) => setReqCommodityId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                {state.commodities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="number"
                value={reqQty}
                onChange={(e) => setReqQty(Number(e.target.value) || 0)}
                placeholder="الكمية"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
              <button type="submit" className="px-4 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
                اعتماد الاستعاضة
              </button>
            </form>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم الطلب / الفاتورة</th>
                  <th className="py-2 px-2 border border-slate-700">التاجر / المنفذ</th>
                  <th className="py-2 px-2 border border-slate-700">المطلوب / المعتمد / المسلم</th>
                  <th className="py-2 px-2 border border-slate-700">إجمالي القيمة</th>
                  <th className="py-2 px-2 border border-slate-700">التأمين المتاح</th>
                  <th className="py-2 px-2 border border-slate-700">الحالة</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.requisitions.map((r) => {
                  const m = state.merchants.find((x) => x.id === r.merchantId);
                  const totals = computeRequisitionTotals(r);
                  const line0 = r.lines[0];
                  return (
                    <tr key={r.id}>
                      <td className="py-2 px-2 font-mono">{r.requestNumber} / {r.invoiceNumber}</td>
                      <td className="py-2 px-2 font-black">{m?.merchantName || r.merchantId}</td>
                      <td className="py-2 px-2 font-mono">
                        {totals.totalRequestedQty} / {totals.totalApprovedQty} / {totals.totalDeliveredQty}
                      </td>
                      <td className="py-2 px-2 font-mono text-[#0D9488]">{totals.totalRequisitionValue.toLocaleString()} ج.م</td>
                      <td className="py-2 px-2 font-mono">{totals.availableInsurance.toLocaleString()} ج.م</td>
                      <td className="py-2 px-2 font-black text-emerald-700">{r.status}</td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`استعاضة ${r.requestNumber}`}
                          updatedAt={r.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`requisition-${r.id}`}
                          onEdit={() =>
                            setActiveModal({
                              mode: 'edit',
                              entity: 'requisition',
                              targetId: r.id,
                              title: `تعديل طلب الاستعاضة: ${r.requestNumber}`,
                              fields: requisitionFields,
                              initialValues: {
                                requestNumber: r.requestNumber,
                                invoiceNumber: r.invoiceNumber,
                                requestDate: r.requestDate,
                                merchantId: r.merchantId,
                                commodityId: line0?.commodityId || state.commodities[0]?.id || '',
                                requestedQty: line0?.requestedQty || 100,
                                approvedQty: line0?.approvedQty || 100,
                                deliveredQty: line0?.deliveredQty || 100,
                                status: r.status,
                                notes: r.notes || '',
                              },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف طلب الاستعاضة: ${r.requestNumber}`,
                              summary: [
                                { label: 'رقم الطلب', value: r.requestNumber },
                                { label: 'الفاتورة', value: r.invoiceNumber },
                                { label: 'المنفذ', value: m?.merchantName || r.merchantId },
                                { label: 'القيمة', value: `${totals.totalRequisitionValue} ج.م` },
                              ],
                              canDelete: true,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    requisitions: state.requisitions.filter((x) => x.id !== r.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'الاستعاضات التموينية', r.id, r.requestNumber),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف طلب الاستعاضة (${r.requestNumber})`
                                );
                                notify('ok', `تم حذف طلب الاستعاضة (${r.requestNumber}) بنجاح.`);
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

      {/* SubView 8: Merchant Financial Statement & Reversal Ledger */}
      {subView === 'financial' && selectedMerchantForFin && selectedMerchantStatement && (
        <div className="space-y-4">
          <ModuleTableToolbar
            title="كشف الحساب المالي للتاجر والعمولات والتسويات"
            subtitle="إضافة وتعديل وحذف وعكس القيود المالية مع إعادة احتساب الرصيد الختامي والعمولات لحظياً"
            count={state.financialEntries.filter((e) => e.merchantId === selectedMerchantForFin.id).length}
            addLabel="إضافة قيد مالي جديد"
            permissions={permissions}
            testIdPrefix="ration-financial"
            onAddClick={() =>
              setActiveModal({
                mode: 'add',
                entity: 'financial',
                title: 'إضافة قيد مالي جديد في حساب التاجر',
                fields: financialFields,
                initialValues: {
                  documentNumber: `FIN-${Math.floor(1000 + Math.random() * 8999)}`,
                  date: new Date().toISOString().split('T')[0],
                  merchantId: selectedMerchantForFin.id,
                  entryType: 'PAYMENT_CREDIT',
                  amount: 5000,
                  description: 'توريد نقدي بحساب التاجر',
                },
              })
            }
          />

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <select
              value={selectedMerchantForFin.id}
              onChange={(e) => setSelectedMerchantFinId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black"
            >
              {state.merchants.map((m) => (
                <option key={m.id} value={m.id}>{m.merchantName}</option>
              ))}
            </select>

            <div className="flex flex-wrap gap-3 text-xs font-black">
              <span className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 font-mono">
                صافي المديونية المستحقة على التاجر: {selectedMerchantStatement.netDebtBalance.toLocaleString()} ج.م
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                مستحقات العمولات والحوافز (منفصلة): {selectedMerchantStatement.netCommissionDue.toLocaleString()} ج.م
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-[#0A1628] text-[#D4AF37] font-mono">
                الرصيد الختامي الصافي: {selectedMerchantStatement.closingBalance.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {!isViewer && (
            <form onSubmit={handleAddFinancialEntry} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
              <input
                type="text"
                value={finDocNo}
                onChange={(e) => setFinDocNo(e.target.value)}
                placeholder="رقم المستند المالي الفريد *"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
              <select
                value={finEntryType}
                onChange={(e) => setFinEntryType(e.target.value as MerchantFinancialEntry['entryType'])}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              >
                <option value="PAYMENT_CREDIT">سداد / توريد نقدي (دائن)</option>
                <option value="SUPPLY_INVOICE">فاتورة بضاعة (مدين)</option>
                <option value="COMMISSION_EARNED">عمولة تاجر مستحقة</option>
                <option value="RETURN_CREDIT">مرتجع سلع (دائن)</option>
                <option value="DISCOUNT_PENALTY_DEBIT">خصم / غرامة مالية</option>
              </select>
              <input
                type="number"
                value={finAmount}
                onChange={(e) => setFinAmount(Number(e.target.value) || 0)}
                placeholder="المبلغ"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
              />
              <input
                type="text"
                value={finDesc}
                onChange={(e) => setFinDesc(e.target.value)}
                placeholder="البيان المالي"
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
              />
              <button type="submit" className="px-4 py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
                ترحيل القيد المالي
              </button>
            </form>
          )}

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0A1628] text-white font-black">
                <tr>
                  <th className="py-2 px-2 border border-slate-700">رقم المستند</th>
                  <th className="py-2 px-2 border border-slate-700">التاريخ</th>
                  <th className="py-2 px-2 border border-slate-700">النوع</th>
                  <th className="py-2 px-2 border border-slate-700">مدين</th>
                  <th className="py-2 px-2 border border-slate-700">دائن</th>
                  <th className="py-2 px-2 border border-slate-700 text-right">البيان</th>
                  <th className="py-2 px-2 border border-slate-700">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.financialEntries
                  .filter((e) => e.merchantId === selectedMerchantForFin.id)
                  .map((e) => (
                    <tr key={e.id} className={e.isReversed ? 'opacity-60 bg-slate-100' : ''}>
                      <td className="py-2 px-2 font-mono">{e.documentNumber}</td>
                      <td className="py-2 px-2 font-mono">{e.date}</td>
                      <td className="py-2 px-2">{e.entryType}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{e.debitAmount.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono text-emerald-700">{e.creditAmount.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">{e.description}</td>
                      <td className="py-2 px-2">
                        <ModuleRowActions
                          entityLabel={`مستند ${e.documentNumber}`}
                          updatedAt={e.updatedAt}
                          permissions={permissions}
                          testIdPrefix={`fin-${e.id}`}
                          extraAction={
                            !isViewer && !e.isReversed && e.entryType !== 'REVERSAL' ? (
                              <button
                                type="button"
                                onClick={() => handleReverseFinancialEntry(e)}
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
                              entity: 'financial',
                              targetId: e.id,
                              title: `تعديل المستند المالي: ${e.documentNumber}`,
                              fields: financialFields,
                              initialValues: {
                                documentNumber: e.documentNumber,
                                date: e.date,
                                merchantId: e.merchantId,
                                entryType: e.entryType,
                                amount: e.debitAmount > 0 ? e.debitAmount : e.creditAmount,
                                description: e.description,
                              },
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              entityTitle: `حذف القيد المالي: ${e.documentNumber}`,
                              summary: [
                                { label: 'رقم المستند', value: e.documentNumber },
                                { label: 'النوع', value: e.entryType },
                                { label: 'المبلغ', value: `${Math.max(e.debitAmount, e.creditAmount)} ج.م` },
                              ],
                              canDelete: true,
                              onConfirm: () => {
                                onChangeState(
                                  {
                                    ...state,
                                    financialEntries: state.financialEntries.filter((x) => x.id !== e.id),
                                    auditLogs: [
                                      appendAudit('حذف', 'الحسابات المالية للتجار', e.id, e.documentNumber),
                                      ...state.auditLogs,
                                    ],
                                  },
                                  `تم حذف القيد المالي (${e.documentNumber})`
                                );
                                notify('ok', `تم حذف القيد المالي (${e.documentNumber}) بنجاح.`);
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
      )}

      {/* SubView 9: Inspections & Citizen Complaints */}
      {subView === 'inspections' && (
        <div className="space-y-5">
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

            {!isViewer && (
              <form onSubmit={handleAddInspection} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
                <input
                  type="text"
                  value={insReportNo}
                  onChange={(e) => setInsReportNo(e.target.value)}
                  placeholder="رقم المحضر *"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <select
                  value={insMerchantId}
                  onChange={(e) => setInsMerchantId(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  {state.merchants.map((m) => (
                    <option key={m.id} value={m.id}>{m.merchantName}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={insViolType}
                  onChange={(e) => setInsViolType(e.target.value)}
                  placeholder="نوع المخالفة"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <input
                  type="number"
                  value={insFineVal}
                  onChange={(e) => setInsFineVal(Number(e.target.value) || 0)}
                  placeholder="القيمة المالية"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
                <button type="submit" className="py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
                  تسجيل محضر تفتيش
                </button>
              </form>
            )}

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

            {!isViewer && (
              <form onSubmit={handleAddComplaint} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <input
                  type="text"
                  value={cmpCitizenName}
                  onChange={(e) => setCmpCitizenName(e.target.value)}
                  placeholder="اسم المواطن مقدم الشكوى *"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <input
                  type="text"
                  value={cmpDetails}
                  onChange={(e) => setCmpDetails(e.target.value)}
                  placeholder="تفاصيل الشكوى *"
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <button type="submit" className="py-2 bg-[#0A1628] text-[#D4AF37] rounded-xl font-black cursor-pointer">
                  تسجيل شكوى مواطن
                </button>
              </form>
            )}

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

      {/* SubView 10: Configurable Decisions, Grants & Pricing Policy */}
      {subView === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-[#0A1628]">
            إعدادات القرارات التموينية وقيمة الدعم والمنح الاستثنائية (تُحفظ بإصدار تاريخي لكل شهر)
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
            <div className="flex items-center gap-2 pt-5">
              <input
                id="grant-enabled-chk"
                type="checkbox"
                checked={settingsDraft.additionalGrantEnabled}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, additionalGrantEnabled: e.target.checked })}
              />
              <label htmlFor="grant-enabled-chk" className="font-black text-slate-800 cursor-pointer">
                تفعيل احتساب المنحة الإضافية منفصلة
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
            سجل التدقيق والمراجعة لقسم السلع التموينية والتجارة الداخلية ({state.auditLogs.length})
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
