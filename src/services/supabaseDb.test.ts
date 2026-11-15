import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppState } from '../storage';
import {
  DEFAULT_ACTIVITY_STATUSES,
  DEFAULT_BAKERY_CATEGORIES,
  DEFAULT_BREAD_TYPES,
  DEFAULT_BREAD_TYPE_COUNTS,
  DEFAULT_COLUMN_TITLES,
  DEFAULT_FUEL_TYPES,
  DEFAULT_ISSUING_ENTITIES,
  DEFAULT_LEASE_CONTRACT_TYPES,
  DEFAULT_LINE_TYPES,
  DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_VIOLATION_TYPES,
  PAYMENT_METHODS,
} from '../defaultData';
import type { Bakery, DebtRecord } from '../types';
import {
  applyGranularRowChangeToState,
  resolveConflictWithServerRow,
  shouldApplyIncomingCloudStateForBranch,
} from './supabaseDb';

function makeEmptyState(branchId = 'branch-mahalla'): AppState {
  return {
    activeBranchId: branchId,
    branches: [
      {
        id: 'branch-mahalla',
        name: 'إدارة تموين مركز المحلة الكبرى',
        governorateTitle: 'محافظة الغربية',
        directorateTitle: 'مديرية التموين',
        createdAt: '2025-01-01',
        isDefault: true,
      },
    ],
    bakeries: [],
    debts: [],
    villages: [],
    issuingEntities: [...DEFAULT_ISSUING_ENTITIES],
    violationTypes: [...DEFAULT_VIOLATION_TYPES],
    activityStatuses: [...DEFAULT_ACTIVITY_STATUSES],
    bakeryCategories: [...DEFAULT_BAKERY_CATEGORIES],
    breadTypes: [...DEFAULT_BREAD_TYPES],
    breadTypeCounts: [...DEFAULT_BREAD_TYPE_COUNTS],
    lineTypes: [...DEFAULT_LINE_TYPES],
    fuelTypes: [...DEFAULT_FUEL_TYPES],
    leaseContractTypes: [...DEFAULT_LEASE_CONTRACT_TYPES],
    responsibleManagerOptions: [...DEFAULT_RESPONSIBLE_MANAGER_OPTIONS],
    paymentMethods: [...PAYMENT_METHODS],
    dailyTasks: [],
    inboxMessages: [],
    columnTitles: { ...DEFAULT_COLUMN_TITLES },
    systemConfig: { ...DEFAULT_SYSTEM_CONFIG },
    users: [],
    currentUser: null,
  };
}

function makeBakery(overrides: Partial<Bakery> = {}): Bakery {
  return {
    id: overrides.id || 'b-1',
    bakeryOwnerName: overrides.bakeryOwnerName || 'مخبز التوفيق',
    machineNumber: overrides.machineNumber || '1001',
    village: overrides.village || 'بشبيش',
    localUnit: overrides.localUnit || 'بشبيش',
    responsibleManager: 'أحمد علي',
    insuranceQuota: 10,
    actualQuota: 10,
    insuranceValue: 7050,
    loavesCount: 13500,
    villagePopulation: 10000,
    perCapitaAverage: '1.35',
    beneficiaries2023: 5000,
    avg2023: '2.70',
    beneficiaries2024: 5000,
    avg2024: '2.70',
    beneficiaries2025: 5000,
    avg2025: '2.70',
    avgDiff: '0.00',
    activityStatus: 'شغال',
    bakeryCategory: 'مخبز بلدي مدعم',
    breadType: 'بلدي مدعم ماو',
    flourBagPrice: 950,
    breadTypeCount: 660,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    phone: '01012345678',
    nationalId: '29001011601234',
    commercialRegDate: '2027-01-01',
    bakeryLicenseDate: '2027-01-01',
    leaseAgreementDate: '2027-01-01',
    taxCardDate: '2027-01-01',
    ...overrides,
  };
}

function makeDebt(overrides: Partial<DebtRecord> = {}): DebtRecord {
  return {
    id: overrides.id || 'd-1',
    bakeryId: overrides.bakeryId || 'b-1',
    bakeryOwnerName: overrides.bakeryOwnerName || 'مخبز التوفيق',
    machineNumber: overrides.machineNumber || '1001',
    village: overrides.village || 'بشبيش',
    localUnit: overrides.localUnit || 'بشبيش',
    violationDate: '2026-11-01',
    issuingEntity: 'الرقابة التموينية',
    violationType: 'نقص وزن',
    violationAmount: 2000,
    oldViolations: 500,
    totalViolations: 2500,
    violationPaymentDate: '',
    violationReceiptNumber: '',
    violationPaymentMethod: 'كاش',
    paidViolationAmount: 500,
    remainingViolations: 2000,
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
    netRemainingDebt: 2000,
    ...overrides,
  };
}

test('applyGranularRowChangeToState handles bakeries INSERT (camelCase & snake_case), UPDATE, and cascading DELETE', () => {
  let state = makeEmptyState();

  // 1. CamelCase INSERT (as emitted by PostgreSQL /api/db/* WebSocket)
  const b1 = makeBakery({ id: 'b-1', bakeryOwnerName: 'مخبز النصر' });
  state = applyGranularRowChangeToState(state, {
    table: 'bakeries',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: b1,
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.bakeries.length, 1);
  assert.equal(state.bakeries[0].bakeryOwnerName, 'مخبز النصر');

  // 2. Normalized snake_case INSERT (as emitted by Supabase postgres_changes)
  state = applyGranularRowChangeToState(state, {
    table: 'bakeries',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: {
      id: 'b-2',
      branch_id: 'branch-mahalla',
      machine_number: '2002',
      bakery_owner_name: 'مخبز الهدى',
      village: 'دمرو',
      local_unit: 'دمرو',
      insurance_quota: 10,
      actual_quota: 10,
      insurance_value: 7050,
      loaves_count: 13500,
      activity_status: 'شغال',
    },
    timestamp: '2026-11-15T10:01:00.000Z',
  });
  assert.equal(state.bakeries.length, 2);
  assert.equal(state.bakeries.find((b) => b.id === 'b-2')?.bakeryOwnerName, 'مخبز الهدى');

  // 3. Attach debt to b-1 then DELETE b-1 -> debt cascades cleanly
  state = applyGranularRowChangeToState(state, {
    table: 'debts',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: makeDebt({ id: 'd-1', bakeryId: 'b-1', netRemainingDebt: 3500 }),
    timestamp: '2026-11-15T10:02:00.000Z',
  });
  assert.equal(state.debts.length, 1);

  state = applyGranularRowChangeToState(state, {
    table: 'bakeries',
    eventType: 'DELETE',
    branchId: 'branch-mahalla',
    oldRow: { id: 'b-1' },
    timestamp: '2026-11-15T10:03:00.000Z',
  });
  assert.equal(state.bakeries.length, 1);
  assert.equal(state.bakeries[0].id, 'b-2');
  assert.equal(state.debts.length, 0);
});

test('applyGranularRowChangeToState synchronizes debts and recalculates linked fields on INSERT/UPDATE/DELETE', () => {
  let state = makeEmptyState();
  state.bakeries = [makeBakery({ id: 'b-1', bakeryOwnerName: 'مخبز الأمل', machineNumber: '555' })];

  const debt = makeDebt({
    id: 'd-10',
    bakeryId: 'b-1',
    violationAmount: 1000,
    oldViolations: 500,
    paidViolationAmount: 300,
  });
  state = applyGranularRowChangeToState(state, {
    table: 'debts',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: debt,
    timestamp: '2026-11-15T10:00:00.000Z',
  });

  assert.equal(state.debts.length, 1);
  assert.equal(state.debts[0].totalViolations, 1500);
  assert.equal(state.debts[0].remainingViolations, 1200);
  assert.equal(state.debts[0].netRemainingDebt, 1200);

  // Update debt payment
  state = applyGranularRowChangeToState(state, {
    table: 'debts',
    eventType: 'UPDATE',
    branchId: 'branch-mahalla',
    newRow: { ...debt, paidViolationAmount: 1000 },
    timestamp: '2026-11-15T10:01:00.000Z',
  });
  assert.equal(state.debts[0].netRemainingDebt, 500);

  // Delete debt
  state = applyGranularRowChangeToState(state, {
    table: 'debts',
    eventType: 'DELETE',
    branchId: 'branch-mahalla',
    oldRow: { id: 'd-10' },
    timestamp: '2026-11-15T10:02:00.000Z',
  });
  assert.equal(state.debts.length, 0);
});

test('applyGranularRowChangeToState enforces branch isolation for branch-scoped tables while allowing global branches updates', () => {
  let state = makeEmptyState('branch-mahalla');

  // Event from branch-samanoud should be ignored
  state = applyGranularRowChangeToState(state, {
    table: 'bakeries',
    eventType: 'INSERT',
    branchId: 'branch-samanoud',
    newRow: makeBakery({ id: 'b-other', bakeryOwnerName: 'مخبز سمنود' }),
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.bakeries.length, 0);

  // Global branch insertion is accepted even when activeBranchId is branch-mahalla
  state = applyGranularRowChangeToState(state, {
    table: 'branches',
    eventType: 'INSERT',
    newRow: {
      id: 'branch-tanta',
      name: 'إدارة تموين طنطا',
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين',
      createdAt: '2026-11-15',
    },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.branches?.length, 2);
  assert.ok(state.branches?.some((b) => b.id === 'branch-tanta'));

  state = applyGranularRowChangeToState(state, {
    table: 'branches',
    eventType: 'DELETE',
    oldRow: { id: 'branch-tanta' },
    timestamp: '2026-11-15T10:01:00.000Z',
  });
  assert.equal(state.branches?.length, 1);
});

test('applyGranularRowChangeToState handles villages, inbox_messages, daily_tasks, app_users, dropdown_lists, and system_config', () => {
  let state = makeEmptyState();

  // Villages
  state = applyGranularRowChangeToState(state, {
    table: 'villages',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: { village: 'بشبيش', localUnits: ['بشبيش', 'العامرية'] },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.villages.length, 1);
  assert.deepEqual(state.villages[0].localUnits, ['بشبيش', 'العامرية']);

  // Inbox messages (snake_case SQL shape)
  state = applyGranularRowChangeToState(state, {
    table: 'inbox_messages',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: {
      id: 'msg-1',
      branch_id: 'branch-mahalla',
      sender_id: 'u-1',
      sender_name: 'مدير النظام',
      sender_role: 'admin',
      recipient_target: 'ALL',
      recipient_label: 'الجميع',
      message_type: 'instruction',
      content: 'تنبيه هام للمفتشين',
      read_by: ['u-1'],
      timestamp: '2026-11-15T10:00:00.000Z',
    },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.inboxMessages?.length, 1);
  assert.equal(state.inboxMessages?.[0].content, 'تنبيه هام للمفتشين');

  // Daily tasks
  state = applyGranularRowChangeToState(state, {
    table: 'daily_tasks',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: {
      id: 't-1',
      title: 'حملة تفتيش',
      description: 'مراجعة أوزان الخبز',
      assignedTo: 'ALL',
      priority: 'high',
      status: 'pending',
      dueDate: '2026-11-16',
      createdAt: '2026-11-15',
      createdBy: 'admin',
    },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.dailyTasks?.length, 1);

  // App users
  state = applyGranularRowChangeToState(state, {
    table: 'app_users',
    eventType: 'INSERT',
    branchId: 'branch-mahalla',
    newRow: {
      id: 'u-9',
      username: 'inspector1',
      fullName: 'مفتش أول',
      role: 'inspector',
    },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].username, 'inspector1');

  // Dropdown lists
  state = applyGranularRowChangeToState(state, {
    table: 'dropdown_lists',
    eventType: 'UPDATE',
    branchId: 'branch-mahalla',
    newRow: { listKey: 'breadTypeCounts', options: ['660', '725', '800'] },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.deepEqual(state.breadTypeCounts, ['660', '725', '800']);

  state = applyGranularRowChangeToState(state, {
    table: 'dropdown_lists',
    eventType: 'UPDATE',
    branchId: 'branch-mahalla',
    newRow: { list_key: 'issuingEntities', options: ['مباحث التموين', 'الرقابة التموينية'] },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.deepEqual(state.issuingEntities, ['مباحث التموين', 'الرقابة التموينية']);

  // System config
  state = applyGranularRowChangeToState(state, {
    table: 'system_config',
    eventType: 'UPDATE',
    branchId: 'branch-mahalla',
    newRow: {
      payload: { debtAlertThreshold: 25000 },
      activityStatuses: ['شغال', 'متوقف كلي', 'متوقف للصيانة'],
    },
    timestamp: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(state.systemConfig.debtAlertThreshold, 25000);
  assert.deepEqual(state.activityStatuses, ['شغال', 'متوقف كلي', 'متوقف للصيانة']);
});

test('resolveConflictWithServerRow replaces stale optimistic record with latest server version', () => {
  let state = makeEmptyState();
  state.bakeries = [makeBakery({ id: 'b-1', bakeryOwnerName: 'نسخة محلية قديمة', actualQuota: 8 })];

  const resolved = resolveConflictWithServerRow(state, 'bakeries', 'branch-mahalla', {
    ...makeBakery({ id: 'b-1', bakeryOwnerName: 'نسخة الخادم المعتمدة', actualQuota: 14 }),
    version: 7,
  });

  assert.equal(resolved.bakeries.length, 1);
  assert.equal(resolved.bakeries[0].bakeryOwnerName, 'نسخة الخادم المعتمدة');
  assert.equal(resolved.bakeries[0].actualQuota, 14);
  assert.equal((resolved.bakeries[0] as any).version, 7);
});

test('shouldApplyIncomingCloudStateForBranch isolates flat and partitioned payloads per branch', () => {
  // Flat payload targeting branch-mahalla must never overwrite branch-samanoud
  assert.equal(
    shouldApplyIncomingCloudStateForBranch('branch-mahalla', {
      activeBranchId: 'branch-mahalla',
      bakeries: [],
    }),
    true
  );
  assert.equal(
    shouldApplyIncomingCloudStateForBranch('branch-samanoud', {
      activeBranchId: 'branch-mahalla',
      bakeries: [],
    }),
    false
  );

  // Legacy flat payload without activeBranchId defaults to branch-mahalla only
  assert.equal(
    shouldApplyIncomingCloudStateForBranch('branch-samanoud', {
      bakeries: [],
    }),
    false
  );

  // Partitioned payload only applies when the active branch has a partition entry
  assert.equal(
    shouldApplyIncomingCloudStateForBranch('branch-samanoud', {
      activeBranchId: 'branch-mahalla',
      branchPartitions: {
        'branch-samanoud': { bakeries: [makeBakery({ id: 'b-sam' })] },
      },
    }),
    true
  );
  assert.equal(
    shouldApplyIncomingCloudStateForBranch('branch-tanta', {
      activeBranchId: 'branch-mahalla',
      branchPartitions: {
        'branch-mahalla': { bakeries: [] },
      },
    }),
    false
  );
});
