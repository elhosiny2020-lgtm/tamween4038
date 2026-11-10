import { Bakery, DebtRecord, DailyBakeryTask, TaskPriority } from '../types';

/**
 * المعامل التمويني المعتمد لاحتساب عدد الأرغفة من المبلغ التأميني:
 * عدد الأرغفة = المبلغ التأميني ÷ (235 ÷ 3)
 */
export const APPROVED_INSURANCE_DIVISOR = 235 / 3;

/**
 * دالة الاختبار الشاملة والتدقيق البرمجي لكافة المعادلات التموينية والحسابية
 */
export interface MathAuditResult {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  details: {
    checkName: string;
    expected: number | string;
    actual: number | string;
    status: 'PASS' | 'FAIL';
    description: string;
  }[];
}

export interface EquationChangeLogItem {
  recordType: 'bakery' | 'debt';
  recordId: string;
  recordName: string;
  field: string;
  oldValue: string | number;
  newValue: string | number;
}

export interface BakeryAnnualComparisonRow {
  bakeryId: string;
  bakeryOwnerName: string;
  machineNumber: string;
  village: string;
  localUnit: string;
  insuranceValue: number;
  insuranceQuota: number;
  loavesCount: number;
  villagePopulation: number;
  perCapitaAverage: string;
  beneficiaries2023: number;
  avg2023: string;
  beneficiaries2024: number;
  avg2024: string;
  beneficiaries2025: number;
  avg2025: string;
  diff2024vs2023: string;
  diff2025vs2024: string;
  diff2025vs2023: string;
  varianceFromGeneral2023: string;
  varianceFromGeneral2024: string;
  varianceFromGeneral2025: string;
}

export interface YearSummaryMetrics {
  year: 2023 | 2024 | 2025;
  activeBakeriesCount: number;
  totalLoaves: number;
  totalBeneficiaries: number;
  weightedGeneralAverage: string;
  simpleArithmeticAverage: string;
  diffFromPreviousYear: string;
}

export interface AnnualWeightedReport {
  rows: BakeryAnnualComparisonRow[];
  year2023: YearSummaryMetrics;
  year2024: YearSummaryMetrics;
  year2025: YearSummaryMetrics;
  totalBakeries: number;
  totalInsuranceValue: number;
  totalInsuranceQuota: number;
  totalLoavesAll: number;
  totalLoaves: number;
  totalVillagePopulation: number;
  weightedPopulationPerCapita: string;
  weightedPerCapitaVillage: string;
  totalBeneficiaries2023: number;
  weightedGeneralAvg2023: string;
  weightedAvg2023: string;
  simpleArithmeticAvg2023: string;
  totalBeneficiaries2024: number;
  weightedGeneralAvg2024: string;
  weightedAvg2024: string;
  simpleArithmeticAvg2024: string;
  totalBeneficiaries2025: number;
  weightedGeneralAvg2025: string;
  weightedAvg2025: string;
  simpleArithmeticAvg2025: string;
  weightedDiff2024vs2023: string;
  weightedDiff2025vs2024: string;
  weightedDiff2025vs2023: string;
  cumulativeWeightedDiff2025vs2023: string;
}

/**
 * 1-أ. احتساب عدد الأرغفة الخام (بدون أي تقريب في المراحل الوسيطة) من المبلغ التأميني
 * المعادلة المعتمدة: عدد الأرغفة = المبلغ التأميني ÷ (235 ÷ 3) = (المبلغ التأميني × 3) ÷ 235
 */
export function calculateRawLoavesFromInsuranceValue(insuranceValue: number): number {
  const val = Number(insuranceValue) || 0;
  if (val <= 0) return 0;
  return (val * 3) / 235;
}

/**
 * 1-ب. احتساب عدد الأرغفة المعتمد من المبلغ التأميني (تطبيق قاعدة التقريب النهائية فقط)
 * المعادلة المعتمدة: عدد الأرغفة = المبلغ التأميني ÷ (235 ÷ 3)
 */
export function calculateLoavesFromInsuranceValue(insuranceValue: number): number {
  const raw = calculateRawLoavesFromInsuranceValue(insuranceValue);
  return Math.round(raw);
}

/**
 * 1-ج. احتساب عدد الأرغفة من الحصة التأمينية بالشكاير (معادلة رديفة عند عدم إدخال المبلغ التأميني)
 */
export function calculateLoavesCount(insuranceQuota: number): number {
  return Math.round(Number(insuranceQuota || 0) * 1350);
}

/**
 * 2. متوسط نصيب الفرد من المخبز الواحد = عدد الأرغفة ÷ عدد السكان/المستفيدين (علامة عشرية ورقمين فقط)
 */
export function calculatePerCapitaAverage(loavesCount: number, villagePopulation: number): string {
  if (!villagePopulation || villagePopulation <= 0) return '0.00';
  return (Number(loavesCount || 0) / Number(villagePopulation)).toFixed(2);
}

/**
 * 3. متوسط المستفيدين لعام محدد بشكل مستقل = عدد الأرغفة ÷ عدد المستفيدين المعتمد للسنة (علامة عشرية ورقمين فقط)
 */
export function calculateYearlyAverage(loavesCount: number, beneficiariesCount: number): string {
  if (!beneficiariesCount || beneficiariesCount <= 0) return '0.00';
  return (Number(loavesCount || 0) / Number(beneficiariesCount)).toFixed(2);
}

/**
 * 4. الفرق بين سنتين (بدون تقريب وسيط عند توفر القيم الخام، أو طرح المتوسطين المعتمدين بعلامة عشرية ورقمين فقط)
 */
export function calculateAverageDifference(avgNew: string, avgOld: string): string {
  const vNew = parseFloat(avgNew) || 0;
  const vOld = parseFloat(avgOld) || 0;
  return (vNew - vOld).toFixed(2);
}

/**
 * دالة مساعدة لتنسيق التواريخ بالمنظومة إلى صيغة (يوم/شهر/سنة DD/MM/YYYY)
 */
export function formatDateDDMMYYYY(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return trimmed;
}

/**
 * 5. حساب مديونية المحضر/المخالفة = قيمة المخالفة + مخالفات قديمة - المسدد
 */
export function calculateRemainingViolations(
  violationAmount: number,
  oldViolations: number,
  paidViolationAmount: number
): { totalViolations: number; remainingViolations: number } {
  const totalViolations = (Number(violationAmount) || 0) + (Number(oldViolations) || 0);
  const remainingViolations = Math.max(0, totalViolations - (Number(paidViolationAmount) || 0));
  return { totalViolations, remainingViolations };
}

/**
 * 6. حساب مديونية المنصرف/المضاف = المضاف - المسدد
 */
export function calculateRemainingAdded(addedAmount: number, paidAddedAmount: number): number {
  return Math.max(0, (Number(addedAmount) || 0) - (Number(paidAddedAmount) || 0));
}

/**
 * 7. حساب قيمة التصرف في الدقيق = عدد الشكاير × سعر الشيكارة × مضاعف العقوبة
 */
export function calculateDisposalValue(
  bags: number,
  pricePerBag: number,
  multiplier: number = 1
): number {
  return (Number(bags) || 0) * (Number(pricePerBag) || 0) * (Number(multiplier) || 1);
}

/**
 * 8. حساب المتبقي من التصرف = قيمة التصرف - المسدد
 */
export function calculateRemainingDisposal(disposalValue: number, paidDisposal: number): number {
  return Math.max(0, (Number(disposalValue) || 0) - (Number(paidDisposal) || 0));
}

/**
 * 9. صافي المديونية الإجمالية على المخبز
 * = المتبقي من المخالفات + المتبقي من المضاف + المتبقي من التصرف
 */
export function calculateNetRemainingDebt(
  remainingViolations: number,
  remainingAdded: number,
  remainingDisposal: number
): number {
  return (
    (Number(remainingViolations) || 0) +
    (Number(remainingAdded) || 0) +
    (Number(remainingDisposal) || 0)
  );
}

/**
 * 9-ب. تطبيع وإعادة احتساب كافة المعادلات التموينية للمخبز بدقة
 * - عدد الأرغفة = المبلغ التأميني ÷ (235 ÷ 3) (عند وجود مبلغ تأميني > 0، مع عدم التقريب في المراحل الوسيطة)
 * - احتساب متوسط نصيب الفرد للمخبز بصورة مستقلة
 * - احتساب متوسط نصيب الفرد لكل سنة (2023، 2024، 2025) بصورة مستقلة تماماً
 */
export function normalizeBakeryCalculations(b: Bakery): Bakery {
  const insuranceQuota = Number(b.insuranceQuota) || 0;
  const actualQuota = Number(b.actualQuota) || 0;
  const insuranceValue = Number(b.insuranceValue) || 0;

  // القاعدة المعتمدة: عدد الأرغفة = المبلغ التأميني ÷ (235 ÷ 3)
  // إذا كان المبلغ التأميني مدخلاً (> 0) يتم الاحتساب منه مباشرة بدون تقريب وسيط ثم التقريب النهائي
  const loavesCount =
    insuranceValue > 0
      ? calculateLoavesFromInsuranceValue(insuranceValue)
      : insuranceQuota > 0
      ? calculateLoavesCount(insuranceQuota)
      : Math.round(Number(b.loavesCount) || 0);

  const villagePopulation = Number(b.villagePopulation) || 0;
  const beneficiaries2023 = Number(b.beneficiaries2023) || 0;
  const beneficiaries2024 = Number(b.beneficiaries2024) || 0;
  const beneficiaries2025 = Number(b.beneficiaries2025) || 0;

  const perCapitaAverage =
    villagePopulation > 0
      ? calculatePerCapitaAverage(loavesCount, villagePopulation)
      : !isNaN(parseFloat(String(b.perCapitaAverage ?? '')))
      ? parseFloat(String(b.perCapitaAverage)).toFixed(2)
      : '0.00';

  const avg2023 =
    beneficiaries2023 > 0
      ? calculateYearlyAverage(loavesCount, beneficiaries2023)
      : !isNaN(parseFloat(String(b.avg2023 ?? '')))
      ? parseFloat(String(b.avg2023)).toFixed(2)
      : '0.00';

  const avg2024 =
    beneficiaries2024 > 0
      ? calculateYearlyAverage(loavesCount, beneficiaries2024)
      : !isNaN(parseFloat(String(b.avg2024 ?? '')))
      ? parseFloat(String(b.avg2024)).toFixed(2)
      : '0.00';

  const avg2025 =
    beneficiaries2025 > 0
      ? calculateYearlyAverage(loavesCount, beneficiaries2025)
      : !isNaN(parseFloat(String(b.avg2025 ?? '')))
      ? parseFloat(String(b.avg2025)).toFixed(2)
      : '0.00';

  const avgDiff = calculateAverageDifference(avg2025, avg2023);

  return {
    ...b,
    insuranceQuota,
    actualQuota,
    insuranceValue,
    loavesCount,
    villagePopulation,
    beneficiaries2023,
    beneficiaries2024,
    beneficiaries2025,
    perCapitaAverage,
    avg2023,
    avg2024,
    avg2025,
    avgDiff,
    bakeryCategory: b.bakeryCategory || 'مخبز بلدي مدعم',
    flourBagPrice: b.flourBagPrice !== undefined && b.flourBagPrice !== null ? Number(b.flourBagPrice) : 950,
  };
}

/**
 * 9-ج. تطبيع وإعادة احتساب معادلات قيد المديونية وربطها ببيانات المخبز المرجعي بدون مضاعفة أو تكرار
 */
export function normalizeDebtCalculations(d: DebtRecord, linkedBakery?: Bakery): DebtRecord {
  const violationAmount = Number(d.violationAmount) || 0;
  const oldViolations = Number(d.oldViolations) || 0;
  const paidViolationAmount = Number(d.paidViolationAmount) || 0;
  const { totalViolations, remainingViolations } = calculateRemainingViolations(
    violationAmount,
    oldViolations,
    paidViolationAmount
  );

  const addedAmount = Number(d.addedAmount) || 0;
  const paidAddedAmount = Number(d.paidAddedAmount) || 0;
  const remainingAdded = calculateRemainingAdded(addedAmount, paidAddedAmount);

  const disposalBags = Number(d.disposalBags) || 0;
  const disposalBagPrice =
    d.disposalBagPrice !== undefined && d.disposalBagPrice !== null && Number(d.disposalBagPrice) > 0
      ? Number(d.disposalBagPrice)
      : linkedBakery?.flourBagPrice || 950;
  const disposalMultiplier = Number(d.disposalMultiplier) > 0 ? Number(d.disposalMultiplier) : 1;

  const disposalValue =
    disposalBags > 0
      ? calculateDisposalValue(disposalBags, disposalBagPrice, disposalMultiplier)
      : Number(d.disposalValue) || 0;
  const paidDisposalAmount = Number(d.paidDisposalAmount) || 0;
  const remainingDisposal = calculateRemainingDisposal(disposalValue, paidDisposalAmount);

  const netRemainingDebt = calculateNetRemainingDebt(
    remainingViolations,
    remainingAdded,
    remainingDisposal
  );

  return {
    ...d,
    bakeryId: linkedBakery ? linkedBakery.id : d.bakeryId,
    bakeryOwnerName: linkedBakery ? linkedBakery.bakeryOwnerName : d.bakeryOwnerName,
    machineNumber: linkedBakery ? linkedBakery.machineNumber : d.machineNumber,
    village: linkedBakery ? linkedBakery.village : d.village,
    localUnit: linkedBakery ? linkedBakery.localUnit : d.localUnit,
    violationAmount,
    oldViolations,
    totalViolations,
    paidViolationAmount,
    remainingViolations,
    addedAmount,
    paidAddedAmount,
    remainingAdded,
    disposalBags,
    disposalBagPrice,
    disposalMultiplier,
    disposalValue,
    paidDisposalAmount,
    remainingDisposal,
    netRemainingDebt,
  };
}

/**
 * 9-د. مزامنة شاملة بين جدول المخابز وجدول المديونيات لضمان الترابط الكامل وتحديث جميع الحسابات
 */
export function synchronizeBakeryAndDebts(
  bakeries: Bakery[],
  debts: DebtRecord[]
): { bakeries: Bakery[]; debts: DebtRecord[] } {
  const normalizedBakeries = (bakeries || []).map(normalizeBakeryCalculations);
  const byId = new Map<string, Bakery>();
  const byMachine = new Map<string, Bakery>();

  normalizedBakeries.forEach((b) => {
    byId.set(b.id, b);
    if (b.machineNumber) {
      byMachine.set(b.machineNumber.trim(), b);
    }
  });

  // Deduplicate debts by ID to ensure no duplicate financial movements
  const seenDebtIds = new Set<string>();
  const synchronizedDebts: DebtRecord[] = [];
  (debts || []).forEach((d) => {
    if (!d || !d.id || seenDebtIds.has(d.id)) return;
    seenDebtIds.add(d.id);
    const linked =
      byId.get(d.bakeryId) || (d.machineNumber ? byMachine.get(d.machineNumber.trim()) : undefined);
    synchronizedDebts.push(normalizeDebtCalculations(d, linked));
  });

  return {
    bakeries: normalizedBakeries,
    debts: synchronizedDebts,
  };
}

/**
 * 9-هـ. احتساب التقرير السنوي للمتوسطات الفردية والمتوسطات العامة المرجحة بأعداد المستفيدين (2023 - 2024 - 2025)
 * يستخدم المتوسط المرجح بأعداد المستفيدين (إجمالي الأرغفة للسنة ÷ إجمالي المستفيدين للسنة) وليس المتوسط الحسابي البسيط
 */
export function calculateAnnualWeightedAveragesReport(bakeries: Bakery[]): AnnualWeightedReport {
  const normalized = (bakeries || []).map(normalizeBakeryCalculations);

  let totalInsuranceValue = 0;
  let totalInsuranceQuota = 0;
  let totalLoavesAll = 0;
  let totalVillagePopulation = 0;

  let loaves2023 = 0, ben2023 = 0, count2023 = 0, sumSimple2023 = 0;
  let loaves2024 = 0, ben2024 = 0, count2024 = 0, sumSimple2024 = 0;
  let loaves2025 = 0, ben2025 = 0, count2025 = 0, sumSimple2025 = 0;

  normalized.forEach((b) => {
    totalInsuranceValue += b.insuranceValue || 0;
    totalInsuranceQuota += b.insuranceQuota || 0;
    totalLoavesAll += b.loavesCount || 0;
    if (b.villagePopulation > 0) {
      totalVillagePopulation += b.villagePopulation;
    }

    if (b.beneficiaries2023 > 0) {
      loaves2023 += b.loavesCount;
      ben2023 += b.beneficiaries2023;
      count2023++;
      sumSimple2023 += b.loavesCount / b.beneficiaries2023;
    }
    if (b.beneficiaries2024 > 0) {
      loaves2024 += b.loavesCount;
      ben2024 += b.beneficiaries2024;
      count2024++;
      sumSimple2024 += b.loavesCount / b.beneficiaries2024;
    }
    if (b.beneficiaries2025 > 0) {
      loaves2025 += b.loavesCount;
      ben2025 += b.beneficiaries2025;
      count2025++;
      sumSimple2025 += b.loavesCount / b.beneficiaries2025;
    }
  });

  const rawWeighted2023 = ben2023 > 0 ? loaves2023 / ben2023 : 0;
  const rawWeighted2024 = ben2024 > 0 ? loaves2024 / ben2024 : 0;
  const rawWeighted2025 = ben2025 > 0 ? loaves2025 / ben2025 : 0;

  const weighted2023 = rawWeighted2023.toFixed(2);
  const weighted2024 = rawWeighted2024.toFixed(2);
  const weighted2025 = rawWeighted2025.toFixed(2);

  const year2023: YearSummaryMetrics = {
    year: 2023,
    activeBakeriesCount: count2023,
    totalLoaves: loaves2023,
    totalBeneficiaries: ben2023,
    weightedGeneralAverage: weighted2023,
    simpleArithmeticAverage: count2023 > 0 ? (sumSimple2023 / count2023).toFixed(2) : '0.00',
    diffFromPreviousYear: '0.00',
  };

  const year2024: YearSummaryMetrics = {
    year: 2024,
    activeBakeriesCount: count2024,
    totalLoaves: loaves2024,
    totalBeneficiaries: ben2024,
    weightedGeneralAverage: weighted2024,
    simpleArithmeticAverage: count2024 > 0 ? (sumSimple2024 / count2024).toFixed(2) : '0.00',
    diffFromPreviousYear: (rawWeighted2024 - rawWeighted2023).toFixed(2),
  };

  const year2025: YearSummaryMetrics = {
    year: 2025,
    activeBakeriesCount: count2025,
    totalLoaves: loaves2025,
    totalBeneficiaries: ben2025,
    weightedGeneralAverage: weighted2025,
    simpleArithmeticAverage: count2025 > 0 ? (sumSimple2025 / count2025).toFixed(2) : '0.00',
    diffFromPreviousYear: (rawWeighted2025 - rawWeighted2024).toFixed(2),
  };

  const rows: BakeryAnnualComparisonRow[] = normalized.map((b) => {
    const a23 = parseFloat(b.avg2023) || 0;
    const a24 = parseFloat(b.avg2024) || 0;
    const a25 = parseFloat(b.avg2025) || 0;

    return {
      bakeryId: b.id,
      bakeryOwnerName: b.bakeryOwnerName,
      machineNumber: b.machineNumber,
      village: b.village,
      localUnit: b.localUnit,
      insuranceValue: b.insuranceValue,
      insuranceQuota: b.insuranceQuota,
      loavesCount: b.loavesCount,
      villagePopulation: b.villagePopulation,
      perCapitaAverage: b.perCapitaAverage,
      beneficiaries2023: b.beneficiaries2023,
      avg2023: b.avg2023,
      beneficiaries2024: b.beneficiaries2024,
      avg2024: b.avg2024,
      beneficiaries2025: b.beneficiaries2025,
      avg2025: b.avg2025,
      diff2024vs2023: (a24 - a23).toFixed(2),
      diff2025vs2024: (a25 - a24).toFixed(2),
      diff2025vs2023: b.avgDiff,
      varianceFromGeneral2023: (a23 - rawWeighted2023).toFixed(2),
      varianceFromGeneral2024: (a24 - rawWeighted2024).toFixed(2),
      varianceFromGeneral2025: (a25 - rawWeighted2025).toFixed(2),
    };
  });

  const weightedPopulationPerCapita =
    totalVillagePopulation > 0 ? (totalLoavesAll / totalVillagePopulation).toFixed(2) : '0.00';

  const cumulativeDiff25vs23 = (rawWeighted2025 - rawWeighted2023).toFixed(2);

  return {
    rows,
    year2023,
    year2024,
    year2025,
    totalBakeries: normalized.length,
    totalInsuranceValue,
    totalInsuranceQuota,
    totalLoavesAll,
    totalLoaves: totalLoavesAll,
    totalVillagePopulation,
    weightedPopulationPerCapita,
    weightedPerCapitaVillage: weightedPopulationPerCapita,
    totalBeneficiaries2023: ben2023,
    weightedGeneralAvg2023: year2023.weightedGeneralAverage,
    weightedAvg2023: year2023.weightedGeneralAverage,
    simpleArithmeticAvg2023: year2023.simpleArithmeticAverage,
    totalBeneficiaries2024: ben2024,
    weightedGeneralAvg2024: year2024.weightedGeneralAverage,
    weightedAvg2024: year2024.weightedGeneralAverage,
    simpleArithmeticAvg2024: year2024.simpleArithmeticAverage,
    totalBeneficiaries2025: ben2025,
    weightedGeneralAvg2025: year2025.weightedGeneralAverage,
    weightedAvg2025: year2025.weightedGeneralAverage,
    simpleArithmeticAvg2025: year2025.simpleArithmeticAverage,
    weightedDiff2024vs2023: year2024.diffFromPreviousYear,
    weightedDiff2025vs2024: year2025.diffFromPreviousYear,
    weightedDiff2025vs2023: cumulativeDiff25vs23,
    cumulativeWeightedDiff2025vs2023: cumulativeDiff25vs23,
  };
}

/**
 * 9-و. محرك "احتساب المعادلات" الشامل لجميع سجلات المخابز والمديونيات مع سجل التغييرات والتنبيهات
 */
export function recalculateAllDatabaseEquations(
  bakeries: Bakery[],
  debts: DebtRecord[]
): {
  bakeries: Bakery[];
  debts: DebtRecord[];
  annualReport: AnnualWeightedReport;
  auditResult: MathAuditResult;
  warnings: string[];
  changesLog: EquationChangeLogItem[];
  summaryMessage: string;
  summary: {
    updatedBakeriesCount: number;
    updatedDebtsCount: number;
    totalChangesCount: number;
  };
} {
  const warnings: string[] = [];
  const changesLog: EquationChangeLogItem[] = [];

  (bakeries || []).forEach((b) => {
    if (!b.insuranceValue || b.insuranceValue <= 0) {
      warnings.push(`المخبز (${b.bakeryOwnerName}): المبلغ التأميني غير مسجل أو يساوي صفر.`);
    }
    if (!b.villagePopulation || b.villagePopulation <= 0) {
      warnings.push(`المخبز (${b.bakeryOwnerName}): عدد سكان القرية غير مسجل.`);
    }
    if (!b.beneficiaries2023 || !b.beneficiaries2024 || !b.beneficiaries2025) {
      warnings.push(`المخبز (${b.bakeryOwnerName}): توجد بيانات مستفيدين سنوية ناقصة لإحدى السنوات (2023/2024/2025).`);
    }

    const updated = normalizeBakeryCalculations(b);
    if (b.loavesCount !== updated.loavesCount) {
      changesLog.push({
        recordType: 'bakery',
        recordId: b.id,
        recordName: b.bakeryOwnerName,
        field: 'عدد الأرغفة (المبلغ التأميني ÷ (235 ÷ 3))',
        oldValue: b.loavesCount,
        newValue: updated.loavesCount,
      });
    }
    if (b.perCapitaAverage !== updated.perCapitaAverage) {
      changesLog.push({
        recordType: 'bakery',
        recordId: b.id,
        recordName: b.bakeryOwnerName,
        field: 'متوسط نصيب الفرد للمخبز',
        oldValue: b.perCapitaAverage,
        newValue: updated.perCapitaAverage,
      });
    }
    if (b.avg2023 !== updated.avg2023 || b.avg2024 !== updated.avg2024 || b.avg2025 !== updated.avg2025) {
      changesLog.push({
        recordType: 'bakery',
        recordId: b.id,
        recordName: b.bakeryOwnerName,
        field: 'المتوسطات السنوية (2023 / 2024 / 2025)',
        oldValue: `${b.avg2023} / ${b.avg2024} / ${b.avg2025}`,
        newValue: `${updated.avg2023} / ${updated.avg2024} / ${updated.avg2025}`,
      });
    }
  });

  const { bakeries: syncedBakeries, debts: syncedDebts } = synchronizeBakeryAndDebts(bakeries, debts);

  (debts || []).forEach((oldD) => {
    const newD = syncedDebts.find((x) => x.id === oldD.id);
    if (newD && oldD.netRemainingDebt !== newD.netRemainingDebt) {
      changesLog.push({
        recordType: 'debt',
        recordId: oldD.id,
        recordName: newD.bakeryOwnerName,
        field: 'صافي المديونية المتبقية',
        oldValue: oldD.netRemainingDebt,
        newValue: newD.netRemainingDebt,
      });
    }
  });

  const annualReport = calculateAnnualWeightedAveragesReport(syncedBakeries);
  const auditResult = runComprehensiveAudit(syncedBakeries, syncedDebts);

  const summaryMessage = `تم احتساب جميع المعادلات بنجاح لـ (${syncedBakeries.length}) مخبز و (${syncedDebts.length}) قيد مديونية! إجمالي الأرغفة المعتمدة: ${annualReport.totalLoavesAll.toLocaleString()} رغيف | المتوسط العام المرجح 2023: (${annualReport.year2023.weightedGeneralAverage}) | 2024: (${annualReport.year2024.weightedGeneralAverage}) | 2025: (${annualReport.year2025.weightedGeneralAverage}).`;

  const updatedBakeriesCount = new Set(
    changesLog.filter((c) => c.recordType === 'bakery').map((c) => c.recordId)
  ).size;
  const updatedDebtsCount = new Set(
    changesLog.filter((c) => c.recordType === 'debt').map((c) => c.recordId)
  ).size;

  return {
    bakeries: syncedBakeries,
    debts: syncedDebts,
    annualReport,
    auditResult,
    warnings,
    changesLog,
    summaryMessage,
    summary: {
      updatedBakeriesCount,
      updatedDebtsCount,
      totalChangesCount: changesLog.length,
    },
  };
}

/**
 * 10. دوال مساعدة نقية لإدارة القوائم المنسدلة (إضافة / تعديل / حذف)
 */
export function addDropdownOption(list: string[], newItem: string): string[] {
  const clean = newItem.trim();
  if (!clean || list.includes(clean)) return list;
  return [...list, clean];
}

export function editDropdownOption(list: string[], oldItem: string, newItem: string): string[] {
  const clean = newItem.trim();
  if (!clean) return list;
  return list.map((item) => (item === oldItem ? clean : item));
}

export function deleteDropdownOption(list: string[], itemToDelete: string): string[] {
  return list.filter((item) => item !== itemToDelete);
}

/**
 * 11. دوال مساعدة نقية لفرز وتصفية المهام اليومية حسب الأولوية وتاريخ الاستحقاق
 */
const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function filterAndSortDailyTasks(
  tasks: DailyBakeryTask[],
  options: {
    priorityFilter?: 'ALL' | TaskPriority;
    statusFilter?: 'ALL' | 'pending' | 'in_progress' | 'completed';
    searchQuery?: string;
  } = {}
): DailyBakeryTask[] {
  const { priorityFilter = 'ALL', statusFilter = 'ALL', searchQuery = '' } = options;
  const q = searchQuery.trim().toLowerCase();

  return tasks
    .filter((t) => {
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (q) {
        const hay = `${t.title} ${t.description || ''} ${t.bakeryName || ''} ${t.village || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const pDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (pDiff !== 0) return pDiff;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
}

/**
 * 12. تشغيل دالة الاختبار الشاملة والتحقق من دقة كافة المعادلات (بما فيها معادلة الأرغفة = المبلغ التأميني ÷ (235 ÷ 3))
 */
export function runComprehensiveAudit(
  sampleBakeries: Bakery[] = [],
  sampleDebts: DebtRecord[] = []
): MathAuditResult {
  const details: MathAuditResult['details'] = [];

  // فحص 1: المعادلة المعتمدة لاحتساب عدد الأرغفة = المبلغ التأميني ÷ (235 ÷ 3) بدون تقريب وسيط
  const loavesFromInsurance = calculateLoavesFromInsuranceValue(235000);
  details.push({
    checkName: 'معادلة الأرغفة من المبلغ التأميني: 235,000 ÷ (235 ÷ 3)',
    expected: 3000,
    actual: loavesFromInsurance,
    status: loavesFromInsurance === 3000 ? 'PASS' : 'FAIL',
    description: 'تحقق من قسمة المبلغ التأميني على (235 ÷ 3) بدون تقريب في المراحل الوسيطة.',
  });

  // فحص 2: دقة معادلة الأرغفة من المبلغ التأميني للكسور (18,500 ÷ (235 ÷ 3) = 236 رغيف)
  const loavesFraction = calculateLoavesFromInsuranceValue(18500);
  details.push({
    checkName: 'معادلة الأرغفة للكسور العشرية: 18,500 ÷ (235 ÷ 3)',
    expected: 236,
    actual: loavesFraction,
    status: loavesFraction === 236 ? 'PASS' : 'FAIL',
    description: 'تحقق من تطبيق قاعدة التقريب النهائية المعتمدة فقط بعد إتمام القسمة الدقيقة.',
  });

  // فحص 3: دقة معادلة الحصة التأمينية بالشكاير (20 شيكارة × 1350 = 27,000 رغيف)
  const loaves20 = calculateLoavesCount(20);
  details.push({
    checkName: 'معادلة الحصة التأمينية بالشكاير (20 شيكارة × 1350)',
    expected: 27000,
    actual: loaves20,
    status: loaves20 === 27000 ? 'PASS' : 'FAIL',
    description: 'تحقق من معادلة الحصة التأمينية المستقلة بالشكاير.',
  });

  // فحص 4: متوسط نصيب الفرد لسكان 30,000 نسمة بحصة 27,000 رغيف = 0.90 (علامة عشرية ورقمين فقط)
  const perCapita = calculatePerCapitaAverage(27000, 30000);
  details.push({
    checkName: 'متوسط نصيب الفرد من المخبز الواحد (27,000 ÷ 30,000)',
    expected: '0.90',
    actual: perCapita,
    status: perCapita === '0.90' ? 'PASS' : 'FAIL',
    description: 'تحقق من دقة احتساب متوسط نصيب الفرد لكل مخبز بشكل مستقل بعلامة عشرية ورقمين فقط (0.90).',
  });

  // فحص 5: متوسط مستفيدي 2023 (27,000 ÷ 27,000) = 1.00
  const avg23 = calculateYearlyAverage(27000, 27000);
  details.push({
    checkName: 'متوسط مستفيدي عام 2023 المستقل (27,000 ÷ 27,000)',
    expected: '1.00',
    actual: avg23,
    status: avg23 === '1.00' ? 'PASS' : 'FAIL',
    description: 'تحقق من قسمة الأرغفة على مستفيدي 2023 بشكل مستقل.',
  });

  // فحص 6: متوسط مستفيدي 2025 (27,000 ÷ 29,800) = 0.91
  const avg25 = calculateYearlyAverage(27000, 29800);
  details.push({
    checkName: 'متوسط مستفيدي عام 2025 المستقل (27,000 ÷ 29,800)',
    expected: '0.91',
    actual: avg25,
    status: avg25 === '0.91' ? 'PASS' : 'FAIL',
    description: 'تحقق من قسمة الأرغفة على مستفيدي 2025 والتقريب النهائي لرقمين عشريين (0.91).',
  });

  // فحص 7: الفرق التراكمي بين السنوات (0.91 - 1.00 = -0.09)
  const diff = calculateAverageDifference('0.91', '1.00');
  details.push({
    checkName: 'الفرق التراكمي بين متوسطي 2025 و 2023',
    expected: '-0.09',
    actual: diff,
    status: diff === '-0.09' ? 'PASS' : 'FAIL',
    description: 'تحقق من طرح متوسط 2023 من متوسط 2025 بعلامة عشرية ورقمين فقط.',
  });

  // فحص 8: حساب إجمالي ومتبقي المخالفات (5000 + 2000 - 3000 = 4000)
  const violCalc = calculateRemainingViolations(5000, 2000, 3000);
  details.push({
    checkName: 'معادلة متبقي المخالفات (5000 + 2000 - 3000)',
    expected: 4000,
    actual: violCalc.remainingViolations,
    status: violCalc.remainingViolations === 4000 ? 'PASS' : 'FAIL',
    description: 'تحقق من جمع المخالفة والمخالفات القديمة وطرح المسدد.',
  });

  // فحص 9: حساب متبقي المنصرف/المضاف (15000 - 10000 = 5000)
  const addedRem = calculateRemainingAdded(15000, 10000);
  details.push({
    checkName: 'معادلة متبقي المنصرف والمضاف (15,000 - 10,000)',
    expected: 5000,
    actual: addedRem,
    status: addedRem === 5000 ? 'PASS' : 'FAIL',
    description: 'تحقق من خصم المسدد من المضاف.',
  });

  // فحص 10: حساب قيمة التصرف في الدقيق (10 شكاير × 850 ج.م × مضاعف 2 = 17,000 ج.م)
  const disposalVal = calculateDisposalValue(10, 850, 2);
  details.push({
    checkName: 'معادلة غرامة التصرف في الدقيق (10 شكاير × 850 × 2x)',
    expected: 17000,
    actual: disposalVal,
    status: disposalVal === 17000 ? 'PASS' : 'FAIL',
    description: 'تحقق من حساب غرامة التصرف بالشكاير مع مضاعف العقوبة.',
  });

  // فحص 11: حساب صافي المتبقي الإجمالي (4000 مخالفات + 5000 مضاف + 12000 تصرف = 21,000)
  const netDebt = calculateNetRemainingDebt(4000, 5000, 12000);
  details.push({
    checkName: 'معادلة صافي المديونية الإجمالية (4000 + 5000 + 12000)',
    expected: 21000,
    actual: netDebt,
    status: netDebt === 21000 ? 'PASS' : 'FAIL',
    description: 'تحقق من تجميع كافة المتبقيات من مخالفات ومضاف وتصرف.',
  });

  // فحص 12: فحص كافة سجلات المخابز الحية بقاعدة البيانات
  if (sampleBakeries.length > 0) {
    let consistentBakeries = 0;
    sampleBakeries.forEach((b) => {
      const norm = normalizeBakeryCalculations(b);
      if (
        norm.loavesCount === b.loavesCount &&
        norm.perCapitaAverage === b.perCapitaAverage &&
        norm.avg2023 === b.avg2023 &&
        norm.avg2024 === b.avg2024 &&
        norm.avg2025 === b.avg2025 &&
        norm.avgDiff === b.avgDiff
      ) {
        consistentBakeries++;
      }
    });
    details.push({
      checkName: `فحص مطابقة معادلات جميع سجلات المخابز الحية (${sampleBakeries.length} مخبز)`,
      expected: sampleBakeries.length,
      actual: consistentBakeries,
      status: consistentBakeries === sampleBakeries.length ? 'PASS' : 'FAIL',
      description: 'تحقق من تطابق عدد الأرغفة ومتوسطات نصيب الفرد السنوية لجميع المخابز بقاعدة البيانات.',
    });
  }

  // فحص 13: فحص كافة قيود المديونيات الحية بقاعدة البيانات
  if (sampleDebts.length > 0) {
    let consistentRecords = 0;
    sampleDebts.forEach((d) => {
      const calcViol = (d.violationAmount || 0) + (d.oldViolations || 0) - (d.paidViolationAmount || 0);
      const calcAdded = (d.addedAmount || 0) - (d.paidAddedAmount || 0);
      const calcDisp = (d.disposalValue || 0) - (d.paidDisposalAmount || 0);
      const expectedNet = Math.max(0, calcViol) + Math.max(0, calcAdded) + Math.max(0, calcDisp);

      if (Math.abs(expectedNet - d.netRemainingDebt) < 1) {
        consistentRecords++;
      }
    });

    details.push({
      checkName: `فحص اتساق قيود المديونيات الحية (${sampleDebts.length} قيد)`,
      expected: sampleDebts.length,
      actual: consistentRecords,
      status: consistentRecords === sampleDebts.length ? 'PASS' : 'FAIL',
      description: 'تحقق من سلامة وصحة صافي المديونيات لكافة القيود المسجلة بالكامل.',
    });
  }

  const passedChecks = details.filter((d) => d.status === 'PASS').length;
  const failedChecks = details.length - passedChecks;

  return {
    passed: failedChecks === 0,
    totalChecks: details.length,
    passedChecks,
    failedChecks,
    details,
  };
}

/**
 * 13. دالة نقية للبحث المتقدم عبر المديونيات (حسب النطاق التاريخي من - إلى، ونوع المخالفة، وباقي المعايير)
 */
export interface DebtAdvancedFilterCriteria {
  dateFrom?: string;
  dateTo?: string;
  violationType?: string;
  village?: string;
  localUnit?: string;
  issuingEntity?: string;
  status?: 'ALL' | 'UNPAID' | 'PAID' | 'OVER_20K' | 'OVERDUE';
  filterBakeryId?: string;
  searchTerm?: string;
  isOverdueCheck?: (dateStr?: string, netRemainingDebt?: number) => { isOverdue: boolean };
}

export function filterDebtsByAdvancedCriteria(
  debts: DebtRecord[],
  criteria: DebtAdvancedFilterCriteria = {}
): DebtRecord[] {
  const {
    dateFrom = '',
    dateTo = '',
    violationType = 'ALL',
    village = 'ALL',
    localUnit = 'ALL',
    issuingEntity = 'ALL',
    status = 'ALL',
    filterBakeryId,
    searchTerm = '',
    isOverdueCheck,
  } = criteria;

  const cleanFrom = dateFrom.trim();
  const cleanTo = dateTo.trim();
  const q = searchTerm.trim().toLowerCase();

  return debts.filter((d) => {
    if (filterBakeryId && d.bakeryId !== filterBakeryId) return false;
    if (village !== 'ALL' && d.village !== village) return false;
    if (localUnit !== 'ALL' && d.localUnit !== localUnit) return false;
    if (issuingEntity !== 'ALL' && d.issuingEntity !== issuingEntity) return false;
    if (violationType !== 'ALL' && d.violationType !== violationType) return false;

    if (cleanFrom || cleanTo) {
      const recordDates = [d.violationDate, d.disposalDate]
        .map((dt) => (dt || '').trim())
        .filter(Boolean);

      if (recordDates.length === 0) return false;

      const matchesDateRange = recordDates.some((rDate) => {
        if (cleanFrom && rDate < cleanFrom) return false;
        if (cleanTo && rDate > cleanTo) return false;
        return true;
      });

      if (!matchesDateRange) return false;
    }

    if (status === 'UNPAID' && d.netRemainingDebt <= 0) return false;
    if (status === 'PAID' && d.netRemainingDebt > 0) return false;
    if (status === 'OVER_20K' && (d.netRemainingDebt || 0) <= 20000) return false;
    if (status === 'OVERDUE' && isOverdueCheck) {
      const { isOverdue } = isOverdueCheck(d.violationDate || d.disposalDate, d.netRemainingDebt);
      if (!isOverdue) return false;
    }

    if (q) {
      const match =
        d.bakeryOwnerName.toLowerCase().includes(q) ||
        d.machineNumber.includes(q) ||
        d.village.toLowerCase().includes(q) ||
        d.localUnit.toLowerCase().includes(q) ||
        d.issuingEntity.toLowerCase().includes(q) ||
        d.violationType.toLowerCase().includes(q) ||
        d.violationReceiptNumber.includes(q) ||
        d.addedReceiptNumber.includes(q) ||
        d.disposalReceiptNumber.includes(q) ||
        (d.violationDate || '').includes(q);
      if (!match) return false;
    }

    return true;
  });
}
