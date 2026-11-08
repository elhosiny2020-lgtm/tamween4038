import React, { useState, useMemo } from 'react';
import { Bakery, DebtRecord, VillageHierarchy } from '../types';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { PieChart as PieIcon, BarChart3, Filter, ChevronDown, ChevronUp, TrendingUp, Download, ShieldAlert } from 'lucide-react';
import { downloadWindowsDesktopInstallerBat, downloadUpdatedAppHtml } from '../utils/htmlExporter';

interface BakeryAnalyticsChartsProps {
  bakeries: Bakery[];
  debts?: DebtRecord[];
  villages: VillageHierarchy[];
}

const COLORS = [
  '#d97706', '#2563eb', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f59e0b', '#3b82f6', '#10b981', '#ec4899',
  '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#a855f7'
];

export const BakeryAnalyticsCharts: React.FC<BakeryAnalyticsChartsProps> = ({
  bakeries,
  debts = [],
  villages
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedVillageFilter, setSelectedVillageFilter] = useState('ALL');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('ALL');
  const [chartType, setChartType] = useState<'quotas' | 'loaves' | 'debts'>('quotas');
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
    return bakeries.filter((b) => {
      if (selectedVillageFilter !== 'ALL' && b.village !== selectedVillageFilter) return false;
      if (selectedUnitFilter !== 'ALL' && b.localUnit !== selectedUnitFilter) return false;
      return true;
    });
  }, [bakeries, selectedVillageFilter, selectedUnitFilter]);

  // Aggregated data by Village / Local Unit
  const barChartData = useMemo(() => {
    const map = new Map<string, { name: string; insuranceQuota: number; actualQuota: number; loavesCount: number; totalRemainingDebt: number; bakeryCount: number }>();

    filteredData.forEach((b) => {
      const key = selectedVillageFilter === 'ALL' ? b.village : b.localUnit;
      const current = map.get(key) || { name: key, insuranceQuota: 0, actualQuota: 0, loavesCount: 0, totalRemainingDebt: 0, bakeryCount: 0 };
      current.insuranceQuota += b.insuranceQuota || 0;
      current.actualQuota += b.actualQuota || 0;
      current.loavesCount += b.loavesCount || 0;
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
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, b) => ({
        insurance: acc.insurance + (b.insuranceQuota || 0),
        actual: acc.actual + (b.actualQuota || 0),
        loaves: acc.loaves + (b.loavesCount || 0),
        debts: acc.debts + (bakeryDebtsMap[b.id] || 0),
        count: acc.count + 1
      }),
      { insurance: 0, actual: 0, loaves: 0, debts: 0, count: 0 }
    );
  }, [filteredData, bakeryDebtsMap]);

  return (
    <div className="bg-white border-2 border-slate-300 rounded-2xl shadow-sm overflow-hidden no-print mb-4">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
            <BarChart3 className="w-5 h-5 icon-animated" />
          </div>
          <div>
            <h3 className="text-sm font-black text-amber-200">
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
            onClick={() => {
              const res = downloadWindowsDesktopInstallerBat();
              setExeToastMsg(res.message);
              setTimeout(() => setExeToastMsg(null), 4000);
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 rounded-lg text-xs font-black shadow transition cursor-pointer border border-amber-300"
            title="تحويل التطبيق إلى ملف EXE وتثبيت أيقونة سطح المكتب فوراً"
          >
            <Download className="w-3.5 h-3.5 text-slate-950 icon-animated" />
            <span>تحويل التطبيق إلى EXE</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-black transition cursor-pointer border border-amber-500/30"
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
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-1.5 text-xs font-black text-amber-900 text-center animate-in fade-in">
          {exeToastMsg}
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-slate-50/50">
          {/* Controls & Filters Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center flex-wrap gap-3">
              {/* Village Filter */}
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-700">
                <Filter className="w-4 h-4 text-amber-600" />
                <span>القرية:</span>
                <select
                  value={selectedVillageFilter}
                  onChange={(e) => {
                    setSelectedVillageFilter(e.target.value);
                    setSelectedUnitFilter('ALL');
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
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
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-700">
                  <span>الوحدة المحلية:</span>
                  <select
                    value={selectedUnitFilter}
                    onChange={(e) => setSelectedUnitFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-black text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
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
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-black gap-1">
                <button
                  onClick={() => setChartType('quotas')}
                  className={`px-3 py-1 rounded-md transition ${
                    chartType === 'quotas'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الحصص (شيكارة)
                </button>
                <button
                  onClick={() => setChartType('loaves')}
                  className={`px-3 py-1 rounded-md transition ${
                    chartType === 'loaves'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الأرغفة اليومية
                </button>
                <button
                  onClick={() => setChartType('debts')}
                  className={`px-3 py-1 rounded-md transition flex items-center gap-1 ${
                    chartType === 'debts'
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-red-700'
                  }`}
                  title="عرض رسم بياني مساحي (Area Chart) لتراكم المديونيات المتبقية لكل قرية"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>تراكم المديونيات (Area Chart)</span>
                </button>
              </div>
            </div>

            {/* Quick Summary Pill */}
            <div className="flex items-center gap-3 text-xs font-black text-slate-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              <span>المخابز: <strong className="text-amber-900">{totals.count}</strong></span>
              <span className="text-slate-300">|</span>
              <span>تأمينية: <strong className="text-amber-900">{totals.insurance.toLocaleString()}</strong> شيكارة</span>
              <span className="text-slate-300">|</span>
              <span>المديونيات: <strong className="text-rose-700">{totals.debts.toLocaleString()}</strong> ج.م</span>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Interactive Chart (2 columns width) */}
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2">
                  {chartType === 'debts' ? (
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  ) : (
                    <BarChart3 className="w-4 h-4 text-amber-600" />
                  )}
                  <span>
                    {chartType === 'quotas'
                      ? `مقارنة الحصة التأمينية والفعلية حسب ${selectedVillageFilter === 'ALL' ? 'القرية' : 'الوحدة المحلية'}`
                      : chartType === 'loaves'
                      ? `إجمالي الأرغفة المنتجة يومياً حسب ${selectedVillageFilter === 'ALL' ? 'القرية' : 'الوحدة المحلية'}`
                      : `رسم بياني مساحي (Area Chart) لتراكم المديونيات المتبقية حسب ${selectedVillageFilter === 'ALL' ? 'القرية' : 'الوحدة المحلية'}`}
                  </span>
                </h4>
                <span className="text-[10px] text-slate-400 font-bold">
                  {chartType === 'debts' ? 'قيم بالجنيه المصري (ج.م)' : 'قيم بالدقيق والرغيف'}
                </span>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'debts' ? (
                    <AreaChart data={barChartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                      <defs>
                        <linearGradient id="debtGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#991b1b" stopOpacity={0.15} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} interval={0} angle={-25} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#ef4444',
                          borderRadius: '12px',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                        formatter={(val: unknown) => [`${Number(val || 0).toLocaleString()} ج.م`, 'إجمالي المديونية المتبقية']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '8px' }} />
                      <Area
                        type="monotone"
                        dataKey="totalRemainingDebt"
                        name="إجمالي المديونيات المتبقية (ج.م)"
                        stroke="#dc2626"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#debtGradient)"
                      />
                    </AreaChart>
                  ) : (
                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }} interval={0} angle={-25} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#eab308',
                          borderRadius: '12px',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '8px' }} />
                      {chartType === 'quotas' ? (
                        <>
                          <Bar dataKey="insuranceQuota" name="الحصة التأمينية (شيكارة)" fill="#d97706" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="actualQuota" name="الحصة الفعلية (شيكارة)" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        </>
                      ) : (
                        <Bar dataKey="loavesCount" name="إجمالي الأرغفة اليومية (رغيف)" fill="#10b981" radius={[6, 6, 0, 0]} />
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart (1 column width) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-black text-slate-900 flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-amber-600" />
                  <span>توزيع الحصة الفعلية حسب القرى والمناطق</span>
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
                        backgroundColor: '#0f172a',
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
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2">
                {pieChartData.map((st, idx) => (
                  <span
                    key={st.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border"
                    style={{
                      backgroundColor: `${COLORS[idx % COLORS.length]}15`,
                      borderColor: COLORS[idx % COLORS.length],
                      color: COLORS[idx % COLORS.length]
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span>{st.name}:</span>
                    <strong>{st.value} مخبز</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
