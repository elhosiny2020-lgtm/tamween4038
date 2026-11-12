import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePerCapitaAverage,
  calculateLoavesCount,
  calculateRawLoavesFromInsuranceValue,
  calculateLoavesFromInsuranceValue,
  calculateInsuranceQuota,
  calculateInsuranceValueFromQuota,
  calculateLoavesCountFromFormula,
  calculatePerCapitaAverageFromFormula,
  calculateAnnualWeightedAveragesReport,
  recalculateAllDatabaseEquations,
  runComprehensiveAudit,
  addDropdownOption,
  editDropdownOption,
  deleteDropdownOption,
  filterAndSortDailyTasks,
  filterDebtsByAdvancedCriteria,
  extractBreadLoafMultiplier,
  calculateCumulativeDifference,
  calculateYearlyAverage,
  calculatePerBakeryAverage,
} from './auditHelper';
import { DailyBakeryTask } from '../types';

test('calculatePerCapitaAverage returns strictly 2 decimal places (not 3)', () => {
  assert.equal(calculatePerCapitaAverage(32400, 38500), '0.84');
  assert.equal(calculatePerCapitaAverage(27000, 30000), '0.90');
  assert.equal(calculatePerCapitaAverage(24300, 29400), '0.83');
  assert.equal(calculatePerCapitaAverage(0, 0), '0.00');
});

test('calculateLoavesFromInsuranceValue computes (insuranceValue * 3) / 235 with no intermediate rounding', () => {
  // 235 / 3 = 78.33333333333333 (NOT 78.33)
  assert.equal(calculateLoavesFromInsuranceValue(2538000), 32400);
  assert.equal(calculateLoavesFromInsuranceValue(1903500), 24300);
  assert.equal(calculateLoavesFromInsuranceValue(2115000), 27000);
  assert.equal(calculateLoavesFromInsuranceValue(2326500), 29700);
  assert.equal(calculateLoavesFromInsuranceValue(1692000), 21600);
  // Check raw unrounded precision
  const raw = calculateRawLoavesFromInsuranceValue(235);
  assert.equal(raw, 3);
});

test('calculateAnnualWeightedAveragesReport computes weighted general averages vs simple arithmetic averages accurately', () => {
  const report = calculateAnnualWeightedAveragesReport(INITIAL_BAKERIES);
  const sum23 = INITIAL_BAKERIES.reduce((s, b) => s + b.beneficiaries2023, 0);
  const sum24 = INITIAL_BAKERIES.reduce((s, b) => s + b.beneficiaries2024, 0);
  const sum25 = INITIAL_BAKERIES.reduce((s, b) => s + b.beneficiaries2025, 0);
  const totalLoaves = INITIAL_BAKERIES.reduce((s, b) => s + b.loavesCount, 0);
  assert.equal(report.totalBakeries, 5);
  assert.equal(report.totalLoaves, totalLoaves);
  assert.equal(report.totalBeneficiaries2023, sum23);
  assert.equal(report.totalBeneficiaries2024, sum24);
  assert.equal(report.totalBeneficiaries2025, sum25);
  // Weighted average = sum(loaves) / sum(beneficiaries)
  assert.equal(report.weightedAvg2023, (totalLoaves / sum23).toFixed(2));
  assert.equal(report.weightedAvg2024, (totalLoaves / sum24).toFixed(2));
  assert.equal(report.weightedAvg2025, (totalLoaves / sum25).toFixed(2));
});

test('recalculateAllDatabaseEquations normalizes and synchronizes all bakeries and debts idempotently', () => {
  const staleBakeries = INITIAL_BAKERIES.map((b, idx) =>
    idx === 0 ? { ...b, loavesCount: 999, perCapitaAverage: '0.123' } : b
  );
  const res = recalculateAllDatabaseEquations(staleBakeries, INITIAL_DEBTS);
  assert.equal(res.bakeries[0].loavesCount, 15840);
  assert.equal(res.bakeries[0].perCapitaAverage, '0.42');
  assert.equal(res.summary.updatedBakeriesCount >= 1, true);
});

test('runComprehensiveAudit passes all mathematical and 2-decimal checks', () => {
  assert.equal(calculateLoavesCount(20, 660), 13200);
  assert.equal(calculateLoavesCount(20, 725), 14500);
  const res = runComprehensiveAudit();
  assert.equal(res.passed, true);
  assert.equal(res.failedChecks, 0);
});

test('dropdown option helpers add, edit, and delete items cleanly', () => {
  const initial = ['نصف آلي', 'آلي كامل', 'يدوي'];
  const added = addDropdownOption(initial, 'ميكانيكي كامل');
  assert.deepEqual(added, ['نصف آلي', 'آلي كامل', 'يدوي', 'ميكانيكي كامل']);

  const edited = editDropdownOption(added, 'يدوي', 'يدوي مطور');
  assert.deepEqual(edited, ['نصف آلي', 'آلي كامل', 'يدوي مطور', 'ميكانيكي كامل']);

  const deleted = deleteDropdownOption(edited, 'نصف آلي');
  assert.deepEqual(deleted, ['آلي كامل', 'يدوي مطور', 'ميكانيكي كامل']);
});

test('filterAndSortDailyTasks prioritizes high > medium > low and uncompleted before completed', () => {
  const tasks: DailyBakeryTask[] = [
    {
      id: 't1',
      title: 'مهمة منخفضة',
      priority: 'low',
      dueDate: '2026-11-10',
      status: 'pending',
      createdAt: '2026-11-09',
    },
    {
      id: 't2',
      title: 'مهمة عالية مكتملة',
      priority: 'high',
      dueDate: '2026-11-10',
      status: 'completed',
      createdAt: '2026-11-09',
    },
    {
      id: 't3',
      title: 'مهمة عالية عاجلة',
      priority: 'high',
      dueDate: '2026-11-12',
      status: 'pending',
      createdAt: '2026-11-09',
    },
    {
      id: 't4',
      title: 'مهمة متوسطة',
      priority: 'medium',
      dueDate: '2026-11-11',
      status: 'in_progress',
      createdAt: '2026-11-09',
    },
  ];

  const sorted = filterAndSortDailyTasks(tasks);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['t3', 't4', 't1', 't2']
  );

  const highOnly = filterAndSortDailyTasks(tasks, { priorityFilter: 'high' });
  assert.equal(highOnly.length, 2);
});

import { hasPermission, getDefaultRolePermissionsMap } from '../permissions';
import { DEFAULT_COLUMN_TITLES, DEFAULT_SYSTEM_CONFIG } from '../defaultData';
import { AppUser } from '../types';

test('hasPermission honors SystemConfig.rolePermissions overrides per role (inspector, auditor, admin)', () => {
  const inspectorUser: AppUser = {
    id: 'u1',
    username: 'insp1',
    password: '123',
    fullName: 'مفتش تجريبي',
    role: 'inspector',
    createdAt: '2026-01-01',
  };

  // By default, inspector cannot delete bakery
  assert.equal(hasPermission(inspectorUser, 'DELETE_BAKERY', DEFAULT_SYSTEM_CONFIG), false);

  // When SystemConfig.rolePermissions grants DELETE_BAKERY and OPEN_BACKUP_HUB_MODAL to inspector
  const customConfig = {
    ...DEFAULT_SYSTEM_CONFIG,
    rolePermissions: {
      ...getDefaultRolePermissionsMap(),
      inspector: ['DELETE_BAKERY', 'OPEN_BACKUP_HUB_MODAL'],
    },
  };

  assert.equal(hasPermission(inspectorUser, 'DELETE_BAKERY', customConfig), true);
  assert.equal(hasPermission(inspectorUser, 'OPEN_BACKUP_HUB_MODAL', customConfig), true);
  assert.equal(hasPermission(inspectorUser, 'ADD_BAKERY', customConfig), false);
});

test('DEFAULT_COLUMN_TITLES has exact requested names for Quotas, Population, نوع المخابز, and سعر الشيكارة', () => {
  assert.equal(DEFAULT_COLUMN_TITLES.bakeryCategory, 'نوع المخابز');
  assert.equal(DEFAULT_COLUMN_TITLES.flourBagPrice, 'سعر الشيكارة');
  assert.equal(DEFAULT_COLUMN_TITLES.beneficiaries2023, 'مستفيد عام 2023');
  assert.equal(DEFAULT_COLUMN_TITLES.beneficiaries2024, 'مستفيدين عام 2024');
  assert.equal(DEFAULT_COLUMN_TITLES.beneficiaries2025, 'مستفيدين عام 2025');
  assert.equal(DEFAULT_COLUMN_TITLES.avg2023, 'متوسط عام 2023');
  assert.equal(DEFAULT_COLUMN_TITLES.avg2024, 'متوسط عام 2024');
  assert.equal(DEFAULT_COLUMN_TITLES.avg2025, 'متوسط عام 2025');
  assert.equal(DEFAULT_COLUMN_TITLES.avgDiff, 'الفرق التراكمي');
  assert.equal(DEFAULT_COLUMN_TITLES.perCapitaAverage, 'متوسط نصيب الفرد للمخبز');
});

import { mergeStates, AppState } from '../storage';
import {
  INITIAL_BAKERIES,
  INITIAL_DEBTS,
  DEFAULT_VILLAGES_HIERARCHY,
  DEFAULT_ISSUING_ENTITIES,
  DEFAULT_VIOLATION_TYPES,
  DEFAULT_ACTIVITY_STATUSES,
  DEFAULT_BAKERY_CATEGORIES,
  DEFAULT_BREAD_TYPES,
  DEFAULT_BREAD_TYPE_COUNTS,
  DEFAULT_LINE_TYPES,
  DEFAULT_FUEL_TYPES,
  PAYMENT_METHODS,
  INITIAL_DAILY_TASKS,
  INITIAL_INBOX_MESSAGES,
  INITIAL_USERS,
} from '../defaultData';

test('mergeStates merges JSON files additively without deleting existing bakeries, debts, users, or inboxMessages', () => {
  const baseState: AppState = {
    bakeries: INITIAL_BAKERIES.slice(0, 2),
    debts: INITIAL_DEBTS.slice(0, 1),
    villages: DEFAULT_VILLAGES_HIERARCHY,
    issuingEntities: DEFAULT_ISSUING_ENTITIES,
    violationTypes: DEFAULT_VIOLATION_TYPES,
    activityStatuses: DEFAULT_ACTIVITY_STATUSES,
    bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
    breadTypes: DEFAULT_BREAD_TYPES,
    breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
    lineTypes: DEFAULT_LINE_TYPES,
    fuelTypes: DEFAULT_FUEL_TYPES,
    paymentMethods: PAYMENT_METHODS,
    dailyTasks: INITIAL_DAILY_TASKS,
    inboxMessages: INITIAL_INBOX_MESSAGES.slice(0, 1),
    columnTitles: DEFAULT_COLUMN_TITLES,
    systemConfig: DEFAULT_SYSTEM_CONFIG,
    users: INITIAL_USERS,
    currentUser: null,
  };

  const incomingJson: Partial<AppState> = {
    bakeries: [INITIAL_BAKERIES[2]],
    debts: [INITIAL_DEBTS[1]],
    inboxMessages: [INITIAL_INBOX_MESSAGES[1]],
    users: [
      {
        id: 'u-gmail-99',
        username: 'gmail_inspector',
        fullName: 'مفتش جيميل',
        password: '123',
        role: 'inspector',
        gmailEmail: 'test@gmail.com',
        googleDriveAutoSync: true,
      },
    ],
  };

  const merged = mergeStates(baseState, incomingJson);
  assert.equal(merged.bakeries.length, 3);
  assert.equal(merged.debts.length, 2);
  assert.equal(merged.inboxMessages?.length, 2);
  assert.equal(merged.users.some((u: AppUser) => u.username === 'gmail_inspector'), true);
  assert.equal(merged.users.some((u: AppUser) => u.username === 'admin'), true);
});

test('filterDebtsByAdvancedCriteria filters debts accurately by date range (من - إلى) and violationType', () => {
  // INITIAL_DEBTS has:
  // d-201: violationDate '2026-10-15', violationType 'نقص وزن الرغيف البلدي المدعم'
  // d-202: violationDate '2026-10-02', violationType 'إنتاج خبز غير مطابق للمواصفات التموينية'
  // d-203: violationDate '2026-10-20', violationType 'تصرف في دقيق بلدي مدعم (شكاير)'

  // 1. Filter by date range: 2026-10-10 to 2026-10-18 -> should match only d-201
  const range1 = filterDebtsByAdvancedCriteria(INITIAL_DEBTS, {
    dateFrom: '2026-10-10',
    dateTo: '2026-10-18',
  });
  assert.equal(range1.length, 1);
  assert.equal(range1[0].id, 'd-201');

  // 2. Filter by dateFrom only: >= 2026-10-15 -> should match d-201 and d-203
  const range2 = filterDebtsByAdvancedCriteria(INITIAL_DEBTS, {
    dateFrom: '2026-10-15',
  });
  assert.deepEqual(
    range2.map((d) => d.id),
    ['d-201', 'd-203']
  );

  // 3. Filter by combined date range AND violationType
  const combined = filterDebtsByAdvancedCriteria(INITIAL_DEBTS, {
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
    violationType: 'تصرف في دقيق بلدي مدعم (شكاير)',
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'd-203');

  // 4. Filter outside date range -> 0 results
  const emptyRange = filterDebtsByAdvancedCriteria(INITIAL_DEBTS, {
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
  });
  assert.equal(emptyRange.length, 0);
});

test('calculateInsuranceQuota computes insuranceValue / 235 / 3 accurately', () => {
  // Example given by user: 7050 ÷ 235 ÷ 3 = 10
  assert.equal(calculateInsuranceQuota(7050), 10);
  assert.equal(calculateInsuranceQuota(14100), 20);
  assert.equal(calculateInsuranceQuota(16920), 24);
  assert.equal(calculateInsuranceQuota(0), 0);
  assert.equal(calculateInsuranceQuota(-500), 0);
  // Reverse equation: insuranceValue = insuranceQuota * 235 * 3
  assert.equal(calculateInsuranceValueFromQuota(10), 7050);
  assert.equal(calculateInsuranceValueFromQuota(20), 14100);
  assert.equal(calculateInsuranceValueFromQuota(24), 16920);
});

test('extractBreadLoafMultiplier and calculateLoavesCount determine multiplier and loaves count per bakery', () => {
  // 660 tests
  assert.equal(extractBreadLoafMultiplier('660'), 660);
  assert.equal(extractBreadLoafMultiplier('660 رغيفاً'), 660);
  assert.equal(extractBreadLoafMultiplier(660), 660);
  // 725 tests
  assert.equal(extractBreadLoafMultiplier('725'), 725);
  assert.equal(extractBreadLoafMultiplier('725 رغيفاً'), 725);
  assert.equal(extractBreadLoafMultiplier(725), 725);

  // calculateLoavesCount: actualQuota * multiplier
  assert.equal(calculateLoavesCount(20, 660), 13200);
  assert.equal(calculateLoavesCount(20, 725), 14500);
  assert.equal(calculateLoavesCount(24, '660 رغيفاً'), 15840);
  assert.equal(calculateLoavesCount(18, '725 رغيفاً'), 13050);
});

test('calculateYearlyAverage computes loavesCount / beneficiaries with division by zero safety', () => {
  assert.equal(calculateYearlyAverage(13200, 26400), '0.50');
  assert.equal(calculateYearlyAverage(13200, 27500), '0.48');
  assert.equal(calculateYearlyAverage(13200, 30000), '0.44');
  assert.equal(calculateYearlyAverage(13200, 0), '0.00');
  assert.equal(calculateYearlyAverage(13200, -10), '0.00');
});

test('calculateCumulativeDifference strictly computes avg2023 - avg2024 - avg2025', () => {
  // Strict formula: m2023 - m2024 - m2025
  // Example: 0.50 - 0.48 - 0.44 = -0.42
  assert.equal(calculateCumulativeDifference('0.50', '0.48', '0.44'), '-0.42');
  assert.equal(calculateCumulativeDifference(0.50, 0.48, 0.44), '-0.42');
  assert.equal(calculateCumulativeDifference('1.00', '0.90', '0.80'), '-0.70');
});

test('calculatePerBakeryAverage computes totalLoaves / beneficiaries2025', () => {
  assert.equal(calculatePerBakeryAverage(13200, 30000), '0.44');
  assert.equal(calculatePerBakeryAverage(15840, 37400), '0.42');
  assert.equal(calculatePerBakeryAverage(13050, 28900), '0.45');
  assert.equal(calculatePerBakeryAverage(13200, 0), '0.00');
});

import {
  calculateBakeriesColumnTotals,
  matchesVillageOrUnitFilter,
} from './auditHelper';

test('calculateBakeriesColumnTotals sums all beneficiaries, all averages, and all column cells accurately for villages and local units', () => {
  const bishbishBakeries = [
    INITIAL_BAKERIES[0],
    {
      ...INITIAL_BAKERIES[0],
      id: 'b-101-b',
      bakeryOwnerName: 'مخبز لومانة التجريبي',
      localUnit: 'لومانة',
      village: 'بشبيش',
    },
  ];

  // Filter by village بشبيش -> matches both بشبيش الرئيسية and لومانة
  const matchedVillage = bishbishBakeries.filter((b) =>
    matchesVillageOrUnitFilter(b, 'بشبيش', 'ALL', DEFAULT_VILLAGES_HIERARCHY)
  );
  assert.equal(matchedVillage.length, 2);

  // Filter by specific unit لومانة -> matches 1 bakery
  const matchedUnit = bishbishBakeries.filter((b) =>
    matchesVillageOrUnitFilter(b, 'بشبيش', 'لومانة', DEFAULT_VILLAGES_HIERARCHY)
  );
  assert.equal(matchedUnit.length, 1);

  const totals = calculateBakeriesColumnTotals(matchedVillage, { 'b-101': 5000, 'b-101-b': 3000 });
  assert.equal(totals.bakeryCount, 2);
  assert.equal(totals.remainingDebt, 8000);
  assert.equal(totals.beneficiaries2023, 34200 * 2);
  assert.equal(totals.beneficiaries2024, 35800 * 2);
  assert.equal(totals.beneficiaries2025, 37400 * 2);
  assert.equal(totals.avg2023, (0.46 * 2).toFixed(2));
  assert.equal(totals.avg2024, (0.44 * 2).toFixed(2));
  assert.equal(totals.avg2025, (0.42 * 2).toFixed(2));
  assert.equal(totals.perCapitaAverage, (0.42 * 2).toFixed(2));
});

import {
  DEFAULT_BRANCH_ID,
  DEFAULT_SUPPLY_BRANCHES,
  getScopedKeysForBranch,
  mergeUsersList,
  buildFullCloudMultiBranchPayload,
} from '../storage';

test('getScopedKeysForBranch isolates all keys (bakeries, debts, users, config/permissions, tools) per supply branch', () => {
  const mahallaKeys = getScopedKeysForBranch(DEFAULT_BRANCH_ID);
  const samanoudKeys = getScopedKeysForBranch('branch-samanoud');
  const customKeys = getScopedKeysForBranch('branch-zefta');

  // Default branch keeps exact backward-compatible keys so zero existing data is lost
  assert.equal(mahallaKeys.BAKERIES, 'TAMWEEN_BAKERIES_V3');
  assert.equal(mahallaKeys.DEBTS, 'TAMWEEN_DEBTS_V3');
  assert.equal(mahallaKeys.USERS, 'TAMWEEN_USERS_V3');
  assert.equal(mahallaKeys.CONFIG, 'TAMWEEN_CONFIG_V3');

  // Other branches get strictly isolated storage keys for operational data, users, and permissions
  assert.equal(samanoudKeys.BAKERIES, 'TAMWEEN_BAKERIES_V3__branch-samanoud');
  assert.equal(samanoudKeys.DEBTS, 'TAMWEEN_DEBTS_V3__branch-samanoud');
  assert.equal(samanoudKeys.USERS, 'TAMWEEN_USERS_V3__branch-samanoud');
  assert.equal(samanoudKeys.CONFIG, 'TAMWEEN_CONFIG_V3__branch-samanoud');
  assert.notEqual(mahallaKeys.BAKERIES, samanoudKeys.BAKERIES);
  assert.notEqual(mahallaKeys.USERS, samanoudKeys.USERS);
  assert.notEqual(mahallaKeys.CONFIG, samanoudKeys.CONFIG);
  assert.notEqual(samanoudKeys.USERS, customKeys.USERS);

  // Default branches list contains Mahalla and Samanoud
  assert.equal(DEFAULT_SUPPLY_BRANCHES.length >= 2, true);
  assert.equal(DEFAULT_SUPPLY_BRANCHES[0].id, 'branch-mahalla');
  assert.equal(DEFAULT_SUPPLY_BRANCHES[1].id, 'branch-samanoud');
});

test('mergeUsersList and buildFullCloudMultiBranchPayload preserve customized passwords, permissions, and isolated branch partitions', () => {
  const baseUsers = INITIAL_USERS.map((u) => ({ ...u }));
  const incomingWithUpdatedPass = INITIAL_USERS.map((u) =>
    u.username === 'admin'
      ? { ...u, password: 'MyNewSecretPassword999!', customPermissions: ['ADD_BAKERY', 'DELETE_BAKERY'] }
      : u
  );

  // 1. When incoming has customized password and base has default password -> adopts custom password & permissions
  const merged1 = mergeUsersList(baseUsers, incomingWithUpdatedPass);
  const admin1 = merged1.find((u) => u.username === 'admin');
  assert.equal(admin1?.password, 'MyNewSecretPassword999!');
  assert.deepEqual(admin1?.customPermissions, ['ADD_BAKERY', 'DELETE_BAKERY']);

  // 2. buildFullCloudMultiBranchPayload includes branchPartitions for all branches
  const samanoudState: AppState = {
    activeBranchId: 'branch-samanoud',
    branches: DEFAULT_SUPPLY_BRANCHES,
    bakeries: [],
    debts: [],
    villages: [],
    issuingEntities: DEFAULT_ISSUING_ENTITIES,
    violationTypes: DEFAULT_VIOLATION_TYPES,
    activityStatuses: DEFAULT_ACTIVITY_STATUSES,
    bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
    breadTypes: DEFAULT_BREAD_TYPES,
    breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
    lineTypes: DEFAULT_LINE_TYPES,
    fuelTypes: DEFAULT_FUEL_TYPES,
    paymentMethods: PAYMENT_METHODS,
    dailyTasks: [],
    inboxMessages: [],
    columnTitles: DEFAULT_COLUMN_TITLES,
    systemConfig: {
      ...DEFAULT_SYSTEM_CONFIG,
      administrationTitle: 'إدارة تموين سمنود',
      rolePermissions: { inspector: ['ADD_BAKERY'] },
    },
    users: merged1,
    currentUser: null,
  };

  const payload = buildFullCloudMultiBranchPayload(samanoudState, '2026-11-12T15:00:00Z');
  assert.equal(Boolean(payload.branchPartitions['branch-samanoud']), true);
  assert.equal(Boolean(payload.branchPartitions['branch-mahalla']), true);
  assert.equal(Boolean(payload.branchAuthVaults['branch-samanoud']), true);
  assert.equal(Boolean(payload.branchAuthVaults['branch-mahalla']), true);
  assert.deepEqual(payload.branchPartitions['branch-samanoud'].systemConfig?.rolePermissions, {
    ...getDefaultRolePermissionsMap(),
    inspector: ['ADD_BAKERY'],
  });
});

import {
  sanitizeBranchUsers,
  getBranchAuthVaultKey,
} from '../services/branchAuthVault';

test('branchAuthVault strictly isolates usernames, passwords, and permissions per branch without cross-branch leakage', () => {
  assert.equal(
    getBranchAuthVaultKey('branch-samanoud'),
    'TAMWEEN_BRANCH_AUTH_VAULT_V1__branch-samanoud'
  );
  assert.equal(
    getBranchAuthVaultKey('branch-mahalla'),
    'TAMWEEN_BRANCH_AUTH_VAULT_V1__branch-mahalla'
  );
  assert.notEqual(
    getBranchAuthVaultKey('branch-samanoud'),
    getBranchAuthVaultKey('branch-mahalla')
  );

  const mixedUsers: AppUser[] = [
    {
      id: 'u-samanoud-1',
      username: 'samanoud_mgr',
      password: 'SamanoudSecretPassword1!',
      fullName: 'مدير تموين سمنود',
      role: 'admin',
      branchId: 'branch-samanoud',
    },
    {
      id: 'u-mahalla-1',
      username: 'mahalla_mgr',
      password: 'MahallaSecretPassword2!',
      fullName: 'مدير تموين المحلة',
      role: 'admin',
      branchId: 'branch-mahalla',
    },
  ];

  const samanoudOnly = sanitizeBranchUsers(mixedUsers, 'branch-samanoud', 'إدارة تموين سمنود');
  const mahallaOnly = sanitizeBranchUsers(mixedUsers, 'branch-mahalla', 'إدارة تموين مركز المحلة الكبرى');

  // Samanoud vault must ONLY contain Samanoud user and NEVER see Mahalla user
  assert.equal(samanoudOnly.length, 1);
  assert.equal(samanoudOnly[0].username, 'samanoud_mgr');
  assert.equal(samanoudOnly[0].password, 'SamanoudSecretPassword1!');
  assert.equal(samanoudOnly[0].branchId, 'branch-samanoud');
  assert.equal(samanoudOnly.some((u) => u.username === 'mahalla_mgr'), false);

  // Mahalla vault must ONLY contain Mahalla user and NEVER see Samanoud user
  assert.equal(mahallaOnly.length, 1);
  assert.equal(mahallaOnly[0].username, 'mahalla_mgr');
  assert.equal(mahallaOnly[0].password, 'MahallaSecretPassword2!');
  assert.equal(mahallaOnly[0].branchId, 'branch-mahalla');
  assert.equal(mahallaOnly.some((u) => u.username === 'samanoud_mgr'), false);
});
