import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import {
  PieChart as PieChartIcon,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Building2,
  CheckCircle2,
  X,
} from 'lucide-react';
import type { Bakery, DebtRecord } from '../types';

export interface LocalUnitDebtSlice {
  name: string;
  value: number;
  percentage: number;
  debtsCount: number;
  bakeriesCount: number;
  color: string;
  bakeries: Array<{
    bakeryId: string;
    bakeryOwnerName: string;
    machineNumber: string;
    village: string;
    netRemainingDebt: number;
  }>;
}

const CHART_PALETTE = [
  '#0A1628', // Midnight Navy
  '#0D9488', // Royal Teal
  '#D4AF37', // Champagne Gold
  '#1D4ED8', // Executive Blue
  '#E11D48', // Crimson Rose
  '#7C3AED', // Royal Violet
  '#EA580C', // Burnt Amber
  '#059669', // Emerald
  '#0284C7', // Cerulean
  '#9333EA', // Purple
  '#B45309', // Bronze
  '#334155', // Slate Navy
];

interface LocalUnitsDebtsPieChartProps {
  debts: DebtRecord[];
  bakeries: Bakery[];
  administrationTitle?: string;
}

export function aggregateDebtsByLocalUnit(
  debts: DebtRecord[],
  bakeries: Bakery[]
): {
  slices: LocalUnitDebtSlice[];
  totalDebt: number;
  totalDebtorBakeries: number;
  totalDebtRecords: number;
} {
  const bakeryById = new Map<string, Bakery>();
  for (const b of bakeries || []) {
    if (b?.id) bakeryById.set(b.id, b);
  }

  const unitMap = new Map<
    string,
    {
      name: string;
      total: number;
      debtsCount: number;
      bakeryMap: Map<
        string,
        {
          bakeryId: string;
          bakeryOwnerName: string;
          machineNumber: string;
          village: string;
          netRemainingDebt: number;
        }
      >;
    }
  >();

  let totalDebt = 0;
  let totalDebtRecords = 0;
  const allDebtorBakeryIds = new Set<string>();

  for (const d of debts || []) {
    const net = Math.max(0, Number(d?.netRemainingDebt) || 0);
    if (net <= 0) continue;

    const linkedBakery = d.bakeryId ? bakeryById.get(d.bakeryId) : undefined;
    const rawUnit =
      String(d.localUnit || linkedBakery?.localUnit || d.village || linkedBakery?.village || 'غير محدد').trim() ||
      'غير محدد';

    totalDebt += net;
    totalDebtRecords += 1;

    const bakeryKey = String(d.bakeryId || d.machineNumber || d.bakeryOwnerName || d.id);
    allDebtorBakeryIds.add(bakeryKey);

    let bucket = unitMap.get(rawUnit);
    if (!bucket) {
      bucket = {
        name: rawUnit,
        total: 0,
        debtsCount: 0,
        bakeryMap: new Map(),
      };
      unitMap.set(rawUnit, bucket);
    }
    bucket.total += net;
    bucket.debtsCount += 1;

    const existingBakery = bucket.bakeryMap.get(bakeryKey);
    if (existingBakery) {
      existingBakery.netRemainingDebt += net;
    } else {
      bucket.bakeryMap.set(bakeryKey, {
        bakeryId: d.bakeryId || bakeryKey,
        bakeryOwnerName: d.bakeryOwnerName || linkedBakery?.bakeryOwnerName || 'مخبز غير مسمى',
        machineNumber: d.machineNumber || linkedBakery?.machineNumber || '—',
        village: d.village || linkedBakery?.village || rawUnit,
        netRemainingDebt: net,
      });
    }
  }

  const sorted = Array.from(unitMap.values()).sort((a, b) => b.total - a.total);
  const slices: LocalUnitDebtSlice[] = sorted.map((item, idx) => ({
    name: item.name,
    value: Math.round(item.total * 100) / 100,
    percentage: totalDebt > 0 ? Math.round((item.total / totalDebt) * 1000) / 10 : 0,
    debtsCount: item.debtsCount,
    bakeriesCount: item.bakeryMap.size,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
    bakeries: Array.from(item.bakeryMap.values()).sort(
      (a, b) => b.netRemainingDebt - a.netRemainingDebt
    ),
  }));

  return {
    slices,
    totalDebt: Math.round(totalDebt * 100) / 100,
    totalDebtorBakeries: allDebtorBakeryIds.size,
    totalDebtRecords,
  };
}

const CustomPieTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload as LocalUnitDebtSlice | undefined;
  if (!item) return null;

  return (
    <div
      dir="rtl"
      className="bg-[#0A1628] text-white border border-[#D4AF37]/50 rounded-2xl px-4 py-3 shadow-2xl text-xs space-y-1.5 min-w-[210px]"
    >
      <div className="flex items-center gap-2 border-b border-white/15 pb-1.5">
        <span
          className="w-3 h-3 rounded-full shrink-0 border border-white/40"
          style={{ backgroundColor: item.color }}
        />
        <span className="font-black text-[#FDE68A] text-sm">الوحدة المحلية: {item.name}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300 font-bold">صافي المديونية:</span>
        <span className="font-mono font-black text-emerald-300 tabular-nums">
          {item.value.toLocaleString('en-US')} ج.م
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300 font-bold">النسبة من الإجمالي:</span>
        <span className="font-mono font-black text-amber-300 tabular-nums">
          {item.percentage.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300 font-bold">عدد المخابز المدينة:</span>
        <span className="font-mono font-black text-white tabular-nums">{item.bakeriesCount} مخبز</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-300 font-bold">عدد قيود المخالفات:</span>
        <span className="font-mono font-black text-sky-300 tabular-nums">{item.debtsCount} قيد</span>
      </div>
    </div>
  );
};

export const LocalUnitsDebtsPieChart: React.FC<LocalUnitsDebtsPieChartProps> = ({
  debts,
  bakeries,
  administrationTitle = 'إدارة تموين مركز المحلة الكبرى',
}) => {
  const [selectedUnitName, setSelectedUnitName] = useState<string | null>(null);

  const { slices, totalDebt, totalDebtorBakeries, totalDebtRecords } = useMemo(
    () => aggregateDebtsByLocalUnit(debts, bakeries),
    [debts, bakeries]
  );

  const topUnit = slices[0] || null;
  const activeUnit = useMemo(
    () => (selectedUnitName ? slices.find((s) => s.name === selectedUnitName) || null : null),
    [slices, selectedUnitName]
  );

  return (
    <div
      dir="rtl"
      data-testid="reports-local-units-debts-pie-chart"
      className="space-y-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0A1628] text-[#D4AF37] border border-[#D4AF37]/40 flex items-center justify-center shrink-0 shadow-sm">
            <PieChartIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-[#0A1628]">
              التوزيع البياني للمديونيات حسب الوحدات المحلية — {administrationTitle}
            </h3>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              تحليل تفاعلي لنسب وأرصدة المديونيات المتبقية موزعة على الوحدات المحلية (اضغط على أي وحدة لعرض مخابزها)
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0A1628] text-white text-xs font-black tabular-nums">
          <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{slices.length} وحدة محلية</span>
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
            إجمالي صافي المديونيات
          </span>
          <span className="block mt-1 text-lg font-black font-mono tabular-nums text-rose-700">
            {totalDebt.toLocaleString('en-US')} ج.م
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#0D9488]" />
            الوحدات المحلية ذات المديونية
          </span>
          <span className="block mt-1 text-lg font-black font-mono tabular-nums text-[#0A1628]">
            {slices.length} وحدة
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-700" />
            إجمالي المخابز المدينة / القيود
          </span>
          <span className="block mt-1 text-lg font-black font-mono tabular-nums text-[#0A1628]">
            {totalDebtorBakeries} مخبز <span className="text-xs text-slate-500">({totalDebtRecords} قيد)</span>
          </span>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
          <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            أعلى وحدة محلية مديونية
          </span>
          <span className="block mt-1 text-sm font-black text-[#0A1628] truncate">
            {topUnit ? `${topUnit.name} (${topUnit.percentage.toFixed(1)}%)` : 'لا توجد مديونيات'}
          </span>
        </div>
      </div>

      {/* Empty State or Chart + Table */}
      {slices.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-10 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <h4 className="text-sm font-black text-emerald-900">
            لا توجد مديونيات متبقية مسجلة حالياً في هذا الفرع (0 ج.م)
          </h4>
          <p className="text-xs font-bold text-emerald-800/80">
            بمجرد تسجيل أي قيود مديونيات للمخابز ستظهر تلقائياً نسب التوزيع حسب الوحدات المحلية هنا.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Interactive Recharts Pie Chart */}
          <div className="xl:col-span-6 bg-[#FAF8F5] rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-[#0A1628]">
                مخطط توزيع نسب المديونيات (Pie Chart — Recharts)
              </span>
              {selectedUnitName && (
                <button
                  type="button"
                  onClick={() => setSelectedUnitName(null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-[#0A1628] text-[11px] font-black cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>إلغاء التحديد</span>
                </button>
              )}
            </div>
            <div className="w-full h-[360px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={58}
                    outerRadius={122}
                    paddingAngle={2}
                    onClick={(entry) => {
                      const clickedName = entry?.name;
                      if (!clickedName) return;
                      setSelectedUnitName((prev) => (prev === clickedName ? null : clickedName));
                    }}
                    label={(props: any) => {
                      const pct = Number(props?.percentage ?? (Number(props?.percent || 0) * 100));
                      const labelName = String(props?.name || '');
                      return pct >= 4 ? `${labelName} (${pct.toFixed(1)}%)` : '';
                    }}
                    labelLine={true}
                  >
                    {slices.map((slice) => {
                      const isSelected = !selectedUnitName || selectedUnitName === slice.name;
                      return (
                        <Cell
                          key={slice.name}
                          fill={slice.color}
                          fillOpacity={isSelected ? 1 : 0.35}
                          stroke="#ffffff"
                          strokeWidth={selectedUnitName === slice.name ? 3 : 1.5}
                          style={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ranked Local Units Breakdown Table */}
          <div className="xl:col-span-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#0A1628] text-white font-black">
                  <th className="py-2.5 px-2.5 text-center border-l border-white/10">م</th>
                  <th className="py-2.5 px-3 text-right border-l border-white/10">الوحدة المحلية</th>
                  <th className="py-2.5 px-2.5 text-center border-l border-white/10">المخابز</th>
                  <th className="py-2.5 px-2.5 text-center border-l border-white/10">القيود</th>
                  <th className="py-2.5 px-3 text-center border-l border-white/10">صافي المديونية (ج.م)</th>
                  <th className="py-2.5 px-2.5 text-center">النسبة %</th>
                </tr>
              </thead>
              <tbody>
                {slices.map((slice, idx) => {
                  const isSelected = selectedUnitName === slice.name;
                  return (
                    <tr
                      key={slice.name}
                      onClick={() =>
                        setSelectedUnitName((prev) => (prev === slice.name ? null : slice.name))
                      }
                      className={`border-b border-slate-200 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-amber-50 ring-1 ring-inset ring-amber-400'
                          : idx % 2 === 0
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-slate-50/60 hover:bg-slate-100/70'
                      }`}
                    >
                      <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-600 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 text-right font-black text-[#0A1628]">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: slice.color }}
                          />
                          <span>{slice.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-800 tabular-nums">
                        {slice.bakeriesCount}
                      </td>
                      <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-700 tabular-nums">
                        {slice.debtsCount}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-black text-rose-700 tabular-nums">
                        {slice.value.toLocaleString('en-US')}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-lg bg-[#0A1628] text-white font-mono font-black text-[11px] tabular-nums">
                          {slice.percentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black text-[#0A1628] border-t-2 border-[#0A1628]">
                  <td colSpan={2} className="py-2.5 px-3 text-right">
                    الإجمالي العام للوحدات المحلية ({slices.length})
                  </td>
                  <td className="py-2.5 px-2.5 text-center font-mono tabular-nums">
                    {totalDebtorBakeries}
                  </td>
                  <td className="py-2.5 px-2.5 text-center font-mono tabular-nums">
                    {totalDebtRecords}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-rose-800 tabular-nums">
                    {totalDebt.toLocaleString('en-US')} ج.م
                  </td>
                  <td className="py-2.5 px-2.5 text-center font-mono tabular-nums">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Selected Local Unit Drill-Down Bakeries */}
      {activeUnit && (
        <div className="rounded-2xl border-2 border-[#0A1628]/20 bg-[#FAF8F5] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-black text-[#0A1628] flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full inline-block"
                style={{ backgroundColor: activeUnit.color }}
              />
              <span>
                تفاصيل المخابز المدينة داخل الوحدة المحلية ({activeUnit.name}) — إجمالي{' '}
                {activeUnit.value.toLocaleString('en-US')} ج.م ({activeUnit.percentage.toFixed(1)}%)
              </span>
            </h4>
            <button
              type="button"
              onClick={() => setSelectedUnitName(null)}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
            >
              إغلاق التفاصيل
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activeUnit.bakeries.map((bk) => (
              <div
                key={bk.bakeryId}
                className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-black text-[#0A1628] truncate">
                    {bk.bakeryOwnerName}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">
                    ماكينة: {bk.machineNumber} • قرية: {bk.village}
                  </div>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-mono font-black text-xs tabular-nums">
                  {bk.netRemainingDebt.toLocaleString('en-US')} ج.م
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalUnitsDebtsPieChart;
