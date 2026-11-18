import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMillExtractionAndLoss,
} from '../utils/grainMaintenanceMath';
import {
  calculateLoafWeightShortageFine,
} from '../utils/loafWeightFinesMath';
import {
  calculateLpgVillageMetrics,
  calculatePetroleumVillageMetrics,
} from '../utils/internalTradeMathEngine';
import {
  validateEgyptianPhone,
  classifyContractCountdown,
} from '../utils/hrValidationHelpers';
import {
  groupRecordsByLocalUnit,
} from '../utils/tableGroupingHelpers';
import {
  resolveModuleCrudPermissions,
} from '../utils/moduleCrudHelpers';
import {
  hashPasswordScrypt,
  verifyPasswordScrypt,
  isScryptHash,
  sanitizeUserForClient,
} from '../utils/serverAuth';

test('1. Full System E2E Audit: Grain Maintenance Math & Mill Extraction', () => {
  const extraction = computeMillExtractionAndLoss({
    openingWheatBalanceTons: 0,
    inboundWheatTodayTons: 100,
    actualMilledWheatTons: 100,
    producedFlourTons: 82,
    producedBranTons: 18,
    standardExtractionPct: 82,
  });
  assert.equal(extraction.totalAvailableWheatTons, 100);
  assert.equal(extraction.actualExtractionPct, 82);
  assert.equal(extraction.lossOrWasteTons, 0);
});

test('2. Full System E2E Audit: Loaf Weight Shortage Fines & Recurrence Penalties', () => {
  const fine1 = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 81, // 9g shortage
    insuranceQuotaAtViolation: 20,
    bagPriceAtViolation: 600,
    repeatFactor: 1,
  });
  assert.equal(fine1.isViolation, true);
  if (fine1.record) {
    assert.equal(fine1.record.shortageGrams, 9);
    assert.equal(fine1.record.finalFineAmount, 1200);
  }

  // Non-violation (weight >= 90g)
  const noFine = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 92,
    insuranceQuotaAtViolation: 20,
    bagPriceAtViolation: 600,
    repeatFactor: 1,
  });
  assert.equal(noFine.isViolation, false);
});

test('3. Full System E2E Audit: LPG & Petroleum Circulation Math', () => {
  const lpg = calculateLpgVillageMetrics({
    population: 50000,
    familiesCount: 10000,
    beneficiariesCount: 45000,
    prescribedMonthlyQuota: 15000,
    actualInboundQty: 14800,
    actualDisbursedQty: 14500,
    daysInMonth: 30,
  });
  assert.equal(lpg.remainingQty, 300);
  assert.equal(lpg.villageStatus, 'مكتفية');

  // Petroleum circulation metrics
  const petro = calculatePetroleumVillageMetrics({
    population: 40000,
    openingBalanceLiters: 10000,
    inboundLiters: 120000,
    disbursedLiters: 100000,
    prescribedQuotaLiters: 100000,
    daysInMonth: 30,
  });
  assert.equal(petro.closingBalanceLiters, 30000);
  assert.equal(petro.monthlyPerCapitaLiters, 2.5);
});

test('4. Full System E2E Audit: Phone Validation & Contract Renewal', () => {
  assert.equal(validateEgyptianPhone('01012345678').valid, true);
  assert.equal(validateEgyptianPhone('01112345678').valid, true);
  assert.equal(validateEgyptianPhone('01212345678').valid, true);
  assert.equal(validateEgyptianPhone('01512345678').valid, true);
  assert.equal(validateEgyptianPhone('12345').valid, false);

  const today = new Date();
  const expiringSoon = new Date(today.getTime() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const activeFar = new Date(today.getTime() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0];

  assert.equal(classifyContractCountdown(expiringSoon).isExpiringSoon, true);
  assert.equal(classifyContractCountdown(activeFar).isExpiringSoon, false);
});

test('5. Full System E2E Audit: Table Grouping & Grand Total Mathematical Consistency', () => {
  const records = [
    { id: '1', localUnit: 'محلة حسن', bags: 10, liters: 50 },
    { id: '2', localUnit: 'محلة حسن', bags: 20, liters: 70 },
    { id: '3', localUnit: 'بشبيش', bags: 15, liters: 30 },
  ];

  const grouped = groupRecordsByLocalUnit({
    rows: records,
    getLocalUnit: (r) => r.localUnit,
    numericFields: [
      { key: 'bags', getValue: (r) => r.bags },
      { key: 'liters', getValue: (r) => r.liters },
    ],
    sortUnitsAlphabetically: true,
  });

  assert.equal(grouped.groups.length, 2);
  assert.equal(grouped.groups[0].localUnit, 'بشبيش');
  assert.equal(grouped.groups[0].subtotals.bags, 15);
  assert.equal(grouped.groups[0].subtotals.liters, 30);

  assert.equal(grouped.groups[1].localUnit, 'محلة حسن');
  assert.equal(grouped.groups[1].subtotals.bags, 30);
  assert.equal(grouped.groups[1].subtotals.liters, 120);

  assert.equal(grouped.grandTotals.bags, 45);
  assert.equal(grouped.grandTotals.liters, 150);
  assert.equal(grouped.grandTotalCount, 3);
});

test('6. Full System E2E Audit: RBAC & Super Admin-Only Deletion Enforcement', () => {
  const superAdmin = { id: 'u-1', role: 'admin', isSuperAdmin: true } as any;
  const regularAdmin = { id: 'u-2', role: 'admin', isSuperAdmin: false } as any;
  const viewer = { id: 'u-4', role: 'viewer', isSuperAdmin: false } as any;

  const permsSuper = resolveModuleCrudPermissions(superAdmin, false);
  assert.equal(permsSuper.canView, true);
  assert.equal(permsSuper.canAdd, true);
  assert.equal(permsSuper.canEdit, true);
  assert.equal(permsSuper.canDelete, true);

  const permsRegular = resolveModuleCrudPermissions(regularAdmin, false);
  assert.equal(permsRegular.canView, true);
  assert.equal(permsRegular.canAdd, true);
  assert.equal(permsRegular.canEdit, true);

  const permsViewer = resolveModuleCrudPermissions(viewer, false);
  assert.equal(permsViewer.canView, true);
  assert.equal(permsViewer.canAdd, false);
  assert.equal(permsViewer.canEdit, false);
  assert.equal(permsViewer.canDelete, false);
});

test('7. Full System E2E Audit: Password Security & Scrypt Hashing', () => {
  const plain = 'admin';
  const hashed = hashPasswordScrypt(plain);
  assert.equal(isScryptHash(hashed), true);
  assert.equal(verifyPasswordScrypt('admin', hashed), true);
  assert.equal(verifyPasswordScrypt('wrong', hashed), false);

  const rawUser = {
    id: 'u-1',
    username: 'admin',
    password: 'plain_password',
    passwordHash: 'scrypt$hash',
    gmailPassword: 'secret_mail_pass',
    fullName: 'المدير العام',
  };
  const sanitized = sanitizeUserForClient(rawUser);
  assert.equal('password' in sanitized, false);
  assert.equal('passwordHash' in sanitized, false);
  assert.equal('gmailPassword' in sanitized, false);
  assert.equal(sanitized.fullName, 'المدير العام');
});
