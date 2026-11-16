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
  RationDisbursementRecord,
  MerchantFinancialEntry,
  RationInspectionCampaign,
  RationComplaintRecord,
  ModuleAuditLog,
  OutletType,
  MerchantActivityStatus,
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
  onChangeState: (next: RationModuleState) => void;
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

  const isViewer = currentUser?.role === 'viewer';

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

  // Handlers
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
    };
    onChangeState({
      ...state,
      merchants: [...state.merchants, created],
      auditLogs: [
        appendAudit('إضافة', 'سجل التجار والمنافذ', created.id, created.merchantName),
        ...state.auditLogs,
      ],
    });
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
    onChangeState({
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
    });
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
    };

    const nextWarehouses = wh
      ? state.warehouses.map((w) =>
          w.id === wh.id ? { ...w, totalOut: round2(w.totalOut + disbQty) } : w
        )
      : state.warehouses;

    onChangeState({
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
    });
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
    };
    onChangeState({
      ...state,
      financialEntries: [newEntry, ...state.financialEntries],
      auditLogs: [
        appendAudit('اعتماد', 'كشف الحساب المالي للتاجر', newEntry.id, `${newEntry.documentNumber} بمبلغ ${finAmount}`),
        ...state.auditLogs,
      ],
    });
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
    };
    onChangeState({
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
    });
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
    const newReq = {
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
      status: 'معتمد' as const,
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
    };
    onChangeState({
      ...state,
      requisitions: [newReq, ...state.requisitions],
      auditLogs: [
        appendAudit('إضافة', 'الاستعاضة التموينية', newReq.id, `${newReq.requestNumber} بقيمة ${lineValue}`),
        ...state.auditLogs,
      ],
    });
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
    };
    onChangeState({
      ...state,
      inspections: [rec, ...state.inspections],
      auditLogs: [
        appendAudit('إضافة', 'الحملات التفتيشية والمخالفات', rec.id, `${rec.reportNumber} — ${rec.violationType}`),
        ...state.auditLogs,
      ],
    });
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
    };
    onChangeState({
      ...state,
      complaints: [rec, ...state.complaints],
      auditLogs: [appendAudit('إضافة', 'شكاوى المواطنين', rec.id, rec.ticketNumber), ...state.auditLogs],
    });
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
    onChangeState({
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
    });
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
    { id: 'financial', label: 'الحسابات والعمولات', icon: <Receipt className="w-3.5 h-3.5" /> },
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
          {!isViewer && (
            <form onSubmit={handleAddMerchant} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#0D9488]" />
                <span>تسجيل تاجر تمويني / منفذ جمعيتي / مجمع استهلاكي جديد</span>
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
                  className="px-4 py-2 bg-[#0D9488] hover:bg-teal-700 text-white rounded-xl font-black cursor-pointer"
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SubView 3: Cards & Automatic Monthly Entitlements */}
      {subView === 'cards' && selectedCard && selectedCardSummary && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-black text-[#0A1628]">
                استحقاق البطاقات التموينية والمقررات الشهرية (يستبعد الموقوفين تلقائياً)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                {state.settings.decisionNumber} • شهر {state.settings.activeMonth}
              </p>
            </div>
            <select
              value={selectedCard.id}
              onChange={(e) => setSelectedCardId(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black"
            >
              {state.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  بطاقة {c.cardNumber} — {c.headOfFamilyName} ({c.status})
                </option>
              ))}
            </select>
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

      {/* SubView 4: Commodities Directory & Immutable Price History */}
      {subView === 'commodities' && (
        <div className="space-y-4">
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
          {!isViewer && (
            <form onSubmit={handleRegisterDisbursement} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="text-xs font-black text-[#0A1628]">
                تسجيل عملية صرف مواطن (يتحقق آلياً من عدم التكرار ومن المقرر ومن رصيد المخزن)
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
                <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
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
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-black text-[#0A1628] mb-3">
            أرصدة المخازن والجرد الفعلي والتنبيهات الآلية (الرصيد = أول المدة + الوارد + مرتجع داخل - منصرف - مرتجع خارج ± تسويات)
          </h3>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SubView 7: Supply Requisitions */}
      {subView === 'requisitions' && (
        <div className="space-y-4">
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
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.requisitions.map((r) => {
                  const m = state.merchants.find((x) => x.id === r.merchantId);
                  const totals = computeRequisitionTotals(r);
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
              <button type="submit" className="px-4 py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
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
                  <th className="py-2 px-2 border border-slate-700">عكس القيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {state.financialEntries
                  .filter((e) => e.merchantId === selectedMerchantForFin.id)
                  .map((e) => (
                    <tr key={e.id} className={e.isReversed ? 'opacity-50 bg-slate-100' : ''}>
                      <td className="py-2 px-2 font-mono">{e.documentNumber}</td>
                      <td className="py-2 px-2 font-mono">{e.date}</td>
                      <td className="py-2 px-2">{e.entryType}</td>
                      <td className="py-2 px-2 font-mono text-rose-700">{e.debitAmount.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono text-emerald-700">{e.creditAmount.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">{e.description}</td>
                      <td className="py-2 px-2">
                        {!isViewer && !e.isReversed && e.entryType !== 'REVERSAL' ? (
                          <button
                            type="button"
                            onClick={() => handleReverseFinancialEntry(e)}
                            className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>قيد عكسي</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {e.isReversed ? 'معكوس' : '—'}
                          </span>
                        )}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-[#0A1628]">الحملات التفتيشية والمحاضر التموينية</h3>
            {!isViewer && (
              <form onSubmit={handleAddInspection} className="grid grid-cols-2 gap-2 text-xs">
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
                <button type="submit" className="col-span-2 py-2 bg-rose-700 text-white rounded-xl font-black cursor-pointer">
                  تسجيل محضر تفتيش
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-200 text-xs">
              {state.inspections.map((ins) => (
                <div key={ins.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-black text-[#0A1628]">{ins.reportNumber} — {ins.violationType}</div>
                    <div className="text-slate-500 font-bold">{ins.inspectorName} • {ins.dispositionStatus}</div>
                  </div>
                  <span className="font-mono font-black text-rose-700">{ins.financialValue.toLocaleString()} ج.م</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-[#0A1628]">سجل شكاوى وبلاغات المواطنين</h3>
            {!isViewer && (
              <form onSubmit={handleAddComplaint} className="space-y-2 text-xs">
                <input
                  type="text"
                  value={cmpCitizenName}
                  onChange={(e) => setCmpCitizenName(e.target.value)}
                  placeholder="اسم المواطن مقدم الشكوى *"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <input
                  type="text"
                  value={cmpDetails}
                  onChange={(e) => setCmpDetails(e.target.value)}
                  placeholder="تفاصيل الشكوى *"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
                <button type="submit" className="w-full py-2 bg-[#0D9488] text-white rounded-xl font-black cursor-pointer">
                  تسجيل شكوى مواطن
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-200 text-xs">
              {state.complaints.map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-black text-[#0A1628]">{c.ticketNumber} — {c.citizenName}</div>
                    <div className="text-slate-600 font-bold">{c.details}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black">{c.status}</span>
                </div>
              ))}
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
    </div>
  );
};
