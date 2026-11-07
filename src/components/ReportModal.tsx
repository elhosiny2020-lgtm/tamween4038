import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Bakery, DebtRecord, VillageHierarchy, ColumnTitles, SystemConfig, AppUser } from '../types';
import { sanitizeClonedDocumentForPdf, sanitizeLiveStylesheets } from '../utils/pdfHelper';
import {
  X,
  FileSpreadsheet,
  Printer,
  Download,
  FileText,
  SlidersHorizontal,
  DollarSign,
  AlertTriangle,
  Building2,
  Calendar,
  Layers
} from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  columnTitles: ColumnTitles;
  systemConfig: SystemConfig;
  currentUser?: AppUser | null;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  bakeries,
  debts,
  villages,
  columnTitles,
  systemConfig,
  currentUser,
}) => {
  // Report Mode: 'bakeries' (General Bakery registry) or 'debts' (Detailed Debt Account Statement)
  const [reportType, setReportType] = useState<'bakeries' | 'debts'>('bakeries');
  const [selectedVillage, setSelectedVillage] = useState('ALL');
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedActivity, setSelectedActivity] = useState('ALL');
  const [debtFilterStatus, setDebtFilterStatus] = useState<'ALL' | 'OVER_20K' | 'UNPAID' | 'PAID'>('ALL');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 100%, 85%, 75%
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  // Manage print isolation class on body
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('has-print-modal');
    } else {
      document.body.classList.remove('has-print-modal');
    }
    return () => {
      document.body.classList.remove('has-print-modal');
    };
  }, [isOpen]);

  // Available Local units for selected village
  const currentUnits = useMemo(() => {
    if (selectedVillage === 'ALL') {
      const all: string[] = [];
      villages.forEach((v) => {
        v.localUnits.forEach((u) => {
          if (!all.includes(u)) all.push(u);
        });
      });
      return all;
    }
    return villages.find((v) => v.village === selectedVillage)?.localUnits || [];
  }, [selectedVillage, villages]);

  // Column Selector State for Bakeries Report - All 30 columns enabled by default
  const [activeColumns, setActiveColumns] = useState<Record<string, boolean>>({
    index: true,
    bakeryOwnerName: true,
    machineNumber: true,
    village: true,
    localUnit: true,
    remainingDebt: true,
    insuranceQuota: true,
    actualQuota: true,
    insuranceValue: true,
    loavesCount: true,
    villagePopulation: true,
    perCapitaAverage: true,
    beneficiaries2023: true,
    avg2023: true,
    beneficiaries2024: true,
    avg2024: true,
    beneficiaries2025: true,
    avg2025: true,
    avgDiff: true,
    activityStatus: true,
    breadType: true,
    breadTypeCount: true,
    lineType: true,
    fuelType: true,
    phone: true,
    nationalId: true,
    commercialRegDate: true,
    bakeryLicenseDate: true,
    leaseAgreementDate: true,
    taxCardDate: true,
  });

  // Calculate bakery debt mapping
  const bakeryDebtMap = useMemo(() => {
    const map: Record<string, number> = {};
    debts.forEach((d) => {
      map[d.bakeryId] = (map[d.bakeryId] || 0) + (d.netRemainingDebt || 0);
    });
    return map;
  }, [debts]);

  // Dynamic Title Construction
  const dynamicReportTitle = useMemo(() => {
    const locationSuffix =
      selectedVillage === 'ALL'
        ? 'لكافة قرى ووحدات مركز المحلة الكبرى'
        : selectedUnit !== 'ALL'
        ? `لقرية ${selectedVillage} - وحدة ${selectedUnit}`
        : `لقرية ${selectedVillage} ووحداتها المحلية`;

    if (reportType === 'debts') {
      if (debtFilterStatus === 'OVER_20K') {
        return `كشف حساب المديونيات الكبرى التي تتجاوز 20,000 ج.م والمطالبة بدفعات أسبوعية ${locationSuffix}`;
      }
      return `كشف حساب تفصيلي لمديونيات ومخالفات المخابز البلدية ${locationSuffix}`;
    }

    return `كشف حصر وتشغيل المخابز البلدية والحصص التموينية ${locationSuffix}`;
  }, [reportType, selectedVillage, selectedUnit, debtFilterStatus]);

  // Filtered bakeries for bakeries report
  const filteredBakeries = useMemo(() => {
    return bakeries.filter((b) => {
      if (selectedVillage !== 'ALL' && b.village !== selectedVillage) return false;
      if (selectedUnit !== 'ALL' && b.localUnit !== selectedUnit) return false;
      if (selectedActivity !== 'ALL' && b.activityStatus !== selectedActivity) return false;
      return true;
    });
  }, [bakeries, selectedVillage, selectedUnit, selectedActivity]);

  // Filtered debts for detailed debt report
  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (selectedVillage !== 'ALL' && d.village !== selectedVillage) return false;
      if (selectedUnit !== 'ALL' && d.localUnit !== selectedUnit) return false;

      const bakeryTotalDebt = bakeryDebtMap[d.bakeryId] || 0;
      if (debtFilterStatus === 'OVER_20K') {
        if (bakeryTotalDebt <= 20000 && d.netRemainingDebt <= 20000) return false;
      } else if (debtFilterStatus === 'UNPAID') {
        if (d.netRemainingDebt <= 0) return false;
      } else if (debtFilterStatus === 'PAID') {
        if (d.netRemainingDebt > 0) return false;
      }
      return true;
    });
  }, [debts, selectedVillage, selectedUnit, debtFilterStatus, bakeryDebtMap]);

  // Summary totals for bakeries report
  const reportTotals = useMemo(() => {
    let totalInsurance = 0;
    let totalActual = 0;
    let totalLoaves = 0;
    let totalDebt = 0;
    filteredBakeries.forEach((b) => {
      totalInsurance += b.insuranceQuota || 0;
      totalActual += b.actualQuota || 0;
      totalLoaves += b.loavesCount || 0;
      totalDebt += bakeryDebtMap[b.id] || 0;
    });
    return { totalInsurance, totalActual, totalLoaves, totalDebt };
  }, [filteredBakeries, bakeryDebtMap]);

  // Summary totals for detailed debts report
  const debtReportTotals = useMemo(() => {
    let sumTotalViolations = 0;
    let sumPaidViolations = 0;
    let sumAdded = 0;
    let sumPaidAdded = 0;
    let sumDisposal = 0;
    let sumPaidDisposal = 0;
    let sumNetRemaining = 0;
    let over20kCount = 0;

    const seenBakeries = new Set<string>();
    filteredDebts.forEach((d) => {
      sumTotalViolations += d.totalViolations || 0;
      sumPaidViolations += d.paidViolationAmount || 0;
      sumAdded += d.addedAmount || 0;
      sumPaidAdded += d.paidAddedAmount || 0;
      sumDisposal += d.disposalValue || 0;
      sumPaidDisposal += d.paidDisposalAmount || 0;
      sumNetRemaining += d.netRemainingDebt || 0;

      if (!seenBakeries.has(d.bakeryId)) {
        seenBakeries.add(d.bakeryId);
        if ((bakeryDebtMap[d.bakeryId] || 0) > 20000) {
          over20kCount++;
        }
      }
    });

    return {
      sumTotalViolations,
      sumPaidViolations,
      sumAdded,
      sumPaidAdded,
      sumDisposal,
      sumPaidDisposal,
      sumNetRemaining,
      over20kCount,
    };
  }, [filteredDebts, bakeryDebtMap]);

  if (!isOpen) return null;

  const toggleColumn = (key: string) => {
    setActiveColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllColumns = () => {
    const allTrue: Record<string, boolean> = {};
    Object.keys(activeColumns).forEach((k) => (allTrue[k] = true));
    setActiveColumns(allTrue);
  };

  const deselectAllColumns = () => {
    // Keep at least index and bakeryOwnerName so the report remains valid
    const allFalse: Record<string, boolean> = {};
    Object.keys(activeColumns).forEach((k) => (allFalse[k] = false));
    allFalse.index = true;
    allFalse.bakeryOwnerName = true;
    setActiveColumns(allFalse);
  };

  const resetDefaultColumns = () => {
    const allTrue: Record<string, boolean> = {};
    Object.keys(activeColumns).forEach((k) => (allTrue[k] = true));
    setActiveColumns(allTrue);
  };

  // Instant HTML2PDF Download in Landscape A4
  const handleDownloadPdf = () => {
    if (!printAreaRef.current) return;
    setIsGeneratingPdf(true);

    sanitizeLiveStylesheets();

    const element = printAreaRef.current;
    const opt = {
      margin: [4, 4, 4, 4],
      filename: `${dynamicReportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1680,
        onclone: (clonedDoc: Document) => {
          sanitizeClonedDocumentForPdf(clonedDoc);
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    };

    const win = window as unknown as { html2pdf?: () => { from: (el: HTMLElement) => { set: (o: typeof opt) => { save: () => Promise<void> } } } };
    if (typeof win.html2pdf === 'function') {
      win
        .html2pdf()
        .from(element)
        .set(opt)
        .save()
        .then(() => setIsGeneratingPdf(false))
        .catch((err: Error) => {
          console.error(err);
          setIsGeneratingPdf(false);
          window.print();
        });
    } else {
      setIsGeneratingPdf(false);
      window.print();
    }
  };

  const handlePrint = () => {
    // Reset zoom to 100% before print to guarantee 1:1 scale
    setZoomLevel(100);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Export Report to CSV with UTF-8 BOM
  const handleExportCSV = () => {
    if (reportType === 'debts') {
      const headers = [
        'م',
        'اسم صاحب المخبز',
        'رقم الماكينة',
        'القرية',
        'الوحدة المحلية',
        'تاريخ المحضر',
        'الجهة المحررة',
        'نوع المخالفة',
        'إجمالي المخالفات (ج.م)',
        'المسدد من المخالفات (ج.م)',
        'المتبقي من المخالفات (ج.م)',
        'المضاف (ج.م)',
        'المسدد من المضاف (ج.م)',
        'المتبقي من المضاف (ج.م)',
        'قيمة التصرف (ج.م)',
        'المسدد من التصرف (ج.م)',
        'المتبقي من التصرف (ج.م)',
        'صافي المديونية المتبقية (ج.م)',
        'حالة المديونية والتنبيه الأسبوعي',
      ];

      const rows = filteredDebts.map((d, idx) => {
        const totalBakeryDebt = bakeryDebtMap[d.bakeryId] || 0;
        const isOver20k = totalBakeryDebt > 20000;
        const status = isOver20k
          ? 'تتجاوز 20 ألف - يلزم التنبيه أسبوعياً بجدول دفعات'
          : d.netRemainingDebt > 0
          ? 'مستحقة السداد'
          : 'خالصة السداد';

        return [
          idx + 1,
          `"${d.bakeryOwnerName || ''}"`,
          `"${d.machineNumber || ''}"`,
          `"${d.village || ''}"`,
          `"${d.localUnit || ''}"`,
          `"${d.violationDate || ''}"`,
          `"${d.issuingEntity || ''}"`,
          `"${d.violationType || ''}"`,
          d.totalViolations || 0,
          d.paidViolationAmount || 0,
          d.remainingViolations || 0,
          d.addedAmount || 0,
          d.paidAddedAmount || 0,
          d.remainingAdded || 0,
          d.disposalValue || 0,
          d.paidDisposalAmount || 0,
          d.remainingDisposal || 0,
          d.netRemainingDebt || 0,
          `"${status}"`,
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `كشف_حساب_المديونيات_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Bakeries CSV
    const headers: string[] = [];
    if (activeColumns.index) headers.push(columnTitles.index);
    if (activeColumns.bakeryOwnerName) headers.push(columnTitles.bakeryOwnerName);
    if (activeColumns.machineNumber) headers.push(columnTitles.machineNumber);
    if (activeColumns.village) headers.push(columnTitles.village);
    if (activeColumns.localUnit) headers.push(columnTitles.localUnit);
    if (activeColumns.remainingDebt) headers.push(columnTitles.remainingDebt);
    if (activeColumns.insuranceQuota) headers.push(columnTitles.insuranceQuota);
    if (activeColumns.actualQuota) headers.push(columnTitles.actualQuota);
    if (activeColumns.insuranceValue) headers.push(columnTitles.insuranceValue);
    if (activeColumns.loavesCount) headers.push(columnTitles.loavesCount);
    if (activeColumns.villagePopulation) headers.push(columnTitles.villagePopulation);
    if (activeColumns.perCapitaAverage) headers.push(columnTitles.perCapitaAverage);
    if (activeColumns.beneficiaries2023) headers.push(columnTitles.beneficiaries2023);
    if (activeColumns.avg2023) headers.push(columnTitles.avg2023);
    if (activeColumns.beneficiaries2024) headers.push(columnTitles.beneficiaries2024);
    if (activeColumns.avg2024) headers.push(columnTitles.avg2024);
    if (activeColumns.beneficiaries2025) headers.push(columnTitles.beneficiaries2025);
    if (activeColumns.avg2025) headers.push(columnTitles.avg2025);
    if (activeColumns.avgDiff) headers.push(columnTitles.avgDiff);
    if (activeColumns.activityStatus) headers.push(columnTitles.activityStatus);
    if (activeColumns.breadType) headers.push(columnTitles.breadType);
    if (activeColumns.breadTypeCount) headers.push(columnTitles.breadTypeCount);
    if (activeColumns.lineType) headers.push(columnTitles.lineType);
    if (activeColumns.fuelType) headers.push(columnTitles.fuelType);
    if (activeColumns.phone) headers.push(columnTitles.phone);
    if (activeColumns.nationalId) headers.push(columnTitles.nationalId);
    if (activeColumns.commercialRegDate) headers.push(columnTitles.commercialRegDate);
    if (activeColumns.bakeryLicenseDate) headers.push(columnTitles.bakeryLicenseDate);
    if (activeColumns.leaseAgreementDate) headers.push(columnTitles.leaseAgreementDate);
    if (activeColumns.taxCardDate) headers.push(columnTitles.taxCardDate);

    const rows = filteredBakeries.map((b, idx) => {
      const row: (string | number)[] = [];
      const debtVal = bakeryDebtMap[b.id] || 0;
      if (activeColumns.index) row.push(idx + 1);
      if (activeColumns.bakeryOwnerName) row.push(`"${b.bakeryOwnerName || ''}"`);
      if (activeColumns.machineNumber) row.push(`"${b.machineNumber || ''}"`);
      if (activeColumns.village) row.push(`"${b.village || ''}"`);
      if (activeColumns.localUnit) row.push(`"${b.localUnit || ''}"`);
      if (activeColumns.remainingDebt) row.push(debtVal);
      if (activeColumns.insuranceQuota) row.push(b.insuranceQuota || 0);
      if (activeColumns.actualQuota) row.push(b.actualQuota || 0);
      if (activeColumns.insuranceValue) row.push(b.insuranceValue || 0);
      if (activeColumns.loavesCount) row.push(b.loavesCount || 0);
      if (activeColumns.villagePopulation) row.push(b.villagePopulation || 0);
      if (activeColumns.perCapitaAverage) row.push(b.perCapitaAverage || 0);
      if (activeColumns.beneficiaries2023) row.push(b.beneficiaries2023 || 0);
      if (activeColumns.avg2023) row.push(b.avg2023 || 0);
      if (activeColumns.beneficiaries2024) row.push(b.beneficiaries2024 || 0);
      if (activeColumns.avg2024) row.push(b.avg2024 || 0);
      if (activeColumns.beneficiaries2025) row.push(b.beneficiaries2025 || 0);
      if (activeColumns.avg2025) row.push(b.avg2025 || 0);
      if (activeColumns.avgDiff) row.push(b.avgDiff || 0);
      if (activeColumns.activityStatus) row.push(`"${b.activityStatus || ''}"`);
      if (activeColumns.breadType) row.push(`"${b.breadType || ''}"`);
      if (activeColumns.breadTypeCount) row.push(b.breadTypeCount || 0);
      if (activeColumns.lineType) row.push(`"${b.lineType || ''}"`);
      if (activeColumns.fuelType) row.push(`"${b.fuelType || ''}"`);
      if (activeColumns.phone) row.push(`"\t${b.phone || ''}"`);
      if (activeColumns.nationalId) row.push(`"\t${b.nationalId || ''}"`);
      if (activeColumns.commercialRegDate) row.push(`"${b.commercialRegDate || ''}"`);
      if (activeColumns.bakeryLicenseDate) row.push(`"${b.bakeryLicenseDate || ''}"`);
      if (activeColumns.leaseAgreementDate) row.push(`"${b.leaseAgreementDate || ''}"`);
      if (activeColumns.taxCardDate) row.push(`"${b.taxCardDate || ''}"`);
      return row.join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dynamicReportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Grouped column spans for bakeries table
  const basicInfoSpan =
    (activeColumns.index ? 1 : 0) +
    (activeColumns.bakeryOwnerName ? 1 : 0) +
    (activeColumns.machineNumber ? 1 : 0) +
    (activeColumns.village ? 1 : 0) +
    (activeColumns.localUnit ? 1 : 0);

  const debtsSpan = activeColumns.remainingDebt ? 1 : 0;

  const quotasSpan =
    (activeColumns.insuranceQuota ? 1 : 0) +
    (activeColumns.actualQuota ? 1 : 0) +
    (activeColumns.insuranceValue ? 1 : 0) +
    (activeColumns.loavesCount ? 1 : 0);

  const populationSpan =
    (activeColumns.villagePopulation ? 1 : 0) +
    (activeColumns.perCapitaAverage ? 1 : 0) +
    (activeColumns.beneficiaries2023 ? 1 : 0) +
    (activeColumns.avg2023 ? 1 : 0) +
    (activeColumns.beneficiaries2024 ? 1 : 0) +
    (activeColumns.avg2024 ? 1 : 0) +
    (activeColumns.beneficiaries2025 ? 1 : 0) +
    (activeColumns.avg2025 ? 1 : 0) +
    (activeColumns.avgDiff ? 1 : 0);

  const specsSpan =
    (activeColumns.activityStatus ? 1 : 0) +
    (activeColumns.breadType ? 1 : 0) +
    (activeColumns.breadTypeCount ? 1 : 0) +
    (activeColumns.lineType ? 1 : 0) +
    (activeColumns.fuelType ? 1 : 0);

  const contactSpan =
    (activeColumns.phone ? 1 : 0) +
    (activeColumns.nationalId ? 1 : 0);

  const licenseSpan =
    (activeColumns.commercialRegDate ? 1 : 0) +
    (activeColumns.bakeryLicenseDate ? 1 : 0) +
    (activeColumns.leaseAgreementDate ? 1 : 0) +
    (activeColumns.taxCardDate ? 1 : 0);

  return (
    <div className="report-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="report-modal-dialog bg-white rounded-2xl shadow-2xl border-2 border-amber-600/40 w-[98vw] max-w-[1720px] my-2 flex flex-col max-h-[96vh] overflow-hidden">
        {/* Modal Top Controls (No-print) */}
        <div className="bg-gradient-to-r from-slate-950 via-amber-950 to-slate-950 p-3 sm:p-4 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 p-0.5 rounded-xl bg-white border border-amber-400/80 shadow-md flex items-center justify-center shrink-0">
              <img
                src={systemConfig.logoBase64}
                alt="شعار التموين"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black">مركز كشوف وتقارير المخابز البلدية والمديونيات</h3>
                <span className="px-2 py-0.5 bg-amber-500 text-slate-950 rounded text-[10px] font-black">
                  طباعة A4 بالعرض (Landscape)
                </span>
              </div>
              <p className="text-[11px] text-amber-100 font-bold">
                {dynamicReportTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Screen Zoom Control */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg p-0.5 text-xs">
              <span className="px-2 text-[10px] text-slate-300 font-bold">معاينة:</span>
              <button
                type="button"
                onClick={() => setZoomLevel(75)}
                className={`px-2 py-1 rounded text-[10px] font-black transition ${
                  zoomLevel === 75 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
                title="تصغير 75% لرؤية كافة الأعمدة"
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(85)}
                className={`px-2 py-1 rounded text-[10px] font-black transition ${
                  zoomLevel === 85 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
                title="ملاءمة الشاشة 85%"
              >
                85%
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className={`px-2 py-1 rounded text-[10px] font-black transition ${
                  zoomLevel === 100 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
                title="العرض الطبيعي 100%"
              >
                100%
              </button>
            </div>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black shadow-sm transition"
              title="تصدير كشف إكسيل متكامل بترميز عربي UTF-8"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير Excel
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-xs font-black shadow-sm transition"
              title="تنزيل ملف PDF فوري بعرض الصفحة A4"
            >
              <Download className="w-4 h-4" />
              {isGeneratingPdf ? 'جاري إنشاء PDF...' : 'تنزيل PDF'}
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-lg text-xs font-black shadow-md transition transform active:scale-95"
              title="طباعة فورية لكامل الصفحة بعرض ورق A4 Landscape"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>طباعة فورية A4 بالعرض</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher: General Bakeries vs Detailed Debts Statement (No-print) */}
        <div className="bg-slate-900 border-b border-amber-600/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 no-print shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReportType('bakeries')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
                reportType === 'bakeries'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              كشف حصر المخابز والحصص التموينية ({filteredBakeries.length} مخبز)
            </button>

            <button
              type="button"
              onClick={() => setReportType('debts')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
                reportType === 'debts'
                  ? 'bg-red-600 text-white shadow-md font-black'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <DollarSign className="w-4 h-4 text-amber-300" />
              كشف حساب المديونيات والمخالفات التفصيلي ({filteredDebts.length} قيد)
              {debtReportTotals.over20kCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-400 text-slate-950 rounded text-[10px] font-black animate-pulse">
                  {debtReportTotals.over20kCount} كبرى &gt; 20 ألف
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] font-bold text-amber-200">
            {reportType === 'debts'
              ? `إجمالي صافي المديونيات بالكشف: ${debtReportTotals.sumNetRemaining.toLocaleString()} ج.م`
              : `إجمالي الحصة التأمينية: ${reportTotals.totalInsurance.toLocaleString()} شيكارة`}
          </div>
        </div>

        {/* Toolbar: Filters & Customizer (No-print) */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2.5 no-print shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">القرية</label>
              <select
                value={selectedVillage}
                onChange={(e) => {
                  setSelectedVillage(e.target.value);
                  setSelectedUnit('ALL');
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black focus:ring-1 focus:ring-amber-500"
              >
                <option value="ALL">كافة القرى (تقرير شامل لكامل المركز)</option>
                {villages.map((v) => (
                  <option key={v.village} value={v.village}>
                    {v.village}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-700 mb-1">
                الوحدة المحلية التابعة
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black focus:ring-1 focus:ring-amber-500"
              >
                <option value="ALL">
                  {selectedVillage === 'ALL'
                    ? 'كافة الوحدات المحلية بالمركز'
                    : `كافة وحدات قرية ${selectedVillage}`}
                </option>
                {selectedVillage === 'ALL'
                  ? villages.map((v) => (
                      <optgroup key={v.village} label={`قرية ${v.village}`}>
                        {v.localUnits.map((u) => (
                          <option key={`${v.village}-${u}`} value={u}>
                            {u} ({v.village})
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : currentUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
              </select>
            </div>

            {reportType === 'bakeries' ? (
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">حالة نشاط المخبز</label>
                <select
                  value={selectedActivity}
                  onChange={(e) => setSelectedActivity(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black focus:ring-1 focus:ring-amber-500"
                >
                  <option value="ALL">كافة الحالات</option>
                  <option value="شغال">شغال</option>
                  <option value="متوقف جزئي">متوقف جزئي</option>
                  <option value="متوقف كلي">متوقف كلي</option>
                  <option value="ملغى">ملغى</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  تصفية كشف المديونيات
                </label>
                <select
                  value={debtFilterStatus}
                  onChange={(e) => setDebtFilterStatus(e.target.value as 'ALL' | 'OVER_20K' | 'UNPAID' | 'PAID')}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-red-950 focus:ring-1 focus:ring-red-500"
                >
                  <option value="ALL">كافة المديونيات والمخالفات</option>
                  <option value="OVER_20K">⚠️ المديونيات الكبرى (&gt; 20,000 ج.م) - تنبيه أسبوعي</option>
                  <option value="UNPAID">المديونيات المتبقية المستحقة فقط (&gt; 0 ج.م)</option>
                  <option value="PAID">المديونيات المسددة بالكامل (خالصة)</option>
                </select>
              </div>
            )}
          </div>

          {/* Column Checklist Accordion for Bakeries */}
          {reportType === 'bakeries' && (
            <details className="bg-white border border-slate-200 rounded-xl p-2.5 text-xs">
              <summary className="font-black text-slate-800 cursor-pointer flex items-center justify-between select-none">
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-amber-700" />
                  تخصيص وإخفاء/إظهار أعمدة التقرير ({Object.values(activeColumns).filter(Boolean).length} من 30 عمود مفعل)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      selectAllColumns();
                    }}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black shadow-xs transition cursor-pointer"
                  >
                    ✓ تحديد الكل (30 عمود)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      deselectAllColumns();
                    }}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-black shadow-xs transition cursor-pointer"
                  >
                    ✕ إلغاء الكل
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      resetDefaultColumns();
                    }}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[10px] font-black transition cursor-pointer"
                  >
                    استعادة الافتراضي
                  </button>
                </div>
              </summary>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3 pt-2 border-t border-slate-100">
                {Object.keys(activeColumns).map((colKey) => (
                  <label
                    key={colKey}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer hover:text-amber-900"
                  >
                    <input
                      type="checkbox"
                      checked={activeColumns[colKey]}
                      onChange={() => toggleColumn(colKey)}
                      className="accent-amber-600 rounded"
                    />
                    <span>{(columnTitles as unknown as Record<string, string>)[colKey] || colKey}</span>
                  </label>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Printable Sheet View - Full Landscape Canvas */}
        <div className="report-scroll-wrapper flex-1 overflow-x-auto overflow-y-auto p-2 sm:p-4 bg-slate-300/80 print:bg-white print:p-0 print:overflow-visible">
          <div
            style={{
              zoom: `${zoomLevel}%`,
              minWidth: '1350px',
            }}
            className="report-zoom-wrapper w-full transition-all duration-150"
          >
            <div
              ref={printAreaRef}
              className="print-container bg-white p-4 sm:p-6 mx-auto rounded-xl shadow-lg border border-slate-300 print:border-none print:shadow-none print:p-2 print:m-0 w-full"
            >
              {/* OFFICIAL GOVERNMENTAL HEADER */}
              <div className="border-b-2 border-black pb-3 mb-3">
                <div className="flex items-center justify-between">
                  {/* Right: Ministry & Directorate Hierarchy */}
                  <div className="text-right">
                    <h3 className="text-xs font-black text-slate-900 leading-tight">جمهورية مصر العربية</h3>
                    <h3 className="text-xs font-black text-slate-900 leading-tight">{systemConfig.governorateTitle}</h3>
                    <h4 className="text-xs font-black text-slate-800 leading-tight">{systemConfig.directorateTitle}</h4>
                    <h4 className="text-xs font-black text-amber-900 leading-tight">{systemConfig.administrationTitle}</h4>
                  </div>

                  {/* Center: Official Emblem */}
                  <div className="text-center">
                    <div className="w-14 h-14 mx-auto p-1 border border-amber-600 rounded-full bg-white flex items-center justify-center">
                      <img
                        src={systemConfig.logoBase64}
                        alt="شعار وزارة التموين"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[9px] font-black text-slate-800 mt-1">
                      {systemConfig.englishSubtitle}
                    </p>
                  </div>

                  {/* Left: Metadata, Date & Author */}
                  <div className="text-left font-mono text-[10px] text-slate-800 space-y-0.5">
                    <p className="font-bold">
                      {reportType === 'debts' ? 'كشف حساب المديونيات والمخالفات' : 'كشف حصر وتشغيل المخابز البلدية'}
                    </p>
                    <p>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
                    <p>
                      {reportType === 'debts'
                        ? `إجمالي القيود: ${filteredDebts.length}`
                        : `إجمالي المخابز: ${filteredBakeries.length}`}
                    </p>
                    <p className="font-black text-amber-950 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-300 inline-block text-[11px] mt-0.5">
                      أعده: {currentUser?.fullName || 'أحمد الحسيني'}
                    </p>
                  </div>
                </div>

                {/* Dynamic Centered Report Title */}
                <div className="text-center mt-2 pt-2 border-t border-slate-300">
                  <h1 className="text-sm sm:text-base font-black text-slate-900 underline underline-offset-4 tracking-wide">
                    {dynamicReportTitle}
                  </h1>
                </div>
              </div>

              {/* REPORT BODY ACCORDING TO SELECTED TAB */}
              {reportType === 'debts' ? (
                /* DETAILED DEBTS ACCOUNT STATEMENT TABLE */
                <div className="w-full overflow-visible space-y-3">
                  {/* Urgent Alert Banner on Printout for Over 20k */}
                  {debtReportTotals.over20kCount > 0 && (
                    <div className="bg-red-100 border-2 border-red-600 p-2 rounded text-center text-xs font-black text-red-950">
                      تنبيه وإخطار تمويني مشدد: المديونيات المعلمة باللون الأحمر تتجاوز 20,000 ج.م ويُلزم أصحابها قانوناً بجدول دفعات أسبوعية ومتابعة تحصيل دورية!
                    </div>
                  )}

                  <table className="report-table-compact w-full text-center border-collapse text-[7.5px] print:text-[7pt] border border-black leading-tight table-fixed">
                    {/* Proportional column percentage widths summing to 100% */}
                    <colgroup>
                      <col style={{ width: '2.5%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '5.5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '6.5%' }} />
                      <col style={{ width: '8.5%' }} />
                      <col style={{ width: '5.5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5.5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '5%' }} />
                      <col style={{ width: '6.5%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>

                    <thead>
                      {/* Top Grouped Header */}
                      <tr className="bg-slate-900 text-white font-black border border-black text-[8px] print:text-[7.5pt]">
                        <th colSpan={5} className="border border-black py-1 px-1 bg-slate-900 text-amber-200">
                          البيانات الأساسية وموقع المخبز
                        </th>
                        <th colSpan={3} className="border border-black py-1 px-1 bg-slate-800 text-slate-100">
                          بيانات المحضر والمخالفة
                        </th>
                        <th colSpan={3} className="border border-black py-1 px-1 bg-amber-950 text-amber-200">
                          مخالفات المخبز وسدادها
                        </th>
                        <th colSpan={3} className="border border-black py-1 px-1 bg-cyan-950 text-cyan-200">
                          المنصرف والمضاف وسداده
                        </th>
                        <th colSpan={3} className="border border-black py-1 px-1 bg-purple-950 text-purple-200">
                          التصرف وسداده
                        </th>
                        <th colSpan={2} className="border border-black py-1 px-1 bg-red-950 text-white">
                          صافي المديونية والتنبيه الأسبوعي
                        </th>
                      </tr>

                      {/* Sub Headers */}
                      <tr className="bg-slate-800 text-white font-black border-b border-black text-[7.5px] print:text-[6.8pt]">
                        <th className="border border-black py-1 px-0.5">م</th>
                        <th className="border border-black py-1 px-1">اسم صاحب المخبز</th>
                        <th className="border border-black py-1 px-0.5">رقم الماكينة</th>
                        <th className="border border-black py-1 px-0.5">القرية</th>
                        <th className="border border-black py-1 px-0.5">الوحدة المحلية</th>
                        <th className="border border-black py-1 px-0.5">تاريخ المحضر</th>
                        <th className="border border-black py-1 px-0.5">الجهة المحررة</th>
                        <th className="border border-black py-1 px-0.5">نوع المخالفة</th>
                        <th className="border border-black py-1 px-0.5">إجمالي المخالفات</th>
                        <th className="border border-black py-1 px-0.5">المسدد</th>
                        <th className="border border-black py-1 px-0.5">المتبقي</th>
                        <th className="border border-black py-1 px-0.5">المضاف</th>
                        <th className="border border-black py-1 px-0.5">المسدد</th>
                        <th className="border border-black py-1 px-0.5">المتبقي</th>
                        <th className="border border-black py-1 px-0.5">قيمة التصرف</th>
                        <th className="border border-black py-1 px-0.5">المسدد</th>
                        <th className="border border-black py-1 px-0.5">المتبقي</th>
                        <th className="border border-black py-1 px-0.5 bg-red-900 text-white">صافي المتبقي</th>
                        <th className="border border-black py-1 px-0.5 bg-red-950 text-amber-300">موقف المطالبة</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-black font-bold">
                      {filteredDebts.map((d, idx) => {
                        const totalBakeryDebt = bakeryDebtMap[d.bakeryId] || 0;
                        const isOver20k = totalBakeryDebt > 20000;

                        return (
                          <tr
                            key={d.id}
                            className={
                              isOver20k
                                ? 'bg-red-50/80 text-red-950 font-black'
                                : idx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50 print:bg-slate-100/60'
                            }
                          >
                            <td className="border border-black py-1 px-0.5 num-enlarged">{idx + 1}</td>
                            <td className="border border-black py-1 px-1 font-black text-right truncate" title={d.bakeryOwnerName}>
                              {d.bakeryOwnerName}
                            </td>
                            <td className="border border-black py-1 px-0.5 num-enlarged font-black">{d.machineNumber}</td>
                            <td className="border border-black py-1 px-0.5">{d.village}</td>
                            <td className="border border-black py-1 px-0.5">{d.localUnit}</td>
                            <td className="border border-black py-1 px-0.5 font-mono text-[7pt]">{d.violationDate}</td>
                            <td className="border border-black py-1 px-0.5">{d.issuingEntity}</td>
                            <td className="border border-black py-1 px-0.5">{d.violationType}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged">{d.totalViolations?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged text-emerald-800">{d.paidViolationAmount?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged">{d.remainingViolations?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged">{d.addedAmount?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged text-emerald-800">{d.paidAddedAmount?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged">{d.remainingAdded?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged">{d.disposalValue?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged text-emerald-800">{d.paidDisposalAmount?.toLocaleString()}</td>
                            <td className="border border-black py-1 px-0.5 num-enlarged">{d.remainingDisposal?.toLocaleString()}</td>
                            <td
                              className={`border border-black py-1 px-0.5 num-enlarged font-black ${
                                d.netRemainingDebt > 0 ? 'text-red-700 bg-red-100/50' : 'text-emerald-700'
                              }`}
                            >
                              {d.netRemainingDebt > 0 ? `${d.netRemainingDebt.toLocaleString()} ج.م` : 'خالص'}
                            </td>
                            <td className="border border-black py-1 px-0.5 text-[6.8pt]">
                              {isOver20k ? (
                                <span className="text-red-900 font-black block">
                                  ⚠️ &gt; 20 ألف (مطالب بدفعات أسبوعية)
                                </span>
                              ) : d.netRemainingDebt > 0 ? (
                                <span className="text-amber-900 font-bold">مستحق السداد</span>
                              ) : (
                                <span className="text-emerald-800 font-bold">خالص السداد</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="bg-slate-200 font-black border-t-2 border-black text-[8px] print:text-[7pt]">
                        <td colSpan={8} className="border border-black py-1.5 px-2 text-right">
                          إجمالي كشف حساب المديونيات ({filteredDebts.length} قيد)
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged">
                          {debtReportTotals.sumTotalViolations.toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged text-emerald-900">
                          {debtReportTotals.sumPaidViolations.toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged">
                          {(debtReportTotals.sumTotalViolations - debtReportTotals.sumPaidViolations).toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged">
                          {debtReportTotals.sumAdded.toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged text-emerald-900">
                          {debtReportTotals.sumPaidAdded.toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged">
                          {(debtReportTotals.sumAdded - debtReportTotals.sumPaidAdded).toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged">
                          {debtReportTotals.sumDisposal.toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged text-emerald-900">
                          {debtReportTotals.sumPaidDisposal.toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged">
                          {(debtReportTotals.sumDisposal - debtReportTotals.sumPaidDisposal).toLocaleString()}
                        </td>
                        <td className="border border-black py-1 px-0.5 num-enlarged text-red-900 font-black">
                          {debtReportTotals.sumNetRemaining.toLocaleString()} ج.م
                        </td>
                        <td className="border border-black py-1 px-0.5 text-[7pt] text-red-900">
                          {debtReportTotals.over20kCount} مخبز &gt; 20,000 ج.م
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                /* GENERAL BAKERIES REGISTRY TABLE */
                <div className="w-full overflow-visible">
                  <table className="report-table-compact w-full text-center border-collapse text-[7.5px] print:text-[7pt] border border-black leading-tight table-fixed">
                    {/* Column percentage widths dynamically normalized to 100% */}
                    <colgroup>
                      {(() => {
                        const baseWeights: Record<string, number> = {
                          index: 2.5,
                          bakeryOwnerName: 8.5,
                          machineNumber: 4.8,
                          village: 4.5,
                          localUnit: 4.5,
                          remainingDebt: 4.8,
                          insuranceQuota: 3.8,
                          actualQuota: 3.8,
                          insuranceValue: 4.0,
                          loavesCount: 4.2,
                          villagePopulation: 4.0,
                          perCapitaAverage: 3.8,
                          beneficiaries2023: 3.5,
                          avg2023: 3.2,
                          beneficiaries2024: 3.5,
                          avg2024: 3.2,
                          beneficiaries2025: 3.5,
                          avg2025: 3.2,
                          avgDiff: 3.5,
                          activityStatus: 3.8,
                          breadType: 4.0,
                          breadTypeCount: 2.8,
                          lineType: 3.5,
                          fuelType: 3.2,
                          phone: 4.5,
                          nationalId: 5.8,
                          commercialRegDate: 3.8,
                          bakeryLicenseDate: 3.8,
                          leaseAgreementDate: 3.8,
                          taxCardDate: 3.8,
                        };

                        const activeKeys = Object.keys(activeColumns).filter((k) => activeColumns[k]);
                        const totalWeight = activeKeys.reduce((acc, k) => acc + (baseWeights[k] || 3.5), 0) || 1;

                        return activeKeys.map((colKey) => {
                          const pct = (((baseWeights[colKey] || 3.5) / totalWeight) * 100).toFixed(2);
                          return <col key={colKey} style={{ width: `${pct}%` }} />;
                        });
                      })()}
                    </colgroup>

                    <thead>
                      {/* Top Grouped Header Row */}
                      <tr className="bg-slate-900 text-white font-black border border-black text-[8px] print:text-[7.5pt]">
                        {basicInfoSpan > 0 && (
                          <th colSpan={basicInfoSpan} className="border border-black py-1 px-1 bg-slate-900 text-amber-200">
                            البيانات الأساسية وموقع المخبز
                          </th>
                        )}
                        {debtsSpan > 0 && (
                          <th colSpan={debtsSpan} className="border border-black py-1 px-1 bg-red-950 text-white">
                            المتبقي
                          </th>
                        )}
                        {quotasSpan > 0 && (
                          <th colSpan={quotasSpan} className="border border-black py-1 px-1 bg-amber-950 text-amber-200">
                            الحصص التموينية والتأمينية
                          </th>
                        )}
                        {populationSpan > 0 && (
                          <th colSpan={populationSpan} className="border border-black py-1 px-1 bg-cyan-950 text-cyan-200">
                            إحصائيات السكان والمستفيدين والبطاقات (2023 - 2025)
                          </th>
                        )}
                        {specsSpan > 0 && (
                          <th colSpan={specsSpan} className="border border-black py-1 px-1 bg-emerald-950 text-emerald-200">
                            التشغيل والمواصفات
                          </th>
                        )}
                        {contactSpan > 0 && (
                          <th colSpan={contactSpan} className="border border-black py-1 px-1 bg-purple-950 text-purple-200">
                            بيانات الاتصال والهوية
                          </th>
                        )}
                        {licenseSpan > 0 && (
                          <th colSpan={licenseSpan} className="border border-black py-1 px-1 bg-slate-800 text-slate-200">
                            صلاحية السجلات والتراخيص
                          </th>
                        )}
                      </tr>

                      {/* Sub Header Row */}
                      <tr className="bg-slate-800 text-white font-black border-b border-black text-[7.5px] print:text-[6.8pt]">
                        {activeColumns.index && <th className="border border-black py-1 px-0.5">م</th>}
                        {activeColumns.bakeryOwnerName && (
                          <th className="border border-black py-1 px-1">{columnTitles.bakeryOwnerName}</th>
                        )}
                        {activeColumns.machineNumber && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.machineNumber}</th>
                        )}
                        {activeColumns.village && <th className="border border-black py-1 px-0.5">{columnTitles.village}</th>}
                        {activeColumns.localUnit && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.localUnit}</th>
                        )}
                        {activeColumns.remainingDebt && (
                          <th className="border border-black py-1 px-0.5 bg-red-900 text-white">
                            {columnTitles.remainingDebt}
                          </th>
                        )}
                        {activeColumns.insuranceQuota && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.insuranceQuota}</th>
                        )}
                        {activeColumns.actualQuota && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.actualQuota}</th>
                        )}
                        {activeColumns.insuranceValue && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.insuranceValue}</th>
                        )}
                        {activeColumns.loavesCount && (
                          <th className="border border-black py-1 px-0.5 bg-amber-900 text-white">
                            {columnTitles.loavesCount}
                          </th>
                        )}
                        {activeColumns.villagePopulation && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.villagePopulation}</th>
                        )}
                        {activeColumns.perCapitaAverage && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.perCapitaAverage}</th>
                        )}
                        {activeColumns.beneficiaries2023 && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.beneficiaries2023}</th>
                        )}
                        {activeColumns.avg2023 && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.avg2023}</th>
                        )}
                        {activeColumns.beneficiaries2024 && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.beneficiaries2024}</th>
                        )}
                        {activeColumns.avg2024 && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.avg2024}</th>
                        )}
                        {activeColumns.beneficiaries2025 && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.beneficiaries2025}</th>
                        )}
                        {activeColumns.avg2025 && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.avg2025}</th>
                        )}
                        {activeColumns.avgDiff && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.avgDiff}</th>
                        )}
                        {activeColumns.activityStatus && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.activityStatus}</th>
                        )}
                        {activeColumns.breadType && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.breadType}</th>
                        )}
                        {activeColumns.breadTypeCount && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.breadTypeCount}</th>
                        )}
                        {activeColumns.lineType && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.lineType}</th>
                        )}
                        {activeColumns.fuelType && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.fuelType}</th>
                        )}
                        {activeColumns.phone && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.phone}</th>
                        )}
                        {activeColumns.nationalId && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.nationalId}</th>
                        )}
                        {activeColumns.commercialRegDate && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.commercialRegDate}</th>
                        )}
                        {activeColumns.bakeryLicenseDate && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.bakeryLicenseDate}</th>
                        )}
                        {activeColumns.leaseAgreementDate && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.leaseAgreementDate}</th>
                        )}
                        {activeColumns.taxCardDate && (
                          <th className="border border-black py-1 px-0.5">{columnTitles.taxCardDate}</th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-black font-bold">
                      {filteredBakeries.map((b, idx) => {
                        const debtVal = bakeryDebtMap[b.id] || 0;
                        const isOver20k = debtVal > 20000;

                        return (
                          <tr
                            key={b.id}
                            className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50 print:bg-slate-100/60'}
                          >
                            {activeColumns.index && <td className="border border-black py-1 px-0.5 num-enlarged">{idx + 1}</td>}
                            {activeColumns.bakeryOwnerName && (
                              <td className="border border-black py-1 px-1 font-black text-right truncate" title={b.bakeryOwnerName}>
                                {b.bakeryOwnerName}
                              </td>
                            )}
                            {activeColumns.machineNumber && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-black">{b.machineNumber}</td>
                            )}
                            {activeColumns.village && <td className="border border-black py-1 px-0.5">{b.village}</td>}
                            {activeColumns.localUnit && <td className="border border-black py-1 px-0.5">{b.localUnit}</td>}
                            {activeColumns.remainingDebt && (
                              <td
                                className={`border border-black py-1 px-0.5 num-enlarged font-black ${
                                  isOver20k
                                    ? 'text-red-700 bg-red-100/70'
                                    : debtVal > 0
                                    ? 'text-amber-800'
                                    : 'text-emerald-700'
                                }`}
                                title={isOver20k ? 'تتجاوز 20,000 ج.م - مطلوب دفعات أسبوعية' : undefined}
                              >
                                {debtVal > 0 ? `${debtVal.toLocaleString()}` : 'خالص'}
                              </td>
                            )}
                            {activeColumns.insuranceQuota && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.insuranceQuota}</td>
                            )}
                            {activeColumns.actualQuota && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.actualQuota}</td>
                            )}
                            {activeColumns.insuranceValue && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.insuranceValue?.toLocaleString()}</td>
                            )}
                            {activeColumns.loavesCount && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-black bg-amber-50/40">
                                {b.loavesCount?.toLocaleString()}
                              </td>
                            )}
                            {activeColumns.villagePopulation && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.villagePopulation?.toLocaleString()}</td>
                            )}
                            {activeColumns.perCapitaAverage && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-black">{b.perCapitaAverage}</td>
                            )}
                            {activeColumns.beneficiaries2023 && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.beneficiaries2023?.toLocaleString()}</td>
                            )}
                            {activeColumns.avg2023 && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.avg2023}</td>
                            )}
                            {activeColumns.beneficiaries2024 && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.beneficiaries2024?.toLocaleString()}</td>
                            )}
                            {activeColumns.avg2024 && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.avg2024}</td>
                            )}
                            {activeColumns.beneficiaries2025 && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.beneficiaries2025?.toLocaleString()}</td>
                            )}
                            {activeColumns.avg2025 && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.avg2025}</td>
                            )}
                            {activeColumns.avgDiff && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-black">{b.avgDiff}</td>
                            )}
                            {activeColumns.activityStatus && (
                              <td className="border border-black py-1 px-0.5 font-bold">{b.activityStatus}</td>
                            )}
                            {activeColumns.breadType && (
                              <td className="border border-black py-1 px-0.5">{b.breadType}</td>
                            )}
                            {activeColumns.breadTypeCount && (
                              <td className="border border-black py-1 px-0.5 num-enlarged">{b.breadTypeCount}</td>
                            )}
                            {activeColumns.lineType && (
                              <td className="border border-black py-1 px-0.5">{b.lineType}</td>
                            )}
                            {activeColumns.fuelType && (
                              <td className="border border-black py-1 px-0.5">{b.fuelType}</td>
                            )}
                            {activeColumns.phone && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-mono">{b.phone}</td>
                            )}
                            {activeColumns.nationalId && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-mono">{b.nationalId}</td>
                            )}
                            {activeColumns.commercialRegDate && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-mono text-[6.8pt]">{b.commercialRegDate}</td>
                            )}
                            {activeColumns.bakeryLicenseDate && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-mono text-[6.8pt]">{b.bakeryLicenseDate}</td>
                            )}
                            {activeColumns.leaseAgreementDate && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-mono text-[6.8pt]">{b.leaseAgreementDate}</td>
                            )}
                            {activeColumns.taxCardDate && (
                              <td className="border border-black py-1 px-0.5 num-enlarged font-mono text-[6.8pt]">{b.taxCardDate}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot>
                      <tr className="bg-slate-200 font-black border-t-2 border-black text-[8px] print:text-[7pt]">
                        <td colSpan={3} className="border border-black py-1.5 px-2 text-right">
                          إجمالي الكشف ({filteredBakeries.length} مخبز)
                        </td>
                        {activeColumns.village && <td className="border border-black" />}
                        {activeColumns.localUnit && <td className="border border-black" />}
                        {activeColumns.remainingDebt && (
                          <td className="border border-black py-1 px-0.5 num-enlarged text-red-900 font-black">
                            {reportTotals.totalDebt.toLocaleString()} ج.م
                          </td>
                        )}
                        {activeColumns.insuranceQuota && (
                          <td className="border border-black py-1 px-0.5 num-enlarged font-black">
                            {reportTotals.totalInsurance} شيكارة
                          </td>
                        )}
                        {activeColumns.actualQuota && (
                          <td className="border border-black py-1 px-0.5 num-enlarged font-black">
                            {reportTotals.totalActual} شيكارة
                          </td>
                        )}
                        {activeColumns.insuranceValue && <td className="border border-black" />}
                        {activeColumns.loavesCount && (
                          <td className="border border-black py-1 px-0.5 num-enlarged font-black">
                            {reportTotals.totalLoaves.toLocaleString()}
                          </td>
                        )}
                        <td
                          colSpan={
                            Object.values(activeColumns).filter(Boolean).length -
                            (activeColumns.index ? 1 : 0) -
                            (activeColumns.bakeryOwnerName ? 1 : 0) -
                            (activeColumns.machineNumber ? 1 : 0) -
                            (activeColumns.village ? 1 : 0) -
                            (activeColumns.localUnit ? 1 : 0) -
                            (activeColumns.remainingDebt ? 1 : 0) -
                            (activeColumns.insuranceQuota ? 1 : 0) -
                            (activeColumns.actualQuota ? 1 : 0) -
                            (activeColumns.insuranceValue ? 1 : 0) -
                            (activeColumns.loavesCount ? 1 : 0)
                          }
                          className="border border-black bg-slate-100"
                        />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Official Stamps and Signatures Area */}
              <div className="mt-8 pt-4 grid grid-cols-3 text-center text-xs font-black text-slate-900 border-t border-slate-300">
                <div>
                  <p>إعداد ومراجعة الإحصاء التمويني والمديونيات</p>
                  <p className="text-[11px] font-black text-amber-950 mt-1">
                    أعده: {currentUser?.fullName || 'أحمد الحسيني'}
                  </p>
                  <div className="h-8 flex items-end justify-center text-[10px] text-slate-400">
                    ................................
                  </div>
                </div>
                <div>
                  <p>رئيس قسم الرقابة التموينية بالمركز</p>
                  <div className="h-12 flex items-end justify-center text-[10px] text-slate-400">
                    ................................
                  </div>
                </div>
                <div>
                  <p>مدير إدارة تموين مركز المحلة الكبرى</p>
                  <div className="h-12 flex items-end justify-center text-[10px] text-slate-400">
                    (خاتم شعار الجمهورية)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info (no-print) */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600 no-print shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span>
              نظام الطباعة الحكومي A4 Landscape: كشوف الحصر وكشوف حساب المديونيات التفصيلية مع تنبيهات المديونيات الكبرى (&gt; 20,000 ج.م).
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black cursor-pointer transition"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
