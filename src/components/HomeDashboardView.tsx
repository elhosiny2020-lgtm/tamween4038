import React, { useMemo } from 'react';
import { Bakery, DebtRecord, VillageHierarchy } from '../types';
import { SidebarNavId } from './RightSidebar';
import { calculateAnnualWeightedAveragesReport, extractBreadLoafMultiplier } from '../utils/auditHelper';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  Store,
  Layers,
  Wheat,
  Coins,
  Users,
  Calculator,
  Activity,
  Clock,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  Eye,
  RefreshCw,
} from 'lucide-react';

interface HomeDashboardViewProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  activeSubMode: SidebarNavId;
  onNavigateToBakeries: (options?: {
    columnFocus?: 'ALL' | 'BASIC' | 'BREAD' | 'QUOTAS' | 'INSURANCE' | 'BENEFICIARIES' | 'EQUATIONS';
    village?: string;
    activityStatus?: string;
    highlightEquation?: string;
  }) => void;
  onSelectBakeryDetails: (bakery: Bakery) => void;
  onRecalculateEquations: () => void;
  onOpenLocalUnitsModal: () => void;
}

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  bakeries,
  debts,
  activeSubMode,
  onNavigateToBakeries,
  onSelectBakeryDetails,
  onRecalculateEquations,
  onOpenLocalUnitsModal,
}) => {
  // Real-time aggregates from the database
  const stats = useMemo(() => {
    const totalBakeries = bakeries.length;
    const totalActualQuota = bakeries.reduce((acc, b) => acc + (Number(b.actualQuota) || 0), 0);
    const totalInsuranceQuota = Number(
      bakeries.reduce((acc, b) => acc + (Number(b.insuranceQuota) || 0), 0).toFixed(2)
    );
    const totalLoaves = bakeries.reduce((acc, b) => acc + (Number(b.loavesCount) || 0), 0);
    const totalInsuranceValue = bakeries.reduce((acc, b) => acc + (Number(b.insuranceValue) || 0), 0);
    const totalBen2023 = bakeries.reduce((acc, b) => acc + (Number(b.beneficiaries2023) || 0), 0);
    const totalBen2024 = bakeries.reduce((acc, b) => acc + (Number(b.beneficiaries2024) || 0), 0);
    const totalBen2025 = bakeries.reduce((acc, b) => acc + (Number(b.beneficiaries2025) || 0), 0);
    const overallPerCapita = totalBen2025 > 0 ? (totalLoaves / totalBen2025).toFixed(2) : '0.00';

    const activeBakeries = bakeries.filter((b) => b.activityStatus === 'شغال').length;
    const stoppedBakeries = totalBakeries - activeBakeries;
    const totalDebts = debts.reduce((acc, d) => acc + (Number(d.netRemainingDebt) || 0), 0);
    const needsReviewCount = bakeries.filter(
      (b) =>
        !b.bakeryOwnerName ||
        !b.machineNumber ||
        Number(b.actualQuota) <= 0 ||
        Number(b.beneficiaries2025) <= 0 ||
        Math.abs((Number(b.actualQuota) || 0) - (Number(b.insuranceQuota) || 0)) > 0.01
    ).length;

    return {
      totalBakeries,
      totalActualQuota,
      totalInsuranceQuota,
      totalLoaves,
      totalInsuranceValue,
      totalBen2023,
      totalBen2024,
      totalBen2025,
      overallPerCapita,
      activeBakeries,
      stoppedBakeries,
      totalDebts,
      needsReviewCount,
    };
  }, [bakeries, debts]);

  const annualReport = useMemo(() => calculateAnnualWeightedAveragesReport(bakeries), [bakeries]);

  // 3-Year comparison data by Village (top 8 villages)
  const villageComparisonData = useMemo(() => {
    const map: Record<
      string,
      {
        village: string;
        ben2023: number;
        ben2024: number;
        ben2025: number;
        loaves: number;
        count: number;
      }
    > = {};

    for (const b of bakeries) {
      const v = b.village || 'غير محدد';
      if (!map[v]) {
        map[v] = { village: v, ben2023: 0, ben2024: 0, ben2025: 0, loaves: 0, count: 0 };
      }
      map[v].ben2023 += Number(b.beneficiaries2023) || 0;
      map[v].ben2024 += Number(b.beneficiaries2024) || 0;
      map[v].ben2025 += Number(b.beneficiaries2025) || 0;
      map[v].loaves += Number(b.loavesCount) || 0;
      map[v].count += 1;
    }

    return Object.values(map)
      .map((item) => ({
        ...item,
        avg2023: item.ben2023 > 0 ? Number((item.loaves / item.ben2023).toFixed(2)) : 0,
        avg2024: item.ben2024 > 0 ? Number((item.loaves / item.ben2024).toFixed(2)) : 0,
        avg2025: item.ben2025 > 0 ? Number((item.loaves / item.ben2025).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.loaves - a.loaves)
      .slice(0, 8);
  }, [bakeries]);

  // Overall 3-Year summary chart data
  const threeYearOverviewData = useMemo(
    () => [
      {
        year: 'عام 2023',
        beneficiaries: stats.totalBen2023,
        weightedAvg: Number(annualReport.weightedGeneralAvg2023) || 0,
      },
      {
        year: 'عام 2024',
        beneficiaries: stats.totalBen2024,
        weightedAvg: Number(annualReport.weightedGeneralAvg2024) || 0,
      },
      {
        year: 'عام 2025',
        beneficiaries: stats.totalBen2025,
        weightedAvg: Number(annualReport.weightedGeneralAvg2025) || 0,
      },
    ],
    [stats, annualReport]
  );

  // Check if user selected one of the 7 equations in Group 3
  const isEquationMode = activeSubMode.startsWith('calc-');

  const equationDetails = useMemo(() => {
    switch (activeSubMode) {
      case 'calc-insurance-quota':
        return {
          title: 'معادلة احتساب الحصة التأمينية للمخبز',
          formula: 'الحصة التأمينية = المبلغ التأميني بالجنيه ÷ 235 ÷ 3',
          description:
            'تُحتسب الحصة التأمينية تلقائياً بقسمة القيمة المسجلة فعلياً في خانة المبلغ التأميني على 235 ثم على 3 مقربة لرقمين عشريين.',
          summaryLabel: 'إجمالي الحصص التأمينية المحتسبة:',
          summaryValue: `${stats.totalInsuranceQuota.toLocaleString()} شيكارة`,
          focusTab: 'INSURANCE' as const,
        };
      case 'calc-loaves':
        return {
          title: 'معادلة احتساب عدد الأرغفة اليومية',
          formula: 'عدد الأرغفة = حصة المخبز الفعلية × معامل عدد الأرغفة (660 أو 725)',
          description:
            'يتم قراءة نوع عدد الخبز لكل مخبز على حدة (660 أو 725 رغيفاً للشيكارة) وضربه في الحصة الفعلية للمخبز.',
          summaryLabel: 'إجمالي الأرغفة اليومية المحتسبة:',
          summaryValue: `${stats.totalLoaves.toLocaleString()} رغيف`,
          focusTab: 'QUOTAS' as const,
        };
      case 'calc-avg-2023':
        return {
          title: 'معادلة احتساب متوسط نصيب الفرد لعام 2023',
          formula: 'متوسط نصيب الفرد 2023 = عدد الأرغفة ÷ عدد المستفيدين لعام 2023',
          description: 'يقيس متوسط نصيب الفرد الواحد من الأرغفة اليومية بناءً على تعداد المستفيدين المسجل لعام 2023.',
          summaryLabel: 'المتوسط العام المرجح لعام 2023:',
          summaryValue: `${annualReport.weightedGeneralAvg2023} رغيف/فرد`,
          focusTab: 'EQUATIONS' as const,
        };
      case 'calc-avg-2024':
        return {
          title: 'معادلة احتساب متوسط نصيب الفرد لعام 2024',
          formula: 'متوسط نصيب الفرد 2024 = عدد الأرغفة ÷ عدد المستفيدين لعام 2024',
          description: 'يقيس متوسط نصيب الفرد الواحد من الأرغفة اليومية بناءً على تعداد المستفيدين المسجل لعام 2024.',
          summaryLabel: 'المتوسط العام المرجح لعام 2024:',
          summaryValue: `${annualReport.weightedGeneralAvg2024} رغيف/فرد`,
          focusTab: 'EQUATIONS' as const,
        };
      case 'calc-avg-2025':
        return {
          title: 'معادلة احتساب متوسط نصيب الفرد لعام 2025',
          formula: 'متوسط نصيب الفرد 2025 = عدد الأرغفة ÷ عدد المستفيدين لعام 2025',
          description: 'يقيس متوسط نصيب الفرد الواحد من الأرغفة اليومية بناءً على تعداد المستفيدين المسجل لعام 2025.',
          summaryLabel: 'المتوسط العام المرجح لعام 2025:',
          summaryValue: `${annualReport.weightedGeneralAvg2025} رغيف/فرد`,
          focusTab: 'EQUATIONS' as const,
        };
      case 'calc-per-bakery':
        return {
          title: 'معادلة احتساب متوسط نصيب الفرد للمخبز الواحد',
          formula: 'متوسط نصيب الفرد للمخبز الواحد = إجمالي عدد الأرغفة للمخبز ÷ عدد المستفيدين لعام 2025 للمخبز',
          description: 'يُحسب لكل مخبز مستقل بقسمة أرغفة المخبز اليومية على عدد مستفيدي المخبز لعام 2025.',
          summaryLabel: 'متوسط نصيب الفرد الإجمالي بالمركز:',
          summaryValue: `${stats.overallPerCapita} رغيف/فرد`,
          focusTab: 'EQUATIONS' as const,
        };
      case 'calc-cum-diff':
        return {
          title: 'معادلة احتساب الفرق التراكمي لمتوسطات نصيب الفرد',
          formula: 'الفرق التراكمي (ف) = م2023 - م2024 - م2025',
          description:
            'تُطرح قيمة متوسط نصيب الفرد لعام 2024 ومتوسط نصيب الفرد لعام 2025 من متوسط نصيب الفرد لعام 2023 بنفس الترتيب المعتمد.',
          summaryLabel: 'الفرق التراكمي المرجح:',
          summaryValue: `${annualReport.cumulativeWeightedDiff2025vs2023}`,
          focusTab: 'EQUATIONS' as const,
        };
      default:
        return null;
    }
  }, [activeSubMode, stats, annualReport]);

  return (
    <div className="space-y-6">
      {/* If user selected a specific Equation from Group 3, show the Live Equation Inspector */}
      {isEquationMode && equationDetails && (
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-[#0F2342] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#1E3A8A] rounded-xl border border-sky-400/30">
                <Calculator className="w-5 h-5 text-sky-300" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">{equationDetails.title}</h3>
                <p className="text-xs text-slate-300 mt-0.5">{equationDetails.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRecalculateEquations}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة احتساب وتدقيق جميع السجلات</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onNavigateToBakeries({
                    columnFocus: equationDetails.focusTab,
                    highlightEquation: activeSubMode,
                  })
                }
                className="px-3.5 py-2 bg-[#2563EB] hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>فتح في جدول المخابز الرئيسي</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-5 bg-[#F8FAFC] border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600">الصيغة الرياضية المعتمدة:</span>
              <code className="px-3.5 py-1.5 bg-[#EFF6FF] text-[#1E3A8A] border border-blue-200 rounded-lg text-xs font-extrabold">
                {equationDetails.formula}
              </code>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-600">{equationDetails.summaryLabel}</span>
              <span className="text-sm font-mono font-black text-[#0F2342] tabular-nums">
                {equationDetails.summaryValue}
              </span>
            </div>
          </div>

          {/* Live Bakeries Calculation Preview Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-[#0F2342] text-white sticky top-0 z-10 font-bold">
                <tr>
                  <th className="py-2.5 px-3 border-l border-slate-700">#</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 text-right">اسم المخبز</th>
                  <th className="py-2.5 px-3 border-l border-slate-700">رقم الماكينة</th>
                  <th className="py-2.5 px-3 border-l border-slate-700">اسم القرية</th>
                  <th className="py-2.5 px-3 border-l border-slate-700">اسم الوحدة المحلية</th>
                  <th className="py-2.5 px-3 border-l border-slate-700">المبلغ التأميني</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">الحصة التأمينية (÷235÷3)</th>
                  <th className="py-2.5 px-3 border-l border-slate-700">الحصة الفعلية</th>
                  <th className="py-2.5 px-3 border-l border-slate-700">نوع عدد الخبز</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">عدد الأرغفة</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">متوسط 2023</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">متوسط 2024</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">متوسط 2025</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">متوسط المخبز</th>
                  <th className="py-2.5 px-3 border-l border-slate-700 bg-[#1E3A8A]">الفرق التراكمي</th>
                  <th className="py-2.5 px-3">تفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-800 font-semibold">
                {bakeries.map((b, i) => {
                  const mult = extractBreadLoafMultiplier(b.breadTypeCount);
                  return (
                    <tr key={b.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50/50' : 'bg-slate-50/70 hover:bg-blue-50/50'}>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="py-2 px-3 border-l border-slate-200 text-right font-bold text-slate-900">{b.bakeryOwnerName}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-bold text-slate-800">{b.machineNumber}</td>
                      <td className="py-2 px-2 border-l border-slate-200">{b.village}</td>
                      <td className="py-2 px-2 border-l border-slate-200">{b.localUnit}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono tabular-nums">{b.insuranceValue?.toLocaleString()}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-extrabold text-[#1E3A8A] bg-blue-50/60 tabular-nums">
                        {b.insuranceQuota}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono tabular-nums">{b.actualQuota}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono tabular-nums">{mult}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-extrabold text-[#1E3A8A] bg-blue-50/60 tabular-nums">
                        {b.loavesCount?.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-bold bg-blue-50/40 tabular-nums">{b.avg2023}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-bold bg-blue-50/40 tabular-nums">{b.avg2024}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-bold bg-blue-50/40 tabular-nums">{b.avg2025}</td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-extrabold text-emerald-700 bg-emerald-50/40 tabular-nums">
                        {Number(b.perCapitaAverage || 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-2 border-l border-slate-200 font-mono font-extrabold text-amber-800 bg-amber-50/50 tabular-nums">
                        {b.avgDiff}
                      </td>
                      <td className="py-2 px-2">
                        <button
                          type="button"
                          onClick={() => onSelectBakeryDetails(b)}
                          className="p-1.5 text-[#1E40AF] hover:bg-blue-100 rounded-lg transition cursor-pointer"
                          title="عرض تفصيلي للمخبز"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-[#0F2342] text-white sticky bottom-0 z-10 font-black">
                <tr className="total-summary-row">
                  <td colSpan={5} className="py-2.5 px-3 text-right text-amber-300 border-l border-slate-700">
                    صف الإجماليات TOTAL SUMMARY ({bakeries.length} مخبز)
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-amber-200">
                    {stats.totalInsuranceValue.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-sky-300">
                    {stats.totalInsuranceQuota.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-amber-300">
                    {stats.totalActualQuota.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-slate-300">-</td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-emerald-300">
                    {stats.totalLoaves.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-sky-200">
                    {annualReport.weightedGeneralAvg2023}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-sky-200">
                    {annualReport.weightedGeneralAvg2024}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-sky-200">
                    {annualReport.weightedGeneralAvg2025}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-emerald-300">
                    {stats.overallPerCapita}
                  </td>
                  <td className="py-2.5 px-2 border-l border-slate-700 font-mono text-amber-300">
                    {annualReport.cumulativeWeightedDiff2025vs2023}
                  </td>
                  <td className="py-2.5 px-2">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 8 Primary Executive KPI Cards (تعتمد على البيانات الحقيقية في القاعدة مع الانتقال السريع) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-extrabold text-[#0F2342]">
              المؤشرات الإحصائية الرئيسية للمنظومة
            </h2>
            <p className="text-xs text-slate-500">
              بيانات حية ومباشرة من سجلات قاعدة البيانات — انقر على أي بطاقة للانتقال إلى السجلات التفصيلية المرتبطة بها
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'ALL' })}
            className="px-3.5 py-2 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <span>عرض جدول المخابز الكامل</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Total Bakeries */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'ALL' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">1. إجمالي عدد المخابز</span>
              <span className="text-2xl font-black text-[#0F2342] mt-1.5 block font-mono tabular-nums">
                {stats.totalBakeries.toLocaleString()}
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold mt-1 block">
                {stats.activeBakeries} مخبز يعمل · {stats.stoppedBakeries} متوقف
              </span>
            </div>
            <div className="p-2.5 bg-[#EFF6FF] text-[#1E3A8A] rounded-xl group-hover:bg-[#1E3A8A] group-hover:text-white transition">
              <Store className="w-5 h-5" />
            </div>
          </button>

          {/* Card 2: Total Actual Quotas */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'QUOTAS' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">2. إجمالي الحصص الفعلية</span>
              <span className="text-2xl font-black text-[#0F2342] mt-1.5 block font-mono tabular-nums">
                {stats.totalActualQuota.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                شيكارة دقيق يومياً (تأمينية: {stats.totalInsuranceQuota})
              </span>
            </div>
            <div className="p-2.5 bg-[#EFF6FF] text-[#1E3A8A] rounded-xl group-hover:bg-[#1E3A8A] group-hover:text-white transition">
              <Layers className="w-5 h-5" />
            </div>
          </button>

          {/* Card 3: Total Loaves */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'QUOTAS' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">3. إجمالي عدد الأرغفة</span>
              <span className="text-2xl font-black text-emerald-700 mt-1.5 block font-mono tabular-nums">
                {stats.totalLoaves.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                رغيف بلدي مدعم يومياً (× 660 / 725)
              </span>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl group-hover:bg-emerald-700 group-hover:text-white transition">
              <Wheat className="w-5 h-5" />
            </div>
          </button>

          {/* Card 4: Total Insurance Amounts */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'INSURANCE' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">4. إجمالي المبالغ التأمينية</span>
              <span className="text-2xl font-black text-[#0F2342] mt-1.5 block font-mono tabular-nums">
                {stats.totalInsuranceValue.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                جنيه مصري (مربوط بالحصة التأمينية)
              </span>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition">
              <Coins className="w-5 h-5" />
            </div>
          </button>

          {/* Card 5: Total Beneficiaries 2023 */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'BENEFICIARIES' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">5. إجمالي المستفيدين لعام 2023</span>
              <span className="text-2xl font-black text-[#1E3A8A] mt-1.5 block font-mono tabular-nums">
                {stats.totalBen2023.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                متوسط 2023 المرجح: {annualReport.weightedGeneralAvg2023} رغيف/فرد
              </span>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl group-hover:bg-[#1E3A8A] group-hover:text-white transition">
              <Users className="w-5 h-5" />
            </div>
          </button>

          {/* Card 6: Total Beneficiaries 2024 */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'BENEFICIARIES' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">6. إجمالي المستفيدين لعام 2024</span>
              <span className="text-2xl font-black text-[#1E3A8A] mt-1.5 block font-mono tabular-nums">
                {stats.totalBen2024.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                متوسط 2024 المرجح: {annualReport.weightedGeneralAvg2024} رغيف/فرد
              </span>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl group-hover:bg-[#1E3A8A] group-hover:text-white transition">
              <Users className="w-5 h-5" />
            </div>
          </button>

          {/* Card 7: Total Beneficiaries 2025 */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'BENEFICIARIES' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">7. إجمالي المستفيدين لعام 2025</span>
              <span className="text-2xl font-black text-[#1E3A8A] mt-1.5 block font-mono tabular-nums">
                {stats.totalBen2025.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold mt-1 block">
                متوسط 2025 المرجح: {annualReport.weightedGeneralAvg2025} رغيف/فرد
              </span>
            </div>
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl group-hover:bg-[#1E3A8A] group-hover:text-white transition">
              <Users className="w-5 h-5" />
            </div>
          </button>

          {/* Card 8: Overall Per Capita Average */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'EQUATIONS' })}
            className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E40AF] rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group"
          >
            <div>
              <span className="text-xs font-bold text-slate-500 block">8. متوسط نصيب الفرد الإجمالي</span>
              <span className="text-2xl font-black text-emerald-700 mt-1.5 block font-mono tabular-nums">
                {stats.overallPerCapita}
              </span>
              <span className="text-[11px] text-amber-700 font-semibold mt-1 block">
                الفرق التراكمي: {annualReport.cumulativeWeightedDiff2025vs2023}
              </span>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl group-hover:bg-emerald-700 group-hover:text-white transition">
              <Calculator className="w-5 h-5" />
            </div>
          </button>

          {/* Card 9: Bakeries Needing Data Review */}
          <button
            type="button"
            onClick={() => onNavigateToBakeries({ columnFocus: 'ALL' })}
            className="bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-400 rounded-xl p-4 text-right shadow-2xs transition flex items-start justify-between cursor-pointer group sm:col-span-2 lg:col-span-4"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-xs font-bold text-slate-500 block">
                  9. عدد المخابز التي تحتاج إلى مراجعة بيانات (فروق حصص أو بيانات ناقصة)
                </span>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-2xl font-black text-amber-700 font-mono tabular-nums">
                    {stats.needsReviewCount}
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {stats.needsReviewCount === 0
                      ? 'جميع المخابز مكتملة البيانات ومطابقة للحصص بنسبة 100%'
                      : `مخبز يحتاج لمراجعة البيانات أو مطابقة الحصة الفعلية بالتأمينية`}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </button>
        </div>
      </div>

      {/* Interactive 3-Year Comparison Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Beneficiaries Comparison Across 2023, 2024, 2025 by Village */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#0F2342] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#1E40AF]" />
                <span>مقارنة أعداد المستفيدين بين الأعوام (2023 - 2024 - 2025) حسب القرية</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                انقر على أي عمود للانتقال الفوري إلى مخابز القرية المختارة في قاعدة البيانات
              </p>
            </div>
          </div>

          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={villageComparisonData}
                onClick={(state: any) => {
                  if (state && state.activeLabel) {
                    onNavigateToBakeries({ village: state.activeLabel, columnFocus: 'BENEFICIARIES' });
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="village" tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#0F172A',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
                <Bar dataKey="ben2023" name="مستفيدو 2023" fill="#0F2342" radius={[4, 4, 0, 0]} cursor="pointer" />
                <Bar dataKey="ben2024" name="مستفيدو 2024" fill="#2563EB" radius={[4, 4, 0, 0]} cursor="pointer" />
                <Bar dataKey="ben2025" name="مستفيدو 2025" fill="#0D9488" radius={[4, 4, 0, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Per Capita Average Comparison (2023 vs 2024 vs 2025) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#0F2342] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#1E40AF]" />
                <span>تطور متوسطات نصيب الفرد اليومي للأعوام الثلاثة (رغيف / فرد)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                مقارنة حية لمتوسط نصيب الفرد في القرى للأعوام 2023 و2024 و2025
              </p>
            </div>
          </div>

          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={villageComparisonData}
                onClick={(state: any) => {
                  if (state && state.activeLabel) {
                    onNavigateToBakeries({ village: state.activeLabel, columnFocus: 'EQUATIONS' });
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="village" tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#0F172A',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
                <Line
                  type="monotone"
                  dataKey="avg2023"
                  name="متوسط 2023"
                  stroke="#0F2342"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg2024"
                  name="متوسط 2024"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg2025"
                  name="متوسط 2025"
                  stroke="#15803D"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Latest Operations & Quick Bakeries Preview */}
      <div className="grid grid-cols-1 gap-4">

        {/* Latest Operations & Quick Bakeries Preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-[#0F2342] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1E40AF]" />
              <span>آخر العمليات والسجلات المحدثة بقاعدة البيانات</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateToBakeries({ columnFocus: 'ALL' })}
              className="text-xs font-bold text-[#1E40AF] hover:underline cursor-pointer"
            >
              عرض الكل ←
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {bakeries.slice(0, 6).map((b) => (
              <div
                key={b.id}
                onClick={() => onSelectBakeryDetails(b)}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/60 hover:bg-blue-50/40 transition flex items-center justify-between text-xs cursor-pointer"
              >
                <div>
                  <div className="font-bold text-slate-900">{b.bakeryOwnerName}</div>
                  <div className="text-[11px] text-slate-500">
                    ماكينة: <span className="font-mono">{b.machineNumber}</span> · قرية {b.village} · حصة فعلية:{' '}
                    <span className="font-mono font-bold text-[#0F2342]">{b.actualQuota}</span> شيكارة
                  </div>
                </div>
                <div className="text-left">
                  <span className="font-mono font-bold text-emerald-700 block tabular-nums">
                    {b.loavesCount?.toLocaleString()} رغيف
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    متوسط الفرد: {Number(b.perCapitaAverage || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
