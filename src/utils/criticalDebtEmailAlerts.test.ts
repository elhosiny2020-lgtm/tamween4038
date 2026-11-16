import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCriticalDebtEmailPayload,
  collectCriticalDebtBakeries,
  isValidEmailAddress,
  resolveSupervisorEmailRecipients,
  shouldTriggerDailyDebtEmailSchedule,
} from './criticalDebtEmailAlerts.ts';
import type { AppUser, Bakery, DailyAlertConfig, DebtRecord } from '../types.ts';

function makeBakery(id: string, owner: string, machine: string, village: string): Bakery {
  return {
    id,
    bakeryOwnerName: owner,
    machineNumber: machine,
    village,
    localUnit: `${village} الرئيسية`,
    responsibleManager: '',
    insuranceQuota: 10,
    actualQuota: 10,
    insuranceValue: 20000,
    insuranceCheckNumber: '101',
    loavesCount: 5000,
    villagePopulation: 10000,
    perCapitaAverage: '0.5',
    beneficiaries2023: 1000,
    avg2023: '0.5',
    beneficiaries2024: 1000,
    avg2024: '0.5',
    beneficiaries2025: 1000,
    avg2025: '0.5',
    avgDiff: '0',
    activityStatus: 'يعمل',
    bakeryCategory: 'بلدي',
    breadType: 'بلدي مدعم',
    flourBagPrice: 235,
    breadTypeCount: '660',
    lineType: 'آلي',
    fuelType: 'غاز طبيعي',
    phone: '01000000001',
    nationalId: '29001011600011',
    commercialRegNumber: '111',
    commercialRegDate: '2027-01-01',
    bakeryLicenseNumber: '222',
    bakeryLicenseDate: '2027-01-01',
    leaseContractType: 'تمليك',
    leaseAgreementDate: '2027-01-01',
    taxCardNumber: '333',
    taxCardDate: '2027-01-01',
  };
}

function makeDebt(id: string, bakeryId: string, remaining: number, paid = 0, date = '2026-11-10'): DebtRecord {
  return {
    id,
    bakeryId,
    bakeryOwnerName: 'مخبز اختبار',
    machineNumber: 'M-1',
    village: 'بشبيش',
    localUnit: 'بشبيش الرئيسية',
    violationDate: date,
    issuingEntity: 'التموين',
    violationType: 'نقص وزن',
    violationAmount: remaining + paid,
    oldViolations: 0,
    totalViolations: remaining + paid,
    violationPaymentDate: '',
    violationReceiptNumber: '',
    violationPaymentMethod: 'كاش',
    paidViolationAmount: paid,
    remainingViolations: remaining,
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
    netRemainingDebt: remaining,
  };
}

test('collectCriticalDebtBakeries aggregates debts per bakery, filters by threshold, and sorts descending', () => {
  const bakeries = [
    makeBakery('b-1', 'مخبز الأمل', '101', 'بشبيش'),
    makeBakery('b-2', 'مخبز النور', '102', 'دمرو'),
    makeBakery('b-3', 'مخبز السلام', '103', 'العامرية'),
  ];
  const debts = [
    makeDebt('d-1', 'b-1', 30000, 5000, '2026-11-01'),
    makeDebt('d-2', 'b-1', 25000, 0, '2026-11-12'), // b-1 total = 55,000 >= 50,000
    makeDebt('d-3', 'b-2', 49999, 1000, '2026-11-10'), // b-2 below threshold
    makeDebt('d-4', 'b-3', 90000, 10000, '2026-11-15'), // b-3 = 90,000 >= 50,000
  ];

  const critical = collectCriticalDebtBakeries(bakeries, debts, 50000);
  assert.equal(critical.length, 2);
  assert.equal(critical[0].bakeryId, 'b-3');
  assert.equal(critical[0].totalRemainingDebt, 90000);
  assert.equal(critical[0].excessAmount, 40000);
  assert.equal(critical[1].bakeryId, 'b-1');
  assert.equal(critical[1].totalRemainingDebt, 55000);
  assert.equal(critical[1].excessAmount, 5000);
  assert.equal(critical[1].unpaidRecordsCount, 2);
  assert.equal(critical[1].latestViolationDate, '2026-11-12');

  // Zero or invalid threshold produces empty list
  assert.equal(collectCriticalDebtBakeries(bakeries, debts, 0).length, 0);
});

test('resolveSupervisorEmailRecipients collects supervisor/admin emails, deduplicates case-insensitively, and validates addresses', () => {
  const users: AppUser[] = [
    { id: 'u1', username: 'sup1', fullName: 'أ/ مشرف أول', role: 'supervisor', gmailEmail: 'sup1@tamween.gov.eg' },
    { id: 'u2', username: 'adm1', fullName: 'أ/ مدير', role: 'admin', gmailEmail: 'admin@tamween.gov.eg' },
    { id: 'u3', username: 'view1', fullName: 'قارئ', role: 'viewer', gmailEmail: 'viewer@tamween.gov.eg' },
    { id: 'u4', username: 'sup_inactive', fullName: 'موقف', role: 'supervisor', gmailEmail: 'off@tamween.gov.eg', isActive: false },
    { id: 'u5', username: 'sup_bad', fullName: 'خطأ', role: 'supervisor', gmailEmail: 'not-an-email' },
  ];

  const resolved = resolveSupervisorEmailRecipients(users, {
    extraEmails: ['SUP1@tamween.gov.eg', 'extra.sup@gmail.com', 'invalid@@'],
    includeSystemSupervisors: true,
    fallbackDirectorateEmail: 'fallback@gmail.com',
  });

  assert.equal(resolved.length, 3);
  assert.deepEqual(
    resolved.map((r) => r.email.toLowerCase()),
    ['sup1@tamween.gov.eg', 'admin@tamween.gov.eg', 'extra.sup@gmail.com']
  );

  // When system supervisors excluded and manual list empty -> falls back to directorate email
  const fallbackOnly = resolveSupervisorEmailRecipients(users, {
    extraEmails: [],
    includeSystemSupervisors: false,
    fallbackDirectorateEmail: 'directorate@gmail.com',
  });
  assert.equal(fallbackOnly.length, 1);
  assert.equal(fallbackOnly[0].email, 'directorate@gmail.com');
  assert.equal(isValidEmailAddress('a@b.co'), true);
  assert.equal(isValidEmailAddress('bad'), false);
});

test('shouldTriggerDailyDebtEmailSchedule honors enabled flag, time window, and once-per-day guard', () => {
  const baseConfig: DailyAlertConfig = {
    enabled: true,
    alertTime: '09:00',
    notifyBrowser: true,
    notifySound: true,
    targetDocs: ['bakeryLicenseDate'],
    daysThreshold: 15,
    debtEmailEnabled: true,
    debtEmailAlertTime: '09:00',
    lastDebtEmailAlertDate: '',
  };

  // Before 09:00
  const early = new Date(2026, 10, 16, 8, 59, 0);
  assert.equal(shouldTriggerDailyDebtEmailSchedule(early, baseConfig).shouldRun, false);
  assert.equal(shouldTriggerDailyDebtEmailSchedule(early, baseConfig).reason, 'before_scheduled_time');

  // At or after 09:00
  const onTime = new Date(2026, 10, 16, 9, 15, 0);
  const resOnTime = shouldTriggerDailyDebtEmailSchedule(onTime, baseConfig);
  assert.equal(resOnTime.shouldRun, true);
  assert.equal(resOnTime.todayStr, '2026-11-16');

  // Already sent today in config
  const alreadySent = shouldTriggerDailyDebtEmailSchedule(onTime, {
    ...baseConfig,
    lastDebtEmailAlertDate: '2026-11-16',
  });
  assert.equal(alreadySent.shouldRun, false);
  assert.equal(alreadySent.reason, 'already_sent_today');

  // Disabled
  const disabled = shouldTriggerDailyDebtEmailSchedule(onTime, {
    ...baseConfig,
    debtEmailEnabled: false,
  });
  assert.equal(disabled.shouldRun, false);
  assert.equal(disabled.reason, 'disabled');
});

test('buildCriticalDebtEmailPayload renders escaped RTL HTML table and accurate aggregate debt', () => {
  const bakeries = [makeBakery('b-1', 'مخبز <الحرية>', '505', 'بشبيش')];
  const debts = [makeDebt('d-1', 'b-1', 75000, 0, '2026-11-15')];
  const critical = collectCriticalDebtBakeries(bakeries, debts, 50000);
  const recipients = resolveSupervisorEmailRecipients([], {
    extraEmails: ['sup@gmail.com'],
  });

  const payload = buildCriticalDebtEmailPayload({
    directorateTitle: 'مديرية التموين بالغربية',
    administrationTitle: 'إدارة تموين مركز المحلة الكبرى',
    criticalThreshold: 50000,
    alertTime: '09:00',
    dateStr: '2026-11-16',
    criticalBakeries: critical,
    recipients,
  });

  assert.equal(payload.totalCriticalDebt, 75000);
  assert.ok(payload.subject.includes('50,000'));
  assert.ok(payload.subject.includes('2026-11-16'));
  assert.ok(payload.htmlBody.includes('&lt;الحرية&gt;'));
  assert.ok(payload.htmlBody.includes('75,000 ج.م'));
  assert.ok(payload.textBody.includes('75,000'));
});
