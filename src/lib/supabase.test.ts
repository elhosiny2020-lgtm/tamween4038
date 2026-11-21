import { test } from 'node:test';
import assert from 'node:assert';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  setSupabaseCloudDisabled,
  isValidHttpUrl,
  isServiceRoleJwt,
  validateSupabaseCredentials,
  getCloudConnectionSnapshot,
  setCloudConnectionStatus,
  subscribeToConnectionStatus,
  STATUS_LABELS,
  shouldProcessRealtimeEvent,
  applyRealtimeRowMutation,
  mapBakeryToSqlRow,
  mapSqlRowToBakery,
  mapDebtToSqlRow,
  mapSqlRowToDebt,
  retrySupabaseConnection,
  SESSION_CLIENT_ID,
  isSelfRealtimeEvent,
  computeDeletedIds,
  mapAlertToSqlRow,
  mapSqlRowToAlert,
  resolveConcurrentRecords,
  enqueueOfflineSync,
  getPendingOfflineQueueCount,
  clearOfflineSyncQueue,
  autoSyncToSupabaseDetailed,
  mergeMultiBranchStatesNonDestructive,
  saveToPermanentSafetyVault,
  loadFromPermanentSafetyVault,
  clearSupabaseDatabaseData,
  SUPABASE_TABLES_SQL_SCHEMA,
  SUPABASE_BUCKET_NAME,
  mapBranchToSqlRow,
  mapSqlRowToBranch,
  mapVillageToSqlRow,
  mapSqlRowToVillage,
  mapUserToSqlRow,
  mapSqlRowToUser,
  mapTaskToSqlRow,
  mapSqlRowToTask,
  mapInboxToSqlRow,
  mapSqlRowToInbox,
  mapSystemConfigToSqlRow,
  mapSqlRowToSystemConfig,
  mapDropdownListToSqlRow,
  mapRowToSqlByTable,
} from './supabase';
import { normalizeStorageFileKey } from '../db/queries';
import {
  shouldApplyIncomingPartitionTimestamp,
  syncAllBranchesFromCloudPayload,
  readBranchPartitionFromLocal,
  getScopedKeysForBranch,
} from '../storage';

test('Supabase schema contains all normalized tables, foreign keys, unique constraints, indexes, RLS policies, Storage bucket, and Realtime publication', () => {
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.branches'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.villages'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('REFERENCES public.branches(id) ON DELETE CASCADE'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.bakeries'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.debts'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.app_users'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.daily_tasks'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.inbox_messages'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.backup_snapshots'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.system_config'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.dropdown_lists'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS public.high_debt_alerts'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CONSTRAINT uq_villages_branch_name UNIQUE (branch_id, village)'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CONSTRAINT uq_app_users_branch_username UNIQUE (branch_id, username)'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CONSTRAINT uq_dropdown_lists_branch_key UNIQUE (branch_id, list_key)'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_villages_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_bakeries_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_debts_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_app_users_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_daily_tasks_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_high_debt_alerts_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("auth.role() IN ('anon', 'authenticated')"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ALTER TABLE public.branches REPLICA IDENTITY FULL'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ALTER TABLE public.villages REPLICA IDENTITY FULL'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ALTER TABLE public.bakeries REPLICA IDENTITY FULL'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ALTER TABLE public.high_debt_alerts REPLICA IDENTITY FULL'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("pubname = 'supabase_realtime'"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', rt_tbl)"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("'branches', 'villages', 'bakeries', 'debts', 'app_users'"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("'backup_snapshots'"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('INSERT INTO storage.buckets (id, name, public)'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("VALUES ('tamween-backups', 'tamween-backups', false)"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('storage.objects'));
  assert.strictEqual(SUPABASE_BUCKET_NAME, 'tamween-backups');
});

test('Supabase security rejects service_role JWTs and validates URL/anon credentials cleanly', () => {
  const encodeB64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '');
  const fakeHeader = encodeB64({ alg: 'HS256', typ: 'JWT' });
  const servicePayload = encodeB64({ role: 'service_role', iss: 'supabase' });
  const anonPayload = encodeB64({ role: 'anon', iss: 'supabase' });

  const serviceJwt = `${fakeHeader}.${servicePayload}.signature`;
  const anonJwt = `${fakeHeader}.${anonPayload}.signature`;

  assert.strictEqual(isServiceRoleJwt(serviceJwt), true);
  assert.strictEqual(isServiceRoleJwt('sb_service_role_secret_123'), true);
  assert.strictEqual(isServiceRoleJwt(anonJwt), false);

  const badCheck = validateSupabaseCredentials('https://demo.supabase.co', serviceJwt);
  assert.strictEqual(badCheck.valid, false);
  assert.ok(badCheck.error?.includes('service_role'));

  const badUrl = validateSupabaseCredentials('not-a-url', anonJwt);
  assert.strictEqual(badUrl.valid, false);

  const goodCheck = validateSupabaseCredentials('https://demo.supabase.co', anonJwt);
  assert.strictEqual(goodCheck.valid, true);

  // Attempting to save service_role must be refused
  const before = getSupabaseConfig();
  saveSupabaseConfig('https://demo.supabase.co', serviceJwt);
  assert.notStrictEqual(getSupabaseConfig().anonKey, serviceJwt);
  // Restore clean built-in config
  saveSupabaseConfig(before.url, before.anonKey);
});

test('Supabase config saves and retrieves values correctly and rejects password autofill strings', () => {
  assert.strictEqual(isValidHttpUrl('Creative2020'), false);
  assert.strictEqual(isValidHttpUrl('https://test-project.supabase.co'), true);

  const dummyUrl = 'https://test-project.supabase.co';
  const dummyKey = 'test-anon-key-12345';

  const saved = saveSupabaseConfig(dummyUrl, dummyKey);
  assert.strictEqual(saved.url, dummyUrl);
  assert.strictEqual(saved.anonKey, dummyKey);
  assert.strictEqual(saved.isConfigured, true);

  const retrieved = getSupabaseConfig();
  assert.strictEqual(retrieved.url, dummyUrl);
  assert.strictEqual(retrieved.anonKey, dummyKey);
  assert.strictEqual(retrieved.isConfigured, true);

  // Clean up custom URL -> falls back to built-in multi-device Cloud SQL sync (isConfigured: true)
  const fallback = saveSupabaseConfig('', '');
  assert.strictEqual(fallback.url, '');
  assert.strictEqual(fallback.isConfigured, true);

  // Test disabling cloud sync explicitly
  setSupabaseCloudDisabled(true);
  assert.strictEqual(getSupabaseConfig().isConfigured, false);

  // Re-enable built-in cloud sync
  setSupabaseCloudDisabled(false);
  assert.strictEqual(getSupabaseConfig().isConfigured, true);
});

test('Cloud connection state transitions notify subscribers with exact Arabic labels', () => {
  assert.strictEqual(STATUS_LABELS.connected, 'متصل بالخادم');
  assert.strictEqual(STATUS_LABELS.syncing, 'جاري المزامنة');
  assert.strictEqual(STATUS_LABELS.error, 'غير متصل');
  assert.strictEqual(STATUS_LABELS.offline, 'غير متصل');

  const seen: string[] = [];
  const unsub = subscribeToConnectionStatus((snap) => {
    seen.push(`${snap.status}:${snap.label}`);
  });

  setCloudConnectionStatus('syncing', 'اختبار المزامنة');
  setCloudConnectionStatus('error', 'اختبار الخطأ', { hasPendingSync: true });
  setCloudConnectionStatus('connected', 'اختبار الاتصال', { hasPendingSync: false });
  unsub();

  assert.ok(seen.includes('syncing:جاري المزامنة'));
  assert.ok(seen.includes('error:غير متصل'));
  assert.ok(seen.includes('connected:متصل بالخادم'));
  assert.strictEqual(getCloudConnectionSnapshot().status, 'connected');
});

test('Realtime event deduplication and row mutation helpers process INSERT, UPDATE, and DELETE idempotently', () => {
  const uniqueKey = `evt-${Date.now()}-${Math.random()}`;
  assert.strictEqual(shouldProcessRealtimeEvent(uniqueKey, 5000), true);
  assert.strictEqual(shouldProcessRealtimeEvent(uniqueKey, 5000), false);

  const b1 = {
    id: 'b-1',
    machineNumber: '1001',
    bakeryOwnerName: 'مخبز النور',
    village: 'بشبيش',
    localUnit: 'بشبيش الرئيسية',
    insuranceValue: 7050,
    insuranceQuota: 10,
    actualQuota: 10,
    loavesCount: 6600,
    villagePopulation: 10000,
    perCapitaAverage: '0.66',
    beneficiaries2023: 10000,
    avg2023: '0.66',
    beneficiaries2024: 10000,
    avg2024: '0.66',
    beneficiaries2025: 10000,
    avg2025: '0.66',
    avgDiff: '0.00',
    flourBagPrice: 950,
    breadType: 'بلدي',
    breadTypeCount: 1,
    lineType: 'نصف آلي',
    fuelType: 'غاز طبيعي',
    activityStatus: 'يعمل',
  };

  const sqlRow = mapBakeryToSqlRow(b1 as any, 'branch-mahalla');
  assert.strictEqual(sqlRow.branch_id, 'branch-mahalla');
  assert.strictEqual(mapSqlRowToBakery(sqlRow).bakeryOwnerName, 'مخبز النور');

  const inserted = applyRealtimeRowMutation([], 'INSERT', sqlRow, null, mapSqlRowToBakery);
  assert.strictEqual(inserted.length, 1);

  const updatedRow = mapBakeryToSqlRow({ ...b1, bakeryOwnerName: 'مخبز النور المحدث' } as any, 'branch-mahalla');
  const updated = applyRealtimeRowMutation(inserted, 'UPDATE', updatedRow, null, mapSqlRowToBakery);
  assert.strictEqual(updated.length, 1);
  assert.strictEqual(updated[0].bakeryOwnerName, 'مخبز النور المحدث');

  const deleted = applyRealtimeRowMutation(updated, 'DELETE', null, { id: 'b-1' }, mapSqlRowToBakery);
  assert.strictEqual(deleted.length, 0);

  const dRow = mapDebtToSqlRow(
    {
      id: 'd-1',
      bakeryId: 'b-1',
      bakeryOwnerName: 'مخبز النور',
      machineNumber: '1001',
      village: 'بشبيش',
      localUnit: 'بشبيش الرئيسية',
      netRemainingDebt: 1500,
      status: 'UNPAID',
    } as any,
    'branch-mahalla'
  );
  assert.strictEqual(dRow.branch_id, 'branch-mahalla');
  assert.strictEqual(mapSqlRowToDebt(dRow).netRemainingDebt, 1500);
});

test('Self-echo filter, row deletion diffing, conflict resolution, and high-debt alert SQL mapping work deterministically', () => {
  assert.strictEqual(isSelfRealtimeEvent(SESSION_CLIENT_ID), true);
  assert.strictEqual(isSelfRealtimeEvent('other-device-client'), false);
  assert.strictEqual(isSelfRealtimeEvent(undefined), false);

  const deletedIds = computeDeletedIds(['id-1', 'id-2', 'id-3'], [{ id: 'id-1' }, { id: 'id-3' }]);
  assert.deepStrictEqual(deletedIds, ['id-2']);

  // Concurrent multi-user conflict resolution preserves distinct records and picks newer updatedAt on collision
  const conflictRes = resolveConcurrentRecords(
    [
      { id: 'r1', name: 'local-older', updatedAt: '2026-11-14T10:00:00Z' },
      { id: 'r2', name: 'local-only', updatedAt: '2026-11-14T10:05:00Z' },
    ],
    [
      { id: 'r1', name: 'remote-newer', updatedAt: '2026-11-14T10:10:00Z' },
      { id: 'r3', name: 'remote-only', updatedAt: '2026-11-14T10:01:00Z' },
    ]
  );
  assert.strictEqual(conflictRes.merged.length, 3);
  assert.strictEqual(conflictRes.merged.find((r) => r.id === 'r1')?.name, 'remote-newer');
  assert.strictEqual(conflictRes.conflictsResolved, 1);

  const alert = {
    id: 'notif-1',
    bakeryId: 'b-1',
    bakeryOwnerName: 'مخبز الفتح',
    machineNumber: '2040',
    village: 'دمرو',
    debtAmount: 75000,
    thresholdUsed: 50000,
    branchId: 'branch-mahalla',
    createdAtIso: '2026-11-14T10:00:00.000Z',
    editedBy: 'مدير الرقابة',
    editorRole: 'مدير التموين',
    timestamp: '12:00:00 م',
    actionType: 'ADD_DEBT' as const,
    isRead: false,
  };
  const sqlAlert = mapAlertToSqlRow(alert, 'branch-mahalla');
  assert.strictEqual(sqlAlert.id, 'notif-1');
  assert.strictEqual(sqlAlert.debt_amount, 75000);
  assert.strictEqual(sqlAlert.is_read, false);

  const restored = mapSqlRowToAlert({ ...sqlAlert, is_read: true });
  assert.ok(restored);
  assert.strictEqual(restored?.bakeryOwnerName, 'مخبز الفتح');
  assert.strictEqual(restored?.isRead, true);
});

test('Offline sync queue deduplicates per branch, safely stores mutations when offline, and clears when online sync succeeds', async () => {
  clearOfflineSyncQueue();
  assert.strictEqual(getPendingOfflineQueueCount(), 0);

  const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const origWinDesc = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const origFetch = globalThis.fetch;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: false },
  });
  try {
    const syncRes = await autoSyncToSupabaseDetailed({ activeBranchId: 'branch-mahalla', bakeries: [], debts: [] } as any, true);
    assert.strictEqual(syncRes.success, false);
    assert.strictEqual(syncRes.queuedOffline, true);
    assert.strictEqual(getPendingOfflineQueueCount(), 1);
    assert.strictEqual(getCloudConnectionSnapshot().pendingQueueCount, 1);
    assert.strictEqual(getCloudConnectionSnapshot().status, 'offline');

    // Enqueueing another edit for the same branch replaces instead of duplicating
    enqueueOfflineSync({ activeBranchId: 'branch-mahalla', bakeries: [{ id: 'b-new' }], debts: [] } as any);
    assert.strictEqual(getPendingOfflineQueueCount(), 1);

    // Enqueueing for a different branch keeps one per branch
    enqueueOfflineSync({ activeBranchId: 'branch-samanoud', bakeries: [], debts: [] } as any);
    assert.strictEqual(getPendingOfflineQueueCount(), 2);

    const res = await retrySupabaseConnection(null);
    assert.strictEqual(res.success, false);
    assert.strictEqual(getCloudConnectionSnapshot().status, 'offline');
    assert.strictEqual(getCloudConnectionSnapshot().label, 'غير متصل');

    // Simulate returning online with working /api/supabase/live-db endpoint
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { protocol: 'https:', hostname: 'localhost', host: 'localhost:3000' },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    (globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ success: true, revision: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const recoveredSync = await autoSyncToSupabaseDetailed(
      { activeBranchId: 'branch-mahalla', bakeries: [{ id: 'b-final' }], debts: [] } as any,
      true
    );
    assert.strictEqual(recoveredSync.success, true);
    assert.strictEqual(recoveredSync.queuedOffline, false);
    assert.strictEqual(getPendingOfflineQueueCount(), 0);
    assert.strictEqual(getCloudConnectionSnapshot().status, 'connected');
    assert.strictEqual(getCloudConnectionSnapshot().pendingQueueCount, 0);
  } finally {
    clearOfflineSyncQueue();
    globalThis.fetch = origFetch;
    if (origWinDesc) {
      Object.defineProperty(globalThis, 'window', origWinDesc);
    } else {
      delete (globalThis as any).window;
    }
    if (origNavDesc) {
      Object.defineProperty(globalThis, 'navigator', origNavDesc);
    } else {
      delete (globalThis as any).navigator;
    }
    setCloudConnectionStatus('connected', 'متصل بالخادم السحابي بنجاح', { pendingQueueCount: 0, hasPendingSync: false });
  }
});

test('Permanent Safety Vault and Non-Destructive Multi-Branch Merge retain all registered records across server changes', async () => {
  // 1. Timestamp guard blocks older stale boot snapshots unless forceRealtimePush is true
  assert.strictEqual(
    shouldApplyIncomingPartitionTimestamp(
      '2026-11-14T12:00:00.000Z',
      '2026-11-14T11:00:00.000Z',
      false
    ),
    false
  );
  assert.strictEqual(
    shouldApplyIncomingPartitionTimestamp(
      '2026-11-14T12:00:00.000Z',
      '2026-11-14T11:00:00.000Z',
      true
    ),
    true
  );

  // 2. Non-destructive multi-branch merge preserves records from both servers/devices
  const serverAState: any = {
    activeBranchId: 'branch-mahalla',
    bakeries: [{ id: 'b-101', bakeryOwnerName: 'مخبز الأمل', lastUpdatedAt: '2026-11-14T10:00:00Z' }],
    debts: [{ id: 'd-101', bakeryOwnerName: 'مخبز الأمل', netRemainingDebt: 5000 }],
    villages: [{ village: 'بشبيش', localUnits: ['بشبيش'] }],
    branchPartitions: {
      'branch-mahalla': {
        bakeries: [{ id: 'b-101', bakeryOwnerName: 'مخبز الأمل', lastUpdatedAt: '2026-11-14T10:00:00Z' }],
        debts: [{ id: 'd-101', bakeryOwnerName: 'مخبز الأمل', netRemainingDebt: 5000 }],
      },
    },
  };

  const serverBState: any = {
    activeBranchId: 'branch-mahalla',
    bakeries: [
      { id: 'b-101', bakeryOwnerName: 'مخبز الأمل المحدث', lastUpdatedAt: '2026-11-14T12:00:00Z' },
      { id: 'b-202', bakeryOwnerName: 'مخبز التوفيق الجديد', lastUpdatedAt: '2026-11-14T12:05:00Z' },
    ],
    debts: [{ id: 'd-202', bakeryOwnerName: 'مخبز التوفيق الجديد', netRemainingDebt: 8000 }],
    villages: [{ village: 'دمرو', localUnits: ['دمرو'] }],
    branchPartitions: {
      'branch-mahalla': {
        bakeries: [{ id: 'b-202', bakeryOwnerName: 'مخبز التوفيق الجديد', lastUpdatedAt: '2026-11-14T12:05:00Z' }],
        debts: [{ id: 'd-202', bakeryOwnerName: 'مخبز التوفيق الجديد', netRemainingDebt: 8000 }],
      },
    },
  };

  saveToPermanentSafetyVault(serverAState, '2026-11-14T10:00:00Z');
  saveToPermanentSafetyVault(serverBState, '2026-11-14T12:05:00Z');

  const vault = loadFromPermanentSafetyVault();
  assert.ok(vault?.data);
  assert.ok(vault!.data.bakeries.length >= 2);
  assert.strictEqual(
    vault!.data.bakeries.find((b: any) => b.id === 'b-101')?.bakeryOwnerName,
    'مخبز الأمل المحدث'
  );
  assert.strictEqual(
    vault!.data.bakeries.find((b: any) => b.id === 'b-202')?.bakeryOwnerName,
    'مخبز التوفيق الجديد'
  );
  assert.ok(vault!.data.debts.length >= 2);
  assert.ok((vault!.data as any).branchPartitions['branch-mahalla'].bakeries.length >= 2);

  // 3. clearSupabaseDatabaseData performs a full database wipe and allows registering fresh records from scratch
  const clearRes = await clearSupabaseDatabaseData();
  assert.strictEqual(clearRes.success, true);
  assert.ok(clearRes.message.includes('المسح الشامل'));
  const vaultAfterClear = loadFromPermanentSafetyVault();
  assert.strictEqual(vaultAfterClear, null);

  // 4. Registering a new bakery from scratch after a full wipe saves cleanly
  const freshState: any = {
    activeBranchId: 'branch-mahalla',
    bakeries: [{ id: 'b-fresh-1', bakeryOwnerName: 'مخبز البداية الجديدة', lastUpdatedAt: '2026-11-15T10:00:00Z' }],
    debts: [],
  };
  saveToPermanentSafetyVault(freshState, '2026-11-15T10:00:00Z');
  const vaultAfterFreshWrite = loadFromPermanentSafetyVault();
  assert.strictEqual(vaultAfterFreshWrite?.data.bakeries.length, 1);
  assert.strictEqual(vaultAfterFreshWrite?.data.bakeries[0].bakeryOwnerName, 'مخبز البداية الجديدة');
  clearSupabaseDatabaseData();
});

test('Realtime Diagnostics telemetry tracks all 11 subscribed tables, incoming/outgoing Events Log, AppState memory updates, and WebSocket console errors with zero polling', async () => {
  const {
    ALL_SUPABASE_REALTIME_TABLES,
    getRealtimeDiagnosticsSnapshot,
    recordRealtimeDiagnosticEvent,
    markTableRealtimeEvent,
    recordRealtimeSocketError,
    clearRealtimeDiagnosticsLogs,
  } = await import('./supabase');

  clearRealtimeDiagnosticsLogs();
  const initialSnap = getRealtimeDiagnosticsSnapshot();

  assert.strictEqual(initialSnap.syncMode, 'EVENT_DRIVEN_REALTIME');
  assert.strictEqual(initialSnap.pollingDisabled, true);
  assert.strictEqual(ALL_SUPABASE_REALTIME_TABLES.length, 11);
  assert.strictEqual(initialSnap.tables.length, 11);
  assert.ok(initialSnap.tables.every((t) => t.subscribed === true));

  markTableRealtimeEvent('bakeries', 'INSERT', '2026-11-14T14:00:00.000Z');
  recordRealtimeDiagnosticEvent({
    direction: 'INCOMING',
    channel: 'SUPABASE_REALTIME',
    eventType: 'postgres_changes:INSERT',
    table: 'bakeries',
    senderClientId: 'remote-device-99',
    isSelf: false,
    revision: 7,
    summary: 'تم استلام مخبز جديد لحظياً من جهاز آخر',
  });

  recordRealtimeDiagnosticEvent({
    direction: 'APPSTATE',
    channel: 'APPSTATE_MEMORY',
    eventType: 'APPSTATE_UPDATED_IMMEDIATELY',
    table: 'bakeries',
    summary: 'تم تحديث كائن AppState في الذاكرة فوراً',
  });

  recordRealtimeSocketError(
    {
      level: 'WARN',
      source: 'WEBSOCKET',
      message: 'اختبار تسجيل خطأ WebSocket في الكونسول التشخيصي',
    },
    { autoResolveImmediately: false }
  );

  const updatedSnap = getRealtimeDiagnosticsSnapshot();
  assert.strictEqual(updatedSnap.eventsLog.length, 2);
  assert.strictEqual(updatedSnap.errorsLog.length, 1);
  assert.strictEqual(updatedSnap.lastServerRevision, 7);
  assert.ok(updatedSnap.lastAppStateAppliedAt);

  const bakeriesTableDiag = updatedSnap.tables.find((t) => t.table === 'bakeries');
  assert.ok(bakeriesTableDiag && bakeriesTableDiag.eventsReceived >= 2);

  clearRealtimeDiagnosticsLogs();
  const clearedSnap = getRealtimeDiagnosticsSnapshot();
  assert.strictEqual(clearedSnap.eventsLog.length, 0);
  assert.strictEqual(clearedSnap.errorsLog.length, 0);
});

test('Last 50 Realtime Events DataGrid classifies INSERT, UPDATE, and DELETE mutations across tables, tracks latency cadence, and attaches safe client/auth headers without static shared tokens', async () => {
  const {
    detectStateMutationType,
    getLast50RealtimeEvents,
    recordRealtimeDiagnosticEvent,
    clearRealtimeDiagnosticsLogs,
    getSecurityShieldHeaders,
    setAuthSessionToken,
  } = await import('./supabase');

  // 1. Verify static shared shield token is removed and dynamic Bearer token works
  setAuthSessionToken(null);
  const anonHeaders = getSecurityShieldHeaders(true);
  assert.strictEqual(anonHeaders['X-Tamween-Security-Token'], undefined);
  assert.strictEqual(anonHeaders['Authorization'], undefined);
  assert.strictEqual(anonHeaders['X-Tamween-Client-Id'], SESSION_CLIENT_ID);
  assert.strictEqual(anonHeaders['Content-Type'], 'application/json');

  setAuthSessionToken('test-session-token-123');
  const authedHeaders = getSecurityShieldHeaders(true);
  assert.strictEqual(authedHeaders['X-Tamween-Security-Token'], undefined);
  assert.strictEqual(authedHeaders['Authorization'], 'Bearer test-session-token-123');
  setAuthSessionToken(null);

  // 2. Verify detectStateMutationType classifies INSERT, UPDATE, and DELETE accurately
  const baseState: any = {
    bakeries: [{ id: 'b1' }],
    debts: [{ id: 'd1' }, { id: 'd2' }],
    villages: [{ village: 'بشبيش' }],
  };
  const addedBakeryState: any = {
    ...baseState,
    bakeries: [{ id: 'b1' }, { id: 'b2' }],
  };
  const deletedDebtState: any = {
    ...addedBakeryState,
    debts: [{ id: 'd1' }],
  };
  const updatedBakeryState: any = {
    ...deletedDebtState,
  };

  assert.deepStrictEqual(detectStateMutationType(baseState, addedBakeryState), {
    sqlOperation: 'INSERT',
    affectedTable: 'bakeries',
  });
  assert.deepStrictEqual(detectStateMutationType(addedBakeryState, deletedDebtState), {
    sqlOperation: 'DELETE',
    affectedTable: 'debts',
  });
  assert.deepStrictEqual(detectStateMutationType(deletedDebtState, updatedBakeryState), {
    sqlOperation: 'UPDATE',
    affectedTable: 'bakeries',
  });

  // 3. Verify 50-Event DataGrid FIFO cap and required columns (sqlOperation, affectedTable, timestamp, responseLatencyMs)
  clearRealtimeDiagnosticsLogs();
  for (let i = 1; i <= 65; i++) {
    const op = i % 3 === 0 ? 'DELETE' : i % 2 === 0 ? 'INSERT' : 'UPDATE';
    const tbl = i % 2 === 0 ? 'bakeries' : 'debts';
    recordRealtimeDiagnosticEvent({
      direction: 'INCOMING',
      channel: 'SUPABASE_REALTIME',
      eventType: `postgres_changes:${op}`,
      sqlOperation: op,
      table: tbl,
      affectedTable: tbl,
      responseLatencyMs: 5 + (i % 10),
      summary: `حدث تجريبي رقم #${i}`,
    });
  }

  const last50 = getLast50RealtimeEvents();
  assert.strictEqual(last50.length, 50);
  assert.strictEqual(last50[0].summary, 'حدث تجريبي رقم #65');
  assert.strictEqual(last50[49].summary, 'حدث تجريبي رقم #16');
  assert.ok(
    last50.every(
      (evt) =>
        (evt.sqlOperation === 'INSERT' ||
          evt.sqlOperation === 'UPDATE' ||
          evt.sqlOperation === 'DELETE') &&
        Boolean(evt.affectedTable) &&
        Boolean(evt.timestamp) &&
        typeof evt.responseLatencyMs === 'number' &&
        evt.responseLatencyMs > 0
    )
  );
  clearRealtimeDiagnosticsLogs();
});

test('WebSockets & Realtime Console Interceptor automatically resolves socket warnings and resolveAllConsoleAndSocketIssues clears active errors to 0', async () => {
  const {
    recordRealtimeSocketError,
    resolveAllConsoleAndSocketIssues,
    getRealtimeDiagnosticsSnapshot,
    clearRealtimeDiagnosticsLogs,
  } = await import('./supabase');

  clearRealtimeDiagnosticsLogs();

  // 1. Default behavior: intercepted console warnings/errors are auto-resolved immediately
  const autoEntry = recordRealtimeSocketError({
    level: 'WARN',
    source: 'CONSOLE_INTERCEPT',
    message: 'WebSocket connection transient warning auto-healed',
  });
  assert.strictEqual(autoEntry.resolved, true);
  assert.strictEqual(autoEntry.level, 'RESOLVED');

  let snap = getRealtimeDiagnosticsSnapshot();
  assert.strictEqual(snap.errorsLog.length, 0);
  assert.strictEqual(snap.resolvedErrorsLog.length, 1);
  assert.ok(snap.autoHealedCount >= 1);

  // 2. If an unresolved error is recorded, resolveAllConsoleAndSocketIssues() resolves it and resets active errors to 0
  recordRealtimeSocketError(
    {
      level: 'ERROR',
      source: 'WEBSOCKET',
      message: 'Unresolved socket disconnect test',
    },
    { autoResolveImmediately: false }
  );
  snap = getRealtimeDiagnosticsSnapshot();
  assert.strictEqual(snap.errorsLog.length, 1);

  const fixResult = await resolveAllConsoleAndSocketIssues();
  assert.strictEqual(fixResult.success, true);
  assert.strictEqual(fixResult.resolvedCount, 1);
  assert.strictEqual(fixResult.stepsCompleted.length, 4);

  snap = getRealtimeDiagnosticsSnapshot();
  assert.strictEqual(snap.errorsLog.length, 0);
  assert.strictEqual(snap.resolvedErrorsLog.length, 2);
  assert.strictEqual(snap.webSocketState, 'OPEN');
  assert.strictEqual(snap.sseStreamState, 'OPEN');
  assert.strictEqual(snap.supabaseChannelState, 'SUBSCRIBED');

  clearRealtimeDiagnosticsLogs();
});

test('syncAllBranchesFromCloudPayload isolates non-default activeBranchId flat payloads without clobbering default branch', () => {
  const store = new Map<string, string>();
  const origLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };

  try {
    // 1. Seed default branch (branch-mahalla) with 1 registered bakery
    const appliedMahalla = syncAllBranchesFromCloudPayload(
      {
        activeBranchId: 'branch-mahalla',
        bakeries: [{ id: 'b-mah-1', bakeryOwnerName: 'مخبز المحلة الدائم' } as any],
        debts: [],
      },
      '2026-11-15T10:00:00.000Z',
      { forceRealtimePush: true }
    );
    assert.strictEqual(appliedMahalla, true);

    // 2. Receive a flat empty payload for branch-samanoud -> must write branch-samanoud ONLY
    const appliedSamanoud = syncAllBranchesFromCloudPayload(
      {
        activeBranchId: 'branch-samanoud',
        bakeries: [],
        debts: [],
      },
      '2026-11-15T10:01:00.000Z',
      { forceRealtimePush: true }
    );
    assert.strictEqual(appliedSamanoud, true);

    const mahallaAfter = readBranchPartitionFromLocal('branch-mahalla');
    assert.strictEqual(mahallaAfter.bakeries?.length, 1);
    assert.strictEqual(mahallaAfter.bakeries?.[0]?.id, 'b-mah-1');
    assert.ok(store.has(getScopedKeysForBranch('branch-samanoud').BAKERIES));
  } finally {
    if (origLocalStorage === undefined) {
      delete (globalThis as any).localStorage;
    } else {
      (globalThis as any).localStorage = origLocalStorage;
    }
  }
});

test('Normalized SQL mappers maintain exact column parity with schema.sql (no data_json or village_name) and deterministic Storage file keys', () => {
  const bakerySql = mapBakeryToSqlRow(
    {
      id: 'b-norm-1',
      bakeryOwnerName: 'مخبز الإخلاص',
      machineNumber: '777',
      village: 'بشبيش',
      localUnit: 'بشبيش الرئيسية',
      insuranceQuota: 10,
      actualQuota: 10,
      insuranceValue: 7050,
      loavesCount: 6600,
    } as any,
    'branch-mahalla'
  );
  assert.strictEqual((bakerySql as any).data_json, undefined);
  assert.strictEqual(bakerySql.bakery_owner_name, 'مخبز الإخلاص');

  const debtSql = mapDebtToSqlRow(
    {
      id: 'd-norm-1',
      bakeryId: 'b-norm-1',
      bakeryOwnerName: 'مخبز الإخلاص',
      machineNumber: '777',
      village: 'بشبيش',
      localUnit: 'بشبيش الرئيسية',
      netRemainingDebt: 1200,
    } as any,
    'branch-mahalla'
  );
  assert.strictEqual((debtSql as any).data_json, undefined);
  assert.strictEqual(debtSql.net_remaining_debt, 1200);

  const villageSql = mapVillageToSqlRow(
    { village: 'محلة أبو علي', localUnits: ['أبو علي'] },
    'branch-mahalla'
  );
  assert.strictEqual((villageSql as any).village_name, undefined);
  assert.strictEqual(villageSql.village, 'محلة أبو علي');
  assert.deepStrictEqual(mapSqlRowToVillage(villageSql)?.localUnits, ['أبو علي']);

  const userSql = mapUserToSqlRow(
    {
      id: 'u-norm-1',
      username: 'auditor_1',
      fullName: 'مراجع مالي',
      passwordHash: 'scrypt$hashed',
      role: 'auditor',
      createdAt: '2026-11-15',
    } as any,
    'branch-mahalla'
  );
  assert.strictEqual(userSql.id, 'u-norm-1');
  assert.strictEqual(userSql.password_hash, 'scrypt$hashed');
  assert.strictEqual((userSql as any).data_json, undefined);
  assert.strictEqual((mapSqlRowToUser(userSql) as any)?.password, undefined);
  assert.strictEqual((mapSqlRowToUser(userSql) as any)?.hasPassword, true);

  const taskSql = mapTaskToSqlRow(
    {
      id: 't-norm-1',
      title: 'حملة تفتيش',
      description: 'مراجعة يومية',
      assignedTo: 'ALL',
      priority: 'high',
      status: 'pending',
      dueDate: '2026-11-16',
      createdAt: '2026-11-15',
      createdBy: 'admin',
    },
    'branch-mahalla'
  );
  assert.strictEqual(taskSql.assigned_to, 'ALL');
  assert.strictEqual(mapSqlRowToTask(taskSql)?.title, 'حملة تفتيش');

  const inboxSql = mapInboxToSqlRow(
    {
      id: 'msg-norm-1',
      senderId: 'u-1',
      senderName: 'مدير',
      senderRole: 'admin',
      recipientTarget: 'ALL',
      recipientLabel: 'الجميع',
      messageType: 'instruction',
      content: 'تنبيه',
      timestamp: '2026-11-15',
      readBy: ['admin'],
    },
    'branch-mahalla'
  );
  assert.strictEqual(inboxSql.sender_name, 'مدير');
  assert.strictEqual(mapSqlRowToInbox(inboxSql)?.content, 'تنبيه');

  const branchSql = mapBranchToSqlRow({
    id: 'branch-mahalla',
    name: 'إدارة تموين مركز المحلة الكبرى',
    governorateTitle: 'الغربية',
    directorateTitle: 'التموين',
    createdAt: '2026-01-01',
    isDefault: true,
  });
  assert.strictEqual(branchSql.is_default, true);
  assert.strictEqual(mapSqlRowToBranch(branchSql)?.name, 'إدارة تموين مركز المحلة الكبرى');

  const sysCfgSql = mapSystemConfigToSqlRow(
    {
      branchId: 'branch-mahalla',
      systemConfig: { administrationTitle: 'إدارة المحلة' },
      columnTitles: { owner: 'صاحب المخبز' },
      activityStatuses: ['يعمل'],
    },
    'branch-mahalla'
  );
  assert.strictEqual(sysCfgSql.branch_id, 'branch-mahalla');
  assert.strictEqual(mapSqlRowToSystemConfig(sysCfgSql)?.systemConfig.administrationTitle, 'إدارة المحلة');

  const ddSql = mapDropdownListToSqlRow('branch-mahalla', 'fuelTypes', ['غاز طبيعي', 'سولار']);
  assert.strictEqual(ddSql.id, 'branch-mahalla__fuelTypes');
  assert.strictEqual(ddSql.list_key, 'fuelTypes');

  const routeSys = mapRowToSqlByTable(
    'system_config',
    {
      branchId: 'branch-mahalla',
      systemConfig: { debtAlertThreshold: 40000 },
    },
    'branch-mahalla'
  );
  assert.strictEqual(routeSys?.onConflict, 'branch_id');

  const routeBakery = mapRowToSqlByTable('bakeries', { id: 'b-1', bakeryOwnerName: 'نور' }, 'branch-mahalla');
  assert.strictEqual(routeBakery?.onConflict, 'id');

  // Deterministic Storage file key generation prevents duplicate files
  const key1 = normalizeStorageFileKey('branch-mahalla', 'tamween_branch_snapshot.json');
  const key2 = normalizeStorageFileKey('branch-mahalla', '/tamween_branch_snapshot.json');
  assert.strictEqual(key1.id, 'storage__branch-mahalla__tamween_branch_snapshot.json');
  assert.deepStrictEqual(key1, key2);
});




