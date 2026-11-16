export type DepartmentScopeId =
  | 'all'
  | 'bakeries'
  | 'debts'
  | 'commodities'
  | 'internal_trade'
  | 'grain_maintenance'
  | 'hr';

export interface DepartmentScopeMeta {
  id: DepartmentScopeId;
  label: string;
  description: string;
}

export const DEPARTMENT_SCOPES: DepartmentScopeMeta[] = [
  {
    id: 'all',
    label: 'كافة الأقسام (إدارة شاملة)',
    description: 'وصول كامل لجميع أقسام المنظومة عبر كافة الفروع',
  },
  {
    id: 'bakeries',
    label: 'قسم إدارة المخابز',
    description: 'قاعدة بيانات المخابز والحصص والمتوسطات والتراخيص فقط',
  },
  {
    id: 'debts',
    label: 'قسم سجل المديونيات للمخابز',
    description: 'سجل المخالفات والمديونيات والتحصيل وغرامات نقص الوزن فقط',
  },
  {
    id: 'commodities',
    label: 'قسم السلع التموينية',
    description: 'البطاقات والمستفيدون والمقررات التموينية والاستعاضات والرقابة',
  },
  {
    id: 'internal_trade',
    label: 'قسم التجارة التموينية والداخلية',
    description: 'التجار والمنافذ والمخازن والمبيعات والعمولات والتسويات المالية',
  },
  {
    id: 'grain_maintenance',
    label: 'قسم صيانة الحبوب والصوامع',
    description: 'الصوامع والمعدات وأوامر الصيانة وقطع الغيار والفاقد والرطوبة',
  },
  {
    id: 'hr',
    label: 'قسم الموارد البشرية وشؤون العاملين',
    description: 'الموظفون والحضور والإجازات والمرتبات والتأمينات والضرائب والسلف',
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
export type MerchantActivityStatus = 'نشط' | 'موقوف' | 'ملغي';
export type OutletType = 'تاجر تمويني' | 'منفذ جمعيتي' | 'مجمع استهلاكي';
export type CommodityUnit = 'كيلو' | 'جرام' | 'لتر' | 'عبوة' | 'قطعة';

export interface RationMerchant {
  id: string;
  serialNo: number;
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
  warehouseName?: string;
  activityStartDate?: string;
  cashInsuranceAmount: number; // قيمة التأمين النقدي
  openingBalance: number;
  linkedCardsCount: number;
  linkedBeneficiariesCount: number;
  activityStatus: MerchantActivityStatus;
  wholesaleBranchName: string;
  lastRequisitionDate?: string;
  notes?: string;
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
  supplierCompany: string;
  reorderLevel: number;
  expiryDate?: string;
  decisionNumber: string;
  notes?: string;
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
  lastMovementDate?: string;
  expiryDate?: string;
  stagnantDays?: number;
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
    | 'ADJUSTMENT_SURPLUS'
    | 'ADJUSTMENT_SHORTAGE'
    | 'REVERSAL';
  merchantId: string;
  warehouseName: string;
  commodityId: string;
  requestedQty?: number;
  quantity: number;
  rejectedQty?: number;
  unitPrice: number;
  totalValue: number;
  balanceBefore: number;
  balanceAfter: number;
  approvedBy: string;
  isReversed?: boolean;
  reversedByDoc?: string;
  notes?: string;
}

export interface RationRequisitionLine {
  commodityId: string;
  commodityName: string;
  requestedQty: number;
  approvedQty: number;
  deliveredQty: number;
  supplyPrice: number;
}

export interface RationRequisition {
  id: string;
  branchId: string;
  requestNumber: string;
  invoiceNumber: string;
  monthKey: string;
  merchantId: string;
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
}

export interface MaintenanceTechnician {
  id: string;
  branchId: string;
  name: string;
  specialty: string;
  hourlyWage: number;
  phone: string;
  isActive: boolean;
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
}

export interface GrainMaintenanceSettings {
  defaultIndirectOverheadPct: number;
  defaultTaxPct: number;
  maxAcceptableGrainLossPct: number;
  defaultReferenceMoisturePct: number;
  decisionNote: string;
}

export interface GrainMaintenanceState {
  assets: GrainAsset[];
  orders: MaintenanceOrder[];
  spareParts: SparePartItem[];
  technicians: MaintenanceTechnician[];
  grainMovements: GrainMovementRecord[];
  settings: GrainMaintenanceSettings;
  auditLogs: ModuleAuditLog[];
}

// =========================================================================
// 4. قسم الموارد البشرية وشؤون العاملين
// =========================================================================
export type HrEmploymentStatus =
  | 'على رأس العمل'
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
}

export interface HrLeaveBalance {
  employeeId: string;
  leaveType: LeaveCategory;
  previousBalance: number;
  entitledDays: number;
  usedDays: number;
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

export interface BranchModulesBundle {
  branchId: string;
  ration: RationModuleState;
  grainMaintenance: GrainMaintenanceState;
  hr: HrModuleState;
  updatedAt: string;
}
