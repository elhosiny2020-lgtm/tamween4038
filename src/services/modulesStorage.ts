import type {
  BranchModulesBundle,
  GasCylinderRecord,
  GrainAsset,
  GrainMaintenanceState,
  GrainMovementRecord,
  HrAttendanceRecord,
  HrEmployee,
  HrLeaveBalance,
  HrLeaveRequest,
  HrLoanRecord,
  HrModuleState,
  HrPolicySettingsVersion,
  HrPromotionRecord,
  MaintenanceOrder,
  MaintenanceTechnician,
  MerchantFinancialEntry,
  PetroleumProductRecord,
  RationCardRecord,
  RationCommodity,
  RationDecisionSettings,
  RationDisbursementRecord,
  RationInspectionCampaign,
  RationInventoryMovement,
  RationMerchant,
  RationModuleState,
  RationOfficeAccountingRecord,
  RationRequisition,
  RationWarehouseBalance,
  SparePartItem,
} from '../types/modules.ts';
import type { VillageHierarchy } from '../types.ts';
import { getAuthSessionToken, getSecurityShieldHeaders, getSupabaseClient, SESSION_CLIENT_ID } from '../lib/supabase.ts';
import {
  computeAttendanceMetrics,
  computeEmployeePayrollLine,
  parseEgyptianNationalId,
} from '../utils/hrPayrollMath.ts';
import {
  computeMaintenanceOrderCost,
  computeMoistureCorrectedWeight,
} from '../utils/grainMaintenanceMath.ts';
import { buildMay2026RationMerchantsList } from '../data/may2026RationMerchants.ts';
import { createInitialInternalTradeState } from '../data/internalTradeInitialData.ts';
import { buildGrainDepartmentCollections } from '../data/grainDepartmentInitialData.ts';
import { DEFAULT_BRANCH_ID } from '../utils/branchVaultUtils.ts';

const LOCAL_MODULES_STORAGE_PREFIX = 'tamween_branch_modules_v1::';

function getActiveMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function createInitialRationState(
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[]
): RationModuleState {
  const v1 = villages[0]?.village || 'بشبيش';
  const u1 = villages[0]?.localUnits?.[0] || 'بشبيش';
  const v2 = villages[1]?.village || 'دمرو';
  const u2 = villages[1]?.localUnits?.[0] || 'دمرو';
  const v3 = villages[2]?.village || 'بلقينا';
  const u3 = villages[2]?.localUnits?.[0] || 'بلقينا';
  const monthKey = getActiveMonthKey();
  const today = new Date().toISOString().split('T')[0];

  const settings: RationDecisionSettings = {
    activeMonth: monthKey,
    supportPerBeneficiary: 50,
    additionalGrantPerCard2026: 125,
    additionalGrantEnabled: true,
    decisionNumber: 'قرار وزاري 152 لسنة 2025 وتوجيهات 2026',
    decisionIssueDate: '2025-07-01',
    decisionEffectiveDate: '2025-07-01',
    attachmentRef: 'مرجع التوجيه الوزاري المعتمد',
    allowNegativeStockWithApproval: false,
    maxRequisitionInsuranceRatioNote: 'سقف الاستعاضة مرتبط بالتأمين النقدي المودع لكل منفذ',
    updatedBy: 'النظام الرئيسي',
    updatedAt: new Date().toISOString(),
  };

  const merchants: RationMerchant[] = buildMay2026RationMerchantsList(branchId, branchName, villages);

  const commodities: RationCommodity[] = [
    {
      id: `${branchId}-c-sugar`,
      code: 'COM-SUG-1K',
      name: 'سكر تمويني معبأ 1 كجم',
      category: 'سلع أساسية',
      unit: 'كيلو',
      packWeightGramsOrMl: 1000,
      officialPrice: 12.6,
      freeMarketRefPrice: 32,
      supplyCostPrice: 12.1,
      profitMargin: 0.5,
      commissionType: 'per_unit',
      commissionValue: 0.5,
      maxPerBeneficiary: 1,
      maxPerCard: 6,
      monthlyQuotaPerBeneficiary: 1,
      quotaRuleType: 'sugar_rule',
      priceStartDate: '2025-07-01',
      isActive: true,
      availabilityStatus: 'متاح',
      openingBalance: 800,
      inboundQty: 2200,
      outboundQty: 1650,
      minStockLevel: 300,
      maxStockLevel: 5000,
      batchNumber: 'BCH-SUG-2026-01',
      supplierCompany: 'الشركة العامة لتجارة الجملة',
      reorderLevel: 300,
      expiryDate: '2027-06-30',
      decisionNumber: settings.decisionNumber,
    },
    {
      id: `${branchId}-c-oil`,
      code: 'COM-OIL-800',
      name: 'زيت خليط 800 مللي',
      category: 'سلع أساسية',
      unit: 'زجاجة',
      packWeightGramsOrMl: 800,
      officialPrice: 30,
      freeMarketRefPrice: 52,
      supplyCostPrice: 28.75,
      profitMargin: 1.25,
      commissionType: 'per_unit',
      commissionValue: 1.25,
      maxPerBeneficiary: 1,
      maxPerCard: 4,
      monthlyQuotaPerBeneficiary: 1,
      quotaRuleType: 'oil_rule',
      priceStartDate: '2025-07-01',
      isActive: true,
      availabilityStatus: 'متاح',
      openingBalance: 600,
      inboundQty: 1800,
      outboundQty: 1450,
      minStockLevel: 250,
      maxStockLevel: 4000,
      batchNumber: 'BCH-OIL-2026-02',
      supplierCompany: 'الشركة العامة لتجارة الجملة',
      reorderLevel: 250,
      expiryDate: '2027-03-15',
      decisionNumber: settings.decisionNumber,
    },
    {
      id: `${branchId}-c-pasta`,
      code: 'COM-PAS-400',
      name: 'مكرونة 400 جرام',
      category: 'سلع جافة',
      unit: 'كيس',
      packWeightGramsOrMl: 400,
      officialPrice: 8.5,
      freeMarketRefPrice: 14,
      supplyCostPrice: 8.1,
      profitMargin: 0.4,
      commissionType: 'per_unit',
      commissionValue: 0.4,
      maxPerBeneficiary: 1,
      maxPerCard: 4,
      monthlyQuotaPerBeneficiary: 1,
      quotaRuleType: 'rice_pasta_rule',
      priceStartDate: '2025-07-01',
      isActive: true,
      availabilityStatus: 'متاح',
      openingBalance: 950,
      inboundQty: 2600,
      outboundQty: 2100,
      minStockLevel: 400,
      maxStockLevel: 6000,
      batchNumber: 'BCH-PAS-2026-03',
      supplierCompany: 'شركة المطاحن والمكرونة بالغربية',
      reorderLevel: 400,
      expiryDate: '2026-12-28',
      decisionNumber: settings.decisionNumber,
    },
    {
      id: `${branchId}-c-flour`,
      code: 'COM-FLR-1K',
      name: 'دقيق معبأ 1 كجم',
      category: 'سلع أساسية',
      unit: 'كيلو',
      packWeightGramsOrMl: 1000,
      officialPrice: 18,
      freeMarketRefPrice: 25,
      supplyCostPrice: 17.2,
      profitMargin: 0.8,
      commissionType: 'per_unit',
      commissionValue: 0.8,
      maxPerBeneficiary: 1,
      maxPerCard: 4,
      monthlyQuotaPerBeneficiary: 1,
      quotaRuleType: 'custom_rule',
      priceStartDate: '2025-07-01',
      isActive: true,
      availabilityStatus: 'متاح',
      openingBalance: 450,
      inboundQty: 1200,
      outboundQty: 980,
      minStockLevel: 200,
      maxStockLevel: 3500,
      batchNumber: 'BCH-FLR-2026-04',
      supplierCompany: 'الشركة العامة لتجارة الجملة',
      reorderLevel: 200,
      expiryDate: '2027-01-20',
      decisionNumber: settings.decisionNumber,
    },
  ];

  const priceHistory = commodities.map((c, idx) => ({
    id: `${branchId}-ph-${idx + 1}`,
    commodityId: c.id,
    officialPrice: c.officialPrice,
    freeMarketRefPrice: c.freeMarketRefPrice,
    supplyCostPrice: c.supplyCostPrice,
    profitMargin: c.profitMargin,
    commissionType: c.commissionType,
    commissionValue: c.commissionValue,
    effectiveFrom: c.priceStartDate,
    decisionNumber: c.decisionNumber,
    updatedBy: 'النظام الرئيسي',
    updatedAt: new Date().toISOString(),
  }));

  const cards: RationCardRecord[] = [
    {
      id: `${branchId}-card-1`,
      branchId,
      cardNumber: '117009841201',
      headOfFamilyName: 'محمد السيد عبد الفتاح',
      headNationalId: '28004111601118',
      merchantId: merchants[0].id,
      village: v1,
      localUnit: u1,
      status: 'سارية',
      hasAdditionalGrant: true,
      additionalGrantAmount: 125,
      members: [
        { id: 'mb-1', fullName: 'محمد السيد عبد الفتاح', nationalId: '28004111601118', relation: 'رب أسرة', status: 'مستحق' },
        { id: 'mb-2', fullName: 'فاطمة علي حسين', nationalId: '28406151602224', relation: 'زوجة', status: 'مستحق' },
        { id: 'mb-3', fullName: 'يوسف محمد السيد', nationalId: '30801121601115', relation: 'ابن', status: 'مستحق' },
        { id: 'mb-4', fullName: 'منة الله محمد السيد', nationalId: '31105051602228', relation: 'ابنة', status: 'مستحق' },
      ],
    },
    {
      id: `${branchId}-card-2`,
      branchId,
      cardNumber: '117009841299',
      headOfFamilyName: 'إبراهيم حسن عبد المنعم',
      headNationalId: '27902101601552',
      merchantId: merchants[1].id,
      village: v2,
      localUnit: u2,
      status: 'سارية',
      hasAdditionalGrant: false,
      members: [
        { id: 'mb-5', fullName: 'إبراهيم حسن عبد المنعم', nationalId: '27902101601552', relation: 'رب أسرة', status: 'مستحق' },
        { id: 'mb-6', fullName: 'هناء مصطفى كامل', nationalId: '28309011602664', relation: 'زوجة', status: 'مستحق' },
        { id: 'mb-7', fullName: 'خالد إبراهيم حسن', nationalId: '30502201601881', relation: 'ابن', status: 'موقوف', suspensionReason: 'تعديل قيد مستحق' },
      ],
    },
  ];

  const warehouses: RationWarehouseBalance[] = [
    {
      id: `${branchId}-wh-1`,
      branchId,
      merchantId: merchants[0].id,
      warehouseName: `مخزن ${merchants[0].merchantName}`,
      commodityId: commodities[0].id,
      openingBalance: 400,
      totalIn: 900,
      totalOut: 740,
      inboundReturns: 10,
      outboundReturns: 5,
      approvedAdjustments: 0,
      physicalCount: 565,
      reorderLevel: 300,
      lastMovementDate: today,
      expiryDate: '2027-06-30',
      stagnantDays: 3,
    },
    {
      id: `${branchId}-wh-2`,
      branchId,
      merchantId: merchants[0].id,
      warehouseName: `مخزن ${merchants[0].merchantName}`,
      commodityId: commodities[1].id,
      openingBalance: 220,
      totalIn: 500,
      totalOut: 530,
      inboundReturns: 0,
      outboundReturns: 0,
      approvedAdjustments: 0,
      physicalCount: 190,
      reorderLevel: 250,
      lastMovementDate: today,
      expiryDate: '2027-03-15',
      stagnantDays: 5,
    },
    {
      id: `${branchId}-wh-3`,
      branchId,
      merchantId: merchants[1].id,
      warehouseName: `مخزن ${merchants[1].merchantName}`,
      commodityId: commodities[2].id,
      openingBalance: 550,
      totalIn: 300,
      totalOut: 210,
      inboundReturns: 0,
      outboundReturns: 0,
      approvedAdjustments: -8,
      physicalCount: 625,
      reorderLevel: 400,
      lastMovementDate: today,
      expiryDate: '2026-12-28',
      stagnantDays: 22,
    },
  ];

  const movements: RationInventoryMovement[] = [
    {
      id: `${branchId}-mv-1`,
      branchId,
      documentNumber: 'MOV-2026-001',
      movementDate: today,
      movementType: 'RECEIPT_IN',
      merchantId: merchants[0].id,
      warehouseName: `مخزن ${merchants[0].merchantName}`,
      commodityId: commodities[0].id,
      requestedQty: 900,
      quantity: 900,
      rejectedQty: 0,
      unitPrice: 12.1,
      totalValue: 10890,
      balanceBefore: 400,
      balanceAfter: 1300,
      approvedBy: 'أمين مخزن الجملة',
    },
  ];

  const requisitions: RationRequisition[] = [
    {
      id: `${branchId}-req-1`,
      branchId,
      requestNumber: 'REQ-2026-101',
      invoiceNumber: 'INV-88101',
      monthKey,
      merchantId: merchants[0].id,
      traderCode: merchants[0].traderCode,
      posMachineNumber: merchants[0].posMachineNumber,
      wholesaleBranch: `فرع جملة ${branchName}`,
      linkedCardsCount: 380,
      linkedBeneficiariesCount: 1420,
      insuranceAmount: 50000,
      committedInsuranceBefore: 10890,
      previousStockTotalQty: 565,
      requestDate: today,
      deliveryDate: today,
      status: 'مكتمل',
      lines: [
        { commodityId: commodities[0].id, commodityName: commodities[0].name, requestedQty: 900, approvedQty: 900, deliveredQty: 900, supplyPrice: 12.1 },
      ],
      totalValue: 10890,
    },
    {
      id: `${branchId}-req-2`,
      branchId,
      requestNumber: 'REQ-2026-102',
      invoiceNumber: 'INV-88102',
      monthKey,
      merchantId: merchants[1].id,
      traderCode: merchants[1].traderCode,
      posMachineNumber: merchants[1].posMachineNumber,
      wholesaleBranch: `فرع جملة ${branchName}`,
      linkedCardsCount: merchants[1].linkedCardsCount,
      linkedBeneficiariesCount: merchants[1].linkedBeneficiariesCount,
      insuranceAmount: merchants[1].cashInsuranceAmount,
      committedInsuranceBefore: 8625,
      previousStockTotalQty: 320,
      requestDate: today,
      deliveryDate: today,
      status: 'معتمد',
      lines: [
        { commodityId: commodities[1].id, commodityName: commodities[1].name, requestedQty: 300, approvedQty: 300, deliveredQty: 280, supplyPrice: 28.75 },
      ],
      totalValue: 8625,
    },
  ];

  const disbursements: RationDisbursementRecord[] = [
    {
      id: `${branchId}-disb-1`,
      branchId,
      operationNumber: 'POS-OP-10001',
      monthKey,
      date: today,
      cardId: cards[0].id,
      merchantId: merchants[0].id,
      commodityId: commodities[0].id,
      quantity: 4,
      officialUnitPriceAtSale: 12.6,
      totalSaleValue: 50.4,
      supportDeducted: 50.4,
      citizenPaidAmount: 0,
      commissionEarned: 2.0,
      collectionMethod: 'بطاقة تموينية',
      employeeName: 'محمد الشهاوي',
    },
    {
      id: `${branchId}-disb-2`,
      branchId,
      operationNumber: 'POS-OP-10002',
      monthKey,
      date: today,
      cardId: cards[0].id,
      merchantId: merchants[0].id,
      commodityId: commodities[1].id,
      quantity: 4,
      officialUnitPriceAtSale: 30,
      totalSaleValue: 120,
      supportDeducted: 120,
      citizenPaidAmount: 0,
      commissionEarned: 5.0,
      collectionMethod: 'بطاقة تموينية',
      employeeName: 'محمد الشهاوي',
    },
  ];

  const financialEntries: MerchantFinancialEntry[] = [
    {
      id: `${branchId}-fin-1`,
      branchId,
      documentNumber: 'FIN-OPEN-01',
      date: today,
      merchantId: merchants[0].id,
      entryType: 'OPENING',
      debitAmount: 12500,
      creditAmount: 0,
      description: 'رصيد أول المدة المعتمد',
      isApproved: true,
      createdBy: 'النظام الرئيسي',
    },
    {
      id: `${branchId}-fin-2`,
      branchId,
      documentNumber: 'INV-88101',
      date: today,
      merchantId: merchants[0].id,
      entryType: 'SUPPLY_INVOICE',
      debitAmount: 10890,
      creditAmount: 0,
      description: 'فاتورة استعاضة سلع تموينية REQ-2026-101',
      isApproved: true,
      createdBy: 'فرع الجملة',
    },
    {
      id: `${branchId}-fin-3`,
      branchId,
      documentNumber: 'PAY-501',
      date: today,
      merchantId: merchants[0].id,
      entryType: 'PAYMENT_CREDIT',
      debitAmount: 0,
      creditAmount: 15000,
      description: 'إيصال سداد توريد نقدي بالبنك',
      isApproved: true,
      createdBy: 'الشئون المالية',
    },
    {
      id: `${branchId}-fin-4`,
      branchId,
      documentNumber: 'COM-501',
      date: today,
      merchantId: merchants[0].id,
      entryType: 'COMMISSION_EARNED',
      debitAmount: 0,
      creditAmount: 1480,
      description: 'عمولة تاجر عن صرف البطاقات التموينية للشهر الحالي',
      isApproved: true,
      createdBy: 'النظام الآلي',
    },
  ];

  const inspections: RationInspectionCampaign[] = [
    {
      id: `${branchId}-ins-1`,
      branchId,
      inspectionDateTime: `${today}T10:30`,
      inspectorName: 'أ/ محمود عبد العزيز - مفتش تموين أول',
      merchantId: merchants[1].id,
      village: v2,
      outletType: 'منفذ جمعيتي',
      violationType: 'فارق جرد سلعي',
      violationDescription: 'عجز 8 عبوات مكرونة أثناء الجرد المفاجئ للمنفذ',
      reportNumber: 'RPT-2026-441',
      violationQuantity: 8,
      financialValue: 68,
      issuingEntity: `إدارة تموين ${branchName}`,
      dispositionStatus: 'قيد الفحص',
      inspectionResult: 'مخالف',
      legalAction: 'تحرير محضر إثبات حالة وإخطار الشئون القانونية',
    },
  ];

  const gasCylinders: GasCylinderRecord[] = [
    {
      id: `${branchId}-gas-1`,
      branchId,
      warehouseName: 'مستودع غاز العشري',
      licenseNumber: 'LIC-GAS-101',
      ownerName: 'محمود عبد السلام العشري',
      governorate: 'الغربية',
      administration: branchName,
      center: branchName,
      localUnit: u1,
      village: v1,
      companyName: 'دي بي جاز (DB Gas)',
      cylinderType: 'منزلي',
      capacity: '12.5 كجم',
      openingBalance: 1500,
      receipts: 3000,
      disbursements: 4200,
      sales: 4100,
      transferred: 50,
      returns: 50,
      damaged: 10,
      remainingBalance: 350,
      officialPrice: 150,
      salesValue: 615000,
      assignedQuota: 4500,
      actualStock: 345,
      inventoryDifference: 5, // book - actual (5 عجز)
      date: today,
      receiptNoteNo: 'NOTE-G-8801',
      notes: 'انتظام صرف الحصة المنزلية ومطابقة الجرد',
    },
    {
      id: `${branchId}-gas-2`,
      branchId,
      warehouseName: 'مستودع غاز الشرقاية التجاري',
      licenseNumber: 'LIC-GAS-102',
      ownerName: 'سعيد عبد الحميد الشرقاوي',
      governorate: 'الغربية',
      administration: branchName,
      center: branchName,
      localUnit: u2,
      village: v2,
      companyName: 'مصر للبترول',
      cylinderType: 'تجاري',
      capacity: '25 كجم',
      openingBalance: 400,
      receipts: 800,
      disbursements: 1150,
      sales: 1120,
      transferred: 20,
      returns: 10,
      damaged: 2,
      remainingBalance: 60,
      officialPrice: 300,
      salesValue: 336000,
      assignedQuota: 1200,
      actualStock: 59,
      inventoryDifference: 1, // 1 عجز
      date: today,
      receiptNoteNo: 'NOTE-G-8802',
      notes: 'مستودع تجاري للأنشطة والمنشآت الخدمية',
    },
  ];

  const petroleumProducts: PetroleumProductRecord[] = [
    {
      id: `${branchId}-pet-1`,
      branchId,
      stationName: 'محطة وطنية للبترول - المحلة',
      licenseNumber: 'LIC-PET-501',
      ownerName: 'الشركة الوطنية للوقود',
      productName: 'السولار',
      openingStock: 45000,
      receipts: 120000,
      sales: 155000,
      transferred: 0,
      returns: 0,
      authorizedLoss: 150,
      bookStock: 9850,
      actualStock: 9800,
      inventoryDifference: 50, // 50 لتر عجز مسموح
      officialPricePerLiter: 13.5,
      totalSalesValue: 2092500,
      assignedQuota: 160000,
      date: today,
      invoiceNumber: 'INV-PET-9911',
      notes: 'انتظام توريد السولار للمخابز والمستودعات والسيارات',
    },
    {
      id: `${branchId}-pet-2`,
      branchId,
      stationName: 'محطة مصر للبترول - العباسي',
      licenseNumber: 'LIC-PET-502',
      ownerName: 'شركة مصر للبترول',
      productName: 'بنزين 92',
      openingStock: 25000,
      receipts: 60000,
      sales: 78000,
      transferred: 0,
      returns: 0,
      authorizedLoss: 80,
      bookStock: 6920,
      actualStock: 6920,
      inventoryDifference: 0,
      officialPricePerLiter: 15.25,
      totalSalesValue: 1189500,
      assignedQuota: 80000,
      date: today,
      invoiceNumber: 'INV-PET-9912',
      notes: 'مطابقة الأرصدة الدفترية والفعلية بنسبة 100%',
    },
  ];

  const rationOfficeAccounts: RationOfficeAccountingRecord[] = [
    {
      id: `${branchId}-acc-1`,
      branchId,
      officeName: 'مكتب تموين بشبيش الرئيسي',
      month: '11',
      year: '2026',
      commodityName: 'سكر',
      openingBalance: 1200,
      wholesaleReceipts: 3500,
      totalAvailable: 4700,
      smartCardDisbursements: 4450,
      unitPrice: 12.6,
      financialValue: 56070,
      endingBalance: 250,
      cardsCount: 3800,
      beneficiariesCount: 14200,
      notes: 'انتظام عمليات الصرف والترحيل الشهري السليم',
      isApproved: true,
    },
    {
      id: `${branchId}-acc-2`,
      branchId,
      officeName: 'مكتب تموين دمرو',
      month: '11',
      year: '2026',
      commodityName: 'زيت',
      openingBalance: 850,
      wholesaleReceipts: 2800,
      totalAvailable: 3650,
      smartCardDisbursements: 3520,
      unitPrice: 30,
      financialValue: 105600,
      endingBalance: 130,
      cardsCount: 2950,
      beneficiariesCount: 10900,
      notes: 'تمت مطابقة أرصدة شركة الجملة والبطاقات الذكية',
      isApproved: true,
    },
  ];

  return {
    merchants,
    commodities,
    priceHistory,
    cards,
    warehouses,
    movements,
    requisitions,
    disbursements,
    financialEntries,
    inspections,
    gasCylinders,
    petroleumProducts,
    rationOfficeAccounts,
    merchantMonthlyArchives: [
      {
        id: `${branchId}-arch-may2026`,
        monthLabel: 'تحديث بيانات التجار شهر مايو 2026 (النسخة الأصلية)',
        importedAt: '2026-05-01 09:00',
        importedBy: 'النظام الرئيسي',
        totalMerchants: merchants.length,
        activeCount: merchants.filter((m) => m.activityStatus === 'نشط').length,
        stoppedCount: merchants.filter((m) => m.activityStatus === 'متوقف' || m.activityStatus === 'موقوف').length,
        onLeaveCount: merchants.filter((m) => m.activityStatus === 'إجازة').length,
        totalInsuranceAmount: merchants.reduce((s, m) => s + (Number(m.cashInsuranceAmount) || 0), 0),
        summaryNotes: 'النسخة المرجعية المعتمدة من ملف Excel «تحديث بيانات التجار شهر مايو 2026» بإجمالي 116 تاجراً تموينياً.',
        merchantsSnapshot: merchants,
      },
    ],
    complaints: [
      {
        id: `${branchId}-cmp-1`,
        branchId,
        ticketNumber: 'CMP-2026-12',
        date: today,
        citizenName: 'عادل محمود إبراهيم',
        phone: '01099887766',
        village: v1,
        merchantId: merchants[0].id,
        category: 'صرف مقررات',
        details: 'استعلام عن موعد صرف المنحة الإضافية على البطاقة',
        status: 'تم الحل',
        resolution: 'تم الإفادة ومراجعة المنصرف على البطاقة بالمنفذ',
      },
    ],
    settings,
    settingsHistory: [settings],
    auditLogs: [],
  };
}

export function createInitialGrainMaintenanceState(
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[] = []
): GrainMaintenanceState {
  const today = new Date().toISOString().split('T')[0];
  const assets: GrainAsset[] = [
    {
      id: `${branchId}-asset-1`,
      branchId,
      assetCode: 'SILO-A1',
      name: 'الصومعة المعدنية الرئيسية (خلية 1)',
      assetType: 'صومعة',
      locationSite: `مجمع صوامع ${branchName}`,
      siloOrWarehouseName: 'صومعة حبوب رقم 1',
      manufacturer: 'Cimbria Denmark',
      model: 'CS-5000',
      serialNumber: 'SN-CM-2021-88',
      supplyDate: '2020-05-10',
      installDate: '2021-01-15',
      purchaseValue: 4500000,
      ratedCapacityTonPerHour: 120,
      operationalStatus: 'عاملة',
      lastMaintenanceDate: '2026-09-12',
      nextMaintenanceDate: '2026-12-12',
      operatingLifeYears: 20,
      warrantyEndDate: '2027-01-15',
      plannedHoursPerPeriod: 240,
      downtimeHours: 14,
      actualProductionTons: 22400,
      designProductionTons: 27120,
      conformingTons: 22180,
      energyConsumptionKwh: 18400,
      fuelConsumptionLiters: 420,
    },
    {
      id: `${branchId}-asset-2`,
      branchId,
      assetCode: 'ELEV-B2',
      name: 'مصعد النواقل الرأسي رقم 2',
      assetType: 'مصعد',
      locationSite: `مجمع صوامع ${branchName}`,
      siloOrWarehouseName: 'صومعة حبوب رقم 1',
      manufacturer: 'Buhler Group',
      model: 'BH-EL-150',
      serialNumber: 'SN-BH-2022-14',
      supplyDate: '2021-09-01',
      installDate: '2022-02-01',
      purchaseValue: 920000,
      ratedCapacityTonPerHour: 80,
      operationalStatus: 'تحت الصيانة',
      lastMaintenanceDate: today,
      nextMaintenanceDate: '2026-11-30',
      operatingLifeYears: 12,
      warrantyEndDate: '2025-02-01',
      plannedHoursPerPeriod: 200,
      downtimeHours: 28,
      actualProductionTons: 11200,
      designProductionTons: 13760,
      conformingTons: 11050,
      energyConsumptionKwh: 6900,
      fuelConsumptionLiters: 180,
    },
    {
      id: `${branchId}-asset-3`,
      branchId,
      assetCode: 'SHUNA-C1',
      name: 'الشونة الأسمنتية المطورة بالغربال',
      assetType: 'شونة',
      locationSite: `شونة مركزية ${branchName}`,
      siloOrWarehouseName: 'الشونة المطورة 1',
      manufacturer: 'الهيئة الهندسية',
      model: 'SH-3000',
      serialNumber: 'SN-SH-2019-03',
      supplyDate: '2019-03-01',
      installDate: '2019-04-01',
      purchaseValue: 1800000,
      ratedCapacityTonPerHour: 60,
      operationalStatus: 'عاملة',
      lastMaintenanceDate: '2026-08-20',
      nextMaintenanceDate: '2026-11-25',
      operatingLifeYears: 25,
      warrantyEndDate: '2024-04-01',
      plannedHoursPerPeriod: 180,
      downtimeHours: 6,
      actualProductionTons: 9800,
      designProductionTons: 10440,
      conformingTons: 9740,
      energyConsumptionKwh: 4100,
      fuelConsumptionLiters: 310,
    },
  ];

  const spareParts: SparePartItem[] = [
    {
      id: `${branchId}-sp-1`,
      branchId,
      partCode: 'SP-BRG-6312',
      partName: 'رولمان بلي عالي التحمل للمصاعد 6312',
      unit: 'قطعة',
      unitCost: 1450,
      openingStock: 14,
      inboundQty: 10,
      outboundQty: 16,
      damagedQty: 1,
      avgDailyConsumption: 0.4,
      supplyLeadDays: 10,
      safetyStock: 5,
      targetStockLevel: 20,
    },
    {
      id: `${branchId}-sp-2`,
      branchId,
      partCode: 'SP-BELT-400',
      partName: 'سير ناقل مطاطي مسلح عرض 40 سم (متر)',
      unit: 'متر',
      unitCost: 820,
      openingStock: 45,
      inboundQty: 20,
      outboundQty: 25,
      damagedQty: 0,
      avgDailyConsumption: 0.8,
      supplyLeadDays: 7,
      safetyStock: 10,
      targetStockLevel: 60,
    },
  ];

  const technicians: MaintenanceTechnician[] = [
    {
      id: `${branchId}-tech-1`,
      branchId,
      name: 'م/ طارق عبد السلام العشري',
      specialty: 'ميكانيكا صوامع ومصاعد غلال',
      hourlyWage: 140,
      phone: '01066554433',
      isActive: true,
    },
    {
      id: `${branchId}-tech-2`,
      branchId,
      name: 'فني/ محمد فوزي الشرقاوي',
      specialty: 'كهرباء كنترول وموازين إلكترونية',
      hourlyWage: 95,
      phone: '01244556677',
      isActive: true,
    },
  ];

  const order1Parts = [
    { partId: spareParts[0].id, partName: spareParts[0].partName, quantity: 2, unitCost: spareParts[0].unitCost },
  ];
  const order1Costs = computeMaintenanceOrderCost({
    technicianCount: 2,
    laborHours: 8,
    hourlyRate: 140,
    partsUsed: order1Parts,
    consumablesCost: 450,
    transportAndOpCost: 300,
    indirectOverheadPercent: 10,
    taxPercent: 14,
  });

  const orders: MaintenanceOrder[] = [
    {
      id: `${branchId}-mo-1`,
      branchId,
      orderNumber: 'MNT-2026-014',
      requestDate: today,
      siteName: `مجمع صوامع ${branchName}`,
      assetId: assets[1].id,
      maintenanceType: 'علاجية طارئة',
      faultDescription: 'اهتزاز وتآكل في مجموعة رولمان بلي المحور العلوي لمصعد النواقل',
      severity: 'عالية',
      stopStartDate: `${today}T08:00`,
      repairStartDate: `${today}T09:00`,
      repairEndDate: `${today}T17:00`,
      technicianCount: 2,
      technicianNames: `${technicians[0].name}، ${technicians[1].name}`,
      laborHours: 8,
      hourlyRate: 140,
      consumablesCost: 450,
      transportAndOpCost: 300,
      indirectOverheadPercent: 10,
      taxPercent: 14,
      partsUsed: order1Parts,
      ...order1Costs,
      status: 'مكتمل',
      createdAt: new Date().toISOString(),
    },
  ];

  const grainMovements: GrainMovementRecord[] = [
    {
      id: `${branchId}-gm-1`,
      branchId,
      documentNumber: 'GRN-2026-01',
      date: today,
      siloName: 'صومعة حبوب رقم 1',
      grainType: 'قمح مصري درجة أولى',
      movementType: 'رصيد أول المدة',
      originalWeightTons: 4200,
      actualMoisturePct: 12.2,
      referenceMoisturePct: 12.0,
      correctedWeightTons: computeMoistureCorrectedWeight(4200, 12.2, 12.0),
      actualPhysicalCountTons: 4185,
      recordedLossTons: 12,
      notes: 'رصيد تشغيلي معتمد بعد الفحص المعملي للرطوبة',
    },
    {
      id: `${branchId}-gm-2`,
      branchId,
      documentNumber: 'GRN-2026-02',
      date: today,
      siloName: 'الشونة المطورة 1',
      grainType: 'قمح مستورد خلط',
      movementType: 'وارد',
      originalWeightTons: 1450,
      actualMoisturePct: 13.4,
      referenceMoisturePct: 12.0,
      correctedWeightTons: computeMoistureCorrectedWeight(1450, 13.4, 12.0),
      actualPhysicalCountTons: 1425,
      recordedLossTons: 1.5,
      notes: 'وارد من الميناء وتم خصم فرق الرطوبة آلياً',
    },
  ];

  const grainDeptCollections = buildGrainDepartmentCollections(branchId, branchName, villages);

  return {
    assets,
    orders,
    spareParts,
    technicians,
    grainMovements,
    ...grainDeptCollections,
    settings: {
      defaultIndirectOverheadPct: 10,
      defaultTaxPct: 14,
      maxAcceptableGrainLossPct: 0.5,
      defaultReferenceMoisturePct: 12,
      defaultWheatTonPrice: 13333.33,
      defaultFlourTonPrice: 16000,
      defaultStandardExtractionPct: 82,
      maxAllowedExtractionVariancePct: 1.5,
      licenseExpiryWarningDays: 30,
      requireMakerCheckerApproval: true,
      allowQuotaOverIssueWithAdminReason: true,
      decisionNote: 'لائحة تشغيل وصيانة الصوامع والشون والثلاجات والمطاحن وحصص الدقيق القابلة للتعديل',
    },
    auditLogs: [],
  };
}

export function createInitialHrState(
  branchId: string,
  branchName: string
): HrModuleState {
  const monthKey = getActiveMonthKey();
  const today = new Date().toISOString().split('T')[0];

  const policySettings: HrPolicySettingsVersion = {
    id: `hr-pol-2026`,
    effectiveFrom: '2026-01',
    lawDecisionReference: 'لائحة شؤون العاملين وقوانين الضرائب والتأمينات (قابلة للتحديث)',
    dayCalculationBasis: 30,
    dailyWorkingHours: 6,
    employeeInsuranceRatePct: 11,
    employerInsuranceRatePct: 18.75,
    minInsurableWage: 2300,
    maxInsurableWage: 14500,
    annualTaxExemptionAmount: 20000,
    maxLoanDeductionCeilingPct: 25,
    taxBrackets: [
      { id: 'tb-1', minAnnual: 0, maxAnnual: 40000, ratePct: 0 },
      { id: 'tb-2', minAnnual: 40000, maxAnnual: 55000, ratePct: 10 },
      { id: 'tb-3', minAnnual: 55000, maxAnnual: 70000, ratePct: 15 },
      { id: 'tb-4', minAnnual: 70000, maxAnnual: 200000, ratePct: 20 },
      { id: 'tb-5', minAnnual: 200000, maxAnnual: null, ratePct: 22.5 },
    ],
    updatedBy: 'النظام الرئيسي',
    updatedAt: new Date().toISOString(),
  };

  const departments = [
    { id: `${branchId}-dep-1`, branchId, name: 'قسم الرقابة التموينية والتفتيش', managerName: 'أ/ سامي المتولي' },
    { id: `${branchId}-dep-2`, branchId, name: 'قسم شئون المخابز والمديونيات', managerName: 'م/ هاني عبد الفتاح' },
    { id: `${branchId}-dep-3`, branchId, name: 'قسم الشئون المالية والمرتبات', managerName: 'أ/ منى الشناوي' },
  ];

  const emp1Nid = parseEgyptianNationalId('28305141601119');
  const emp2Nid = parseEgyptianNationalId('29011221602226');

  const employees: HrEmployee[] = [
    {
      id: `${branchId}-emp-1`,
      branchId,
      employeeCode: 'EMP-1001',
      nationalId: '28305141601119',
      fullName: 'محمود عبد العزيز الدسوقي',
      birthDate: emp1Nid.birthDate || '1983-05-14',
      gender: emp1Nid.gender || 'ذكر',
      maritalStatus: 'متزوج ويعول',
      childrenCount: 2,
      address: `شارع الجيش - ${branchName}`,
      governorate: 'الغربية',
      district: branchName,
      village: 'المدينة',
      phone: '01011223344',
      jobTitle: 'كبير مفتشي تموين',
      qualitativeGroup: 'التنمية الإدارية والرقابة',
      jobGrade: 'الأولى أ',
      jobLevel: 'كبير باحثين',
      departmentName: departments[0].name,
      unitSection: 'شعبة المخابز',
      workEntity: `مديرية التموين بالغربية - ${branchName}`,
      workSite: branchName,
      hireDate: '2009-03-01',
      startWorkDate: '2009-03-05',
      appointmentType: 'تعيين دائم',
      appointmentDecisionNo: 'قرار 412 لسنة 2009',
      lastPromotionDate: '2022-07-01',
      nextExpectedPromotionDate: '2027-07-01',
      status: 'على رأس العمل',
      directManager: 'أ/ سامي المتولي',
      fileNumber: 'FILE-2009-101',
      functionalWage: 6200,
      complementaryWage: 2400,
      periodicAllowances: 450,
      specialAllowances: 350,
      monthlyIncentives: 1800,
      rewards: 250,
      allowancesTotal: 500,
      extraEntitlements: 0,
      insuranceNumber: 'INS-19044112',
      insuranceEntity: 'التأمينات الاجتماعية بالغربية',
      insurableWage: 9500,
      manualDeductions: 0,
      penalties: 0,
    },
    {
      id: `${branchId}-emp-2`,
      branchId,
      employeeCode: 'EMP-1002',
      nationalId: '29011221602226',
      fullName: 'نرمين مصطفى فؤاد العزب',
      birthDate: emp2Nid.birthDate || '1990-11-22',
      gender: emp2Nid.gender || 'أنثى',
      maritalStatus: 'متزوجة',
      childrenCount: 1,
      address: `حي أول - ${branchName}`,
      governorate: 'الغربية',
      district: branchName,
      village: 'المدينة',
      phone: '01199887755',
      jobTitle: 'باحث شئون مالية وأجور ثان',
      qualitativeGroup: 'التمويل والمحاسبة',
      jobGrade: 'الثانية ب',
      jobLevel: 'باحث ثان',
      departmentName: departments[2].name,
      unitSection: 'وحدة الاستحقاقات والمراجعة',
      workEntity: `مديرية التموين بالغربية - ${branchName}`,
      workSite: branchName,
      hireDate: '2016-07-01',
      startWorkDate: '2016-07-03',
      appointmentType: 'تعيين دائم',
      appointmentDecisionNo: 'قرار 811 لسنة 2016',
      lastPromotionDate: '2023-07-01',
      nextExpectedPromotionDate: '2027-07-01',
      status: 'على رأس العمل',
      directManager: 'أ/ منى الشناوي',
      fileNumber: 'FILE-2016-248',
      functionalWage: 4800,
      complementaryWage: 1700,
      periodicAllowances: 320,
      specialAllowances: 250,
      monthlyIncentives: 1350,
      rewards: 0,
      allowancesTotal: 380,
      extraEntitlements: 0,
      insuranceNumber: 'INS-22011890',
      insuranceEntity: 'التأمينات الاجتماعية بالغربية',
      insurableWage: 7200,
      manualDeductions: 0,
      penalties: 0,
    },
    {
      id: `${branchId}-emp-3`,
      branchId,
      employeeCode: 'EMP-PS-301',
      nationalId: '29801011603337',
      fullName: 'أحمد سعيد عبد الغني',
      birthDate: '1998-01-01',
      gender: 'ذكر',
      maritalStatus: 'أعزب',
      childrenCount: 0,
      address: `شارع الترعة - ${branchName}`,
      governorate: 'الغربية',
      district: branchName,
      village: 'المدينة',
      phone: '01055667788',
      jobTitle: 'معاون خدمة عامة وتوثيق',
      qualitativeGroup: 'الخدمة العامة',
      jobGrade: 'خدمة عامة',
      jobLevel: 'أول',
      departmentName: departments[0].name,
      unitSection: 'شعبة الخدمات',
      workEntity: `مديرية التموين بالغربية - ${branchName}`,
      workSite: branchName,
      hireDate: '2025-11-21',
      startWorkDate: '2025-11-21',
      appointmentType: 'خدمة عامة',
      appointmentDecisionNo: 'قرار خدمة عامة رقم 44',
      status: 'اقترب موعد انتهاء التعاقد',
      directManager: 'أ/ سامي المتولي',
      fileNumber: 'FILE-PS-301',
      employeeType: 'خدمة عامة',
      qualification: 'بكالوريوس تجارة واقتصاد',
      contractEndDate: '2026-11-21',
      contractDurationText: 'سنة واحدة',
      functionalWage: 3200,
      complementaryWage: 800,
      periodicAllowances: 0,
      specialAllowances: 0,
      monthlyIncentives: 500,
      rewards: 0,
      allowancesTotal: 0,
      extraEntitlements: 0,
      insurableWage: 4000,
      manualDeductions: 0,
      penalties: 0,
    },
    {
      id: `${branchId}-emp-4`,
      branchId,
      employeeCode: 'EMP-AST-402',
      nationalId: '29502021604448',
      fullName: 'إبراهيم محمد صابر النحاس',
      birthDate: '1995-02-02',
      gender: 'ذكر',
      maritalStatus: 'متزوج',
      childrenCount: 1,
      address: `ميدان المحطة - ${branchName}`,
      governorate: 'الغربية',
      district: branchName,
      village: 'المدينة',
      phone: '01233445566',
      jobTitle: 'مستعان به للشئون القانونية والتفتيش',
      qualitativeGroup: 'استعانة خبرات',
      jobGrade: 'عقد استعانة',
      jobLevel: 'خبير',
      departmentName: departments[1].name,
      unitSection: 'الشئون القانونية',
      workEntity: `مديرية التموين بالغربية - ${branchName}`,
      workSite: branchName,
      hireDate: '2025-05-01',
      startWorkDate: '2025-05-01',
      appointmentType: 'استعانة',
      appointmentDecisionNo: 'عقد استعانة رقم 12',
      status: 'منتهي التعاقد',
      directManager: 'م/ هاني عبد الفتاح',
      fileNumber: 'FILE-AST-402',
      employeeType: 'استعانة',
      qualification: 'ليسانس حقوق وشريعة',
      contractEndDate: '2026-11-10',
      contractDurationText: '6 أشهر',
      functionalWage: 4500,
      complementaryWage: 1200,
      periodicAllowances: 0,
      specialAllowances: 0,
      monthlyIncentives: 800,
      rewards: 0,
      allowancesTotal: 0,
      extraEntitlements: 0,
      insurableWage: 5700,
      manualDeductions: 0,
      penalties: 0,
    },
  ];

  const attDurations1 = computeAttendanceMetrics({
    officialStart: '08:00',
    officialEnd: '14:00',
    actualIn: '08:15',
    actualOut: '14:00',
    breakMinutes: 0,
  });
  const attDurations2 = computeAttendanceMetrics({
    officialStart: '08:00',
    officialEnd: '14:00',
    actualIn: '07:55',
    actualOut: '14:05',
    breakMinutes: 0,
  });
  const attendance: HrAttendanceRecord[] = [
    {
      id: `${branchId}-att-1`,
      branchId,
      employeeId: employees[0].id,
      date: today,
      monthKey,
      officialStart: '08:00',
      officialEnd: '14:00',
      actualIn: '08:15',
      actualOut: '14:00',
      breakMinutes: 0,
      lateMinutes: attDurations1.lateMinutes,
      earlyLeaveMinutes: attDurations1.earlyLeaveMinutes,
      netWorkedMinutes: attDurations1.netWorkedMinutes,
      status: 'حضور',
    },
    {
      id: `${branchId}-att-2`,
      branchId,
      employeeId: employees[1].id,
      date: today,
      monthKey,
      officialStart: '08:00',
      officialEnd: '14:00',
      actualIn: '07:55',
      actualOut: '14:05',
      breakMinutes: 0,
      lateMinutes: attDurations2.lateMinutes,
      earlyLeaveMinutes: attDurations2.earlyLeaveMinutes,
      netWorkedMinutes: attDurations2.netWorkedMinutes,
      status: 'حضور',
    },
  ];

  const leaveBalances: HrLeaveBalance[] = [
    { employeeId: employees[0].id, leaveType: 'اعتيادية', previousBalance: 12, entitledDays: 30, usedDays: 6 },
    { employeeId: employees[0].id, leaveType: 'عارضة', previousBalance: 0, entitledDays: 7, usedDays: 2 },
    { employeeId: employees[0].id, leaveType: 'مرضية', previousBalance: 0, entitledDays: 15, usedDays: 0 },
    { employeeId: employees[1].id, leaveType: 'اعتيادية', previousBalance: 8, entitledDays: 21, usedDays: 4 },
    { employeeId: employees[1].id, leaveType: 'عارضة', previousBalance: 0, entitledDays: 7, usedDays: 1 },
  ];

  const leaveRequests: HrLeaveRequest[] = [
    {
      id: `${branchId}-lr-1`,
      branchId,
      employeeId: employees[0].id,
      leaveType: 'اعتيادية',
      startDate: today,
      endDate: today,
      daysCount: 1,
      approvalDecisionNo: 'LVL-2026-09',
      status: 'معتمد',
      notes: 'إجازة اعتيادية معتمدة من مدير الإدارة',
    },
  ];

  const loans: HrLoanRecord[] = [
    {
      id: `${branchId}-ln-1`,
      branchId,
      loanNumber: 'LN-2026-031',
      employeeId: employees[1].id,
      totalAmount: 12000,
      disbursedDate: '2026-02-01',
      installmentsCount: 12,
      installmentAmount: 1000,
      paidInstallments: 4,
      remainingAmount: 8000,
      status: 'سارية',
    },
  ];

  const promotions: HrPromotionRecord[] = [
    {
      id: `${branchId}-pr-1`,
      branchId,
      employeeId: employees[0].id,
      currentGrade: 'الأولى أ',
      nextGrade: 'درجة كبير (إشرافية)',
      previousPromotionDate: '2022-07-01',
      dueDate: '2027-07-01',
      raiseBasisAmount: 6200,
      raisePct: 5,
      raiseAmount: 310,
      decisionNumber: 'مشروع ترقية 2027',
      applied: false,
    },
  ];

  const initialRunLines = employees.map((emp) =>
    computeEmployeePayrollLine({
      employee: emp,
      policy: policySettings,
      activeLoans: loans,
      unexcusedAbsenceDays: 0,
    })
  );

  return {
    departments,
    employees,
    attendance,
    leaveBalances,
    leaveRequests,
    loans,
    promotions,
    payrollRuns: [
      {
        id: `${branchId}-pay-${monthKey}`,
        branchId,
        monthKey,
        fiscalYear: monthKey.slice(0, 4),
        policyVersionId: policySettings.id,
        status: 'معاينة',
        lines: initialRunLines,
      },
    ],
    policySettings,
    policyVersionsHistory: [policySettings],
    auditLogs: [],
  };
}

export function createInitialBranchModulesBundle(
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[]
): BranchModulesBundle {
  return {
    branchId,
    ration: createInitialRationState(branchId, branchName, villages),
    internalTrade: createInitialInternalTradeState(branchId, branchName, villages),
    grainMaintenance: createInitialGrainMaintenanceState(branchId, branchName, villages),
    hr: createInitialHrState(branchId, branchName),
    updatedAt: new Date().toISOString(),
    seedMeta: {
      may2026MerchantsSeeded: true,
      grainCollectionsSeeded: true,
    },
  };
}

export function createEmptyBranchModulesBundle(
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[]
): BranchModulesBundle {
  const base = createInitialBranchModulesBundle(branchId, branchName, villages);
  const nowIso = new Date().toISOString();
  return {
    ...base,
    ration: {
      ...base.ration,
      merchants: [],
      commodities: [],
      priceHistory: [],
      cards: [],
      warehouses: [],
      movements: [],
      requisitions: [],
      disbursements: [],
      financialEntries: [],
      inspections: [],
      gasCylinders: [],
      petroleumProducts: [],
      rationOfficeAccounts: [],
      merchantMonthlyArchives: [],
      complaints: [],
      auditLogs: [],
    },
    internalTrade: base.internalTrade
      ? {
          ...base.internalTrade,
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
          auditLogs: [],
        }
      : undefined,
    grainMaintenance: {
      ...base.grainMaintenance,
      assets: [],
      orders: [],
      spareParts: [],
      technicians: [],
      grainMovements: [],
      shunas: [],
      wheatReceipts: [],
      wheatIssues: [],
      wheatLedgerMovements: [],
      shunaReconciliations: [],
      refrigerators: [],
      refrigeratorRooms: [],
      refrigeratorReceipts: [],
      refrigeratorIssues: [],
      refrigeratorAssets: [],
      refrigeratorTempLogs: [],
      refrigeratorMaintenance: [],
      refrigeratorFinancials: [],
      mills: [],
      millLicenses: [],
      millWheatReceipts: [],
      millDailyOperations: [],
      millProductions: [],
      millMachinery: [],
      millMaintenance: [],
      millInspections: [],
      millAssets: [],
      flourQuotaMaster: [],
      flourDailyDistributions: [],
      flourMonthlyQuotas: [],
      flourIssues: [],
      flourQuotaAmendments: [],
      millBakeryMappings: [],
      millFlourStockBalances: [],
      centralFinancialLedger: [],
      auditLogs: [],
    },
    hr: {
      ...base.hr,
      employees: [],
      attendance: [],
      leaveBalances: [],
      leaveRequests: [],
      loans: [],
      promotions: [],
      payrollRuns: [],
      auditLogs: [],
    },
    updatedAt: nowIso,
    seedMeta: {
      may2026MerchantsSeeded: true,
      grainCollectionsSeeded: true,
      factoryResetAt: nowIso,
    },
  };
}

export function upgradeModulesBundleIfNeeded(
  bundle: BranchModulesBundle,
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[]
): { bundle: BranchModulesBundle; upgraded: boolean } {
  let upgraded = false;
  let nextRation = bundle.ration;
  const nextSeedMeta = { ...(bundle.seedMeta || {}) };

  const isDefaultBranch = branchId === DEFAULT_BRANCH_ID;
  const wasFactoryReset = Boolean(nextSeedMeta.factoryResetAt);
  const alreadyHasMay2026Archive =
    Array.isArray(nextRation.merchantMonthlyArchives) &&
    nextRation.merchantMonthlyArchives.some(
      (a) =>
        String(a?.id || '').includes('may2026') ||
        String(a?.monthLabel || '').includes('مايو 2026')
    );
  const alreadySeededMerchants =
    !isDefaultBranch ||
    Boolean(nextSeedMeta.may2026MerchantsSeeded) ||
    wasFactoryReset ||
    alreadyHasMay2026Archive;

  if (!alreadySeededMerchants && !nextSeedMeta.may2026MerchantsSeeded) {
    // Only seed legacy default-branch bundles that have NEVER been seeded with May 2026 merchants
    const currentMerchants = Array.isArray(nextRation.merchants) ? nextRation.merchants : [];
    const shouldSeedLegacy = !Array.isArray(nextRation.merchants) || currentMerchants.length <= 3;

    if (shouldSeedLegacy) {
      const fullMayList = buildMay2026RationMerchantsList(branchId, branchName, villages);
      const existingById = new Map(currentMerchants.map((m) => [m.id, m]));
      const mergedMerchants = fullMayList.map((m) => existingById.get(m.id) || m);
      nextRation = {
        ...nextRation,
        merchants: mergedMerchants,
        merchantMonthlyArchives:
          Array.isArray(nextRation.merchantMonthlyArchives) &&
          nextRation.merchantMonthlyArchives.length > 0
            ? nextRation.merchantMonthlyArchives
            : [
                {
                  id: `${branchId}-arch-may2026`,
                  monthLabel: 'تحديث بيانات التجار شهر مايو 2026 (النسخة الأصلية)',
                  importedAt: '2026-05-01 09:00',
                  importedBy: 'النظام الرئيسي',
                  totalMerchants: mergedMerchants.length,
                  activeCount: mergedMerchants.filter((m) => m.activityStatus === 'نشط').length,
                  stoppedCount: mergedMerchants.filter(
                    (m) => m.activityStatus === 'متوقف' || m.activityStatus === 'موقوف'
                  ).length,
                  onLeaveCount: mergedMerchants.filter((m) => m.activityStatus === 'إجازة').length,
                  totalInsuranceAmount: mergedMerchants.reduce(
                    (s, m) => s + (Number(m.cashInsuranceAmount) || 0),
                    0
                  ),
                  summaryNotes:
                    'النسخة المرجعية المعتمدة من ملف Excel «تحديث بيانات التجار شهر مايو 2026» بإجمالي 116 تاجراً تموينياً.',
                  merchantsSnapshot: mergedMerchants,
                },
              ],
      };
      nextSeedMeta.may2026MerchantsSeeded = true;
      upgraded = true;
    } else {
      nextSeedMeta.may2026MerchantsSeeded = true;
      upgraded = true;
    }
  } else if (!nextSeedMeta.may2026MerchantsSeeded) {
    nextSeedMeta.may2026MerchantsSeeded = true;
    upgraded = true;
  }

  // Safely backfill missing expiry metadata ONLY on existing merchants — NEVER re-add deleted merchants!
  if (
    Array.isArray(nextRation.merchants) &&
    nextRation.merchants.length > 0 &&
    nextRation.merchants.some((m) => !m.taxCardExpiryDate || !m.commercialRegExpiryDate)
  ) {
    const fullMayList = isDefaultBranch
      ? buildMay2026RationMerchantsList(branchId, branchName, villages)
      : [];
    const seedById = new Map(fullMayList.map((m) => [m.id, m]));
    const backfilledMerchants = nextRation.merchants.map((m, idx) => {
      const seededRef = seedById.get(m.id);
      return {
        ...m,
        traderCode: m.traderCode || seededRef?.traderCode || `TRD-16-${5001 + idx}`,
        posMachineNumber: m.posMachineNumber || seededRef?.posMachineNumber || `1604${8001 + idx}`,
        commercialRegNumber: m.commercialRegNumber || seededRef?.commercialRegNumber || `CR-${30001 + idx}`,
        taxCardNumber: m.taxCardNumber || seededRef?.taxCardNumber || `TX-410-${101 + idx}-16`,
        licenseNumber: m.licenseNumber || seededRef?.licenseNumber || `LIC-TM-${2001 + idx}`,
        licenseExpiryDate: m.licenseExpiryDate || seededRef?.licenseExpiryDate || '2027-05-01',
        taxCardExpiryDate: m.taxCardExpiryDate || seededRef?.taxCardExpiryDate || '2027-08-15',
        commercialRegExpiryDate: m.commercialRegExpiryDate || seededRef?.commercialRegExpiryDate || '2027-09-30',
      };
    });
    nextRation = {
      ...nextRation,
      merchants: backfilledMerchants,
    };
    upgraded = true;
  }

  let nextInternalTrade = bundle.internalTrade;
  if (!nextInternalTrade || !Array.isArray(nextInternalTrade.establishments)) {
    const baseInternal = createInitialInternalTradeState(branchId, branchName, villages);
    nextInternalTrade =
      !isDefaultBranch || wasFactoryReset
        ? {
            ...baseInternal,
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
            auditLogs: [],
          }
        : baseInternal;
    upgraded = true;
  }

  let nextGrain = bundle.grainMaintenance;
  // ONLY populate collections that are literally undefined (not Arrays); NEVER overwrite intentionally emptied arrays []
  // AND NEVER seed demo collections for non-Mahalla branches or factory-reset bundles!
  if (
    !nextSeedMeta.grainCollectionsSeeded &&
    (!Array.isArray(nextGrain.shunas) ||
      !Array.isArray(nextGrain.wheatReceipts) ||
      !Array.isArray(nextGrain.refrigerators) ||
      !Array.isArray(nextGrain.mills) ||
      !Array.isArray(nextGrain.flourQuotaMaster))
  ) {
    const seeded =
      isDefaultBranch && !wasFactoryReset
        ? buildGrainDepartmentCollections(branchId, branchName, villages)
        : null;
    nextGrain = {
      ...nextGrain,
      shunas: Array.isArray(nextGrain.shunas) ? nextGrain.shunas : seeded?.shunas || [],
      wheatReceipts: Array.isArray(nextGrain.wheatReceipts) ? nextGrain.wheatReceipts : seeded?.wheatReceipts || [],
      wheatIssues: Array.isArray(nextGrain.wheatIssues) ? nextGrain.wheatIssues : seeded?.wheatIssues || [],
      wheatLedgerMovements: Array.isArray(nextGrain.wheatLedgerMovements)
        ? nextGrain.wheatLedgerMovements
        : seeded?.wheatLedgerMovements || [],
      shunaReconciliations: Array.isArray(nextGrain.shunaReconciliations)
        ? nextGrain.shunaReconciliations
        : seeded?.shunaReconciliations || [],
      refrigerators: Array.isArray(nextGrain.refrigerators) ? nextGrain.refrigerators : seeded?.refrigerators || [],
      refrigeratorRooms: Array.isArray(nextGrain.refrigeratorRooms)
        ? nextGrain.refrigeratorRooms
        : seeded?.refrigeratorRooms || [],
      refrigeratorReceipts: Array.isArray(nextGrain.refrigeratorReceipts)
        ? nextGrain.refrigeratorReceipts
        : seeded?.refrigeratorReceipts || [],
      refrigeratorIssues: Array.isArray(nextGrain.refrigeratorIssues)
        ? nextGrain.refrigeratorIssues
        : seeded?.refrigeratorIssues || [],
      refrigeratorAssets: Array.isArray(nextGrain.refrigeratorAssets)
        ? nextGrain.refrigeratorAssets
        : seeded?.refrigeratorAssets || [],
      refrigeratorTempLogs: Array.isArray(nextGrain.refrigeratorTempLogs)
        ? nextGrain.refrigeratorTempLogs
        : seeded?.refrigeratorTempLogs || [],
      refrigeratorMaintenance: Array.isArray(nextGrain.refrigeratorMaintenance)
        ? nextGrain.refrigeratorMaintenance
        : seeded?.refrigeratorMaintenance || [],
      refrigeratorFinancials: Array.isArray(nextGrain.refrigeratorFinancials)
        ? nextGrain.refrigeratorFinancials
        : seeded?.refrigeratorFinancials || [],
      mills: Array.isArray(nextGrain.mills) ? nextGrain.mills : seeded?.mills || [],
      millLicenses: Array.isArray(nextGrain.millLicenses) ? nextGrain.millLicenses : seeded?.millLicenses || [],
      millWheatReceipts: Array.isArray(nextGrain.millWheatReceipts)
        ? nextGrain.millWheatReceipts
        : seeded?.millWheatReceipts || [],
      millDailyOperations: Array.isArray(nextGrain.millDailyOperations)
        ? nextGrain.millDailyOperations
        : seeded?.millDailyOperations || [],
      millProductions: Array.isArray(nextGrain.millProductions) ? nextGrain.millProductions : seeded?.millProductions || [],
      millMachinery: Array.isArray(nextGrain.millMachinery) ? nextGrain.millMachinery : seeded?.millMachinery || [],
      millMaintenance: Array.isArray(nextGrain.millMaintenance) ? nextGrain.millMaintenance : seeded?.millMaintenance || [],
      millInspections: Array.isArray(nextGrain.millInspections) ? nextGrain.millInspections : seeded?.millInspections || [],
      millAssets: Array.isArray(nextGrain.millAssets) ? nextGrain.millAssets : seeded?.millAssets || [],
      flourQuotaMaster: Array.isArray(nextGrain.flourQuotaMaster)
        ? nextGrain.flourQuotaMaster
        : seeded?.flourQuotaMaster || [],
      flourDailyDistributions: Array.isArray(nextGrain.flourDailyDistributions)
        ? nextGrain.flourDailyDistributions
        : seeded?.flourDailyDistributions || [],
      flourMonthlyQuotas: Array.isArray(nextGrain.flourMonthlyQuotas)
        ? nextGrain.flourMonthlyQuotas
        : seeded?.flourMonthlyQuotas || [],
      flourIssues: Array.isArray(nextGrain.flourIssues) ? nextGrain.flourIssues : seeded?.flourIssues || [],
      flourQuotaAmendments: Array.isArray(nextGrain.flourQuotaAmendments)
        ? nextGrain.flourQuotaAmendments
        : seeded?.flourQuotaAmendments || [],
      millBakeryMappings: Array.isArray(nextGrain.millBakeryMappings)
        ? nextGrain.millBakeryMappings
        : seeded?.millBakeryMappings || [],
      millFlourStockBalances: Array.isArray(nextGrain.millFlourStockBalances)
        ? nextGrain.millFlourStockBalances
        : seeded?.millFlourStockBalances || [],
      centralFinancialLedger: Array.isArray(nextGrain.centralFinancialLedger)
        ? nextGrain.centralFinancialLedger
        : seeded?.centralFinancialLedger || [],
      settings: {
        defaultIndirectOverheadPct: nextGrain.settings?.defaultIndirectOverheadPct ?? 10,
        defaultTaxPct: nextGrain.settings?.defaultTaxPct ?? 14,
        maxAcceptableGrainLossPct: nextGrain.settings?.maxAcceptableGrainLossPct ?? 0.5,
        defaultReferenceMoisturePct: nextGrain.settings?.defaultReferenceMoisturePct ?? 12,
        defaultWheatTonPrice: nextGrain.settings?.defaultWheatTonPrice ?? 13333.33,
        defaultFlourTonPrice: nextGrain.settings?.defaultFlourTonPrice ?? 16000,
        defaultStandardExtractionPct: nextGrain.settings?.defaultStandardExtractionPct ?? 82,
        maxAllowedExtractionVariancePct: nextGrain.settings?.maxAllowedExtractionVariancePct ?? 1.5,
        licenseExpiryWarningDays: nextGrain.settings?.licenseExpiryWarningDays ?? 30,
        requireMakerCheckerApproval: nextGrain.settings?.requireMakerCheckerApproval ?? true,
        allowQuotaOverIssueWithAdminReason:
          nextGrain.settings?.allowQuotaOverIssueWithAdminReason ?? true,
        decisionNote:
          nextGrain.settings?.decisionNote ||
          'لائحة تشغيل وصيانة الصوامع والشون والثلاجات والمطاحن وحصص الدقيق القابلة للتعديل',
      },
    };
    nextSeedMeta.grainCollectionsSeeded = true;
    upgraded = true;
  } else if (!nextSeedMeta.grainCollectionsSeeded) {
    nextSeedMeta.grainCollectionsSeeded = true;
    upgraded = true;
  }

  // Clear pre-existing Shona wheat stock movement ledger data once (per user request) without blocking future additions
  if (!nextSeedMeta.wheatLedgerClearedV1) {
    if (Array.isArray(nextGrain.wheatLedgerMovements) && nextGrain.wheatLedgerMovements.length > 0) {
      nextGrain = {
        ...nextGrain,
        wheatLedgerMovements: [],
      };
    }
    nextSeedMeta.wheatLedgerClearedV1 = true;
    upgraded = true;
  }

  if (!upgraded) return { bundle, upgraded: false };
  return {
    bundle: {
      ...bundle,
      ration: nextRation,
      internalTrade: nextInternalTrade,
      grainMaintenance: nextGrain,
      seedMeta: nextSeedMeta,
    },
    upgraded: true,
  };
}

function parseBundleTimestampMs(bundle?: BranchModulesBundle | null): number {
  if (!bundle?.updatedAt) return 0;
  const ms = Date.parse(bundle.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

export function readLocalBranchModulesBundle(branchId: string): BranchModulesBundle | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(`${LOCAL_MODULES_STORAGE_PREFIX}${branchId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ration && parsed.grainMaintenance && parsed.hr) {
      return parsed as BranchModulesBundle;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLocalBranchModulesBundle(branchId: string, bundle: BranchModulesBundle): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${LOCAL_MODULES_STORAGE_PREFIX}${branchId}`, JSON.stringify(bundle));
  } catch {
    // Quota fallback: strip redundant merchantsSnapshot inside monthly archives so deletions ALWAYS persist in localStorage
    try {
      const compactBundle: BranchModulesBundle = {
        ...bundle,
        ration: {
          ...bundle.ration,
          merchantMonthlyArchives: (bundle.ration?.merchantMonthlyArchives || []).map((arch) => ({
            ...arch,
            merchantsSnapshot: [],
          })),
          auditLogs: (bundle.ration?.auditLogs || []).slice(0, 80),
        },
        internalTrade: bundle.internalTrade
          ? {
              ...bundle.internalTrade,
              auditLogs: (bundle.internalTrade.auditLogs || []).slice(0, 80),
            }
          : bundle.internalTrade,
        grainMaintenance: {
          ...bundle.grainMaintenance,
          auditLogs: (bundle.grainMaintenance?.auditLogs || []).slice(0, 80),
        },
        hr: {
          ...bundle.hr,
          auditLogs: (bundle.hr?.auditLogs || []).slice(0, 80),
        },
      };
      localStorage.setItem(`${LOCAL_MODULES_STORAGE_PREFIX}${branchId}`, JSON.stringify(compactBundle));
    } catch {
      // ignore if storage is completely unavailable
    }
  }
}

export function clearLocalBranchModulesBundle(branchId: string): void {
  try {
    const existingTimer = pendingDebouncedBundleTimers.get(branchId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingDebouncedBundleTimers.delete(branchId);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${LOCAL_MODULES_STORAGE_PREFIX}${branchId}`);
    }
  } catch {
    // ignore
  }
}

/**
 * تصفير بيانات الأقسام (السلع التموينية، التجارة الداخلية، صيانة الحبوب، الموارد البشرية)
 * للفرع المحدد فقط دون المساس بأي فرع آخر.
 */
export async function resetBranchModulesBundleForBranch(
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[],
  updatedBy = 'مدير النظام'
): Promise<BranchModulesBundle> {
  const emptyBundle = createEmptyBranchModulesBundle(branchId, branchName, villages);
  writeLocalBranchModulesBundle(branchId, emptyBundle);
  try {
    if (typeof fetch !== 'undefined') {
      await fetch(`/api/modules/${encodeURIComponent(branchId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: {
          ...getSecurityShieldHeaders(true),
        },
        body: JSON.stringify({ confirmPurge: true, branchId, clientId: SESSION_CLIENT_ID }),
      }).catch(() => null);
    }
  } catch {}
  await saveBranchModulesBundle(branchId, emptyBundle, updatedBy).catch(() => null);
  return emptyBundle;
}

export interface ModuleSaveResult {
  success: boolean;
  syncedAt: string;
  version?: number;
  error?: string;
}

export async function loadBranchModulesBundle(
  branchId: string,
  branchName: string,
  villages: VillageHierarchy[]
): Promise<BranchModulesBundle> {
  const local = readLocalBranchModulesBundle(branchId);
  const localTs = parseBundleTimestampMs(local);

  let remoteCandidate: BranchModulesBundle | null = null;

  if (typeof fetch !== 'undefined' && typeof window !== 'undefined') {
    try {
      const resp = await fetch(`/api/modules/${encodeURIComponent(branchId)}?_t=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          ...getSecurityShieldHeaders(false),
        },
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json?.exists && json?.payload?.ration && json?.payload?.grainMaintenance && json?.payload?.hr) {
          remoteCandidate = json.payload as BranchModulesBundle;
        }
      }
    } catch {
      // fallback cleanly to Supabase or local seed
    }
  }

  if (!remoteCandidate) {
    const sb = getSupabaseClient();
    if (sb) {
      try {
        const { data } = await sb
          .from('backup_snapshots')
          .select('payload')
          .eq('id', `mod__${branchId}__all_modules`)
          .maybeSingle();
        if (data?.payload?.ration && data?.payload?.grainMaintenance && data?.payload?.hr) {
          remoteCandidate = data.payload as BranchModulesBundle;
        }
      } catch {
        // ignore if backup_snapshots doesn't have it
      }
    }
  }

  const remoteTs = parseBundleTimestampMs(remoteCandidate);

  // Respect the most recent mutation timestamp so local deletions/edits are NEVER overwritten by stale remote copies
  if (local && (!remoteCandidate || localTs >= remoteTs)) {
    const { bundle, upgraded } = upgradeModulesBundleIfNeeded(local, branchId, branchName, villages);
    writeLocalBranchModulesBundle(branchId, bundle);
    if (upgraded || localTs > remoteTs) {
      void saveBranchModulesBundle(branchId, bundle, 'مزامنة تلقائية لأحدث التعديلات');
    }
    return bundle;
  }

  if (remoteCandidate) {
    const { bundle, upgraded } = upgradeModulesBundleIfNeeded(
      remoteCandidate,
      branchId,
      branchName,
      villages
    );
    writeLocalBranchModulesBundle(branchId, bundle);
    if (upgraded) {
      void saveBranchModulesBundle(branchId, bundle, 'تحديث هيكل بيانات الأقسام');
    }
    return bundle;
  }

  // Non-default branches ALWAYS initialize completely zeroed out (no mother-DB records)
  const initial =
    branchId === DEFAULT_BRANCH_ID
      ? createInitialBranchModulesBundle(branchId, branchName, villages)
      : createEmptyBranchModulesBundle(branchId, branchName, villages);
  writeLocalBranchModulesBundle(branchId, initial);
  void saveBranchModulesBundle(branchId, initial, 'النظام الرئيسي');
  return initial;
}

const activeBroadcastChannels = new Map<string, any>();

function getOrCreateBroadcastChannel(sb: any, branchId: string) {
  const existing = activeBroadcastChannels.get(branchId);
  if (existing) return existing;
  const ch = sb.channel(`tamween-modules-${branchId}`);
  activeBroadcastChannels.set(branchId, ch);
  return ch;
}

let inFlightSavePromise: Promise<ModuleSaveResult> | null = null;
const lastMonotonicTsByBranch = new Map<string, number>();

function nextMonotonicIso(branchId: string, prevIso?: string): string {
  const prevMs = Math.max(
    lastMonotonicTsByBranch.get(branchId) || 0,
    prevIso ? Date.parse(prevIso) || 0 : 0
  );
  const nextMs = Math.max(Date.now(), prevMs + 1);
  lastMonotonicTsByBranch.set(branchId, nextMs);
  return new Date(nextMs).toISOString();
}

export async function saveBranchModulesBundle(
  branchId: string,
  bundle: BranchModulesBundle,
  updatedBy = 'مستخدم المنظومة'
): Promise<ModuleSaveResult> {
  const nowIso = nextMonotonicIso(branchId, bundle.updatedAt);
  const withTimestamp: BranchModulesBundle = {
    ...bundle,
    branchId,
    updatedAt: nowIso,
    seedMeta: {
      may2026MerchantsSeeded: true,
      grainCollectionsSeeded: true,
      ...(bundle.seedMeta || {}),
    },
  };
  // Write synchronously to localStorage immediately so deletions/edits persist even on instant reload
  writeLocalBranchModulesBundle(branchId, withTimestamp);

  const runSave = async (): Promise<ModuleSaveResult> => {
    let serverOk = false;
    let supaOk = false;
    let version = 1;
    let lastErr = '';

    if (typeof fetch !== 'undefined' && (typeof window !== 'undefined' || getAuthSessionToken())) {
      try {
        const resp = await fetch(`/api/modules/${encodeURIComponent(branchId)}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            ...getSecurityShieldHeaders(true),
          },
          body: JSON.stringify({
            moduleKey: 'all_modules',
            payload: withTimestamp,
            updatedBy,
            clientId: SESSION_CLIENT_ID,
          }),
        });
        if (resp.ok) {
          const json = await resp.json();
          serverOk = Boolean(json?.success);
          if (typeof json?.version === 'number') version = json.version;
        } else {
          lastErr = `HTTP ${resp.status}`;
        }
      } catch (e: any) {
        lastErr = e?.message || 'تعذر الاتصال بالخادم';
      }
    }

    const sb = getSupabaseClient();
    if (sb) {
      try {
        const { error } = await sb.from('backup_snapshots').upsert(
          {
            id: `mod__${branchId}__all_modules`,
            branch_id: branchId,
            payload: withTimestamp,
            updated_at: withTimestamp.updatedAt,
          },
          { onConflict: 'id' }
        );
        if (!error) {
          supaOk = true;
        }
        const ch = getOrCreateBroadcastChannel(sb, branchId);
        void ch.send({
          type: 'broadcast',
          event: 'module_bundle_sync',
          payload: {
            branchId,
            clientId: SESSION_CLIENT_ID,
            updatedBy,
            updatedAt: withTimestamp.updatedAt,
            bundle: withTimestamp,
          },
        });
      } catch {
        // ignore if offline or RLS prevents snapshot write
      }
    }

    return {
      success: serverOk || supaOk,
      syncedAt: withTimestamp.updatedAt,
      version,
      error: serverOk || supaOk ? undefined : lastErr || undefined,
    };
  };

  lastLocalSaveTimeByBranch.set(branchId, Date.now());
  if (inFlightSavePromise) {
    inFlightSavePromise = inFlightSavePromise.then(() => runSave(), () => runSave());
  } else {
    inFlightSavePromise = runSave();
  }
  return inFlightSavePromise;
}

const lastLocalSaveTimeByBranch = new Map<string, number>();
const pendingDebouncedBundleTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveBranchModulesBundleDebounced(
  branchId: string,
  bundle: BranchModulesBundle,
  updatedBy = 'مدير النظام',
  delayMs = 150
): void {
  const nowIso = new Date().toISOString();
  const stamped: BranchModulesBundle = {
    ...bundle,
    branchId,
    updatedAt: nowIso,
    seedMeta: {
      may2026MerchantsSeeded: true,
      grainCollectionsSeeded: true,
      ...(bundle.seedMeta || {}),
    },
  };
  writeLocalBranchModulesBundle(branchId, stamped);
  lastLocalSaveTimeByBranch.set(branchId, Date.now());
  const existingTimer = pendingDebouncedBundleTimers.get(branchId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    pendingDebouncedBundleTimers.delete(branchId);
    void saveBranchModulesBundle(branchId, stamped, updatedBy);
  }, delayMs);
  pendingDebouncedBundleTimers.set(branchId, timer);
}

/**
 * الاشتراك في تحديثات Supabase Realtime الفورية للأقسام الفرعية والرئيسية
 */
export function subscribeBranchModulesRealtime(
  branchId: string,
  onRemoteUpdate: (bundle: BranchModulesBundle) => void
): () => void {
  const sb = getSupabaseClient();
  if (!sb) return () => {};

  const snapshotRowId = `mod__${branchId}__all_modules`;
  const existing = activeBroadcastChannels.get(branchId);
  if (existing) {
    try {
      void sb.removeChannel(existing);
    } catch {}
    activeBroadcastChannels.delete(branchId);
  }

  const shouldAcceptIncoming = (incoming: BranchModulesBundle | undefined): incoming is BranchModulesBundle => {
    if (!incoming?.ration || !incoming?.grainMaintenance || !incoming?.hr) return false;
    const local = readLocalBranchModulesBundle(branchId);
    if (local && parseBundleTimestampMs(local) > parseBundleTimestampMs(incoming)) {
      return false;
    }
    return true;
  };

  const channel = sb
    .channel(`tamween-modules-${branchId}`)
    .on(
      'broadcast',
      { event: 'module_bundle_sync' },
      (msg: any) => {
        const data = msg?.payload;
        if (!data || data.clientId === SESSION_CLIENT_ID || data.branchId !== branchId) return;
        const incoming = data.bundle as BranchModulesBundle;
        if (shouldAcceptIncoming(incoming)) {
          writeLocalBranchModulesBundle(branchId, incoming);
          onRemoteUpdate(incoming);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'backup_snapshots',
        filter: `id=eq.${snapshotRowId}`,
      },
      (payload: any) => {
        const lastSave = lastLocalSaveTimeByBranch.get(branchId) || 0;
        if (Date.now() - lastSave < 2500) {
          return;
        }
        const incoming = payload?.new?.payload as BranchModulesBundle | undefined;
        if (shouldAcceptIncoming(incoming)) {
          writeLocalBranchModulesBundle(branchId, incoming);
          onRemoteUpdate(incoming);
        }
      }
    )
    .subscribe();

  activeBroadcastChannels.set(branchId, channel);

  return () => {
    try {
      if (activeBroadcastChannels.get(branchId) === channel) {
        activeBroadcastChannels.delete(branchId);
      }
      void sb.removeChannel(channel);
    } catch {}
  };
}

/**
 * تصدير أي جدول لملف Excel CSV عربي سليم 100% (UTF-8 BOM)
 */
export function exportRowsToArabicCsv(
  filenamePrefix: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export const MINISTRY_LOGO_URL = '/assets/aistudio/images_a82c183a.jpeg';

export interface GroupedSubtotalSummary {
  localUnitColIdx: number;
  villageColIdx: number;
  localUnitTotals: Array<{
    localUnit: string;
    count: number;
    columnSums: (number | string | null)[];
  }>;
  villageTotals: Array<{
    village: string;
    localUnit: string;
    count: number;
    columnSums: (number | string | null)[];
  }>;
  grandTotalRow: (string | number)[];
}

/**
 * حساب صفوف الإجماليات المجمعة حسب الوحدة المحلية وحسب القرية تلقائياً لأي جدول تقارير
 */
export function computeReportSubtotalsByLocalUnitAndVillage(
  headers: string[],
  rows: (string | number)[][]
): GroupedSubtotalSummary {
  const localUnitColIdx = headers.findIndex((h) =>
    /الوحدة المحلية|وحدة محلية|القطاع|المنطقة/i.test(String(h))
  );
  const villageColIdx = headers.findIndex((h) =>
    /القرية|المدينة|العنوان|الموقع|الحي|المنطقة الفرعية/i.test(String(h))
  );

  const isCodeOrIdHeader = (h: string) =>
    /كود|رقم البطاقة|رقم قومي|هاتف|موبايل|تليفون|تاريخ|مسلسل|^م$|ترخيص|سجل تجاري|ضريبي/i.test(h);

  const parseNumericCell = (val: string | number | undefined, colIdx: number): number | null => {
    if (colIdx === 0 || colIdx === localUnitColIdx || colIdx === villageColIdx) return null;
    if (isCodeOrIdHeader(String(headers[colIdx] || ''))) return null;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
      if (!cleaned || cleaned.length > 11) return null;
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  };

  // Determine which columns have numeric values across rows
  const numericCols = headers.map((_, colIdx) => {
    if (colIdx === 0 || colIdx === localUnitColIdx || colIdx === villageColIdx) return false;
    if (isCodeOrIdHeader(String(headers[colIdx] || ''))) return false;
    let numericCount = 0;
    for (const r of rows) {
      if (parseNumericCell(r[colIdx], colIdx) !== null) numericCount++;
    }
    return numericCount > 0 && numericCount >= Math.ceil(rows.length * 0.3);
  });

  const isPopOrBeneficiariesHeader = (h: string) =>
    /population|سكان|مستفيد|beneficiar|أفراد|فراد/i.test(String(h || ''));

  const popOrBenCols = headers.map((h) => isPopOrBeneficiariesHeader(h));

  // Track raw row values per Local Unit so unified population/beneficiaries are NOT summed in Local Unit subtotal rows
  const localUnitMap = new Map<
    string,
    { count: number; sums: number[]; popColValues: number[][] }
  >();
  const villageMap = new Map<
    string,
    { localUnit: string; count: number; sums: number[]; unitKeysSeen: Map<string, number[][]> }
  >();

  for (const r of rows) {
    const lu =
      localUnitColIdx >= 0
        ? String(r[localUnitColIdx] ?? '').trim() || 'غير محدد'
        : 'إجمالي الإدارة';
    const vil =
      villageColIdx >= 0
        ? String(r[villageColIdx] ?? '').trim() || 'غير محدد'
        : lu;

    if (!localUnitMap.has(lu)) {
      localUnitMap.set(lu, {
        count: 0,
        sums: headers.map(() => 0),
        popColValues: headers.map(() => []),
      });
    }
    const luEntry = localUnitMap.get(lu)!;
    luEntry.count += 1;

    const vilKey = `${lu}__${vil}`;
    if (!villageMap.has(vilKey)) {
      villageMap.set(vilKey, {
        localUnit: lu,
        count: 0,
        sums: headers.map(() => 0),
        unitKeysSeen: new Map(),
      });
    }
    const vilEntry = villageMap.get(vilKey)!;
    vilEntry.count += 1;
    if (!vilEntry.unitKeysSeen.has(lu)) {
      vilEntry.unitKeysSeen.set(lu, headers.map(() => []));
    }
    const vilUnitVals = vilEntry.unitKeysSeen.get(lu)!;

    headers.forEach((_, colIdx) => {
      if (!numericCols[colIdx]) return;
      const n = parseNumericCell(r[colIdx], colIdx);
      if (n !== null) {
        if (popOrBenCols[colIdx]) {
          if (n > 0) {
            luEntry.popColValues[colIdx].push(n);
            vilUnitVals[colIdx].push(n);
          }
        } else {
          luEntry.sums[colIdx] += n;
          vilEntry.sums[colIdx] += n;
        }
      }
    });
  }

  const grandSums = headers.map(() => 0);

  const localUnitTotals = Array.from(localUnitMap.entries()).map(([localUnit, data]) => {
    const columnSums: (number | string | null)[] = headers.map((_, idx) => {
      if (!numericCols[idx]) return null;
      if (popOrBenCols[idx]) {
        const vals = data.popColValues[idx];
        const uniqueVals = Array.from(new Set(vals));
        const unitVal = uniqueVals.length === 0 ? 0 : Math.max(...uniqueVals);
        grandSums[idx] += unitVal;
        // لا يُجمع عدد السكان ولا عدد المستفيدين داخل نفس الوحدة المحلية أبداً
        return '—';
      }
      const rounded = Math.round(data.sums[idx] * 100) / 100;
      grandSums[idx] += rounded;
      return rounded;
    });

    return {
      localUnit,
      count: data.count,
      columnSums,
    };
  });

  const villageTotals = Array.from(villageMap.entries()).map(([key, data]) => {
    const columnSums: (number | string | null)[] = headers.map((_, idx) => {
      if (!numericCols[idx]) return null;
      if (popOrBenCols[idx]) {
        let villagePopTotal = 0;
        data.unitKeysSeen.forEach((colArrays) => {
          const vals = colArrays[idx];
          const uniqueVals = Array.from(new Set(vals));
          villagePopTotal += uniqueVals.length === 0 ? 0 : Math.max(...uniqueVals);
        });
        return Math.round(villagePopTotal * 100) / 100;
      }
      return Math.round(data.sums[idx] * 100) / 100;
    });

    return {
      village: key.split('__')[1] || 'غير محدد',
      localUnit: data.localUnit,
      count: data.count,
      columnSums,
    };
  });

  const grandTotalRow: (string | number)[] = headers.map((_, idx) => {
    if (idx === 0) return 'الإجمالي العام';
    if (idx === 1 && !numericCols[1]) return `${rows.length} سجل`;
    if (numericCols[idx]) return (Math.round(grandSums[idx] * 100) / 100).toLocaleString('ar-EG');
    return '—';
  });

  return {
    localUnitColIdx,
    villageColIdx,
    localUnitTotals,
    villageTotals,
    grandTotalRow,
  };
}

/**
 * طباعة رسمية A4 بهيدر وتذييل مديرية التموين والتجارة الداخلية بالغربية وشعار الوزارة المثبت وتجميع الإجماليات حسب الوحدة المحلية والقرية
 */
export function printModuleReportA4(options: {
  title: string;
  subtitle: string;
  branchName: string;
  directorateTitle?: string;
  governorateTitle?: string;
  headers: string[];
  rows: (string | number)[][];
  summaryItems?: { label: string; value: string }[];
  preparedBy?: string;
  totalsRow?: Array<string | number>;
}): void {
  const esc = (val: unknown): string =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  const grouped = computeReportSubtotalsByLocalUnitAndVillage(options.headers, options.rows);

  const summaryHtml = (options.summaryItems || [])
    .map(
      (s) =>
        `<div style="border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;background:#f8fafc;">
           <div style="font-size:10px;color:#475569;font-weight:700;">${esc(s.label)}</div>
           <div style="font-size:13px;color:#0f172a;font-weight:900;font-variant-numeric:tabular-nums;">${esc(s.value)}</div>
         </div>`
    )
    .join('');

  const rowsHtml = options.rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c) =>
              `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;text-align:center;font-variant-numeric:tabular-nums;">${esc(
                c ?? ''
              )}</td>`
          )
          .join('')}</tr>`
    )
    .join('');

  const localUnitSubtotalsHtml =
    grouped.localUnitColIdx >= 0 && grouped.localUnitTotals.length > 0
      ? grouped.localUnitTotals
          .map((lu) => {
            const cells = options.headers.map((_, idx) => {
              if (idx === 0) return `إجمالي الوحدة المحلية: ${lu.localUnit}`;
              if (idx === grouped.localUnitColIdx) return lu.localUnit;
              if (idx === 1 && lu.columnSums[1] === null) return `${lu.count} سجل`;
              const cellVal = lu.columnSums[idx];
              if (typeof cellVal === 'number') return cellVal.toLocaleString('ar-EG');
              if (typeof cellVal === 'string') return cellVal;
              return '—';
            });
            return `<tr style="background:#e0f2fe;color:#0c4a6e;font-weight:800;">${cells
              .map(
                (c) =>
                  `<td style="border:1px solid #7dd3fc;padding:6px 8px;font-size:11px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums;">${esc(
                    c
                  )}</td>`
              )
              .join('')}</tr>`;
          })
          .join('')
      : '';

  const villageSubtotalsHtml =
    grouped.villageColIdx >= 0 && grouped.villageTotals.length > 0
      ? grouped.villageTotals
          .map((v) => {
            const cells = options.headers.map((_, idx) => {
              if (idx === 0) return `إجمالي القرية: ${v.village}`;
              if (idx === grouped.localUnitColIdx) return v.localUnit;
              if (idx === grouped.villageColIdx) return v.village;
              if (idx === 1 && v.columnSums[1] === null) return `${v.count} سجل`;
              const cellVal = v.columnSums[idx];
              if (typeof cellVal === 'number') return cellVal.toLocaleString('ar-EG');
              if (typeof cellVal === 'string') return cellVal;
              return '—';
            });
            return `<tr style="background:#fef3c7;color:#78350f;font-weight:800;">${cells
              .map(
                (c) =>
                  `<td style="border:1px solid #fcd34d;padding:6px 8px;font-size:11px;text-align:center;font-weight:800;font-variant-numeric:tabular-nums;">${esc(
                    c
                  )}</td>`
              )
              .join('')}</tr>`;
          })
          .join('')
      : '';

  const finalTotalsRow =
    options.totalsRow && options.totalsRow.length > 0 ? options.totalsRow : grouped.grandTotalRow;

  const totalsHtml =
    finalTotalsRow && finalTotalsRow.length > 0
      ? `<tfoot>
          ${localUnitSubtotalsHtml}
          ${villageSubtotalsHtml}
          <tr style="background:#0f2342;color:#ffffff;font-weight:900;">${finalTotalsRow
            .map(
              (c) =>
                `<td style="border:1px solid #1e3a8a;padding:7px 8px;font-size:11px;text-align:center;font-weight:900;font-variant-numeric:tabular-nums;">${esc(
                  c ?? ''
                )}</td>`
            )
            .join('')}</tr>
        </tfoot>`
      : '';

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>${esc(options.title)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #0f2342; color: #ffffff; border: 1px solid #1e3a8a; padding: 7px 8px; font-size: 11px; }
        tbody tr:nth-child(even) td { background: #f8fafc; }
      </style>
    </head>
    <body>
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f2342;padding-bottom:10px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${MINISTRY_LOGO_URL}" alt="شعار وزارة التموين والتجارة الداخلية" style="width:62px;height:62px;object-fit:contain;border:1px solid #cbd5e1;border-radius:10px;padding:3px;background:#fff;" />
          <div>
            <div style="font-size:11px;font-weight:900;color:#475569;">جمهورية مصر العربية — وزارة التموين والتجارة الداخلية</div>
            <div style="font-size:12px;font-weight:900;">${esc(options.governorateTitle || 'محافظة الغربية')} — ${esc(options.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية')}</div>
            <div style="font-size:12px;font-weight:800;color:#0d9488;">${esc(options.branchName)}</div>
          </div>
        </div>
        <div style="text-align:center;">
          <h1 style="margin:0;font-size:16px;font-weight:900;color:#0f2342;">${esc(options.title)}</h1>
          <div style="font-size:11px;font-weight:700;color:#475569;">${esc(options.subtitle)}</div>
        </div>
        <div style="text-align:left;font-size:10px;font-weight:700;">
          <div>تاريخ الطباعة: ${esc(new Date().toLocaleDateString('ar-EG'))}</div>
          <div>أعده: ${esc(options.preparedBy || 'إدارة المنظومة')}</div>
        </div>
      </div>
      ${summaryHtml ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">${summaryHtml}</div>` : ''}
      <table>
        <thead>
          <tr>${options.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        ${totalsHtml}
      </table>
      <div style="margin-top:18px;display:flex;justify-content:space-between;font-size:11px;font-weight:800;border-top:1px dashed #94a3b8;padding-top:10px;">
        <span>توقيع المختص: ........................</span>
        <span>المراجعة المالية/الرقابية: ........................</span>
        <span>يعتمد / مدير الإدارة التموينية: ........................</span>
      </div>
    </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    }
  }, 250);
}
