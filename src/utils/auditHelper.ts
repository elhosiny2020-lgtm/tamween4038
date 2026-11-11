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
 * استخراج معامل عدد الأرغفة (660 أو 725) من خانة نوع عدد الخبز
 * إذا كانت القيمة 660 رغيفاً، يكون المعامل 660
 * إذا كانت القيمة 725 رغيفاً، يكون المعامل 725
 */
export function extractBreadLoafMultiplier(breadTypeCount: number | string | undefined | null): number {
  if (breadTypeCount === undefined || breadTypeCount === null) return 660;
  const str = String(breadTypeCount).trim();
  if (str.includes('725')) return 725;
  if (str.includes('660')) return 660;
  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  if (num === 725) return 725;
  if (num === 660) return 660;
  if (num > 10) return num;
  return 660;
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
 * المعادلة المعتمدة ثانياً: احتساب عدد الأرغفة:
 * عدد الأرغفة = حصة المخبز الفعلية × معامل عدد الأرغفة (660 أو 725)
 */
export function calculateLoavesCount(
  actualQuota: number,
  breadTypeCount: number | string = 660
): number {
  const actual = Number(actualQuota) || 0;
  if (actual <= 0) return 0;
  const mult = extractBreadLoafMultiplier(breadTypeCount);
  return Math.round(actual * mult);
}

/**
 * دالة مساعدة متوافقة لاحتساب عدد الأرغفة
 */
export function calculateLoavesCountFromFormula(
  actualQuota: number,
  breadTypeCount: number | string,
  _villagePopulation?: number
): number {
  return calculateLoavesCount(actualQuota, breadTypeCount);
}

/**
 * المعادلة المعتمدة أولاً: احتساب الحصة التأمينية:
 * الحصة التأمينية = المبلغ التأميني بالجنيه ÷ 235 ÷ 3
 * مثال: 7050 ÷ 235 ÷ 3 = 10
 */
export function calculateInsuranceQuota(insuranceValue: number): number {
  const val = Number(insuranceValue) || 0;
  if (val <= 0) return 0;
  const result = val / 235 / 3;
  return Number(result.toFixed(2));
}

/**
 * المعادلة العكسية للمبلغ التأميني من الحصة التأمينية:
 * المبلغ التأميني = الحصة التأمينية × 235 × 3
 */
export function calculateInsuranceValueFromQuota(insuranceQuota: number): number {
  const quota = Number(insuranceQuota) || 0;
  if (quota <= 0) return 0;
  return Math.round(quota * 235 * 3);
}

/**
 * المعادلة المعتمدة تاسعاً: احتساب خانة متوسط نصيب الفرد للمخبز الواحد:
 * متوسط نصيب الفرد للمخبز الواحد = إجمالي عدد الأرغفة ÷ عدد المستفيدين عام 2025
 * averagePerBakery = totalLoaves / beneficiaries2025
 */
export function calculatePerBakeryAverage(
  totalLoaves: number,
  beneficiaries2025: number
): string {
  const ben25 = Number(beneficiaries2025) || 0;
  if (ben25 <= 0) return '0.00';
  const loaves = Number(totalLoaves) || 0;
  return (loaves / ben25).toFixed(2);
}

/**
 * دالة مساعدة متوافقة لمتوسط نصيب الفرد للمخبز
 */
export function calculatePerCapitaAverageFromFormula(
  loavesCount: number,
  actualQuotaOrBen2025: number,
  _villagePopulation?: number
): string {
  return calculatePerBakeryAverage(loavesCount, actualQuotaOrBen2025);
}

/**
 * متوسط نصيب الفرد من المخبز الواحد (احتساب نسبة إلى المستفيدين عام 2025)
 */
export function calculatePerCapitaAverage(
  loavesCount: number,
  beneficiariesCount: number
): string {
  return calculatePerBakeryAverage(loavesCount, beneficiariesCount);
}

/**
 * المعادلات ثالثاً ورابعاً وخامساً: احتساب متوسط نصيب الفرد السنوي:
 * متوسط نصيب الفرد = عدد الأرغفة ÷ عدد المستفيدين للسنة المحددة (2023 / 2024 / 2025)
 */
export function calculateYearlyAverage(
  loavesCount: number,
  beneficiariesCount: number
): string {
  const ben = Number(beneficiariesCount) || 0;
  if (ben <= 0) return '0.00';
  const loaves = Number(loavesCount) || 0;
  return (loaves / ben).toFixed(2);
}

/**
 * المعادلة المعتمدة سادساً: احتساب الفرق التراكمي لمتوسطات نصيب الفرد:
 * الفرق التراكمي = متوسط نصيب الفرد عام 2023 - متوسط نصيب الفرد عام 2024 - متوسط نصيب الفرد عام 2025
 * ف = م_2023 - م_2024 - م_2025
 * مع الحفاظ على الدقة الحسابية الكاملة داخلياً وعرض منزلتين عشريتين فقط.
 */
export function calculateCumulativeDifference(
  avg2023: number | string,
  avg2024: number | string,
  avg2025: number | string
): string {
  const a23 = typeof avg2023 === 'number' ? avg2023 : parseFloat(String(avg2023)) || 0;
  const a24 = typeof avg2024 === 'number' ? avg2024 : parseFloat(String(avg2024)) || 0;
  const a25 = typeof avg2025 === 'number' ? avg2025 : parseFloat(String(avg2025)) || 0;
  const diff = a23 - a24 - a25;
  return diff.toFixed(2);
}

export function calculateAverageDifference(
  avg1: number | string,
  avg2: number | string,
  avg3?: number | string
): string {
  if (avg3 !== undefined) {
    return calculateCumulativeDifference(avg1, avg2, avg3);
  }
  const a = typeof avg1 === 'number' ? avg1 : parseFloat(String(avg1)) || 0;
  const b = typeof avg2 === 'number' ? avg2 : parseFloat(String(avg2)) || 0;
  return (a - b).toFixed(2);
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
 * 9-ب. تطبيع وإعادة احتساب كافة المعادلات التموينية للمخبز بدقة بنسبة 100% وفق المحددات المعتمدة:
 * 1. الحصة التأمينية = المبلغ التأميني بالجنيه ÷ 235 ÷ 3
 * 2. عدد الأرغفة = حصة المخبز الفعلية × معامل عدد الأرغفة (660 أو 725)
 * 3. متوسط نصيب الفرد لعام 2023 = عدد الأرغفة ÷ مستفيدي 2023
 * 4. متوسط نصيب الفرد لعام 2024 = عدد الأرغفة ÷ مستفيدي 2024
 * 5. متوسط نصيب الفرد لعام 2025 = عدد الأرغفة ÷ مستفيدي 2025
 * 6. الفرق التراكمي = متوسط 2023 - متوسط 2024 - متوسط 2025 (ف = م_2023 - م_2024 - م_2025)
 * 7. متوسط نصيب الفرد للمخبز الواحد = إجمالي عدد الأرغفة ÷ مستفيدي عام 2025
 */
export function normalizeBakeryCalculations(b: Bakery): Bakery {
  const actualQuota = Number(b.actualQuota) || 0;
  const rawInsVal = Number(b.insuranceValue) || 0;
  const rawInsQuota = Number(b.insuranceQuota) || 0;

  // 1. الحصة التأمينية والمبلغ التأميني:
  // الحصة التأمينية = المبلغ التأميني بالجنيه ÷ 235 ÷ 3
  const insuranceQuota =
    rawInsVal > 0
      ? calculateInsuranceQuota(rawInsVal)
      : rawInsQuota > 0
      ? rawInsQuota
      : 0;

  const insuranceValue =
    rawInsVal > 0
      ? rawInsVal
      : insuranceQuota > 0
      ? calculateInsuranceValueFromQuota(insuranceQuota)
      : 0;

  // 2. احتساب عدد الأرغفة = حصة المخبز الفعلية × معامل عدد الأرغفة (660 أو 725)
  const breadTypeCount = b.breadTypeCount !== undefined && b.breadTypeCount !== null ? b.breadTypeCount : 660;
  const multiplier = extractBreadLoafMultiplier(breadTypeCount);
  const loavesCount = Math.round(actualQuota * multiplier);

  const villagePopulation = Number(b.villagePopulation) || 0;
  const beneficiaries2023 = Number(b.beneficiaries2023) || 0;
  const beneficiaries2024 = Number(b.beneficiaries2024) || 0;
  const beneficiaries2025 = Number(b.beneficiaries2025) || 0;

  // 3. متوسط نصيب الفرد لعام 2023 = عدد الأرغفة ÷ عدد المستفيدين عام 2023
  const rawAvg2023 = beneficiaries2023 > 0 ? loavesCount / beneficiaries2023 : 0;
  const avg2023 = beneficiaries2023 > 0 ? rawAvg2023.toFixed(2) : '0.00';

  // 4. متوسط نصيب الفرد لعام 2024 = عدد الأرغفة ÷ عدد المستفيدين عام 2024
  const rawAvg2024 = beneficiaries2024 > 0 ? loavesCount / beneficiaries2024 : 0;
  const avg2024 = beneficiaries2024 > 0 ? rawAvg2024.toFixed(2) : '0.00';

  // 5. متوسط نصيب الفرد لعام 2025 = عدد الأرغفة ÷ عدد المستفيدين عام 2025
  const rawAvg2025 = beneficiaries2025 > 0 ? loavesCount / beneficiaries2025 : 0;
  const avg2025 = beneficiaries2025 > 0 ? rawAvg2025.toFixed(2) : '0.00';

  // 6. الفرق التراكمي لمتوسطات نصيب الفرد = متوسط 2023 - متوسط 2024 - متوسط 2025
  // ف = م_2023 - م_2024 - م_2025 (مع الحفاظ على الدقة الحسابية الكاملة داخلياً)
  const rawDiff = rawAvg2023 - rawAvg2024 - rawAvg2025;
  const avgDiff =
    beneficiaries2023 > 0 || beneficiaries2024 > 0 || beneficiaries2025 > 0
      ? rawDiff.toFixed(2)
      : '0.00';

  // 7. متوسط نصيب الفرد للمخبز الواحد = إجمالي عدد الأرغفة ÷ عدد المستفيدين عام 2025
  // averagePerBakery = totalLoaves / beneficiaries2025
  const perCapitaAverage =
    beneficiaries2025 > 0
      ? rawAvg2025.toFixed(2)
      : villagePopulation > 0
      ? (loavesCount / villagePopulation).toFixed(2)
      : '0.00';

  return {
    ...b,
    actualQuota,
    insuranceQuota,
    insuranceValue,
    breadTypeCount,
    loavesCount,
    villagePopulation,
    beneficiaries2023,
    beneficiaries2024,
    beneficiaries2025,
    avg2023,
    avg2024,
    avg2025,
    avgDiff,
    perCapitaAverage,
    bakeryCategory: b.bakeryCategory || 'مخبز بلدي مدعم',
    breadType: b.breadType || 'بلدي مدعم ماو',
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

  // فحص 1: احتساب الحصة التأمينية من المبلغ التأميني: 7050 ÷ 235 ÷ 3 = 10
  const quotaCheck = calculateInsuranceQuota(7050);
  details.push({
    checkName: 'معادلة الحصة التأمينية: 7050 ÷ 235 ÷ 3 = 10',
    expected: 10,
    actual: quotaCheck,
    status: quotaCheck === 10 ? 'PASS' : 'FAIL',
    description: 'تحقق من معادلة الحصة التأمينية = المبلغ التأميني ÷ 235 ÷ 3.',
  });

  // فحص 2: استخراج معامل عدد الأرغفة (660 أو 725)
  const mult660 = extractBreadLoafMultiplier('660 رغيفاً');
  const mult725 = extractBreadLoafMultiplier('725 رغيفاً');
  details.push({
    checkName: 'تحديد معامل عدد الأرغفة تلقائياً (660 أو 725)',
    expected: '660 / 725',
    actual: `${mult660} / ${mult725}`,
    status: mult660 === 660 && mult725 === 725 ? 'PASS' : 'FAIL',
    description: 'تحقق من قراءة نوع عدد الخبز وتحديد المعامل 660 أو 725 بدقة.',
  });

  // فحص 3: احتساب عدد الأرغفة = الحصة الفعلية × المعامل (20 × 660 = 13,200)
  const loaves20_660 = calculateLoavesCount(20, 660);
  details.push({
    checkName: 'معادلة عدد الأرغفة لمعامل 660 (20 شيكارة × 660)',
    expected: 13200,
    actual: loaves20_660,
    status: loaves20_660 === 13200 ? 'PASS' : 'FAIL',
    description: 'تحقق من ضرب الحصة الفعلية في معامل 660.',
  });

  // فحص 4: احتساب عدد الأرغفة = الحصة الفعلية × المعامل (20 × 725 = 14,500)
  const loaves20_725 = calculateLoavesCount(20, 725);
  details.push({
    checkName: 'معادلة عدد الأرغفة لمعامل 725 (20 شيكارة × 725)',
    expected: 14500,
    actual: loaves20_725,
    status: loaves20_725 === 14500 ? 'PASS' : 'FAIL',
    description: 'تحقق من ضرب الحصة الفعلية في معامل 725.',
  });

  // فحص 5: متوسط نصيب الفرد لعام 2023 = الأرغفة ÷ مستفيدي 2023 (13,200 ÷ 26,400 = 0.50)
  const avg23 = calculateYearlyAverage(13200, 26400);
  details.push({
    checkName: 'متوسط مستفيدي عام 2023 (13,200 ÷ 26,400)',
    expected: '0.50',
    actual: avg23,
    status: avg23 === '0.50' ? 'PASS' : 'FAIL',
    description: 'تحقق من قسمة الأرغفة على مستفيدي 2023.',
  });

  // فحص 6: متوسط نصيب الفرد لعام 2024 (13,200 ÷ 27,500 = 0.48)
  const avg24 = calculateYearlyAverage(13200, 27500);
  details.push({
    checkName: 'متوسط مستفيدي عام 2024 (13,200 ÷ 27,500)',
    expected: '0.48',
    actual: avg24,
    status: avg24 === '0.48' ? 'PASS' : 'FAIL',
    description: 'تحقق من قسمة الأرغفة على مستفيدي 2024.',
  });

  // فحص 7: متوسط نصيب الفرد لعام 2025 (13,200 ÷ 30,000 = 0.44)
  const avg25 = calculateYearlyAverage(13200, 30000);
  details.push({
    checkName: 'متوسط مستفيدي عام 2025 (13,200 ÷ 30,000)',
    expected: '0.44',
    actual: avg25,
    status: avg25 === '0.44' ? 'PASS' : 'FAIL',
    description: 'تحقق من قسمة الأرغفة على مستفيدي 2025.',
  });

  // فحص 8: الفرق التراكمي لمتوسطات نصيب الفرد: ف = م_2023 - م_2024 - م_2025
  // (0.50 - 0.48 - 0.44 = -0.42)
  const cumDiff = calculateCumulativeDifference('0.50', '0.48', '0.44');
  details.push({
    checkName: 'الفرق التراكمي: م2023 - م2024 - م2025 (0.50 - 0.48 - 0.44)',
    expected: '-0.42',
    actual: cumDiff,
    status: cumDiff === '-0.42' ? 'PASS' : 'FAIL',
    description: 'تحقق حرفي من معادلة الفرق التراكمي: م_2023 - م_2024 - م_2025.',
  });

  // فحص 9: متوسط نصيب الفرد للمخبز الواحد = عدد الأرغفة ÷ مستفيدي 2025 (13,200 ÷ 30,000 = 0.44)
  const perBakery = calculatePerBakeryAverage(13200, 30000);
  details.push({
    checkName: 'متوسط نصيب الفرد للمخبز الواحد: الأرغفة ÷ مستفيدي 2025',
    expected: '0.44',
    actual: perBakery,
    status: perBakery === '0.44' ? 'PASS' : 'FAIL',
    description: 'تحقق من معادلة متوسط نصيب الفرد للمخبز الواحد = totalLoaves / beneficiaries2025.',
  });

  // فحص 10: منع القسمة على صفر وإرجاع 0.00
  const zeroBenCheck = calculateYearlyAverage(13200, 0);
  const zeroBakeryCheck = calculatePerBakeryAverage(13200, 0);
  details.push({
    checkName: 'الحماية الصارمة من القسمة على صفر (عند خلو المستفيدين)',
    expected: '0.00',
    actual: `${zeroBenCheck} / ${zeroBakeryCheck}`,
    status: zeroBenCheck === '0.00' && zeroBakeryCheck === '0.00' ? 'PASS' : 'FAIL',
    description: 'منع ظهور Infinity أو NaN عند الصفر أو الخانات الفارغة.',
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
    if (village !== 'ALL' && normalizeArabicText(d.village) !== normalizeArabicText(village) && d.village !== village) return false;
    if (localUnit !== 'ALL' && normalizeArabicText(d.localUnit) !== normalizeArabicText(localUnit) && d.localUnit !== localUnit) return false;
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

/**
 * 14. تطبيع النصوص العربية للمقارنة الدقيقة بين أسماء القرى والوحدات المحلية (توحيد الألف والتاء المربوطة والياء والمسافات)
 */
export function normalizeArabicText(text: unknown): string {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

/**
 * 15. مطابقة ذكية وشاملة للقرية والوحدة المحلية تدعم هرمية القرى والوحدات التابعة لها (مثل بشبيش ووحداتها التابعة)
 */
export function matchesVillageOrUnitFilter(
  item: { village?: string; localUnit?: string },
  selectedVillage: string,
  selectedUnit: string,
  villagesHierarchy: { village: string; localUnits: string[] }[] = []
): boolean {
  const itemVillageNorm = normalizeArabicText(item.village);
  const itemUnitNorm = normalizeArabicText(item.localUnit);

  if (selectedVillage && selectedVillage !== 'ALL') {
    const targetVillageNorm = normalizeArabicText(selectedVillage);
    const hierarchyEntry = villagesHierarchy.find(
      (v) => normalizeArabicText(v.village) === targetVillageNorm
    );
    const validVillageNames = new Set<string>([targetVillageNorm]);
    if (hierarchyEntry) {
      hierarchyEntry.localUnits.forEach((u) => validVillageNames.add(normalizeArabicText(u)));
    }
    const matchesVillage =
      validVillageNames.has(itemVillageNorm) || validVillageNames.has(itemUnitNorm);
    if (!matchesVillage) return false;
  }

  if (selectedUnit && selectedUnit !== 'ALL') {
    const targetUnitNorm = normalizeArabicText(selectedUnit);
    const targetBaseNorm = targetUnitNorm.replace(/\s+الرئيسيه$/, '').trim();
    const itemUnitBaseNorm = itemUnitNorm.replace(/\s+الرئيسيه$/, '').trim();

    const hierarchyEntryForUnit = !targetUnitNorm.endsWith('الرئيسيه')
      ? villagesHierarchy.find((v) => normalizeArabicText(v.village) === targetUnitNorm)
      : undefined;
    const validSubUnits = new Set<string>();
    if (hierarchyEntryForUnit) {
      hierarchyEntryForUnit.localUnits.forEach((u) => validSubUnits.add(normalizeArabicText(u)));
    }

    const directMatch =
      itemUnitNorm === targetUnitNorm ||
      itemVillageNorm === targetUnitNorm ||
      validSubUnits.has(itemUnitNorm) ||
      validSubUnits.has(itemVillageNorm) ||
      (targetUnitNorm.endsWith('الرئيسيه') && itemUnitNorm === targetBaseNorm) ||
      (itemUnitNorm.endsWith('الرئيسيه') && targetUnitNorm === itemUnitBaseNorm);

    if (!directMatch) return false;
  }

  return true;
}

/**
 * 16. دالة تجميع شاملة وموحدة لكافة أعمدة جدول المخابز (صف الإجماليات TOTAL SUMMARY وإجماليات القرى والوحدات المحلية)
 * تقوم بجمع كافة أعداد المستفيدين وجمع كافة متوسطات المستفيدين وجميع خانات الأعمدة في صف الإجماليات بدقة 100%
 */
export interface BakeriesColumnTotals {
  bakeryCount: number;
  uniqueVillagesCount: number;
  uniqueVillagesLabel: string;
  uniqueUnitsCount: number;
  uniqueUnitsLabel: string;
  remainingDebt: number;
  insuranceValue: number;
  insuranceQuota: number;
  actualQuota: number;
  loavesCount: number;
  villagePopulation: number;
  beneficiaries2023: number;
  beneficiaries2024: number;
  beneficiaries2025: number;
  perCapitaAverage: string;
  avg2023: string;
  avg2024: string;
  avg2025: string;
  avgDiff: string;
  activeCount: number;
  stoppedCount: number;
  activitySummaryLabel: string;
  uniqueCategoriesCount: number;
  bakeryCategorySummaryLabel: string;
  uniqueBreadTypesCount: number;
  breadTypeSummaryLabel: string;
  flourBagPriceSum: number;
  breadTypeCountSum: number;
  uniqueLineTypesCount: number;
  lineTypeSummaryLabel: string;
  uniqueFuelTypesCount: number;
  fuelTypeSummaryLabel: string;
  validPhonesCount: number;
  validNatIdsCount: number;
  validCommRegCount: number;
  validLicenseCount: number;
  validLeaseCount: number;
  validTaxCardCount: number;
}

export function calculateBakeriesColumnTotals(
  bakeries: Bakery[],
  debtsMap: Record<string, number> = {}
): BakeriesColumnTotals {
  let remainingDebt = 0;
  let insuranceValue = 0;
  let insuranceQuota = 0;
  let actualQuota = 0;
  let loavesCount = 0;
  let villagePopulation = 0;
  let beneficiaries2023 = 0;
  let beneficiaries2024 = 0;
  let beneficiaries2025 = 0;
  let sumPerCapita = 0;
  let sumAvg2023 = 0;
  let sumAvg2024 = 0;
  let sumAvg2025 = 0;
  let sumAvgDiff = 0;
  let activeCount = 0;
  let flourBagPriceSum = 0;
  let breadTypeCountSum = 0;
  let validPhonesCount = 0;
  let validNatIdsCount = 0;
  let validCommRegCount = 0;
  let validLicenseCount = 0;
  let validLeaseCount = 0;
  let validTaxCardCount = 0;

  const villagesSet = new Set<string>();
  const unitsSet = new Set<string>();
  const categoriesSet = new Set<string>();
  const breadTypesSet = new Set<string>();
  const lineTypesSet = new Set<string>();
  const fuelTypesSet = new Set<string>();

  (bakeries || []).forEach((b) => {
    const normB = normalizeBakeryCalculations(b);
    if (normB.village) villagesSet.add(normB.village.trim());
    if (normB.localUnit) unitsSet.add(normB.localUnit.trim());
    if (normB.bakeryCategory) categoriesSet.add(normB.bakeryCategory.trim());
    if (normB.breadType) breadTypesSet.add(normB.breadType.trim());
    if (normB.lineType) lineTypesSet.add(normB.lineType.trim());
    if (normB.fuelType) fuelTypesSet.add(normB.fuelType.trim());

    remainingDebt += Number(debtsMap[normB.id]) || 0;
    insuranceValue += Number(normB.insuranceValue) || 0;
    insuranceQuota += Number(normB.insuranceQuota) || 0;
    actualQuota += Number(normB.actualQuota) || 0;
    loavesCount += Number(normB.loavesCount) || 0;
    villagePopulation += Number(normB.villagePopulation) || 0;
    beneficiaries2023 += Number(normB.beneficiaries2023) || 0;
    beneficiaries2024 += Number(normB.beneficiaries2024) || 0;
    beneficiaries2025 += Number(normB.beneficiaries2025) || 0;

    sumPerCapita += parseFloat(String(normB.perCapitaAverage || normB.avg2025 || '0')) || 0;
    sumAvg2023 += parseFloat(String(normB.avg2023 || '0')) || 0;
    sumAvg2024 += parseFloat(String(normB.avg2024 || '0')) || 0;
    sumAvg2025 += parseFloat(String(normB.avg2025 || '0')) || 0;
    sumAvgDiff += parseFloat(String(normB.avgDiff || '0')) || 0;

    if (normB.activityStatus === 'شغال') activeCount++;
    flourBagPriceSum += Number(normB.flourBagPrice ?? 950) || 0;
    breadTypeCountSum += extractBreadLoafMultiplier(normB.breadTypeCount);

    if (normB.phone && normB.phone.trim()) validPhonesCount++;
    if (normB.nationalId && normB.nationalId.trim()) validNatIdsCount++;
    if (normB.commercialRegDate && normB.commercialRegDate.trim()) validCommRegCount++;
    if (normB.bakeryLicenseDate && normB.bakeryLicenseDate.trim()) validLicenseCount++;
    if (normB.leaseAgreementDate && normB.leaseAgreementDate.trim()) validLeaseCount++;
    if (normB.taxCardDate && normB.taxCardDate.trim()) validTaxCardCount++;
  });

  const bakeryCount = (bakeries || []).length;
  const stoppedCount = Math.max(0, bakeryCount - activeCount);
  const villagesArr = Array.from(villagesSet);
  const unitsArr = Array.from(unitsSet);

  const uniqueVillagesLabel =
    villagesArr.length === 1
      ? `${villagesArr[0]} (1 قرية)`
      : `إجمالي (${villagesArr.length} قرية)`;

  const uniqueUnitsLabel =
    unitsArr.length === 1
      ? `${unitsArr[0]} (1 وحدة)`
      : `إجمالي (${unitsArr.length} وحدة محلية)`;

  return {
    bakeryCount,
    uniqueVillagesCount: villagesArr.length,
    uniqueVillagesLabel,
    uniqueUnitsCount: unitsArr.length,
    uniqueUnitsLabel,
    remainingDebt: Math.round(remainingDebt * 100) / 100,
    insuranceValue: Math.round(insuranceValue * 100) / 100,
    insuranceQuota: Number(insuranceQuota.toFixed(2)),
    actualQuota: Number(actualQuota.toFixed(2)),
    loavesCount: Math.round(loavesCount),
    villagePopulation: Math.round(villagePopulation),
    beneficiaries2023: Math.round(beneficiaries2023),
    beneficiaries2024: Math.round(beneficiaries2024),
    beneficiaries2025: Math.round(beneficiaries2025),
    perCapitaAverage: sumPerCapita.toFixed(2),
    avg2023: sumAvg2023.toFixed(2),
    avg2024: sumAvg2024.toFixed(2),
    avg2025: sumAvg2025.toFixed(2),
    avgDiff: sumAvgDiff.toFixed(2),
    activeCount,
    stoppedCount,
    activitySummaryLabel:
      stoppedCount > 0 ? `${activeCount} شغال / ${stoppedCount} غير نشط` : `${activeCount} شغال`,
    uniqueCategoriesCount: categoriesSet.size,
    bakeryCategorySummaryLabel: `${bakeryCount} مخبز (${categoriesSet.size || 1} تصنيف)`,
    uniqueBreadTypesCount: breadTypesSet.size,
    breadTypeSummaryLabel: `${bakeryCount} خط (${breadTypesSet.size || 1} صنف)`,
    flourBagPriceSum: Math.round(flourBagPriceSum),
    breadTypeCountSum: Math.round(breadTypeCountSum),
    uniqueLineTypesCount: lineTypesSet.size,
    lineTypeSummaryLabel: `${bakeryCount} خط (${lineTypesSet.size || 1} نوع)`,
    uniqueFuelTypesCount: fuelTypesSet.size,
    fuelTypeSummaryLabel: `${bakeryCount} مخبز (${fuelTypesSet.size || 1} وقود)`,
    validPhonesCount,
    validNatIdsCount,
    validCommRegCount,
    validLicenseCount,
    validLeaseCount,
    validTaxCardCount,
  };
}

