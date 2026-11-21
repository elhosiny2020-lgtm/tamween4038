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
  gasoline80Liters: number;
  perCapitaBenzine80: number;
  gasoline80PerCapitaLiters: number;
  gasoline92Liters: number;
  perCapitaBenzine92: number;
  gasoline92PerCapitaLiters: number;
  gasoline95Liters: number;
  perCapitaBenzine95: number;
  gasoline95PerCapitaLiters: number;
  dieselLiters: number;
  perCapitaSolar: number;
  dieselPerCapitaLiters: number;
  keroseneLiters: number;
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
        gasoline80Liters: 0,
        perCapitaBenzine80: 0,
        gasoline80PerCapitaLiters: 0,
        gasoline92Liters: 0,
        perCapitaBenzine92: 0,
        gasoline92PerCapitaLiters: 0,
        gasoline95Liters: 0,
        perCapitaBenzine95: 0,
        gasoline95PerCapitaLiters: 0,
        dieselLiters: 0,
        perCapitaSolar: 0,
        dieselPerCapitaLiters: 0,
        keroseneLiters: 0,
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
    const disbursedAmount = Number(r.disbursedLiters) || 0;
    if (r.fuelType.includes('80')) {
      row.gasoline80Liters = round2(row.gasoline80Liters + disbursedAmount);
      row.perCapitaBenzine80 = round4(row.perCapitaBenzine80 + perCapita);
      row.gasoline80PerCapitaLiters = row.perCapitaBenzine80;
    } else if (r.fuelType.includes('92')) {
      row.gasoline92Liters = round2(row.gasoline92Liters + disbursedAmount);
      row.perCapitaBenzine92 = round4(row.perCapitaBenzine92 + perCapita);
      row.gasoline92PerCapitaLiters = row.perCapitaBenzine92;
    } else if (r.fuelType.includes('95')) {
      row.gasoline95Liters = round2(row.gasoline95Liters + disbursedAmount);
      row.perCapitaBenzine95 = round4(row.perCapitaBenzine95 + perCapita);
      row.gasoline95PerCapitaLiters = row.perCapitaBenzine95;
    } else if (r.fuelType.includes('سولار') || r.fuelType.includes('السولار')) {
      row.dieselLiters = round2(row.dieselLiters + disbursedAmount);
      row.perCapitaSolar = round4(row.perCapitaSolar + perCapita);
      row.dieselPerCapitaLiters = row.perCapitaSolar;
    } else if (r.fuelType.includes('كيروسين') || r.fuelType.includes('الكيروسين')) {
      row.keroseneLiters = round2(row.keroseneLiters + disbursedAmount);
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

// ============================================================================
// 5. حركات البوتاجاز والمواد البترولية (الرصيد التراكمي التلقائي + منع التكرار)
// ============================================================================

export interface LedgerMovementInput {
  id: string;
  entityCode: string;
  date: string;
  movementType: 'وارد' | 'استلام وارد' | 'منصرف' | 'صرف ومبيعات' | 'توزيع' | 'جرد فعلي' | string;
  quantity: number;
  invoiceOrDocNumber?: string;
}

export interface ComputedLedgerMovementRow<T extends LedgerMovementInput> {
  movement: T;
  balanceBefore: number;
  balanceAfter: number;
  signedDelta: number;
}

export function computeMovementLedgerBalances<T extends LedgerMovementInput>(
  openingBalance: number,
  movements: readonly T[]
): {
  rows: ComputedLedgerMovementRow<T>[];
  closingBalance: number;
  totalInbound: number;
  totalOutbound: number;
} {
  let running = round2(Math.max(0, Number(openingBalance) || 0));
  let totalInbound = 0;
  let totalOutbound = 0;

  // Chronological order (oldest -> newest) for true running ledger math
  const chronological = [...movements].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const rows: ComputedLedgerMovementRow<T>[] = [];

  for (const m of chronological) {
    const qty = Math.max(0, Number(m.quantity) || 0);
    const type = String(m.movementType || '');
    const before = running;
    let delta = 0;
    if (type.includes('وارد') || type.includes('استلام')) {
      delta = qty;
      totalInbound = round2(totalInbound + qty);
      running = round2(before + qty);
    } else if (type.includes('منصرف') || type.includes('صرف') || type.includes('توزيع') || type.includes('مبيعات')) {
      delta = -qty;
      totalOutbound = round2(totalOutbound + qty);
      running = round2(before - qty);
    } else if (type.includes('جرد')) {
      delta = round2(qty - before);
      running = round2(qty);
    }
    rows.push({
      movement: m,
      balanceBefore: before,
      balanceAfter: running,
      signedDelta: delta,
    });
  }

  return {
    rows: rows.reverse(), // newest first for UI display
    closingBalance: running,
    totalInbound,
    totalOutbound,
  };
}

export function detectDuplicateMovement(
  existingMovements: readonly LedgerMovementInput[],
  candidate: LedgerMovementInput
): { isDuplicate: boolean; reason?: string } {
  const normDoc = String(candidate.invoiceOrDocNumber || '').trim().toLowerCase();
  const normCode = String(candidate.entityCode || '').trim().toLowerCase();
  const normDate = String(candidate.date || '').trim();
  const normType = String(candidate.movementType || '').trim();
  const qty = Number(candidate.quantity) || 0;

  for (const ex of existingMovements) {
    if (ex.id && candidate.id && ex.id === candidate.id) continue;
    const exCode = String(ex.entityCode || '').trim().toLowerCase();
    const exDoc = String(ex.invoiceOrDocNumber || '').trim().toLowerCase();
    const exDate = String(ex.date || '').trim();
    const exType = String(ex.movementType || '').trim();
    const exQty = Number(ex.quantity) || 0;

    if (normDoc && exDoc === normDoc && exCode === normCode && exType === normType) {
      return {
        isDuplicate: true,
        reason: `يوجد حركة مسجلة مسبقاً بنفس رقم المستند/الفاتورة (${candidate.invoiceOrDocNumber}) لنفس الجهة ونفس نوع الحركة.`,
      };
    }
    if (exCode === normCode && exDate === normDate && exType === normType && exQty === qty && qty > 0) {
      return {
        isDuplicate: true,
        reason: `حركة مطابقة مسجلة لنفس الجهة بتاريخ ${normDate} وبنفس الكمية (${qty}). منعاً للتكرار، يرجى مراجعة الرقم المرجعي.`,
      };
    }
  }
  return { isDuplicate: false };
}

// ============================================================================
// 6. مؤشرات لوحة التحكم والرسوم البيانية الموحدة لقسم التجارة الداخلية (14 مؤشر)
// ============================================================================

export interface InternalTradeExecutiveDashboardStats {
  totalEstablishments: number;
  inspectedEstablishments: number;
  completedCampaigns: number;
  activeCampaigns: number;
  totalViolations: number;
  followUpViolations: number;
  reconciledViolations: number;
  totalComplaints: number;
  openComplaints: number;
  resolvedComplaints: number;
  lpgViolationsCount: number;
  petroleumViolationsCount: number;
  violatingEstablishmentsCount: number;
  repeatOffenderEstablishmentsCount: number;
  topRepeatOffenders: { establishmentCode: string; establishmentName: string; village: string; count: number }[];
  activeEstablishments: number;
  closedOrStopped: number;
  totalSeizures: number;
  totalSeizuresValue: number;
  totalCollectedFines: number;
  totalDisbursedCylinders: number;
  overallMonthlyPerCapitaCyl: number;
  overallFamilyShareCyl: number;
}

export function computeInternalTradeExecutiveDashboardStats(params: {
  establishments: readonly { establishmentCode: string; establishmentName: string; establishmentType: string; village: string; activityStatus: string }[];
  campaigns: readonly { id: string; finalReportSubmitted?: boolean; inspectedCount?: number; visitedEstablishmentCodes?: string[] }[];
  violations: readonly { establishmentCode: string; establishmentName: string; village: string; violationType: string; status: string; reconciliationAmount?: number }[];
  seizures: readonly { totalValue?: number }[];
  complaints: readonly { status: string }[];
  lpgVillageCirculation: readonly { population: number; familiesCount: number; actualDisbursedQty: number }[];
}): InternalTradeExecutiveDashboardStats {
  const { establishments, campaigns, violations, seizures, complaints, lpgVillageCirculation } = params;

  const totalEstablishments = establishments.length;
  const activeEstablishments = establishments.filter((e) => e.activityStatus === 'نشط').length;
  const closedOrStopped = establishments.filter((e) => e.activityStatus === 'مغلق' || e.activityStatus === 'متوقف').length;

  const visitedSet = new Set<string>();
  campaigns.forEach((c) => {
    (c.visitedEstablishmentCodes || []).forEach((code) => {
      if (code) visitedSet.add(code);
    });
  });
  violations.forEach((v) => {
    if (v.establishmentCode) visitedSet.add(v.establishmentCode);
  });
  const campaignInspectedSum = campaigns.reduce((s, c) => s + (Number(c.inspectedCount) || 0), 0);
  const inspectedEstablishments = Math.max(visitedSet.size, Math.min(totalEstablishments, campaignInspectedSum));

  const completedCampaigns = campaigns.filter((c) => Boolean(c.finalReportSubmitted)).length;
  const activeCampaigns = campaigns.length - completedCampaigns;

  const totalViolations = violations.length;
  const reconciledViolations = violations.filter(
    (v) => v.status === 'تم التصالح' || v.status === 'مغلق' || v.status === 'محفوظ'
  ).length;
  const followUpViolations = totalViolations - reconciledViolations;

  const totalComplaints = complaints.length;
  const resolvedComplaints = complaints.filter(
    (c) => c.status === 'تم الفحص والحل' || c.status === 'مغلقة'
  ).length;
  const openComplaints = totalComplaints - resolvedComplaints;

  const estTypeByCode = new Map<string, string>();
  establishments.forEach((e) => estTypeByCode.set(e.establishmentCode, e.establishmentType || ''));

  const isLpgViolation = (v: { establishmentCode: string; violationType: string }) => {
    const estType = estTypeByCode.get(v.establishmentCode) || '';
    const text = `${v.violationType} ${estType}`;
    return text.includes('بوتاجاز') || text.includes('أسطوان');
  };

  const isPetroViolation = (v: { establishmentCode: string; violationType: string }) => {
    const estType = estTypeByCode.get(v.establishmentCode) || '';
    const text = `${v.violationType} ${estType}`;
    return text.includes('بترول') || text.includes('وقود') || text.includes('بنزين') || text.includes('سولار') || text.includes('محطة');
  };

  const lpgViolationsCount = violations.filter(isLpgViolation).length;
  const petroleumViolationsCount = violations.filter(isPetroViolation).length;

  const violatorsMap = new Map<string, { establishmentCode: string; establishmentName: string; village: string; count: number }>();
  for (const v of violations) {
    const key = v.establishmentCode || v.establishmentName;
    if (!key) continue;
    const prev = violatorsMap.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      violatorsMap.set(key, {
        establishmentCode: v.establishmentCode || key,
        establishmentName: v.establishmentName || key,
        village: v.village || '',
        count: 1,
      });
    }
  }
  const allViolators = Array.from(violatorsMap.values()).sort((a, b) => b.count - a.count);
  const violatingEstablishmentsCount = allViolators.length;
  const topRepeatOffenders = allViolators.filter((x) => x.count >= 2);
  const repeatOffenderEstablishmentsCount = topRepeatOffenders.length;

  const totalSeizures = seizures.length;
  const totalSeizuresValue = seizures.reduce((sum, s) => sum + (Number(s.totalValue) || 0), 0);
  const totalCollectedFines = violations.reduce((sum, v) => sum + (Number(v.reconciliationAmount) || 0), 0);

  const totalPopulationLpg = lpgVillageCirculation.reduce((s, r) => s + (Number(r.population) || 0), 0);
  const totalFamiliesLpg = lpgVillageCirculation.reduce((s, r) => s + (Number(r.familiesCount) || 0), 0);
  const totalDisbursedCylinders = lpgVillageCirculation.reduce((s, r) => s + (Number(r.actualDisbursedQty) || 0), 0);
  const overallMonthlyPerCapitaCyl =
    totalPopulationLpg > 0 ? round4(totalDisbursedCylinders / totalPopulationLpg) : 0;
  const overallFamilyShareCyl =
    totalFamiliesLpg > 0 ? round2(totalDisbursedCylinders / totalFamiliesLpg) : 0;

  return {
    totalEstablishments,
    inspectedEstablishments,
    completedCampaigns,
    activeCampaigns,
    totalViolations,
    followUpViolations,
    reconciledViolations,
    totalComplaints,
    openComplaints,
    resolvedComplaints,
    lpgViolationsCount,
    petroleumViolationsCount,
    violatingEstablishmentsCount,
    repeatOffenderEstablishmentsCount,
    topRepeatOffenders: topRepeatOffenders.length > 0 ? topRepeatOffenders : allViolators.slice(0, 5),
    activeEstablishments,
    closedOrStopped,
    totalSeizures,
    totalSeizuresValue,
    totalCollectedFines,
    totalDisbursedCylinders,
    overallMonthlyPerCapitaCyl,
    overallFamilyShareCyl,
  };
}


