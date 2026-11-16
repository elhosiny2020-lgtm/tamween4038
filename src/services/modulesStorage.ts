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
} from '../types/modules';
import type { VillageHierarchy } from '../types';
import { getSecurityShieldHeaders, getSupabaseClient, SESSION_CLIENT_ID } from '../lib/supabase';
import {
  computeAttendanceMetrics,
  computeEmployeePayrollLine,
  parseEgyptianNationalId,
} from '../utils/hrPayrollMath';
import {
  computeMaintenanceOrderCost,
  computeMoistureCorrectedWeight,
} from '../utils/grainMaintenanceMath';

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

  const merchants: RationMerchant[] = [
    {
      id: `${branchId}-m-1`,
      serialNo: 1,
      branchId,
      merchantName: 'تموين النصر الحديث',
      ownerName: 'أحمد محمود الشهاوي',
      activityCardNumber: 'ACT-4012',
      posMachineNumber: 'POS-90011',
      outletType: 'تاجر تمويني',
      governorate: 'الغربية',
      district: branchName,
      village: v1,
      localUnit: u1,
      detailedAddress: `شارع المحطة الرئيسي - ${v1}`,
      phone: '01012345678',
      nationalId: '28205121601112',
      commercialRegNumber: 'CR-77102',
      taxCardNumber: 'TX-412-901-111',
      licenseNumber: 'LIC-9011',
      licenseIssueDate: '2023-02-15',
      licenseExpiryDate: '2027-02-14',
      warehouseName: `مخزن جملة ${branchName} 1`,
      activityStartDate: '2018-04-01',
      cashInsuranceAmount: 50000,
      openingBalance: 12500,
      linkedCardsCount: 380,
      linkedBeneficiariesCount: 1420,
      activityStatus: 'نشط',
      wholesaleBranchName: `فرع جملة ${branchName}`,
      lastRequisitionDate: today,
    },
    {
      id: `${branchId}-m-2`,
      serialNo: 2,
      branchId,
      merchantName: 'منفذ جمعيتي الأمل',
      ownerName: 'سارة عبد الرحمن البنا',
      activityCardNumber: 'ACT-4088',
      posMachineNumber: 'POS-90045',
      outletType: 'منفذ جمعيتي',
      governorate: 'الغربية',
      district: branchName,
      village: v2,
      localUnit: u2,
      detailedAddress: `ميدان الوحدة المحلية - ${v2}`,
      phone: '01122334455',
      nationalId: '29108141602221',
      commercialRegNumber: 'CR-88210',
      taxCardNumber: 'TX-519-203-222',
      licenseNumber: 'LIC-9045',
      licenseIssueDate: '2024-01-10',
      licenseExpiryDate: '2026-12-30',
      warehouseName: `مخزن جملة ${branchName} 1`,
      activityStartDate: '2020-09-01',
      cashInsuranceAmount: 40000,
      openingBalance: 0,
      linkedCardsCount: 295,
      linkedBeneficiariesCount: 1090,
      activityStatus: 'نشط',
      wholesaleBranchName: `فرع جملة ${branchName}`,
      lastRequisitionDate: today,
    },
    {
      id: `${branchId}-m-3`,
      serialNo: 3,
      branchId,
      merchantName: 'المجمع الاستهلاكي المركزي',
      ownerName: 'شركة الدلتا للمجمعات الاستهلاكية',
      activityCardNumber: 'ACT-4190',
      posMachineNumber: 'POS-90098',
      outletType: 'مجمع استهلاكي',
      governorate: 'الغربية',
      district: branchName,
      village: v3,
      localUnit: u3,
      detailedAddress: `طريق المركز العمومي - ${v3}`,
      phone: '0402231100',
      nationalId: '27503031600553',
      commercialRegNumber: 'CR-12901',
      taxCardNumber: 'TX-100-991-300',
      licenseNumber: 'LIC-9098',
      licenseIssueDate: '2022-06-01',
      licenseExpiryDate: '2026-06-01',
      warehouseName: `مخزن جملة ${branchName} 2`,
      activityStartDate: '2012-01-01',
      cashInsuranceAmount: 120000,
      openingBalance: 18400,
      linkedCardsCount: 640,
      linkedBeneficiariesCount: 2380,
      activityStatus: 'نشط',
      wholesaleBranchName: `فرع جملة ${branchName}`,
      lastRequisitionDate: today,
    },
  ];

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
      unit: 'عبوة',
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
      unit: 'عبوة',
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
  branchName: string
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

  return {
    assets,
    orders,
    spareParts,
    technicians,
    grainMovements,
    settings: {
      defaultIndirectOverheadPct: 10,
      defaultTaxPct: 14,
      maxAcceptableGrainLossPct: 0.5,
      defaultReferenceMoisturePct: 12,
      decisionNote: 'لائحة تشغيل وصيانة الصوامع والشون القابلة للتعديل',
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
    grainMaintenance: createInitialGrainMaintenanceState(branchId, branchName),
    hr: createInitialHrState(branchId, branchName),
    updatedAt: new Date().toISOString(),
  };
}

export function readLocalBranchModulesBundle(branchId: string): BranchModulesBundle | null {
  try {
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
    localStorage.setItem(`${LOCAL_MODULES_STORAGE_PREFIX}${branchId}`, JSON.stringify(bundle));
  } catch {
    // ignore storage quota overflow
  }
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

  try {
    const resp = await fetch(`/api/modules/${encodeURIComponent(branchId)}`, {
      headers: {
        ...getSecurityShieldHeaders(),
      },
    });
    if (resp.ok) {
      const json = await resp.json();
      if (json?.exists && json?.payload?.ration && json?.payload?.grainMaintenance && json?.payload?.hr) {
        const bundle = json.payload as BranchModulesBundle;
        writeLocalBranchModulesBundle(branchId, bundle);
        return bundle;
      }
    }
  } catch {
    // fallback cleanly to Supabase or local seed
  }

  // Check Supabase directly if configured
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data } = await sb
        .from('backup_snapshots')
        .select('payload')
        .eq('id', `mod__${branchId}__all_modules`)
        .maybeSingle();
      if (data?.payload?.ration && data?.payload?.grainMaintenance && data?.payload?.hr) {
        const bundle = data.payload as BranchModulesBundle;
        writeLocalBranchModulesBundle(branchId, bundle);
        return bundle;
      }
    } catch {
      // ignore if backup_snapshots doesn't have it
    }
  }

  if (local) {
    // Ensure server & Supabase have the local state persisted
    void saveBranchModulesBundle(branchId, local, 'مزامنة تلقائية');
    return local;
  }

  const initial = createInitialBranchModulesBundle(branchId, branchName, villages);
  writeLocalBranchModulesBundle(branchId, initial);
  // Seed asynchronously to backend & Supabase so all devices see the same branch data
  void saveBranchModulesBundle(branchId, initial, 'النظام الرئيسي');
  return initial;
}

let inFlightSavePromise: Promise<ModuleSaveResult> | null = null;

export async function saveBranchModulesBundle(
  branchId: string,
  bundle: BranchModulesBundle,
  updatedBy = 'مستخدم المنظومة'
): Promise<ModuleSaveResult> {
  const nowIso = new Date().toISOString();
  const withTimestamp: BranchModulesBundle = {
    ...bundle,
    branchId,
    updatedAt: nowIso,
  };
  writeLocalBranchModulesBundle(branchId, withTimestamp);

  const runSave = async (): Promise<ModuleSaveResult> => {
    let serverOk = false;
    let supaOk = false;
    let version = 1;
    let lastErr = '';

    try {
      const resp = await fetch(`/api/modules/${encodeURIComponent(branchId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getSecurityShieldHeaders(),
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
        // Broadcast via Supabase Realtime channel for instant multi-device sync
        const ch = sb.channel(`tamween-modules-${branchId}`);
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

  if (inFlightSavePromise) {
    inFlightSavePromise = inFlightSavePromise.then(() => runSave(), () => runSave());
  } else {
    inFlightSavePromise = runSave();
  }
  return inFlightSavePromise;
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
  const channel = sb
    .channel(`tamween-modules-${branchId}`)
    .on(
      'broadcast',
      { event: 'module_bundle_sync' },
      (msg: any) => {
        const data = msg?.payload;
        if (!data || data.clientId === SESSION_CLIENT_ID || data.branchId !== branchId) return;
        const incoming = data.bundle as BranchModulesBundle;
        if (incoming?.ration && incoming?.grainMaintenance && incoming?.hr) {
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
        const incoming = payload?.new?.payload as BranchModulesBundle | undefined;
        if (incoming?.ration && incoming?.grainMaintenance && incoming?.hr) {
          writeLocalBranchModulesBundle(branchId, incoming);
          onRemoteUpdate(incoming);
        }
      }
    )
    .subscribe();

  return () => {
    try {
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

/**
 * طباعة رسمية A4 بهيدر وتذييل مديرية التموين والتجارة الداخلية بالغربية بدون window.open
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
}): void {
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

  const summaryHtml = (options.summaryItems || [])
    .map(
      (s) =>
        `<div style="border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;background:#f8fafc;">
           <div style="font-size:10px;color:#475569;font-weight:700;">${s.label}</div>
           <div style="font-size:13px;color:#0f172a;font-weight:900;">${s.value}</div>
         </div>`
    )
    .join('');

  const rowsHtml = options.rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c) =>
              `<td style="border:1px solid #cbd5e1;padding:6px 8px;font-size:11px;text-align:center;">${String(
                c ?? ''
              )}</td>`
          )
          .join('')}</tr>`
    )
    .join('');

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>${options.title}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #0f2342; color: #ffffff; border: 1px solid #1e3a8a; padding: 7px 8px; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
      </style>
    </head>
    <body>
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f2342;padding-bottom:10px;margin-bottom:10px;">
        <div>
          <div style="font-size:12px;font-weight:900;">${options.governorateTitle || 'محافظة الغربية'}</div>
          <div style="font-size:13px;font-weight:900;color:#0f2342;">${options.directorateTitle || 'مديرية التموين والتجارة الداخلية بالغربية'}</div>
          <div style="font-size:12px;font-weight:800;color:#0d9488;">${options.branchName}</div>
        </div>
        <div style="text-align:center;">
          <h1 style="margin:0;font-size:16px;font-weight:900;color:#0f2342;">${options.title}</h1>
          <div style="font-size:11px;font-weight:700;color:#475569;">${options.subtitle}</div>
        </div>
        <div style="text-align:left;font-size:10px;font-weight:700;">
          <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
          <div>أعده: ${options.preparedBy || 'إدارة المنظومة'}</div>
        </div>
      </div>
      ${summaryHtml ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">${summaryHtml}</div>` : ''}
      <table>
        <thead>
          <tr>${options.headers.map((h) => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
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
