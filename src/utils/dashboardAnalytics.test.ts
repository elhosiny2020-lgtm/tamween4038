import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeOperationalAndLicenseAlerts,
  buildDebtRiskTierBuckets,
  computeExecutiveSummary,
  formatCurrencyCompact,
} from './dashboardAnalytics';
import { Bakery, DebtRecord } from '../types';

function makeBakery(overrides: Partial<Bakery> = {}): Bakery {
  return {
    id: 'b-1',
    bakeryOwnerName: 'مخبز النور',
    machineNumber: '101',
    village: 'بشبيش',
    localUnit: 'بشبيش',
    insuranceQuota: 10,
    actualQuota: 10,
    insuranceValue: 7050,
    loavesCount: 6600,
    villagePopulation: 1000,
    perCapitaAverage: '6.60',
    beneficiaries2023: 1000,
    avg2023: '6.60',
    beneficiaries2024: 1050,
    avg2024: '6.29',
    beneficiaries2025: 1100,
    avg2025: '6.00',
    avgDiff: '-4.92',
    activityStatus: 'يعمل',
    breadType: 'بلدي مدعم ماو',
    breadTypeCount: 660,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    phone: '01000000000',
    nationalId: '29001011234567',
    commercialRegDate: '2027-05-01',
    bakeryLicenseDate: '2027-05-01',
    leaseAgreementDate: '2027-05-01',
    taxCardDate: '2027-05-01',
    ...overrides,
  };
}

function makeDebt(overrides: Partial<DebtRecord> = {}): DebtRecord {
  return {
    id: 'd-1',
    bakeryId: 'b-1',
    bakeryOwnerName: 'مخبز النور',
    machineNumber: '101',
    village: 'بشبيش',
    localUnit: 'بشبيش',
    violationDate: '2026-01-10',
    issuingEntity: 'إدارة التموين',
    violationType: 'نقص وزن',
    violationAmount: 10000,
    oldViolations: 0,
    totalViolations: 10000,
    violationPaymentDate: '',
    violationReceiptNumber: '',
    violationPaymentMethod: '',
    paidViolationAmount: 4000,
    remainingViolations: 6000,
    addedAmount: 0,
    addedPaymentDate: '',
    addedReceiptNumber: '',
    addedPaymentMethod: '',
    paidAddedAmount: 0,
    remainingAdded: 0,
    disposalDate: '',
    disposalBags: 0,
    disposalBagPrice: 0,
    disposalMultiplier: 1,
    disposalValue: 0,
    disposalPaymentDate: '',
    disposalReceiptNumber: '',
    disposalPaymentMethod: '',
    paidDisposalAmount: 0,
    remainingDisposal: 0,
    netRemainingDebt: 6000,
    ...overrides,
  };
}

describe('dashboardAnalytics pure helpers', () => {
  it('computes executive summary KPIs and percentages safely on empty inputs', () => {
    const empty = computeExecutiveSummary([], [], 25000);
    assert.equal(empty.bakeriesCount, 0);
    assert.equal(empty.totalRemainingDebt, 0);
    assert.equal(empty.collectionRatePercent, 0);
    assert.equal(empty.operationalRatePercent, 0);
    assert.equal(empty.quotaUtilizationPercent, 0);
  });

  it('computes collection rate, operational rate, quota utilization, and threshold exceedance', () => {
    const bakeries = [
      makeBakery({ id: 'b-1', activityStatus: 'يعمل', actualQuota: 12, insuranceQuota: 10, loavesCount: 7920 }),
      makeBakery({ id: 'b-2', activityStatus: 'متوقف كلي', actualQuota: 8, insuranceQuota: 10, loavesCount: 5280 }),
    ];
    const debts = [
      makeDebt({ id: 'd-1', bakeryId: 'b-1', netRemainingDebt: 30000, paidViolationAmount: 10000 }),
      makeDebt({ id: 'd-2', bakeryId: 'b-2', netRemainingDebt: 10000, paidViolationAmount: 10000 }),
    ];

    const summary = computeExecutiveSummary(bakeries, debts, 25000);
    assert.equal(summary.totalRemainingDebt, 40000);
    assert.equal(summary.totalPaidDebt, 20000);
    assert.equal(summary.collectionRatePercent, 33);
    assert.equal(summary.activeCount, 1);
    assert.equal(summary.stoppedCount, 1);
    assert.equal(summary.operationalRatePercent, 50);
    assert.equal(summary.totalActualQuota, 20);
    assert.equal(summary.totalInsuranceQuota, 20);
    assert.equal(summary.quotaUtilizationPercent, 100);
    assert.equal(summary.thresholdExceededCount, 1);
  });

  it('buckets bakery debt exposure into financial risk tiers accurately', () => {
    const debtMap = new Map<string, number>([
      ['b1', 5000],
      ['b2', 18000],
      ['b3', 32000],
      ['b4', 65000],
      ['b5', 0],
    ]);

    const buckets = buildDebtRiskTierBuckets(debtMap, 25000);
    assert.equal(buckets[0].bakeriesCount, 1);
    assert.equal(buckets[0].totalDebt, 5000);
    assert.equal(buckets[1].bakeriesCount, 1);
    assert.equal(buckets[2].bakeriesCount, 1);
    assert.equal(buckets[3].bakeriesCount, 1);
  });

  it('identifies expired, expiring soon, valid licenses, and stopped bakeries', () => {
    const refDate = new Date(2026, 4, 15); // 2026-05-15
    const bakeries = [
      makeBakery({
        id: 'b-1',
        activityStatus: 'متوقف جزئي',
        bakeryLicenseDate: '2026-05-01', // expired 14 days ago
        commercialRegDate: '2026-05-30', // expiring in 15 days
        leaseAgreementDate: '2027-01-01', // valid
        taxCardDate: '', // missing
      }),
    ];

    const res = analyzeOperationalAndLicenseAlerts(bakeries, refDate);
    assert.equal(res.expiredCount, 1);
    assert.equal(res.expiringSoonCount, 1);
    assert.equal(res.validCount, 1);
    assert.equal(res.missingCount, 1);
    assert.equal(res.alerts.length, 3);
    assert.equal(res.alerts[0].status, 'expired');
    assert.equal(res.alerts[1].status, 'expiring_soon');
    assert.equal(res.alerts[2].status, 'stopped');
  });

  it('formats compact currencies correctly', () => {
    assert.equal(formatCurrencyCompact(850), '850');
    assert.equal(formatCurrencyCompact(25000), '25.0 ألف');
    assert.equal(formatCurrencyCompact(1500000), '1.50 م');
  });
});
