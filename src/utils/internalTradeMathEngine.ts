export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function round4(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

// ============================================================================
// 1. مؤشرات ومعادلات أداء الحملات التموينية (مع منع القسمة على صفر)
// ============================================================================

/**
 * نسبة المنشآت المخالفة = (عدد المنشآت المخالفة ÷ عدد المنشآت التي تم المرور عليها) × 100
 */
export function calculateCampaignViolationRate(
  violatingEstablishments: number,
  inspectedEstablishments: number
): number {
  const inspected = Number(inspectedEstablishments) || 0;
  const violating = Math.max(0, Number(violatingEstablishments) || 0);
  if (inspected <= 0) return 0;
  return round2((violating / inspected) * 100);
}

/**
 * نسبة الالتزام = (عدد المنشآت الملتزمة ÷ عدد المنشآت التي تم المرور عليها) × 100
 */
export function calculateCampaignComplianceRate(
  compliantEstablishments: number,
  inspectedEstablishments: number
): number {
  const inspected = Number(inspectedEstablishments) || 0;
  const compliant = Math.max(0, Number(compliantEstablishments) || 0);
  if (inspected <= 0) return 0;
  return round2((compliant / inspected) * 100);
}

/**
 * معدل تحرير المحاضر = (عدد المحاضر المحررة ÷ عدد المنشآت التي تم المرور عليها) × 100
 */
export function calculateCampaignReportRate(
  reportsIssued: number,
  inspectedEstablishments: number
): number {
  const inspected = Number(inspectedEstablishments) || 0;
  const reports = Math.max(0, Number(reportsIssued) || 0);
  if (inspected <= 0) return 0;
  return round2((reports / inspected) * 100);
}

// ============================================================================
// 2. معادلات تداول أسطوانات البوتاجاز ومتوسط نصيب الفرد والأسرة (بالأسطوانة)
// ============================================================================

export interface LpgVillageCirculationInput {
  population: number;
  familiesCount: number;
  beneficiariesCount: number;
  prescribedMonthlyQuota: number;
  prescribedDailyQuota?: number;
  actualInboundQty: number;
  actualDisbursedQty: number; // الحصة الفعلية الشهرية بالأسطوانات
  daysInMonth?: number;
}

export interface LpgVillageComputedMetrics {
  prescribedDailyQuota: number;
  remainingQty: number; // الوارد فعلياً - المنصرف فعلياً
  quotaVariance: number; // العجز أو الزيادة = الحصة الفعلية - الحصة المقررة
  executionRatePct: number; // نسبة تنفيذ الحصة = (الفعلية ÷ المقررة) × 100
  quotaExecutionPct: number;
  perCapitaDailyCylinders: number; // الحصة الفعلية اليومية ÷ عدد السكان (أسطوانة/فرد/يوم)
  dailyPerCapitaCylinders: number;
  perCapitaMonthlyCylinders: number; // الحصة الفعلية الشهرية ÷ عدد السكان (أسطوانة/فرد/شهر)
  monthlyPerCapitaCylinders: number;
  perFamilyMonthlyCylinders: number; // الحصة الفعلية الشهرية ÷ عدد الأسر (أسطوانة/أسرة/شهر)
  familyMonthlyShareCylinders: number;
  perCapitaAnnualCylinders: number; // (الحصة الفعلية الشهرية × 12) ÷ عدد السكان (أسطوانة/فرد/سنة)
  annualPerCapitaCylinders: number;
  villageStatusClassification: 'كفاية تامة / فائض' | 'تغطية مستقرة' | 'عجز جزئي' | 'عجز حرج';
  villageStatus: 'مكتفية' | 'تحتاج دعم' | 'تعاني من عجز';
}

export function calculateLpgVillageMetrics(
  input: LpgVillageCirculationInput
): LpgVillageComputedMetrics {
  const pop = Math.max(0, Number(input.population) || 0);
  const families = Math.max(0, Number(input.familiesCount) || 0);
  const prescribedMonthly = Math.max(0, Number(input.prescribedMonthlyQuota) || 0);
  const days = Math.max(1, Number(input.daysInMonth) || 30);
  const prescribedDaily =
    input.prescribedDailyQuota !== undefined && input.prescribedDailyQuota > 0
      ? round2(Number(input.prescribedDailyQuota))
      : round2(prescribedMonthly / days);

  const inbound = Math.max(0, Number(input.actualInboundQty) || 0);
  const actualMonthly = Math.max(0, Number(input.actualDisbursedQty) || 0);
  const actualDaily = actualMonthly / days;

  const remainingQty = round2(Math.max(0, inbound - actualMonthly));
  const quotaVariance = round2(actualMonthly - prescribedMonthly);
  const executionRatePct =
    prescribedMonthly > 0 ? round2((actualMonthly / prescribedMonthly) * 100) : 0;

  const perCapitaMonthlyCylinders = pop > 0 ? round4(actualMonthly / pop) : 0;
  const perCapitaDailyCylinders = pop > 0 ? round4(actualDaily / pop) : 0;
  const perFamilyMonthlyCylinders = families > 0 ? round4(actualMonthly / families) : 0;
  const perCapitaAnnualCylinders = pop > 0 ? round4((actualMonthly * 12) / pop) : 0;

  let villageStatusClassification: LpgVillageComputedMetrics['villageStatusClassification'] =
    'تغطية مستقرة';
  let villageStatus: LpgVillageComputedMetrics['villageStatus'] = 'مكتفية';
  if (executionRatePct >= 100) {
    villageStatusClassification = 'كفاية تامة / فائض';
    villageStatus = 'مكتفية';
  } else if (executionRatePct >= 95) {
    villageStatusClassification = 'تغطية مستقرة';
    villageStatus = 'مكتفية';
  } else if (executionRatePct >= 90) {
    villageStatusClassification = 'عجز جزئي';
    villageStatus = 'تحتاج دعم';
  } else {
    villageStatusClassification = 'عجز حرج';
    villageStatus = 'تعاني من عجز';
  }

  return {
    prescribedDailyQuota: prescribedDaily,
    remainingQty,
    quotaVariance,
    executionRatePct,
    quotaExecutionPct: executionRatePct,
    perCapitaDailyCylinders,
    dailyPerCapitaCylinders: perCapitaDailyCylinders,
    perCapitaMonthlyCylinders,
    monthlyPerCapitaCylinders: perCapitaMonthlyCylinders,
    perFamilyMonthlyCylinders,
    familyMonthlyShareCylinders: perFamilyMonthlyCylinders,
    perCapitaAnnualCylinders,
    annualPerCapitaCylinders: perCapitaAnnualCylinders,
    villageStatusClassification,
    villageStatus,
  };
}

// ============================================================================
// 3. معادلات تداول المواد البترولية ومتوسط نصيب الفرد (باللتر لكل منتج منفصلاً)
// ============================================================================

export interface PetroleumCirculationInput {
  population: number;
  openingBalanceLiters: number;
  inboundLiters: number;
  disbursedLiters: number; // الكمية الفعلية الشهرية باللتر
  prescribedQuotaLiters: number;
  daysInMonth?: number;
}

export interface PetroleumComputedMetrics {
  closingBalanceLiters: number; // الرصيد الافتتاحي + الوارد - المنصرف
  actualQuotaLiters: number; // الكمية الفعلية الشهرية
  perCapitaDailyLiters: number; // الكمية الفعلية الشهرية ÷ عدد أيام الشهر ÷ عدد السكان
  dailyPerCapitaLiters: number;
  perCapitaMonthlyLiters: number; // الكمية الفعلية الشهرية ÷ عدد السكان
  monthlyPerCapitaLiters: number;
  perCapitaAnnualLiters: number; // (الكمية الفعلية الشهرية × 12) ÷ عدد السكان
  annualPerCapitaLiters: number;
  executionRatePct: number; // (الفعلية ÷ المقررة) × 100
  availabilityRatioPct: number;
  quotaVarianceLiters: number; // الفعلية - المقررة
}

export function calculatePetroleumVillageMetrics(
  input: PetroleumCirculationInput
): PetroleumComputedMetrics {
  const pop = Math.max(0, Number(input.population) || 0);
  const opening = Math.max(0, Number(input.openingBalanceLiters) || 0);
  const inbound = Math.max(0, Number(input.inboundLiters) || 0);
  const disbursed = Math.max(0, Number(input.disbursedLiters) || 0);
  const prescribed = Math.max(0, Number(input.prescribedQuotaLiters) || 0);
  const days = Math.max(1, Number(input.daysInMonth) || 30);

  const closingBalanceLiters = round2(opening + inbound - disbursed);
  const actualQuotaLiters = round2(disbursed);
  const perCapitaMonthlyLiters = pop > 0 ? round4(actualQuotaLiters / pop) : 0;
  const perCapitaDailyLiters = pop > 0 ? round4(actualQuotaLiters / days / pop) : 0;
  const perCapitaAnnualLiters = pop > 0 ? round4((actualQuotaLiters * 12) / pop) : 0;
  const executionRatePct =
    prescribed > 0 ? round2((actualQuotaLiters / prescribed) * 100) : 0;
  const quotaVarianceLiters = round2(actualQuotaLiters - prescribed);

  return {
    closingBalanceLiters,
    actualQuotaLiters,
    perCapitaDailyLiters,
    dailyPerCapitaLiters: perCapitaDailyLiters,
    perCapitaMonthlyLiters,
    monthlyPerCapitaLiters: perCapitaMonthlyLiters,
    perCapitaAnnualLiters,
    annualPerCapitaLiters: perCapitaAnnualLiters,
    executionRatePct,
    availabilityRatioPct: executionRatePct,
    quotaVarianceLiters,
  };
}

export interface VillageFuelBreakdownRow {
  village: string;
  localUnit: string;
  population: number;
  perCapitaBenzine80: number;
  gasoline80PerCapitaLiters: number;
  perCapitaBenzine92: number;
  gasoline92PerCapitaLiters: number;
  perCapitaBenzine95: number;
  gasoline95PerCapitaLiters: number;
  perCapitaSolar: number;
  dieselPerCapitaLiters: number;
  perCapitaKerosene: number;
  kerosenePerCapitaLiters: number;
  totalPrescribedLitersAllProducts: number;
  totalActualLitersAllProducts: number;
  totalAllFuelsLiters: number;
  overallCoveragePct: number;
  totalVarianceLiters: number;
}

export function aggregateVillageFuelBreakdown(
  records: {
    village: string;
    localUnit: string;
    population: number;
    fuelType: string;
    prescribedQuotaLiters: number;
    disbursedLiters: number;
  }[]
): VillageFuelBreakdownRow[] {
  const map = new Map<string, VillageFuelBreakdownRow>();
  for (const r of records) {
    if (!r.village || r.population <= 0) continue;
    const key = `${r.village}__${r.localUnit}`;
    let row = map.get(key);
    if (!row) {
      row = {
        village: r.village,
        localUnit: r.localUnit,
        population: r.population,
        perCapitaBenzine80: 0,
        gasoline80PerCapitaLiters: 0,
        perCapitaBenzine92: 0,
        gasoline92PerCapitaLiters: 0,
        perCapitaBenzine95: 0,
        gasoline95PerCapitaLiters: 0,
        perCapitaSolar: 0,
        dieselPerCapitaLiters: 0,
        perCapitaKerosene: 0,
        kerosenePerCapitaLiters: 0,
        totalPrescribedLitersAllProducts: 0,
        totalActualLitersAllProducts: 0,
        totalAllFuelsLiters: 0,
        overallCoveragePct: 0,
        totalVarianceLiters: 0,
      };
      map.set(key, row);
    }
    const perCapita = r.population > 0 ? round4(r.disbursedLiters / r.population) : 0;
    if (r.fuelType.includes('80')) {
      row.perCapitaBenzine80 = round4(row.perCapitaBenzine80 + perCapita);
      row.gasoline80PerCapitaLiters = row.perCapitaBenzine80;
    } else if (r.fuelType.includes('92')) {
      row.perCapitaBenzine92 = round4(row.perCapitaBenzine92 + perCapita);
      row.gasoline92PerCapitaLiters = row.perCapitaBenzine92;
    } else if (r.fuelType.includes('95')) {
      row.perCapitaBenzine95 = round4(row.perCapitaBenzine95 + perCapita);
      row.gasoline95PerCapitaLiters = row.perCapitaBenzine95;
    } else if (r.fuelType.includes('سولار') || r.fuelType.includes('السولار')) {
      row.perCapitaSolar = round4(row.perCapitaSolar + perCapita);
      row.dieselPerCapitaLiters = row.perCapitaSolar;
    } else if (r.fuelType.includes('كيروسين') || r.fuelType.includes('الكيروسين')) {
      row.perCapitaKerosene = round4(row.perCapitaKerosene + perCapita);
      row.kerosenePerCapitaLiters = row.perCapitaKerosene;
    }

    row.totalPrescribedLitersAllProducts = round2(
      row.totalPrescribedLitersAllProducts + (Number(r.prescribedQuotaLiters) || 0)
    );
    row.totalActualLitersAllProducts = round2(
      row.totalActualLitersAllProducts + (Number(r.disbursedLiters) || 0)
    );
    row.totalAllFuelsLiters = row.totalActualLitersAllProducts;
  }

  for (const row of map.values()) {
    row.overallCoveragePct =
      row.totalPrescribedLitersAllProducts > 0
        ? round2((row.totalActualLitersAllProducts / row.totalPrescribedLitersAllProducts) * 100)
        : 0;
    row.totalVarianceLiters = round2(
      row.totalActualLitersAllProducts - row.totalPrescribedLitersAllProducts
    );
  }

  return Array.from(map.values());
}

// ============================================================================
// 4. محرك مقارنة التحديثات الشهرية لقاعدة بيانات التجار التموينيين (116 تاجراً)
// ============================================================================

export interface MerchantArchiveItemSnapshot {
  id?: string;
  traderCode: string;
  posMachineNumber: string;
  merchantName: string;
  nationalId: string;
  phone: string;
  detailedAddress: string;
  cashInsuranceAmount: number;
  activityStatus: string;
  commercialRegNumber?: string;
  taxCardNumber?: string;
  licenseNumber?: string;
  licenseExpiryDate?: string;
  taxCardExpiryDate?: string;
  commercialRegExpiryDate?: string;
}

export interface MerchantMonthlyDiffResult {
  newMerchants: MerchantArchiveItemSnapshot[];
  stoppedMerchants: { prev: MerchantArchiveItemSnapshot; curr: MerchantArchiveItemSnapshot }[];
  insuranceChanged: { prev: MerchantArchiveItemSnapshot; curr: MerchantArchiveItemSnapshot; diff: number }[];
  posOrCodeChanged: { prev: MerchantArchiveItemSnapshot; curr: MerchantArchiveItemSnapshot }[];
  dataModified: { prev: MerchantArchiveItemSnapshot; curr: MerchantArchiveItemSnapshot; changedFields: string[] }[];
}

export function compareMerchantArchiveSnapshots(
  previousList: MerchantArchiveItemSnapshot[],
  incomingList: MerchantArchiveItemSnapshot[]
): MerchantMonthlyDiffResult {
  const prevByCode = new Map<string, MerchantArchiveItemSnapshot>();
  const prevByPos = new Map<string, MerchantArchiveItemSnapshot>();
  const prevByNid = new Map<string, MerchantArchiveItemSnapshot>();
  const prevByName = new Map<string, MerchantArchiveItemSnapshot>();

  for (const p of previousList) {
    if (p.traderCode?.trim()) prevByCode.set(p.traderCode.trim(), p);
    if (p.posMachineNumber?.trim()) prevByPos.set(p.posMachineNumber.trim(), p);
    if (p.nationalId?.trim()) prevByNid.set(p.nationalId.trim(), p);
    if (p.merchantName?.trim()) prevByName.set(p.merchantName.trim(), p);
  }

  const matchedPrevSet = new Set<MerchantArchiveItemSnapshot>();

  const newMerchants: MerchantArchiveItemSnapshot[] = [];
  const stoppedMerchants: MerchantMonthlyDiffResult['stoppedMerchants'] = [];
  const insuranceChanged: MerchantMonthlyDiffResult['insuranceChanged'] = [];
  const posOrCodeChanged: MerchantMonthlyDiffResult['posOrCodeChanged'] = [];
  const dataModified: MerchantMonthlyDiffResult['dataModified'] = [];

  for (const curr of incomingList) {
    const prev =
      (curr.traderCode?.trim() ? prevByCode.get(curr.traderCode.trim()) : undefined) ||
      (curr.posMachineNumber?.trim() ? prevByPos.get(curr.posMachineNumber.trim()) : undefined) ||
      (curr.nationalId?.trim() ? prevByNid.get(curr.nationalId.trim()) : undefined) ||
      (curr.merchantName?.trim() ? prevByName.get(curr.merchantName.trim()) : undefined);

    if (!prev) {
      newMerchants.push(curr);
      continue;
    }

    matchedPrevSet.add(prev);

    const changedFields: string[] = [];
    if (
      prev.activityStatus !== 'متوقف' &&
      prev.activityStatus !== 'موقوف' &&
      (curr.activityStatus === 'متوقف' || curr.activityStatus === 'موقوف')
    ) {
      stoppedMerchants.push({ prev, curr });
      changedFields.push('حالة التاجر (تم الإيقاف)');
    } else if (prev.activityStatus !== curr.activityStatus) {
      changedFields.push('حالة التاجر');
    }

    const insDiff = round2(
      (Number(curr.cashInsuranceAmount) || 0) - (Number(prev.cashInsuranceAmount) || 0)
    );
    if (Math.abs(insDiff) > 0.01) {
      insuranceChanged.push({ prev, curr, diff: insDiff });
      changedFields.push('مبلغ التأمين');
    }

    if (prev.posMachineNumber !== curr.posMachineNumber || prev.traderCode !== curr.traderCode) {
      posOrCodeChanged.push({ prev, curr });
      if (prev.traderCode !== curr.traderCode) changedFields.push('كود التاجر');
      if (prev.posMachineNumber !== curr.posMachineNumber) changedFields.push('رقم الماكينة');
    }

    if (prev.phone !== curr.phone) changedFields.push('رقم التليفون');
    if (prev.detailedAddress !== curr.detailedAddress) changedFields.push('العنوان التفصيلي');
    if (prev.nationalId !== curr.nationalId) changedFields.push('الرقم القومي');
    if ((prev.commercialRegNumber || '') !== (curr.commercialRegNumber || ''))
      changedFields.push('السجل التجاري');
    if ((prev.licenseNumber || '') !== (curr.licenseNumber || ''))
      changedFields.push('رقم الترخيص');
    if ((prev.taxCardNumber || '') !== (curr.taxCardNumber || ''))
      changedFields.push('البطاقة الضريبية');
    if ((prev.licenseExpiryDate || '') !== (curr.licenseExpiryDate || ''))
      changedFields.push('تاريخ انتهاء الرخصة');
    if ((prev.taxCardExpiryDate || '') !== (curr.taxCardExpiryDate || ''))
      changedFields.push('تاريخ انتهاء البطاقة الضريبية');
    if ((prev.commercialRegExpiryDate || '') !== (curr.commercialRegExpiryDate || ''))
      changedFields.push('تاريخ انتهاء السجل التجاري');

    if (changedFields.length > 0) {
      dataModified.push({ prev, curr, changedFields });
    }
  }

  // أي تاجر كان بالنسخة السابقة ولم يظهر في النسخة الجديدة يُسجّل ضمن المتوقفين / المستبعدين
  for (const prev of previousList) {
    if (!matchedPrevSet.has(prev)) {
      const removedCurr: MerchantArchiveItemSnapshot = {
        ...prev,
        activityStatus: 'متوقف (مستبعد بالكشف الجديد)',
      };
      stoppedMerchants.push({ prev, curr: removedCurr });
      dataModified.push({
        prev,
        curr: removedCurr,
        changedFields: ['حالة التاجر (استبعاد من النسخة الجديدة)'],
      });
    }
  }

  return {
    newMerchants,
    stoppedMerchants,
    insuranceChanged,
    posOrCodeChanged,
    dataModified,
  };
}

