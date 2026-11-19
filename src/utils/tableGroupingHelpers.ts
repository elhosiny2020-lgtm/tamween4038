/**
 * أدوات التجميع حسب الوحدة المحلية وحساب المجاميع الفرعية والإجمالي العام للقرية TOTAL
 * تحافظ على دقة المعادلات وتمنع جمع المعرفات أو أرقام الهواتف أو الأكواد.
 */

export interface LocalUnitGroup<T> {
  localUnit: string;
  rows: T[];
  items: T[];
  records: T[];
  count: number;
  subtotals: Record<string, any>;
  derivedMetrics: Record<string, any>;
  isUnifiedPopulation?: boolean;
}

export interface LocalUnitGroupingResult<T> {
  groups: LocalUnitGroup<T>[];
  grandTotalCount: number;
  grandTotals: Record<string, any>;
  derivedGrandMetrics: Record<string, any>;
  grandTotal: { count: number; totals: Record<string, any> };
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

export function isPopulationOrBeneficiariesFieldKey(key: string): boolean {
  return /population|سكان|مستفيد|beneficiar|أفراد|فراد/i.test(String(key || '').trim());
}

export const isPopulationFieldKey = isPopulationOrBeneficiariesFieldKey;

/**
 * دالة نقية لتجميع السجلات حسب الوحدة المحلية وحساب صف «إجمالي الوحدة المحلية» لكل وحدة،
 * ثم حساب صف «الإجمالي العام للقرية TOTAL» بجمع صفوف إجمالي الوحدات المحلية فقط.
 *
 * قاعدة عدد السكان والمستفيدين الموحد للوحدة المحلية:
 * - إذا كان عدد السكان أو عدد المستفيدين موحداً للوحدة المحلية (نفس الرقم) لا يتم جمعه في صف إجماليات الوحدة المحلية،
 *   وإنما يتم اعتباره قيمة موحدة وعرضه '—' في الإجمالي الفرعي، وتجميعه فقط في صف إجماليات القرية بأكملها بناءً على إجمالي صف الوحدات المحلية.
 */
export function groupRecordsByLocalUnit<T>(params: {
  rows: T[];
  getLocalUnit: (row: T) => string | undefined | null;
  numericFields?: { key: string; getValue: (row: T) => number | undefined | null }[];
  deriveMetrics?: (totals: Record<string, number>, rowCount: number) => Record<string, any>;
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

  const unitEffectiveGrandContribution = new Map<string, Record<string, number>>();

  const groups: LocalUnitGroup<T>[] = entries.map(([localUnit, groupRows]) => {
    const rawSums: Record<string, number> = {};
    const displaySubtotals: Record<string, any> = {};
    const grandContribution: Record<string, number> = {};
    let groupHasUnifiedPopulation = false;

    for (const nf of numericFields) {
      if (isPopulationOrBeneficiariesFieldKey(nf.key)) {
        const popValues: number[] = [];
        let sum = 0;
        for (const r of groupRows) {
          const val = Number(nf.getValue(r));
          if (Number.isFinite(val) && val > 0) {
            popValues.push(val);
            sum += val;
          }
        }
        const uniquePop = Array.from(new Set(popValues));
        const isUnified = uniquePop.length <= 1;
        if (isUnified) {
          groupHasUnifiedPopulation = true;
          const singlePop = uniquePop[0] ?? 0;
          // يستخدم الرقم الموحد لحساب المعدلات دون مضاعفة وللتجميع في إجمالي القرية فقط
          rawSums[nf.key] = roundMetric2(singlePop);
          grandContribution[nf.key] = roundMetric2(singlePop);
          // عدم عمل تجميع لعدد السكان أو المستفيدين الموحد في صف إجماليات الوحدة المحلية
          displaySubtotals[nf.key] = '—';
        } else {
          const totalPop = roundMetric2(sum);
          rawSums[nf.key] = totalPop;
          grandContribution[nf.key] = totalPop;
          displaySubtotals[nf.key] = totalPop;
        }
      } else {
        let sum = 0;
        for (const r of groupRows) {
          const val = Number(nf.getValue(r));
          if (Number.isFinite(val)) {
            sum += val;
          }
        }
        const rounded = roundMetric2(sum);
        rawSums[nf.key] = rounded;
        grandContribution[nf.key] = rounded;
        displaySubtotals[nf.key] = rounded;
      }
    }

    unitEffectiveGrandContribution.set(localUnit, grandContribution);
    const derived = deriveMetrics ? deriveMetrics(rawSums, groupRows.length) : {};
    return {
      localUnit,
      rows: groupRows,
      items: groupRows,
      records: groupRows,
      count: groupRows.length,
      isUnifiedPopulation: groupHasUnifiedPopulation,
      subtotals: {
        ...rawSums,
        ...displaySubtotals,
        ...derived,
      },
      derivedMetrics: derived,
    };
  });

  // الإجمالي العام للقرية TOTAL: يُجمع عدد السكان في صف إجماليات القرية بأكملها فقط
  const grandTotalCount = groups.reduce((acc, g) => acc + g.count, 0);
  const baseGrandSums: Record<string, number> = {};
  for (const nf of numericFields) {
    const sumFromUnits = groups.reduce((acc, g) => {
      const contrib = unitEffectiveGrandContribution.get(g.localUnit);
      return acc + (Number(contrib ? contrib[nf.key] : g.subtotals[nf.key]) || 0);
    }, 0);
    baseGrandSums[nf.key] = roundMetric2(sumFromUnits);
  }
  const derivedGrand = deriveMetrics ? deriveMetrics(baseGrandSums, grandTotalCount) : {};

  return {
    groups,
    grandTotalCount,
    grandTotals: {
      ...baseGrandSums,
      ...derivedGrand,
    },
    derivedGrandMetrics: derivedGrand,
    grandTotal: {
      count: grandTotalCount,
      totals: {
        ...baseGrandSums,
        ...derivedGrand,
      },
    },
  };
}
