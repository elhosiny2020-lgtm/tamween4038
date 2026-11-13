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
  ReferenceLine,
} from 'recharts';
import {
  Scale,
  Store,
  Wheat,
  Bell,
  Filter,
  RotateCcw,
  ArrowUpLeft,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { Bakery, DebtRecord, VillageHierarchy } from '../types';
import { matchesVillageOrUnitFilter } from '../utils/auditHelper';

export interface InteractiveDashboardPageProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  debtAlertThreshold: number;
  unreadAlertsCount: number;
  administrationTitle?: string;
  onNavigateToBakeries: (opts?: { village?: string; activityStatus?: string }) => void;
  onNavigateToDebts: (bakeryId?: string) => void;
  onOpenAlertsDrawer: () => void;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  شغال: '#16A34A',
  يعمل: '#16A34A',
  'متوقف جزئي': '#D97706',
  'متوقف كلي': '#DC2626',
  متوقف: '#DC2626',
  'مغلق بقرار': '#991B1B',
  ملغى: '#64748B',
};

const FALLBACK_PIE_COLORS = ['#1E40AF', '#16A34A', '#D97706', '#DC2626', '#0284C7', '#64748B'];

function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} م`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)} ألف`;
  }
  return value.toLocaleString('en-US');
}

export const InteractiveDashboardPage: React.FC<InteractiveDashboardPageProps> = ({
  bakeries,
  debts,
  villages,
  debtAlertThreshold,
  unreadAlertsCount,
  administrationTitle,
  onNavigateToBakeries,
  onNavigateToDebts,
  onOpenAlertsDrawer,
}) => {
  const [selectedVillage, setSelectedVillage] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [debtViewMode, setDebtViewMode] = useState<'villages' | 'topBakeries'>('villages');
  const [quotaChartStyle, setQuotaChartStyle] = useState<'bar' | 'area'>('bar');

  const uniqueVillages = useMemo(() => {
    const names = new Set<string>();
    villages.forEach((v) => {
      if (v.village) names.add(v.village);
    });
    bakeries.forEach((b) => {
      if (b.village) names.add(b.village);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [villages, bakeries]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    bakeries.forEach((b) => {
      if (b.activityStatus) set.add(b.activityStatus);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [bakeries]);

  const filteredBakeries = useMemo(() => {
    return bakeries.filter((b) => {
      if (!matchesVillageOrUnitFilter(b, selectedVillage, 'ALL', villages)) {
        return false;
      }
      if (selectedStatus !== 'ALL' && b.activityStatus !== selectedStatus) {
        return false;
      }
      return true;
    });
  }, [bakeries, selectedVillage, selectedStatus, villages]);

  const filteredBakeryIds = useMemo(() => {
    return new Set(filteredBakeries.map((b) => String(b.id)));
  }, [filteredBakeries]);

  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (selectedVillage === 'ALL' && selectedStatus === 'ALL') return true;
      return filteredBakeryIds.has(String(d.bakeryId));
    });
  }, [debts, filteredBakeryIds, selectedVillage, selectedStatus]);

  // 1. KPIs Summary
  const kpis = useMemo(() => {
    let totalRemainingDebt = 0;
    let totalPaidDebt = 0;
    const debtByBakery = new Map<string, number>();

    filteredDebts.forEach((d) => {
      const remaining = Number(d.netRemainingDebt) || 0;
      const paid =
        (Number(d.paidViolationAmount) || 0) +
        (Number(d.paidAddedAmount) || 0) +
        (Number(d.paidDisposalAmount) || 0);
      totalRemainingDebt += remaining;
      totalPaidDebt += paid;
      debtByBakery.set(String(d.bakeryId), (debtByBakery.get(String(d.bakeryId)) || 0) + remaining);
    });

    let activeCount = 0;
    let stoppedCount = 0;
    let totalActualQuota = 0;
    let totalInsuranceQuota = 0;
    let totalLoaves = 0;

    filteredBakeries.forEach((b) => {
      const status = (b.activityStatus || '').trim();
      if (status === 'شغال' || status === 'يعمل') {
        activeCount++;
      } else {
        stoppedCount++;
      }
      totalActualQuota += Number(b.actualQuota) || 0;
      totalInsuranceQuota += Number(b.insuranceQuota) || 0;
      totalLoaves += Number(b.loavesCount) || 0;
    });

    let thresholdExceededCount = 0;
    debtByBakery.forEach((amount) => {
      if (amount >= debtAlertThreshold) thresholdExceededCount++;
    });

    return {
      totalRemainingDebt,
      totalPaidDebt,
      totalDebtsCount: filteredDebts.length,
      bakeriesCount: filteredBakeries.length,
      activeCount,
      stoppedCount,
      totalActualQuota,
      totalInsuranceQuota,
      totalLoaves,
      thresholdExceededCount,
      debtByBakery,
    };
  }, [filteredBakeries, filteredDebts, debtAlertThreshold]);

  // 2. Recharts Data — Total Debts Breakdown (by Village or Top Bakeries)
  const debtsByVillageData = useMemo(() => {
    const map = new Map<
      string,
      { name: string; remainingDebt: number; paidAmount: number; recordsCount: number }
    >();

    filteredDebts.forEach((d) => {
      const key =
        (selectedVillage === 'ALL' ? d.village : d.localUnit || d.bakeryOwnerName) || 'غير محدد';
      const entry = map.get(key) || {
        name: key,
        remainingDebt: 0,
        paidAmount: 0,
        recordsCount: 0,
      };
      entry.remainingDebt += Number(d.netRemainingDebt) || 0;
      entry.paidAmount +=
        (Number(d.paidViolationAmount) || 0) +
        (Number(d.paidAddedAmount) || 0) +
        (Number(d.paidDisposalAmount) || 0);
      entry.recordsCount += 1;
      map.set(key, entry);
    });

    return Array.from(map.values())
      .sort((a, b) => b.remainingDebt - a.remainingDebt)
      .slice(0, 12);
  }, [filteredDebts, selectedVillage]);

  const topIndebtedBakeriesData = useMemo(() => {
    const byBakery = new Map<
      string,
      {
        bakeryId: string;
        name: string;
        village: string;
        remainingDebt: number;
        paidAmount: number;
      }
    >();

    filteredDebts.forEach((d) => {
      const id = String(d.bakeryId || d.id);
      const entry = byBakery.get(id) || {
        bakeryId: id,
        name: d.bakeryOwnerName || 'مخبز غير مسمى',
        village: d.village || '',
        remainingDebt: 0,
        paidAmount: 0,
      };
      entry.remainingDebt += Number(d.netRemainingDebt) || 0;
      entry.paidAmount +=
        (Number(d.paidViolationAmount) || 0) +
        (Number(d.paidAddedAmount) || 0) +
        (Number(d.paidDisposalAmount) || 0);
      byBakery.set(id, entry);
    });

    return Array.from(byBakery.values())
      .filter((x) => x.remainingDebt > 0 || x.paidAmount > 0)
      .sort((a, b) => b.remainingDebt - a.remainingDebt)
      .slice(0, 10);
  }, [filteredDebts]);

  // 3. Recharts Data — Bakeries Distribution by Status
  const statusDistributionData = useMemo(() => {
    const map = new Map<string, number>();
    filteredBakeries.forEach((b) => {
      const status = (b.activityStatus || 'غير محدد').trim();
      map.set(status, (map.get(status) || 0) + 1);
    });
    const total = filteredBakeries.length || 1;
    return Array.from(map.entries())
      .map(([name, value], idx) => ({
        name,
        value,
        percent: Math.round((value / total) * 100),
        color: STATUS_COLOR_MAP[name] || FALLBACK_PIE_COLORS[idx % FALLBACK_PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredBakeries]);

  // 4. Recharts Data — Distributed Flour Quotas by Village / Local Unit
  const flourQuotasData = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        actualQuota: number;
        insuranceQuota: number;
        loavesCount: number;
        bakeriesCount: number;
      }
    >();

    filteredBakeries.forEach((b) => {
      const key =
        (selectedVillage === 'ALL' ? b.village : b.localUnit || b.bakeryOwnerName) || 'غير محدد';
      const entry = map.get(key) || {
        name: key,
        actualQuota: 0,
        insuranceQuota: 0,
        loavesCount: 0,
        bakeriesCount: 0,
      };
      entry.actualQuota += Number(b.actualQuota) || 0;
      entry.insuranceQuota += Number(b.insuranceQuota) || 0;
      entry.loavesCount += Number(b.loavesCount) || 0;
      entry.bakeriesCount += 1;
      map.set(key, entry);
    });

    return Array.from(map.values())
      .sort((a, b) => b.actualQuota - a.actualQuota)
      .slice(0, 14);
  }, [filteredBakeries, selectedVillage]);

  const activeDebtsChartData: Array<{
    name: string;
    remainingDebt: number;
    paidAmount: number;
  }> = debtViewMode === 'villages' ? debtsByVillageData : topIndebtedBakeriesData;

  const hasActiveFilters = selectedVillage !== 'ALL' || selectedStatus !== 'ALL';

  return (
    <section
      dir="rtl"
      data-testid="interactive-dashboard-page"
      className="space-y-4 pb-8"
    >
      {/* Top Executive Banner & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0F2342] text-amber-300 flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#0F2342] tracking-tight">
              لوحة التحكم والرسوم البيانية التفاعلية
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              تحليل لحظي لإجمالي المديونيات، وتوزيع المخابز حسب الحالة، وحصص الدقيق الموزعة —{' '}
              <span className="font-bold text-[#1E3A8A]">
                {administrationTitle || 'إدارة تموين مركز المحلة الكبرى'}
              </span>
            </p>
          </div>
        </div>

        {/* Filter & Drawer Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-[#1E3A8A]" />
            <label htmlFor="dash-village-filter" className="font-bold text-slate-700">
              القرية:
            </label>
            <select
              id="dash-village-filter"
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
              className="bg-transparent font-bold text-[#0F2342] focus:outline-none cursor-pointer"
            >
              <option value="ALL">جميع القرى ({uniqueVillages.length})</option>
              {uniqueVillages.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <label htmlFor="dash-status-filter" className="font-bold text-slate-700">
              الحالة:
            </label>
            <select
              id="dash-status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-bold text-[#0F2342] focus:outline-none cursor-pointer"
            >
              <option value="ALL">جميع الحالات</option>
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedVillage('ALL');
                setSelectedStatus('ALL');
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة تعيين</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAlertsDrawer}
            data-testid="dashboard-open-alerts-drawer-btn"
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>سجل تنبيهات المديونية</span>
            {unreadAlertsCount > 0 && (
              <span className="bg-white text-red-700 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black tabular-nums">
                {unreadAlertsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Total Remaining Debts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">إجمالي المديونيات المتبقية</span>
            <span className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span
              data-testid="kpi-total-debts"
              className="text-2xl font-black text-red-700 font-mono tabular-nums"
            >
              {kpis.totalRemainingDebt.toLocaleString('en-US')}
              <span className="text-xs font-bold text-slate-500 mr-1">ج.م</span>
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>
              المسدد: <strong className="text-emerald-700 font-mono tabular-nums">{kpis.totalPaidDebt.toLocaleString('en-US')} ج.م</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateToDebts()}
              className="text-[#1E40AF] font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>السجل ({kpis.totalDebtsCount})</span>
              <ArrowUpLeft className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* KPI 2: Bakeries Count & Activity */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">توزيع المخابز وحالة التشغيل</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              data-testid="kpi-total-bakeries"
              className="text-2xl font-black text-[#0F2342] font-mono tabular-nums"
            >
              {kpis.bakeriesCount.toLocaleString('en-US')}
              <span className="text-xs font-bold text-slate-500 mr-1">مخبز</span>
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              شغال: {kpis.activeCount}
            </span>
            <span className="text-amber-700 font-bold">
              غير عامل/موقوف: {kpis.stoppedCount}
            </span>
          </div>
        </div>

        {/* KPI 3: Distributed Flour Quotas */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">حصص الدقيق الموزعة يومياً</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E40AF] border border-blue-200 flex items-center justify-center">
              <Wheat className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              data-testid="kpi-total-quotas"
              className="text-2xl font-black text-[#1E40AF] font-mono tabular-nums"
            >
              {kpis.totalActualQuota.toLocaleString('en-US')}
              <span className="text-xs font-bold text-slate-500 mr-1">شكارة فعلية</span>
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>
              التأمينية: <strong className="text-[#0F2342] font-mono tabular-nums">{kpis.totalInsuranceQuota.toLocaleString('en-US')}</strong>
            </span>
            <span>
              الأرغفة: <strong className="text-slate-800 font-mono tabular-nums">{kpis.totalLoaves.toLocaleString('en-US')}</strong>
            </span>
          </div>
        </div>

        {/* KPI 4: High-Debt Threshold Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">
              مخابز تتجاوز حد التنبيه ({debtAlertThreshold.toLocaleString('en-US')} ج.م)
            </span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-700 font-mono tabular-nums">
              {kpis.thresholdExceededCount}
              <span className="text-xs font-bold text-slate-500 mr-1">مخبز حرج</span>
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-600">
              تنبيهات مسجلة: <strong>{unreadAlertsCount} غير مقروءة</strong>
            </span>
            <button
              type="button"
              onClick={onOpenAlertsDrawer}
              className="text-red-700 font-bold hover:underline cursor-pointer"
            >
              فتح السجل
            </button>
          </div>
        </div>
      </div>

      {/* Main Charts Grid: Row 1 (Debts Chart 8 cols + Status Donut 4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Chart 1: Total Debts Interactive Recharts BarChart */}
        <div
          data-testid="chart-total-debts"
          className="xl:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#0F2342]">
                تحليل إجمالي المديونيات والمسدد (ج.م)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                مقارنة بين صافي المديونية المتبقية والمبالغ المسددة مع خط حد التنبيه ({debtAlertThreshold.toLocaleString('en-US')} ج.م)
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setDebtViewMode('villages')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                  debtViewMode === 'villages'
                    ? 'bg-[#0F2342] text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                حسب القرية
              </button>
              <button
                type="button"
                onClick={() => setDebtViewMode('topBakeries')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                  debtViewMode === 'topBakeries'
                    ? 'bg-[#0F2342] text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                أعلى 10 مخابز
              </button>
            </div>
          </div>

          <div className="h-[320px] min-h-[320px] w-full" dir="ltr">
            {activeDebtsChartData.length === 0 ? (
              <div
                dir="rtl"
                className="h-full flex flex-col items-center justify-center text-slate-400 text-xs font-bold bg-slate-50 rounded-lg border border-dashed border-slate-200"
              >
                لا توجد قيود مديونيات مطابقة للتصفية الحالية
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <BarChart
                  data={activeDebtsChartData}
                  margin={{ top: 12, right: 20, left: 10, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis
                    width={78}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    formatter={(value: any, name: any) => [
                      `${Number(value || 0).toLocaleString('en-US')} ج.م`,
                      name === 'remainingDebt' ? 'صافي المتبقي' : 'إجمالي المسدد',
                    ]}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '10px',
                      direction: 'rtl',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                  <Legend
                    formatter={(val) =>
                      val === 'remainingDebt' ? 'صافي المديونية المتبقية' : 'إجمالي المسدد'
                    }
                  />
                  <ReferenceLine
                    y={debtAlertThreshold}
                    stroke="#DC2626"
                    strokeDasharray="4 4"
                    label={{
                      value: `حد التنبيه (${formatCurrencyCompact(debtAlertThreshold)})`,
                      fill: '#DC2626',
                      fontSize: 10,
                      fontWeight: 800,
                      position: 'insideTopRight',
                    }}
                  />
                  <Bar
                    dataKey="remainingDebt"
                    name="remainingDebt"
                    fill="#DC2626"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                  <Bar
                    dataKey="paidAmount"
                    name="paidAmount"
                    fill="#16A34A"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Bakeries Distribution by Status (Donut PieChart) */}
        <div
          data-testid="chart-bakery-status"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#0F2342] flex items-center gap-1.5">
                <PieChartIcon className="w-4 h-4 text-[#1E40AF]" />
                <span>توزيع المخابز حسب الحالة</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                انقر على أي حالة لعرض مخابزها في الجدول
              </p>
            </div>
          </div>

          <div className="h-[220px] min-h-[220px] w-full" dir="ltr">
            {statusDistributionData.length === 0 ? (
              <div
                dir="rtl"
                className="h-full flex items-center justify-center text-slate-400 text-xs font-bold"
              >
                لا توجد مخابز مطابقة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220} minWidth={0}>
                <PieChart>
                  <Pie
                    data={statusDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={84}
                    paddingAngle={2}
                    onClick={(entry: any) => {
                      if (entry?.name) {
                        onNavigateToBakeries({ activityStatus: entry.name });
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {statusDistributionData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any) => [`${val} مخبز`, String(name)]}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '10px',
                      direction: 'rtl',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Crisp Tabular Legend */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            {statusDistributionData.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => onNavigateToBakeries({ activityStatus: item.name })}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-xs transition cursor-pointer"
              >
                <span className="flex items-center gap-2 font-bold text-slate-700">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}</span>
                </span>
                <span className="font-mono tabular-nums font-bold text-[#0F2342]">
                  {item.value} <span className="text-slate-500 text-[11px]">({item.percent}%)</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Distributed Flour Quotas Interactive Chart (Full Width) */}
      <div
        data-testid="chart-flour-quotas"
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-[#0F2342]">
              حصص الدقيق الموزعة (الحصة الفعلية مقابل الحصة التأمينية بالشكارة)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              توزيع حصص الدقيق اليومية على القرى والوحدات المحلية ({filteredBakeries.length} مخبز)
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setQuotaChartStyle('bar')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                quotaChartStyle === 'bar'
                  ? 'bg-[#0F2342] text-white'
                  : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              أعمدة مقارنة
            </button>
            <button
              type="button"
              onClick={() => setQuotaChartStyle('area')}
              className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                quotaChartStyle === 'area'
                  ? 'bg-[#0F2342] text-white'
                  : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              منحنى مساحي
            </button>
          </div>
        </div>

        <div className="h-[320px] min-h-[320px] w-full" dir="ltr">
          {flourQuotasData.length === 0 ? (
            <div
              dir="rtl"
              className="h-full flex items-center justify-center text-slate-400 text-xs font-bold bg-slate-50 rounded-lg border border-dashed border-slate-200"
            >
              لا توجد بيانات حصص دقيق للعرض
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              {quotaChartStyle === 'bar' ? (
                <BarChart
                  data={flourQuotasData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    formatter={(val: any, name: any) => [
                      `${Number(val || 0).toLocaleString('en-US')} شكارة`,
                      name === 'actualQuota' ? 'الحصة الفعلية' : 'الحصة التأمينية',
                    ]}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '10px',
                      direction: 'rtl',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                  <Legend
                    formatter={(val) =>
                      val === 'actualQuota'
                        ? 'الحصة الفعلية الموزعة (شكارة)'
                        : 'الحصة التأمينية المقررة (شكارة)'
                    }
                  />
                  <Bar
                    dataKey="actualQuota"
                    name="actualQuota"
                    fill="#1E40AF"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                  <Bar
                    dataKey="insuranceQuota"
                    name="insuranceQuota"
                    fill="#D97706"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                </BarChart>
              ) : (
                <AreaChart
                  data={flourQuotasData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      `${Number(val || 0).toLocaleString('en-US')} شكارة`,
                      name === 'actualQuota' ? 'الحصة الفعلية' : 'الحصة التأمينية',
                    ]}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#CBD5E1',
                      borderRadius: '10px',
                      direction: 'rtl',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  />
                  <Legend
                    formatter={(val) =>
                      val === 'actualQuota'
                        ? 'الحصة الفعلية الموزعة (شكارة)'
                        : 'الحصة التأمينية المقررة (شكارة)'
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="actualQuota"
                    name="actualQuota"
                    stroke="#1E40AF"
                    fill="#93C5FD"
                    fillOpacity={0.45}
                    strokeWidth={2.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="insuranceQuota"
                    name="insuranceQuota"
                    stroke="#D97706"
                    fill="#FCD34D"
                    fillOpacity={0.35}
                    strokeWidth={2}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 3: Top Critical Debts Quick Drill-Down Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#0F2342]">
              أعلى المخابز مديونية ومقارنتها بحد التنبيه ({debtAlertThreshold.toLocaleString('en-US')} ج.م)
            </h3>
            <p className="text-[11px] text-slate-500">
              انقر على أي صف للانتقال مباشرة إلى سجل مديونيات المخبز
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToDebts()}
            className="text-xs font-bold text-[#1E40AF] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>فتح سجل المديونيات الكامل</span>
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {topIndebtedBakeriesData.length === 0 ? (
          <div className="text-center py-6 text-xs font-bold text-slate-400">
            لا توجد مخابز عليها مديونيات متبقية ضمن التصفية الحالية
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">اسم صاحب المخبز</th>
                  <th className="py-2.5 px-3">القرية</th>
                  <th className="py-2.5 px-3">صافي المديونية المتبقية</th>
                  <th className="py-2.5 px-3">إجمالي المسدد</th>
                  <th className="py-2.5 px-3">حالة التنبيه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topIndebtedBakeriesData.slice(0, 6).map((row) => {
                  const exceedsThreshold = row.remainingDebt >= debtAlertThreshold;
                  return (
                    <tr
                      key={row.bakeryId}
                      onClick={() => onNavigateToDebts(row.bakeryId)}
                      className="hover:bg-slate-50 transition cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-bold text-[#0F2342]">{row.name}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.village}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-black text-red-700">
                        {row.remainingDebt.toLocaleString('en-US')} ج.م
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-emerald-700">
                        {row.paidAmount.toLocaleString('en-US')} ج.م
                      </td>
                      <td className="py-2.5 px-3">
                        {exceedsThreshold ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-bold text-[11px]">
                            <AlertTriangle className="w-3 h-3" />
                            تجاوز حد التنبيه
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            ضمن الحد
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
