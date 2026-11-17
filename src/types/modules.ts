export type SystemDepartmentKey =
  | 'bakeries'
  | 'debts'
  | 'commodities'
  | 'internal_trade'
  | 'grain_maintenance'
  | 'hr'
  | 'reports';

export type DepartmentScopeId = 'all' | SystemDepartmentKey;

export type PermissionAction = 'view' | 'insert' | 'update' | 'delete' | 'print' | 'export';

export interface DepartmentPermissionFlags {
  view: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  print: boolean;
  export: boolean;
}

export type DepartmentPermissionsMap = Partial<Record<SystemDepartmentKey, DepartmentPermissionFlags>>;

export interface DepartmentScopeMeta {
  id: DepartmentScopeId;
  label: string;
  description: string;
  isSystemDepartment?: boolean;
}

export const SYSTEM_DEPARTMENT_KEYS: SystemDepartmentKey[] = [
  'bakeries',
  'debts',
  'commodities',
  'internal_trade',
  'grain_maintenance',
  'hr',
  'reports',
];

export const DEPARTMENT_SCOPES: DepartmentScopeMeta[] = [
  {
    id: 'all',
    label: 'كافة الأقسام (مدير عام النظام)',
    description: 'وصول كامل لجميع أقسام المنظومة وإدارة المستخدمين وسجل المراقبة',
    isSystemDepartment: false,
  },
  {
    id: 'bakeries',
    label: 'قسم إدارة المخابز',
    description: 'قاعدة بيانات المخابز والحصص والمتوسطات والتراخيص فقط',
    isSystemDepartment: true,
  },
  {
    id: 'debts',
    label: 'قسم سجل المديونيات للمخابز',
    description: 'سجل المخالفات والمديونيات والتحصيل وغرامات نقص الوزن فقط',
    isSystemDepartment: true,
  },
  {
    id: 'commodities',
    label: 'قسم السلع التموينية',
    description: 'البطاقات والمستفيدون والمقررات التموينية والاستعاضات والرقابة',
    isSystemDepartment: true,
  },
  {
    id: 'internal_trade',
    label: 'قسم التجارة الداخلية والرقابة الموحدة',
    description: 'المنشآت والحملات والمحاضر والمضبوطات ومحطات الوقود والبوتاجاز ومتوسط نصيب الفرد',
    isSystemDepartment: true,
  },
  {
    id: 'grain_maintenance',
    label: 'قسم صيانة الحبوب والصوامع',
    description: 'الصوامع والمعدات وأوامر الصيانة وقطع الغيار والفاقد والرطوبة',
    isSystemDepartment: true,
  },
  {
    id: 'hr',
    label: 'قسم الموارد البشرية وشؤون العاملين',
    description: 'الموظفون والحضور والإجازات والمرتبات والتأمينات والضرائب والسلف',
    isSystemDepartment: true,
  },
  {
    id: 'reports',
    label: 'مركز التقارير والطباعة',
    description: 'شاشات التقارير الرسمية والطباعة والتصدير PDF/Excel',
    isSystemDepartment: true,
  },
];

// =========================================================================
// 1. نظام احتساب غرامات نقص وزن الرغيف (مرتبط بسجل المديونيات)
// =========================================================================
export interface LoafWeightSettings {
  defaultPrescribedWeightGrams: number; // قابل للتعديل حسب نوع الرغيف (مثلاً 90 جم)
  tier1MaxExclusive: number; // < 10 جم => معامل 1
  tier1Multiplier: number;
  tier2MaxExclusive: number; // 10 - <20 جم => معامل 2
  tier2Multiplier: number;
  tier3MaxExclusive: number; // 20 - <30 جم => معامل 3
  tier3Multiplier: number;
  tier4Multiplier: number; // >= 30 جم => معامل 4
  decisionReference: string;
}

export interface LoafWeightFineRecord {
  violationType: string; // 'نقص وزن الرغيف'
  reportNumber?: string;
  breadType?: string;
  prescribedWeightGrams: number; // الوزن المقرر للرغيف
  actualWeightGrams: number; // الوزن الفعلي
  shortageGrams: number; // مقدار النقص بالجرام
  tierLabel: string; // شريحة المخالفة
  tierMultiplier: number; // معامل الغرامة (1x..4x)
  repeatFactor?: number; // معامل تكرار اختياري معتمد
  bagPriceAtViolation: number; // سعر الشيكارة وقت المخالفة (محفوظ تاريخياً)
  insuranceQuotaAtViolation: number; // الحصة التأمينية وقت المخالفة
  baseFineAmount: number; // قيمة الغرامة الأساسية
  finalFineAmount: number; // قيمة الغرامة النهائية
  closureDays?: number; // مدد الغلق الإداري في حقل مستقل
  decisionReference?: string;
  calculatedAt: string;
  calculatedBy?: string;
}

// =========================================================================
// 2. قسم السلع التموينية والتجارة الداخلية
// =========================================================================
export type MerchantActivityStatus = 'نشط' | 'متوقف' | 'إجازة' | 'موقوف' | 'ملغي';
export type MerchantReviewStatus = 'تمت المراجعة' | 'تحتاج مراجعة' | 'بيانات غير مكتملة';
export type OutletType = 'تاجر تمويني' | 'منفذ جمعيتي' | 'مجمع استهلاكي';
export type CommodityUnit = 'كيلو' | 'جرام' | 'لتر' | 'عبوة' | 'زجاجة' | 'كيس' | 'قطعة';
export type CommodityAvailabilityStatus = 'متاح' | 'غير متاح' | 'موقوف';

export interface MerchantAuditEntry {
  id: string;
  timestamp: string;
  username: string;
  action: string;
  details: string;
}

export interface MerchantMonthlyArchiveRecord {
  id: string;
  monthLabel: string; // مثال: "مايو 2026"
  importedAt: string;
  importedBy: string;
  totalMerchants: number;
  activeCount: number;
  stoppedCount: number;
  onLeaveCount: number;
  totalInsuranceAmount: number;
  summaryNotes: string;
  merchantsSnapshot: RationMerchant[];
}

export interface RationMerchant {
  id: string;
  serialNo: number;
  internalCode?: string; // كود داخلي تلقائي للتاجر
  traderCode?: string; // كود التاجر بالملف الأصلي
  branchId: string;
  merchantName: string;
  ownerName: string;
  activityCardNumber?: string;
  posMachineNumber: string;
  outletType: OutletType;
  governorate: string;
  district: string;
  village: string;
  localUnit: string;
  detailedAddress: string;
  phone: string;
  nationalId: string;
  commercialRegNumber: string;
  taxCardNumber: string;
  licenseNumber: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  taxCardExpiryDate?: string;
  commercialRegExpiryDate?: string;
  warehouseName?: string;
  registrationDate?: string; // تاريخ تسجيل التاجر
  activityStartDate?: string;
  activityEndDate?: string;
  monthlyEntitlementQuota?: number; // الحصة الشهرية المستحقة
  cashInsuranceAmount: number; // مبلغ التأمين بالجنيه
  openingBalance: number;
  linkedCardsCount: number;
  linkedBeneficiariesCount: number;
  activityStatus: MerchantActivityStatus;
  reviewStatus?: MerchantReviewStatus; // حالة مراجعة البيانات
  wholesaleBranchName: string;
  lastRequisitionDate?: string;
  attachments?: string[]; // المستندات والمرفقات
  auditHistory?: MerchantAuditEntry[]; // سجل تاريخي للتعديلات
  notes?: string;
  updatedAt?: string;
}

export interface CommodityPriceHistoryEntry {
  id: string;
  commodityId: string;
  officialPrice: number;
  freeMarketRefPrice: number;
  supplyCostPrice: number;
  profitMargin: number;
  commissionType: 'per_unit' | 'percent';
  commissionValue: number;
  effectiveFrom: string;
  effectiveTo?: string;
  decisionNumber: string;
  updatedBy: string;
  updatedAt: string;
}

export interface RationCommodity {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: CommodityUnit;
  packWeightGramsOrMl: number;
  officialPrice: number;
  freeMarketRefPrice: number;
  supplyCostPrice: number;
  profitMargin: number;
  commissionType: 'per_unit' | 'percent';
  commissionValue: number;
  maxPerBeneficiary: number;
  maxPerCard: number;
  extraCapPerCard?: number;
  monthlyQuotaPerBeneficiary: number;
  quotaRuleType: 'sugar_rule' | 'oil_rule' | 'rice_pasta_rule' | 'custom_rule';
  priceStartDate: string;
  priceEndDate?: string;
  isActive: boolean;
  availabilityStatus?: CommodityAvailabilityStatus;
  openingBalance?: number;
  inboundQty?: number;
  outboundQty?: number;
  inboundReturns?: number;
  outboundReturns?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  batchNumber?: string;
  supplierCompany: string;
  reorderLevel: number;
  expiryDate?: string;
  decisionNumber: string;
  notes?: string;
  updatedAt?: string;
}

export interface RationBeneficiaryMember {
  id: string;
  fullName: string;
  nationalId: string;
  relation: string;
  status: 'مستحق' | 'موقوف' | 'غير مستحق';
  suspensionReason?: string;
}

export interface RationCardRecord {
  id: string;
  branchId: string;
  cardNumber: string;
  headOfFamilyName: string;
  headNationalId: string;
  merchantId: string;
  village: string;
  localUnit: string;
  status: 'سارية' | 'موقوفة' | 'تحت المراجعة';
  hasAdditionalGrant?: boolean; // مثل منحة 2026 الإضافية المنفصلة
  additionalGrantAmount?: number;
  members: RationBeneficiaryMember[];
  updatedAt?: string;
}

export interface RationDecisionSettings {
  activeMonth: string; // YYYY-MM
  supportPerBeneficiary: number; // قيمة الدعم للفرد القابلة للتعديل
  additionalGrantPerCard2026: number; // المنحة الإضافية منفصلة عن المقرر الأساسي
  additionalGrantEnabled: boolean;
  decisionNumber: string; // مثال: قرار رقم 152 لسنة 2025 / توجيهات 2026
  decisionIssueDate: string;
  decisionEffectiveDate: string;
  attachmentRef?: string;
  allowNegativeStockWithApproval: boolean;
  maxRequisitionInsuranceRatioNote?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface RationWarehouseBalance {
  id: string;
  branchId: string;
  merchantId: string; // أو 'MAIN_WHOLESALE' لفرع الجملة
  warehouseName: string;
  commodityId: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  inboundReturns: number;
  outboundReturns: number;
  approvedAdjustments: number;
  physicalCount?: number; // للجرد الفعلي
  reorderLevel: number;
  maxStockLevel?: number;
  lastMovementDate?: string;
  expiryDate?: string;
  stagnantDays?: number;
  updatedAt?: string;
}

export interface RationInventoryMovement {
  id: string;
  branchId: string;
  documentNumber: string;
  movementDate: string;
  movementType:
    | 'OPENING'
    | 'RECEIPT_IN'
    | 'DISBURSEMENT_OUT'
    | 'RETURN_IN'
    | 'RETURN_OUT'
    | 'TRANSFER_OUT'
    | 'TRANSFER_IN'
    | 'ADJUSTMENT_SURPLUS'
    | 'ADJUSTMENT_SHORTAGE'
    | 'REVERSAL';
  merchantId: string;
  warehouseName: string;
  targetWarehouseName?: string;
  supplierName?: string;
  invoiceNumber?: string;
  commodityId: string;
  requestedQty?: number;
  quantity: number;
  rejectedQty?: number;
  unitPrice: number;
  totalValue: number;
  balanceBefore: number;
  balanceAfter: number;
  approvedBy: string;
  isApproved?: boolean;
  isReversed?: boolean;
  reversedByDoc?: string;
  notes?: string;
  updatedAt?: string;
}

export interface RationRequisitionLine {
  commodityId: string;
  commodityName: string;
  requestedQty: number; // الكمية المقررة
  approvedQty: number; // الكمية المستلمة
  deliveredQty: number; // الكمية الموزعة
  supplyPrice: number;
}

export interface RationRequisition {
  id: string;
  branchId: string;
  requestNumber: string;
  invoiceNumber: string;
  monthKey: string;
  merchantId: string;
  traderCode?: string;
  posMachineNumber?: string;
  wholesaleBranch: string;
  linkedCardsCount: number;
  linkedBeneficiariesCount: number;
  insuranceAmount: number;
  committedInsuranceBefore: number;
  previousStockTotalQty: number;
  requestDate: string;
  deliveryDate?: string;
  status: 'جديد' | 'معتمد' | 'تسليم جزئي' | 'مكتمل' | 'مرفوض' | 'ملغي';
  lines: RationRequisitionLine[];
  totalValue: number;
  notes?: string;
  updatedAt?: string;
}

export interface RationDisbursementRecord {
  id: string;
  branchId: string;
  operationNumber: string; // فريد لمنع التكرار
  monthKey: string;
  date: string;
  cardId: string;
  merchantId: string;
  commodityId: string;
  quantity: number;
  officialUnitPriceAtSale: number; // محفوظ وقت الصرف ولا يتغير لاحقاً
  totalSaleValue: number;
  supportDeducted: number;
  citizenPaidAmount: number;
  commissionEarned: number;
  collectionMethod: 'بطاقة تموينية' | 'نقدي' | 'مختلط';
  employeeName: string;
  isReversed?: boolean;
  reversalRef?: string;
  updatedAt?: string;
}

export interface MerchantFinancialEntry {
  id: string;
  branchId: string;
  documentNumber: string; // فريد لمنع احتساب نفس الفاتورة مرتين
  date: string;
  merchantId: string;
  entryType:
    | 'OPENING'
    | 'REQUISITION_DEBIT'
    | 'SUPPLY_INVOICE'
    | 'RETURN_CREDIT'
    | 'PAYMENT_CREDIT'
    | 'COMMISSION_EARNED'
    | 'INCENTIVE_CREDIT'
    | 'DISCOUNT_PENALTY_DEBIT'
    | 'SETTLEMENT_CREDIT'
    | 'SETTLEMENT_DEBIT'
    | 'INSURANCE_DEPOSIT'
    | 'REVERSAL';
  debitAmount: number;
  creditAmount: number;
  description: string;
  isApproved: boolean;
  isReversed?: boolean;
  createdBy: string;
  updatedAt?: string;
}

export interface RationInspectionCampaign {
  id: string;
  branchId: string;
  inspectionDateTime: string;
  inspectorName: string;
  merchantId: string;
  village: string;
  outletType: OutletType;
  violationType: string;
  violationDescription: string;
  reportNumber: string;
  violationQuantity: number;
  financialValue: number;
  issuingEntity: string;
  dispositionStatus: 'قيد الفحص' | 'محال للنيابة' | 'تم التصرف' | 'حفظ إداري';
  inspectionResult: 'مطابق' | 'مخالف' | 'إنذار إداري';
  legalAction: string;
  attachmentName?: string;
  updatedAt?: string;
}

export interface RationComplaintRecord {
  id: string;
  branchId: string;
  ticketNumber: string;
  date: string;
  citizenName: string;
  phone: string;
  village: string;
  merchantId?: string;
  category: 'صرف مقررات' | 'نقص سلعة' | 'تسعير' | 'توقف بطاقة' | 'أخرى';
  details: string;
  status: 'جديدة' | 'قيد الفحص' | 'تم الحل' | 'مغلقة';
  resolution?: string;
  updatedAt?: string;
}

export interface ModuleAuditLog {
  id: string;
  branchId: string;
  module: 'commodities' | 'internal_trade' | 'grain_maintenance' | 'hr' | 'debts_fines';
  timestamp: string;
  username: string;
  userFullName: string;
  actionType: 'إضافة' | 'تعديل' | 'عكس قيد' | 'اعتماد' | 'تحديث إعدادات' | 'حذف';
  entityName: string;
  entityId: string;
  beforeSummary?: string;
  afterSummary?: string;
}

export interface GasCylinderRecord {
  id: string;
  branchId: string;
  warehouseName: string;
  licenseNumber: string;
  ownerName: string;
  governorate: string;
  administration: string;
  center: string;
  localUnit: string;
  village: string;
  companyName: string; // 'دي بي جاز (DB Gas)' | 'مصر للبترول' | 'بتروتريد' | etc.
  cylinderType: 'منزلي' | 'تجاري';
  capacity: '12.5 كجم' | '25 كجم' | 'أخرى';
  openingBalance: number;
  receipts: number;
  disbursements: number;
  sales: number;
  transferred: number;
  returns: number;
  damaged: number;
  remainingBalance: number;
  officialPrice: number;
  salesValue: number;
  assignedQuota: number;
  actualStock: number;
  inventoryDifference: number; // book - actual (0 = ok, + = deficit, - = surplus)
  date: string;
  receiptNoteNo: string;
  notes: string;
  updatedAt?: string;
}

export interface PetroleumProductRecord {
  id: string;
  branchId: string;
  stationName: string;
  licenseNumber: string;
  ownerName: string;
  productName: 'السولار' | 'بنزين 80' | 'بنزين 92' | 'بنزين 95' | 'مازوت' | string;
  openingStock: number; // liters
  receipts: number;
  sales: number;
  transferred: number;
  returns: number;
  authorizedLoss: number; // الفاقد المعتمد
  bookStock: number;
  actualStock: number;
  inventoryDifference: number; // book - actual
  officialPricePerLiter: number;
  totalSalesValue: number;
  assignedQuota: number;
  date: string;
  invoiceNumber: string;
  notes: string;
  updatedAt?: string;
}

export interface RationOfficeAccountingRecord {
  id: string;
  branchId: string;
  officeName: string; // مكتب التموين
  month: string; // '01' - '12'
  year: string; // '2025'
  commodityName: string; // 'سكر' | 'أرز' | 'زيت' | 'مكرونة' | etc.
  openingBalance: number;
  wholesaleReceipts: number; // الوارد من شركة الجملة
  totalAvailable: number; // opening + receipts
  smartCardDisbursements: number; // المنصرف من البطاقات الذكية
  unitPrice: number;
  financialValue: number; // disbursements * unitPrice
  endingBalance: number; // totalAvailable - smartCardDisbursements
  cardsCount: number;
  beneficiariesCount: number;
  notes: string;
  isApproved: boolean;
  updatedAt?: string;
}

export interface RationModuleState {
  merchants: RationMerchant[];
  commodities: RationCommodity[];
  priceHistory: CommodityPriceHistoryEntry[];
  cards: RationCardRecord[];
  warehouses: RationWarehouseBalance[];
  movements: RationInventoryMovement[];
  requisitions: RationRequisition[];
  disbursements: RationDisbursementRecord[];
  financialEntries: MerchantFinancialEntry[];
  inspections: RationInspectionCampaign[];
  complaints: RationComplaintRecord[];
  gasCylinders: GasCylinderRecord[];
  petroleumProducts: PetroleumProductRecord[];
  rationOfficeAccounts: RationOfficeAccountingRecord[];
  merchantMonthlyArchives?: MerchantMonthlyArchiveRecord[];
  settings: RationDecisionSettings;
  settingsHistory: RationDecisionSettings[];
  auditLogs: ModuleAuditLog[];
}

// =========================================================================
// 3. قسم صيانة الحبوب والصوامع والشون
// =========================================================================
export type MaintenanceOrderStatus =
  | 'جديد'
  | 'قيد الفحص'
  | 'معتمد'
  | 'قيد التنفيذ'
  | 'متوقف لعدم توافر قطع الغيار'
  | 'مكتمل'
  | 'مغلق';

export interface GrainAsset {
  id: string;
  branchId: string;
  assetCode: string;
  name: string;
  assetType: 'صومعة' | 'شونة' | 'مصعد' | 'سير ناقل' | 'غربال ومنقي' | 'مجفف' | 'ميزان' | 'معدة تداول';
  locationSite: string;
  siloOrWarehouseName: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  supplyDate: string;
  installDate: string;
  purchaseValue: number;
  ratedCapacityTonPerHour: number;
  operationalStatus: 'عاملة' | 'متوقفة' | 'تحت الصيانة';
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  operatingLifeYears: number;
  warrantyEndDate: string;
  plannedHoursPerPeriod: number;
  downtimeHours: number;
  actualProductionTons: number;
  designProductionTons: number;
  conformingTons: number;
  energyConsumptionKwh: number;
  fuelConsumptionLiters: number;
  technicalNotes?: string;
  updatedAt?: string;
}

export interface SparePartItem {
  id: string;
  branchId: string;
  partCode: string;
  partName: string;
  unit: string;
  unitCost: number;
  openingStock: number;
  inboundQty: number;
  outboundQty: number;
  damagedQty: number;
  avgDailyConsumption: number;
  supplyLeadDays: number;
  safetyStock: number;
  targetStockLevel: number;
  updatedAt?: string;
}

export interface MaintenanceTechnician {
  id: string;
  branchId: string;
  name: string;
  specialty: string;
  hourlyWage: number;
  phone: string;
  isActive: boolean;
  updatedAt?: string;
}

export interface MaintenanceOrderPartUsage {
  partId: string;
  partName: string;
  quantity: number;
  unitCost: number;
}

export interface MaintenanceOrder {
  id: string;
  branchId: string;
  orderNumber: string;
  requestDate: string;
  siteName: string;
  assetId: string;
  maintenanceType: 'وقائية' | 'علاجية طارئة' | 'معايرة موازين';
  faultDescription: string;
  severity: 'منخفضة' | 'متوسطة' | 'عالية' | 'حرجة';
  stopStartDate: string;
  repairStartDate?: string;
  repairEndDate?: string;
  technicianCount: number;
  technicianNames: string;
  laborHours: number;
  hourlyRate: number;
  consumablesCost: number;
  transportAndOpCost: number;
  indirectOverheadPercent: number;
  taxPercent: number;
  partsUsed: MaintenanceOrderPartUsage[];
  laborCost: number;
  partsCost: number;
  directCost: number;
  indirectCost: number;
  totalRepairCost: number;
  status: MaintenanceOrderStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface GrainMovementRecord {
  id: string;
  branchId: string;
  documentNumber: string;
  date: string;
  siloName: string;
  grainType: string;
  movementType: 'رصيد أول المدة' | 'وارد' | 'منصرف' | 'جرد فعلي' | 'تسوية';
  originalWeightTons: number;
  actualMoisturePct: number;
  referenceMoisturePct: number;
  correctedWeightTons: number;
  actualPhysicalCountTons?: number;
  recordedLossTons?: number;
  notes?: string;
  updatedAt?: string;
}

export interface GrainMaintenanceSettings {
  defaultIndirectOverheadPct: number;
  defaultTaxPct: number;
  maxAcceptableGrainLossPct: number;
  defaultReferenceMoisturePct: number;
  defaultWheatTonPrice: number;
  defaultFlourTonPrice: number;
  defaultStandardExtractionPct: number;
  maxAllowedExtractionVariancePct: number;
  licenseExpiryWarningDays: number;
  requireMakerCheckerApproval: boolean;
  allowQuotaOverIssueWithAdminReason: boolean;
  decisionNote: string;
}

// -------------------------------------------------------------------------
// 3.A قاعدة بيانات الشون وتقييم الأصول ودفتر استلام القمح اليومي
// -------------------------------------------------------------------------
export type ReceiptApprovalStatus =
  | 'مسودة'
  | 'في انتظار المراجعة'
  | 'معتمد'
  | 'مرفوض'
  | 'ملغي';

export interface ShunaRecord {
  id: string;
  serialNo: number;
  shunaCode: string;
  shunaName: string;
  village: string;
  localUnit: string;
  affiliatedEntity: string;
  managerName: string;
  phone: string;
  totalAreaSqm: number;
  usedAreaSqm: number;
  storageCapacityTons: number;
  openingBalanceTons: number;
  netTransfersInTons: number;
  netTransfersOutTons: number;
  approvedAdjustmentTons: number;
  tonPrice: number;
  assetsAndFixturesValue: number;
  internalEquipmentValue: number;
  scaleValue: number;
  handlingEquipmentValue: number;
  scaleStatus: 'يعمل ومعاير' | 'يحتاج معايرة' | 'تحت الصيانة' | 'متوقف';
  storageEquipmentStatus: 'ممتازة' | 'جيدة' | 'تحت الصيانة' | 'تحتاج إحلال';
  operationalStatus: 'تعمل' | 'متوقفة' | 'تحت الصيانة';
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  valuationDate: string;
  evaluatorName: string;
  notes: string;
  updatedAt?: string;
}

export interface WheatDeductionItem {
  id: string;
  reasonType: 'رطوبة زائدة' | 'شوائب وغربلة' | 'فرز غير مطابق' | 'أخرى';
  excludedWeightTons: number;
  decisionOrReportRef: string;
  approvedBy: string;
  notes: string;
}

export interface DailyWheatReceiptRecord {
  id: string;
  serialNo: number;
  receiptOrderNumber: string; // رقم إذن الاستلام الفريد
  receiptDate: string;
  receiptTime: string;
  shunaCode: string;
  shunaName: string;
  supplierName: string;
  supplierNationalIdOrCode: string;
  wheatType: 'محلي' | 'مستورد';
  agriculturalSeason: string;
  vehicleNumber: string;
  driverName: string;
  scaleNumber: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number; // تلقائي = الوزن القائم - الوزن الفارغ
  netWeightTons: number; // تلقائي = صافي الوزن بالكيلوجرام ÷ 1000
  moisturePct: number;
  impuritiesPct: number;
  cleanlinessGrade: string; // مثال: 23.5 قيراط / 23 قيراط / 22.5 قيراط
  qualityGrade: string; // درجة أولى / ثانية / ثالثة
  excludedWeightTons: number; // مجموع الخصومات المعتمدة فقط
  deductionsLog: WheatDeductionItem[];
  acceptedNetWeightTons: number; // تلقائي = صافي الوزن بالطن - الوزن المستبعد المعتمد
  tonPrice: number;
  totalSupplyValue: number; // تلقائي = الوزن المقبول بالطن × سعر الطن
  inspectionReportNumber: string;
  shunaKeeperName: string;
  committeeMemberName: string;
  approvalStatus: ReceiptApprovalStatus;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionOrCancellationReason?: string;
  notes: string;
  updatedAt?: string;
}

export interface ShunaWheatIssueRecord {
  id: string;
  serialNo: number;
  issueOrderNumber: string;
  issueDate: string;
  issueTime: string;
  shunaCode: string;
  shunaName: string;
  beneficiaryMillCode: string;
  beneficiaryMillName: string;
  wheatType: 'محلي' | 'مستورد';
  balanceBeforeIssueTons: number;
  issuedWeightTons: number;
  balanceAfterIssueTons: number;
  tonPrice: number;
  totalIssuedValue: number;
  vehicleNumber: string;
  driverName: string;
  receiverName: string;
  approvalStatus: ReceiptApprovalStatus;
  adminOverrideReason?: string;
  createdBy: string;
  approvedBy?: string;
  notes: string;
}

export interface WheatLedgerMovementRecord {
  id: string;
  movementCode: string;
  movementDate: string;
  movementTime: string;
  shunaCode: string;
  shunaName: string;
  movementType:
    | 'رصيد افتتاحي'
    | 'وارد قمح معتمد'
    | 'صرف قمح لمطحن'
    | 'تحويل وارد'
    | 'تحويل صادر'
    | 'تسوية جرد معتمدة'
    | 'عكس قيد';
  referenceDocNumber: string;
  balanceBeforeTons: number;
  quantityTons: number; // موجب للإضافة، سالب للخصم
  balanceAfterTons: number;
  tonPrice: number;
  totalValue: number;
  approvalStatus: ReceiptApprovalStatus;
  performedBy: string;
  notes: string;
}

export interface ShunaReconciliationRecord {
  id: string;
  reconciliationNumber: string;
  reconciliationDate: string;
  shunaCode: string;
  shunaName: string;
  bookBalanceTons: number;
  physicalCountTons: number;
  varianceTons: number; // الرصيد الفعلي - الرصيد الدفتري
  reconciliationStatus: 'مطابق' | 'عجز' | 'زيادة';
  committeeHead: string;
  committeeMembers: string;
  reasonOrExplanation: string;
  actionTaken: string;
  appliedAsApprovedAdjustment: boolean;
  notes: string;
}

// -------------------------------------------------------------------------
// 3.B قاعدة بيانات الثلاجات ومخازن التبريد (8 جداول فرعية مترابطة)
// -------------------------------------------------------------------------
export interface RefrigeratorRecord {
  id: string;
  serialNo: number;
  refrigeratorCode: string;
  refrigeratorName: string;
  ownerName: string;
  operatingCompany: string;
  ownershipType: 'حكومي' | 'خاص' | 'مؤجر';
  governorate: string;
  center: string;
  village: string;
  detailedAddress: string;
  phone: string;
  managerName: string;
  operationsOfficer: string;
  coolingRoomsCount: number;
  freezingRoomsCount: number;
  totalAreaSqm: number;
  designCapacityTons: number;
  operationalCapacityTons: number;
  coolingSystemType: string;
  operationalStatus: 'تعمل' | 'متوقفة' | 'تحت الصيانة';
  startDate: string;
  lastInspectionDate: string;
  nextMaintenanceDate: string;
  notes: string;
}

export interface RefrigeratorRoomBalance {
  id: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  roomNumber: string;
  roomType: 'غرفة تبريد' | 'غرفة تجميد';
  storedCommodityType: string;
  roomCapacityTons: number;
  openingBalanceTons: number;
  approvedInboundTons: number;
  approvedOutboundTons: number;
  requiredTempCelsius: number;
  roomStatus: 'تعمل' | 'متوقفة' | 'تحت الصيانة';
  notes: string;
}

export interface RefrigeratorReceiptRecord {
  id: string;
  serialNo: number;
  receiptOrderNumber: string;
  receiptDate: string;
  receiptTime: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  roomNumber: string;
  depositorOrSupplierName: string;
  commodityType: string;
  subCategory: string;
  packagesCount: number;
  grossWeightTons: number;
  tareWeightTons: number;
  netWeightTons: number;
  unitOrTonPrice: number;
  totalValue: number;
  receivingTempCelsius: number;
  commodityCondition: 'ممتازة ومطابقة' | 'جيدة' | 'تحتاج فحص' | 'مرفوضة';
  productionDate: string;
  expiryDate: string;
  receiverName: string;
  approvalStatus: ReceiptApprovalStatus;
  adminCapacityOverrideReason?: string;
  notes: string;
}

export interface RefrigeratorIssueRecord {
  id: string;
  serialNo: number;
  issueOrderNumber: string;
  issueDate: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  roomNumber: string;
  beneficiaryEntityName: string;
  commodityType: string;
  packagesCount: number;
  netIssuedWeightTons: number;
  balanceBeforeIssueTons: number;
  balanceAfterIssueTons: number;
  unitOrTonPrice: number;
  totalIssuedValue: number;
  issuerName: string;
  approvalStatus: ReceiptApprovalStatus;
  notes: string;
}

export interface RefrigeratorAssetValuation {
  id: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  landValue: number;
  buildingsValue: number;
  coolingRoomsValue: number;
  coolingUnitsCompressorsValue: number;
  generatorsValue: number;
  equipmentAndForkliftsValue: number;
  scaleValue: number;
  furnitureAndFixturesValue: number;
  currentStoredInventoryValue: number;
  valuationDate: string;
  evaluatorCommittee: string;
  notes: string;
}

export interface RefrigeratorTempLogRecord {
  id: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  roomNumber: string;
  commodityType: string;
  requiredTempCelsius: number;
  actualTempCelsius: number;
  measurementDateTime: string;
  coolingUnitsStatus: 'تعمل بكفاءة' | 'تذبذب تبريد' | 'متوقفة';
  powerStatus: 'تيار رئيسي منتظم' | 'انقطاع تيار رئيسي' | 'تذبذب جهد';
  backupGeneratorStatus: 'جاهز احتياطي' | 'يعمل حالياً' | 'عطل بالمولد';
  alarmStatus: 'طبيعي' | 'إنذار ارتفاع حرارة' | 'إنذار انقطاع كهرباء' | 'إنذار حرج';
  technicianName: string;
  notes: string;
}

export interface RefrigeratorMaintenanceOrder {
  id: string;
  orderNumber: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  roomOrEquipmentNumber: string;
  maintenanceType: 'وقائية' | 'طارئة' | 'دورية';
  faultDescription: string;
  reportDate: string;
  repairStartDate: string;
  repairEndDate: string;
  downtimeHours: number;
  sparePartsUsed: string;
  partsCost: number;
  laborCost: number;
  extraExpenses: number;
  totalMaintenanceCost: number;
  technicianOrCompany: string;
  status: 'جديد' | 'قيد الإصلاح' | 'مكتمل';
  notes: string;
}

export interface RefrigeratorFinancialEntry {
  id: string;
  documentNumber: string;
  date: string;
  refrigeratorCode: string;
  refrigeratorName: string;
  pricingMode: 'يومي' | 'شهري' | 'تعاقدي';
  ratePerTon: number;
  storedTonsBilled: number;
  durationUnits: number;
  electricityExpense: number;
  maintenanceExpense: number;
  laborExpense: number;
  operatingExpense: number;
  rentOrFeesExpense: number;
  storageOrOperatingRevenue: number;
  totalReceivables: number;
  paidAmount: number;
  notes: string;
}

// -------------------------------------------------------------------------
// 3.C قاعدة بيانات المطاحن ومتابعة التشغيل والإنتاج والاستخراج (9 جداول)
// -------------------------------------------------------------------------
export interface MillRecord {
  id: string;
  serialNo: number;
  millCode: string;
  millName: string;
  ownerCompany: string;
  operatingEntity: string;
  millSectorType: 'قطاع عام' | 'قطاع خاص';
  governorate: string;
  center: string;
  villageOrArea: string;
  detailedAddress: string;
  phone: string;
  managerName: string;
  technicalOfficer: string;
  adminOfficer: string;
  dailyMillingCapacityTons: number;
  monthlyMillingCapacityTons: number;
  millingLinesCount: number;
  shiftsCount: number;
  dailyOperatingHours: number;
  wheatTypeUsed: string;
  producedFlourType: string;
  operationalStatus: 'يعمل' | 'متوقف' | 'تحت الصيانة';
  startDate: string;
  lastInspectionDate: string;
  notes: string;
}

export interface MillLicenseDocument {
  id: string;
  millCode: string;
  millName: string;
  licenseNumber: string;
  issueDate: string;
  expiryDate: string;
  commercialRegNumber: string;
  taxCardNumber: string;
  operatingContractNumber: string;
  ownershipOrLeaseDoc: string;
  safetyCertificatesStatus: string;
  lastRenewalDate: string;
  documentStatus: 'سارية' | 'قاربت على الانتهاء' | 'منتهية' | 'موقوفة';
  notes: string;
}

export interface MillWheatReceiptRecord {
  id: string;
  serialNo: number;
  receiptOrderNumber: string;
  receiptDate: string;
  millCode: string;
  millName: string;
  sourceShunaOrSiloName: string;
  linkedShunaIssueOrderNumber: string; // مربوط مباشرة بإذن صرف الشونة لمنع الازدواجية
  wheatType: 'محلي' | 'مستورد' | 'خلط';
  grossWeightTons: number;
  tareWeightTons: number;
  netReceivedWeightTons: number;
  moisturePct: number;
  impuritiesPct: number;
  cleanlinessGrade: string;
  acceptedMillingWeightTons: number;
  tonPrice: number;
  totalValue: number;
  receiverName: string;
  approvalStatus: ReceiptApprovalStatus;
  notes: string;
}

export interface MillDailyOperationRecord {
  id: string;
  serialNo: number;
  operationDate: string;
  millCode: string;
  millName: string;
  openingWheatBalanceTons: number;
  inboundWheatTodayTons: number;
  totalAvailableWheatTons: number;
  actualMilledWheatTons: number;
  closingWheatBalanceTons: number;
  producedFlourTons: number;
  actualExtractionPct: number;
  standardExtractionPct: number;
  producedBranTons: number;
  branPct: number;
  secondaryOutputsTons: number;
  lossOrWasteTons: number;
  lossPct: number;
  operatingHours: number;
  downtimeHours: number;
  downtimeReason: string;
  notes: string;
}

export interface MillProductionRecord {
  id: string;
  serialNo: number;
  batchNumber: string;
  productionDate: string;
  millCode: string;
  millName: string;
  producedFlourType: string;
  inputWheatTons: number;
  outputFlourTons: number;
  producedSacksCount: number;
  sackWeightKg: number;
  targetProductionTons: number;
  targetAchievementPct: number;
  tonPrice: number;
  totalProducedFlourValue: number;
  flourStockBeforeTons: number;
  flourStockAfterTons: number;
  approvalStatus: ReceiptApprovalStatus;
  notes: string;
}

export interface MillMachineRecord {
  id: string;
  machineCode: string;
  machineName: string;
  millCode: string;
  millName: string;
  productionLineOrDept: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  ratedCapacity: string;
  installDate: string;
  estimatedValue: number;
  status: 'تعمل' | 'متوقفة' | 'تحت الصيانة';
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  notes: string;
}

export interface MillMaintenanceOrder {
  id: string;
  orderNumber: string;
  millCode: string;
  millName: string;
  machineName: string;
  faultType: string;
  faultDate: string;
  stopTime: string;
  repairTime: string;
  downtimeHours: number;
  sparePartsUsed: string;
  partsCost: number;
  laborCost: number;
  otherExpenses: number;
  totalMaintenanceCost: number;
  engineerOrTechnician: string;
  status: 'جديد' | 'قيد الإصلاح' | 'مكتمل';
  notes: string;
}

export interface MillInspectionVisitRecord {
  id: string;
  reportNumber: string;
  visitDate: string;
  millCode: string;
  millName: string;
  inspectorsCommittee: string;
  generalCleanlinessStatus: 'مطابق' | 'ملاحظات جزئية' | 'غير مطابق';
  machineryConditionStatus: 'جيدة' | 'تحتاج صيانة' | 'عطل مؤثر';
  balancesMatchStatus: 'مطابق' | 'عجز' | 'زيادة';
  extractionMatchStatus: 'مطابق للمعدل (82%)' | 'انحراف طفيف' | 'مخالف للمواصفات';
  observedViolations: string;
  legalOrAdminActions: string;
  recommendations: string;
  followUpStatus: 'تم التلافي' | 'قيد المتابعة' | 'أحيل للشئون القانونية';
}

export interface MillAssetValuation {
  id: string;
  millCode: string;
  millName: string;
  landValue: number;
  buildingsValue: number;
  millingLinesValue: number;
  internalSilosValue: number;
  scalesValue: number;
  auxiliaryEquipmentValue: number;
  vehiclesValue: number;
  sparePartsInventoryValue: number;
  storedWheatValue: number;
  storedFlourValue: number;
  valuationDate: string;
  evaluatorName: string;
  notes: string;
}

// -------------------------------------------------------------------------
// 3.D قاعدة بيانات حصص الدقيق المركزية (7 جداول مترابطة بالمطاحن والمخابز)
// -------------------------------------------------------------------------
export interface FlourQuotaMasterRecord {
  id: string;
  serialNo: number;
  quotaCode: string;
  allocationDecisionNumber: string;
  decisionDate: string;
  millCode: string;
  millName: string;
  linkedBakeryId?: string; // ربط مباشر ببيانات المخابز في النظام الرئيسي دون تكرار
  bakeryCode: string;
  bakeryName: string;
  ownerName: string;
  governorate: string;
  center: string;
  village: string;
  localUnit: string;
  flourType: string;
  extractionGrade: '82%' | '72%';
  activityType: 'مخبز بلدي' | 'مخبز طباقي' | 'مستودع دقيق' | 'منفذ';
  dailyQuotaTons: number;
  dailyQuotaSacks: number;
  weeklyQuotaTons: number;
  monthlyQuotaTons: number;
  annualQuotaTons: number;
  effectiveStartDate: string;
  effectiveEndDate: string;
  quotaStatus: 'سارية' | 'موقوفة' | 'معدلة' | 'ملغاة';
  allocationOrAmendmentReason: string;
  notes: string;
}

export interface FlourDailyDistributionRecord {
  id: string;
  date: string;
  quotaCode: string;
  millCode: string;
  millName: string;
  bakeryCode: string;
  bakeryName: string;
  village: string;
  localUnit: string;
  prescribedDailyQuotaTons: number;
  actualApprovedDisbursedTons: number;
  remainingDailyTons: number;
  executionPct: number;
  issueOrderNumber: string;
  disbursementStatus: 'تم الصرف بالكامل' | 'صرف جزئي' | 'لم يتم الصرف' | 'موقوف';
  nonDisbursementOrShortageReason: string;
  notes: string;
}

export interface FlourMonthlyAnnualQuotaRecord {
  id: string;
  month: string;
  year: string;
  quotaCode: string;
  millCode: string;
  millName: string;
  bakeryCode: string;
  bakeryName: string;
  village: string;
  dailyQuotaTons: number;
  eligibleWorkingDays: number;
  stopDays: number;
  nonDisbursementDays: number;
  prescribedMonthlyQuotaTons: number;
  actualMonthlyDisbursedTons: number;
  remainingMonthlyTons: number;
  monthlyExecutionPct: number;
  prescribedAnnualQuotaTons: number;
  actualAnnualDisbursedTons: number;
  remainingAnnualTons: number;
  notes: string;
}

export interface FlourIssueOrderRecord {
  id: string;
  serialNo: number;
  issueOrderNumber: string;
  issueDate: string;
  issueTime: string;
  quotaCode: string;
  millCode: string;
  millName: string;
  bakeryCode: string;
  bakeryName: string;
  bakeryOwnerName: string;
  village: string;
  localUnit: string;
  prescribedQuotaTons: number;
  issuedQuantityTons: number;
  sacksCount: number;
  sackWeightKg: number;
  balanceBeforeIssueTons: number;
  balanceAfterIssueTons: number;
  tonPrice: number;
  totalValue: number;
  vehicleNumber: string;
  driverName: string;
  receiverName: string;
  approvalStatus: ReceiptApprovalStatus;
  adminOverrideReason?: string;
  approvedBy?: string;
  notes: string;
}

export interface FlourQuotaAmendmentRecord {
  id: string;
  decisionNumber: string;
  decisionDate: string;
  quotaCode: string;
  bakeryCode: string;
  bakeryName: string;
  millCode: string;
  millName: string;
  previousDailyQuotaTons: number;
  newDailyQuotaTons: number;
  changeDeltaTons: number; // الحصة الجديدة - الحصة السابقة
  amendmentType: 'زيادة' | 'خفض' | 'إيقاف مؤقت' | 'نقل مطحن' | 'إلغاء';
  reason: string;
  issuingAuthority: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  status: 'ساري' | 'منفذ' | 'منتهي';
  notes: string;
}

export interface MillBakeryMappingRecord {
  id: string;
  mappingCode: string;
  millCode: string;
  millName: string;
  linkedBakeryId?: string;
  bakeryCode: string;
  bakeryName: string;
  ownerName: string;
  village: string;
  localUnit: string;
  dailyQuotaTons: number;
  monthlyQuotaTons: number;
  linkStartDate: string;
  linkEndDate: string;
  linkStatus: 'نشط' | 'منقول' | 'موقوف';
  previousMillName?: string;
  notes: string;
}

export interface MillFlourStockBalance {
  id: string;
  date: string;
  millCode: string;
  millName: string;
  flourType: string;
  openingBalanceTons: number;
  approvedProducedTons: number;
  inboundTons: number;
  transfersInTons: number;
  allocatedQuotaTotalTons: number;
  actualDisbursedToBakeriesTons: number;
  transfersOutTons: number;
  approvedAdjustmentsTons: number;
  notes: string;
}

export interface GrainDepartmentFinancialEntry {
  id: string;
  documentNumber: string;
  date: string;
  facilityCategory: 'شونة' | 'ثلاجة' | 'مطحن' | 'حصص دقيق' | 'صيانة مركزية';
  facilityCode: string;
  facilityName: string;
  transactionType:
    | 'تقييم أصول ثابتة'
    | 'تقييم مخزون سلعي'
    | 'قيمة توريد قمح معتمد'
    | 'قيمة صرف قمح لمطحن'
    | 'إيراد تخزين وتشغيل'
    | 'مصروفات تشغيل وكهرباء'
    | 'تكلفة صيانة وقطع غيار'
    | 'تحصيل مستحقات'
    | 'مديونية متبقية';
  fixedAssetsValuationAmount: number;
  inventoryValuationAmount: number;
  revenuesAmount: number;
  expensesAmount: number;
  receivablesAmount: number;
  collectedAmount: number;
  approvalStatus: ReceiptApprovalStatus;
  description: string;
}

export interface GrainMaintenanceState {
  assets: GrainAsset[];
  orders: MaintenanceOrder[];
  spareParts: SparePartItem[];
  technicians: MaintenanceTechnician[];
  grainMovements: GrainMovementRecord[];
  // الجداول المتكاملة لقسم صيانة الحبوب (الشون، الثلاجات، المطاحن، حصص الدقيق، الحسابات)
  shunas?: ShunaRecord[];
  wheatReceipts?: DailyWheatReceiptRecord[];
  wheatIssues?: ShunaWheatIssueRecord[];
  wheatLedgerMovements?: WheatLedgerMovementRecord[];
  shunaReconciliations?: ShunaReconciliationRecord[];
  refrigerators?: RefrigeratorRecord[];
  refrigeratorRooms?: RefrigeratorRoomBalance[];
  refrigeratorReceipts?: RefrigeratorReceiptRecord[];
  refrigeratorIssues?: RefrigeratorIssueRecord[];
  refrigeratorAssets?: RefrigeratorAssetValuation[];
  refrigeratorTempLogs?: RefrigeratorTempLogRecord[];
  refrigeratorMaintenance?: RefrigeratorMaintenanceOrder[];
  refrigeratorFinancials?: RefrigeratorFinancialEntry[];
  mills?: MillRecord[];
  millLicenses?: MillLicenseDocument[];
  millWheatReceipts?: MillWheatReceiptRecord[];
  millDailyOperations?: MillDailyOperationRecord[];
  millProductions?: MillProductionRecord[];
  millMachinery?: MillMachineRecord[];
  millMaintenance?: MillMaintenanceOrder[];
  millInspections?: MillInspectionVisitRecord[];
  millAssets?: MillAssetValuation[];
  flourQuotaMaster?: FlourQuotaMasterRecord[];
  flourDailyDistributions?: FlourDailyDistributionRecord[];
  flourMonthlyQuotas?: FlourMonthlyAnnualQuotaRecord[];
  flourIssues?: FlourIssueOrderRecord[];
  flourQuotaAmendments?: FlourQuotaAmendmentRecord[];
  millBakeryMappings?: MillBakeryMappingRecord[];
  millFlourStockBalances?: MillFlourStockBalance[];
  centralFinancialLedger?: GrainDepartmentFinancialEntry[];
  settings: GrainMaintenanceSettings;
  auditLogs: ModuleAuditLog[];
}

// =========================================================================
// 4. قسم الموارد البشرية وشؤون العاملين
// =========================================================================
export type HrEmploymentStatus =
  | 'على رأس العمل'
  | 'اقترب موعد انتهاء التعاقد'
  | 'منتهي التعاقد'
  | 'إجازة'
  | 'منتدب'
  | 'معار'
  | 'موقوف'
  | 'منتهية خدمته';

export type LeaveCategory = 'اعتيادية' | 'عارضة' | 'مرضية' | 'رسمية' | 'بدون أجر';

export interface HrDepartment {
  id: string;
  branchId: string;
  name: string;
  managerName: string;
  updatedAt?: string;
}

export interface HrEmployee {
  id: string;
  branchId: string;
  employeeCode: string;
  nationalId: string; // 14 digits unique
  fullName: string;
  birthDate: string;
  gender: 'ذكر' | 'أنثى';
  maritalStatus: string;
  childrenCount: number;
  address: string;
  governorate: string;
  district: string;
  village: string;
  phone: string;
  email?: string;
  jobTitle: string;
  qualitativeGroup: string;
  jobGrade: string;
  jobLevel: string;
  departmentName: string;
  unitSection: string;
  workEntity: string;
  workSite: string;
  hireDate: string;
  startWorkDate: string;
  appointmentType: string;
  appointmentDecisionNo: string;
  lastPromotionDate?: string;
  nextExpectedPromotionDate?: string;
  status: HrEmploymentStatus;
  directManager: string;
  fileNumber: string;
  // Public Service & Contract Employees Specific Fields
  employeeType?: 'خدمة عامة' | 'استعانة' | 'تعيين دائم' | string;
  qualification?: string; // المؤهل الدراسي
  contractEndDate?: string; // تاريخ انتهاء التعاقد YYYY-MM-DD
  contractDurationText?: string; // مدة التعاقد
  // Financial structure
  functionalWage: number;
  complementaryWage: number;
  periodicAllowances: number;
  specialAllowances: number;
  monthlyIncentives: number;
  rewards: number;
  allowancesTotal: number;
  extraEntitlements: number;
  insuranceNumber?: string;
  insuranceEntity?: string;
  insurableWage: number;
  manualDeductions: number;
  penalties: number;
  endOfServiceDate?: string;
  endOfServiceReason?: string;
  documentsNotes?: string;
  updatedAt?: string;
}

export interface HrAttendanceRecord {
  id: string;
  branchId: string;
  employeeId: string;
  date: string;
  monthKey: string; // YYYY-MM
  officialStart: string; // e.g. "08:00"
  officialEnd: string; // e.g. "14:00"
  actualIn: string;
  actualOut: string;
  breakMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  netWorkedMinutes: number;
  status: 'حضور' | 'غياب' | 'مأمورية' | 'إذن' | 'عطلة رسمية';
  updatedAt?: string;
}

export interface HrLeaveBalance {
  employeeId: string;
  leaveType: LeaveCategory;
  previousBalance: number;
  entitledDays: number;
  usedDays: number;
  updatedAt?: string;
}

export interface HrLeaveRequest {
  id: string;
  branchId: string;
  employeeId: string;
  leaveType: LeaveCategory;
  startDate: string;
  endDate: string;
  daysCount: number;
  approvalDecisionNo?: string;
  status: 'جديد' | 'معتمد' | 'مرفوض';
  notes?: string;
  updatedAt?: string;
}

export interface HrLoanRecord {
  id: string;
  branchId: string;
  loanNumber: string;
  employeeId: string;
  totalAmount: number;
  disbursedDate: string;
  installmentsCount: number;
  installmentAmount: number;
  paidInstallments: number;
  remainingAmount: number;
  status: 'سارية' | 'مسددة بالكامل';
  updatedAt?: string;
}

export interface HrTaxBracket {
  id: string;
  minAnnual: number;
  maxAnnual: number | null; // null = مفتوح
  ratePct: number;
}

export interface HrPolicySettingsVersion {
  id: string;
  effectiveFrom: string; // YYYY-MM
  lawDecisionReference: string;
  dayCalculationBasis: 30 | 22 | 26;
  dailyWorkingHours: number;
  employeeInsuranceRatePct: number;
  employerInsuranceRatePct: number;
  minInsurableWage: number;
  maxInsurableWage: number;
  annualTaxExemptionAmount: number;
  maxLoanDeductionCeilingPct: number; // مثال 25% أو 50% وفق اللائحة
  taxBrackets: HrTaxBracket[];
  updatedBy: string;
  updatedAt: string;
}

export interface HrPayrollLine {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string;
  functionalWage: number;
  complementaryWage: number;
  allowancesAndRaises: number;
  incentivesAndRewards: number;
  grossEarnings: number;
  employeeInsurance: number;
  employerInsurance: number;
  monthlyIncomeTax: number;
  loanInstallmentDeduction: number;
  absenceAndPenaltiesDeduction: number;
  totalDeductions: number;
  netSalary: number;
  exceedsLegalDeductionCeiling: boolean;
}

export interface HrPayrollPeriodRun {
  id: string;
  branchId: string;
  monthKey: string; // YYYY-MM (فريد لكل موظف بالشهر لمنع التكرار)
  fiscalYear: string;
  policyVersionId: string;
  status: 'معاينة' | 'معتمد';
  approvedBy?: string;
  approvedAt?: string;
  lines: HrPayrollLine[];
}

export interface HrPromotionRecord {
  id: string;
  branchId: string;
  employeeId: string;
  currentGrade: string;
  nextGrade: string;
  previousPromotionDate: string;
  dueDate: string;
  raiseBasisAmount: number;
  raisePct: number;
  raiseAmount: number;
  decisionNumber: string;
  applied: boolean;
  updatedAt?: string;
}

export interface HrModuleState {
  departments: HrDepartment[];
  employees: HrEmployee[];
  attendance: HrAttendanceRecord[];
  leaveBalances: HrLeaveBalance[];
  leaveRequests: HrLeaveRequest[];
  loans: HrLoanRecord[];
  promotions: HrPromotionRecord[];
  payrollRuns: HrPayrollPeriodRun[];
  policySettings: HrPolicySettingsVersion;
  policyVersionsHistory: HrPolicySettingsVersion[];
  auditLogs: ModuleAuditLog[];
}

export type UnifiedEstablishmentType =
  | 'مخبز بلدي'
  | 'مخبز سياحي'
  | 'مخبز إفرنجي'
  | 'محل تجاري'
  | 'سوبر ماركت'
  | 'مخزن تجاري'
  | 'محطة وقود'
  | 'مستودع بوتاجاز'
  | 'موزع أسطوانات بوتاجاز'
  | 'منشأة أخرى';

export type EstablishmentActivityStatus = 'نشط' | 'متوقف' | 'مغلق' | 'تحت الفحص';

export interface InternalTradeEstablishment {
  id: string;
  establishmentCode: string; // كود المنشأة الموحد والفريد
  linkedBakeryId?: string; // ربط اختياري بجدول المخابز الحالي دون تكرار أو حذف
  ownerName: string;
  establishmentName: string;
  nationalId: string;
  phone: string;
  secondaryPhone?: string;
  governorate: string;
  center: string;
  village: string;
  localUnit: string;
  detailedAddress: string;
  establishmentType: UnifiedEstablishmentType;
  activityType: string;
  activityCategory: string;
  commercialRegNumber: string;
  commercialRegIssueDate: string;
  commercialRegExpiryDate: string;
  taxCardNumber: string;
  taxCardIssueDate: string;
  licenseNumber: string;
  licenseIssuingEntity: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  activityStatus: EstablishmentActivityStatus;
  activityStartDate: string;
  closureReason?: string;
  closureDecisionNo?: string;
  closureDate?: string;
  lat?: number;
  lng?: number;
  notes: string;
  attachments: string[];
  updatedAt?: string;
}

export interface InternalTradeCampaign {
  id: string;
  campaignNumber: string;
  campaignDate: string;
  campaignTime: string;
  campaignType: 'دورية' | 'مفاجئة' | 'مشتركة' | 'بناءً على شكوى' | 'ليلية';
  geographicScope: string;
  village: string;
  localUnit: string;
  campaignHead: string;
  campaignMembers: string[];
  inspectedCount: number;
  compliantCount: number;
  violatingCount: number;
  reportsIssuedCount: number;
  totalSeizuresCount: number;
  totalReservedQtySummary: string;
  visitedEstablishmentCodes: string[];
  finalReportSubmitted: boolean;
  notes: string;
  attachments: string[];
  updatedAt?: string;
}

export interface InternalTradeViolationReport {
  id: string;
  reportNumber: string;
  reportDate: string;
  reportTime: string;
  campaignId?: string;
  ownerName: string;
  establishmentCode: string;
  establishmentName: string;
  activityType: string;
  address: string;
  village: string;
  localUnit: string;
  violationType: string;
  violationDescription: string;
  governingLawOrDecision: string;
  legalArticle: string;
  fineAmount: number;
  issuingEntity: string;
  caseNumber: string;
  prosecutionEntity: string;
  status: 'جديد' | 'تم الإرسال' | 'قيد التحقيق' | 'تم التصالح' | 'تم الفصل فيه';
  dispositionResult: string;
  reconciliationAmount: number;
  paymentDate: string;
  paymentMethod: string;
  attachments: string[];
  updatedAt?: string;
}

export interface InternalTradeSeizureRecord {
  id: string;
  seizureOrderNumber: string;
  linkedReportNumber: string;
  seizureDate: string;
  establishmentCode: string;
  establishmentName: string;
  ownerName: string;
  village: string;
  commodityType: string;
  commodityDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalValue: number;
  storageLocation: string;
  seizureStatus: 'متحفظ عليها' | 'تحت الفحص المعملي' | 'تم الإعدام' | 'تم البيع بالمزاد' | 'تم الإفراج';
  dispositionDate: string;
  dispositionEntity: string;
  dispositionResult: string;
  notes: string;
  attachments: string[];
  updatedAt?: string;
}

export interface InternalTradeComplaintRecord {
  id: string;
  complaintNumber: string;
  receivedDate: string;
  source: 'بوابة الشكاوى الحكومية' | 'الخط الساخن 16528' | 'حضور شخصي' | 'مديرية التموين' | 'مواقع التواصل';
  complainantName: string;
  phone: string;
  subject: string;
  targetEstablishmentCode?: string;
  targetEstablishmentName: string;
  targetAddress: string;
  village: string;
  localUnit: string;
  complaintType: 'مغالاة في الأسعار' | 'سلع منتهية الصلاحية' | 'امتناع عن البيع' | 'غش تجاري' | 'نقص وزن / أسطوانات' | 'أخرى';
  assignedEmployee: string;
  inspectionDate: string;
  inspectionResult: string;
  actionTaken: string;
  status: 'جديدة' | 'قيد الفحص' | 'تم الفحص والحل' | 'مغلقة';
  closureDate: string;
  attachments: string[];
  updatedAt?: string;
}

export interface InternalTradeMarketPriceRecord {
  id: string;
  commodityCode: string;
  commodityName: string;
  category: string;
  unit: string;
  declaredPrice: number;
  actualMarketPrice: number;
  previousPeriodPrice: number;
  establishmentCode?: string;
  establishmentName: string;
  observationDate: string;
  monthKey: string;
  village: string;
  localUnit: string;
  observerEmployee: string;
  notes: string;
}

export interface LpgVillageCirculationRecord {
  id: string;
  serialNo: number;
  villageCode: string;
  village: string;
  localUnit: string;
  population: number;
  familiesCount: number;
  beneficiariesCount: number;
  depotsCount: number;
  distributorsCount: number;
  cylinderType: 'أسطوانة منزلية' | 'أسطوانة تجارية' | 'أسطوانة أخرى';
  cylinderWeightKg: number;
  prescribedMonthlyQuota: number;
  prescribedDailyQuota: number;
  actualInboundQty: number;
  actualDisbursedQty: number;
  monthKey: string;
  notes: string;
}

export interface PetroleumVillageCirculationRecord {
  id: string;
  serialNo: number;
  village: string;
  localUnit: string;
  population: number;
  stationsCount: number;
  fuelType: 'بنزين 80' | 'بنزين 92' | 'بنزين 95' | 'السولار' | 'الكيروسين' | string;
  unit: 'لتر';
  openingBalanceLiters: number;
  inboundLiters: number;
  disbursedLiters: number;
  prescribedQuotaLiters: number;
  monthKey: string;
  notes: string;
}

export interface FuelStationControlRecord {
  id: string;
  stationCode: string;
  stationName: string;
  ownerName: string;
  managerName: string;
  village: string;
  localUnit: string;
  address: string;
  distributionCompany: string;
  availableFuelTypes: string[];
  tanksCount: number;
  tankCapacityLiters: number;
  pumpMetersReadingSummary: string;
  primaryFuelType: string;
  openingBalanceLiters: number;
  inboundLiters: number;
  soldDisbursedLiters: number;
  actualStockLiters: number;
  lastInventoryDate: string;
  licenseStatus: 'ساري' | 'قارب على الانتهاء' | 'منتهي' | 'موقوف';
  stationStatus: 'تعمل بانتظام' | 'توقف جزئي' | 'مغلقة إدارياً' | 'تحت الجرد';
  inspectionActionTaken: string;
  notes: string;
}

export interface FuelStationDailyMovement {
  id: string;
  stationCode: string;
  stationName: string;
  movementDate: string;
  fuelType: string;
  movementType: 'استلام وارد' | 'صرف ومبيعات' | 'جرد فعلي';
  quantityLiters: number;
  invoiceOrDocNumber: string;
  inspectorOrOperator: string;
  notes: string;
}

export interface LpgDepotControlRecord {
  id: string;
  depotCode: string;
  depotName: string;
  ownerName: string;
  managerName: string;
  address: string;
  village: string;
  localUnit: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  prescribedQuota: number;
  inboundCylinders: number;
  disbursedCylinders: number;
  fullCylindersCount: number;
  emptyCylindersCount: number;
  damagedCylindersCount: number;
  inventoryResult: string;
  campaignsSummary: string;
  violationsSummary: string;
  affiliatedDistributorsCount: number;
  notes: string;
}

export interface LpgDistributorRecord {
  id: string;
  distributorCode: string;
  distributorName: string;
  nationalId: string;
  phone: string;
  address: string;
  distributionScopeVillage: string;
  localUnit: string;
  affiliatedDepotName: string;
  prescribedQuota: number;
  receivedQty: number;
  distributedQty: number;
  vehicleDetails: string;
  licenseNumber: string;
  status: 'نشط' | 'متوقف' | 'تحت الفحص';
  previousViolations: string;
  dailyMonthlyLogSummary: string;
}

export interface InternalTradeSettings {
  domesticCylinderWeightKg: number;
  commercialCylinderWeightKg: number;
  customPetroleumTypes: string[];
  licenseAlertDaysBefore: number;
}

export interface InternalTradeState {
  establishments: InternalTradeEstablishment[];
  campaigns: InternalTradeCampaign[];
  violations: InternalTradeViolationReport[];
  seizures: InternalTradeSeizureRecord[];
  complaints: InternalTradeComplaintRecord[];
  marketPrices: InternalTradeMarketPriceRecord[];
  lpgVillageCirculation: LpgVillageCirculationRecord[];
  petroleumVillageCirculation: PetroleumVillageCirculationRecord[];
  fuelStations: FuelStationControlRecord[];
  fuelStationMovements: FuelStationDailyMovement[];
  lpgDepots: LpgDepotControlRecord[];
  lpgDistributors: LpgDistributorRecord[];
  settings: InternalTradeSettings;
  auditLogs: ModuleAuditLog[];
}

export interface BranchModulesBundle {
  branchId: string;
  ration: RationModuleState;
  internalTrade?: InternalTradeState;
  grainMaintenance: GrainMaintenanceState;
  hr: HrModuleState;
  updatedAt: string;
}
