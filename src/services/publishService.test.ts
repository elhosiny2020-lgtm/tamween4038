import test from 'node:test';
import assert from 'node:assert/strict';
import { getLastConfirmedPublishInfo } from './publishService';

test('getLastConfirmedPublishInfo returns null when no previous publish was stored', () => {
  const info = getLastConfirmedPublishInfo();
  assert.equal(info, null);
});

test('getLastConfirmedPublishInfo reads successfully when localStorage has info', () => {
  const mockStorage: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => { mockStorage[key] = val; },
    removeItem: (key: string) => { delete mockStorage[key]; },
  };

  mockStorage['TAMWEEN_LAST_PUBLISH_INFO'] = JSON.stringify({
    success: true,
    publishedUrl: 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app',
    publishedAt: new Date().toISOString(),
    version: '2.4.0',
    bakeriesCount: 15,
    debtsCount: 8,
    message: 'تم النشر بنجاح',
  });

  const info = getLastConfirmedPublishInfo();
  assert.ok(info);
  assert.equal(info?.publishedUrl, 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app');
  assert.equal(info?.version, '2.4.0');
  assert.equal(info?.bakeriesCount, 15);
});
