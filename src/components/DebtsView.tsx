import React, { useState, useMemo, useEffect } from 'react';
import { Bakery, DebtRecord, VillageHierarchy, SystemConfig, AppUser } from '../types';
import { PAYMENT_METHODS } from '../defaultData';
import {
  FileSpreadsheet,
  Printer,
  Plus,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  X,
  Save,
  Building,
  RotateCcw,
  Scale,
  Calculator,
  Clock,
  AlertTriangle,
  Settings,
  Check,
  Calendar,
  FileText,
  Store,
  RefreshCw,
} from 'lucide-react';

import { WeeklyInstallmentsModal } from './WeeklyInstallmentsModal';
import { SupplyFinesCalculatorModal } from './SupplyFinesCalculatorModal';
import { printHtmlElementA4, exportElementToPdf } from '../utils/pdfHelper';
import { filterDebtsByAdvancedCriteria, formatDateDDMMYYYY } from '../utils/auditHelper';

export const getDebtOverdueInfo = (
  dateStr?: string,
  netRemainingDebt: number = 0
): { isOverdue: boolean; daysElapsed: number; isUnpaid: boolean } => {
  const isUnpaid = netRemainingDebt > 0;
  if (!isUnpaid || !dateStr || !dateStr.trim()) {
    return { isOverdue: false, daysElapsed: 0, isUnpaid };
  }

  const debtDate = new Date(dateStr.trim());
  if (isNaN(debtDate.getTime())) {
    return { isOverdue: false, daysElapsed: 0, isUnpaid };
  }

  const now = new Date();
  const diffMs = now.getTime() - debtDate.getTime();
  const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return {
    isOverdue: daysElapsed > 30,
    daysElapsed: Math.max(0, daysElapsed),
    isUnpaid,
  };
};

interface DebtsViewProps {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  issuingEntities: string[];
  violationTypes: string[];
  systemConfig: SystemConfig;
  currentUser?: AppUser | null;
  onSaveDebt: (debt: DebtRecord) => void;
  onDeleteDebt: (debtId: string) => void;
  onUpdateEntities: (entities: string[]) => void;
  onUpdateViolations: (violations: string[]) => void;
  onRenameEntity?: (oldName: string, newName: string) => void;
  onRenameViolation?: (oldName: string, newName: string) => void;
  filterBakeryId?: string;
  onClearBakeryFilter?: () => void;
  onOpenReportModal?: (tab?: 'bakeries' | 'debts' | 'bakery-debts' | 'users') => void;
}

export const DebtsView: React.FC<DebtsViewProps> = ({
  bakeries,
  debts,
  villages,
  issuingEntities,
  violationTypes,
  systemConfig,
  currentUser,
  onSaveDebt,
  onDeleteDebt,
  onUpdateEntities,
  onUpdateViolations,
  onRenameEntity,
  onRenameViolation,
  filterBakeryId,
  onClearBakeryFilter,
  onOpenReportModal,
}) => {
  const debtsPrintRef = React.useRef<HTMLDivElement>(null);
  const isViewer = currentUser?.role === 'viewer';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('ALL');
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');
  const [selectedViolationType, setSelectedViolationType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'UNPAID' | 'PAID' | 'OVER_20K' | 'OVERDUE'>('ALL');
  // Advanced Search Across Debts (البحث المتقدم عبر المديونيات: من تاريخ - إلى تاريخ)
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Modals state
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [debtToEdit, setDebtToEdit] = useState<DebtRecord | null>(null);

  const [isEntitiesModalOpen, setIsEntitiesModalOpen] = useState(false);
  const [isViolationsModalOpen, setIsViolationsModalOpen] = useState(false);
  const [isWeeklyInstallmentsOpen, setIsWeeklyInstallmentsOpen] = useState(false);
  const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState(false);
  const [installmentBakeryId, setInstallmentBakeryId] = useState<string | undefined>(undefined);

  // Row highlight state
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Manage entities inside modal
  const [newEntityName, setNewEntityName] = useState('');
  const [editingEntityOldName, setEditingEntityOldName] = useState<string | null>(null);
  const [editingEntityNewName, setEditingEntityNewName] = useState('');
  const [entitySearchQuery, setEntitySearchQuery] = useState('');

  // Manage violation types inside modal
  const [newViolationName, setNewViolationName] = useState('');
  const [editingViolationOldName, setEditingViolationOldName] = useState<string | null>(null);
  const [editingViolationNewName, setEditingViolationNewName] = useState('');
  const [violationSearchQuery, setViolationSearchQuery] = useState('');

  // Filtering using pure helper function (supports dateFrom - dateTo, violationType, etc.)
  const filteredDebts = useMemo(() => {
    return filterDebtsByAdvancedCriteria(debts, {
      dateFrom,
      dateTo,
      violationType: selectedViolationType,
      village: selectedVillage,
      localUnit: selectedUnit,
      issuingEntity: selectedEntity,
      status: selectedStatus,
      filterBakeryId,
      searchTerm,
      isOverdueCheck: getDebtOverdueInfo,
    });
  }, [
    debts,
    dateFrom,
    dateTo,
    filterBakeryId,
    selectedVillage,
    selectedUnit,
    selectedEntity,
    selectedViolationType,
    selectedStatus,
    searchTerm,
  ]);

  // Filtered period totals for the Advanced Search bar summary
  const filteredPeriodNetDebt = useMemo(() => {
    return filteredDebts.reduce((sum, d) => sum + (d.netRemainingDebt || 0), 0);
  }, [filteredDebts]);

  // Statistics
  const stats = useMemo(() => {
    let totalViolations = 0;
    let paidViolations = 0;
    let totalAdded = 0;
    let paidAdded = 0;
    let totalDisposal = 0;
    let paidDisposal = 0;
    let netRemainingTotal = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    const indebtedBakeryIds = new Set<string>();

    debts.forEach((d) => {
      totalViolations += d.totalViolations || 0;
      paidViolations += d.paidViolationAmount || 0;
      totalAdded += d.addedAmount || 0;
      paidAdded += d.paidAddedAmount || 0;
      totalDisposal += d.disposalValue || 0;
      paidDisposal += d.paidDisposalAmount || 0;
      netRemainingTotal += d.netRemainingDebt || 0;

      if ((d.netRemainingDebt || 0) > 0) {
        indebtedBakeryIds.add(d.bakeryId);
      }

      const { isOverdue } = getDebtOverdueInfo(d.violationDate || d.disposalDate, d.netRemainingDebt);
      if (isOverdue) {
        overdueCount += 1;
        overdueAmount += d.netRemainingDebt || 0;
      }
    });

    const totalOriginalDebt = totalViolations + totalAdded + totalDisposal;
    const totalPaidAmount = paidViolations + paidAdded + paidDisposal;

    return {
      totalBakeriesCount: bakeries.length,
      indebtedBakeriesCount: indebtedBakeryIds.size,
      totalOriginalDebt,
      totalPaidAmount,
      totalViolations,
      paidViolations,
      totalAdded,
      paidAdded,
      totalDisposal,
      paidDisposal,
      netRemainingTotal,
      overdueCount,
      overdueAmount,
    };
  }, [debts, bakeries.length]);

  // Filtered totals for table footer
  const filteredTotals = useMemo(() => {
    let sumViol = 0;
    let sumOldViol = 0;
    let sumTotalViol = 0;
    let sumPaidViol = 0;
    let sumRemViol = 0;
    let sumAdded = 0;
    let sumPaidAdded = 0;
    let sumRemAdded = 0;
    let sumDispBags = 0;
    let sumDispVal = 0;
    let sumPaidDisp = 0;
    let sumNetRem = 0;

    filteredDebts.forEach((d) => {
      sumViol += Number(d.violationAmount) || 0;
      sumOldViol += Number(d.oldViolations) || 0;
      sumTotalViol += Number(d.totalViolations) || 0;
      sumPaidViol += Number(d.paidViolationAmount) || 0;
      sumRemViol += Number(d.remainingViolations) || 0;
      sumAdded += Number(d.addedAmount) || 0;
      sumPaidAdded += Number(d.paidAddedAmount) || 0;
      sumRemAdded += Number(d.remainingAdded) || 0;
      sumDispBags += Number(d.disposalBags) || 0;
      sumDispVal += Number(d.disposalValue) || 0;
      sumPaidDisp += Number(d.paidDisposalAmount) || 0;
      sumNetRem += Number(d.netRemainingDebt) || 0;
    });

    return {
      sumViol,
      sumOldViol,
      sumTotalViol,
      sumPaidViol,
      sumRemViol,
      sumAdded,
      sumPaidAdded,
      sumRemAdded,
      sumDispBags,
      sumDispVal,
      sumPaidDisp,
      sumNetRem,
    };
  }, [filteredDebts]);

  // Handle Export to CSV (Excel UTF-8 BOM)
  const handleExportCSV = () => {
    const headers = [
      'م',
      'اسم صاحب المخبز',
      'رقم الماكينة',
      'القرية',
      'الوحدة المحلية',
      'تاريخ المخالفة',
      'الجهة المحررة',
      'نوع المخالفة',
      'قيمة المخالفة',
      'مخالفات قديمة',
      'إجمالي المخالفات',
      'المسدد من المخالفات',
      'المتبقي من المخالفات',
      'المضاف للمخبز',
      'المسدد من المضاف',
      'المتبقي من المضاف',
      'عدد شكاير التصرف',
      'سعر الشيكارة',
      'مضاعفة العقوبة',
      'قيمة التصرف',
      'المسدد من التصرف',
      'المتبقي من التصرف',
      'صافي المتبقي على المخبز',
      'ملاحظات',
    ];

    const rows = filteredDebts.map((d, idx) => [
      idx + 1,
      `"${d.bakeryOwnerName.replace(/"/g, '""')}"`,
      `"${d.machineNumber}"`,
      `"${d.village}"`,
      `"${d.localUnit}"`,
      `"${d.violationDate}"`,
      `"${d.issuingEntity}"`,
      `"${d.violationType}"`,
      d.violationAmount,
      d.oldViolations,
      d.totalViolations,
      d.paidViolationAmount,
      d.remainingViolations,
      d.addedAmount,
      d.paidAddedAmount,
      d.remainingAdded,
      d.disposalBags,
      d.disposalBagPrice,
      d.disposalMultiplier,
      d.disposalValue,
      d.paidDisposalAmount,
      d.remainingDisposal,
      d.netRemainingDebt,
      `"${(d.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `قاعدة_بيانات_مديونيات_المخابز_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintDebts = () => {
    if (onOpenReportModal) {
      onOpenReportModal('debts');
      return;
    }
    printHtmlElementA4(
      debtsPrintRef.current,
      `تقرير_قاعدة_بيانات_مديونيات_المخابز_${new Date().toISOString().split('T')[0]}`
    );
  };

  const handleExportDebtsPdf = async () => {
    if (isExportingPdf || !debtsPrintRef.current) return;
    setIsExportingPdf(true);
    try {
      await exportElementToPdf(debtsPrintRef.current, {
        title: 'تقرير_قاعدة_بيانات_مديونيات_المخابز',
        paperSize: 'a4',
        orientation: 'landscape',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* 1. Prominent Section Title Banner: قاعدة بيانات مديونيات المخابز */}
      <div className="bg-gradient-to-l from-[#0A1931] via-[#0F2342] to-[#1E3A8A] text-white rounded-2xl p-5 shadow-md border border-blue-900/40 flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white/10 rounded-xl border border-white/20">
            <Scale className="w-7 h-7 text-blue-200" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black tracking-tight text-white">
              قاعدة بيانات مديونيات المخابز
            </h2>
            <p className="text-xs text-blue-200 font-bold mt-0.5">
              إدارة ومتابعة المخالفات التموينية والمبالغ المضافة وفروق التصرف والتحصيلات وصافي المديونيات المتبقية
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            disabled={isExportingPdf}
            onClick={handleExportDebtsPdf}
            className="px-4 py-2.5 bg-[#1D4ED8] hover:bg-[#2563EB] active:scale-[0.98] disabled:opacity-60 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm border border-blue-400/40 transition cursor-pointer"
          >
            {isExportingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>{isExportingPdf ? 'جاري التصدير...' : 'تصدير التقرير PDF'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printHtmlElementA4(
                debtsPrintRef.current,
                `قاعدة_بيانات_مديونيات_المخابز_${new Date().toISOString().split('T')[0]}`
              )
            }
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة فورية</span>
          </button>
        </div>
      </div>

      {/* Active Bakery Filter Notification */}
      {filterBakeryId && (
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl flex items-center justify-between text-amber-950 font-black text-xs no-print shadow-2xs">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-700" />
            <span>
              عرض مديونيات المخبز المحدد فقط: (
              {debts.find((d) => d.bakeryId === filterBakeryId)?.bakeryOwnerName ||
                bakeries.find((b) => b.id === filterBakeryId)?.bakeryOwnerName}
              )
            </span>
          </div>
          <button
            onClick={onClearBakeryFilter}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-lg text-xs font-bold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إلغاء التصفية وعرض كافة المخابز
          </button>
        </div>
      )}

      {/* 2. Primary 5 Statistical Cards Above Debts Table (البطاقات الإحصائية الخمس المطلوبة) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        {/* Card 1: إجمالي عدد المخابز */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">1. إجمالي عدد المخابز</span>
            <span className="text-2xl font-black text-[#0F2342] font-mono tabular-nums mt-1 block">
              {stats.totalBakeriesCount.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">مخبز مسجل بالمنظومة</span>
          </div>
          <div className="p-3 bg-blue-50 text-[#1E3A8A] rounded-xl border border-blue-100">
            <Store className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: إجمالي عدد المخابز المدينة */}
        <div
          onClick={() => setSelectedStatus('UNPAID')}
          className="bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-400 rounded-2xl p-4 shadow-2xs flex items-center justify-between cursor-pointer transition"
        >
          <div>
            <span className="text-xs font-bold text-slate-500 block">2. إجمالي عدد المخابز المدينة</span>
            <span className="text-2xl font-black text-amber-700 font-mono tabular-nums mt-1 block">
              {stats.indebtedBakeriesCount.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-amber-800 mt-0.5 block">
              من إجمالي {debts.length} قيد مديونية
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: إجمالي قيمة المديونيات */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block">3. إجمالي قيمة المديونيات</span>
            <span className="text-2xl font-black text-[#1E3A8A] font-mono tabular-nums mt-1 block">
              {stats.totalOriginalDebt.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-slate-500 mt-0.5 block">
              جنيه مصري (مخالفات + مضاف + تصرف)
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-[#1E40AF] rounded-xl border border-blue-200">
            <Scale className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: إجمالي المبالغ المسددة */}
        <div
          onClick={() => setSelectedStatus('PAID')}
          className="bg-white hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-400 rounded-2xl p-4 shadow-2xs flex items-center justify-between cursor-pointer transition"
        >
          <div>
            <span className="text-xs font-bold text-slate-500 block">4. إجمالي المبالغ المسددة</span>
            <span className="text-2xl font-black text-emerald-700 font-mono tabular-nums mt-1 block">
              {stats.totalPaidAmount.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-emerald-700 mt-0.5 block">جنيه مصري محصل</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: إجمالي المبالغ المتبقية */}
        <div
          onClick={() => setSelectedStatus('UNPAID')}
          className="bg-gradient-to-br from-red-600 to-rose-700 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer transition hover:shadow-md"
        >
          <div>
            <span className="text-xs font-bold text-rose-100 block">5. إجمالي المبالغ المتبقية</span>
            <span className="text-2xl font-black text-white font-mono tabular-nums mt-1 block">
              {stats.netRemainingTotal.toLocaleString()}
            </span>
            <span className="text-[11px] font-bold text-rose-100 mt-0.5 block">
              جنيه مصري مستحق التحصيل
            </span>
          </div>
          <div className="p-3 bg-white/15 text-white rounded-xl border border-white/25">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. Organized Command Toolbar & Filter Bar Above Debts Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3.5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!isViewer && (
              <button
                type="button"
                onClick={() => {
                  setDebtToEdit(null);
                  setIsDebtModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0F2342] hover:bg-[#1E3A8A] active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>تسجيل مديونية / مخالفة جديدة</span>
              </button>
            )}

            {!isViewer && selectedRowId && (
              <button
                type="button"
                onClick={() => {
                  const found = debts.find((d) => d.id === selectedRowId);
                  if (found) {
                    setDebtToEdit(found);
                    setIsDebtModalOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1E40AF] hover:bg-[#2563EB] active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-white" />
                <span>تعديل المديونية المحددة</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCalculatorModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <Calculator className="w-4 h-4 text-white" />
              <span>حاسبة الغرامات التموينية</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInstallmentBakeryId(undefined);
                setIsWeeklyInstallmentsOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1E40AF] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-white" />
              <span>جدولة الدفعات الأسبوعية (&gt; 20 ألف)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEntitiesModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              title="إدارة وتعديل وحذف الجهات المحررة للمحاضر"
            >
              <Building className="w-3.5 h-3.5 text-[#1E40AF]" />
              <span>الجهات المحررة ({issuingEntities.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsViolationsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              title="إدارة وتعديل وحذف أنواع المخالفات التموينية"
            >
              <Scale className="w-3.5 h-3.5 text-red-600" />
              <span>أنواع المخالفات ({violationTypes.length})</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-white" />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              disabled={isExportingPdf}
              onClick={handleExportDebtsPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1D4ED8] hover:bg-[#2563EB] text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <FileText className="w-4 h-4 text-white" />
              <span>تصدير التقرير PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrintDebts}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-[#0F2342] border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#0F2342]" />
              <span>معاينة وطباعة الكشف</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم صاحب المخبز، رقم الماكينة، رقم الإيصال..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 text-slate-800 placeholder:text-slate-400 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-[#1E40AF] text-right transition"
            />
          </div>
        </div>

        {/* Advanced Date & Violation Type Filter Panel */}
        <div
          role="region"
          aria-label="البحث المتقدم عبر المديونيات"
          className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <Filter className="w-4 h-4 text-[#1E3A8A]" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-[#0F2342] flex items-center gap-2">
                  <span>البحث والتصفية المتقدمة لسجلات المديونيات</span>
                  <span className="text-[10px] bg-blue-100 text-[#1E3A8A] px-2 py-0.5 rounded-full font-bold">
                    نطاق تاريخي + نوع المخالفة + المنطقة
                  </span>
                </h3>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <span className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded-lg text-[11px] font-bold">
                القيود المعروضة: <strong className="text-[#0F2342] font-mono">{filteredDebts.length}</strong> من{' '}
                <strong className="font-mono">{debts.length}</strong> قيد
              </span>
              <span className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-800 rounded-lg text-[11px] font-black">
                صافي مديونيات النتائج: {filteredPeriodNetDebt.toLocaleString()} ج.م
              </span>
              {(dateFrom !== '' ||
                dateTo !== '' ||
                selectedViolationType !== 'ALL' ||
                selectedVillage !== 'ALL' ||
                selectedUnit !== 'ALL' ||
                selectedEntity !== 'ALL' ||
                selectedStatus !== 'ALL' ||
                searchTerm.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSelectedViolationType('ALL');
                    setSelectedVillage('ALL');
                    setSelectedUnit('ALL');
                    setSelectedEntity('ALL');
                    setSelectedStatus('ALL');
                    setSearchTerm('');
                  }}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة تعيين التصفية</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs items-end">
            {/* 1. Date From */}
            <div>
              <label
                htmlFor="debt-advanced-date-from"
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 mb-1"
              >
                <Calendar className="w-3.5 h-3.5 text-[#1E40AF]" />
                <span>من تاريخ:</span>
              </label>
              <input
                id="debt-advanced-date-from"
                aria-label="من تاريخ"
                type="date"
                lang="ar-EG"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-800 text-xs cursor-pointer"
              />
            </div>

            {/* 2. Date To */}
            <div>
              <label
                htmlFor="debt-advanced-date-to"
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 mb-1"
              >
                <Calendar className="w-3.5 h-3.5 text-[#1E40AF]" />
                <span>إلى تاريخ:</span>
              </label>
              <input
                id="debt-advanced-date-to"
                aria-label="إلى تاريخ"
                type="date"
                lang="ar-EG"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-800 text-xs cursor-pointer"
              />
            </div>

            {/* 3. Violation Type */}
            <div>
              <label
                htmlFor="debt-advanced-violation-type"
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 mb-1"
              >
                <Scale className="w-3.5 h-3.5 text-red-600" />
                <span>حسب نوع المخالفة التموينية:</span>
              </label>
              <select
                id="debt-advanced-violation-type"
                aria-label="حسب نوع المخالفة التموينية"
                value={selectedViolationType}
                onChange={(e) => {
                  if (e.target.value === '__MANAGE_VIOLATIONS__') {
                    setIsViolationsModalOpen(true);
                    return;
                  }
                  setSelectedViolationType(e.target.value);
                }}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-xs cursor-pointer"
              >
                <option value="ALL">كافة أنواع المخالفات ({debts.length} قيد)</option>
                {Array.from(new Set([...violationTypes, ...debts.map((d) => d.violationType).filter(Boolean)])).map(
                  (vType) => {
                    const count = debts.filter((d) => d.violationType === vType).length;
                    return (
                      <option key={vType} value={vType}>
                        {vType} ({count} قيد)
                      </option>
                    );
                  }
                )}
                <option value="__MANAGE_VIOLATIONS__">⚙️ إدارة وتعديل أنواع المخالفات...</option>
              </select>
            </div>

            {/* 4. Quick Date Range Presets */}
            <div>
              <span className="block text-[11px] font-bold text-slate-700 mb-1">فترات زمنية سريعة:</span>
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
                    dateFrom === '' && dateTo === ''
                      ? 'bg-[#0F2342] text-white border-[#0F2342]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  كل الفترات
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('2026-10-01');
                    setDateTo('2026-10-15');
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
                    dateFrom === '2026-10-01' && dateTo === '2026-10-15'
                      ? 'bg-[#0F2342] text-white border-[#0F2342]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  1 - 15 أكتوبر
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('2026-10-16');
                    setDateTo('2026-10-31');
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
                    dateFrom === '2026-10-16' && dateTo === '2026-10-31'
                      ? 'bg-[#0F2342] text-white border-[#0F2342]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  16 - 31 أكتوبر
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('2026-01-01');
                    setDateTo('2026-12-31');
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
                    dateFrom === '2026-01-01' && dateTo === '2026-12-31'
                      ? 'bg-[#0F2342] text-white border-[#0F2342]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  عام 2026
                </button>
              </div>
            </div>
          </div>

          {/* Secondary Dropdown Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-200 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">القرية</label>
              <select
                value={selectedVillage}
                onChange={(e) => {
                  setSelectedVillage(e.target.value);
                  setSelectedUnit('ALL');
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="ALL">كافة قرى المركز</option>
                {villages.map((v) => (
                  <option key={v.village} value={v.village}>
                    {v.village}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">الوحدة المحلية التابعة</label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="ALL">
                  {selectedVillage === 'ALL' ? 'كافة الوحدات المحلية بالمركز' : `كافة وحدات ${selectedVillage}`}
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
                  : (villages.find((v) => v.village === selectedVillage)?.localUnits || []).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">الجهة المحررة للمحضر</label>
              <select
                value={selectedEntity}
                onChange={(e) => {
                  if (e.target.value === '__MANAGE_ENTITIES__') {
                    setIsEntitiesModalOpen(true);
                    return;
                  }
                  setSelectedEntity(e.target.value);
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="ALL">كافة الجهات المحررة ({issuingEntities.length})</option>
                <option value="__MANAGE_ENTITIES__">⚙️ إدارة وتعديل الجهات المحررة...</option>
                {issuingEntities.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة السداد والجدولة</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as 'ALL' | 'UNPAID' | 'PAID' | 'OVER_20K' | 'OVERDUE')}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="ALL">الكل (المسدد والمتبقي)</option>
                <option value="OVERDUE">المتأخرات (&gt; 30 يوماً دون سداد كامل)</option>
                <option value="OVER_20K">مديونيات تتجاوز 20,000 ج.م (دفعات أسبوعية)</option>
                <option value="UNPAID">عليه مديونية متبقية فقط</option>
                <option value="PAID">خالص المديونية بالكامل</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Printable Wrapper & Official Grouped Headers Debts Table */}
      <div ref={debtsPrintRef} className="space-y-3 print-container">
        {/* Official Printable Header (Appears during print & PDF export) */}
        <div className="hidden print:block mb-4 text-center border-b-2 border-[#0F2342] pb-3">
          <div className="flex items-center justify-between">
            <div className="text-right">
              <h4 className="text-xs font-black text-slate-900">جمهورية مصر العربية · {systemConfig.governorateTitle}</h4>
              <h4 className="text-xs font-black text-[#0F2342]">{systemConfig.directorateTitle}</h4>
              <h4 className="text-xs font-black text-[#0F2342]">{systemConfig.administrationTitle}</h4>
            </div>
            {systemConfig.logoBase64 && (
              <div className="w-14 h-14">
                <img src={systemConfig.logoBase64} alt="شعار" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="text-left font-mono text-[10px] font-bold">
              <p>تقرير قاعدة بيانات مديونيات المخابز</p>
              <p>تاريخ الاستخراج: {new Date().toLocaleDateString('ar-EG')}</p>
              <p>عدد القيود: {filteredDebts.length} قيد</p>
            </div>
          </div>
        </div>

        {/* Debts Database Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[650px] relative">
            <table className="w-full text-center border-collapse text-xs">
              {/* Super Headers */}
              <thead className="sticky top-0 z-20 bg-[#0F2342] text-white font-bold shadow-xs">
                <tr className="border-b border-[#1E3A8A]">
                  <th
                    rowSpan={2}
                    className="py-3 px-2 bg-[#0A1931] border-l border-[#1E3A8A] text-white w-10 text-center font-black"
                  >
                    م
                  </th>
                  <th
                    colSpan={4}
                    className="py-2.5 px-2 bg-[#0F2342] border-l border-[#1E3A8A] text-white font-black"
                  >
                    1. البيانات الأساسية وموقع المخبز
                  </th>
                  <th
                    colSpan={6}
                    className="py-2.5 px-2 bg-[#162E58] border-l border-[#1E3A8A] text-white font-black"
                  >
                    2. مخالفات المخبز
                  </th>
                  <th
                    colSpan={5}
                    className="py-2.5 px-2 bg-[#0F2342] border-l border-[#1E3A8A] text-white font-black"
                  >
                    3. سداد المخالفات
                  </th>
                  <th
                    colSpan={6}
                    className="py-2.5 px-2 bg-[#162E58] border-l border-[#1E3A8A] text-white font-black"
                  >
                    4. المنصرف وسداد المنصرف (المضاف)
                  </th>
                  <th
                    colSpan={5}
                    className="py-2.5 px-2 bg-[#0F2342] border-l border-[#1E3A8A] text-white font-black"
                  >
                    5. التصرف من المخبز
                  </th>
                  <th
                    colSpan={5}
                    className="py-2.5 px-2 bg-[#162E58] border-l border-[#1E3A8A] text-white font-black"
                  >
                    6. السداد من التصرف
                  </th>
                  <th
                    rowSpan={2}
                    className="py-3 px-3 bg-[#1E3A8A] border-l border-blue-800 text-white text-xs font-black min-w-[135px]"
                  >
                    صافي المتبقي على صاحب المخبز
                  </th>
                  <th
                    rowSpan={2}
                    className="py-3 px-2 bg-[#0A1931] border-l border-[#1E3A8A] text-white min-w-[95px] no-print text-center font-black"
                  >
                    الإجراءات
                  </th>
                </tr>

                {/* Sub Columns Headers */}
                <tr className="bg-[#152E59] text-[11px] text-white font-bold border-b-2 border-[#0F2342]">
                  {/* 1. Basic Info */}
                  <th className="py-2.5 px-2.5 border-l border-[#1E3A8A] min-w-[155px] text-right">اسم صاحب المخبز</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[90px]">رقم الماكينة</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[80px]">القرية</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[95px]">الوحدة التابعة</th>

                  {/* 2. Violations */}
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">تاريخ العملية</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[115px]">الجهة المحررة</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[125px]">نوع المخالفة</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">قيمة المخالفة</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">مخالفات قديمة</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] bg-[#1E3A8A]">إجمالي المخالفات</th>

                  {/* 3. Violation Payment */}
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">تاريخ السداد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[80px]">رقم الإيصال</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">نوع السداد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">المبلغ المسدد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] bg-[#1E3A8A]">المتبقي</th>

                  {/* 4. Added */}
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">المضاف للمخبز</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">تاريخ السداد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[80px]">رقم الإيصال</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">نوع السداد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">المسدد من المضاف</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] bg-[#1E3A8A]">المتبقي</th>

                  {/* 5. Disposal */}
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">تاريخ التصرف</th>
                  <th className="py-2.5 px-1.5 border-l border-[#1E3A8A]">الشكاير</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">سعر الشيكارة</th>
                  <th className="py-2.5 px-1.5 border-l border-[#1E3A8A]">المضاعفة</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] bg-[#1E3A8A]">قيمة التصرف</th>

                  {/* 6. Disposal Payment */}
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">قيمة التصرف</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">تاريخ السداد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[80px]">رقم الإيصال</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A] min-w-[85px]">نوع السداد</th>
                  <th className="py-2.5 px-2 border-l border-[#1E3A8A]">السداد من التصرف</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                {filteredDebts.length === 0 ? (
                  <tr>
                    <td colSpan={34} className="py-12 text-center text-slate-500 font-black">
                      لا توجد أي قيود مديونية مطابقة لمعايير البحث الحالية
                    </td>
                  </tr>
                ) : (
                  filteredDebts.map((d, index) => {
                    const isSelected = selectedRowId === d.id;
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedRowId(d.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'row-selected'
                            : index % 2 === 0
                            ? 'bg-white hover:bg-blue-50/70'
                            : 'bg-slate-50/90 hover:bg-blue-50/70'
                        }`}
                      >
                        {/* Index */}
                        <td className="py-2.5 px-1.5 border-l border-slate-200 text-slate-500 font-mono text-center">
                          {index + 1}
                        </td>

                        {/* Owner & Location */}
                        <td className="py-2.5 px-2.5 border-l border-slate-200 font-extrabold text-[#0F2342] text-right">
                          {d.bakeryOwnerName}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black text-[#1E40AF]">
                          {d.machineNumber}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-slate-800">{d.village}</td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-slate-600">{d.localUnit}</td>

                        {/* 2. Violations */}
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          <div>
                            <span>{formatDateDDMMYYYY(d.violationDate) || '-'}</span>
                            {(() => {
                              const { isOverdue, daysElapsed } = getDebtOverdueInfo(
                                d.violationDate || d.disposalDate,
                                d.netRemainingDebt
                              );
                              if (isOverdue) {
                                return (
                                  <span
                                    className="block text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1 mt-0.5"
                                    title={`مر ${daysElapsed} يوماً على تحرير الغرامة دون سداد`}
                                  >
                                    منذ {daysElapsed} يوم
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-xs text-slate-700">
                          {d.issuingEntity}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-xs text-red-700 font-extrabold">
                          {d.violationType}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-800">
                          {(d.violationAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-600">
                          {(d.oldViolations || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black bg-red-50/60 text-red-800">
                          {(d.totalViolations || 0).toLocaleString()}
                        </td>

                        {/* 3. Violation Payment */}
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          {formatDateDDMMYYYY(d.violationPaymentDate) || '-'}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700 font-mono">
                          {d.violationReceiptNumber || '-'}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-300">
                            {d.violationPaymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black text-emerald-700">
                          {(d.paidViolationAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black bg-blue-50/40 text-[#0F2342]">
                          {(d.remainingViolations || 0).toLocaleString()}
                        </td>

                        {/* 4. Added */}
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-800">
                          {(d.addedAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          {formatDateDDMMYYYY(d.addedPaymentDate) || '-'}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700 font-mono">
                          {d.addedReceiptNumber || '-'}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-300">
                            {d.addedPaymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black text-emerald-700">
                          {(d.paidAddedAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black bg-blue-50/40 text-[#0F2342]">
                          {(d.remainingAdded || 0).toLocaleString()}
                        </td>

                        {/* 5. Disposal */}
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          {formatDateDDMMYYYY(d.disposalDate) || '-'}
                        </td>
                        <td className="py-2.5 px-1.5 border-l border-slate-200 font-mono text-slate-800">
                          {d.disposalBags}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          {(d.disposalBagPrice || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-1.5 border-l border-slate-200 font-mono text-amber-700">
                          {d.disposalMultiplier}x
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black bg-amber-50/50 text-amber-900">
                          {(d.disposalValue || 0).toLocaleString()}
                        </td>

                        {/* 6. Disposal Payment */}
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          {(d.disposalValue || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                          {formatDateDDMMYYYY(d.disposalPaymentDate) || '-'}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700 font-mono">
                          {d.disposalReceiptNumber || '-'}
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-300">
                            {d.disposalPaymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 border-l border-slate-200 font-mono font-black text-emerald-700">
                          {(d.paidDisposalAmount || 0).toLocaleString()}
                        </td>

                        {/* Net Remaining Debt */}
                        <td className="py-2.5 px-3 border-l border-slate-200 font-mono font-black bg-slate-50/60">
                          {d.netRemainingDebt > 0 ? (
                            <div className="space-y-1 flex flex-col items-center justify-center">
                              <span className="inline-block px-2.5 py-1 bg-red-50 text-red-700 border border-red-300 rounded-lg text-xs font-black">
                                {d.netRemainingDebt.toLocaleString()} ج.م
                              </span>
                              {d.netRemainingDebt > 20000 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInstallmentBakeryId(d.bakeryId);
                                    setIsWeeklyInstallmentsOpen(true);
                                  }}
                                  className="block mx-auto text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md font-bold cursor-pointer transition"
                                >
                                  دفعات أسبوعية (&gt;20 ألف)
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-black">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              خالص (0)
                            </span>
                          )}
                        </td>

                        {/* Actions Column */}
                        <td className="py-2 px-1.5 border-l border-slate-200 no-print text-center">
                          {isViewer ? (
                            <span className="text-[11px] font-bold text-slate-500">عرض فقط</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDebtToEdit(d);
                                  setIsDebtModalOpen(true);
                                }}
                                className="p-1.5 bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 rounded-lg transition cursor-pointer"
                                title="تعديل المديونية"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`هل أنت متأكد من حذف قيد المديونية الخاص بـ "${d.bakeryOwnerName}"؟`)) {
                                    onDeleteDebt(d.id);
                                  }
                                }}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg transition cursor-pointer"
                                title="حذف القيد"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Highlighted Summary Footer Row (tfoot) */}
              {filteredDebts.length > 0 && (
                <tfoot>
                  <tr className="bg-[#DBEAFE] text-[#0F2342] font-black border-t-2 border-[#0F2342] text-xs font-mono">
                    <td colSpan={5} className="py-3 px-3 text-right font-sans font-black border-l border-blue-300">
                      إجمالي السجلات المعروضة ({filteredDebts.length} قيد مديونية)
                    </td>
                    <td colSpan={3} className="border-l border-blue-300">—</td>
                    <td className="py-2.5 px-2 border-l border-blue-300">{filteredTotals.sumViol.toLocaleString()}</td>
                    <td className="py-2.5 px-2 border-l border-blue-300">{filteredTotals.sumOldViol.toLocaleString()}</td>
                    <td className="py-2.5 px-2 border-l border-blue-300 bg-blue-200/70">
                      {filteredTotals.sumTotalViol.toLocaleString()}
                    </td>
                    <td colSpan={3} className="border-l border-blue-300">—</td>
                    <td className="py-2.5 px-2 border-l border-blue-300 text-emerald-800">
                      {filteredTotals.sumPaidViol.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 border-l border-blue-300 bg-blue-200/70">
                      {filteredTotals.sumRemViol.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 border-l border-blue-300">{filteredTotals.sumAdded.toLocaleString()}</td>
                    <td colSpan={3} className="border-l border-blue-300">—</td>
                    <td className="py-2.5 px-2 border-l border-blue-300 text-emerald-800">
                      {filteredTotals.sumPaidAdded.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 border-l border-blue-300 bg-blue-200/70">
                      {filteredTotals.sumRemAdded.toLocaleString()}
                    </td>
                    <td className="border-l border-blue-300">—</td>
                    <td className="py-2.5 px-1.5 border-l border-blue-300">{filteredTotals.sumDispBags}</td>
                    <td colSpan={2} className="border-l border-blue-300">—</td>
                    <td className="py-2.5 px-2 border-l border-blue-300 bg-blue-200/70">
                      {filteredTotals.sumDispVal.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 border-l border-blue-300">{filteredTotals.sumDispVal.toLocaleString()}</td>
                    <td colSpan={3} className="border-l border-blue-300">—</td>
                    <td className="py-2.5 px-2 border-l border-blue-300 text-emerald-800">
                      {filteredTotals.sumPaidDisp.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 border-l border-blue-300 bg-red-100 text-red-900 font-black">
                      {filteredTotals.sumNetRem.toLocaleString()} ج.م
                    </td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Modal 1: Add / Edit Debt Record */}
      {isDebtModalOpen && (
        <DebtModalForm
          isOpen={isDebtModalOpen}
          onClose={() => setIsDebtModalOpen(false)}
          debtToEdit={debtToEdit}
          bakeries={bakeries}
          issuingEntities={issuingEntities}
          violationTypes={violationTypes}
          onOpenManageEntities={() => setIsEntitiesModalOpen(true)}
          onOpenManageViolations={() => setIsViolationsModalOpen(true)}
          onSave={(saved) => {
            onSaveDebt(saved);
            setIsDebtModalOpen(false);
          }}
        />
      )}

      {/* Modal 2: Dynamic Issuing Entities Manager (Full Edit / Delete / Add / Search) */}
      {isEntitiesModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingEntityOldName(null);
              setIsEntitiesModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600 w-full max-w-xl p-5 cursor-default flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    إدارة وتعديل الجهات المحررة لمحاضر المخابز
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    إجمالي الجهات المعتمدة: {issuingEntities.length} جهة رسمية
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEntityOldName(null);
                  setIsEntitiesModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add New Entity Form */}
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 mb-3.5 shrink-0">
              <label className="block text-[11px] font-black text-amber-950 mb-1.5">
                إضافة جهة محررة جديدة إلى المنظومة:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const name = newEntityName.trim();
                      if (!name) return;
                      if (issuingEntities.includes(name)) {
                        alert('هذه الجهة مسجلة بالفعل في القائمة');
                        return;
                      }
                      onUpdateEntities([...issuingEntities, name]);
                      setNewEntityName('');
                    }
                  }}
                  placeholder="اكتب اسم الجهة (مثال: جهاز حماية المستهلك، مباحث التموين...)"
                  className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 text-right placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = newEntityName.trim();
                    if (!name) return;
                    if (issuingEntities.includes(name)) {
                      alert('هذه الجهة مسجلة بالفعل في القائمة');
                      return;
                    }
                    onUpdateEntities([...issuingEntities, name]);
                    setNewEntityName('');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white rounded-lg text-xs font-black shadow-sm shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة جهة
                </button>
              </div>
            </div>

            {/* Search in Entities */}
            <div className="relative mb-3 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={entitySearchQuery}
                onChange={(e) => setEntitySearchQuery(e.target.value)}
                placeholder="بحث سريع داخل قائمة الجهات المحررة..."
                className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-1 focus:ring-amber-500"
              />
              {entitySearchQuery && (
                <button
                  type="button"
                  onClick={() => setEntitySearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  مسح
                </button>
              )}
            </div>

            {/* List of Entities */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-[160px] max-h-[340px]">
              {issuingEntities
                .filter((ent) =>
                  entitySearchQuery.trim()
                    ? ent.toLowerCase().includes(entitySearchQuery.toLowerCase().trim())
                    : true
                )
                .map((ent, idx) => {
                  const isEditing = editingEntityOldName === ent;
                  const usageCount = debts.filter((d) => d.issuingEntity === ent).length;

                  return (
                    <div
                      key={ent}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                        isEditing
                          ? 'bg-amber-50/80 border-amber-400 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                      }`}
                    >
                      {isEditing ? (
                        /* Inline Edit View */
                        <div className="flex items-center gap-2 flex-1 ml-2">
                          <input
                            type="text"
                            autoFocus
                            value={editingEntityNewName}
                            onChange={(e) => setEditingEntityNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const clean = editingEntityNewName.trim();
                                if (!clean) return;
                                if (clean !== ent && issuingEntities.includes(clean)) {
                                  alert('اسم الجهة موجود بالفعل في القائمة');
                                  return;
                                }
                                if (clean !== ent) {
                                  if (onRenameEntity) {
                                    onRenameEntity(ent, clean);
                                  } else {
                                    onUpdateEntities(
                                      issuingEntities.map((item) => (item === ent ? clean : item))
                                    );
                                  }
                                }
                                setEditingEntityOldName(null);
                                setEditingEntityNewName('');
                              } else if (e.key === 'Escape') {
                                setEditingEntityOldName(null);
                                setEditingEntityNewName('');
                              }
                            }}
                            className="flex-1 px-2.5 py-1 bg-white border-2 border-amber-500 rounded-lg text-xs font-black text-slate-900 focus:outline-none"
                            placeholder="الاسم الجديد للجهة..."
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const clean = editingEntityNewName.trim();
                              if (!clean) {
                                alert('يرجى إدخال اسم صحيح');
                                return;
                              }
                              if (clean !== ent && issuingEntities.includes(clean)) {
                                alert('اسم الجهة موجود بالفعل في القائمة');
                                return;
                              }
                              if (clean !== ent) {
                                if (onRenameEntity) {
                                  onRenameEntity(ent, clean);
                                } else {
                                  onUpdateEntities(
                                    issuingEntities.map((item) => (item === ent ? clean : item))
                                  );
                                }
                              }
                              setEditingEntityOldName(null);
                              setEditingEntityNewName('');
                            }}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                            title="حفظ التعديل"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEntityOldName(null);
                              setEditingEntityNewName('');
                            }}
                            className="p-1.5 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="إلغاء التعديل"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        /* Normal View */
                        <>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-mono flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-slate-900 font-black">{ent}</span>
                            {usageCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                {usageCount} محضر مديونية
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                                غير مستخدم حالياً
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntityOldName(ent);
                                setEditingEntityNewName(ent);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:text-amber-800 bg-white hover:bg-amber-50 border border-slate-300 hover:border-amber-400 rounded-lg transition-all text-[11px] font-bold cursor-pointer"
                              title="تعديل اسم الجهة وتحديث كافة المحاضر المرتبطة بها"
                            >
                              <Edit2 className="w-3 h-3 text-amber-600" />
                              تعديل
                            </button>

                            {issuingEntities.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (usageCount > 0) {
                                    const confirmDel = window.confirm(
                                      `تنبيه: الجهة "${ent}" مسجلة حالياً في (${usageCount}) محضر مديونية. هل أنت متأكد من رغبتك في حذفها من القائمة المعتمدة؟`
                                    );
                                    if (!confirmDel) return;
                                  }
                                  onUpdateEntities(issuingEntities.filter((e) => e !== ent));
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-red-600 hover:text-red-800 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-400 rounded-lg transition-all text-[11px] font-bold cursor-pointer"
                                title="حذف الجهة من القائمة"
                              >
                                <Trash2 className="w-3 h-3 text-red-600" />
                                حذف
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

              {issuingEntities.filter((ent) =>
                entitySearchQuery.trim()
                  ? ent.toLowerCase().includes(entitySearchQuery.toLowerCase().trim())
                  : true
              ).length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500 font-bold">
                  لا توجد جهات مطابقة لكلمة البحث "{entitySearchQuery}"
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-bold">
                * عند تعديل اسم الجهة، يتم تلقائياً تحديث جميع القيود التاريخية المسجلة باسمها القديم
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingEntityOldName(null);
                  setIsEntitiesModalOpen(false);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm"
              >
                تم والعودة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Dynamic Violation Types Manager (Full Edit / Delete / Add / Search) */}
      {isViolationsModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingViolationOldName(null);
              setIsViolationsModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border-2 border-red-600 w-full max-w-xl p-5 cursor-default flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-500/20 text-red-700 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    إدارة وتعديل أنواع المخالفات التموينية المعتمدة
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    إجمالي أنواع المخالفات المعتمدة: {violationTypes.length} نوع مخالفة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingViolationOldName(null);
                  setIsViolationsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add New Violation Type Form */}
            <div className="bg-red-50/60 border border-red-200 rounded-xl p-3 mb-3.5 shrink-0">
              <label className="block text-[11px] font-black text-red-950 mb-1.5">
                إضافة نوع مخالفة جديد إلى المنظومة:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newViolationName}
                  onChange={(e) => setNewViolationName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const name = newViolationName.trim();
                      if (!name) return;
                      if (violationTypes.includes(name)) {
                        alert('نوع المخالفة مسجل مسبقاً في القائمة');
                        return;
                      }
                      onUpdateViolations([...violationTypes, name]);
                      setNewViolationName('');
                    }
                  }}
                  placeholder="اكتب نوع المخالفة (مثال: عدم نظافة المعجن، بيع بأزيد من السعر...)"
                  className="flex-1 px-3 py-2 bg-white border border-red-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-red-500 text-right placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = newViolationName.trim();
                    if (!name) return;
                    if (violationTypes.includes(name)) {
                      alert('نوع المخالفة مسجل مسبقاً في القائمة');
                      return;
                    }
                    onUpdateViolations([...violationTypes, name]);
                    setNewViolationName('');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white rounded-lg text-xs font-black shadow-sm shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة مخالفة
                </button>
              </div>
            </div>

            {/* Search in Violation Types */}
            <div className="relative mb-3 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={violationSearchQuery}
                onChange={(e) => setViolationSearchQuery(e.target.value)}
                placeholder="بحث سريع داخل أنواع المخالفات..."
                className="w-full pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-1 focus:ring-red-500"
              />
              {violationSearchQuery && (
                <button
                  type="button"
                  onClick={() => setViolationSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  مسح
                </button>
              )}
            </div>

            {/* List of Violation Types */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-[160px] max-h-[340px]">
              {violationTypes
                .filter((v) =>
                  violationSearchQuery.trim()
                    ? v.toLowerCase().includes(violationSearchQuery.toLowerCase().trim())
                    : true
                )
                .map((v, idx) => {
                  const isEditing = editingViolationOldName === v;
                  const usageCount = debts.filter((d) => d.violationType === v).length;

                  return (
                    <div
                      key={v}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                        isEditing
                          ? 'bg-red-50/80 border-red-400 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                      }`}
                    >
                      {isEditing ? (
                        /* Inline Edit View */
                        <div className="flex items-center gap-2 flex-1 ml-2">
                          <input
                            type="text"
                            autoFocus
                            value={editingViolationNewName}
                            onChange={(e) => setEditingViolationNewName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const clean = editingViolationNewName.trim();
                                if (!clean) return;
                                if (clean !== v && violationTypes.includes(clean)) {
                                  alert('نوع المخالفة موجود بالفعل في القائمة');
                                  return;
                                }
                                if (clean !== v) {
                                  if (onRenameViolation) {
                                    onRenameViolation(v, clean);
                                  } else {
                                    onUpdateViolations(
                                      violationTypes.map((item) => (item === v ? clean : item))
                                    );
                                  }
                                }
                                setEditingViolationOldName(null);
                                setEditingViolationNewName('');
                              } else if (e.key === 'Escape') {
                                setEditingViolationOldName(null);
                                setEditingViolationNewName('');
                              }
                            }}
                            className="flex-1 px-2.5 py-1 bg-white border-2 border-red-500 rounded-lg text-xs font-black text-slate-900 focus:outline-none"
                            placeholder="الاسم الجديد لنوع المخالفة..."
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const clean = editingViolationNewName.trim();
                              if (!clean) {
                                alert('يرجى إدخال اسم صحيح');
                                return;
                              }
                              if (clean !== v && violationTypes.includes(clean)) {
                                alert('نوع المخالفة موجود بالفعل في القائمة');
                                return;
                              }
                              if (clean !== v) {
                                if (onRenameViolation) {
                                  onRenameViolation(v, clean);
                                } else {
                                  onUpdateViolations(
                                    violationTypes.map((item) => (item === v ? clean : item))
                                  );
                                }
                              }
                              setEditingViolationOldName(null);
                              setEditingViolationNewName('');
                            }}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                            title="حفظ التعديل"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingViolationOldName(null);
                              setEditingViolationNewName('');
                            }}
                            className="p-1.5 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="إلغاء التعديل"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        /* Normal View */
                        <>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-mono flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-slate-900 font-black">{v}</span>
                            {usageCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                                {usageCount} محضر مديونية
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                                غير مستخدم حالياً
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingViolationOldName(v);
                                setEditingViolationNewName(v);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:text-red-800 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-400 rounded-lg transition-all text-[11px] font-bold cursor-pointer"
                              title="تعديل نوع المخالفة وتحديث كافة المحاضر المرتبطة بها"
                            >
                              <Edit2 className="w-3 h-3 text-red-600" />
                              تعديل
                            </button>

                            {violationTypes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (usageCount > 0) {
                                    const confirmDel = window.confirm(
                                      `تنبيه: نوع المخالفة "${v}" مسجل حالياً في (${usageCount}) محضر مديونية. هل أنت متأكد من رغبتك في حذفه من القائمة المعتمدة؟`
                                    );
                                    if (!confirmDel) return;
                                  }
                                  onUpdateViolations(violationTypes.filter((vt) => vt !== v));
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-red-600 hover:text-red-800 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-400 rounded-lg transition-all text-[11px] font-bold cursor-pointer"
                                title="حذف نوع المخالفة من القائمة"
                              >
                                <Trash2 className="w-3 h-3 text-red-600" />
                                حذف
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

              {violationTypes.filter((v) =>
                violationSearchQuery.trim()
                  ? v.toLowerCase().includes(violationSearchQuery.toLowerCase().trim())
                  : true
              ).length === 0 && (
                <div className="text-center py-6 text-xs text-slate-500 font-bold">
                  لا توجد مخالفات مطابقة لكلمة البحث "{violationSearchQuery}"
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-bold">
                * عند تعديل اسم المخالفة، يتم تلقائياً تحديث جميع القيود التاريخية المسجلة بالاسم القديم
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingViolationOldName(null);
                  setIsViolationsModalOpen(false);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm"
              >
                تم والعودة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Weekly Installments Schedule (> 20,000 EGP) */}
      {isWeeklyInstallmentsOpen && (
        <WeeklyInstallmentsModal
          isOpen={isWeeklyInstallmentsOpen}
          onClose={() => setIsWeeklyInstallmentsOpen(false)}
          bakeries={bakeries}
          debts={debts}
          systemConfig={systemConfig}
          initialBakeryId={installmentBakeryId}
        />
      )}

      {/* Modal 5: Supply Fines & Penalties Calculator */}
      {isCalculatorModalOpen && (
        <SupplyFinesCalculatorModal
          isOpen={isCalculatorModalOpen}
          onClose={() => setIsCalculatorModalOpen(false)}
          bakeries={bakeries}
          onApplyFineToDebt={(prefilled) => {
            const draftDebt: DebtRecord = {
              id: `fine-${Date.now()}`,
              bakeryId: prefilled.bakeryId,
              bakeryOwnerName: prefilled.bakeryOwnerName,
              machineNumber: prefilled.machineNumber,
              village: prefilled.village,
              localUnit: prefilled.localUnit,
              violationDate: new Date().toISOString().split('T')[0],
              issuingEntity: issuingEntities[0] || 'إدارة التموين',
              violationType: prefilled.violationType,
              violationAmount: prefilled.violationAmount,
              oldViolations: 0,
              totalViolations: prefilled.violationAmount,
              violationPaymentDate: '',
              violationReceiptNumber: '',
              violationPaymentMethod: 'نقدي',
              paidViolationAmount: 0,
              remainingViolations: prefilled.violationAmount,
              addedAmount: 0,
              addedPaymentDate: '',
              addedReceiptNumber: '',
              addedPaymentMethod: 'نقدي',
              paidAddedAmount: 0,
              remainingAdded: 0,
              disposalDate: '',
              disposalBags: 0,
              disposalBagPrice: 850,
              disposalMultiplier: 1,
              disposalValue: 0,
              disposalPaymentDate: '',
              disposalReceiptNumber: '',
              disposalPaymentMethod: 'نقدي',
              paidDisposalAmount: 0,
              remainingDisposal: 0,
              netRemainingDebt: prefilled.violationAmount,
              notes: prefilled.notes,
            };
            setDebtToEdit(draftDebt);
            setIsDebtModalOpen(true);
          }}
        />
      )}
    </div>
  );
};

// Sub-component: Add / Edit Debt Modal Form
interface DebtModalFormProps {
  isOpen: boolean;
  onClose: () => void;
  debtToEdit: DebtRecord | null;
  bakeries: Bakery[];
  issuingEntities: string[];
  violationTypes: string[];
  onOpenManageEntities?: () => void;
  onOpenManageViolations?: () => void;
  onSave: (debt: DebtRecord) => void;
}

const DebtModalForm: React.FC<DebtModalFormProps> = ({
  isOpen,
  onClose,
  debtToEdit,
  bakeries,
  issuingEntities,
  violationTypes,
  onOpenManageEntities,
  onOpenManageViolations,
  onSave,
}) => {
  // Bakery Selection
  const [selectedBakeryId, setSelectedBakeryId] = useState(
    debtToEdit?.bakeryId || bakeries[0]?.id || ''
  );

  // Violations
  const [violationDate, setViolationDate] = useState(
    debtToEdit?.violationDate || new Date().toISOString().split('T')[0]
  );
  const [issuingEntity, setIssuingEntity] = useState(
    debtToEdit?.issuingEntity || issuingEntities[0] || 'إدارة تموين مركز المحلة الكبرى'
  );
  const [violationType, setViolationType] = useState(
    debtToEdit?.violationType || violationTypes[0] || 'نقص وزن الرغيف البلدي المدعم'
  );

  // Keep selected entity and violation in sync if options are updated/renamed
  useEffect(() => {
    if (issuingEntities.length > 0 && !issuingEntities.includes(issuingEntity)) {
      setIssuingEntity(issuingEntities[0]);
    }
  }, [issuingEntities, issuingEntity]);

  useEffect(() => {
    if (violationTypes.length > 0 && !violationTypes.includes(violationType)) {
      setViolationType(violationTypes[0]);
    }
  }, [violationTypes, violationType]);
  const [violationAmount, setViolationAmount] = useState<number>(debtToEdit?.violationAmount || 0);
  const [oldViolations, setOldViolations] = useState<number>(debtToEdit?.oldViolations || 0);

  // Violation Payment
  const [violationPaymentDate, setViolationPaymentDate] = useState(
    debtToEdit?.violationPaymentDate || ''
  );
  const [violationReceiptNumber, setViolationReceiptNumber] = useState(
    debtToEdit?.violationReceiptNumber || ''
  );
  const [violationPaymentMethod, setViolationPaymentMethod] = useState(
    debtToEdit?.violationPaymentMethod || 'كاش'
  );
  const [paidViolationAmount, setPaidViolationAmount] = useState<number>(
    debtToEdit?.paidViolationAmount || 0
  );

  // Added (المضاف)
  const [addedAmount, setAddedAmount] = useState<number>(debtToEdit?.addedAmount || 0);
  const [addedPaymentDate, setAddedPaymentDate] = useState(debtToEdit?.addedPaymentDate || '');
  const [addedReceiptNumber, setAddedReceiptNumber] = useState(debtToEdit?.addedReceiptNumber || '');
  const [addedPaymentMethod, setAddedPaymentMethod] = useState(
    debtToEdit?.addedPaymentMethod || 'كاش'
  );
  const [paidAddedAmount, setPaidAddedAmount] = useState<number>(debtToEdit?.paidAddedAmount || 0);

  // Disposal (التصرف)
  const [disposalDate, setDisposalDate] = useState(debtToEdit?.disposalDate || '');
  const [disposalBags, setDisposalBags] = useState<number>(debtToEdit?.disposalBags || 0);
  const [disposalBagPrice, setDisposalBagPrice] = useState<number>(
    debtToEdit?.disposalBagPrice || 950
  );
  const [disposalMultiplier, setDisposalMultiplier] = useState<number>(
    debtToEdit?.disposalMultiplier || 1
  );

  // Disposal Payment
  const [disposalPaymentDate, setDisposalPaymentDate] = useState(
    debtToEdit?.disposalPaymentDate || ''
  );
  const [disposalReceiptNumber, setDisposalReceiptNumber] = useState(
    debtToEdit?.disposalReceiptNumber || ''
  );
  const [disposalPaymentMethod, setDisposalPaymentMethod] = useState(
    debtToEdit?.disposalPaymentMethod || 'كاش'
  );
  const [paidDisposalAmount, setPaidDisposalAmount] = useState<number>(
    debtToEdit?.paidDisposalAmount || 0
  );

  const [notes, setNotes] = useState(debtToEdit?.notes || '');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('');

  // Mini Fine Calculator inside Debt Modal ("مفتاح حساب الغرامة")
  const [showFineCalc, setShowFineCalc] = useState(false);
  const [calcViolationType, setCalcViolationType] = useState(
    debtToEdit?.violationType || violationTypes[0] || 'نقص وزن الرغيف البلدي المدعم'
  );
  const [calcLoavesCount, setCalcLoavesCount] = useState<number>(1000);
  const [calcFinePerLoaf, setCalcFinePerLoaf] = useState<number>(1.5);
  const [fineAppliedNotice, setFineAppliedNotice] = useState<string>('');
  const calculatedFineTotal =
    Math.round((Number(calcLoavesCount) || 0) * (Number(calcFinePerLoaf) || 0) * 100) / 100;

  const handleApplyCalculatedFine = () => {
    setViolationAmount(calculatedFineTotal);
    if (calcViolationType) {
      setViolationType(calcViolationType);
    }
    const calcSummary = `حساب الغرامة (${calcViolationType}): ${calcLoavesCount.toLocaleString()} رغيف × ${calcFinePerLoaf} ج.م = ${calculatedFineTotal.toLocaleString()} ج.م`;
    setNotes((prev) => (prev ? `${prev} | ${calcSummary}` : calcSummary));
    setFineAppliedNotice(`تم حساب وإدراج مبلغ (${calculatedFineTotal.toLocaleString()} ج.م) تلقائياً في خانة قيمة المخالفة والمديونية!`);
    setShowFineCalc(false);
    setTimeout(() => setFineAppliedNotice(''), 5000);
  };

  // Auto-calculated values
  const totalViolations = (Number(violationAmount) || 0) + (Number(oldViolations) || 0);
  const remainingViolations = Math.max(0, totalViolations - (Number(paidViolationAmount) || 0));

  const remainingAdded = Math.max(0, (Number(addedAmount) || 0) - (Number(paidAddedAmount) || 0));

  // Auto-save draft on any field change
  React.useEffect(() => {
    if (!isOpen) return;

    const draft = {
      selectedBakeryId,
      violationDate,
      issuingEntity,
      violationType,
      violationAmount,
      oldViolations,
      violationPaymentDate,
      violationReceiptNumber,
      violationPaymentMethod,
      paidViolationAmount,
      addedAmount,
      addedPaymentDate,
      addedReceiptNumber,
      addedPaymentMethod,
      paidAddedAmount,
      disposalDate,
      disposalBags,
      disposalBagPrice,
      disposalMultiplier,
      disposalPaymentDate,
      disposalReceiptNumber,
      disposalPaymentMethod,
      paidDisposalAmount,
      notes,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem('TAMWEEN_DEBT_DRAFT', JSON.stringify(draft));
      setAutoSaveStatus('saved');
      setLastAutoSaveTime(
        new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch {
      // storage fallback
    }
  }, [
    isOpen,
    selectedBakeryId,
    violationDate,
    issuingEntity,
    violationType,
    violationAmount,
    oldViolations,
    violationPaymentDate,
    violationReceiptNumber,
    violationPaymentMethod,
    paidViolationAmount,
    addedAmount,
    addedPaymentDate,
    addedReceiptNumber,
    addedPaymentMethod,
    paidAddedAmount,
    disposalDate,
    disposalBags,
    disposalBagPrice,
    disposalMultiplier,
    disposalPaymentDate,
    disposalReceiptNumber,
    disposalPaymentMethod,
    paidDisposalAmount,
    notes,
  ]);

  const disposalValue =
    (Number(disposalBags) || 0) *
    (Number(disposalBagPrice) || 0) *
    (Number(disposalMultiplier) || 1);
  const remainingDisposal = Math.max(0, disposalValue - (Number(paidDisposalAmount) || 0));

  // Required Exact Net Remaining Debt Equation:
  // (قيمة المخالفة + مخالفات قديمة - المبلغ المسدد) + (قيمة التصرف - السداد من التصرف) + (المضاف - المسدد من المضاف)
  const netRemainingDebt = remainingViolations + remainingDisposal + remainingAdded;

  const currentBakery = bakeries.find((b) => b.id === selectedBakeryId) || bakeries[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBakery) {
      alert('يرجى اختيار مخبز مسجل أولاً');
      return;
    }

    const record: DebtRecord = {
      id: debtToEdit ? debtToEdit.id : `d-${Date.now()}`,
      bakeryId: currentBakery.id,
      bakeryOwnerName: currentBakery.bakeryOwnerName,
      machineNumber: currentBakery.machineNumber,
      village: currentBakery.village,
      localUnit: currentBakery.localUnit,

      violationDate,
      issuingEntity,
      violationType,
      violationAmount: Number(violationAmount) || 0,
      oldViolations: Number(oldViolations) || 0,
      totalViolations,

      violationPaymentDate,
      violationReceiptNumber,
      violationPaymentMethod,
      paidViolationAmount: Number(paidViolationAmount) || 0,
      remainingViolations,

      addedAmount: Number(addedAmount) || 0,
      addedPaymentDate,
      addedReceiptNumber,
      addedPaymentMethod,
      paidAddedAmount: Number(paidAddedAmount) || 0,
      remainingAdded,

      disposalDate,
      disposalBags: Number(disposalBags) || 0,
      disposalBagPrice: Number(disposalBagPrice) || 0,
      disposalMultiplier: Number(disposalMultiplier) || 1,
      disposalValue,

      disposalPaymentDate,
      disposalReceiptNumber,
      disposalPaymentMethod,
      paidDisposalAmount: Number(paidDisposalAmount) || 0,
      remainingDisposal,

      netRemainingDebt,
      notes: notes.trim(),
    };

    onSave(record);
  };

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-red-600/40 w-full max-w-5xl my-4 overflow-hidden flex flex-col max-h-[92vh] cursor-default">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-red-950 via-slate-900 to-amber-950 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-amber-300" />
            <div>
              <h3 className="text-base font-black">
                {debtToEdit ? 'تعديل قيد مديونية / مخالفة مخبز' : 'تسجيل قيد مديونية ومخالفة جديدة'}
              </h3>
              <p className="text-[11px] text-amber-100 font-bold">
                حساب آلي للمخالفات، المضاف، التصرف، والسداد بصافي المتبقي الدقيق
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {autoSaveStatus === 'saved' && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-400/50 rounded-full text-[11px] font-black text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>تم الحفظ التلقائي لكل بيان ({lastAutoSaveTime})</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-red-900/60 hover:bg-red-600 text-white transition cursor-pointer border border-red-500/50 hover:scale-105 active:scale-95 shadow-md"
              title="إغلاق النافذة (Escape)"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Net Remaining Summary Banner */}
          <div className="bg-gradient-to-r from-red-50 via-amber-50 to-red-50 border-2 border-red-300 p-3.5 rounded-xl flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-black text-slate-700 block">
                المعادلة المعتمدة: (المخالفات - المسدد) + (التصرف - المسدد) + (المضاف - المسدد)
              </span>
              <span className="text-[11px] text-slate-500 font-bold">
                متبقي مخالفات: {remainingViolations.toLocaleString()} | متبقي تصرف: {remainingDisposal.toLocaleString()} | متبقي مضاف: {remainingAdded.toLocaleString()}
              </span>
            </div>
            <div className="text-left">
              <span className="text-[11px] font-bold text-red-900 block">صافي المتبقي على صاحب المخبز</span>
              <span className="text-xl font-black text-red-700 num-enlarged">
                {netRemainingDebt.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Section 1: Choose Bakery */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <h4 className="text-xs font-black text-slate-800 pb-2 mb-3 border-b border-slate-200 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-amber-600" />
              1. البيانات الأساسية وموقع المخبز (جلب تلقائي)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-700 mb-1">
                  اختر صاحب المخبز من قاعدة البيانات *
                </label>
                <select
                  value={selectedBakeryId}
                  onChange={(e) => setSelectedBakeryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  {bakeries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bakeryOwnerName} (ماكينة: {b.machineNumber} - قرية: {b.village})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">رقم الماكينة</label>
                <input
                  type="text"
                  disabled
                  value={currentBakery?.machineNumber || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-black text-slate-700 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">القرية</label>
                <input
                  type="text"
                  disabled
                  value={currentBakery?.village || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-black text-slate-700 text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">الوحدة التابعة</label>
                <input
                  type="text"
                  disabled
                  value={currentBakery?.localUnit || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-black text-slate-700 text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Violations */}
          <div className="border border-red-200 rounded-xl p-4 bg-red-50/20 space-y-3">
            <h4 className="text-xs font-black text-red-900 pb-2 border-b border-red-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span>2. مخالفات المخبز</span>
                <button
                  type="button"
                  onClick={() => setShowFineCalc((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 rounded-lg text-xs font-black shadow-md border border-amber-300 cursor-pointer transition transform hover:scale-105 active:scale-95"
                  title="فتح حاسبة الغرامة السريعة لحساب (عدد الأرغفة × سعر الغرامة للرغيف) وإدراج المبلغ تلقائياً في خانة المديونية"
                >
                  <Calculator className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
                  <span>حساب الغرامة 🧮</span>
                </button>
              </div>
              <span className="text-[11px] text-red-700 font-black">
                إجمالي المخالفات: {totalViolations.toLocaleString()} ج.م
              </span>
            </h4>

            {/* Confirmation Notice when fine is calculated & applied */}
            {fineAppliedNotice && (
              <div className="p-2.5 bg-emerald-100 border border-emerald-400 text-emerald-950 rounded-xl text-xs font-black flex items-center justify-between">
                <span>✅ {fineAppliedNotice}</span>
                <button
                  type="button"
                  onClick={() => setFineAppliedNotice('')}
                  className="text-emerald-800 hover:text-emerald-950 font-black px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Inline Mini Fine Calculator ("حساب الغرامة") */}
            {showFineCalc && (
              <div className="bg-gradient-to-r from-amber-50 via-yellow-50/80 to-amber-50 border-2 border-amber-400 rounded-xl p-3.5 shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-amber-300 pb-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-black text-amber-950">
                      حاسبة الغرامة الفورية (نوع المخالفة × عدد الأرغفة × سعر الغرامة للرغيف)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFineCalc(false)}
                    className="text-xs font-black text-red-700 hover:text-red-900 bg-red-100 px-2 py-0.5 rounded border border-red-300 cursor-pointer"
                  >
                    إغلاق الحاسبة ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-black text-slate-800 mb-1">
                      1. نوع المخالفة
                    </label>
                    <select
                      value={calcViolationType}
                      onChange={(e) => setCalcViolationType(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-400 rounded-lg text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-500"
                    >
                      {violationTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-800 mb-1">
                      2. عدد الأرغفة (رغيف)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={calcLoavesCount}
                      onChange={(e) => setCalcLoavesCount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="أدخل عدد الأرغفة"
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-400 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-black text-slate-800">
                        3. سعر الغرامة للرغيف (ج.م)
                      </label>
                      <div className="flex items-center gap-1">
                        {[1, 1.25, 1.5, 2].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCalcFinePerLoaf(preset)}
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-black border cursor-pointer ${
                              calcFinePerLoaf === preset
                                ? 'bg-amber-500 text-slate-950 border-amber-600'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-100'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="0.05"
                      value={calcFinePerLoaf}
                      onChange={(e) => setCalcFinePerLoaf(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="سعر الغرامة للرغيف"
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-400 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="bg-amber-950 text-white p-2 rounded-xl border border-amber-500 flex flex-col items-center justify-center">
                    <span className="text-[10px] text-amber-200 font-bold">إجمالي المبلغ المحسوب</span>
                    <span className="text-base font-black text-amber-300 num-enlarged">
                      {calculatedFineTotal.toLocaleString()} ج.م
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200">
                  <span className="text-[11px] font-bold text-amber-900">
                    المعادلة: {calcLoavesCount.toLocaleString()} رغيف × {calcFinePerLoaf} ج.م ={' '}
                    <strong className="font-black text-red-700">{calculatedFineTotal.toLocaleString()} ج.م</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyCalculatedFine}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-lg text-xs font-black shadow-md cursor-pointer border border-emerald-400"
                  >
                    <Save className="w-3.5 h-3.5 text-emerald-200" />
                    <span>إدراج المبلغ تلقائياً في خانة المديونية ({calculatedFineTotal.toLocaleString()} ج.م) ✓</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ العملية (يوم/شهر/سنة)</label>
                <input
                  type="date"
                  lang="ar-EG"
                  value={violationDate}
                  onChange={(e) => setViolationDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                />
                {violationDate && (
                  <span className="block text-[10px] font-black text-amber-900 bg-amber-100/80 border border-amber-300 rounded px-1 mt-1 text-center font-mono">
                    📅 {formatDateDDMMYYYY(violationDate)}
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-black text-slate-700">
                    الجهة المحررة للمحضر
                  </label>
                  {onOpenManageEntities && (
                    <button
                      type="button"
                      onClick={onOpenManageEntities}
                      className="inline-flex items-center gap-1 text-[10px] text-amber-700 hover:text-amber-900 font-bold bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 transition-colors cursor-pointer"
                      title="إدارة وتعديل وحذف الجهات المحررة"
                    >
                      <Settings className="w-2.5 h-2.5 text-amber-600" />
                      إدارة/تعديل ({issuingEntities.length})
                    </button>
                  )}
                </div>
                <select
                  value={issuingEntity}
                  onChange={(e) => {
                    if (e.target.value === '__MANAGE_ENTITIES__') {
                      onOpenManageEntities?.();
                      return;
                    }
                    setIssuingEntity(e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                >
                  <option value="__MANAGE_ENTITIES__" className="text-amber-700 font-black bg-amber-50">
                    ⚙️ إدارة وتعديل / حذف الجهات المحررة ({issuingEntities.length})...
                  </option>
                  {issuingEntities.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-black text-slate-700">نوع المخالفة</label>
                  {onOpenManageViolations && (
                    <button
                      type="button"
                      onClick={onOpenManageViolations}
                      className="inline-flex items-center gap-1 text-[10px] text-red-700 hover:text-red-900 font-bold bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200 transition-colors cursor-pointer"
                      title="إدارة وتعديل وحذف أنواع المخالفات"
                    >
                      <Settings className="w-2.5 h-2.5 text-red-600" />
                      إدارة/تعديل ({violationTypes.length})
                    </button>
                  )}
                </div>
                <select
                  value={violationType}
                  onChange={(e) => {
                    if (e.target.value === '__MANAGE_VIOLATIONS__') {
                      onOpenManageViolations?.();
                      return;
                    }
                    setViolationType(e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-red-500"
                >
                  <option value="__MANAGE_VIOLATIONS__" className="text-red-700 font-black bg-red-50">
                    ⚙️ إدارة وتعديل / حذف أنواع المخالفات ({violationTypes.length})...
                  </option>
                  {violationTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-black text-slate-700">قيمة المخالفة (ج.م)</label>
                  <button
                    type="button"
                    onClick={() => setShowFineCalc((prev) => !prev)}
                    className="text-[10px] font-black text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.2 rounded border border-amber-300 cursor-pointer"
                    title="حساب الغرامة تلقائياً"
                  >
                    🧮 حساب الغرامة
                  </button>
                </div>
                <input
                  type="number"
                  value={violationAmount}
                  onChange={(e) => setViolationAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">مخالفات قديمة (ج.م)</label>
                <input
                  type="number"
                  value={oldViolations}
                  onChange={(e) => setOldViolations(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Violation Payment */}
          <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/20">
            <h4 className="text-xs font-black text-emerald-900 pb-2 mb-3 border-b border-emerald-200 flex items-center justify-between">
              <span>3. سداد المخالفات</span>
              <span className="text-[11px] text-emerald-700 font-black">
                المتبقي من المخالفات: {remainingViolations.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ السداد (يوم/شهر/سنة)</label>
                <input
                  type="date"
                  lang="ar-EG"
                  value={violationPaymentDate}
                  onChange={(e) => setViolationPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                />
                {violationPaymentDate && (
                  <span className="block text-[10px] font-black text-emerald-900 bg-emerald-100/80 border border-emerald-300 rounded px-1 mt-1 text-center font-mono">
                    📅 {formatDateDDMMYYYY(violationPaymentDate)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">رقم الإيصال / القسيمة</label>
                <input
                  type="text"
                  value={violationReceiptNumber}
                  onChange={(e) => setViolationReceiptNumber(e.target.value)}
                  placeholder="رقم القسيمة"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع السداد</label>
                <select
                  value={violationPaymentMethod}
                  onChange={(e) => setViolationPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">المبلغ المسدد (ج.م)</label>
                <input
                  type="number"
                  value={paidViolationAmount}
                  onChange={(e) => setPaidViolationAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-emerald-400 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Added Amount (المضاف) */}
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20">
            <h4 className="text-xs font-black text-blue-900 pb-2 mb-3 border-b border-blue-200 flex items-center justify-between">
              <span>4. المنصرف وسداد المنصرف (المضاف للمخبز)</span>
              <span className="text-[11px] text-blue-700 font-black">
                المتبقي من المضاف: {remainingAdded.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">المضاف للمخبز (ج.م)</label>
                <input
                  type="number"
                  value={addedAmount}
                  onChange={(e) => setAddedAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ السداد (يوم/شهر/سنة)</label>
                <input
                  type="date"
                  lang="ar-EG"
                  value={addedPaymentDate}
                  onChange={(e) => setAddedPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                />
                {addedPaymentDate && (
                  <span className="block text-[10px] font-black text-blue-900 bg-blue-100/80 border border-blue-300 rounded px-1 mt-1 text-center font-mono">
                    📅 {formatDateDDMMYYYY(addedPaymentDate)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">رقم الإيصال</label>
                <input
                  type="text"
                  value={addedReceiptNumber}
                  onChange={(e) => setAddedReceiptNumber(e.target.value)}
                  placeholder="رقم القسيمة"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع السداد</label>
                <select
                  value={addedPaymentMethod}
                  onChange={(e) => setAddedPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">المسدد من المضاف (ج.م)</label>
                <input
                  type="number"
                  value={paidAddedAmount}
                  onChange={(e) => setPaidAddedAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-400 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Disposal (التصرف في الدقيق) */}
          <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/20">
            <h4 className="text-xs font-black text-amber-900 pb-2 mb-3 border-b border-amber-200 flex items-center justify-between">
              <span>5. التصرف من المخبز والسداد من التصرف</span>
              <span className="text-[11px] text-amber-700 font-black">
                قيمة التصرف: {disposalValue.toLocaleString()} ج.م | المتبقي: {remainingDisposal.toLocaleString()} ج.م
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ التصرف (يوم/شهر/سنة)</label>
                <input
                  type="date"
                  lang="ar-EG"
                  value={disposalDate}
                  onChange={(e) => setDisposalDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900"
                />
                {disposalDate && (
                  <span className="block text-[10px] font-black text-amber-900 bg-amber-100/80 border border-amber-300 rounded px-1 mt-1 text-center font-mono">
                    📅 {formatDateDDMMYYYY(disposalDate)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">عدد الشكاير</label>
                <input
                  type="number"
                  value={disposalBags}
                  onChange={(e) => setDisposalBags(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">قيمة الشيكارة (ج.م)</label>
                <input
                  type="number"
                  value={disposalBagPrice}
                  onChange={(e) => setDisposalBagPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900 num-enlarged text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">
                  مضاعفة العقوبة (1x - 5x)
                </label>
                <select
                  value={disposalMultiplier}
                  onChange={(e) => setDisposalMultiplier(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900"
                >
                  <option value={1}>1x (قيمة عادية)</option>
                  <option value={2}>2x (مضاعفة مرتين)</option>
                  <option value={3}>3x (مضاعفة 3 مرات)</option>
                  <option value={4}>4x (مضاعفة 4 مرات)</option>
                  <option value={5}>5x (مضاعفة 5 مرات)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">تاريخ سداد التصرف (يوم/شهر/سنة)</label>
                <input
                  type="date"
                  lang="ar-EG"
                  value={disposalPaymentDate}
                  onChange={(e) => setDisposalPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-black text-slate-900"
                />
                {disposalPaymentDate && (
                  <span className="block text-[10px] font-black text-amber-900 bg-amber-100/80 border border-amber-300 rounded px-1 mt-1 text-center font-mono">
                    📅 {formatDateDDMMYYYY(disposalPaymentDate)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">رقم الإيصال</label>
                <input
                  type="text"
                  value={disposalReceiptNumber}
                  onChange={(e) => setDisposalReceiptNumber(e.target.value)}
                  placeholder="رقم القسيمة"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">نوع السداد</label>
                <select
                  value={disposalPaymentMethod}
                  onChange={(e) => setDisposalPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">السداد من التصرف (ج.م)</label>
                <input
                  type="number"
                  value={paidDisposalAmount}
                  onChange={(e) => setPaidDisposalAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-amber-400 rounded-lg text-xs font-black num-enlarged text-center"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 mb-1">ملاحظات وقيد السداد</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات حول إجراءات التحصيل أو الإنذارات القضائية"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right"
            />
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-xs font-black text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              إلغاء النافذة (ESC)
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-red-700 to-rose-900 hover:from-red-800 hover:to-rose-950 text-white rounded-lg text-xs font-black shadow-md transition cursor-pointer"
            >
              <Save className="w-4 h-4 text-amber-200" />
              حفظ قيد المديونية
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
