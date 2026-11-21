import test from 'node:test';
import assert from 'node:assert/strict';
import type { Bakery } from '../types.ts';
import { groupRecordsByLocalUnit } from './tableGroupingHelpers.ts';
import { computeReportSubtotalsByLocalUnitAndVillage } from '../services/modulesStorage.ts';
import { calculateBakeriesColumnTotals } from './auditHelper.ts';
import {
  buildBakeryChangeDiffSummary,
  createBakeryActivityLogItem,
  extractAllBakeryChangeHistory,
  filterBakeryChangeHistory,
  findLowFlourQuotaBakeries,
} from './bakeryAlertsAndHistory.ts';

function makeBakery(overrides: Partial<Bakery>): Bakery {
  return {
    id: overrides.id || 'b-1',
    bakeryOwnerName: overrides.bakeryOwnerName || 'أحمد محمود',
    machineNumber: overrides.machineNumber || '1001',
    village: overrides.village || 'بشبيش',
    localUnit: overrides.localUnit || 'وحدة بشبيش',
    insuranceQuota: overrides.insuranceQuota ?? 20,
    actualQuota: overrides.actualQuota ?? 15,
    insuranceValue: overrides.insuranceValue ?? 19000,
    loavesCount: overrides.loavesCount ?? 27000,
    villagePopulation: overrides.villagePopulation ?? 12000,
    perCapitaAverage: '2.25',
    beneficiaries2023: overrides.beneficiaries2023 ?? 8000,
    avg2023: '3.38',
    beneficiaries2024: overrides.beneficiaries2024 ?? 8500,
    avg2024: '3.18',
    beneficiaries2025: overrides.beneficiaries2025 ?? 9000,
    avg2025: '3.00',
    avgDiff: '-0.38',
    activityStatus: overrides.activityStatus || 'يعمل',
    breadType: 'بلدي مدعم',
    breadTypeCount: 660,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    phone: '01001234567',
    nationalId: '29001011234567',
    commercialRegDate: '2027-01-01',
    bakeryLicenseDate: '2027-01-01',
    leaseAgreementDate: '2027-01-01',
    taxCardDate: '2027-01-01',
    activityLog: overrides.activityLog,
  };
}

test('groupRecordsByLocalUnit hides unified population & beneficiaries with dash (—) in local unit subtotal and sums once per unit in grand total', () => {
  const rows = [
    { localUnit: 'وحدة بشبيش', population: 12000, beneficiaries: 9000, quota: 10 },
    { localUnit: 'وحدة بشبيش', population: 12000, beneficiaries: 9000, quota: 15 },
    { localUnit: 'وحدة دمرو', population: 18000, beneficiaries: 11000, quota: 20 },
    { localUnit: 'وحدة دمرو', population: 18000, beneficiaries: 11000, quota: 5 },
  ];

  const grouped = groupRecordsByLocalUnit({
    rows,
    getLocalUnit: (r) => r.localUnit,
    numericFields: [
      { key: 'population', getValue: (r) => r.population },
      { key: 'beneficiaries', getValue: (r) => r.beneficiaries },
      { key: 'quota', getValue: (r) => r.quota },
    ],
  });

  assert.equal(grouped.groups.length, 2);
  // Local unit subtotal rows display '—' for unified population & beneficiaries
  assert.equal(grouped.groups[0].subtotals.population, '—');
  assert.equal(grouped.groups[0].subtotals.beneficiaries, '—');
  assert.equal(grouped.groups[0].subtotals.quota, 25);

  assert.equal(grouped.groups[1].subtotals.population, '—');
  assert.equal(grouped.groups[1].subtotals.beneficiaries, '—');
  assert.equal(grouped.groups[1].subtotals.quota, 25);

  // Village / Grand total sums each local unit's unique value ONCE (12000+18000=30000, 9000+11000=20000)
  assert.equal(grouped.grandTotals.population, 30000);
  assert.equal(grouped.grandTotals.beneficiaries, 20000);
  assert.equal(grouped.grandTotals.quota, 50);
});

test('computeReportSubtotalsByLocalUnitAndVillage shows dash (—) for unified population/beneficiaries in localUnitTotals and sums unique unit values in villageTotals & grandTotalRow', () => {
  const headers = ['الاسم', 'الوحدة المحلية', 'القرية', 'عدد السكان', 'عدد المستفيدين', 'الحصة'];
  const rows: (string | number)[][] = [
    ['منفذ 1', 'وحدة بشبيش', 'بشبيش', 10000, 6000, 50],
    ['منفذ 2', 'وحدة بشبيش', 'بشبيش', 10000, 6000, 70],
    ['منفذ 3', 'وحدة المحلة', 'المحلة', 15000, 9000, 80],
  ];

  const summary = computeReportSubtotalsByLocalUnitAndVillage(headers, rows);
  assert.equal(summary.localUnitTotals[0].columnSums[3], '—');
  assert.equal(summary.localUnitTotals[0].columnSums[4], '—');
  assert.equal(summary.localUnitTotals[0].columnSums[5], 120);

  // Village subtotal keeps unique unit count (10000 and 6000, NOT doubled to 20000 and 12000)
  assert.equal(summary.villageTotals[0].columnSums[3], 10000);
  assert.equal(summary.villageTotals[0].columnSums[4], 6000);
  assert.equal(summary.villageTotals[0].columnSums[5], 120);
});

test('calculateBakeriesColumnTotals sets isUnifiedPopulation & isUnifiedBeneficiaries flags accurately for a single local unit', () => {
  const b1 = makeBakery({ id: 'b1', localUnit: 'وحدة 1', village: 'قرية أ', villagePopulation: 14000, beneficiaries2025: 9500 });
  const b2 = makeBakery({ id: 'b2', localUnit: 'وحدة 1', village: 'قرية أ', villagePopulation: 14000, beneficiaries2025: 9500 });
  const b3 = makeBakery({ id: 'b3', localUnit: 'وحدة 2', village: 'قرية أ', villagePopulation: 16000, beneficiaries2025: 10500 });

  const singleUnitTotals = calculateBakeriesColumnTotals([b1, b2]);
  assert.equal(singleUnitTotals.isUnifiedPopulation, true);
  assert.equal(singleUnitTotals.isUnifiedBeneficiaries2025, true);
  assert.equal(singleUnitTotals.villagePopulation, 14000);
  assert.equal(singleUnitTotals.beneficiaries2025, 9500);

  const villageTotals = calculateBakeriesColumnTotals([b1, b2, b3]);
  assert.equal(villageTotals.villagePopulation, 30000);
  assert.equal(villageTotals.beneficiaries2025, 20000);
});

test('findLowFlourQuotaBakeries detects active bakeries strictly below min sacks threshold and excludes cancelled/stopped bakeries', () => {
  const bakeries: Bakery[] = [
    makeBakery({ id: 'low-1', bakeryOwnerName: 'محمد علي', actualQuota: 4, activityStatus: 'يعمل' }),
    makeBakery({ id: 'low-2', bakeryOwnerName: 'حسن إبراهيم', actualQuota: 8.5, activityStatus: 'يعمل' }),
    makeBakery({ id: 'ok-1', bakeryOwnerName: 'سعيد كمال', actualQuota: 10, activityStatus: 'يعمل' }),
    makeBakery({ id: 'stopped-1', bakeryOwnerName: 'مخبز ملغى', actualQuota: 0, activityStatus: 'ملغى' }),
  ];

  const alerts = findLowFlourQuotaBakeries(bakeries, 10);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].bakeryId, 'low-1');
  assert.equal(alerts[0].deficitSacks, 6);
  assert.equal(alerts[1].bakeryId, 'low-2');
  assert.equal(alerts[1].deficitSacks, 1.5);
});

test('bakery historical change log extracts and filters accurately by owner name and modification date', () => {
  const b1 = makeBakery({
    id: 'b-hist-1',
    bakeryOwnerName: 'إبراهيم السيد عبد الرحمن',
    actualQuota: 12,
    activityLog: [
      createBakeryActivityLogItem({
        action: 'تعديل بيانات مخبز',
        details: 'الحصة الفعلية (شكائر): (15 ← 12)',
        user: { username: 'admin', fullName: 'م/ أحمد الحسيني', role: 'admin' },
        now: new Date('2026-05-10T09:30:00Z'),
      }),
    ],
  });
  const b2 = makeBakery({
    id: 'b-hist-2',
    bakeryOwnerName: 'محمود فتحي سالم',
    actualQuota: 20,
    activityLog: [
      createBakeryActivityLogItem({
        action: 'إضافة مخبز جديد',
        details: 'إضافة مخبز جديد',
        user: { username: 'supervisor1', fullName: 'أ/ سامي المشرف', role: 'supervisor' },
        now: new Date('2026-05-14T11:00:00Z'),
      }),
    ],
  });

  const diffText = buildBakeryChangeDiffSummary(b1, { ...b1, actualQuota: 9 });
  assert.match(diffText, /الحصة الفعلية/);
  assert.match(diffText, /12/);
  assert.match(diffText, /9/);

  const allEntries = extractAllBakeryChangeHistory([b1, b2]);
  assert.equal(allEntries.length, 2);
  // Sorted newest first
  assert.equal(allEntries[0].bakeryId, 'b-hist-2');

  // Filter by normalized Arabic owner name (without hamza)
  const byOwner = filterBakeryChangeHistory(allEntries, { ownerQuery: 'ابراهيم السيد' });
  assert.equal(byOwner.length, 1);
  assert.equal(byOwner[0].bakeryId, 'b-hist-1');

  // Filter by exact modification date
  const byDate = filterBakeryChangeHistory(allEntries, { exactDate: '2026-05-14' });
  assert.equal(byDate.length, 1);
  assert.equal(byDate[0].bakeryId, 'b-hist-2');
});
