/**
 * أدوات التجميع حسب الوحدة المحلية وحساب المجاميع الفرعية والإجمالي العام للقرية TOTAL
 * تحافظ على دقة المعادلات وتمنع جمع المعرفات أو أرقام الهواتف أو الأكواد.
 */

export interface LocalUnitGroup<T> {
  localUnit: string;
  rows: T[];
  count: number;
  subtotals: Record<string, number>;
}

export interface LocalUnitGroupingResult<T> {
  groups: LocalUnitGroup<T>[];
  grandTotalCount: number;
  grandTotals: Record<string, number>;
}

const DEFAULT_UNASSIGNED_UNIT = 'غير محدد / عام';

export function normalizeLocalUnitLabel(value: string | undefined | null): string {
  const cleaned = String(value ?? '').trim();
  return cleaned || DEFAULT_UNASSIGNED_UNIT;
}

export function roundMetric2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * دالة نقية لتجميع السجلات حسب الوحدة المحلية وحساب صف «إجمالي الوحدة المحلية» لكل وحدة،
 * ثم حساب صف «الإجمالي العام للقرية TOTAL» بجمع صفوف إجمالي الوحدات المحلية فقط.
 *
 * ملاحظة رقابية:
 * - لا يُجمع سوى الحقول الرقمية المصرح بها في numericKeys أو عبر aggregateGroup.
 * - لا يُعد صف الإجمالي كسجل ولا يُخزن في قاعدة البيانات.
 * - عند تمرير deriveMetrics تُعاد حساب النسب/المتوسطات بناءً على المجاميع وليس بجمع النسب المئوية.
 */
export function groupRecordsByLocalUnit<T>(params: {
  rows: T[];
  getLocalUnit: (row: T) => string | undefined | null;
  numericFields?: { key: string; getValue: (row: T) => number | undefined | null }[];
  deriveMetrics?: (totals: Record<string, number>, rowCount: number) => Record<string, number>;
  sortUnitsAlphabetically?: boolean;
}): LocalUnitGroupingResult<T> {
  const {
    rows,
    getLocalUnit,
    numericFields = [],
    deriveMetrics,
    sortUnitsAlphabetically = false,
  } = params;

  const groupMap = new Map<string, T[]>();

  for (const row of rows || []) {
    const unit = normalizeLocalUnitLabel(getLocalUnit(row));
    const bucket = groupMap.get(unit);
    if (bucket) {
      bucket.push(row);
    } else {
      groupMap.set(unit, [row]);
    }
  }

  let entries = Array.from(groupMap.entries());
  if (sortUnitsAlphabetically) {
    entries = entries.sort(([a], [b]) => {
      if (a === DEFAULT_UNASSIGNED_UNIT) return 1;
      if (b === DEFAULT_UNASSIGNED_UNIT) return -1;
      return a.localeCompare(b, 'ar');
    });
  }

  const groups: LocalUnitGroup<T>[] = entries.map(([localUnit, groupRows]) => {
    const rawSums: Record<string, number> = {};
    for (const nf of numericFields) {
      let sum = 0;
      for (const r of groupRows) {
        const val = Number(nf.getValue(r));
        if (Number.isFinite(val)) {
          sum += val;
        }
      }
      rawSums[nf.key] = roundMetric2(sum);
    }
    const derived = deriveMetrics ? deriveMetrics(rawSums, groupRows.length) : {};
    return {
      localUnit,
      rows: groupRows,
      count: groupRows.length,
      subtotals: {
        ...rawSums,
        ...derived,
      },
    };
  });

  // الإجمالي العام للقرية TOTAL: يُجمع من صفوف إجمالي الوحدات المحلية فقط
  const grandTotalCount = groups.reduce((acc, g) => acc + g.count, 0);
  const baseGrandSums: Record<string, number> = {};
  for (const nf of numericFields) {
    const sumFromSubtotals = groups.reduce((acc, g) => acc + (Number(g.subtotals[nf.key]) || 0), 0);
    baseGrandSums[nf.key] = roundMetric2(sumFromSubtotals);
  }
  const derivedGrand = deriveMetrics ? deriveMetrics(baseGrandSums, grandTotalCount) : {};

  return {
    groups,
    grandTotalCount,
    grandTotals: {
      ...baseGrandSums,
      ...derivedGrand,
    },
  };
}
