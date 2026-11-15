import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRowMutationQueue,
  coalesceRowMutation,
  enqueueRowMutation,
  getRowMutationQueueCount,
  loadRowMutationQueue,
  markRowMutationAttemptFailed,
  removeRowMutationById,
  type RowMutationEntry,
} from './offlineMutationQueue';

function makeEntry(overrides: Partial<RowMutationEntry> = {}): RowMutationEntry {
  return {
    id: overrides.id || 'rm-1',
    table: overrides.table || 'bakeries',
    operation: overrides.operation || 'INSERT',
    recordId: overrides.recordId || 'b-1',
    branchId: overrides.branchId || 'branch-mahalla',
    payload: overrides.payload ?? { id: 'b-1', bakeryOwnerName: 'مخبز النور' },
    expectedVersion: overrides.expectedVersion,
    timestamp: overrides.timestamp || '2026-11-15T10:00:00.000Z',
    attempts: overrides.attempts ?? 0,
    lastError: overrides.lastError,
  };
}

test('coalesceRowMutation merges INSERT + UPDATE into a single INSERT with latest payload', () => {
  const q1 = coalesceRowMutation(
    [],
    makeEntry({ id: 'e1', operation: 'INSERT', payload: { id: 'b-1', bakeryOwnerName: 'الاسم الأول' } })
  );
  const q2 = coalesceRowMutation(
    q1,
    makeEntry({
      id: 'e2',
      operation: 'UPDATE',
      payload: { id: 'b-1', bakeryOwnerName: 'الاسم المحدث' },
      timestamp: '2026-11-15T10:01:00.000Z',
    })
  );

  assert.equal(q2.length, 1);
  assert.equal(q2[0].operation, 'INSERT');
  assert.equal(q2[0].payload.bakeryOwnerName, 'الاسم المحدث');
  assert.equal(q2[0].timestamp, '2026-11-15T10:01:00.000Z');
});

test('coalesceRowMutation cancels out INSERT + DELETE so unsent record never hits server', () => {
  const q1 = coalesceRowMutation([], makeEntry({ operation: 'INSERT' }));
  const q2 = coalesceRowMutation(q1, makeEntry({ operation: 'DELETE' }));
  assert.equal(q2.length, 0);
});

test('coalesceRowMutation merges UPDATE + UPDATE preserving earliest expectedVersion and latest payload', () => {
  const q1 = coalesceRowMutation(
    [],
    makeEntry({
      operation: 'UPDATE',
      expectedVersion: 3,
      payload: { id: 'b-1', actualQuota: 12 },
    })
  );
  const q2 = coalesceRowMutation(
    q1,
    makeEntry({
      operation: 'UPDATE',
      expectedVersion: 4,
      payload: { id: 'b-1', actualQuota: 15 },
      timestamp: '2026-11-15T10:02:00.000Z',
    })
  );

  assert.equal(q2.length, 1);
  assert.equal(q2[0].operation, 'UPDATE');
  assert.equal(q2[0].expectedVersion, 3);
  assert.equal(q2[0].payload.actualQuota, 15);
});

test('coalesceRowMutation converts UPDATE + DELETE into DELETE while preserving expectedVersion', () => {
  const q1 = coalesceRowMutation(
    [],
    makeEntry({ operation: 'UPDATE', expectedVersion: 5, payload: { id: 'b-1' } })
  );
  const q2 = coalesceRowMutation(
    q1,
    makeEntry({ operation: 'DELETE', payload: { id: 'b-1', branchId: 'branch-mahalla' } })
  );

  assert.equal(q2.length, 1);
  assert.equal(q2[0].operation, 'DELETE');
  assert.equal(q2[0].expectedVersion, 5);
});

test('coalesceRowMutation keeps distinct records and distinct branches separate in FIFO order', () => {
  let q = coalesceRowMutation([], makeEntry({ recordId: 'b-1', branchId: 'branch-mahalla' }));
  q = coalesceRowMutation(q, makeEntry({ recordId: 'b-2', branchId: 'branch-mahalla' }));
  q = coalesceRowMutation(q, makeEntry({ recordId: 'b-1', branchId: 'branch-samanoud' }));

  assert.equal(q.length, 3);
  assert.deepEqual(
    q.map((x) => `${x.branchId}:${x.recordId}`),
    ['branch-mahalla:b-1', 'branch-mahalla:b-2', 'branch-samanoud:b-1']
  );
});

test('offlineMutationQueue persistence helpers enqueue, track failed attempts, remove by id, and clear cleanly', () => {
  clearRowMutationQueue();
  assert.equal(getRowMutationQueueCount(), 0);

  const first = enqueueRowMutation({
    table: 'bakeries',
    operation: 'INSERT',
    recordId: 'b-10',
    branchId: 'branch-mahalla',
    payload: { id: 'b-10', bakeryOwnerName: 'مخبز السلام' },
  });
  assert.equal(first.count, 1);

  const second = enqueueRowMutation({
    table: 'debts',
    operation: 'INSERT',
    recordId: 'd-10',
    branchId: 'branch-mahalla',
    payload: { id: 'd-10', bakeryId: 'b-10', netRemainingDebt: 1200 },
  });
  assert.equal(second.count, 2);
  assert.equal(getRowMutationQueueCount(), 2);

  const bEntry = loadRowMutationQueue().find((e) => e.recordId === 'b-10')!;
  assert.ok(bEntry);

  const afterFail = markRowMutationAttemptFailed(bEntry.id, 'Network timeout');
  const failedItem = afterFail.find((e) => e.id === bEntry.id)!;
  assert.equal(failedItem.attempts, 1);
  assert.equal(failedItem.lastError, 'Network timeout');

  const afterRemove = removeRowMutationById(bEntry.id);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].recordId, 'd-10');

  clearRowMutationQueue();
  assert.equal(getRowMutationQueueCount(), 0);
});
