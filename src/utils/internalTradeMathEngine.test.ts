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
  computeMovementLedgerBalances,
  detectDuplicateMovement,
  computeInternalTradeExecutiveDashboardStats,
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

    it('detects new merchants, stopped/removed merchants, insurance changes, and traderCode/POS changes between monthly sheets', () => {
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
        {
          traderCode: '1003',
          posMachineNumber: '316003',
          merchantName: 'سعيد عبد الله',
          nationalId: '27901011603333',
          phone: '01033333333',
          detailedAddress: 'دمرو',
          cashInsuranceAmount: 9000,
          activityStatus: 'نشط',
        },
      ];
      const next = [
        {
          traderCode: '1001-MOD',
          posMachineNumber: '316099',
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
      assert.equal(diff.stoppedMerchants.length, 2); // 1 status changed to متوقف + 1 removed from sheet
      assert.equal(diff.insuranceChanged.length, 1);
      assert.equal(diff.insuranceChanged[0].diff, 3000);
      assert.equal(diff.posOrCodeChanged.length, 1);
      assert.equal(diff.posOrCodeChanged[0].prev.traderCode, '1001');
      assert.equal(diff.posOrCodeChanged[0].curr.traderCode, '1001-MOD');
    });
  });

  describe('5. Movement Running Balance Ledger & Anti-Duplication Guard', () => {
    it('computes sequential chronological running balances across inbound and outbound movements', () => {
      const result = computeMovementLedgerBalances(1000, [
        { id: 'm2', entityCode: 'ST-1', date: '2026-05-03', movementType: 'صرف ومبيعات', quantity: 400, invoiceOrDocNumber: 'INV-2' },
        { id: 'm1', entityCode: 'ST-1', date: '2026-05-01', movementType: 'استلام وارد', quantity: 500, invoiceOrDocNumber: 'INV-1' },
      ]);
      assert.equal(result.totalInbound, 500);
      assert.equal(result.totalOutbound, 400);
      assert.equal(result.closingBalance, 1100);
      // Display sorted newest-first
      assert.equal(result.rows[0].movement.id, 'm2');
      assert.equal(result.rows[0].balanceBefore, 1500);
      assert.equal(result.rows[0].balanceAfter, 1100);
    });

    it('detects duplicate movement document/invoice numbers or identical same-day entries', () => {
      const existing = [
        { id: 'm1', entityCode: 'ST-1', date: '2026-05-01', movementType: 'استلام وارد', quantity: 5000, invoiceOrDocNumber: 'DOC-900' },
      ];
      const dupDoc = detectDuplicateMovement(existing, {
        id: 'm2',
        entityCode: 'ST-1',
        date: '2026-05-02',
        movementType: 'استلام وارد',
        quantity: 3000,
        invoiceOrDocNumber: 'DOC-900',
      });
      assert.equal(dupDoc.isDuplicate, true);

      const validEntry = detectDuplicateMovement(existing, {
        id: 'm3',
        entityCode: 'ST-1',
        date: '2026-05-02',
        movementType: 'استلام وارد',
        quantity: 3000,
        invoiceOrDocNumber: 'DOC-901',
      });
      assert.equal(validEntry.isDuplicate, false);
    });
  });

  describe('6. Internal Trade 14-Metric Executive Dashboard KPIs', () => {
    it('computes all 14 KPI counts accurately from underlying arrays', () => {
      const kpis = computeInternalTradeExecutiveDashboardStats({
        establishments: [
          { establishmentCode: 'E1', establishmentName: 'مستودع 1', establishmentType: 'مستودع بوتاجاز', village: 'بشبيش', activityStatus: 'نشط' },
          { establishmentCode: 'E2', establishmentName: 'محطة 2', establishmentType: 'محطة وقود', village: 'دمرو', activityStatus: 'نشط' },
          { establishmentCode: 'E3', establishmentName: 'محل 3', establishmentType: 'محل تجاري', village: 'بلقينا', activityStatus: 'مغلق' },
        ],
        campaigns: [
          { id: 'c1', finalReportSubmitted: true, inspectedCount: 2, visitedEstablishmentCodes: ['E1', 'E2'] },
          { id: 'c2', finalReportSubmitted: false, inspectedCount: 1, visitedEstablishmentCodes: [] },
        ],
        violations: [
          { establishmentCode: 'E1', establishmentName: 'مستودع 1', village: 'بشبيش', violationType: 'عدم إعلان أسعار أسطوانات بوتاجاز', status: 'جديد', reconciliationAmount: 0 },
          { establishmentCode: 'E1', establishmentName: 'مستودع 1', village: 'بشبيش', violationType: 'تلاعب في حصة بوتاجاز', status: 'تم التصالح', reconciliationAmount: 3000 },
          { establishmentCode: 'E2', establishmentName: 'محطة 2', village: 'دمرو', violationType: 'تصرف في كميات سولار', status: 'محال للنيابة', reconciliationAmount: 0 },
        ],
        seizures: [{ totalValue: 12500 }],
        complaints: [{ status: 'جديدة' }, { status: 'تم الفحص والحل' }],
        lpgVillageCirculation: [{ population: 10000, familiesCount: 2000, actualDisbursedQty: 4000 }],
      });

      assert.equal(kpis.totalEstablishments, 3);
      assert.equal(kpis.completedCampaigns, 1);
      assert.equal(kpis.activeCampaigns, 1);
      assert.equal(kpis.totalViolations, 3);
      assert.equal(kpis.reconciledViolations, 1);
      assert.equal(kpis.followUpViolations, 2);
      assert.equal(kpis.totalComplaints, 2);
      assert.equal(kpis.openComplaints, 1);
      assert.equal(kpis.resolvedComplaints, 1);
      assert.equal(kpis.lpgViolationsCount, 2);
      assert.equal(kpis.petroleumViolationsCount, 1);
      assert.equal(kpis.violatingEstablishmentsCount, 2);
      assert.equal(kpis.repeatOffenderEstablishmentsCount, 1);
      assert.equal(kpis.topRepeatOffenders[0].establishmentCode, 'E1');
      assert.equal(kpis.topRepeatOffenders[0].count, 2);
    });
  });
});


