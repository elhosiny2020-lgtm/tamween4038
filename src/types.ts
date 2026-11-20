import type {
  DepartmentPermissionFlags,
  DepartmentPermissionsMap,
  DepartmentScopeId,
  LoafWeightFineRecord,
  LoafWeightSettings,
  PermissionAction,
  SystemDepartmentKey,
} from './types/modules.ts';
export type {
  DepartmentPermissionFlags,
  DepartmentPermissionsMap,
  DepartmentScopeId,
  LoafWeightFineRecord,
  LoafWeightSettings,
  PermissionAction,
  SystemDepartmentKey,
} from './types/modules.ts';
export { DEPARTMENT_SCOPES, SYSTEM_DEPARTMENT_KEYS } from './types/modules.ts';

export interface BakeryActivityLogItem {
  id: string;
  timestamp: string;
  username: string;
  userFullName: string;
  userRole: string;
  action: string;
  details?: string;
}

export interface Bakery {
  id: string;
  // البيانات الأساسية وموقع المخبز
  bakeryOwnerName: string; // اسم صاحب المخبز
  machineNumber: string; // رقم الماكينة
  village: string; // القرية
  localUnit: string; // الوحدة المحلية التابعة
  responsibleManager?: string; // المدير المسئول

  // الحصص والبيانات التموينية
  insuranceQuota: number; // الحصة التأمينية (بالشيكارة)
  actualQuota: number; // الحصة الفعلية (بالشيكارة)
  insuranceValue: number; // القيمة التأمينية (بالجنيه)
  insuranceCheckNumber?: string; // رقم شيك سداد التأمين (بقائمة التعديل فقط)
  loavesCount: number; // عدد الأرغفة اليومية = الحصة التأمينية × 1350

  // إحصائيات السكان والمستفيدين
  villagePopulation: number; // عدد سكان القرية
  perCapitaAverage: string; // متوسط نصيب الفرد = الأرغفة ÷ سكان القرية
  beneficiaries2023: number; // مستفيدي 2023
  avg2023: string; // متوسط 2023 = الأرغفة ÷ مستفيدي 2023
  beneficiaries2024: number; // مستفيدي 2024
  avg2024: string; // متوسط 2024 = الأرغفة ÷ مستفيدي 2024
  beneficiaries2025: number; // مستفيدي 2025
  avg2025: string; // متوسط 2025 = الأرغفة ÷ مستفيدي 2025
  avgDiff: string; // الفرق التراكمي = متوسط 2025 - متوسط 2023

  // التصنيف والتشغيل
  activityStatus: string; // نشاط المخبز (يعمل، متوقف كلي، متوقف جزئي، ملغى، إلخ)
  bakeryCategory?: string; // نوع المخابز (مخبز بلدي مدعم، مخبز بلدي مطور، مخبز سياحي 72%، مخبز فينو وأفرنجي، مخبز طباقي)
  breadType: string; // نوع الخبز (بلدي مدعم ماو، بلدي مجر، خبز آلي، طباقي)
  flourBagPrice?: number; // سعر الشيكارة (بالجنيه)
  breadTypeCount: number | string; // نوع عدد الخبز (660 أو 725)
  lineType: string; // نوع خط الإنتاج (نصف آلي، آلي كامل، يدوي)
  fuelType: string; // نوع الوقود (غاز طبيعي، سولار)

  // بيانات الاتصال والهوية
  phone: string; // رقم التليفون (11 رقم صارم)
  nationalId: string; // الرقم القومي (14 رقم صارم)

  // التراخيص والعقود وتواريخ السريان
  commercialRegNumber?: string; // رقم السجل التجاري
  commercialRegDate: string; // تاريخ السجل التجاري
  bakeryLicenseNumber?: string; // رقم الرخصة
  bakeryLicenseDate: string; // تاريخ رخصة المخبز
  leaseContractType?: string; // عقد الإيجار (إيجار / تمليك)
  leaseAgreementDate: string; // تاريخ عقد الإيجار
  taxCardNumber?: string; // رقم البطاقة الضريبية
  taxCardDate: string; // تاريخ البطاقة الضريبية

  notes?: string;

  // سجل النشاط والتعديلات التاريخية للمخبز
  activityLog?: BakeryActivityLogItem[];
}

export interface DebtRecord {
  id: string;
  bakeryId: string; // ربط بالمخبز
  bakeryOwnerName: string; // اسم صاحب المخبز
  machineNumber: string; // رقم الماكينة
  village: string; // القرية
  localUnit: string; // الوحدة المحلية

  // مخالفات المخبز
  violationDate: string; // تاريخ العملية
  issuingEntity: string; // الجهة المحررة للمحضر
  violationType: string; // نوع المخالفة
  violationAmount: number; // قيمة المخالفة
  oldViolations: number; // مخالفات قديمة
  totalViolations: number; // إجمالي المخالفات = قيمة المخالفة + مخالفات قديمة

  // سداد المخالفات
  violationPaymentDate: string; // تاريخ السداد
  violationReceiptNumber: string; // رقم الإيصال
  violationPaymentMethod: string; // نوع السداد (كاش، فودافون كاش، انستاباي، سداد إلكتروني)
  paidViolationAmount: number; // المبلغ المسدد من المخالفات
  remainingViolations: number; // المتبقي من المخالفات = إجمالي المخالفات - المسدد

  // المنصرف وسداد المنصرف (المضاف)
  addedAmount: number; // المضاف للمخبز
  addedPaymentDate: string; // تاريخ السداد
  addedReceiptNumber: string; // رقم الإيصال
  addedPaymentMethod: string; // نوع السداد
  paidAddedAmount: number; // المسدد من المضاف
  remainingAdded: number; // المتبقي من المضاف

  // التصرف من المخبز
  disposalDate: string; // تاريخ التصرف
  disposalBags: number; // عدد الشكاير
  disposalBagPrice: number; // قيمة الشيكارة
  disposalMultiplier: number; // مضاعفة العقوبة (1x إلى 5x)
  disposalValue: number; // قيمة التصرف = عدد الشكاير × قيمة الشيكارة × مضاعفة العقوبة

  // السداد من التصرف
  disposalPaymentDate: string; // تاريخ السداد
  disposalReceiptNumber: string; // رقم الإيصال
  disposalPaymentMethod: string; // نوع السداد
  paidDisposalAmount: number; // السداد من التصرف
  remainingDisposal: number; // المتبقي من التصرف = قيمة التصرف - السداد من التصرف

  // صافي المتبقي على صاحب المخبز
  // (قيمة المخالفة + مخالفات قديمة - المبلغ المسدد) + (قيمة التصرف - السداد من التصرف) + (المضاف - المسدد من المضاف)
  netRemainingDebt: number;

  // جدولة المديونيات على صاحب المخبز
  isScheduled?: boolean; // هل المديونية مجدولة؟
  scheduleInstallmentsCount?: number; // عدد الدفعات / الأقساط
  schedulePeriodType?: 'أسبوعي' | 'نصف شهري' | 'شهري' | string; // دورية السداد
  scheduleInstallmentValue?: number; // قيمة القسط الدوري (ج.م)
  scheduleStartDate?: string; // تاريخ بداية الجدولة
  schedulePaidInstallments?: number; // عدد الدفعات المسددة
  scheduleStatus?: string; // حالة الجدولة (منتظم / قيد التحصيل / مكتمل / متأخر)

  // تفاصيل غرامة نقص وزن الرغيف (بقائمة ومودال احتساب غرامة نقص الوزن دون تغيير القيود القديمة)
  weightFineDetails?: LoafWeightFineRecord;
  shortageGrams?: number; // مقدار النقص بالجرام
  prescribedWeightGrams?: number; // وزن الرغيف المقرر
  weightFineCalculatedAmount?: number; // قيمة غرامة نقص الوزن

  notes?: string;
}

export interface VillageHierarchy {
  village: string;
  localUnits: string[];
}

export interface ColumnTitles {
  index: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  responsibleManager: string;
  remainingDebt: string;
  insuranceQuota: string;
  actualQuota: string;
  insuranceValue: string;
  loavesCount: string;
  villagePopulation: string;
  perCapitaAverage: string;
  beneficiaries2023: string;
  avg2023: string;
  beneficiaries2024: string;
  avg2024: string;
  beneficiaries2025: string;
  avg2025: string;
  avgDiff: string;
  activityStatus: string;
  bakeryCategory: string;
  breadType: string;
  flourBagPrice: string;
  breadTypeCount: string;
  lineType: string;
  fuelType: string;
  phone: string;
  nationalId: string;
  commercialRegNumber: string;
  commercialRegDate: string;
  bakeryLicenseNumber: string;
  bakeryLicenseDate: string;
  leaseContractType: string;
  leaseAgreementDate: string;
  taxCardNumber: string;
  taxCardDate: string;
  actions: string;
}

export interface DailyDebtEmailLogBakerySnapshot {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  totalRemainingDebt: number;
}

export interface DailyDebtEmailLogEntry {
  id: string;
  sentAtIso: string;
  sentDate: string; // YYYY-MM-DD
  alertTime?: string; // e.g. "09:00"
  subject?: string;
  mode: 'auto' | 'manual';
  status: 'sent' | 'needs_auth' | 'failed';
  recipients: string[];
  criticalBakeriesCount: number;
  totalCriticalDebt: number;
  thresholdUsed: number;
  messageId?: string;
  errorMessage?: string;
  bakeriesSnapshot?: DailyDebtEmailLogBakerySnapshot[];
}

export interface DailyAlertConfig {
  enabled: boolean;
  alertTime: string; // e.g. "09:00"
  notifyBrowser: boolean;
  notifySound: boolean;
  targetDocs: string[]; // e.g. ['bakeryLicenseDate', 'commercialRegDate', 'leaseAgreementDate', 'taxCardDate']
  daysThreshold: number; // 0 = expired already, 15 = within 15 days, 30 = within 30 days
  lastAlertDate?: string; // YYYY-MM-DD
  // Automated Daily Critical Debt Email Alerts to Supervisors
  debtEmailEnabled?: boolean;
  debtEmailAlertTime?: string; // e.g. "09:00"
  debtEmailCriticalThreshold?: number; // critical remaining debt EGP threshold
  supervisorEmailRecipients?: string[]; // manually added supervisor emails
  includeSystemSupervisors?: boolean; // include supervisor/admin users with gmailEmail
  lastDebtEmailAlertDate?: string; // YYYY-MM-DD
  debtEmailHistory?: DailyDebtEmailLogEntry[];
  // In-App PUSH Alerts to Managers for Low Daily Flour Quota (in sacks / شكائر)
  lowFlourQuotaAlertEnabled?: boolean;
  lowFlourQuotaMinSacks?: number;
}

export interface CustomJobRole {
  id: string;
  title: string;
  fullTitle?: string;
  badgeColor?: string;
}

export interface BranchVaultCredential {
  branchId: string;
  branchName?: string;
  username: string;
  password: string;
  updatedAt?: string;
}

export interface BranchSubDepartmentItem {
  id: string;
  label: string;
  targetTab?: string;
  targetAction?: string;
  visible: boolean;
  enabled: boolean;
  order: number;
  defaultPermissions?: string[];
}

export interface BranchDepartmentConfigItem {
  id: string;
  key: SystemDepartmentKey | string;
  label: string;
  shortLabel?: string;
  iconKey?: string;
  visible: boolean;
  enabled: boolean;
  order: number;
  defaultPermissions?: string[];
  subItems: BranchSubDepartmentItem[];
}

export interface SystemConfig {
  governorateTitle: string;
  directorateTitle: string;
  administrationTitle: string;
  englishSubtitle: string;
  logoBase64: string;
  dailyAlertConfig?: DailyAlertConfig;
  rolePermissions?: Record<string, string[]>;
  roleLabels?: Record<string, string>;
  customRoles?: CustomJobRole[];
  gmailEmail?: string;
  gmailPassword?: string;
  googleDriveAutoSync?: boolean;
  debtAlertThreshold?: number;
  vaultUsername?: string;
  vaultPasscode?: string;
  branchVaultCredentials?: Record<string, BranchVaultCredential>;
  loafWeightSettings?: LoafWeightSettings;
  branchDepartments?: BranchDepartmentConfigItem[];
  customTableTitles?: Record<string, string>;
  customColumnTitles?: Record<string, Record<string, string>>;
}

export type UserRoleType =
  | 'super_admin'
  | 'admin'
  | 'supervisor'
  | 'inspector'
  | 'auditor'
  | 'data_entry'
  | 'viewer'
  | 'reader'
  | string;

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  password?: string;
  hasPassword?: boolean;
  role: UserRoleType;
  isSuperAdmin?: boolean;
  jobTitle?: string;
  department?: string;
  phone?: string;
  gmailEmail?: string;
  gmailPassword?: string;
  googleDriveAutoSync?: boolean;
  customPermissions?: string[];
  allowedDepartments?: DepartmentScopeId[];
  departmentPermissions?: DepartmentPermissionsMap;
  applyToAllBranches?: boolean;
  branchId?: string;
  createdAt?: string;
  isActive?: boolean;
  notes?: string;
}

export interface InboxChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRoleType;
  recipientTarget: string; // 'ALL' or specific username/role
  recipientLabel: string;
  messageType: 'instruction' | 'general' | 'alert';
  content: string;
  relatedBakeryId?: string;
  relatedBakeryName?: string;
  timestamp: string;
  readBy?: string[];
}

export interface ExpirationAlertItem {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  phone: string;
  docType: string; // رخصة المخبز، السجل التجاري، عقد الإيجار، البطاقة الضريبية
  docDate: string;
  daysRemaining: number;
  isExpired: boolean;
}

export interface WeeklyInstallmentItem {
  weekNumber: number;
  dueDate: string;
  amount: number;
  isPaid?: boolean;
  paidDate?: string;
  receiptNumber?: string;
}

export interface LargeDebtAlertItem {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  phone: string;
  totalDebt: number;
  weeksCount: number;
  weeklyAmount: number;
  installments: WeeklyInstallmentItem[];
}

export interface HighDebtAlertNotification {
  id: string;
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  debtAmount: number;
  thresholdUsed?: number;
  branchId?: string;
  editedBy: string;
  editorRole: string;
  timestamp: string;
  createdAtIso?: string;
  actionType: 'ADD_DEBT' | 'EDIT_DEBT' | 'HIGH_DEBT_SURGE';
  isRead: boolean;
  notes?: string;
}

export interface CustomBackupConfig {
  destinationType: 'GOOGLE_DRIVE' | 'LOCAL_NETWORK' | 'CUSTOM_FOLDER';
  customPath: string;
  autoSyncEnabled: boolean;
  lastBackupTime?: string;
}

export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type DailyTaskCategory =
  | 'debt_review'
  | 'bakery_inspection'
  | 'license_followup'
  | 'quota_audit'
  | 'general';

export interface DailyBakeryTask {
  id: string;
  title: string;
  description?: string;
  bakeryId?: string;
  bakeryName?: string;
  village?: string;
  priority: TaskPriority; // 'high' = عالية, 'medium' = متوسطة, 'low' = منخفضة
  dueDate: string; // YYYY-MM-DD
  status: TaskStatus;
  assignedTo?: string;
  createdAt: string;
  taskType?: DailyTaskCategory;
  showOnWelcomeDashboard?: boolean;
  welcomeReminderDate?: string; // YYYY-MM-DD
}

export interface SupplyBranch {
  id: string;
  name: string; // مثال: إدارة تموين مركز المحلة الكبرى / إدارة تموين سمنود
  governorateTitle: string;
  directorateTitle: string;
  governorate?: string;
  directorate?: string;
  description?: string;
  createdAt: string;
  isDefault?: boolean;
}

export type { AppState } from './storage';



