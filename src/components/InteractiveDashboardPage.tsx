import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  Line,
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
  ShieldAlert,
  TrendingUp,
  Fuel,
  FileWarning,
  Building2,
} from 'lucide-react';
import { Bakery, DebtRecord, VillageHierarchy } from '../types';
import {
  calculateAnnualWeightedAveragesReport,
  matchesVillageOrUnitFilter,
} from '../utils/auditHelper';
import {
  analyzeOperationalAndLicenseAlerts,
  buildDebtRiskTierBuckets,
  computeExecutiveSummary,
  formatCurrencyCompact,
  formatLoavesCompact,
} from '../utils/dashboardAnalytics';

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
  شغال: '#10B981',
  يعمل: '#10B981',
  'متوقف جزئي': '#D4AF37',
  'متوقف كلي': '#F43F5E',
  متوقف: '#F43F5E',
  'مغلق بقرار': '#BE123C',
  ملغى: '#64748B',
};

const FALLBACK_PIE_COLORS = ['#0D9488', '#D4AF37', '#10B981', '#F43F5E', '#0A1628', '#64748B'];

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
  const [selectedFuel, setSelectedFuel] = useState<string>('ALL');
  const [debtViewMode, setDebtViewMode] = useState<'villages' | 'topBakeries' | 'riskTiers'>('villages');
  const [quotaViewMode, setQuotaViewMode] = useState<'bar' | 'area' | 'loaves'>('bar');
  const [insightTab, setInsightTab] = useState<'demographics' | 'specs' | 'licenses'>('demographics');
  const [watchlistTierFilter, setWatchlistTierFilter] = useState<'all' | 'critical' | 'normal'>('all');

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

  const uniqueFuels = useMemo(() => {
    const set = new Set<string>();
    bakeries.forEach((b) => {
      if (b.fuelType) set.add(b.fuelType);
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
      if (selectedFuel !== 'ALL' && b.fuelType !== selectedFuel) {
        return false;
      }
      return true;
    });
  }, [bakeries, selectedVillage, selectedStatus, selectedFuel, villages]);

  const filteredBakeryIds = useMemo(() => {
    return new Set(filteredBakeries.map((b) => String(b.id)));
  }, [filteredBakeries]);

  const hasFilters =
    selectedVillage !== 'ALL' || selectedStatus !== 'ALL' || selectedFuel !== 'ALL';

  const filteredDebts = useMemo(() => {
    if (!hasFilters) return debts;
    return debts.filter((d) => filteredBakeryIds.has(String(d.bakeryId)));
  }, [debts, filteredBakeryIds, hasFilters]);

  // 1. Core KPIs & Ratios (pure helpers, zero modification to system formulas)
  const kpis = useMemo(
    () => computeExecutiveSummary(filteredBakeries, filteredDebts, debtAlertThreshold),
    [filteredBakeries, filteredDebts, debtAlertThreshold]
  );

  // Exact official weighted averages report (unchanged auditHelper equation)
  const annualReport = useMemo(
    () => calculateAnnualWeightedAveragesReport(filteredBakeries),
    [filteredBakeries]
  );

  // Operational & License Expiration Inspection
  const licenseSummary = useMemo(
    () => analyzeOperationalAndLicenseAlerts(filteredBakeries),
    [filteredBakeries]
  );

  // 2. Debts Chart Datasets
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
        collectionPercent: number;
      }
    >();

    filteredDebts.forEach((d) => {
      const id = String(d.bakeryId || d.id);
      const entry = byBakery.get(id) || {
        bakeryId: id,
        name: d.bakeryOwnerName || 'مخبز غير مسمى',
        village: d.village || 'غير محدد',
        remainingDebt: 0,
        paidAmount: 0,
        collectionPercent: 0,
      };
      entry.remainingDebt += Number(d.netRemainingDebt) || 0;
      entry.paidAmount +=
        (Number(d.paidViolationAmount) || 0) +
        (Number(d.paidAddedAmount) || 0) +
        (Number(d.paidDisposalAmount) || 0);
      const total = entry.remainingDebt + entry.paidAmount;
      entry.collectionPercent = total > 0 ? Math.round((entry.paidAmount / total) * 100) : 0;
      byBakery.set(id, entry);
    });

    return Array.from(byBakery.values())
      .filter((x) => x.remainingDebt > 0 || x.paidAmount > 0)
      .sort((a, b) => b.remainingDebt - a.remainingDebt);
  }, [filteredDebts]);

  const riskTierBuckets = useMemo(
    () => buildDebtRiskTierBuckets(kpis.debtByBakery, debtAlertThreshold),
    [kpis.debtByBakery, debtAlertThreshold]
  );

  // 3. Bakeries Distribution by Status (Donut)
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

  // 4. Flour Quotas & Loaves Distribution
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
      .map((item) => ({
        ...item,
        actualQuota: Number(item.actualQuota.toFixed(2)),
        insuranceQuota: Number(item.insuranceQuota.toFixed(2)),
      }))
      .sort((a, b) => b.actualQuota - a.actualQuota)
      .slice(0, 12);
  }, [filteredBakeries, selectedVillage]);

  // 5. Three-Year Demographics & Weighted Averages
  const demographicsChartData = useMemo(
    () => [
      {
        year: '2023',
        beneficiaries: annualReport.totalBeneficiaries2023,
        weightedAvg: Number(annualReport.weightedGeneralAvg2023) || 0,
      },
      {
        year: '2024',
        beneficiaries: annualReport.totalBeneficiaries2024,
        weightedAvg: Number(annualReport.weightedGeneralAvg2024) || 0,
      },
      {
        year: '2025',
        beneficiaries: annualReport.totalBeneficiaries2025,
        weightedAvg: Number(annualReport.weightedGeneralAvg2025) || 0,
      },
    ],
    [annualReport]
  );

  // 6. Fuel & Bread Specs Breakdown
  const specsBreakdown = useMemo(() => {
    const fuelMap = new Map<string, number>();
    const breadMap = new Map<string, number>();
    filteredBakeries.forEach((b) => {
      const f = (b.fuelType || 'غير محدد').trim();
      const br = (b.breadType || 'غير محدد').trim();
      fuelMap.set(f, (fuelMap.get(f) || 0) + 1);
      breadMap.set(br, (breadMap.get(br) || 0) + 1);
    });
    const total = filteredBakeries.length || 1;
    return {
      fuels: Array.from(fuelMap.entries())
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count),
      breads: Array.from(breadMap.entries())
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [filteredBakeries]);

  const filteredWatchlistRows = useMemo(() => {
    const rows = topIndebtedBakeriesData;
    if (watchlistTierFilter === 'critical') {
      return rows.filter((r) => r.remainingDebt >= debtAlertThreshold);
    }
    if (watchlistTierFilter === 'normal') {
      return rows.filter((r) => r.remainingDebt < debtAlertThreshold);
    }
    return rows;
  }, [topIndebtedBakeriesData, watchlistTierFilter, debtAlertThreshold]);

  const activeDebtsChartData: Array<{
    name: string;
    remainingDebt: number;
    paidAmount: number;
  }> =
    debtViewMode === 'villages'
      ? debtsByVillageData
      : topIndebtedBakeriesData.slice(0, 10);

  return (
    <section
      dir="rtl"
      data-testid="interactive-dashboard-page"
      className="space-y-4 pb-8 text-slate-900 tab-content-enter"
    >
      {/* 1. Executive Masthead & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="relative bg-[#0B1B36] text-white px-5 py-4 sm:px-6">
          {/* Subtle Architectural Grid Accent */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
          >
            <defs>
              <pattern id="dash-exec-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dash-exec-grid)" />
          </svg>

          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-lg bg-[#162C52] border border-slate-600/50 text-amber-300 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-300">
                  <span>{administrationTitle || 'إدارة تموين مركز المحلة الكبرى'}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-amber-300">مركز المؤشرات التنفيذي</span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                  لوحة القيادة والتحليلات التفاعلية للمخابز والمديونيات
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  متابعة حية لصافي المديونيات والتحصيل · الكفاءة التشغيلية · حصص الدقيق وإنتاج الأرغفة
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToBakeries({})}
                className="px-3 py-2 bg-[#162C52] hover:bg-[#1E3A8A] text-slate-100 border border-slate-600/60 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-sky-300" />
                <span>جدول المخابز</span>
                <span className="font-mono tabular-nums text-amber-300">({bakeries.length})</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateToDebts()}
                className="px-3 py-2 bg-[#162C52] hover:bg-[#1E3A8A] text-slate-100 border border-slate-600/60 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5 text-emerald-300" />
                <span>سجل المديونيات</span>
                <span className="font-mono tabular-nums text-amber-300">({debts.length})</span>
              </button>

              <button
                type="button"
                onClick={onOpenAlertsDrawer}
                data-testid="dashboard-open-alerts-drawer-btn"
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>سجل التنبيهات</span>
                {unreadAlertsCount > 0 && (
                  <span className="bg-white text-red-700 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-black tabular-nums leading-none badge-animated-coral animate-pulse">
                    {unreadAlertsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Filter Strip + Executive Ratios Bar */}
        <div className="px-4 py-2.5 sm:px-6 bg-slate-50/70 border-b border-slate-200 flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#1D4ED8]" />
              <label htmlFor="dash-village-filter" className="font-bold text-slate-600 whitespace-nowrap">
                القرية:
              </label>
              <select
                id="dash-village-filter"
                value={selectedVillage}
                onChange={(e) => setSelectedVillage(e.target.value)}
                className="bg-transparent font-extrabold text-[#0F2342] focus:outline-none cursor-pointer"
              >
                <option value="ALL">جميع القرى ({uniqueVillages.length})</option>
                {uniqueVillages.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
              <label htmlFor="dash-status-filter" className="font-bold text-slate-600 whitespace-nowrap">
                الحالة:
              </label>
              <select
                id="dash-status-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent font-extrabold text-[#0F2342] focus:outline-none cursor-pointer"
              >
                <option value="ALL">جميع الحالات</option>
                {uniqueStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {uniqueFuels.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
                <Fuel className="w-3.5 h-3.5 text-amber-600" />
                <label htmlFor="dash-fuel-filter" className="font-bold text-slate-600 whitespace-nowrap">
                  الوقود:
                </label>
                <select
                  id="dash-fuel-filter"
                  value={selectedFuel}
                  onChange={(e) => setSelectedFuel(e.target.value)}
                  className="bg-transparent font-extrabold text-[#0F2342] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">الكل</option>
                  {uniqueFuels.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedVillage('ALL');
                  setSelectedStatus('ALL');
                  setSelectedFuel('ALL');
                }}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط</span>
              </button>
            )}
          </div>

          {/* Inline Executive Ratios Strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-slate-500 font-semibold">نسبة التحصيل:</span>
              <span className="font-mono tabular-nums font-black text-emerald-700">
                {kpis.collectionRatePercent}%
              </span>
            </div>
            <span className="hidden sm:inline text-slate-300">|</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-slate-500 font-semibold">التشغيل الفعلي:</span>
              <span className="font-mono tabular-nums font-black text-[#0F2342]">
                {kpis.operationalRatePercent}%
              </span>
            </div>
            <span className="hidden sm:inline text-slate-300">|</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-slate-500 font-semibold">نسبة الحصص:</span>
              <span className="font-mono tabular-nums font-black text-[#1D4ED8]">
                {kpis.quotaUtilizationPercent}%
              </span>
            </div>
            <span className="hidden sm:inline text-slate-300">|</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-slate-500 font-semibold">متوسط الفرد المرجح 2025:</span>
              <span className="font-mono tabular-nums font-black text-amber-700">
                {annualReport.weightedGeneralAvg2025}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Four Primary KPI Cards (Animated High-Contrast Royal Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Net Remaining Debts & Collection Progress */}
        <div className="bg-gradient-to-br from-white via-rose-50/40 to-white border-2 border-rose-200/80 hover:border-rose-400 rounded-2xl p-4 shadow-md card-hover-lift flex flex-col justify-between relative overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 absolute top-0 right-0 left-0" />
          <div className="pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-700">صافي المديونيات المتبقية</span>
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-red-700 text-white shadow-md shadow-rose-900/20 flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4 icon-animated" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span
                data-testid="kpi-total-debts"
                className="text-2xl font-black text-rose-700 font-mono tabular-nums tracking-tight"
              >
                {kpis.totalRemainingDebt.toLocaleString('en-US')}
                <span className="text-xs font-bold text-slate-500 mr-1">ج.م</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                تحصيل {kpis.collectionRatePercent}%
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, kpis.collectionRatePercent))}%` }}
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-rose-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>
              المسدد:{' '}
              <strong className="text-emerald-700 font-mono tabular-nums">
                {kpis.totalPaidDebt.toLocaleString('en-US')} ج.م
              </strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateToDebts()}
              className="text-[#1D4ED8] font-black hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>السجل ({kpis.totalDebtsCount})</span>
              <ArrowUpLeft className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* KPI 2: Bakeries Fleet & Operational Status */}
        <div className="bg-gradient-to-br from-white via-emerald-50/40 to-white border-2 border-emerald-200/80 hover:border-emerald-400 rounded-2xl p-4 shadow-md card-hover-lift flex flex-col justify-between relative overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 absolute top-0 right-0 left-0" />
          <div className="pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-700">إجمالي المخابز والجاهزية</span>
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-900/20 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 icon-animated" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span
                data-testid="kpi-total-bakeries"
                className="text-2xl font-black text-[#0F2342] font-mono tabular-nums tracking-tight"
              >
                {kpis.bakeriesCount.toLocaleString('en-US')}
                <span className="text-xs font-bold text-slate-500 mr-1">مخبز</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums font-black px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                جاهزية {kpis.operationalRatePercent}%
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, kpis.operationalRatePercent))}%` }}
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-emerald-100 flex items-center justify-between text-[11px]">
            <span className="text-emerald-700 font-black inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              شغال: <span className="font-mono tabular-nums">{kpis.activeCount}</span>
            </span>
            <button
              type="button"
              onClick={() => onNavigateToBakeries({})}
              className="text-amber-700 font-black hover:underline cursor-pointer"
            >
              متوقف/موقوف: <span className="font-mono tabular-nums">{kpis.stoppedCount}</span>
            </button>
          </div>
        </div>

        {/* KPI 3: Distributed Flour Quotas & Daily Loaves */}
        <div className="bg-gradient-to-br from-white via-blue-50/40 to-white border-2 border-blue-200/80 hover:border-blue-400 rounded-2xl p-4 shadow-md card-hover-lift flex flex-col justify-between relative overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-cyan-500 absolute top-0 right-0 left-0" />
          <div className="pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-700">حصص الدقيق والإنتاج اليومي</span>
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-900/20 flex items-center justify-center shrink-0">
                <Wheat className="w-4 h-4 icon-animated" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span
                data-testid="kpi-total-quotas"
                className="text-2xl font-black text-[#1D4ED8] font-mono tabular-nums tracking-tight"
              >
                {kpis.totalActualQuota.toLocaleString('en-US')}
                <span className="text-xs font-bold text-slate-500 mr-1">شكارة فعلية</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums font-black px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
                {kpis.quotaUtilizationPercent}% من التأمينية
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, kpis.quotaUtilizationPercent))}%` }}
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-blue-100 flex items-center justify-between text-[11px] text-slate-600">
            <span>
              التأمينية:{' '}
              <strong className="text-[#0F2342] font-mono tabular-nums">
                {kpis.totalInsuranceQuota.toLocaleString('en-US')}
              </strong>
            </span>
            <span>
              الأرغفة:{' '}
              <strong className="text-slate-800 font-mono tabular-nums">
                {kpis.totalLoaves.toLocaleString('en-US')}
              </strong>
            </span>
          </div>
        </div>

        {/* KPI 4: Threshold Alerts & Compliance Risk */}
        <div className="bg-gradient-to-br from-white via-amber-50/40 to-white border-2 border-amber-200/80 hover:border-amber-400 rounded-2xl p-4 shadow-md card-hover-lift flex flex-col justify-between relative overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 absolute top-0 right-0 left-0" />
          <div className="pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-slate-700">
                تجاوز حد المديونية ({formatCurrencyCompact(debtAlertThreshold)} ج.م)
              </span>
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-900/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-4 h-4 icon-animated" />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-black text-amber-700 font-mono tabular-nums tracking-tight">
                {kpis.thresholdExceededCount}
                <span className="text-xs font-bold text-slate-500 mr-1">مخبز حرج</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums font-black text-red-700">
                {licenseSummary.expiredCount + licenseSummary.expiringSoonCount} وثيقة تتطلب تجديد
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-500"
                style={{
                  width: `${
                    kpis.bakeriesCount > 0
                      ? Math.min(100, Math.round((kpis.thresholdExceededCount / kpis.bakeriesCount) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-amber-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-600">
              غير مقروء:{' '}
              <strong className="text-[#0F2342] font-mono tabular-nums">{unreadAlertsCount}</strong>
            </span>
            <button
              type="button"
              onClick={onOpenAlertsDrawer}
              className="text-red-700 font-black hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>سجل التنبيهات</span>
              <ArrowUpLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Analytics Row 1: Debt & Collection Analytics (8 cols) + Operational Status Donut (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Chart 1: Interactive Debt Analytics */}
        <div
          data-testid="chart-total-debts"
          className="xl:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-[#0F2342]">
                تحليل المديونيات والتحصيل المالي (ج.م)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                مقارنة صافي المديونية المتبقية بالمبالغ المسددة مع خط حد التنبيه (
                {debtAlertThreshold.toLocaleString('en-US')} ج.م)
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
              <button
                type="button"
                onClick={() => setDebtViewMode('riskTiers')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                  debtViewMode === 'riskTiers'
                    ? 'bg-[#0F2342] text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                شرائح المخاطر
              </button>
            </div>
          </div>

          <div className="h-[310px] min-h-[310px] w-full" dir="ltr">
            {debtViewMode === 'riskTiers' ? (
              filteredDebts.length === 0 ? (
                <div
                  dir="rtl"
                  className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-50/70 rounded-lg"
                >
                  <Scale className="w-7 h-7 text-slate-300" />
                  <p className="text-xs font-bold">لا توجد قيود مديونيات مسجلة حالياً</p>
                  <button
                    type="button"
                    onClick={() => onNavigateToDebts()}
                    className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer"
                  >
                    الانتقال إلى سجل المديونيات ←
                  </button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={310} minWidth={0}>
                  <BarChart
                    data={riskTierBuckets}
                    margin={{ top: 16, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                      height={42}
                    />
                    <YAxis
                      width={78}
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(15, 35, 66, 0.04)' }}
                      formatter={(val: any, _name: any, item: any) => [
                        `${Number(val || 0).toLocaleString('en-US')} ج.م (${item?.payload?.bakeriesCount || 0} مخبز)`,
                        'إجمالي مديونية الشريحة',
                      ]}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#CBD5E1',
                        borderRadius: '8px',
                        direction: 'rtl',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    />
                    <Bar dataKey="totalDebt" name="إجمالي الشريحة" radius={[5, 5, 0, 0]} maxBarSize={56}>
                      {riskTierBuckets.map((entry) => (
                        <Cell key={entry.tierId} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : activeDebtsChartData.length === 0 ? (
              <div
                dir="rtl"
                className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-50/70 rounded-lg"
              >
                <Scale className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-bold">لا توجد قيود مديونيات مطابقة للتصفية الحالية</p>
                <button
                  type="button"
                  onClick={() => onNavigateToDebts()}
                  className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer"
                >
                  فتح سجل المديونيات ←
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={310} minWidth={0}>
                <ComposedChart
                  data={activeDebtsChartData}
                  margin={{ top: 14, right: 20, left: 10, bottom: 28 }}
                >
                  <defs>
                    <linearGradient id="dashRemDebtGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.98} />
                      <stop offset="100%" stopColor="#be123c" stopOpacity={0.85} />
                    </linearGradient>
                    <linearGradient id="dashPaidDebtGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.98} />
                      <stop offset="100%" stopColor="#047857" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#1E293B', fontWeight: 800 }}
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
                    cursor={{ fill: 'rgba(15, 35, 66, 0.05)' }}
                    formatter={(value: any, name: any) => [
                      `${Number(value || 0).toLocaleString('en-US')} ج.م`,
                      name === 'remainingDebt' ? 'صافي المتبقي' : 'إجمالي المسدد',
                    ]}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#F43F5E',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      direction: 'rtl',
                      fontSize: '12px',
                      fontWeight: 800,
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
                    fill="url(#dashRemDebtGrad)"
                    radius={[7, 7, 0, 0]}
                    maxBarSize={38}
                  />
                  <Bar
                    dataKey="paidAmount"
                    name="paidAmount"
                    fill="url(#dashPaidDebtGrad)"
                    radius={[7, 7, 0, 0]}
                    maxBarSize={38}
                  />
                  <Line
                    type="monotone"
                    dataKey="remainingDebt"
                    name="remainingDebt"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#f59e0b', stroke: '#fff', strokeWidth: 1.5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Bakeries Operational Status Donut with Centered Total */}
        <div
          data-testid="chart-bakery-status"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
        >
          <div className="pb-3 mb-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-1.5">
                <PieChartIcon className="w-4 h-4 text-[#1D4ED8]" />
                <span>توزيع المخابز حسب الحالة</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                اضغط على أي حالة للانتقال إلى مخابزها
              </p>
            </div>
          </div>

          <div className="relative h-[200px] min-h-[200px] w-full" dir="ltr">
            {statusDistributionData.length === 0 ? (
              <div
                dir="rtl"
                className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-50/70 rounded-lg"
              >
                <Store className="w-6 h-6 text-slate-300" />
                <span className="text-xs font-bold">لا توجد مخابز مسجلة حالياً</span>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200} minWidth={0}>
                  <PieChart>
                    <Pie
                      data={statusDistributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={82}
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
                        borderRadius: '8px',
                        direction: 'rtl',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  dir="rtl"
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                >
                  <span className="text-xl font-black font-mono tabular-nums text-[#0F2342] leading-none">
                    {kpis.bakeriesCount}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 mt-1">إجمالي المخابز</span>
                </div>
              </>
            )}
          </div>

          <div className="divide-y divide-slate-100 pt-2 border-t border-slate-100">
            {statusDistributionData.length === 0 ? (
              <div className="py-2 text-center text-[11px] text-slate-400 font-semibold">
                سيتم عرض نسب التشغيل فور إضافة مخابز
              </div>
            ) : (
              statusDistributionData.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => onNavigateToBakeries({ activityStatus: item.name })}
                  className="w-full flex items-center justify-between px-1.5 py-2 hover:bg-slate-50 text-xs transition cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold text-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.name}</span>
                  </span>
                  <span className="font-mono tabular-nums font-black text-[#0F2342]">
                    {item.value}{' '}
                    <span className="text-slate-500 text-[11px] font-bold">({item.percent}%)</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. Analytics Row 2: Flour Quotas & Loaves (7 cols) + 3-Year Trend / Specs / Licenses (5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Chart 3: Distributed Flour Quotas & Daily Loaves */}
        <div
          data-testid="chart-flour-quotas"
          className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-[#0F2342]">
                حصص الدقيق الموزعة والإنتاج اليومي
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                مقارنة الحصة الفعلية بالتأمينية أو الأرغفة المنتجة يومياً ({filteredBakeries.length} مخبز)
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setQuotaViewMode('bar')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                  quotaViewMode === 'bar'
                    ? 'bg-[#0F2342] text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                أعمدة الحصص
              </button>
              <button
                type="button"
                onClick={() => setQuotaViewMode('area')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                  quotaViewMode === 'area'
                    ? 'bg-[#0F2342] text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                منحنى الحصص
              </button>
              <button
                type="button"
                onClick={() => setQuotaViewMode('loaves')}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition ${
                  quotaViewMode === 'loaves'
                    ? 'bg-[#0F2342] text-white'
                    : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                إنتاج الأرغفة
              </button>
            </div>
          </div>

          <div className="h-[300px] min-h-[300px] w-full" dir="ltr">
            {flourQuotasData.length === 0 ? (
              <div
                dir="rtl"
                className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-50/70 rounded-lg"
              >
                <Wheat className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-bold">لا توجد بيانات حصص دقيق للعرض حالياً</p>
                <button
                  type="button"
                  onClick={() => onNavigateToBakeries({})}
                  className="text-xs font-bold text-[#1D4ED8] hover:underline cursor-pointer"
                >
                  إدارة سجلات المخابز ←
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                {quotaViewMode === 'bar' ? (
                  <ComposedChart
                    data={flourQuotasData}
                    margin={{ top: 10, right: 20, left: 10, bottom: 28 }}
                  >
                    <defs>
                      <linearGradient id="dashActQuotaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.98} />
                        <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.85} />
                      </linearGradient>
                      <linearGradient id="dashInsQuotaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.98} />
                        <stop offset="100%" stopColor="#b45309" stopOpacity={0.85} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#1E293B', fontWeight: 800 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip
                      cursor={{ fill: 'rgba(15, 35, 66, 0.04)' }}
                      formatter={(val: any, name: any) => [
                        `${Number(val || 0).toLocaleString('en-US')} شكارة`,
                        name === 'actualQuota' ? 'الحصة الفعلية' : 'الحصة التأمينية',
                      ]}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#3B82F6',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        direction: 'rtl',
                        fontSize: '12px',
                        fontWeight: 800,
                      }}
                    />
                    <Legend
                      formatter={(val) =>
                        val === 'actualQuota' ? 'الحصة الفعلية (شكارة)' : 'الحصة التأمينية (شكارة)'
                      }
                    />
                    <Bar
                      dataKey="actualQuota"
                      name="actualQuota"
                      fill="url(#dashActQuotaGrad)"
                      radius={[7, 7, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="insuranceQuota"
                      name="insuranceQuota"
                      fill="url(#dashInsQuotaGrad)"
                      radius={[7, 7, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualQuota"
                      name="actualQuota"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#10b981', stroke: '#fff', strokeWidth: 1.5 }}
                    />
                  </ComposedChart>
                ) : quotaViewMode === 'area' ? (
                  <AreaChart
                    data={flourQuotasData}
                    margin={{ top: 10, right: 20, left: 10, bottom: 28 }}
                  >
                    <defs>
                      <linearGradient id="areaActGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.7} />
                        <stop offset="100%" stopColor="#93C5FD" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="areaInsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D97706" stopOpacity={0.65} />
                        <stop offset="100%" stopColor="#FCD34D" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#1E293B', fontWeight: 800 }}
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
                        backgroundColor: '#0F172A',
                        borderColor: '#3B82F6',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        direction: 'rtl',
                        fontSize: '12px',
                        fontWeight: 800,
                      }}
                    />
                    <Legend
                      formatter={(val) =>
                        val === 'actualQuota' ? 'الحصة الفعلية (شكارة)' : 'الحصة التأمينية (شكارة)'
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="actualQuota"
                      name="actualQuota"
                      stroke="#1D4ED8"
                      fill="url(#areaActGrad)"
                      fillOpacity={1}
                      strokeWidth={3}
                    />
                    <Area
                      type="monotone"
                      dataKey="insuranceQuota"
                      name="insuranceQuota"
                      stroke="#D97706"
                      fill="url(#areaInsGrad)"
                      fillOpacity={1}
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                ) : (
                  <ComposedChart
                    data={flourQuotasData}
                    margin={{ top: 10, right: 20, left: 12, bottom: 28 }}
                  >
                    <defs>
                      <linearGradient id="dashLoavesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.98} />
                        <stop offset="100%" stopColor="#047857" stopOpacity={0.85} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#1E293B', fontWeight: 800 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={56}
                    />
                    <YAxis
                      width={72}
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickFormatter={(v) => formatLoavesCompact(Number(v))}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(15, 35, 66, 0.04)' }}
                      formatter={(val: any) => [
                        `${Number(val || 0).toLocaleString('en-US')} رغيف يومياً`,
                        'إجمالي الأرغفة',
                      ]}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#10B981',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        direction: 'rtl',
                        fontSize: '12px',
                        fontWeight: 800,
                      }}
                    />
                    <Legend formatter={() => 'إجمالي الأرغفة اليومية'} />
                    <Bar
                      dataKey="loavesCount"
                      name="loavesCount"
                      fill="url(#dashLoavesGrad)"
                      radius={[7, 7, 0, 0]}
                      maxBarSize={42}
                    />
                    <Line
                      type="monotone"
                      dataKey="loavesCount"
                      name="loavesCount"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#f59e0b' }}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Panel 4: Multi-Faceted Executive Insights (3-Year Trend / Specs / Licenses) */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
                <span>مؤشرات المستفيدين والتراخيص</span>
              </h3>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setInsightTab('demographics')}
                  className={`px-2 py-1 rounded-md font-bold cursor-pointer transition ${
                    insightTab === 'demographics'
                      ? 'bg-[#0F2342] text-white'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  2023–2025
                </button>
                <button
                  type="button"
                  onClick={() => setInsightTab('specs')}
                  className={`px-2 py-1 rounded-md font-bold cursor-pointer transition ${
                    insightTab === 'specs'
                      ? 'bg-[#0F2342] text-white'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  الوقود والخبز
                </button>
                <button
                  type="button"
                  onClick={() => setInsightTab('licenses')}
                  className={`px-2 py-1 rounded-md font-bold cursor-pointer transition ${
                    insightTab === 'licenses'
                      ? 'bg-[#0F2342] text-white'
                      : 'text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  التراخيص
                </button>
              </div>
            </div>

            {insightTab === 'demographics' ? (
              <div className="space-y-3">
                <div className="h-[225px] min-h-[225px] w-full" dir="ltr">
                  {filteredBakeries.length === 0 ? (
                    <div
                      dir="rtl"
                      className="h-full flex items-center justify-center text-slate-400 text-xs font-bold bg-slate-50/70 rounded-lg"
                    >
                      لا توجد بيانات مستفيدين بعد
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={225} minWidth={0}>
                      <ComposedChart
                        data={demographicsChartData}
                        margin={{ top: 12, right: 10, left: 10, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis
                          dataKey="year"
                          tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                        />
                        <YAxis
                          yAxisId="left"
                          width={64}
                          tick={{ fontSize: 10, fill: '#475569' }}
                          tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          width={42}
                          tick={{ fontSize: 10, fill: '#D97706' }}
                        />
                        <Tooltip
                          formatter={(val: any, name: any) => [
                            name === 'beneficiaries'
                              ? `${Number(val || 0).toLocaleString('en-US')} مستفيد`
                              : `${val} رغيف/فرد`,
                            name === 'beneficiaries' ? 'إجمالي المستفيدين' : 'المتوسط المرجح',
                          ]}
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#CBD5E1',
                            borderRadius: '8px',
                            direction: 'rtl',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        />
                        <Legend
                          formatter={(val) =>
                            val === 'beneficiaries' ? 'المستفيدون' : 'متوسط الفرد المرجح'
                          }
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="beneficiaries"
                          name="beneficiaries"
                          fill="#0F2342"
                          radius={[5, 5, 0, 0]}
                          maxBarSize={44}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="weightedAvg"
                          name="weightedAvg"
                          stroke="#D97706"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#D97706' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="pt-2.5 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">مرجح 2023</span>
                    <span className="font-mono tabular-nums font-black text-[#0F2342]">
                      {annualReport.weightedGeneralAvg2023}
                    </span>
                  </div>
                  <div className="border-x border-slate-100">
                    <span className="text-[11px] text-slate-500 block">مرجح 2024</span>
                    <span className="font-mono tabular-nums font-black text-[#1D4ED8]">
                      {annualReport.weightedGeneralAvg2024}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">الفرق التراكمي</span>
                    <span dir="ltr" className="inline-block font-mono tabular-nums font-black text-amber-700">
                      {annualReport.cumulativeWeightedDiff2025vs2023}
                    </span>
                  </div>
                </div>
              </div>
            ) : insightTab === 'specs' ? (
              <div className="space-y-4 py-1">
                <div>
                  <div className="text-xs font-bold text-slate-600 mb-2">توزيع المخابز حسب الوقود</div>
                  {specsBreakdown.fuels.length === 0 ? (
                    <p className="text-xs text-slate-400">لا توجد بيانات وقود مسجلة</p>
                  ) : (
                    <div className="space-y-2">
                      {specsBreakdown.fuels.map((item) => (
                        <div key={item.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700">{item.label}</span>
                            <span className="font-mono tabular-nums font-black text-[#0F2342]">
                              {item.count} ({item.percent}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-xs overflow-hidden">
                            <div
                              className="h-full bg-[#1D4ED8]"
                              style={{ width: `${item.percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs font-bold text-slate-600 mb-2">توزيع أنواع الخبز المنتجة</div>
                  {specsBreakdown.breads.length === 0 ? (
                    <p className="text-xs text-slate-400">لا توجد بيانات أنواع خبز مسجلة</p>
                  ) : (
                    <div className="space-y-2">
                      {specsBreakdown.breads.slice(0, 5).map((item) => (
                        <div key={item.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700">{item.label}</span>
                            <span className="font-mono tabular-nums font-black text-[#0F2342]">
                              {item.count} ({item.percent}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-xs overflow-hidden">
                            <div
                              className="h-full bg-emerald-600"
                              style={{ width: `${item.percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-1">
                <div className="divide-y divide-slate-100">
                  <div className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-red-700">تراخيص ومستندات منتهية الصلاحية</span>
                    <span className="font-mono tabular-nums font-black text-red-700 text-sm">
                      {licenseSummary.expiredCount}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-700">تنتهي خلال 30 يوماً القادمة</span>
                    <span className="font-mono tabular-nums font-black text-amber-700 text-sm">
                      {licenseSummary.expiringSoonCount}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-700">مستندات سارية ومطابقة</span>
                    <span className="font-mono tabular-nums font-black text-emerald-700 text-sm">
                      {licenseSummary.validCount}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">تواريخ غير مستوفاة</span>
                    <span className="font-mono tabular-nums font-bold text-slate-600 text-sm">
                      {licenseSummary.missingCount}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 leading-relaxed">
                  يتم فحص تواريخ رخصة المخبز، السجل التجاري، عقد الإيجار، والبطاقة الضريبية آلياً دون أي تعديل على السجلات.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Bottom Watchlist Row: Financial Debt Watchlist (7 cols) + Operational/License Watchlist (5 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Financial Watchlist Table */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-[#0F2342]">
                قائمة المتابعة المالية — أعلى المخابز مديونية
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                حد التنبيه المعتمد ({debtAlertThreshold.toLocaleString('en-US')} ج.م) — انقر على أي صف لفتح ملف مديونيته
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setWatchlistTierFilter('all')}
                  className={`px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                    watchlistTierFilter === 'all' ? 'bg-[#0F2342] text-white' : 'text-slate-700'
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistTierFilter('critical')}
                  className={`px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                    watchlistTierFilter === 'critical' ? 'bg-red-700 text-white' : 'text-slate-700'
                  }`}
                >
                  تجاوز الحد
                </button>
                <button
                  type="button"
                  onClick={() => setWatchlistTierFilter('normal')}
                  className={`px-2 py-0.5 rounded-md font-bold cursor-pointer ${
                    watchlistTierFilter === 'normal' ? 'bg-[#0F2342] text-white' : 'text-slate-700'
                  }`}
                >
                  ضمن الحد
                </button>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToDebts()}
                className="text-xs font-bold text-[#1D4ED8] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>السجل الكامل</span>
                <ArrowUpLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredWatchlistRows.length === 0 ? (
            <div className="text-center py-8 text-xs font-bold text-slate-400">
              لا توجد مخابز عليها مديونيات مطابقة ضمن التصفية الحالية
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200 text-slate-700 font-bold">
                    <th className="py-2.5 px-3">صاحب المخبز</th>
                    <th className="py-2.5 px-3">القرية</th>
                    <th className="py-2.5 px-3">المتبقي</th>
                    <th className="py-2.5 px-3">المسدد</th>
                    <th className="py-2.5 px-3">التحصيل</th>
                    <th className="py-2.5 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWatchlistRows.slice(0, 7).map((row) => {
                    const exceedsThreshold = row.remainingDebt >= debtAlertThreshold;
                    return (
                      <tr
                        key={row.bakeryId}
                        onClick={() => onNavigateToDebts(row.bakeryId)}
                        className="hover:bg-slate-50 transition cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-bold text-[#0F2342]">{row.name}</td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{row.village}</td>
                        <td className="py-2.5 px-3 font-mono tabular-nums font-black text-red-700 whitespace-nowrap">
                          {row.remainingDebt.toLocaleString('en-US')} ج.م
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-emerald-700 whitespace-nowrap">
                          {row.paidAmount.toLocaleString('en-US')} ج.م
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-slate-100 rounded-xs overflow-hidden">
                              <div
                                className="h-full bg-emerald-600"
                                style={{ width: `${row.collectionPercent}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[11px] font-bold text-slate-700">
                              {row.collectionPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {exceedsThreshold ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-red-50 text-red-700 border border-red-200 font-bold text-[11px] whitespace-nowrap">
                              <AlertTriangle className="w-3 h-3" />
                              تجاوز الحد
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-slate-100 text-slate-700 font-semibold text-[11px] whitespace-nowrap">
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

        {/* Operational & Document Expiry Watchlist */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-1.5">
                  <FileWarning className="w-4 h-4 text-amber-600" />
                  <span>تنبيهات التشغيل والتراخيص</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  المخابز المتوقفة والوثائق المنتهية أو القريبة من الانتهاء
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToBakeries({})}
                className="text-xs font-bold text-[#1D4ED8] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>عرض المخابز</span>
                <ArrowUpLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {licenseSummary.alerts.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Building2 className="w-7 h-7 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-slate-700">
                  {filteredBakeries.length === 0
                    ? 'لا توجد سجلات مخابز مسجلة حالياً للفحص'
                    : 'كافة المخابز تعمل بانتظام وتراخيصها سارية'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {filteredBakeries.length === 0
                    ? 'أضف مخابز من قاعدة البيانات لبدء الرصد التلقائي للرخص والحصص.'
                    : 'لا توجد وثائق منتهية أو قريبة من الانتهاء خلال 30 يوماً.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {licenseSummary.alerts.slice(0, 6).map((item, idx) => (
                  <button
                    key={`${item.bakeryId}-${item.docLabel}-${idx}`}
                    type="button"
                    onClick={() => onNavigateToBakeries({ village: item.village })}
                    className="w-full py-2.5 px-1.5 hover:bg-slate-50 transition flex items-center justify-between gap-2 text-right cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#0F2342] truncate">
                        {item.bakeryOwnerName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {item.village} · ماكينة{' '}
                        <span className="font-mono tabular-nums">{item.machineNumber}</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-bold ${
                          item.status === 'expired'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : item.status === 'expiring_soon'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {item.status === 'expired'
                          ? `${item.docLabel} منتهية`
                          : item.status === 'expiring_soon'
                          ? `${item.docLabel} (${item.daysRemaining} يوم)`
                          : item.docLabel}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
