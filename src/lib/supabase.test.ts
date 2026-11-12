import { test } from 'node:test';
import assert from 'node:assert';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  setSupabaseCloudDisabled,
  isValidHttpUrl,
  SUPABASE_TABLES_SQL_SCHEMA,
  SUPABASE_BUCKET_NAME,
} from './supabase';

test('Supabase schema contains all required tables and RLS policies', () => {
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS bakeries'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS debts'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('CREATE TABLE IF NOT EXISTS backup_snapshots'));
  assert.ok(SUPABASE_TABLES_SQL_SCHEMA.includes('ENABLE ROW LEVEL SECURITY'));
  assert.strictEqual(SUPABASE_BUCKET_NAME, 'tamween-backups');
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

