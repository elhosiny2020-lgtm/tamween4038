import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Bakery, DebtRecord, VillageHierarchy } from '../types';
import { matchesVillageOrUnitFilter } from '../utils/auditHelper';
import { Building2, PieChart as PieChartIcon, BarChart3, TrendingUp, Scale, Wheat } from 'lucide-react';

interface BakeryAnalyticsChartsProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  administrationTitle?: string;
  onNavigateToBakeries?: (opts?: { village?: string }) => void;
}

const PREMIUM_COLORS = ['#0A1628', '#0D9488', '#D4AF37', '#10B981', '#F43F5E', '#1E40AF', '#F59E0B', '#14B8A6'];

export const BakeryAnalyticsCharts: React.FC<BakeryAnalyticsChartsProps> = ({
  bakeries,
  debts,
  villages,
  administrationTitle = 'إدارة تموين مركز المحلة الكبرى',
  onNavigateToBakeries,
}) => {
  const [activeTab, setActiveTab] = useState<'villages' | 'debts' | 'loaves'>('villages');

  // Compute remaining debt map per bakery
  const bakeryRemainingDebtsMap = useMemo(() => {
    const map: Record<string, number> = {};
    debts.forEach((d) => {
      const bId = String(d.bakeryId || '');
      if (!bId) return;
      const net = Number(d.netRemainingDebt || 0);
      map[bId] = (map[bId] || 0) + net;
    });
    return map;
  }, [debts]);

  // 1. Distribution by Village (توزيع المخابز حسب القرية)
  const villageDistributionData = useMemo(() => {
    const countsMap: Record<string, { count: number; actualQuota: number; loaves: number }> = {};
    bakeries.forEach((b) => {
      const v = (b.village || 'غير مصنف').trim();
      if (!countsMap[v]) {
        countsMap[v] = { count: 0, actualQuota: 0, loaves: 0 };
      }
      countsMap[v].count += 1;
      countsMap[v].actualQuota += Number(b.actualQuota || 0);
      countsMap[v].loaves += Number(b.loavesCount || 0);
    });

    return Object.entries(countsMap).map(([village, stats], idx) => ({
      village,
      bakeriesCount: stats.count,
      actualQuota: stats.actualQuota,
      loavesCount: stats.loaves,
      color: PREMIUM_COLORS[idx % PREMIUM_COLORS.length],
    })).sort((a, b) => b.bakeriesCount - a.bakeriesCount);
  }, [bakeries]);

  // 2. Remaining Debts per Village / Region (نسبة المديونيات المتبقية لكل منطقة)
  const villageDebtData = useMemo(() => {
    const debtsMap: Record<string, { remainingDebt: number; totalPaid: number; bakeriesCount: number }> = {};
    bakeries.forEach((b) => {
      const v = (b.village || 'غير مصنف').trim();
      if (!debtsMap[v]) {
        debtsMap[v] = { remainingDebt: 0, totalPaid: 0, bakeriesCount: 0 };
      }
      debtsMap[v].bakeriesCount += 1;
      const rem = bakeryRemainingDebtsMap[b.id] || 0;
      debtsMap[v].remainingDebt += rem;
    });

    return Object.entries(debtsMap).map(([village, stats], idx) => ({
      village,
      remainingDebt: stats.remainingDebt,
      bakeriesCount: stats.bakeriesCount,
      color: PREMIUM_COLORS[(idx + 2) % PREMIUM_COLORS.length],
    })).sort((a, b) => b.remainingDebt - a.remainingDebt);
  }, [bakeries, bakeryRemainingDebtsMap]);

  // 3. Bread Production Comparison (مقارنة إنتاج الأرغفة لكل قرية)
  const loavesComparisonData = useMemo(() => {
    return villageDistributionData.map((item, idx) => ({
      village: item.village,
      loavesCount: item.loavesCount,
      actualQuota: item.actualQuota,
      color: PREMIUM_COLORS[(idx + 4) % PREMIUM_COLORS.length],
    })).sort((a, b) => b.loavesCount - a.loavesCount);
  }, [villageDistributionData]);

  return (
    <div className="bg-white border border-[#D4AF37]/30 rounded-2xl p-5 shadow-sm space-y-5" dir="rtl">
      {/* Header & View Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-[#0A1628] to-[#0D9488] text-white rounded-xl shadow-sm">
            <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#0A1628]">
              التحليل المرئي الفوري لبيانات المخابز والمديونيات (Recharts)
            </h3>
            <p className="text-xs font-bold text-slate-500 mt-0.5">
              {administrationTitle} • تحليل تفاعلي لتوزيع القرى والمديونيات وإنتاج الأرغفة
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 bg-[#F1F5F9] p-1.5 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('villages')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'villages'
                ? 'bg-[#0A1628] text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>توزيع المخابز حسب القرية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('debts')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'debts'
                ? 'bg-[#0A1628] text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-[#F43F5E]" />
            <span>المديونيات المتبقية حسب المنطقة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('loaves')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'loaves'
                ? 'bg-[#0A1628] text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Wheat className="w-3.5 h-3.5 text-[#10B981]" />
            <span>مقارنة إنتاج الأرغفة</span>
          </button>
        </div>
      </div>

      {/* Chart Content Container */}
      <div className="pt-2">
        {activeTab === 'villages' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-black text-slate-700 px-2">
              <span>توزيع أعداد المخابز على قرى المركز</span>
              <span className="text-[#0D9488]">إجمالي المخابز: {bakeries.length} مخبز</span>
            </div>
            <div className="h-[360px] w-full bg-slate-50/50 border border-slate-200 rounded-xl p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={villageDistributionData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="village"
                    tick={{ fill: '#0A1628', fontSize: 11, fontWeight: 800 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A1628',
                      borderColor: '#D4AF37',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      direction: 'rtl',
                    }}
                    formatter={(value: any) => [`${value} مخبز`, 'عدد المخابز']}
                  />
                  <Bar
                    dataKey="bakeriesCount"
                    name="عدد المخابز"
                    fill="#0D9488"
                    radius={[8, 8, 0, 0]}
                    onClick={(data: any) => {
                      const v = data?.village || data?.payload?.village;
                      if (onNavigateToBakeries && v) {
                        onNavigateToBakeries({ village: v });
                      }
                    }}
                    cursor="pointer"
                  >
                    {villageDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'debts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-black text-slate-700 px-2">
              <span>إجمالي المديونيات المتبقية (جنيه مصري) موزعة على قرى المركز</span>
              <span className="text-rose-600">
                الإجمالي: {Object.values(bakeryRemainingDebtsMap).reduce((a, b) => a + b, 0).toLocaleString()} ج.م
              </span>
            </div>
            <div className="h-[360px] w-full bg-slate-50/50 border border-slate-200 rounded-xl p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={villageDebtData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="village"
                    tick={{ fill: '#0A1628', fontSize: 11, fontWeight: 800 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A1628',
                      borderColor: '#F43F5E',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      direction: 'rtl',
                    }}
                    formatter={(value: any) => [`${Number(value).toLocaleString()} ج.م`, 'المديونية المتبقية']}
                  />
                  <Bar dataKey="remainingDebt" name="المديونية المتبقية (ج.م)" fill="#F43F5E" radius={[8, 8, 0, 0]}>
                    {villageDebtData.map((entry, index) => (
                      <Cell key={`cell-debt-${index}`} fill={index === 0 ? '#F43F5E' : '#0A1628'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'loaves' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-black text-slate-700 px-2">
              <span>مقارنة إنتاج الأرغفة اليومية والحصص الفعلية لكل قرية</span>
              <span className="text-emerald-700">رغيف بلدي مدعم</span>
            </div>
            <div className="h-[360px] w-full bg-slate-50/50 border border-slate-200 rounded-xl p-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={loavesComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="village"
                    tick={{ fill: '#0A1628', fontSize: 11, fontWeight: 800 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A1628',
                      borderColor: '#10B981',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      direction: 'rtl',
                    }}
                    formatter={(value: any, name: any) => [
                      `${Number(value).toLocaleString()} ${name === 'loavesCount' ? 'رغيف' : 'شيكارة'}`,
                      name === 'loavesCount' ? 'إنتاج الأرغفة' : 'الحصة الفعلية',
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                  <Area
                    type="monotone"
                    dataKey="loavesCount"
                    name="إنتاج الأرغفة"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.3}
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="actualQuota"
                    name="الحصة الفعلية (شيكارة)"
                    stroke="#0D9488"
                    fill="#0D9488"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
