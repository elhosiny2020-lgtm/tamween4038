import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArabicAndDigits,
  matchesSmartSearch,
  paginateRecords,
  countHiddenColumnsInRange,
  type TableColumnOption,
} from './tableSmartHelpers';

describe('tableSmartHelpers — Search Normalization, Pagination & Column Visibility', () => {
  it('normalizes Arabic letters, diacritics, Arabic-Indic digits, and whitespace consistently', () => {
    assert.equal(normalizeArabicAndDigits('  أحمد   إبراهيم  '), 'احمد ابراهيم');
    assert.equal(normalizeArabicAndDigits('٠١٠٢٣٤٥٦٧٨٩'), '01023456789');
    assert.equal(normalizeArabicAndDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
    assert.equal(normalizeArabicAndDigits('بشبيش الجديدة'), 'بشبيش الجديده');
    assert.equal(normalizeArabicAndDigits('مُحَمَّد عَلِي'), 'محمد علي');
  });

  it('matches multi-field records across Arabic/English digits and multi-token queries', () => {
    const fields = ['TRD-16-5001', 'أحمد محمود السيد', '٠١٠٩٨٧٦٥٤٣٢', 'بشبيش', 'الوحدة المحلية ببشبيش'];
    assert.equal(matchesSmartSearch(fields, '01098765432'), true);
    assert.equal(matchesSmartSearch(fields, '٠١٠٩٨٧٦٥٤٣٢'), true);
    assert.equal(matchesSmartSearch(fields, 'احمد بشبيش'), true);
    assert.equal(matchesSmartSearch(fields, 'trd-16'), true);
    assert.equal(matchesSmartSearch(fields, 'دمرو'), false);
    assert.equal(matchesSmartSearch(fields, ''), true);
  });

  it('paginates records safely and clamps out-of-range pages', () => {
    const data = Array.from({ length: 53 }, (_, i) => i + 1);
    const p1 = paginateRecords(data, 1, 25);
    assert.equal(p1.totalPages, 3);
    assert.equal(p1.items.length, 25);
    assert.equal(p1.items[0], 1);
    assert.equal(p1.items[24], 25);

    const p3 = paginateRecords(data, 99, 25);
    assert.equal(p3.page, 3);
    assert.equal(p3.items.length, 3);
    assert.deepEqual(p3.items, [51, 52, 53]);

    const all = paginateRecords(data, 1, 0);
    assert.equal(all.items.length, 53);
    assert.equal(all.totalPages, 1);
  });

  it('computes hidden column counts accurately while respecting required columns', () => {
    const cols: TableColumnOption[] = [
      { key: 'idx', label: 'م', required: true },
      { key: 'name', label: 'الاسم' },
      { key: 'phone', label: 'الهاتف' },
      { key: 'village', label: 'القرية' },
      { key: 'amount', label: 'المبلغ' },
    ];
    // Attempting to count 'idx' as hidden is ignored because required=true
    assert.equal(countHiddenColumnsInRange(cols, ['idx', 'phone', 'village'], 0, 4), 2);
    assert.equal(countHiddenColumnsInRange(cols, ['amount'], 0, 4), 0);
  });
});
