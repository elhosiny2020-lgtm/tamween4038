import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Store,
  Scale,
  MapPin,
  Filter,
  ArrowUpRight,
  Award,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { Bakery, DebtRecord, VillageHierarchy } from '../types';

interface ExecutiveAnalyticsDashboardProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  branchName: string;
  onSelectBakeryForDebts?: (bakeryId: string) => void;
  onNavigateTab?: (tab: 'bakeries' | 'debts' | 'charts') => void;
}

const VILLAGE_COLORS = [
  '#0D9488',
  '#1E40AF',
  '#D4AF37',
  '#10B981',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
];

export const ExecutiveAnalyticsDashboard: React.FC<ExecutiveAnalyticsDashboardProps> = ({
  bakeries,
  debts,
  villages,
  branchName,
  onSelectBakeryForDebts,
  onNavigateTab,
}) => {
  const [selectedVillage, setSelectedVillage] = useState<string>('ALL');
  const [topLimit, setTopLimit] = useState<number>(8);
  const [focusedBakeryId, setFocusedBakeryId] = useState<string | null>(null);

  const filteredBakeries = useMemo(() => {
    if (selectedVillage === 'ALL') return bakeries;
    return bakeries.filter((b) => b.village === selectedVillage);
  }, [bakeries, selectedVillage]);

  const filteredDebts = useMemo(() => {
    if (selectedVillage === 'ALL') return debts;
    return debts.filter((d) => d.village === selectedVillage);
  }, [debts, selectedVillage]);

  // 1. KPI Summary
  const kpis = useMemo(() => {
    const totalBakeries = filteredBakeries.length;
    const totalInsuranceQuota = filteredBakeries.reduce(
      (sum, b) => sum + (Number(b.insuranceQuota) || 0),
      0
    );
    const totalLoaves = filteredBakeries.reduce((sum, b) => sum + (Number(b.loavesCount) || 0), 0);

    const totalOriginalDebt = filteredDebts.reduce(
      (sum, d) =>
        sum +
        (Number(d.totalViolations) || 0) +
        (Number(d.addedAmount) || 0) +
        (Number(d.disposalValue) || 0),
      0
    );
    const totalPaidDebt = filteredDebts.reduce(
      (sum, d) =>
        sum +
        (Number(d.paidViolationAmount) || 0) +
        (Number(d.paidAddedAmount) || 0) +
        (Number(d.paidDisposalAmount) || 0),
      0
    );
    const totalRemainingDebt = filteredDebts.reduce(
      (sum, d) => sum + Math.max(0, Number(d.netRemainingDebt) || 0),
      0
    );
    const collectionRatePct =
      totalOriginalDebt > 0 ? Math.round((totalPaidDebt / totalOriginalDebt) * 1000) / 10 : 100;

    return {
      totalBakeries,
      totalInsuranceQuota,
      totalLoaves,
      totalOriginalDebt,
      totalPaidDebt,
      totalRemainingDebt,
      collectionRatePct,
    };
  }, [filteredBakeries, filteredDebts]);

  // 2. المخابز الأكثر مديونية (Most Indebted Bakeries)
  const mostIndebtedData = useMemo(() => {
    const byBakery = new Map<
      string,
      {
        bakeryId: string;
        name: string;
        shortName: string;
        village: string;
        remainingDebt: number;
        paidDebt: number;
        recordsCount: number;
      }
    >();

    filteredDebts.forEach((d) => {
      const remaining = Math.max(0, Number(d.netRemainingDebt) || 0);
      const paid =
        (Number(d.paidViolationAmount) || 0) +
        (Number(d.paidAddedAmount) || 0) +
        (Number(d.paidDisposalAmount) || 0);
      const current = byBakery.get(d.bakeryId) || {
        bakeryId: d.bakeryId,
        name: d.bakeryOwnerName || 'مخبز غير مسمى',
        shortName:
          (d.bakeryOwnerName || 'مخبز').length > 22
            ? `${(d.bakeryOwnerName || 'مخبز').slice(0, 20)}..`
            : d.bakeryOwnerName || 'مخبز',
        village: d.village || '-',
        remainingDebt: 0,
        paidDebt: 0,
        recordsCount: 0,
      };
      current.remainingDebt += remaining;
      current.paidDebt += paid;
      current.recordsCount += 1;
      byBakery.set(d.bakeryId, current);
    });

    return Array.from(byBakery.values())
      .filter((x) => x.remainingDebt > 0)
      .sort((a, b) => b.remainingDebt - a.remainingDebt)
      .slice(0, topLimit);
  }, [filteredDebts, topLimit]);

  // 3. نسب التوزيع حسب القرى (Village Distribution Ratios)
  const villageDistributionData = useMemo(() => {
    const byVillage = new Map<
      string,
      { village: string; bakeriesCount: number; remainingDebt: number; sharePct: number }
    >();
    const total = Math.max(1, bakeries.length);

    bakeries.forEach((b) => {
      const v = b.village || 'غير محدد';
      const entry = byVillage.get(v) || {
        village: v,
        bakeriesCount: 0,
        remainingDebt: 0,
        sharePct: 0,
      };
      entry.bakeriesCount += 1;
      byVillage.set(v, entry);
    });

    debts.forEach((d) => {
      const v = d.village || 'غير محدد';
      const entry = byVillage.get(v) || {
        village: v,
        bakeriesCount: 0,
        remainingDebt: 0,
        sharePct: 0,
      };
      entry.remainingDebt += Math.max(0, Number(d.netRemainingDebt) || 0);
      byVillage.set(v, entry);
    });

    return Array.from(byVillage.values())
      .map((item) => ({
        ...item,
        sharePct: Math.round((item.bakeriesCount / total) * 1000) / 10,
      }))
      .sort((a, b) => b.bakeriesCount - a.bakeriesCount);
  }, [bakeries, debts]);

  // 4. معدلات الأداء السنوي (Annual Performance Rates 2023 - 2025)
  const annualPerformanceData = useMemo(() => {
    const ben2023 = filteredBakeries.reduce((s, b) => s + (Number(b.beneficiaries2023) || 0), 0);
    const ben2024 = filteredBakeries.reduce((s, b) => s + (Number(b.beneficiaries2024) || 0), 0);
    const ben2025 = filteredBakeries.reduce((s, b) => s + (Number(b.beneficiaries2025) || 0), 0);

    const avg2023 =
      filteredBakeries.length > 0
        ? Math.round(
            (filteredBakeries.reduce((s, b) => s + (parseFloat(String(b.avg2023 || 0)) || 0), 0) /
              filteredBakeries.length) *
              100
          ) / 100
        : 0;
    const avg2024 =
      filteredBakeries.length > 0
        ? Math.round(
            (filteredBakeries.reduce((s, b) => s + (parseFloat(String(b.avg2024 || 0)) || 0), 0) /
              filteredBakeries.length) *
              100
          ) / 100
        : 0;
    const avg2025 =
      filteredBakeries.length > 0
        ? Math.round(
            (filteredBakeries.reduce((s, b) => s + (parseFloat(String(b.avg2025 || 0)) || 0), 0) /
              filteredBakeries.length) *
              100
          ) / 100
        : 0;

    return [
      { year: 'عام 2023', المستفيدون: ben2023, متوسط_الصرف: avg2023 },
      { year: 'عام 2024', المستفيدون: ben2024, متوسط_الصرف: avg2024 },
      { year: 'عام 2025', المستفيدون: ben2025, متوسط_الصرف: avg2025 },
    ];
  }, [filteredBakeries]);

  const focusedBakeryDetail = useMemo(
    () => mostIndebtedData.find((x) => x.bakeryId === focusedBakeryId) || mostIndebtedData[0] || null,
    [mostIndebtedData, focusedBakeryId]
  );

  return (
    <div className="space-y-5" dir="rtl" data-testid="executive-analytics-dashboard">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#0A1628] via-[#13294B] to-[#0D9488] text-white rounded-2xl p-5 shadow-lg border border-[#D4AF37]/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-[#D4AF37] text-[#0A1628] shadow-md">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">
              لوحة التحليلات التنفيذية التفاعلية ومؤشرات الأداء (Recharts)
            </h2>
            <p className="text-xs text-[#5EEAD4] font-bold mt-0.5">
              {branchName} • المخابز الأكثر مديونية · نسب التوزيع حسب القرى · معدلات الأداء السنوي (2023-2025)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
            <Filter className="w-4 h-4 text-[#D4AF37]" />
            <select
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
              aria-label="تصفية التحليلات حسب القرية"
              className="bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="text-slate-900">
                كافة القرى ({villages.length})
              </option>
              {villages.map((v) => (
                <option key={v.village} value={v.village} className="text-slate-900">
                  {v.village}
                </option>
              ))}
            </select>
          </div>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('debts')}
              className="px-3.5 py-2 bg-[#D4AF37] hover:bg-amber-400 text-[#0A1628] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Scale className="w-4 h-4" />
              <span>سجل المديونيات</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">إجمالي المخابز بالقطاع</span>
            <span className="text-2xl font-black text-[#0A1628] font-mono tabular-nums mt-1 block">
              {kpis.totalBakeries.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-[#0D9488]">
              الحصة التأمينية: {kpis.totalInsuranceQuota.toLocaleString()} شيكارة
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-[#0D9488]/10 text-[#0D9488]">
            <Store className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">صافي المديونيات المتبقية</span>
            <span className="text-2xl font-black text-rose-700 font-mono tabular-nums mt-1 block">
              {kpis.totalRemainingDebt.toLocaleString()} ج.م
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              أصل المطالبات: {kpis.totalOriginalDebt.toLocaleString()} ج.م
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-rose-50 text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">نسبة التحصيل والسداد</span>
            <span className="text-2xl font-black text-emerald-700 font-mono tabular-nums mt-1 block">
              {kpis.collectionRatePct}%
            </span>
            <span className="text-[11px] font-bold text-emerald-700">
              محصل: {kpis.totalPaidDebt.toLocaleString()} ج.م
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">إجمالي الأرغفة المنتجة</span>
            <span className="text-2xl font-black text-[#1E40AF] font-mono tabular-nums mt-1 block">
              {kpis.totalLoaves.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              تغطي {villageDistributionData.length} قرية
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-blue-50 text-[#1E40AF]">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Chart 1: المخابز الأكثر مديونية */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-sm font-black text-[#0A1628]">
                1. المخابز الأكثر مديونية (صافي المتبقي بالجنيه)
              </h3>
              <p className="text-[11px] font-bold text-slate-500">
                اضغط على أي مخبز لعرض تفاصيله والانتقال المباشر لسجل مديونياته
              </p>
            </div>
            <select
              value={topLimit}
              onChange={(e) => setTopLimit(Number(e.target.value))}
              aria-label="عدد المخابز الأكثر مديونية"
              className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-slate-800 cursor-pointer"
            >
              <option value={5}>أعلى 5 مخابز</option>
              <option value={8}>أعلى 8 مخابز</option>
              <option value={12}>أعلى 12 مخبزاً</option>
            </select>
          </div>

          {mostIndebtedData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-xs font-black text-emerald-700 bg-emerald-50/50 rounded-xl border border-emerald-200">
              لا توجد مديونيات متبقية غير مسددة في هذا النطاق 🎉
            </div>
          ) : (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mostIndebtedData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 20, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }} />
                  <YAxis
                    type="category"
                    dataKey="shortName"
                    width={130}
                    tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 700 }}
                  />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val || 0).toLocaleString()} ج.م`, '']}
                  />
                  <Legend />
                  <Bar
                    dataKey="remainingDebt"
                    name="المتبقي مستحق السداد"
                    fill="#E11D48"
                    radius={[0, 6, 6, 0]}
                    onClick={(entry: any) => {
                      if (entry?.bakeryId) setFocusedBakeryId(entry.bakeryId);
                    }}
                  />
                  <Bar
                    dataKey="paidDebt"
                    name="المبالغ المسددة"
                    fill="#10B981"
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {focusedBakeryDetail && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-black text-[#0A1628]">{focusedBakeryDetail.name}</span>
                <span className="text-slate-500 font-bold mx-2">• القرية: {focusedBakeryDetail.village}</span>
                <span className="text-rose-700 font-black font-mono tabular-nums">
                  المتبقي: {focusedBakeryDetail.remainingDebt.toLocaleString()} ج.م
                </span>
              </div>
              {onSelectBakeryForDebts && (
                <button
                  type="button"
                  onClick={() => onSelectBakeryForDebts(focusedBakeryDetail.bakeryId)}
                  className="px-3 py-1.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer"
                >
                  <span>فتح قيود المخبز</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Chart 2: نسب التوزيع حسب القرى */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-[#0A1628] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#0D9488]" />
                <span>2. نسب التوزيع حسب القرى</span>
              </h3>
              <p className="text-[11px] font-bold text-slate-500">
                حصة كل قرية من إجمالي مخابز القطاع والمديونيات المرتبطة
              </p>
            </div>
          </div>

          {villageDistributionData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs font-black text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              لا توجد مخابز مسجلة في هذا النطاق لعرض نسب التوزيع
            </div>
          ) : (
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={villageDistributionData.slice(0, 8)}
                    dataKey="bakeriesCount"
                    nameKey="village"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {villageDistributionData.slice(0, 8).map((_, idx) => (
                      <Cell key={idx} fill={VILLAGE_COLORS[idx % VILLAGE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, _name: any, props: any) => [
                      `${val} مخبز (${props?.payload?.sharePct ?? 0}%)`,
                      props?.payload?.village || '',
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
            {villageDistributionData.map((row, i) => (
              <div
                key={row.village}
                className="px-3 py-1.5 flex items-center justify-between hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: VILLAGE_COLORS[i % VILLAGE_COLORS.length] }}
                  />
                  <span className="font-black text-slate-800">{row.village}</span>
                </div>
                <div className="flex items-center gap-3 font-mono tabular-nums font-bold">
                  <span className="text-[#0D9488]">{row.bakeriesCount} مخبز ({row.sharePct}%)</span>
                  <span className="text-rose-700">{row.remainingDebt.toLocaleString()} ج.م</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chart 3: معدلات الأداء السنوي */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="border-b border-slate-100 pb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-[#0A1628]">
              3. معدلات الأداء السنوي التراكمية (2023 – 2024 – 2025)
            </h3>
            <p className="text-[11px] font-bold text-slate-500">
              مقارنة تطور أعداد المستفيدين ومتوسطات الصرف السنوية على مستوى القطاع المحدد
            </p>
          </div>
        </div>

        <div className="h-72 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={annualPerformanceData} margin={{ top: 10, right: 24, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fontWeight: 700, fill: '#0F172A' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fontWeight: 700, fill: '#1E40AF' }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fontWeight: 700, fill: '#0D9488' }} />
              <Tooltip />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="المستفيدون"
                fill="#1E40AF"
                radius={[8, 8, 0, 0]}
                barSize={48}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="متوسط_الصرف"
                stroke="#D4AF37"
                strokeWidth={3}
                dot={{ r: 6, fill: '#0D9488' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
