import { Bakery, DebtRecord, VillageHierarchy, ColumnTitles, SystemConfig, AppUser } from './types';

export const DEFAULT_OFFICIAL_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="%23d97706" />
      <stop offset="50%" stop-color="%23b45309" />
      <stop offset="100%" stop-color="%2378350f" />
    </linearGradient>
    <linearGradient id="shield" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="%231e3a8a" />
      <stop offset="100%" stop-color="%230f172a" />
    </linearGradient>
  </defs>
  <!-- Outer Ring with Stars -->
  <circle cx="100" cy="100" r="95" fill="%23ffffff" stroke="%23b45309" stroke-width="4"/>
  <circle cx="100" cy="100" r="88" fill="none" stroke="%23b45309" stroke-width="1.5" stroke-dasharray="3,3"/>
  
  <!-- Central Shield -->
  <path d="M60 45 L140 45 L140 100 C140 140 100 165 100 165 C100 165 60 140 60 100 Z" fill="url(%23shield)" stroke="%23d97706" stroke-width="3"/>

  <!-- Wheat Sheaves (سنابل القمح التموينية) on Sides -->
  <g fill="%23d97706">
    <path d="M40 130 Q30 90 50 65 Q45 85 45 120 Z"/>
    <circle cx="45" cy="75" r="4"/>
    <circle cx="40" cy="90" r="4.5"/>
    <circle cx="38" cy="108" r="4.5"/>
    <circle cx="42" cy="125" r="4"/>
    
    <path d="M160 130 Q170 90 150 65 Q155 85 155 120 Z"/>
    <circle cx="155" cy="75" r="4"/>
    <circle cx="160" cy="90" r="4.5"/>
    <circle cx="162" cy="108" r="4.5"/>
    <circle cx="158" cy="125" r="4"/>
  </g>

  <!-- Egyptian Eagle Emblem in Gold -->
  <g fill="url(%23gold)" stroke="%2378350f" stroke-width="1">
    <!-- Wings -->
    <path d="M100 60 C80 50 65 65 70 85 C75 75 85 70 100 78 C115 70 125 75 130 85 C135 65 120 50 100 60 Z"/>
    <!-- Body & Chest -->
    <path d="M92 78 L108 78 L112 125 L100 135 L88 125 Z" fill="%23ffffff" stroke="%23d97706" stroke-width="2"/>
    <!-- Egyptian Flag Colors inside eagle chest -->
    <rect x="94" y="85" width="12" height="10" fill="%23ce1126"/>
    <rect x="94" y="95" width="12" height="10" fill="%23ffffff"/>
    <rect x="94" y="105" width="12" height="10" fill="%23000000"/>
    <!-- Head -->
    <path d="M100 52 C95 52 92 56 94 62 L106 62 C108 56 105 52 100 52 Z"/>
    <!-- Beak -->
    <path d="M106 58 L112 60 L106 62 Z" fill="%23d97706"/>
    <!-- Claws holding scroll -->
    <rect x="85" y="133" width="30" height="7" rx="3" fill="%23d97706"/>
  </g>

  <!-- Text Top & Bottom -->
  <text x="100" y="28" font-size="9" font-weight="900" text-anchor="middle" fill="%231e3a8a" font-family="sans-serif">جمهورية مصر العربية</text>
  <text x="100" y="38" font-size="8" font-weight="900" text-anchor="middle" fill="%23b45309" font-family="sans-serif">وزارة التموين والتجارة الداخلية</text>
  <text x="100" y="180" font-size="6.5" font-weight="900" text-anchor="middle" fill="%231e3a8a" font-family="sans-serif">MINISTRY OF SUPPLY AND INTERNAL TRADE</text>
</svg>`;

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  governorateTitle: 'محافظة الغربية',
  directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
  administrationTitle: 'إدارة تموين مركز المحلة الكبرى',
  englishSubtitle: 'MINISTRY OF SUPPLY AND INTERNAL TRADE',
  logoBase64: DEFAULT_OFFICIAL_LOGO
};

export const DEFAULT_VILLAGES_HIERARCHY: VillageHierarchy[] = [
  {
    village: 'بشبيش',
    localUnits: ['بشبيش الرئيسية', 'لومانة', 'ميت الليت هاشم', 'محلة القصب', 'منشأة الأمراء']
  },
  {
    village: 'محلة حسن',
    localUnits: ['محلة حسن الرئيسية', 'ميت السراج', 'كفر دمتنو', 'دمتنو', 'طرينة']
  },
  {
    village: 'صفط تراب',
    localUnits: ['صفط تراب الرئيسية', 'شبرا بابل', 'كفر فيالة', 'كفر العبايدة']
  },
  {
    village: 'دمرو',
    localUnits: ['دمرو الرئيسية', 'سنبارة', 'كفر سنبارة', 'شبرا نباص', 'منشأة طنبارة']
  },
  {
    village: 'العامرية',
    localUnits: ['العامرية الرئيسية', 'الدواخلية', 'دنوشر', 'كفر دخميس', 'دخميس']
  },
  {
    village: 'شوني',
    localUnits: ['شوني الرئيسية', 'الراهبين', 'القيصرية', 'كفر حانوت', 'كفر الشيخ سليم']
  },
  {
    village: 'نمرة البصل',
    localUnits: ['نمرة البصل الرئيسية', 'كفر قريطنة', 'القيراطية', 'سندسيس']
  },
  {
    village: 'بلقينا',
    localUnits: ['بلقينا الرئيسية', 'الهياتم', 'بطينة', 'كفر حجازي']
  }
];

export const DEFAULT_ISSUING_ENTITIES: string[] = [
  'إدارة تموين مركز المحلة الكبرى',
  'مباحث تموين الغربية',
  'مديرية التموين والتجارة الداخلية بالغربية',
  'إدارة الرقابة التموينية بالمحلة',
  'قطاع التجارة الداخلية وحماية المستهلك'
];

export const DEFAULT_VIOLATION_TYPES: string[] = [
  'نقص وزن الرغيف البلدي المدعم',
  'إنتاج خبز غير مطابق للمواصفات التموينية',
  'توقف عن الإنتاج بدون إذن مسبق',
  'تصرف في دقيق بلدي مدعم (شكاير)',
  'تجميع بطاقات تموينية ذكية بدون مبرر',
  'عدم وجود لوحة مواعيد التشغيل والإعلان',
  'بيع بأزيد من السعر الجبري والوزن القانوني',
  'عدم نظافة أدوات العجين وخزانات المياه',
  'عدم إعطاء بون صرف الخبز للمواطن'
];

export const PAYMENT_METHODS: string[] = [
  'كاش',
  'فودافون كاش',
  'انستاباي',
  'سداد إلكتروني'
];

export const DEFAULT_ACTIVITY_STATUSES: string[] = [
  'شغال',
  'متوقف جزئي',
  'متوقف كلي',
  'ملغى',
  'مغلق بقرار تمويني',
  'تجديد ورفع كفاءة'
];

export const DEFAULT_COLUMN_TITLES: ColumnTitles = {
  index: 'م',
  bakeryOwnerName: 'اسم صاحب المخبز',
  machineNumber: 'رقم الماكينة',
  village: 'القرية',
  localUnit: 'الوحدة التابعة',
  remainingDebt: 'المتبقي على المخبز',
  insuranceQuota: 'الحصة التأمينية (شيكارة)',
  actualQuota: 'الحصة الفعلية (شيكارة)',
  insuranceValue: 'القيمة التأمينية (ج.م)',
  loavesCount: 'الأرغفة اليومية',
  villagePopulation: 'سكان القرية',
  perCapitaAverage: 'متوسط الفرد للمخبز',
  beneficiaries2023: 'مستفيدي 2023',
  avg2023: 'متوسط 2023',
  beneficiaries2024: 'مستفيدي 2024',
  avg2024: 'متوسط 2024',
  beneficiaries2025: 'مستفيدي 2025',
  avg2025: 'متوسط 2025',
  avgDiff: 'الفرق التراكمي',
  activityStatus: 'نشاط المخبز',
  breadType: 'نوع الخبز',
  breadTypeCount: 'عدد نوع الخبز',
  lineType: 'نوع خط الإنتاج',
  fuelType: 'نوع الوقود',
  phone: 'رقم التليفون',
  nationalId: 'الرقم القومي',
  commercialRegDate: 'السجل التجاري',
  bakeryLicenseDate: 'رخصة المخبز',
  leaseAgreementDate: 'عقد الإيجار',
  taxCardDate: 'البطاقة الضريبية',
  actions: 'العمليات والإجراءات'
};

export const INITIAL_BAKERIES: Bakery[] = [
  {
    id: 'b-101',
    bakeryOwnerName: 'أحمد محمود السعيد حسانين',
    machineNumber: '84920145',
    village: 'بشبيش',
    localUnit: 'بشبيش الرئيسية',
    insuranceQuota: 24,
    actualQuota: 24,
    insuranceValue: 18500,
    loavesCount: 24 * 1350, // 32400
    villagePopulation: 38500,
    perCapitaAverage: (32400 / 38500).toFixed(3), // 0.842
    beneficiaries2023: 34200,
    avg2023: (32400 / 34200).toFixed(3),
    beneficiaries2024: 35800,
    avg2024: (32400 / 35800).toFixed(3),
    beneficiaries2025: 37400,
    avg2025: (32400 / 37400).toFixed(3),
    avgDiff: ((32400 / 37400) - (32400 / 34200)).toFixed(3),
    activityStatus: 'شغال',
    breadType: 'بلدي مدعم ماو',
    breadTypeCount: 1,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    phone: '01004414038',
    nationalId: '28905141600174',
    commercialRegDate: '2027-04-15',
    bakeryLicenseDate: '2026-11-18', // Expiring in 12 days!
    leaseAgreementDate: '2028-09-01',
    taxCardDate: '2027-01-10',
    notes: 'مخبز منتظم في الإنتاج وجودة رغيف ممتازة'
  },
  {
    id: 'b-102',
    bakeryOwnerName: 'إبراهيم علي عبدالفتاح رضوان',
    machineNumber: '76319842',
    village: 'محلة حسن',
    localUnit: 'محلة حسن الرئيسية',
    insuranceQuota: 18,
    actualQuota: 18,
    insuranceValue: 14200,
    loavesCount: 18 * 1350, // 24300
    villagePopulation: 29400,
    perCapitaAverage: (24300 / 29400).toFixed(3),
    beneficiaries2023: 26100,
    avg2023: (24300 / 26100).toFixed(3),
    beneficiaries2024: 27500,
    avg2024: (24300 / 27500).toFixed(3),
    beneficiaries2025: 28900,
    avg2025: (24300 / 28900).toFixed(3),
    avgDiff: ((24300 / 28900) - (24300 / 26100)).toFixed(3),
    activityStatus: 'شغال',
    breadType: 'بلدي مدعم ماو',
    breadTypeCount: 1,
    lineType: 'آلي كامل',
    fuelType: 'سولار',
    phone: '01123456789',
    nationalId: '28509211601289',
    commercialRegDate: '2026-11-14', // Expiring in 8 days!
    bakeryLicenseDate: '2027-08-30',
    leaseAgreementDate: '2026-11-09', // Expiring in 3 days!
    taxCardDate: '2027-12-01',
    notes: 'تم فحص المخبز وسحب عينات دورية'
  },
  {
    id: 'b-103',
    bakeryOwnerName: 'محمد رفعت الشناوي البقلي',
    machineNumber: '91542033',
    village: 'صفط تراب',
    localUnit: 'شبرا بابل',
    insuranceQuota: 20,
    actualQuota: 20,
    insuranceValue: 16000,
    loavesCount: 20 * 1350, // 27000
    villagePopulation: 31200,
    perCapitaAverage: (27000 / 31200).toFixed(3),
    beneficiaries2023: 28000,
    avg2023: (27000 / 28000).toFixed(3),
    beneficiaries2024: 29500,
    avg2024: (27000 / 29500).toFixed(3),
    beneficiaries2025: 30800,
    avg2025: (27000 / 30800).toFixed(3),
    avgDiff: ((27000 / 30800) - (27000 / 28000)).toFixed(3),
    activityStatus: 'شغال',
    breadType: 'بلدي مدعم ماو',
    breadTypeCount: 1,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    phone: '01234567891',
    nationalId: '29011151602345',
    commercialRegDate: '2028-02-20',
    bakeryLicenseDate: '2027-05-15',
    leaseAgreementDate: '2029-01-01',
    taxCardDate: '2026-11-20', // Expiring in 14 days!
    notes: 'خط إنتاج حديث مطابق للاشتراطات البيئية'
  },
  {
    id: 'b-104',
    bakeryOwnerName: 'سامي عبدالمجيد أبو حمر',
    machineNumber: '62491870',
    village: 'دمرو',
    localUnit: 'دمرو الرئيسية',
    insuranceQuota: 22,
    actualQuota: 22,
    insuranceValue: 17200,
    loavesCount: 22 * 1350, // 29700
    villagePopulation: 33400,
    perCapitaAverage: (29700 / 33400).toFixed(3),
    beneficiaries2023: 29800,
    avg2023: (29700 / 29800).toFixed(3),
    beneficiaries2024: 31200,
    avg2024: (29700 / 31200).toFixed(3),
    beneficiaries2025: 32900,
    avg2025: (29700 / 32900).toFixed(3),
    avgDiff: ((29700 / 32900) - (29700 / 29800)).toFixed(3),
    activityStatus: 'شغال',
    breadType: 'بلدي مجر',
    breadTypeCount: 1,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    phone: '01512345678',
    nationalId: '28304101600982',
    commercialRegDate: '2027-11-10',
    bakeryLicenseDate: '2028-06-12',
    leaseAgreementDate: '2027-03-15',
    taxCardDate: '2028-08-14',
    notes: 'تغطية مستمرة لحصة القرية والوحدات المجاورة'
  },
  {
    id: 'b-105',
    bakeryOwnerName: 'طارق مسعد الجوهري خضر',
    machineNumber: '88214309',
    village: 'العامرية',
    localUnit: 'الدواخلية',
    insuranceQuota: 16,
    actualQuota: 16,
    insuranceValue: 12500,
    loavesCount: 16 * 1350, // 21600
    villagePopulation: 25800,
    perCapitaAverage: (21600 / 25800).toFixed(3),
    beneficiaries2023: 23000,
    avg2023: (21600 / 23000).toFixed(3),
    beneficiaries2024: 24200,
    avg2024: (21600 / 24200).toFixed(3),
    beneficiaries2025: 25100,
    avg2025: (21600 / 25100).toFixed(3),
    avgDiff: ((21600 / 25100) - (21600 / 23000)).toFixed(3),
    activityStatus: 'شغال',
    breadType: 'بلدي مدعم ماو',
    breadTypeCount: 1,
    lineType: 'آلي كامل',
    fuelType: 'سولار',
    phone: '01098765432',
    nationalId: '28712051601934',
    commercialRegDate: '2027-10-05',
    bakeryLicenseDate: '2026-11-05', // Expired yesterday!
    leaseAgreementDate: '2028-04-18',
    taxCardDate: '2027-09-22',
    notes: 'رخصة المخبز تحتاج إلى تجديد عاجل'
  }
];

export const INITIAL_DEBTS: DebtRecord[] = [
  {
    id: 'd-201',
    bakeryId: 'b-102',
    bakeryOwnerName: 'إبراهيم علي عبدالفتاح رضوان',
    machineNumber: '76319842',
    village: 'محلة حسن',
    localUnit: 'محلة حسن الرئيسية',
    violationDate: '2026-10-15',
    issuingEntity: 'إدارة تموين مركز المحلة الكبرى',
    violationType: 'نقص وزن الرغيف البلدي المدعم',
    violationAmount: 4200,
    oldViolations: 1000,
    totalViolations: 5200,
    violationPaymentDate: '2026-10-25',
    violationReceiptNumber: 'قسيمة 49210',
    violationPaymentMethod: 'كاش',
    paidViolationAmount: 2200,
    remainingViolations: 3000,
    addedAmount: 1500,
    addedPaymentDate: '2026-10-26',
    addedReceiptNumber: 'قسيمة 49211',
    addedPaymentMethod: 'فودافون كاش',
    paidAddedAmount: 500,
    remainingAdded: 1000,
    disposalDate: '2026-10-18',
    disposalBags: 6,
    disposalBagPrice: 950,
    disposalMultiplier: 2,
    disposalValue: 6 * 950 * 2, // 11400
    disposalPaymentDate: '2026-10-28',
    disposalReceiptNumber: 'قسيمة 50114',
    disposalPaymentMethod: 'انستاباي',
    paidDisposalAmount: 5400,
    remainingDisposal: 6000,
    // net = remainingViolations (3000) + remainingDisposal (6000) + remainingAdded (1000) = 10000
    netRemainingDebt: 10000,
    notes: 'تم إخطار صاحب المخبز بإنذار رسمي بسرعة سداد المتبقي'
  },
  {
    id: 'd-202',
    bakeryId: 'b-105',
    bakeryOwnerName: 'طارق مسعد الجوهري خضر',
    machineNumber: '88214309',
    village: 'العامرية',
    localUnit: 'الدواخلية',
    violationDate: '2026-10-02',
    issuingEntity: 'مباحث تموين الغربية',
    violationType: 'إنتاج خبز غير مطابق للمواصفات التموينية',
    violationAmount: 3500,
    oldViolations: 500,
    totalViolations: 4000,
    violationPaymentDate: '2026-10-12',
    violationReceiptNumber: 'قسيمة 48120',
    violationPaymentMethod: 'سداد إلكتروني',
    paidViolationAmount: 4000,
    remainingViolations: 0,
    addedAmount: 0,
    addedPaymentDate: '',
    addedReceiptNumber: '',
    addedPaymentMethod: 'كاش',
    paidAddedAmount: 0,
    remainingAdded: 0,
    disposalDate: '',
    disposalBags: 0,
    disposalBagPrice: 0,
    disposalMultiplier: 1,
    disposalValue: 0,
    disposalPaymentDate: '',
    disposalReceiptNumber: '',
    disposalPaymentMethod: 'كاش',
    paidDisposalAmount: 0,
    remainingDisposal: 0,
    netRemainingDebt: 0,
    notes: 'تم سداد كافة المبالغ المستحقة بالكامل والمخبز خالص المديونية'
  },
  {
    id: 'd-203',
    bakeryId: 'b-101',
    bakeryOwnerName: 'أحمد محمود السعيد حسانين',
    machineNumber: '84920145',
    village: 'بشبيش',
    localUnit: 'بشبيش الرئيسية',
    violationDate: '2026-10-20',
    issuingEntity: 'إدارة تموين مركز المحلة الكبرى',
    violationType: 'تصرف في دقيق بلدي مدعم (شكاير)',
    violationAmount: 12000,
    oldViolations: 4000,
    totalViolations: 16000,
    violationPaymentDate: '',
    violationReceiptNumber: '',
    violationPaymentMethod: 'كاش',
    paidViolationAmount: 0,
    remainingViolations: 16000,
    addedAmount: 0,
    addedPaymentDate: '',
    addedReceiptNumber: '',
    addedPaymentMethod: 'كاش',
    paidAddedAmount: 0,
    remainingAdded: 0,
    disposalDate: '2026-10-20',
    disposalBags: 8,
    disposalBagPrice: 950,
    disposalMultiplier: 2,
    disposalValue: 8 * 950 * 2, // 15200
    disposalPaymentDate: '2026-10-25',
    disposalReceiptNumber: 'قسيمة 51200',
    disposalPaymentMethod: 'كاش',
    paidDisposalAmount: 3200,
    remainingDisposal: 12000,
    // net = 16000 + 12000 = 28000 EGP (> 20,000 EGP!)
    netRemainingDebt: 28000,
    notes: 'مديونية كبرى تتجاوز 20,000 ج.م - مطلوب جدولة دفعات أسبوعية رسمية'
  }
];

export const INITIAL_USERS: AppUser[] = [
  {
    id: 'u-1',
    username: 'admin',
    fullName: 'مدير المنظومة التموينية',
    password: 'admin',
    role: 'admin',
    createdAt: '2026-01-01'
  },
  {
    id: 'u-2',
    username: 'inspector1',
    fullName: 'مفتش أول رقابة تموينية',
    password: '123',
    role: 'inspector',
    createdAt: '2026-02-15'
  }
];
