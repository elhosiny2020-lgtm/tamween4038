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
  SUPABASE_TABLES_SQL_SCHEMA,
  SUPABASE_BUCKET_NAME,
} from './supabase';

test('Supabase schema contains all required tables, branch_id columns, indexes, RLS policies, and Realtime publication', () => {
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('-- 1. جدول المخابز الرئيسي (Bakeries)'));
  assert.ok(!SUPABASE_TABLES_SQL_SCHEMA.includes('// 1. جدول المخابز الرئيسي'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS bakeries'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS debts'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS backup_snapshots'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS system_config'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes("branch_id TEXT DEFAULT 'branch-mahalla'"));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_bakeries_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE INDEX IF NOT EXISTS idx_debts_branch_id'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ENABLE ROW LEVEL SECURITY'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ALTER TABLE bakeries REPLICA IDENTITY FULL'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ALTER PUBLICATION supabase_realtime ADD TABLE bakeries'));
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
    activityStatus: 'شغال',
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

test('retrySupabaseConnection transitions to offline when browser navigator.onLine is false', async () => {
  const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: false },
  });
  try {
    const res = await retrySupabaseConnection(null);
    assert.strictEqual(res.success, false);
    assert.strictEqual(getCloudConnectionSnapshot().status, 'offline');
    assert.strictEqual(getCloudConnectionSnapshot().label, 'غير متصل');
  } finally {
    if (origNavDesc) {
      Object.defineProperty(globalThis, 'navigator', origNavDesc);
    } else {
      delete (globalThis as any).navigator;
    }
    setCloudConnectionStatus('connected', 'متصل بالخادم السحابي بنجاح');
  }
});
