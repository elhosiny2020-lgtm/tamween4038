import React, { useMemo, useRef, useState } from 'react';
import { Bakery, DebtRecord, SystemConfig, VillageHierarchy } from '../types';
import { calculateDailyPerformanceSummary } from '../utils/auditHelper';
import { exportElementToPdf, printHtmlElementA4 } from '../utils/pdfHelper';
import { MINISTRY_LOGO_URL } from '../services/modulesStorage';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Printer,
  Scale,
  Store,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

interface DailyPerformanceSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  systemConfig: SystemConfig;
  branchName?: string;
}

export const DailyPerformanceSummaryModal: React.FC<DailyPerformanceSummaryModalProps> = ({
  isOpen,
  onClose,
  bakeries,
  debts,
  villages,
  systemConfig,
  branchName,
}) => {
  const [reportDate, setReportDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [localUnitFilter, setLocalUnitFilter] = useState<string>('ALL');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfProgressText, setPdfProgressText] = useState<string>('');
  const reportContainerRef = useRef<HTMLDivElement | null>(null);

  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    (villages || []).forEach((v) => {
      (v.localUnits || []).forEach((u) => {
        if (u && u.trim()) set.add(u.trim());
      });
    });
    (bakeries || []).forEach((b) => {
      if (b.localUnit && b.localUnit.trim()) set.add(b.localUnit.trim());
    });
    return Array.from(set);
  }, [villages, bakeries]);

  const summary = useMemo(
    () =>
      calculateDailyPerformanceSummary(bakeries, debts, {
        referenceDate: reportDate,
        localUnitFilter,
      }),
    [bakeries, debts, reportDate, localUnitFilter]
  );

  if (!isOpen) return null;

  const handleDownloadPdf = async () => {
    if (!reportContainerRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    setPdfProgressText('جاري تجهيز ملف PDF للتقرير الإحصائي اليومي...');
    try {
      await exportElementToPdf(reportContainerRef.current, {
        title: `التقرير_الإحصائي_اليومي_للمدير_العام_${reportDate}`,
        filename: `التقرير_الإحصائي_اليومي_${reportDate}.pdf`,
        paperSize: 'a4',
        orientation: 'landscape',
        margins: 'narrow',
        fontClass: 'report-font-standard',
        onProgress: (stage) => setPdfProgressText(stage),
      });
    } finally {
      setTimeout(() => {
        setIsExportingPdf(false);
        setPdfProgressText('');
      }, 900);
    }
  };

  const handlePrintA4 = () => {
    if (!reportContainerRef.current) return;
    printHtmlElementA4(
      reportContainerRef.current,
      `التقرير الإحصائي اليومي للمدير العام - ${reportDate}`,
      'report-font-standard',
      {
        paperSize: 'a4',
        orientation: 'landscape',
        margins: 'narrow',
      }
    );
  };

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="التقرير الإحصائي اليومي للمدير العام"
      data-testid="daily-performance-summary-modal"
      className="fixed inset-0 z-[75] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl border-2 border-[#D4AF37] w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden cursor-default"
      >
        {/* Top Action Bar */}
        <div className="bg-gradient-to-l from-[#0A1628] via-[#0F2342] to-[#0D9488] text-white p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#D4AF37]/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#FDE68A]">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  التقرير الإحصائي اليومي للمدير العام (Daily Performance Summary)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-[#0A1628] text-[11px] font-black">
                  ملخص الأرغفة المنتجة والمديونيات الجديدة
                </span>
              </div>
              <p className="text-xs text-slate-200 font-bold mt-0.5">
                {systemConfig.directorateTitle} — {branchName || systemConfig.administrationTitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="download-daily-performance-pdf-btn"
              disabled={isExportingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-amber-400 hover:from-amber-300 hover:to-amber-400 disabled:opacity-60 text-[#0A1628] font-black text-xs shadow-lg cursor-pointer transition"
            >
              <Download className="w-4 h-4" />
              <span>
                {isExportingPdf ? 'جاري استخراج PDF...' : 'تحميل التقرير كملف PDF (html2pdf)'}
              </span>
            </button>

            <button
              type="button"
              data-testid="print-daily-performance-btn"
              onClick={handlePrintA4}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-sm cursor-pointer transition"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة A4</span>
            </button>

            <button
              type="button"
              data-testid="close-daily-performance-modal-btn"
              onClick={onClose}
              className="p-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white cursor-pointer transition"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Controls Strip */}
        <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0D9488]" />
              <label className="text-xs font-black text-slate-700">تاريخ التقرير اليومي:</label>
              <input
                type="date"
                aria-label="تاريخ التقرير اليومي"
                data-testid="daily-performance-date-input"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-black text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-700" />
              <label className="text-xs font-black text-slate-700">تصفية بالوحدة المحلية:</label>
              <select
                aria-label="تصفية بالوحدة المحلية"
                data-testid="daily-performance-unit-select"
                value={localUnitFilter}
                onChange={(e) => setLocalUnitFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 cursor-pointer"
              >
                <option value="ALL">جميع الوحدات المحلية ({availableUnits.length})</option>
                {availableUnits.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {pdfProgressText && (
            <div className="px-3 py-1 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 text-xs font-black flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-700 animate-bounce" />
              <span>{pdfProgressText}</span>
            </div>
          )}
        </div>

        {/* Printable Report Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          <div
            ref={reportContainerRef}
            className="print-container bg-white rounded-2xl border border-slate-300 p-5 space-y-5 shadow-xs"
          >
            {/* Official Governmental Report Header */}
            <div className="border-b-2 border-[#0F2342] pb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-right">
                <div className="w-14 h-14 p-1 rounded-xl bg-white border border-[#0F2342]/30 flex items-center justify-center shrink-0">
                  <img
                    src={systemConfig.logoBase64 || MINISTRY_LOGO_URL}
                    alt="شعار وزارة التموين والتجارة الداخلية"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-0.5 text-right">
                  <p className="text-[11px] font-black text-slate-600">جمهورية مصر العربية — وزارة التموين والتجارة الداخلية</p>
                  <p className="text-xs font-black text-slate-700">{systemConfig.governorateTitle}</p>
                  <p className="text-sm font-black text-[#0F2342]">{systemConfig.directorateTitle}</p>
                  <p className="text-xs font-black text-[#0D9488]">
                    {branchName || systemConfig.administrationTitle}
                  </p>
                </div>
              </div>

              <div className="text-center space-y-1">
                <h1 className="text-base sm:text-lg font-black text-[#0F2342] underline">
                  التقرير الإحصائي اليومي للمدير العام (الأرغفة المنتجة والمديونيات)
                </h1>
                <p className="text-xs font-bold text-slate-600 font-mono">
                  تاريخ البيان: {reportDate} | النطاق:{' '}
                  {localUnitFilter === 'ALL' ? 'جميع الوحدات المحلية' : localUnitFilter}
                </p>
              </div>

              <div className="text-left text-xs font-bold text-slate-600 space-y-0.5">
                <p>نسبة التشغيل: {summary.operationalRatePercent}%</p>
                <p>نسبة التحصيل: {summary.collectionRatePercent}%</p>
              </div>
            </div>

            {/* 4 Executive Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs font-black text-emerald-900">
                  <span>إجمالي الأرغفة المنتجة يومياً</span>
                  <TrendingUp className="w-4 h-4 text-emerald-700 no-print" />
                </div>
                <p
                  data-testid="daily-summary-total-loaves"
                  className="text-2xl font-black font-mono tabular-nums text-emerald-800 mt-1"
                >
                  {summary.totalDailyLoavesProduced.toLocaleString('en-US')}{' '}
                  <span className="text-xs">رغيف/يوم</span>
                </p>
                <p className="text-[11px] font-bold text-emerald-700 mt-1">
                  فئة 660: {summary.loaves660Count.toLocaleString('en-US')} | فئة 725:{' '}
                  {summary.loaves725Count.toLocaleString('en-US')}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs font-black text-blue-900">
                  <span>الحصة الفعلية والتأمينية (دقيق)</span>
                  <Store className="w-4 h-4 text-blue-700 no-print" />
                </div>
                <p
                  data-testid="daily-summary-actual-quota"
                  className="text-2xl font-black font-mono tabular-nums text-[#0F2342] mt-1"
                >
                  {summary.totalActualQuotaBags.toLocaleString('en-US')}{' '}
                  <span className="text-xs">شيكارة/يوم</span>
                </p>
                <p className="text-[11px] font-bold text-blue-800 mt-1">
                  التأمينية: {summary.totalInsuranceQuotaBags.toLocaleString('en-US')} شيكارة |{' '}
                  {summary.activeBakeries} مخبز يعمل من {summary.totalBakeries}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs font-black text-amber-900">
                  <span>المديونيات المسجلة بتاريخ التقرير</span>
                  <Calendar className="w-4 h-4 text-amber-700 no-print" />
                </div>
                <p
                  data-testid="daily-summary-new-debts"
                  className="text-2xl font-black font-mono tabular-nums text-amber-900 mt-1"
                >
                  {summary.newDebtsOnDateRemainingAmount.toLocaleString('en-US')}{' '}
                  <span className="text-xs">ج.م</span>
                </p>
                <p className="text-[11px] font-bold text-amber-800 mt-1">
                  عدد القيود المسجلة في اليوم: {summary.newDebtsOnDateCount} قيد
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs font-black text-red-900">
                  <span>إجمالي الرصيد المتبقي للمديونيات</span>
                  <Scale className="w-4 h-4 text-red-700 no-print" />
                </div>
                <p
                  data-testid="daily-summary-remaining-debts"
                  className="text-2xl font-black font-mono tabular-nums text-red-800 mt-1"
                >
                  {summary.totalRemainingDebt.toLocaleString('en-US')}{' '}
                  <span className="text-xs">ج.م</span>
                </p>
                <p className="text-[11px] font-bold text-red-700 mt-1">
                  المسدد: {summary.totalPaidDebt.toLocaleString('en-US')} ج.م ({summary.debtorBakeriesCount}{' '}
                  مخبز مدين)
                </p>
              </div>
            </div>

            {/* Demographics & Per-Capita Strip */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-700 no-print" />
                <span>
                  إجمالي السكان (بدون تكرار للوحدة):{' '}
                  <strong className="font-mono text-[#0F2342]">
                    {summary.totalPopulation.toLocaleString('en-US')}
                  </strong>{' '}
                  نسمة
                </span>
              </div>
              <div>
                <span>
                  إجمالي مستفيدي التموين (2025):{' '}
                  <strong className="font-mono text-indigo-800">
                    {summary.totalBeneficiaries2025.toLocaleString('en-US')}
                  </strong>{' '}
                  مستفيد
                </span>
              </div>
              <div>
                <span>
                  متوسط نصيب الفرد اليومي من الأرغفة:{' '}
                  <strong className="font-mono text-emerald-800">
                    {summary.perCapitaLoaves2025}
                  </strong>{' '}
                  رغيف/مستفيد
                </span>
              </div>
            </div>

            {/* Table 1: Local Units Production & Debts Breakdown */}
            <div className="space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-[#0F2342]">
                أولاً: بيان الأرغفة المنتجة يومياً والحصص والمديونيات حسب الوحدة المحلية (
                {summary.unitBreakdown.length} وحدة محلية)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0F2342] text-white font-black">
                      <th className="py-2 px-2.5 text-center">م</th>
                      <th className="py-2 px-2.5">الوحدة المحلية</th>
                      <th className="py-2 px-2.5 text-center">عدد المخابز</th>
                      <th className="py-2 px-2.5 text-center">يعمل / متوقف</th>
                      <th className="py-2 px-2.5 text-center">الحصة التأمينية</th>
                      <th className="py-2 px-2.5 text-center">الحصة الفعلية</th>
                      <th className="py-2 px-2.5 text-center">الأرغفة المنتجة يومياً</th>
                      <th className="py-2 px-2.5 text-center">مستفيدو 2025</th>
                      <th className="py-2 px-2.5 text-center">نصيب الفرد</th>
                      <th className="py-2 px-2.5 text-center">مديونيات اليوم</th>
                      <th className="py-2 px-2.5 text-center">إجمالي المديونية المتبقية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold text-slate-900">
                    {summary.unitBreakdown.map((u, idx) => (
                      <tr key={u.localUnit} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 text-center font-mono">{idx + 1}</td>
                        <td className="py-2 px-2.5 font-black text-[#0F2342]">{u.localUnit}</td>
                        <td className="py-2 px-2.5 text-center font-mono">{u.bakeriesCount}</td>
                        <td className="py-2 px-2.5 text-center font-mono">
                          {u.activeCount} يعمل
                          {u.stoppedCount > 0 ? ` / ${u.stoppedCount} متوقف` : ''}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono">
                          {u.insuranceQuotaBags.toLocaleString('en-US')}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono">
                          {u.actualQuotaBags.toLocaleString('en-US')}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-black text-emerald-800">
                          {u.dailyLoavesProduced.toLocaleString('en-US')}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono">
                          {u.beneficiaries2025.toLocaleString('en-US')}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono">{u.perCapitaLoaves2025}</td>
                        <td className="py-2 px-2.5 text-center font-mono text-amber-800">
                          {u.newDebtsOnDateAmount.toLocaleString('en-US')} ج.م
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono font-black text-rose-700">
                          {u.totalRemainingDebt.toLocaleString('en-US')} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="total-summary-row bg-[#0F2342] text-white font-black">
                      <td colSpan={2} className="py-2.5 px-2.5 text-right">
                        صف الإجماليات TOTAL SUMMARY ({summary.unitBreakdown.length} وحدة)
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.totalBakeries}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.activeBakeries} يعمل / {summary.stoppedBakeries} متوقف
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.totalInsuranceQuotaBags.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.totalActualQuotaBags.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.totalDailyLoavesProduced.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.totalBeneficiaries2025.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.perCapitaLoaves2025}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.newDebtsOnDateRemainingAmount.toLocaleString('en-US')} ج.م
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {summary.totalRemainingDebt.toLocaleString('en-US')} ج.م
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Table 2: Highlighted New / Active Debts */}
            <div className="space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-[#0F2342]">
                ثانياً:{' '}
                {summary.newDebtsOnDateCount > 0
                  ? `بيان المديونيات الجديدة المسجلة بتاريخ (${reportDate}) — (${summary.newDebtsOnDateCount} قيد)`
                  : `بيان أبرز المديونيات الحالية المسجلة للمتابعة اليومية (${summary.highlightedDebts.length} قيد)`}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0F2342] text-white font-black">
                      <th className="py-2 px-2.5 text-center">م</th>
                      <th className="py-2 px-2.5">اسم صاحب المخبز</th>
                      <th className="py-2 px-2.5 text-center">رقم الماكينة</th>
                      <th className="py-2 px-2.5">القرية / الوحدة</th>
                      <th className="py-2 px-2.5 text-center">تاريخ المخالفة</th>
                      <th className="py-2 px-2.5">نوع المخالفة / المديونية</th>
                      <th className="py-2 px-2.5 text-center">إجمالي المديونية</th>
                      <th className="py-2 px-2.5 text-center">المسدد</th>
                      <th className="py-2 px-2.5 text-center">صافي المتبقي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold text-slate-900">
                    {summary.highlightedDebts.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-emerald-700 font-black">
                          <CheckCircle2 className="w-5 h-5 inline-block ml-1" />
                          لا توجد مديونيات مسجلة على المخابز في النطاق المحدد
                        </td>
                      </tr>
                    ) : (
                      summary.highlightedDebts.map((d, idx) => (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 text-center font-mono">{idx + 1}</td>
                          <td className="py-2 px-2.5 font-black text-[#0F2342]">
                            {d.bakeryOwnerName}
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono">{d.machineNumber}</td>
                          <td className="py-2 px-2.5">
                            {d.village} ({d.localUnit})
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono">{d.violationDate}</td>
                          <td className="py-2 px-2.5">{d.violationType}</td>
                          <td className="py-2 px-2.5 text-center font-mono">
                            {d.grossAmount.toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono text-emerald-700">
                            {d.paidAmount.toLocaleString('en-US')} ج.م
                          </td>
                          <td className="py-2 px-2.5 text-center font-mono font-black text-rose-700">
                            {d.netRemainingDebt.toLocaleString('en-US')} ج.م
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {summary.highlightedDebts.length > 0 && (
                    <tfoot>
                      <tr className="total-summary-row bg-[#0F2342] text-white font-black">
                        <td colSpan={6} className="py-2.5 px-2.5 text-right">
                          صف الإجماليات TOTAL SUMMARY ({summary.highlightedDebts.length} قيد)
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono">
                          {summary.highlightedDebts
                            .reduce((s, x) => s + x.grossAmount, 0)
                            .toLocaleString('en-US')}{' '}
                          ج.م
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono">
                          {summary.highlightedDebts
                            .reduce((s, x) => s + x.paidAmount, 0)
                            .toLocaleString('en-US')}{' '}
                          ج.م
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono">
                          {summary.highlightedDebts
                            .reduce((s, x) => s + x.netRemainingDebt, 0)
                            .toLocaleString('en-US')}{' '}
                          ج.م
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Official Signature Footer */}
            <div className="pt-4 border-t border-dashed border-slate-400 grid grid-cols-3 gap-4 text-center text-xs font-black text-slate-800">
              <div>
                <p>مُعد التقرير اليومي</p>
                <p className="mt-5 text-slate-500">............................</p>
              </div>
              <div>
                <p>رئيس قسم الرقابة التموينية</p>
                <p className="mt-5 text-slate-500">............................</p>
              </div>
              <div>
                <p>يعتمد،، المدير العام</p>
                <p className="mt-5 text-slate-500">............................</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
