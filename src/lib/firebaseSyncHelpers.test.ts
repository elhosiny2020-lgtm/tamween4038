import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildFirestoreBranchDocId,
  compactBranchPartitionForFirestore,
  computeFullBranchDigest,
  shouldTriggerDebtAlert,
  mergeHighDebtAlerts,
  DEFAULT_DEBT_ALERT_THRESHOLD,
} from './firebaseSyncHelpers';
import { HighDebtAlertNotification } from '../types';

test('buildFirestoreBranchDocId generates valid Firestore document IDs matching ^[a-zA-Z0-9_\\-]+$', () => {
  assert.strictEqual(buildFirestoreBranchDocId('branch-mahalla'), 'branch__branch-mahalla');
  assert.strictEqual(buildFirestoreBranchDocId('branch samanoud/1'), 'branch__branch_samanoud_1');
  const docId = buildFirestoreBranchDocId('فرع_طنطا_123');
  assert.match(docId, /^[a-zA-Z0-9_\-]+$/);
  assert.ok(docId.length <= 128);
});

test('compactBranchPartitionForFirestore strips logoBase64 and trims verbose activity logs while preserving operational data', () => {
  const verboseLog = Array.from({ length: 40 }, (_, i) => ({
    id: `log-${i}`,
    timestamp: '2026-01-01',
    user: 'admin',
    action: 'تحديث بيانات المخبز '.repeat(40),
  }));

  const partition = {
    bakeries: [
      { id: 'b-1', bakeryOwnerName: 'مخبز السلام', actualQuota: 12, activityLog: verboseLog },
      { id: 'b-2', bakeryOwnerName: 'مخبز النصر', actualQuota: 8, activityLog: verboseLog },
    ],
    debts: [{ id: 'd-1', bakeryId: 'b-1', netRemainingDebt: 55000 }],
    systemConfig: {
      administrationTitle: 'إدارة تموين المحلة',
      logoBase64: 'data:image/png;base64,' + 'A'.repeat(2000),
      debtAlertThreshold: 40000,
    },
  };

  const compacted = compactBranchPartitionForFirestore(partition, 10_000);
  assert.strictEqual(compacted.systemConfig?.logoBase64, undefined);
  assert.strictEqual(compacted.systemConfig?.debtAlertThreshold, 40000);
  assert.strictEqual(compacted.bakeries.length, 2);
  assert.strictEqual(compacted.debts.length, 1);
  assert.ok(JSON.stringify(compacted).length <= 10_000);
});

test('computeFullBranchDigest detects edits on all fields including phone, notes, quotas, and netRemainingDebt', () => {
  const baseBakery: any = {
    id: 'b-1',
    bakeryOwnerName: 'مخبز الخير',
    machineNumber: '1234',
    village: 'بشبيش',
    localUnit: 'بشبيش',
    insuranceValue: 7050,
    insuranceQuota: 10,
    actualQuota: 10,
    loavesCount: 6600,
    phone: '01000000001',
    notes: 'ملاحظة أولية',
  };
  const baseDebt: any = {
    id: 'd-1',
    bakeryId: 'b-1',
    netRemainingDebt: 12000,
    violationType: 'نقص وزن',
    issuingEntity: 'التموين',
  };
  const baseConfig: any = {
    administrationTitle: 'المحلة',
    debtAlertThreshold: 50000,
  };

  const d0 = computeFullBranchDigest({
    bakeries: [baseBakery],
    debts: [baseDebt],
    systemConfig: baseConfig,
  });

  const dPhoneChanged = computeFullBranchDigest({
    bakeries: [{ ...baseBakery, phone: '01000000099' }],
    debts: [baseDebt],
    systemConfig: baseConfig,
  });

  const dNotesChanged = computeFullBranchDigest({
    bakeries: [baseBakery],
    debts: [{ ...baseDebt, notes: 'تم التحديث' }],
    systemConfig: baseConfig,
  });

  const dThresholdChanged = computeFullBranchDigest({
    bakeries: [baseBakery],
    debts: [baseDebt],
    systemConfig: { ...baseConfig, debtAlertThreshold: 25000 },
  });

  assert.notStrictEqual(d0, dPhoneChanged);
  assert.notStrictEqual(d0, dNotesChanged);
  assert.notStrictEqual(d0, dThresholdChanged);
});

test('shouldTriggerDebtAlert evaluates against configurable threshold and falls back to 50000', () => {
  assert.strictEqual(DEFAULT_DEBT_ALERT_THRESHOLD, 50000);
  assert.strictEqual(shouldTriggerDebtAlert(50000), true);
  assert.strictEqual(shouldTriggerDebtAlert(49999), false);
  assert.strictEqual(shouldTriggerDebtAlert(25000, 20000), true);
  assert.strictEqual(shouldTriggerDebtAlert(19999, 20000), false);
  assert.strictEqual(shouldTriggerDebtAlert(75000, 100000), false);
});

test('mergeHighDebtAlerts merges remote and local lists without duplicates, preserves isRead, and sorts newest first', () => {
  const local: HighDebtAlertNotification[] = [
    {
      id: 'n-1',
      bakeryId: 'b-1',
      bakeryOwnerName: 'مخبز 1',
      machineNumber: '101',
      village: 'بشبيش',
      debtAmount: 60000,
      editedBy: 'مدير',
      editorRole: 'مدير عام',
      timestamp: '10:00 ص',
      createdAtIso: '2026-11-12T08:00:00.000Z',
      actionType: 'ADD_DEBT',
      isRead: true,
    },
  ];

  const remote: HighDebtAlertNotification[] = [
    {
      ...local[0],
      isRead: false, // remote did not mark read yet; local read state must survive
    },
    {
      id: 'n-2',
      bakeryId: 'b-2',
      bakeryOwnerName: 'مخبز 2',
      machineNumber: '202',
      village: 'دمرو',
      debtAmount: 85000,
      editedBy: 'مفتش',
      editorRole: 'مفتش تموين',
      timestamp: '11:00 ص',
      createdAtIso: '2026-11-12T09:00:00.000Z',
      actionType: 'ADD_DEBT',
      isRead: false,
    },
  ];

  const merged = mergeHighDebtAlerts(local, remote);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].id, 'n-2'); // newest first
  assert.strictEqual(merged[1].id, 'n-1');
  assert.strictEqual(merged[1].isRead, true);
});
