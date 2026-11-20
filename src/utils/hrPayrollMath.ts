import type {
  HrEmployee,
  HrLeaveBalance,
  HrLoanRecord,
  HrPayrollLine,
  HrPolicySettingsVersion,
  HrTaxBracket,
} from '../types/modules';
import { round2 } from './rationMathEngine';

function safeNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * استخراج تاريخ الميلاد والنوع والتحقق الصارم من صحة الرقم القومي المصري (14 رقماً)
 */
export function parseEgyptianNationalId(nationalId: string): {
  valid: boolean;
  error?: string;
  birthDate?: string;
  ageYears?: number;
  gender?: 'ذكر' | 'أنثى';
} {
  const clean = String(nationalId || '').trim();
  if (!/^\d{14}$/.test(clean)) {
    return { valid: false, error: 'الرقم القومي يجب أن يتكون من 14 رقماً صحيحاً.' };
  }
  const centuryCode = Number(clean[0]);
  if (centuryCode !== 2 && centuryCode !== 3) {
    return { valid: false, error: 'رمز القرن في الرقم القومي غير صحيح (يجب أن يبدأ بـ 2 أو 3).' };
  }
  const year = (centuryCode === 2 ? 1900 : 2000) + Number(clean.slice(1, 3));
  const month = Number(clean.slice(3, 5));
  const day = Number(clean.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, error: 'تاريخ الميلاد داخل الرقم القومي غير صالح.' };
  }
  const dob = new Date(Date.UTC(year, month - 1, day));
  if (
    isNaN(dob.getTime()) ||
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    return { valid: false, error: 'تاريخ الميلاد المستخرج غير صحيح.' };
  }

  const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const now = new Date();
  let ageYears = now.getUTCFullYear() - year;
  if (
    now.getUTCMonth() < month - 1 ||
    (now.getUTCMonth() === month - 1 && now.getUTCDate() < day)
  ) {
    ageYears -= 1;
  }
  const genderDigit = Number(clean[12]);
  const gender: 'ذكر' | 'أنثى' = genderDigit % 2 === 1 ? 'ذكر' : 'أنثى';

  return { valid: true, birthDate, ageYears: Math.max(0, ageYears), gender };
}

function parseTimeToMinutes(hhmm: string): number {
  const parts = String(hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, safeNum(parts[0])));
  const m = Math.max(0, Math.min(59, safeNum(parts[1])));
  return h * 60 + m;
}

export function computeAttendanceMetrics(params: {
  officialStart: string;
  officialEnd: string;
  actualIn: string;
  actualOut: string;
  breakMinutes?: number;
}): {
  totalWorkedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  netWorkedMinutes: number;
} {
  const offIn = parseTimeToMinutes(params.officialStart);
  const offOut = parseTimeToMinutes(params.officialEnd);
  const actIn = parseTimeToMinutes(params.actualIn);
  const actOut = parseTimeToMinutes(params.actualOut);
  const totalWorkedMinutes = Math.max(0, actOut - actIn);
  const lateMinutes = Math.max(0, actIn - offIn);
  const earlyLeaveMinutes = Math.max(0, offOut - actOut);
  const netWorkedMinutes = Math.max(0, totalWorkedMinutes - Math.max(0, safeNum(params.breakMinutes)));

  return { totalWorkedMinutes, lateMinutes, earlyLeaveMinutes, netWorkedMinutes };
}

export function computeLeaveDaysInclusive(startDate: string, endDate: string): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function computeRemainingLeaveBalance(balance: HrLeaveBalance): number {
  return round2(
    safeNum(balance.previousBalance) + safeNum(balance.entitledDays) - safeNum(balance.usedDays)
  );
}

export function computeProgressiveAnnualTax(
  annualTaxableIncome: number,
  brackets: HrTaxBracket[]
): number {
  const taxable = safeNum(annualTaxableIncome);
  if (!(taxable > 0) || !Array.isArray(brackets) || brackets.length === 0) return 0;
  const sorted = [...brackets].sort((a, b) => safeNum(a.minAnnual) - safeNum(b.minAnnual));
  let totalTax = 0;

  for (const b of sorted) {
    const minAnnual = Math.max(0, safeNum(b.minAnnual));
    if (taxable <= minAnnual) continue;
    const upper =
      b.maxAnnual === null || b.maxAnnual === undefined
        ? taxable
        : Math.min(taxable, safeNum(b.maxAnnual, taxable));
    const slice = Math.max(0, upper - minAnnual);
    totalTax += (slice * Math.max(0, safeNum(b.ratePct))) / 100;
  }
  return round2(totalTax);
}

export function computeEmployeePayrollLine(params: {
  employee: HrEmployee;
  policy: HrPolicySettingsVersion;
  activeLoans: HrLoanRecord[];
  unexcusedAbsenceDays?: number;
}): HrPayrollLine {
  const { employee, policy, activeLoans, unexcusedAbsenceDays = 0 } = params;

  const funcWage = Math.max(0, safeNum(employee.functionalWage));
  const compWage = Math.max(0, safeNum(employee.complementaryWage));

  const allowancesAndRaises = round2(
    Math.max(0, safeNum(employee.periodicAllowances)) +
      Math.max(0, safeNum(employee.specialAllowances)) +
      Math.max(0, safeNum(employee.allowancesTotal))
  );
  const incentivesAndRewards = round2(
    Math.max(0, safeNum(employee.monthlyIncentives)) +
      Math.max(0, safeNum(employee.rewards)) +
      Math.max(0, safeNum(employee.extraEntitlements))
  );

  const grossEarnings = round2(
    funcWage + compWage + allowancesAndRaises + incentivesAndRewards
  );

  // التأمينات الاجتماعية مع مراعاة الحدين الأدنى والأقصى القابلين للتحديث
  const insurable = Math.max(0, safeNum(employee.insurableWage));
  const minInsurable = Math.max(0, safeNum(policy.minInsurableWage));
  const maxInsurable = Math.max(0, safeNum(policy.maxInsurableWage));
  const boundedInsurable = Math.min(
    Math.max(insurable, minInsurable),
    maxInsurable > 0 ? maxInsurable : Number.MAX_SAFE_INTEGER
  );
  const effectiveInsurable = insurable > 0 ? boundedInsurable : 0;

  const employeeInsurance = round2(
    (effectiveInsurable * Math.max(0, safeNum(policy.employeeInsuranceRatePct))) / 100
  );
  const employerInsurance = round2(
    (effectiveInsurable * Math.max(0, safeNum(policy.employerInsuranceRatePct))) / 100
  );

  // ضريبة كسب العمل طبقاً للشرائح والإعفاء القابلين للتحديث من الإعدادات
  const annualTaxableIncome = Math.max(
    0,
    grossEarnings * 12 -
      employeeInsurance * 12 -
      Math.max(0, safeNum(policy.annualTaxExemptionAmount))
  );
  const annualTax = computeProgressiveAnnualTax(annualTaxableIncome, policy.taxBrackets);
  const monthlyIncomeTax = round2(annualTax / 12);

  // السلف المستحقة
  const loanInstallmentDeduction = round2(
    (activeLoans || [])
      .filter(
        (l) =>
          l.employeeId === employee.id &&
          l.status === 'سارية' &&
          safeNum(l.remainingAmount) > 0
      )
      .reduce(
        (sum, l) =>
          sum +
          Math.max(0, Math.min(safeNum(l.installmentAmount), safeNum(l.remainingAmount))),
        0
      )
  );

  // أجر اليوم وفق لائحة الاحتساب (30 يوم أو أيام العمل الفعلية)
  const dayBasis = safeNum(policy.dayCalculationBasis);
  const dailyRate = dayBasis > 0 ? (funcWage + compWage) / dayBasis : 0;
  const absenceDeduction = round2(Math.max(0, safeNum(unexcusedAbsenceDays)) * dailyRate);
  const absenceAndPenaltiesDeduction = round2(
    absenceDeduction +
      Math.max(0, safeNum(employee.manualDeductions)) +
      Math.max(0, safeNum(employee.penalties))
  );

  const totalDeductions = round2(
    employeeInsurance +
      monthlyIncomeTax +
      loanInstallmentDeduction +
      absenceAndPenaltiesDeduction
  );
  const netSalary = round2(grossEarnings - totalDeductions);

  const maxAllowedLoanCeiling = round2(
    Math.max(0, netSalary + loanInstallmentDeduction) *
      (Math.max(0, safeNum(policy.maxLoanDeductionCeilingPct, 25)) / 100)
  );
  const exceedsLegalDeductionCeiling =
    loanInstallmentDeduction > 0 && loanInstallmentDeduction > maxAllowedLoanCeiling;

  return {
    id: `pay-${employee.id}`,
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    departmentName: employee.departmentName,
    functionalWage: round2(funcWage),
    complementaryWage: round2(compWage),
    allowancesAndRaises,
    incentivesAndRewards,
    grossEarnings,
    employeeInsurance,
    employerInsurance,
    monthlyIncomeTax,
    loanInstallmentDeduction,
    absenceAndPenaltiesDeduction,
    totalDeductions,
    netSalary,
    exceedsLegalDeductionCeiling,
  };
}

export function computeExactServiceDuration(
  startDateStr: string,
  endDateStr: string
): { years: number; months: number; days: number } | null {
  const s = new Date(startDateStr);
  const e = new Date(endDateStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return null;

  let years = e.getUTCFullYear() - s.getUTCFullYear();
  let months = e.getUTCMonth() - s.getUTCMonth();
  let days = e.getUTCDate() - s.getUTCDate();

  if (days < 0) {
    const prevMonthLastDay = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 0)).getUTCDate();
    days += prevMonthLastDay;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  return { years, months, days };
}
