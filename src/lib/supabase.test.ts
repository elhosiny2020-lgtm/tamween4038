import { test } from 'node:test';
import assert from 'node:assert';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
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

test('Supabase config saves and retrieves values correctly in localStorage fallback', () => {
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

  // Clean up
  saveSupabaseConfig('', '');
});
