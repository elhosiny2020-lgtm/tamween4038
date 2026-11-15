import React, { useState, useMemo } from 'react';
import { Bakery, DebtRecord, VillageHierarchy } from '../types';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList
} from 'recharts';
import {
  PieChart as PieIcon,
  BarChart3,
  Filter,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Download,
  ShieldAlert,
  Table as TableIcon
} from 'lucide-react';
import { downloadWindowsExeLauncher, downloadUpdatedAppHtml } from '../utils/htmlExporter';
import { matchesVillageOrUnitFilter, calculateBakeriesColumnTotals } from '../utils/auditHelper';
import { D3DebtAnalysisChart } from './D3DebtAnalysisChart';

interface BakeryAnalyticsChartsProps {
  bakeries: Bakery[];
  debts?: DebtRecord[];
  villages: VillageHierarchy[];
  onSelectTierFilter?: (minAmount: number, maxAmount: number, tierLabel: string) => void;
}

const COLORS = [
  '#0D9488', '#D4AF37', '#10B981', '#F43F5E', '#0A1628',
  '#14B8A6', '#F59E0B', '#0F766E', '#059669', '#E11D48',
  '#334155', '#2DD4BF', '#D97706', '#10B981', '#0D9488'
];

export const BakeryAnalyticsCharts: React.FC<BakeryAnalyticsChartsProps> = ({
  bakeries,
  debts = [],
  villages,
  onSelectTierFilter
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedVillageFilter, setSelectedVillageFilter] = useState('ALL');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('ALL');
  const [chartType, setChartType] = useState<'quotas' | 'loaves' | 'debts' | 'beneficiaries'>('quotas');
  const [exeToastMsg, setExeToastMsg] = useState<string | null>(null);

  // Compute map of remaining debts per bakery
  const bakeryDebtsMap = useMemo(() => {
    const map: Record<string, number> = {};
    debts.forEach((d) => {
      map[d.bakeryId] = (map[d.bakeryId] || 0) + (d.netRemainingDebt || 0);
    });
    return map;
  }, [debts]);

  // Filtered bakeries based on analytics filters
  const filteredData = useMemo(() => {
    return bakeries.filter((b) =>
      matchesVillageOrUnitFilter(b, selectedVillageFilter, selectedUnitFilter, villages)
    );
  }, [bakeries, selectedVillageFilter, selectedUnitFilter, villages]);

  // Aggregated data by Village / Local Unit
  const barChartData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        insuranceValue: number;
        insuranceQuota: number;
        actualQuota: number;
        loavesCount: number;
        ben2023: number;
        ben2024: number;
        ben2025: number;
        avg2023: number;
        avg2024: number;
        avg2025: number;
        perCapitaAvg: number;
        avgDiff: number;
        totalRemainingDebt: number;
        bakeryCount: number;
      }
    >();

    filteredData.forEach((b) => {
      const key = selectedVillageFilter === 'ALL' ? b.village : b.localUnit;
      const current = map.get(key) || {
        name: key,
        insuranceValue: 0,
        insuranceQuota: 0,
        actualQuota: 0,
        loavesCount: 0,
        ben2023: 0,
        ben2024: 0,
        ben2025: 0,
        avg2023: 0,
        avg2024: 0,
        avg2025: 0,
        perCapitaAvg: 0,
        avgDiff: 0,
        totalRemainingDebt: 0,
        bakeryCount: 0,
      };
      current.insuranceValue += Number(b.insuranceValue) || 0;
      current.insuranceQuota += Number(b.insuranceQuota) || 0;
      current.actualQuota += Number(b.actualQuota) || 0;
      current.loavesCount += Number(b.loavesCount) || 0;
      current.ben2023 += Number(b.beneficiaries2023) || 0;
      current.ben2024 += Number(b.beneficiaries2024) || 0;
      current.ben2025 += Number(b.beneficiaries2025) || 0;
      current.avg2023 += parseFloat(String(b.avg2023 || '0')) || 0;
      current.avg2024 += parseFloat(String(b.avg2024 || '0')) || 0;
      current.avg2025 += parseFloat(String(b.avg2025 || '0')) || 0;
      current.perCapitaAvg += Number(b.perCapitaAverage) || 0;
      current.avgDiff += parseFloat(String(b.avgDiff || '0')) || 0;
      current.totalRemainingDebt += bakeryDebtsMap[b.id] || 0;
      current.bakeryCount += 1;
      map.set(key, current);
    });

    const result = Array.from(map.values());
    if (chartType === 'debts') {
      return result.sort((a, b) => b.totalRemainingDebt - a.totalRemainingDebt);
    }
    return result.sort((a, b) => b.actualQuota - a.actualQuota);
  }, [filteredData, selectedVillageFilter, bakeryDebtsMap, chartType]);

  // Activity distribution pie chart data
  const pieChartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach((b) => {
      const status = b.activityStatus || 'غير محدد';
      map.set(status, (map.get(status) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  // Quota breakdown pie chart data (top 6 villages / units)
  const quotaPieData = useMemo(() => {
    const top = barChartData.slice(0, 6);
    const others = barChartData.slice(6);
    const result = top.map((item) => ({ name: item.name, value: item.actualQuota }));

    if (others.length > 0) {
      const othersTotal = others.reduce((acc, curr) => acc + curr.actualQuota, 0);
      result.push({ name: 'باقي القرى والوحدات', value: othersTotal });
    }
    return result;
  }, [barChartData]);

  // Total summary for current view
  const colTotals = useMemo(
    () => calculateBakeriesColumnTotals(filteredData, bakeryDebtsMap),
    [filteredData, bakeryDebtsMap]
  );

  const totals = useMemo(() => {
    return {
      insuranceValue: colTotals.insuranceValue,
      insurance: colTotals.insuranceQuota,
      actual: colTotals.actualQuota,
      loaves: colTotals.loavesCount,
      ben2023: colTotals.beneficiaries2023,
      ben2024: colTotals.beneficiaries2024,
      ben2025: colTotals.beneficiaries2025,
      avg2023: colTotals.avg2023,
      avg2024: colTotals.avg2024,
      avg2025: colTotals.avg2025,
      perCapitaAvg: colTotals.perCapitaAverage,
      avgDiff: colTotals.avgDiff,
      debts: colTotals.remainingDebt,
      count: colTotals.bakeryCount,
    };
  }, [colTotals]);

  return (
    <div className="bg-[#0A1628] border border-[#D4AF37]/35 rounded-3xl shadow-2xl overflow-hidden no-print mb-5">
      {/* Header Bar */}
      <div className="bg-gradient-to-l from-[#0A1628] via-[#0F1E36] to-[#0D9488]/40 text-white px-5 py-3.5 flex items-center justify-between flex-wrap gap-2 border-b border-[#D4AF37]/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-inner">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#FDE68A]">
              الرسوم البيانية والإحصائيات التفاعلية لتوزيع الحصص وتراكم المديونيات
            </h3>
            <p className="text-[11px] text-slate-300 font-bold">
              مقارنة الحصص التموينية وتتبع القرى الأكثر تراكماً للمديونيات (Area & Bar Charts)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick EXE Launcher Download Button */}
          <button
            onClick={async () => {
              setExeToastMsg('جاري تنزيل برنامج المنظومة (EXE) وتثبيت أيقونة سطح المكتب...');
              const res = await downloadWindowsExeLauncher();
              setExeToastMsg(res.message);
              setTimeout(() => setExeToastMsg(null), 5000);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-l from-[#D4AF37] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#0A1628] rounded-xl text-xs font-black shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer border border-[#D4AF37]"
            title="تحميل مشغل ويندوز التنفيذي (EXE) وتثبيت أيقونة سطح المكتب فوراً"
          >
            <Download className="w-3.5 h-3.5 text-[#0A1628]" />
            <span>تحميل التطبيق (EXE)</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0F1E36] hover:bg-[#0D9488] text-[#FDE68A] hover:text-white rounded-xl text-xs font-black transition-all duration-300 border border-[#D4AF37]/40 cursor-pointer shadow-sm"
          >
            {isExpanded ? (
              <>
                <span>إخفاء الرسوم البيانية</span>
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>عرض الرسوم البيانية التفاعلية</span>
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {exeToastMsg && (
        <div className="bg-amber-950/90 border-b border-amber-600/50 px-4 py-2 text-xs font-black text-amber-200 text-center animate-in fade-in flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
          <span>{exeToastMsg}</span>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-black/60">
          {/* Controls & Filters Bar */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center flex-wrap gap-3">
              {/* Village Filter */}
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-300">
                <Filter className="w-4 h-4 text-amber-400" />
                <span>القرية:</span>
                <select
                  value={selectedVillageFilter}
                  onChange={(e) => {
                    setSelectedVillageFilter(e.target.value);
                    setSelectedUnitFilter('ALL');
                  }}
                  className="px-3 py-1.5 bg-black border border-slate-700 rounded-xl font-black text-slate-100 text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="ALL">جميع القرى بالمركز ({villages.length})</option>
                  {villages.map((v) => (
                    <option key={v.village} value={v.village}>
                      {v.village}
                    </option>
                  ))}
                </select>
              </div>

              {/* Local Unit Filter */}
              {selectedVillageFilter !== 'ALL' && (
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-300">
                  <span>الوحدة المحلية:</span>
                  <select
                    value={selectedUnitFilter}
                    onChange={(e) => setSelectedUnitFilter(e.target.value)}
                    className="px-3 py-1.5 bg-black border border-slate-700 rounded-xl font-black text-slate-100 text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">كافة الوحدات التابعة لـ ({selectedVillageFilter})</option>
                    {villages
                      .find((v) => v.village === selectedVillageFilter)
                      ?.localUnits.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Chart Mode Switcher */}
              <div className="flex items-center flex-wrap bg-slate-900/95 p-1.5 rounded-2xl border border-indigo-500/30 text-xs font-black gap-1.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => setChartType('quotas')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all duration-300 cursor-pointer ${
                    chartType === 'quotas'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-lg shadow-amber-500/25 scale-[1.02]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  الحصص التأمينية والفعلية (Composed)
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('loaves')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all duration-300 cursor-pointer ${
                    chartType === 'loaves'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-lg shadow-emerald-500/25 scale-[1.02]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  الأرغفة اليومية (Gradient Bar)
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('beneficiaries')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all duration-300 cursor-pointer ${
                    chartType === 'beneficiaries'
                      ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-black shadow-lg shadow-indigo-500/25 scale-[1.02]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  نمو المستفيدين 2023–2025
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('debts')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
                    chartType === 'debts'
                      ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white font-black shadow-lg shadow-rose-600/30 scale-[1.02]'
                      : 'text-slate-300 hover:text-rose-400 hover:bg-slate-800'
                  }`}
                  title="عرض رسم بياني مساحي ومتراكم لتراكم المديونيات المتبقية لكل قرية"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>منحنى المديونيات المتبقية (Area + Line)</span>
                </button>
              </div>
            </div>

            {/* Quick Summary Pill */}
            <div className="flex items-center flex-wrap gap-3 text-xs font-black text-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 px-4 py-2 rounded-2xl border border-indigo-500/30 shadow-lg">
              <span>المخابز: <strong className="text-amber-400 font-mono">{totals.count}</strong></span>
              <span className="text-slate-700">|</span>
              <span>تأمينية: <strong className="text-amber-300 font-mono">{totals.insurance.toLocaleString()}</strong></span>
              <span className="text-slate-700">|</span>
              <span>فعلية: <strong className="text-cyan-300 font-mono">{totals.actual.toLocaleString()}</strong></span>
              <span className="text-slate-700">|</span>
              <span>الأرغفة: <strong className="text-emerald-400 font-mono">{totals.loaves.toLocaleString()}</strong></span>
              <span className="text-slate-700">|</span>
              <span>المديونيات: <strong className="text-rose-400 font-mono">{totals.debts.toLocaleString()}</strong> ج.م</span>
            </div>
          </div>

          {/* D3.js Debt Value Categories Donut Chart & Analytical Cards */}
          <D3DebtAnalysisChart
            bakeries={filteredData}
            debts={debts}
            onSelectTierFilter={onSelectTierFilter}
          />

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Interactive Chart (2 columns width) with Explicit Numbers */}
            <div className="lg:col-span-2 bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h4 className="text-xs font-black text-slate-100 flex items-center gap-2">
                  {chartType === 'debts' ? (
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  ) : (
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                  )}
                  <span>
                    {chartType === 'quotas'
                      ? `مقارنة الحصة التأمينية والفعلية بالأرقام المباشرة حسب ${selectedVillageFilter === 'ALL' ? 'القرية' : 'الوحدة المحلية'}`
                      : chartType === 'loaves'
                      ? `إجمالي الأرغفة المنتجة يومياً بالأرقام المباشرة حسب ${selectedVillageFilter === 'ALL' ? 'القرية' : 'الوحدة المحلية'}`
                      : `رسم بياني مساحي (Area Chart) لتراكم المديونيات المتبقية بالأرقام حسب ${selectedVillageFilter === 'ALL' ? 'القرية' : 'الوحدة المحلية'}`}
                  </span>
                </h4>
                <span className="text-[10px] text-slate-300 font-bold bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-lg shadow-inner">
                  {chartType === 'debts' ? 'الأرقام بالجنيه المصري (ج.م)' : 'الأرقام بالشيكارة والرغيف مباشرة'}
                </span>
              </div>

              <div className="h-80 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'debts' ? (
                    <ComposedChart data={barChartData} margin={{ top: 24, right: 15, left: 15, bottom: 35 }}>
                      <defs>
                        <linearGradient id="debtAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.85} />
                          <stop offset="65%" stopColor="#e11d48" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#881337" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="debtBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#be123c" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: '#e2e8f0' }} interval={0} angle={-22} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#090d16',
                          borderColor: '#f43f5e',
                          borderWidth: '2px',
                          borderRadius: '16px',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          direction: 'rtl',
                          textAlign: 'right',
                          boxShadow: '0 20px 40px -15px rgba(244,63,94,0.4)'
                        }}
                        formatter={(val: unknown) => [`${Number(val || 0).toLocaleString()} ج.م`, 'إجمالي المديونية المتبقية']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                      <Area
                        type="monotone"
                        dataKey="totalRemainingDebt"
                        name="منحنى تراكم المديونيات (ج.م)"
                        stroke="#fb7185"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#debtAreaGrad)"
                      />
                      <Bar
                        dataKey="totalRemainingDebt"
                        name="قيمة المديونية لكل قطاع (ج.م)"
                        fill="url(#debtBarGrad)"
                        barSize={26}
                        radius={[8, 8, 0, 0]}
                      >
                        <LabelList
                          dataKey="totalRemainingDebt"
                          position="top"
                          fill="#fda4af"
                          fontSize={10}
                          fontWeight={900}
                          formatter={(v: unknown) => (Number(v) > 0 ? `${Number(v).toLocaleString()} ج` : '')}
                        />
                      </Bar>
                    </ComposedChart>
                  ) : chartType === 'beneficiaries' ? (
                    <ComposedChart data={barChartData} margin={{ top: 24, right: 15, left: 15, bottom: 35 }}>
                      <defs>
                        <linearGradient id="ben23Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#4338ca" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="ben24Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#0284c7" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="ben25Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: '#e2e8f0' }} interval={0} angle={-22} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#090d16',
                          borderColor: '#38bdf8',
                          borderWidth: '2px',
                          borderRadius: '16px',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                      <Bar dataKey="ben2023" name="مستفيدي 2023" fill="url(#ben23Grad)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="ben2024" name="مستفيدي 2024" fill="url(#ben24Grad)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="ben2025" name="مستفيدي 2025" fill="url(#ben25Grad)" radius={[6, 6, 0, 0]}>
                        <LabelList
                          dataKey="ben2025"
                          position="top"
                          fill="#6ee7b7"
                          fontSize={10}
                          fontWeight={900}
                          formatter={(v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : '')}
                        />
                      </Bar>
                      <Line type="monotone" dataKey="ben2025" name="اتجاه النمو 2025" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 4, fill: '#fbbf24' }} />
                    </ComposedChart>
                  ) : (
                    <ComposedChart data={barChartData} margin={{ top: 24, right: 15, left: 15, bottom: 35 }}>
                      <defs>
                        <linearGradient id="insQuotaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.98} />
                          <stop offset="100%" stopColor="#d97706" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="actQuotaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.98} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="loavesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.98} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: '#e2e8f0' }} interval={0} angle={-22} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#090d16',
                          borderColor: '#f59e0b',
                          borderWidth: '2px',
                          borderRadius: '16px',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          direction: 'rtl',
                          textAlign: 'right',
                          boxShadow: '0 20px 40px -15px rgba(245,158,11,0.35)'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                      {chartType === 'quotas' ? (
                        <>
                          <Bar dataKey="insuranceQuota" name="الحصة التأمينية (شيكارة)" fill="url(#insQuotaGrad)" radius={[8, 8, 0, 0]}>
                            <LabelList
                              dataKey="insuranceQuota"
                              position="top"
                              fill="#fde68a"
                              fontSize={10}
                              fontWeight={900}
                              formatter={(v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : '')}
                            />
                          </Bar>
                          <Bar dataKey="actualQuota" name="الحصة الفعلية (شيكارة)" fill="url(#actQuotaGrad)" radius={[8, 8, 0, 0]}>
                            <LabelList
                              dataKey="actualQuota"
                              position="top"
                              fill="#93c5fd"
                              fontSize={10}
                              fontWeight={900}
                              formatter={(v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : '')}
                            />
                          </Bar>
                          <Line
                            type="monotone"
                            dataKey="actualQuota"
                            name="منحنى التوزيع الفعلي"
                            stroke="#34d399"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 1.5 }}
                          />
                        </>
                      ) : (
                        <>
                          <Bar dataKey="loavesCount" name="إجمالي الأرغفة اليومية (رغيف)" fill="url(#loavesGrad)" radius={[8, 8, 0, 0]}>
                            <LabelList
                              dataKey="loavesCount"
                              position="top"
                              fill="#6ee7b7"
                              fontSize={10}
                              fontWeight={900}
                              formatter={(v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString() : '')}
                            />
                          </Bar>
                          <Line
                            type="monotone"
                            dataKey="loavesCount"
                            name="مؤشر كفاءة الإنتاج"
                            stroke="#fbbf24"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#fbbf24' }}
                          />
                        </>
                      )}
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart (1 column width) */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h4 className="text-xs font-black text-slate-100 flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-amber-400" />
                  <span>توزيع الحصة الفعلية بالأرقام والنسب</span>
                </h4>
              </div>

              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={quotaPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} (${((percent || 0) * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {quotaPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#020617',
                        borderColor: '#eab308',
                        borderRadius: '12px',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        direction: 'rtl'
                      }}
                      formatter={(val: unknown) => [`${Number(val || 0).toLocaleString()} شيكارة`, 'الحصة الفعلية']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Activity Status Breakdown Pills */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-center gap-2">
                {pieChartData.map((st, idx) => (
                  <span
                    key={st.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border"
                    style={{
                      backgroundColor: `${COLORS[idx % COLORS.length]}20`,
                      borderColor: COLORS[idx % COLORS.length],
                      color: '#f8fafc'
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span>{st.name}:</span>
                    <strong className="text-amber-300">{st.value} مخبز</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* New Explicit Numbers Analytical Table for Administrative Decision-Making */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="bg-gradient-to-r from-black via-slate-900 to-black text-white px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-black text-amber-300">
                  جدول التحليل الإحصائي الرقمي المباشر ({selectedVillageFilter === 'ALL' ? 'لكافة القرى' : `لقرية ${selectedVillageFilter}`})
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-bold">
                إجمالي ({barChartData.length}) منطقة
              </span>
            </div>

            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-center border-collapse text-xs">
                <thead className="bg-black text-slate-200 font-black border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-2 border-l border-slate-800">القرية / المنطقة</th>
                    <th className="py-2.5 px-2 border-l border-slate-800">عدد المخابز</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-amber-300">المبلغ التأميني</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-amber-400">الحصة التأمينية</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-cyan-300">الحصة الفعلية</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-emerald-400">الأرغفة اليومية</th>
                    <th className="py-2.5 px-2 border-l border-slate-800">مستفيدي 2023</th>
                    <th className="py-2.5 px-2 border-l border-slate-800">مستفيدي 2024</th>
                    <th className="py-2.5 px-2 border-l border-slate-800">مستفيدي 2025</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-sky-300">متوسط 2023</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-sky-300">متوسط 2024</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-sky-300">متوسط 2025</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-emerald-300">متوسط المخبز</th>
                    <th className="py-2.5 px-2 border-l border-slate-800 text-amber-300">الفرق التراكمي</th>
                    <th className="py-2.5 px-2 text-rose-400">إجمالي المتبقي (ج.م)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-bold text-slate-300">
                  {barChartData.map((row, idx) => (
                    <tr key={row.name} className={idx % 2 === 0 ? 'bg-slate-900/80 hover:bg-slate-800/80' : 'bg-slate-950 hover:bg-slate-800/80'}>
                      <td className="py-2 px-2 border-l border-slate-800 font-black text-slate-100">{row.name}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono">{row.bakeryCount} مخبز</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono text-amber-200">{row.insuranceValue.toLocaleString()} ج.م</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono font-black text-amber-300">{row.insuranceQuota.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono font-black text-cyan-300">{row.actualQuota.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono font-black text-emerald-300">{row.loavesCount.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono">{row.ben2023.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono">{row.ben2024.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono">{row.ben2025.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono text-sky-300">{row.avg2023.toFixed(2)}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono text-sky-300">{row.avg2024.toFixed(2)}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono text-sky-300">{row.avg2025.toFixed(2)}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono text-emerald-300">{row.perCapitaAvg.toFixed(2)}</td>
                      <td className="py-2 px-2 border-l border-slate-800 font-mono text-amber-300">{row.avgDiff.toFixed(2)}</td>
                      <td className="py-2 px-2 font-mono font-black text-rose-300">
                        {row.totalRemainingDebt > 0 ? `${row.totalRemainingDebt.toLocaleString()} ج.م` : 'خالص (0)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-black text-white font-black border-t-2 border-slate-800">
                  <tr className="total-summary-row">
                    <td className="py-2.5 px-2 border-l border-slate-800 text-amber-400">
                      صف الإجماليات TOTAL SUMMARY ({barChartData.length} منطقة)
                    </td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono">{totals.count} مخبز</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-amber-200">{totals.insuranceValue.toLocaleString()} ج.م</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-amber-300">{totals.insurance.toLocaleString()} شيكارة</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-cyan-300">{totals.actual.toLocaleString()} شيكارة</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-emerald-300">{totals.loaves.toLocaleString()} رغيف</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono">{totals.ben2023.toLocaleString()}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono">{totals.ben2024.toLocaleString()}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono">{totals.ben2025.toLocaleString()}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-sky-300">{totals.avg2023}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-sky-300">{totals.avg2024}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-sky-300">{totals.avg2025}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-emerald-300">{totals.perCapitaAvg}</td>
                    <td className="py-2.5 px-2 border-l border-slate-800 font-mono text-amber-300">{totals.avgDiff}</td>
                    <td className="py-2.5 px-2 font-mono text-rose-300">{totals.debts.toLocaleString()} ج.م</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

