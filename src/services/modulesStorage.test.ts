import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialBranchModulesBundle,
  createEmptyBranchModulesBundle,
  upgradeModulesBundleIfNeeded,
} from './modulesStorage';
import { factoryResetBranch, DEFAULT_BRANCH_ID, getScopedKeysForBranch } from '../storage';
import { DEFAULT_VILLAGES_HIERARCHY } from '../defaultData';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

test('upgradeModulesBundleIfNeeded NEVER resurrects deleted Ration Commodities merchants', () => {
  const initial = createInitialBranchModulesBundle(
    DEFAULT_BRANCH_ID,
    'إدارة تموين مركز المحلة الكبرى',
    DEFAULT_VILLAGES_HIERARCHY
  );
  const originalCount = initial.ration.merchants.length;
  assert.ok(originalCount >= 116, `Expected >= 116 seeded merchants, got ${originalCount}`);

  // Delete 1 merchant
  const afterOneDelete = {
    ...initial,
    ration: {
      ...initial.ration,
      merchants: initial.ration.merchants.slice(1),
    },
  };
  const { bundle: upgradedOne } = upgradeModulesBundleIfNeeded(
    afterOneDelete,
    DEFAULT_BRANCH_ID,
    'إدارة تموين مركز المحلة الكبرى',
    DEFAULT_VILLAGES_HIERARCHY
  );
  assert.equal(upgradedOne.ration.merchants.length, originalCount - 1);

  // Delete ALL merchants (0 left) — must remain 0, never re-seed!
  const afterDeleteAll = {
    ...initial,
    ration: {
      ...initial.ration,
      merchants: [],
    },
  };
  const { bundle: upgradedAll } = upgradeModulesBundleIfNeeded(
    afterDeleteAll,
    DEFAULT_BRANCH_ID,
    'إدارة تموين مركز المحلة الكبرى',
    DEFAULT_VILLAGES_HIERARCHY
  );
  assert.equal(upgradedAll.ration.merchants.length, 0);
});

test('upgradeModulesBundleIfNeeded respects intentionally emptied Grain Maintenance collections', () => {
  const initial = createInitialBranchModulesBundle(
    DEFAULT_BRANCH_ID,
    'إدارة تموين مركز المحلة الكبرى',
    DEFAULT_VILLAGES_HIERARCHY
  );
  const emptied = {
    ...initial,
    grainMaintenance: {
      ...initial.grainMaintenance,
      shunas: [],
      mills: [],
      refrigerators: [],
    },
  };
  const { bundle: upgraded } = upgradeModulesBundleIfNeeded(
    emptied,
    DEFAULT_BRANCH_ID,
    'إدارة تموين مركز المحلة الكبرى',
    DEFAULT_VILLAGES_HIERARCHY
  );
  assert.equal(upgraded.grainMaintenance.shunas?.length, 0);
  assert.equal(upgraded.grainMaintenance.mills?.length, 0);
  assert.equal(upgraded.grainMaintenance.refrigerators?.length, 0);
});

test('createEmptyBranchModulesBundle marks factoryResetAt so reload stays empty', () => {
  const empty = createEmptyBranchModulesBundle(
    'branch-samanoud',
    'إدارة تموين سمنود',
    DEFAULT_VILLAGES_HIERARCHY
  );
  assert.equal(empty.ration.merchants.length, 0);
  assert.ok(empty.seedMeta?.factoryResetAt);
  const { bundle: afterUpgrade } = upgradeModulesBundleIfNeeded(
    empty,
    'branch-samanoud',
    'إدارة تموين سمنود',
    DEFAULT_VILLAGES_HIERARCHY
  );
  assert.equal(afterUpgrade.ration.merchants.length, 0);
  assert.equal(afterUpgrade.internalTrade?.establishments.length, 0);
  assert.equal(afterUpgrade.hr.employees.length, 0);
});

test('factoryResetBranch wipes ONLY target branch data while preserving other branches intact', async () => {
  const mem = new MemoryStorage();
  const prevStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = mem;

  try {
    const mahallaKeys = getScopedKeysForBranch('branch-mahalla');
    const samanoudKeys = getScopedKeysForBranch('branch-samanoud');

    mem.setItem('TAMWEEN_BRANCHES_LIST_V1', JSON.stringify([{ id: 'branch-mahalla' }, { id: 'branch-samanoud' }]));
    mem.setItem('TAMWEEN_ACTIVE_BRANCH_ID_V1', 'branch-samanoud');

    // Populate both branches
    mem.setItem(mahallaKeys.BAKERIES, JSON.stringify([{ id: 'b-m-1' }, { id: 'b-m-2' }]));
    mem.setItem(mahallaKeys.DEBTS, JSON.stringify([{ id: 'd-m-1' }]));
    mem.setItem('tamween_branch_modules_v1::branch-mahalla', JSON.stringify({ branchId: 'branch-mahalla', marker: 'keep-mahalla' }));

    mem.setItem(samanoudKeys.BAKERIES, JSON.stringify([{ id: 'b-s-1' }]));
    mem.setItem(samanoudKeys.DEBTS, JSON.stringify([{ id: 'd-s-1' }]));
    mem.setItem('tamween_branch_modules_v1::branch-samanoud', JSON.stringify({ branchId: 'branch-samanoud', marker: 'wipe-samanoud' }));

    // Factory reset ONLY branch-samanoud
    await factoryResetBranch('branch-samanoud');

    // Samanoud is wiped to empty arrays & module cache removed
    assert.deepEqual(JSON.parse(mem.getItem(samanoudKeys.BAKERIES) || 'null'), []);
    assert.deepEqual(JSON.parse(mem.getItem(samanoudKeys.DEBTS) || 'null'), []);
    assert.equal(mem.getItem('tamween_branch_modules_v1::branch-samanoud'), null);

    // Mahalla & Branches List remain 100% untouched!
    assert.equal(JSON.parse(mem.getItem(mahallaKeys.BAKERIES) || '[]').length, 2);
    assert.equal(JSON.parse(mem.getItem(mahallaKeys.DEBTS) || '[]').length, 1);
    assert.equal(
      JSON.parse(mem.getItem('tamween_branch_modules_v1::branch-mahalla') || '{}').marker,
      'keep-mahalla'
    );
    assert.equal(JSON.parse(mem.getItem('TAMWEEN_BRANCHES_LIST_V1') || '[]').length, 2);
  } finally {
    (globalThis as any).localStorage = prevStorage;
  }
});
