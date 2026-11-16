import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAttendanceMetrics,
  computeEmployeePayrollLine,
  computeExactServiceDuration,
  computeLeaveDaysInclusive,
  computeProgressiveAnnualTax,
  computeRemainingLeaveBalance,
  parseEgyptianNationalId,
} from './hrPayrollMath.ts';
import type { HrEmployee, HrLoanRecord, HrPolicySettingsVersion } from '../types/modules.ts';

test('parseEgyptianNationalId extracts birth date, gender, and validates 14 digits strictly', () => {
  const res = parseEgyptianNationalId('29005151601234'); // male (odd 13th digit 3), 1990-05-15
  assert.equal(res.valid, true);
  assert.equal(res.birthDate, '1990-05-15');
  assert.equal(res.gender, 'ذكر');

  assert.equal(parseEgyptianNationalId('123').valid, false);
  assert.equal(parseEgyptianNationalId('19005151601234').valid, false);
});

test('computeAttendanceMetrics & leave balances isolate categories and clamp late minutes to zero', () => {
  const onTime = computeAttendanceMetrics({
    officialStart: '08:00',
    officialEnd: '14:00',
    actualIn: '07:50',
    actualOut: '14:10',
    breakMinutes: 30,
  });
  assert.equal(onTime.lateMinutes, 0);
  assert.equal(onTime.earlyLeaveMinutes, 0);

  const late = computeAttendanceMetrics({
    officialStart: '08:00',
    officialEnd: '14:00',
    actualIn: '08:25',
    actualOut: '13:45',
  });
  assert.equal(late.lateMinutes, 25);
  assert.equal(late.earlyLeaveMinutes, 15);

  assert.equal(computeLeaveDaysInclusive('2026-11-01', '2026-11-05'), 5);
  assert.equal(
    computeRemainingLeaveBalance({
      employeeId: 'e1',
      leaveType: 'اعتيادية',
      previousBalance: 10,
      entitledDays: 21,
      usedDays: 6,
    }),
    25
  );
});

test('computeEmployeePayrollLine uses configurable policy insurance bounds and tax brackets cleanly', () => {
  const policy: HrPolicySettingsVersion = {
    id: 'pol-1',
    effectiveFrom: '2026-11',
    lawDecisionReference: 'لائحة قابلة للتحديث',
    dayCalculationBasis: 30,
    dailyWorkingHours: 6,
    employeeInsuranceRatePct: 11,
    employerInsuranceRatePct: 18.75,
    minInsurableWage: 2000,
    maxInsurableWage: 12000,
    annualTaxExemptionAmount: 20000,
    maxLoanDeductionCeilingPct: 25,
    taxBrackets: [
      { id: 'b1', minAnnual: 0, maxAnnual: 40000, ratePct: 0 },
      { id: 'b2', minAnnual: 40000, maxAnnual: 55000, ratePct: 10 },
    ],
    updatedBy: 'admin',
    updatedAt: '2026-11-01',
  };

  const emp: HrEmployee = {
    id: 'emp-1',
    branchId: 'b1',
    employeeCode: 'HR-001',
    nationalId: '29005151601234',
    fullName: 'محمد علي',
    birthDate: '1990-05-15',
    gender: 'ذكر',
    maritalStatus: 'متزوج',
    childrenCount: 2,
    address: 'المحلة',
    governorate: 'الغربية',
    district: 'المحلة الكبرى',
    village: 'بشبيش',
    phone: '01000000000',
    jobTitle: 'مفتش أول',
    qualitativeGroup: 'تنمية إدارية',
    jobGrade: 'الأولى',
    jobLevel: 'أ',
    departmentName: 'الرقابة',
    unitSection: 'التفتيش',
    workEntity: 'إدارة تموين المحلة',
    workSite: 'الديوان',
    hireDate: '2016-01-01',
    startWorkDate: '2016-01-10',
    appointmentType: 'دائم',
    appointmentDecisionNo: '10/2016',
    status: 'على رأس العمل',
    directManager: 'مدير الإدارة',
    fileNumber: 'F-10',
    functionalWage: 5000,
    complementaryWage: 2000,
    periodicAllowances: 500,
    specialAllowances: 0,
    monthlyIncentives: 1000,
    rewards: 0,
    allowancesTotal: 500,
    extraEntitlements: 0,
    insurableWage: 6000,
    manualDeductions: 0,
    penalties: 0,
  };

  const loans: HrLoanRecord[] = [
    {
      id: 'l1',
      branchId: 'b1',
      loanNumber: 'LN-1',
      employeeId: 'emp-1',
      totalAmount: 5000,
      disbursedDate: '2026-09-01',
      installmentsCount: 10,
      installmentAmount: 500,
      paidInstallments: 2,
      remainingAmount: 4000,
      status: 'سارية',
    },
  ];

  const line = computeEmployeePayrollLine({ employee: emp, policy, activeLoans: loans });
  // Gross = 5000+2000+(500+500)+(1000) = 9000
  assert.equal(line.grossEarnings, 9000);
  // Employee insurance = 6000 * 11% = 660; Employer = 6000 * 18.75% = 1125
  assert.equal(line.employeeInsurance, 660);
  assert.equal(line.employerInsurance, 1125);
  // Annual taxable = 9000*12 - 660*12 - 20000 = 108000 - 7920 - 20000 = 80080
  // Using test brackets: (55000-40000)*10% = 1500/yr => 125/mo
  assert.equal(computeProgressiveAnnualTax(50000, policy.taxBrackets), 1000);
  assert.equal(line.monthlyIncomeTax, 125);
  assert.equal(line.loanInstallmentDeduction, 500);
  assert.equal(line.totalDeductions, 1285);
  assert.equal(line.netSalary, 7715);

  const dur = computeExactServiceDuration('2016-01-01', '2026-11-16');
  assert.deepEqual(dur, { years: 10, months: 10, days: 15 });
});
