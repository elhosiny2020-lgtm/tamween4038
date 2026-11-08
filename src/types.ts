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

  // الحصص والبيانات التموينية
  insuranceQuota: number; // الحصة التأمينية (بالشيكارة)
  actualQuota: number; // الحصة الفعلية (بالشيكارة)
  insuranceValue: number; // القيمة التأمينية (بالجنيه)
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
  activityStatus: string; // نشاط المخبز (شغال، متوقف كلي، متوقف جزئي، ملغى، إلخ)
  bakeryCategory?: string; // تصنيف المخبز (مخبز بلدي مدعم، مخبز بلدي مطور، مخبز سياحي 72%، مخبز فينو وأفرنجي، مخبز طباقي)
  breadType: string; // نوع الخبز (بلدي مدعم ماو، بلدي مجر، خبز آلي، طباقي)
  breadTypeCount: number; // عدد نوع الخبز (افتراضي 1)
  lineType: string; // نوع خط الإنتاج (نصف آلي، آلي كامل، يدوي)
  fuelType: string; // نوع الوقود (غاز طبيعي، سولار)

  // بيانات الاتصال والهوية
  phone: string; // رقم التليفون (11 رقم صارم)
  nationalId: string; // الرقم القومي (14 رقم صارم)

  // التراخيص والعقود وتواريخ السريان
  taxCardDate: string; // تاريخ البطاقة الضريبية
  commercialRegDate: string; // تاريخ السجل التجاري
  bakeryLicenseDate: string; // تاريخ رخصة المخبز
  leaseAgreementDate: string; // تاريخ عقد الإيجار

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
  breadTypeCount: string;
  lineType: string;
  fuelType: string;
  phone: string;
  nationalId: string;
  commercialRegDate: string;
  bakeryLicenseDate: string;
  leaseAgreementDate: string;
  taxCardDate: string;
  actions: string;
}

export interface SystemConfig {
  governorateTitle: string;
  directorateTitle: string;
  administrationTitle: string;
  englishSubtitle: string;
  logoBase64: string;
}

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  password?: string;
  role: 'admin' | 'inspector' | 'auditor';
  createdAt: string;
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
