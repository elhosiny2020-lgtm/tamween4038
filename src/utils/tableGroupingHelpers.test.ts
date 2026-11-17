import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupRecordsByLocalUnit, normalizeLocalUnitLabel } from './tableGroupingHelpers.ts';

describe('tableGroupingHelpers — Local Unit Subtotals & Grand Total', () => {
  it('normalizeLocalUnitLabel assigns a safe fallback for blank/missing units', () => {
    assert.equal(normalizeLocalUnitLabel('  بشبيش  '), 'بشبيش');
    assert.equal(normalizeLocalUnitLabel(''), 'غير محدد / عام');
    assert.equal(normalizeLocalUnitLabel(undefined), 'غير محدد / عام');
    assert.equal(normalizeLocalUnitLabel(null), 'غير محدد / عام');
  });

  it('groups rows by localUnit, computes unit subtotals, and computes grand total strictly from subtotals', () => {
    const rows = [
      { id: '1', phone: '01011112222', localUnit: 'بشبيش', quota: 120.5, actual: 100.5 },
      { id: '2', phone: '01033334444', localUnit: 'بشبيش', quota: 79.5, actual: 60 },
      { id: '3', phone: '01055556666', localUnit: 'دمرو', quota: 50, actual: 45 },
      { id: '4', phone: '01077778888', localUnit: '', quota: 25, actual: 25 },
    ];

    const res = groupRecordsByLocalUnit({
      rows,
      getLocalUnit: (r) => r.localUnit,
      numericFields: [
        { key: 'quota', getValue: (r) => r.quota },
        { key: 'actual', getValue: (r) => r.actual },
      ],
      deriveMetrics: (totals) => ({
        executionPct:
          totals.quota > 0 ? Math.round(((totals.actual / totals.quota) * 100 + Number.EPSILON) * 100) / 100 : 0,
      }),
    });

    assert.equal(res.groups.length, 3);
    assert.equal(res.groups[0].localUnit, 'بشبيش');
    assert.equal(res.groups[0].count, 2);
    assert.equal(res.groups[0].subtotals.quota, 200);
    assert.equal(res.groups[0].subtotals.actual, 160.5);
    assert.equal(res.groups[0].subtotals.executionPct, 80.25);

    assert.equal(res.groups[1].localUnit, 'دمرو');
    assert.equal(res.groups[1].count, 1);
    assert.equal(res.groups[1].subtotals.quota, 50);

    assert.equal(res.groups[2].localUnit, 'غير محدد / عام');
    assert.equal(res.groups[2].count, 1);

    // Grand total sums subtotals only (not phones/IDs, and executionPct is recomputed: 230.5 / 275 * 100)
    assert.equal(res.grandTotalCount, 4);
    assert.equal(res.grandTotals.quota, 275);
    assert.equal(res.grandTotals.actual, 230.5);
    assert.equal(res.grandTotals.executionPct, 83.82);
    assert.equal('phone' in res.grandTotals, false);
    assert.equal('id' in res.grandTotals, false);
  });

  it('handles empty datasets cleanly with zero totals', () => {
    const res = groupRecordsByLocalUnit<{ localUnit: string; val: number }>({
      rows: [],
      getLocalUnit: (r) => r.localUnit,
      numericFields: [{ key: 'val', getValue: (r) => r.val }],
    });
    assert.equal(res.groups.length, 0);
    assert.equal(res.grandTotalCount, 0);
    assert.equal(res.grandTotals.val, 0);
  });
});
