import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCampaignViolationRate,
  calculateCampaignComplianceRate,
  calculateCampaignReportRate,
  calculateLpgVillageMetrics,
  calculatePetroleumVillageMetrics,
  aggregateVillageFuelBreakdown,
  compareMerchantArchiveSnapshots,
} from './internalTradeMathEngine';
import { buildMay2026RationMerchantsList } from '../data/may2026RationMerchants';

describe('Internal Trade, LPG & Petroleum, and May 2026 Ration Merchants Math Engine', () => {
  describe('1. Supply Campaigns Performance KPI Equations (with Zero-Division Protection)', () => {
    it('calculates violation, compliance, and report rates accurately', () => {
      assert.equal(calculateCampaignViolationRate(6, 24), 25);
      assert.equal(calculateCampaignComplianceRate(18, 24), 75);
      assert.equal(calculateCampaignReportRate(6, 24), 25);
    });

    it('prevents division by zero when inspected count is 0 or negative', () => {
      assert.equal(calculateCampaignViolationRate(5, 0), 0);
      assert.equal(calculateCampaignComplianceRate(10, -5), 0);
      assert.equal(calculateCampaignReportRate(3, 0), 0);
    });
  });

  describe('2. LPG Cylinders Circulation & Per-Capita Equations (in Cylinders)', () => {
    it('calculates daily, monthly, family, and annual per-capita in cylinders accurately', () => {
      const metrics = calculateLpgVillageMetrics({
        population: 50000,
        familiesCount: 10000,
        beneficiariesCount: 45000,
        prescribedMonthlyQuota: 15000,
        actualInboundQty: 14800,
        actualDisbursedQty: 14500,
        daysInMonth: 30,
      });

      assert.equal(metrics.remainingQty, 300); // 14800 - 14500
      assert.equal(metrics.quotaVariance, -500); // 14500 - 15000
      assert.equal(metrics.quotaExecutionPct, 96.67); // (14500 / 15000) * 100
      assert.equal(metrics.monthlyPerCapitaCylinders, 0.29); // 14500 / 50000
      assert.equal(metrics.familyMonthlyShareCylinders, 1.45); // 14500 / 10000
      assert.equal(metrics.annualPerCapitaCylinders, 3.48); // (14500 * 12) / 50000
      assert.equal(metrics.villageStatus, 'مكتفية');
    });

    it('classifies deficit villages and protects against zero population/families', () => {
      const deficit = calculateLpgVillageMetrics({
        population: 0,
        familiesCount: 0,
        beneficiariesCount: 0,
        prescribedMonthlyQuota: 10000,
        actualInboundQty: 8000,
        actualDisbursedQty: 7500,
      });

      assert.equal(deficit.monthlyPerCapitaCylinders, 0);
      assert.equal(deficit.familyMonthlyShareCylinders, 0);
      assert.equal(deficit.quotaExecutionPct, 75);
      assert.equal(deficit.villageStatus, 'تعاني من عجز');
    });
  });

  describe('3. Petroleum Products Circulation & Independent Per-Capita in Liters', () => {
    it('calculates closing balance and daily/monthly/annual per-capita in liters for a single fuel product', () => {
      const m = calculatePetroleumVillageMetrics({
        population: 40000,
        openingBalanceLiters: 10000,
        inboundLiters: 120000,
        disbursedLiters: 100000,
        prescribedQuotaLiters: 100000,
        daysInMonth: 30,
      });

      assert.equal(m.closingBalanceLiters, 30000); // 10000 + 120000 - 100000
      assert.equal(m.monthlyPerCapitaLiters, 2.5); // 100000 / 40000
      assert.equal(m.annualPerCapitaLiters, 30); // (100000 * 12) / 40000
      assert.equal(m.availabilityRatioPct, 100);
    });

    it('keeps each fuel type per-capita separate per village without mixing fuel products', () => {
      const breakdown = aggregateVillageFuelBreakdown([
        {
          village: 'بلقينا',
          localUnit: 'الوحدة المحلية ببلقينا',
          population: 50000,
          fuelType: 'بنزين 80',
          prescribedQuotaLiters: 50000,
          disbursedLiters: 50000,
        },
        {
          village: 'بلقينا',
          localUnit: 'الوحدة المحلية ببلقينا',
          population: 50000,
          fuelType: 'بنزين 92',
          prescribedQuotaLiters: 100000,
          disbursedLiters: 100000,
        },
        {
          village: 'بلقينا',
          localUnit: 'الوحدة المحلية ببلقينا',
          population: 50000,
          fuelType: 'السولار',
          prescribedQuotaLiters: 200000,
          disbursedLiters: 150000,
        },
      ]);

      assert.equal(breakdown.length, 1);
      const row = breakdown[0];
      assert.equal(row.gasoline80PerCapitaLiters, 1); // 50,000 / 50,000
      assert.equal(row.gasoline92PerCapitaLiters, 2); // 100,000 / 50,000
      assert.equal(row.dieselPerCapitaLiters, 3); // 150,000 / 50,000
      assert.equal(row.totalAllFuelsLiters, 300000);
    });
  });

  describe('4. May 2026 Ration Merchants Database (116 Merchants) & Monthly Diff Engine', () => {
    it('builds all 116 ration merchants with all required fields and statuses', () => {
      const merchants = buildMay2026RationMerchantsList('branch-main', 'إدارة تموين مركز المحلة الكبرى', []);
      assert.equal(merchants.length, 116);
      assert.ok(merchants.some((m) => m.activityStatus === 'نشط'));
      assert.ok(merchants.some((m) => m.activityStatus === 'متوقف'));
      assert.ok(merchants.some((m) => m.activityStatus === 'إجازة'));
      assert.ok(merchants.every((m) => m.traderCode && m.posMachineNumber));
      assert.ok(merchants.some((m) => m.reviewStatus === 'بيانات غير مكتملة'));
    });

    it('detects new merchants, stopped merchants, and insurance changes between monthly sheets', () => {
      const prev = [
        {
          traderCode: '1001',
          posMachineNumber: '316001',
          merchantName: 'أحمد محمد علي',
          nationalId: '28001011601111',
          phone: '01011111111',
          detailedAddress: 'بلقينا',
          cashInsuranceAmount: 12000,
          activityStatus: 'نشط',
        },
      ];
      const next = [
        {
          traderCode: '1001',
          posMachineNumber: '316001',
          merchantName: 'أحمد محمد علي',
          nationalId: '28001011601111',
          phone: '01011111111',
          detailedAddress: 'بلقينا',
          cashInsuranceAmount: 15000,
          activityStatus: 'متوقف',
        },
        {
          traderCode: '1002',
          posMachineNumber: '316002',
          merchantName: 'محمود حسن إبراهيم',
          nationalId: '28201011602222',
          phone: '01022222222',
          detailedAddress: 'صفط تراب',
          cashInsuranceAmount: 10000,
          activityStatus: 'نشط',
        },
      ];

      const diff = compareMerchantArchiveSnapshots(prev, next);
      assert.equal(diff.newMerchants.length, 1);
      assert.equal(diff.stoppedMerchants.length, 1);
      assert.equal(diff.insuranceChanged.length, 1);
      assert.equal(diff.insuranceChanged[0].diff, 3000);
    });
  });
});
