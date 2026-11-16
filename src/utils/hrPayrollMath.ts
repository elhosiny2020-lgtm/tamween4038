import type {
  HrEmployee,
  HrLeaveBalance,
  HrLoanRecord,
  HrPayrollLine,
  HrPolicySettingsVersion,
  HrTaxBracket,
} from '../types/modules';
import { round2 } from './rationMathEngine';

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
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
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
  const netWorkedMinutes = Math.max(0, totalWorkedMinutes - Math.max(0, params.breakMinutes || 0));

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
    (balance.previousBalance || 0) + (balance.entitledDays || 0) - (balance.usedDays || 0)
  );
}

export function computeProgressiveAnnualTax(
  annualTaxableIncome: number,
  brackets: HrTaxBracket[]
): number {
  if (!(annualTaxableIncome > 0) || !Array.isArray(brackets) || brackets.length === 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.minAnnual - b.minAnnual);
  let totalTax = 0;

  for (const b of sorted) {
    if (annualTaxableIncome <= b.minAnnual) continue;
    const upper = b.maxAnnual === null ? annualTaxableIncome : Math.min(annualTaxableIncome, b.maxAnnual);
    const slice = Math.max(0, upper - b.minAnnual);
    totalTax += (slice * Math.max(0, b.ratePct)) / 100;
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

  const allowancesAndRaises = round2(
    (employee.periodicAllowances || 0) +
      (employee.specialAllowances || 0) +
      (employee.allowancesTotal || 0)
  );
  const incentivesAndRewards = round2(
    (employee.monthlyIncentives || 0) +
      (employee.rewards || 0) +
      (employee.extraEntitlements || 0)
  );

  const grossEarnings = round2(
    (employee.functionalWage || 0) +
      (employee.complementaryWage || 0) +
      allowancesAndRaises +
      incentivesAndRewards
  );

  // التأمينات الاجتماعية مع مراعاة الحدين الأدنى والأقصى القابلين للتحديث
  const boundedInsurable = Math.min(
    Math.max(employee.insurableWage || 0, policy.minInsurableWage || 0),
    policy.maxInsurableWage > 0 ? policy.maxInsurableWage : Number.MAX_SAFE_INTEGER
  );
  const effectiveInsurable = employee.insurableWage > 0 ? boundedInsurable : 0;

  const employeeInsurance = round2(
    (effectiveInsurable * Math.max(0, policy.employeeInsuranceRatePct || 0)) / 100
  );
  const employerInsurance = round2(
    (effectiveInsurable * Math.max(0, policy.employerInsuranceRatePct || 0)) / 100
  );

  // ضريبة كسب العمل طبقاً للشرائح والإعفاء القابلين للتحديث من الإعدادات
  const annualTaxableIncome = Math.max(
    0,
    grossEarnings * 12 - employeeInsurance * 12 - (policy.annualTaxExemptionAmount || 0)
  );
  const annualTax = computeProgressiveAnnualTax(annualTaxableIncome, policy.taxBrackets);
  const monthlyIncomeTax = round2(annualTax / 12);

  // السلف المستحقة
  const loanInstallmentDeduction = round2(
    activeLoans
      .filter((l) => l.employeeId === employee.id && l.status === 'سارية' && l.remainingAmount > 0)
      .reduce((sum, l) => sum + Math.min(l.installmentAmount, l.remainingAmount), 0)
  );

  // أجر اليوم وفق لائحة الاحتساب (30 يوم أو أيام العمل الفعلية)
  const dailyRate =
    policy.dayCalculationBasis > 0
      ? (employee.functionalWage + employee.complementaryWage) / policy.dayCalculationBasis
      : 0;
  const absenceDeduction = round2(Math.max(0, unexcusedAbsenceDays) * dailyRate);
  const absenceAndPenaltiesDeduction = round2(
    absenceDeduction + (employee.manualDeductions || 0) + (employee.penalties || 0)
  );

  const totalDeductions = round2(
    employeeInsurance +
      monthlyIncomeTax +
      loanInstallmentDeduction +
      absenceAndPenaltiesDeduction
  );
  const netSalary = round2(grossEarnings - totalDeductions);

  const maxAllowedLoanCeiling = round2(
    (netSalary + loanInstallmentDeduction) *
      (Math.max(0, policy.maxLoanDeductionCeilingPct || 25) / 100)
  );
  const exceedsLegalDeductionCeiling =
    loanInstallmentDeduction > 0 && loanInstallmentDeduction > maxAllowedLoanCeiling;

  return {
    id: `pay-${employee.id}`,
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    departmentName: employee.departmentName,
    functionalWage: round2(employee.functionalWage),
    complementaryWage: round2(employee.complementaryWage),
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
