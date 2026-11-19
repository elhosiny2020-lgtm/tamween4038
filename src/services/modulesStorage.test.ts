import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialBranchModulesBundle,
  createEmptyBranchModulesBundle,
  upgradeModulesBundleIfNeeded,
  loadBranchModulesBundle,
  saveBranchModulesBundle,
} from './modulesStorage';
import { factoryResetBranch, DEFAULT_BRANCH_ID, getScopedKeysForBranch } from '../storage';
import { DEFAULT_VILLAGES_HIERARCHY } from '../defaultData';
import { CANONICAL_DEFAULT_BRANCHES, deduplicateSupplyBranches } from '../utils/branchVaultUtils';
import { fallbackPurgeAll, fallbackSyncFullBranchState, fallbackGetBootstrap } from '../db/fallbackStore';

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

test('CANONICAL_DEFAULT_BRANCHES contains all 11 official Gharbia Governorate supply branches', () => {
  assert.equal(CANONICAL_DEFAULT_BRANCHES.length, 11);
  const deduped = deduplicateSupplyBranches([]);
  assert.equal(deduped.length, 11);
  const ids = new Set(deduped.map((b) => b.id));
  for (const expectedId of [
    'branch-mahalla',
    'branch-mahalla-city',
    'branch-tanta-center',
    'branch-tanta-city',
    'branch-samanoud',
    'branch-zefta',
    'branch-santa',
    'branch-kafr-elzayat',
    'branch-basyoun',
    'branch-qutour',
    'branch-directorate-hq',
  ]) {
    assert.ok(ids.has(expectedId), `Missing expected Gharbia branch: ${expectedId}`);
  }
});

test('Non-Mahalla branches initialize completely empty (zero merchants/internalTrade/grain/HR)', async () => {
  const mem = new MemoryStorage();
  const prevStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = mem;

  try {
    const tantaBundle = await loadBranchModulesBundle(
      'branch-tanta-center',
      'إدارة تموين مركز طنطا',
      []
    );
    assert.equal(tantaBundle.ration.merchants.length, 0);
    assert.equal(tantaBundle.ration.commodities.length, 0);
    assert.equal(tantaBundle.internalTrade?.establishments.length, 0);
    assert.equal(tantaBundle.internalTrade?.fuelStations.length, 0);
    assert.equal(tantaBundle.grainMaintenance.assets.length, 0);
    assert.equal(tantaBundle.grainMaintenance.shunas?.length, 0);
    assert.equal(tantaBundle.grainMaintenance.mills?.length, 0);
    assert.equal(tantaBundle.hr.employees.length, 0);

    const hqBundle = await loadBranchModulesBundle(
      'branch-directorate-hq',
      'ديوان عام مديرية التموين والتجارة الداخلية بالغربية',
      []
    );
    assert.equal(hqBundle.ration.merchants.length, 0);
    assert.equal(hqBundle.internalTrade?.establishments.length, 0);
    assert.equal(hqBundle.grainMaintenance.shunas?.length, 0);
    assert.equal(hqBundle.hr.employees.length, 0);
  } finally {
    (globalThis as any).localStorage = prevStorage;
  }
});

test('Deleting records across all module departments persists across save and reload without resurrection', async () => {
  const mem = new MemoryStorage();
  const prevStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = mem;

  try {
    const initial = await loadBranchModulesBundle(
      DEFAULT_BRANCH_ID,
      'إدارة تموين مركز المحلة الكبرى',
      DEFAULT_VILLAGES_HIERARCHY
    );
    const origMerchants = initial.ration.merchants.length;
    const origEst = initial.internalTrade?.establishments.length || 0;
    const origAssets = initial.grainMaintenance.assets.length;
    const origEmps = initial.hr.employees.length;
    assert.ok(origMerchants > 0 && origEst > 0 && origAssets > 0 && origEmps > 0);

    const mutated = {
      ...initial,
      ration: { ...initial.ration, merchants: initial.ration.merchants.slice(1) },
      internalTrade: initial.internalTrade
        ? { ...initial.internalTrade, establishments: initial.internalTrade.establishments.slice(1) }
        : initial.internalTrade,
      grainMaintenance: { ...initial.grainMaintenance, assets: initial.grainMaintenance.assets.slice(1) },
      hr: { ...initial.hr, employees: initial.hr.employees.slice(1) },
    };

    await saveBranchModulesBundle(DEFAULT_BRANCH_ID, mutated, 'qa_tester');
    const reloaded = await loadBranchModulesBundle(
      DEFAULT_BRANCH_ID,
      'إدارة تموين مركز المحلة الكبرى',
      DEFAULT_VILLAGES_HIERARCHY
    );

    assert.equal(reloaded.ration.merchants.length, origMerchants - 1);
    assert.equal(reloaded.internalTrade?.establishments.length, origEst - 1);
    assert.equal(reloaded.grainMaintenance.assets.length, origAssets - 1);
    assert.equal(reloaded.hr.employees.length, origEmps - 1);
  } finally {
    (globalThis as any).localStorage = prevStorage;
  }
});

test('fallbackSyncFullBranchState prunes ALL bakeries and debts when empty arrays are synced with pruneRemoved=true', () => {
  fallbackPurgeAll();
  fallbackSyncFullBranchState(
    'branch-tanta-center',
    {
      bakeries: [{ id: 'bk-tanta-1', bakeryOwnerName: 'مخبز اختباري', machineNumber: '998877' }],
      debts: [{ id: 'db-tanta-1', bakeryId: 'bk-tanta-1', violationAmount: 500 }],
    },
    { pruneRemoved: true }
  );
  let boot = fallbackGetBootstrap('branch-tanta-center');
  assert.equal(boot.bakeries.length, 1);
  assert.equal(boot.debts.length, 1);

  // Now delete the LAST bakery and LAST debt by syncing [] with pruneRemoved: true
  fallbackSyncFullBranchState(
    'branch-tanta-center',
    {
      bakeries: [],
      debts: [],
    },
    { pruneRemoved: true }
  );
  boot = fallbackGetBootstrap('branch-tanta-center');
  assert.equal(boot.bakeries.length, 0);
  assert.equal(boot.debts.length, 0);
  fallbackPurgeAll();
});

