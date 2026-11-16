import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDaysUntilDate,
  matchesCommercialRegFilter,
  computeCommercialRegExpiryCounts,
} from './filterHelpers';

const REF_DATE = new Date(2026, 10, 15); // 2026-11-15

test('getDaysUntilDate computes accurate signed day difference', () => {
  assert.equal(getDaysUntilDate('2026-11-15', REF_DATE), 0);
  assert.equal(getDaysUntilDate('2026-11-10', REF_DATE), -5);
  assert.equal(getDaysUntilDate('2026-12-15', REF_DATE), 30);
  assert.equal(getDaysUntilDate('', REF_DATE), null);
  assert.equal(getDaysUntilDate('not-a-date', REF_DATE), null);
});

test('matchesCommercialRegFilter accurately filters by 30, 60, 90 days, expired, and valid ranges', () => {
  assert.equal(matchesCommercialRegFilter(undefined, 'ALL', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter(undefined, 'WITHIN_30', REF_DATE), false);

  // Expired (-3 days)
  assert.equal(matchesCommercialRegFilter('2026-11-12', 'EXPIRED', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter('2026-11-12', 'WITHIN_30', REF_DATE), false);

  // Expiring in 20 days
  assert.equal(matchesCommercialRegFilter('2026-12-05', 'WITHIN_30', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter('2026-12-05', 'WITHIN_60', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter('2026-12-05', 'WITHIN_90', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter('2026-12-05', 'VALID', REF_DATE), false);

  // Expiring in 45 days
  assert.equal(matchesCommercialRegFilter('2026-12-30', 'WITHIN_30', REF_DATE), false);
  assert.equal(matchesCommercialRegFilter('2026-12-30', 'WITHIN_60', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter('2026-12-30', 'WITHIN_90', REF_DATE), true);

  // Expiring in 80 days
  assert.equal(matchesCommercialRegFilter('2027-02-03', 'WITHIN_60', REF_DATE), false);
  assert.equal(matchesCommercialRegFilter('2027-02-03', 'WITHIN_90', REF_DATE), true);
  assert.equal(matchesCommercialRegFilter('2027-02-03', 'VALID', REF_DATE), false);

  // Valid (> 90 days)
  assert.equal(matchesCommercialRegFilter('2027-06-01', 'WITHIN_90', REF_DATE), false);
  assert.equal(matchesCommercialRegFilter('2027-06-01', 'VALID', REF_DATE), true);
});

test('computeCommercialRegExpiryCounts aggregates counts across ranges', () => {
  const counts = computeCommercialRegExpiryCounts(
    [
      { commercialRegDate: '2026-11-01' }, // expired
      { commercialRegDate: '2026-12-01' }, // 16 days -> within30, within60, within90
      { commercialRegDate: '2026-12-30' }, // 45 days -> within60, within90
      { commercialRegDate: '2027-02-01' }, // 78 days -> within90
      { commercialRegDate: '2027-08-01' }, // > 90 days -> valid
      { commercialRegDate: '' },           // missing
    ],
    REF_DATE
  );

  assert.deepEqual(counts, {
    total: 6,
    expired: 1,
    within30: 1,
    within60: 2,
    within90: 3,
    valid: 1,
    missing: 1,
  });
});
