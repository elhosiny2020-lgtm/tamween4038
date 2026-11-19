import React, { useMemo, useState } from 'react';
import {
  Landmark,
  FileSpreadsheet,
  Printer,
  Columns3,
  Plus,
  CheckSquare,
  Square,
  FileBarChart2,
} from 'lucide-react';
import type {
  GrainDepartmentFinancialEntry,
  GrainMaintenanceState,
} from '../../../types/modules';
import {
  computeMillAssetValuation,
  computeRefrigeratorAssetValuation,
  computeShunaBookBalanceAndValuation,
} from '../../../utils/grainMaintenanceMath';
import {
  exportRowsToArabicCsv,
  printModuleReportA4,
  MINISTRY_LOGO_URL,
  computeReportSubtotalsByLocalUnitAndVillage,
} from '../../../services/modulesStorage';
import {
  ModuleRowActions,
  ModuleRecordProfileModal,
  ModuleDeleteConfirmModal,
  VillageGrandTotalRow,
  SmartTableSearchBar,
} from '../ModuleCrudShared';
import { matchesSmartSearch } from '../../../utils/tableSmartHelpers';

interface GrainFinancialsAndReportsViewProps {
  state: GrainMaintenanceState;
  branchName: string;
  currentUserFullName: string;
  isViewer: boolean;
  canAdd?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  initialMode?: 'financials' | 'reports';
  onUpdateState: (updater: (prev: GrainMaintenanceState) => GrainMaintenanceState, summary: string) => void;
  onNotify: (type: 'ok' | 'err', text: string) => void;
}

type OfficialReportKey =
  | 'shunas_valuation'
  | 'daily_wheat_receipts'
  | 'shuna_reconciliations'
  | 'refrigerators_summary'
  | 'mills_extraction'
  | 'flour_quotas_daily'
  | 'financial_consolidated';

export const GrainFinancialsAndReportsView: React.FC<GrainFinancialsAndReportsViewProps> = ({
  state,
  branchName,
  currentUserFullName,
  isViewer,
  canAdd = !isViewer,
  canPrint = !isViewer,
  canExport = !isViewer,
  initialMode = 'financials',
  onUpdateState,
  onNotify,
}) => {
  const [mode, setMode] = useState<'financials' | 'reports'>(initialMode);
  const [selectedReport, setSelectedReport] = useState<OfficialReportKey>('daily_wheat_receipts');
  const [hiddenColumnIndices, setHiddenColumnIndices] = useState<number[]>([]);

  const ledger = state.centralFinancialLedger || [];
  const shunas = state.shunas || [];
  const wheatReceipts = state.wheatReceipts || [];
  const wheatIssues = state.wheatIssues || [];
  const shunaReconciliations = state.shunaReconciliations || [];
  const refrigerators = state.refrigerators || [];
  const refAssets = state.refrigeratorAssets || [];
  const mills = state.mills || [];
  const millOps = state.millDailyOperations || [];
  const millAssets = state.millAssets || [];
  const flourQuotas = state.flourQuotaMaster || [];
  const flourDaily = state.flourDailyDistributions || [];

  const today = new Date().toISOString().split('T')[0];

  const [showAddFinModal, setShowAddFinModal] = useState(false);
  const [editingFin, setEditingFin] = useState<GrainDepartmentFinancialEntry | null>(null);
  const [finSearch, setFinSearch] = useState('');
  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    entityType: string;
    onEdit?: () => void;
    fields: { label: string; value: React.ReactNode; mono?: boolean }[];
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    entityId: string;
    entityTitle: string;
    recordSummary: { label: string; value: string | number }[];
  } | null>(null);
  const [newFin, setNewFin] = useState({
    documentNumber: `GFIN-2026-00${ledger.length + 1}`,
    date: today,
    facilityCategory: 'شونة' as GrainDepartmentFinancialEntry['facilityCategory'],
    facilityCode: shunas[0]?.shunaCode || 'SH-MHL-001',
    facilityName: shunas[0]?.shunaName || 'شونة المحلة المركزية المطورة',
    transactionType: 'مصروفات تشغيل وكهرباء' as GrainDepartmentFinancialEntry['transactionType'],
    fixedAssetsValuationAmount: 0,
    inventoryValuationAmount: 0,
    revenuesAmount: 0,
    expensesAmount: 15000,
    receivablesAmount: 0,
    collectedAmount: 0,
    description: '',
  });

  // Consolidated financial summary separating Fixed Assets, Inventory Valuation, and Cash Flows
  const consolidatedSummary = useMemo(() => {
    const shunaCalcs = shunas.map((sh) =>
      computeShunaBookBalanceAndValuation({
        shuna: sh,
        wheatReceipts,
        wheatIssues,
      })
    );
    const shunasFixedAssets = shunaCalcs.reduce((s, c) => s + c.fixedAssetsValuationAmount, 0);
    const shunasInventoryVal = shunaCalcs.reduce((s, c) => s + c.stockValuationAmount, 0);

    const refCalcs = refAssets.map((a) => computeRefrigeratorAssetValuation(a));
    const refsFixedAssets = refCalcs.reduce((s, c) => s + c.totalFixedAssetsValue, 0);
    const refsInventoryVal = refCalcs.reduce((s, c) => s + c.currentStoredInventoryValue, 0);

    const millCalcs = millAssets.map((a) => computeMillAssetValuation(a));
    const millsFixedAssets = millCalcs.reduce((s, c) => s + c.fixedAssetsTotal, 0);
    const millsInventoryVal = millCalcs.reduce((s, c) => s + c.inventoryTotal, 0);

    const totalRevenues = ledger.reduce((s, e) => s + (Number(e.revenuesAmount) || 0), 0);
    const totalExpenses = ledger.reduce((s, e) => s + (Number(e.expensesAmount) || 0), 0);
    const totalReceivables = ledger.reduce((s, e) => s + (Number(e.receivablesAmount) || 0), 0);
    const totalCollected = ledger.reduce((s, e) => s + (Number(e.collectedAmount) || 0), 0);

    return {
      shunasFixedAssets,
      shunasInventoryVal,
      refsFixedAssets,
      refsInventoryVal,
      millsFixedAssets,
      millsInventoryVal,
      grandTotalFixedAssets: shunasFixedAssets + refsFixedAssets + millsFixedAssets,
      grandTotalInventoryVal: shunasInventoryVal + refsInventoryVal + millsInventoryVal,
      totalRevenues,
      totalExpenses,
      netCashMovement: totalRevenues - totalExpenses,
      remainingReceivables: Math.max(0, totalReceivables - totalCollected),
    };
  }, [shunas, wheatReceipts, wheatIssues, refAssets, millAssets, ledger]);

  const handleCreateFinEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const rec: GrainDepartmentFinancialEntry = {
      id: `gfin-${Date.now()}`,
      documentNumber: newFin.documentNumber.trim(),
      date: newFin.date,
      facilityCategory: newFin.facilityCategory,
      facilityCode: newFin.facilityCode,
      facilityName: newFin.facilityName,
      transactionType: newFin.transactionType,
      fixedAssetsValuationAmount: Number(newFin.fixedAssetsValuationAmount) || 0,
      inventoryValuationAmount: Number(newFin.inventoryValuationAmount) || 0,
      revenuesAmount: Number(newFin.revenuesAmount) || 0,
      expensesAmount: Number(newFin.expensesAmount) || 0,
      receivablesAmount: Number(newFin.receivablesAmount) || 0,
      collectedAmount: Number(newFin.collectedAmount) || 0,
      approvalStatus: 'معتمد',
      description: newFin.description || `${newFin.transactionType} - ${newFin.facilityName}`,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        centralFinancialLedger: [rec, ...(prev.centralFinancialLedger || [])],
      }),
      `تسجيل قيد مالي مركزي رقم ${rec.documentNumber} (${rec.transactionType})`
    );
    setShowAddFinModal(false);
    onNotify('ok', `تم اعتماد القيد المالي ${rec.documentNumber} بنجاح.`);
  };

  // Report Builder Dataset based on selectedReport
  const currentReportData = useMemo(() => {
    switch (selectedReport) {
      case 'shunas_valuation': {
        const headers = [
          'كود الشونة',
          'اسم الشونة',
          'القرية',
          'السعة (طن)',
          'الافتتاحي (طن)',
          'الوارد المعتمد (طن)',
          'المنصرف المعتمد (طن)',
          'الرصيد الحالي المحسوب (طن)',
          'قيمة المخزون السلعي (ج.م)',
          'قيمة الأصول والمعدات والميزان (ج.م)',
          'الإجمالي التقديري للشونة (ج.م)',
        ];
        const rows = shunas.map((sh) => {
          const m = computeShunaBookBalanceAndValuation({
            shuna: sh,
            wheatReceipts,
            wheatIssues,
          });
          return [
            sh.shunaCode,
            sh.shunaName,
            sh.village,
            sh.storageCapacityTons,
            m.openingBalanceTons,
            m.approvedInboundTons,
            m.approvedOutboundTons,
            m.currentBookBalanceTons,
            m.stockValuationAmount.toLocaleString('ar-EG'),
            m.fixedAssetsValuationAmount.toLocaleString('ar-EG'),
            m.totalEstimatedShunaValue.toLocaleString('ar-EG'),
          ];
        });
        return {
          title: 'تقرير بيانات الشون وتقييم الأصول والأرصدة المعتمدة',
          subtitle: 'فصل كامل بين قيمة الأصول الثابتة وقيمة المخزون السلعي المحسوب من دفتر استلام القمح',
          headers,
          rows,
        };
      }
      case 'daily_wheat_receipts': {
        const headers = [
          'رقم الإذن',
          'التاريخ',
          'الشونة',
          'اسم المورد / المزارع',
          'السيارة',
          'القائم (كجم)',
          'الفارغ (كجم)',
          'صافي الوزن (طن)',
          'درجة النظافة',
          'المستبعد المعتمد',
          'الوزن المقبول (طن)',
          'سعر الطن',
          'إجمالي القيمة (ج.م)',
          'حالة الاعتماد',
        ];
        const rows = wheatReceipts.map((r) => [
          r.receiptOrderNumber,
          r.receiptDate,
          r.shunaName,
          r.supplierName,
          r.vehicleNumber,
          r.grossWeightKg.toLocaleString('ar-EG'),
          r.tareWeightKg.toLocaleString('ar-EG'),
          r.netWeightTons,
          r.cleanlinessGrade,
          r.excludedWeightTons,
          r.acceptedNetWeightTons,
          r.tonPrice.toLocaleString('ar-EG'),
          r.totalSupplyValue.toLocaleString('ar-EG'),
          r.approvalStatus,
        ]);
        return {
          title: 'تقرير دفتر استلام القمح اليومي الرسمي بالشون',
          subtitle: 'بيان تفصيلي بجميع أذون استلام القمح والأوزان الصافية والمقبولة وقيمة التوريد',
          headers,
          rows,
        };
      }
      case 'shuna_reconciliations': {
        const headers = [
          'رقم محضر المطابقة',
          'التاريخ',
          'الشونة',
          'الرصيد الدفتري المحسوب (طن)',
          'الرصيد الفعلي بالجرد (طن)',
          'فرق الجرد (طن)',
          'حالة المطابقة',
          'رئيس اللجنة',
          'الإجراء المتخذ',
        ];
        const rows = shunaReconciliations.map((rec) => [
          rec.reconciliationNumber,
          rec.reconciliationDate,
          rec.shunaName,
          rec.bookBalanceTons,
          rec.physicalCountTons,
          rec.varianceTons,
          rec.reconciliationStatus,
          rec.committeeHead,
          rec.actionTaken,
        ]);
        return {
          title: 'تقرير مطابقة أرصدة الشون (الدفتري مقابل الجرد الفعلي)',
          subtitle: 'بيان فروق الجرد والتسويات المعتمدة بلجان الفحص',
          headers,
          rows,
        };
      }
      case 'refrigerators_summary': {
        const headers = [
          'كود الثلاجة',
          'اسم الثلاجة',
          'الملكية',
          'القرية',
          'غرف التبريد/التجميد',
          'الطاقة التصميمية (طن)',
          'الطاقة الفعلية (طن)',
          'نظام التبريد',
          'حالة التشغيل',
        ];
        const rows = refrigerators.map((r) => [
          r.refrigeratorCode,
          r.refrigeratorName,
          r.ownershipType,
          r.village,
          `${r.coolingRoomsCount} تبريد / ${r.freezingRoomsCount} تجميد`,
          r.designCapacityTons,
          r.operationalCapacityTons,
          r.coolingSystemType,
          r.operationalStatus,
        ]);
        return {
          title: 'تقرير قاعدة بيانات الثلاجات والطاقة التخزينية',
          subtitle: 'بيان شامل للثلاجات ومخازن التبريد والتجميد التابعة لإشراف القسم',
          headers,
          rows,
        };
      }
      case 'mills_extraction': {
        const headers = [
          'التاريخ',
          'اسم المطحن',
          'القمح المتاح (طن)',
          'القمح المطحون فعلياً (طن)',
          'الدقيق المنتج (طن)',
          'نسبة الاستخراج الفعلية %',
          'نسبة الاستخراج المقررة %',
          'الردة الناتجة (طن)',
          'نسبة الردة %',
          'الفاقد (طن)',
          'نسبة الفاقد %',
        ];
        const rows = millOps.map((op) => [
          op.operationDate,
          op.millName,
          op.totalAvailableWheatTons,
          op.actualMilledWheatTons,
          op.producedFlourTons,
          `${op.actualExtractionPct}%`,
          `${op.standardExtractionPct}%`,
          op.producedBranTons,
          `${op.branPct}%`,
          op.lossOrWasteTons,
          `${op.lossPct}%`,
        ]);
        return {
          title: 'تقرير تشغيل المطاحن ونسب الاستخراج والردة والفاقد',
          subtitle: 'متابعة مطابقة نسبة استخراج الدقيق التمويني (82%) ونواتج الردة والفاقد',
          headers,
          rows,
        };
      }
      case 'flour_quotas_daily': {
        const headers = [
          'التاريخ',
          'اسم المطحن',
          'اسم المخبز',
          'القرية',
          'الحصة اليومية المقررة (طن)',
          'المنصرف الفعلي المعتمد (طن)',
          'المتبقي اليومي (طن)',
          'نسبة التنفيذ %',
          'رقم إذن الصرف',
          'حالة الصرف',
        ];
        const rows = flourDaily.map((d) => [
          d.date,
          d.millName,
          d.bakeryName,
          d.village,
          d.prescribedDailyQuotaTons,
          d.actualApprovedDisbursedTons,
          d.remainingDailyTons,
          `${d.executionPct}%`,
          d.issueOrderNumber,
          d.disbursementStatus,
        ]);
        return {
          title: 'تقرير التوزيع اليومي لحصص الدقيق على المخابز',
          subtitle: `إجمالي المخابز المربوطة بحصص دقيق: (${flourQuotas.length}) مخبز`,
          headers,
          rows,
        };
      }
      case 'financial_consolidated':
      default: {
        const headers = [
          'رقم المستند',
          'التاريخ',
          'فئة المنشأة',
          'اسم المنشأة',
          'نوع القيد المالي',
          'تقييم الأصول الثابتة (ج.م)',
          'تقييم المخزون السلعي (ج.م)',
          'الإيرادات الفعلية (ج.م)',
          'المصروفات والتكاليف (ج.م)',
          'البيان',
        ];
        const rows = ledger.map((e) => [
          e.documentNumber,
          e.date,
          e.facilityCategory,
          e.facilityName,
          e.transactionType,
          e.fixedAssetsValuationAmount.toLocaleString('ar-EG'),
          e.inventoryValuationAmount.toLocaleString('ar-EG'),
          e.revenuesAmount.toLocaleString('ar-EG'),
          e.expensesAmount.toLocaleString('ar-EG'),
          e.description,
        ]);
        return {
          title: 'التقرير المالي المجمع لقسم صيانة الحبوب (الشون والثلاجات والمطاحن)',
          subtitle: 'فصل محاسبي كامل بين تقييم الأصول الثابتة وتقييم المخزون السلعي والحركة النقدية',
          headers,
          rows,
        };
      }
    }
  }, [
    selectedReport,
    shunas,
    wheatReceipts,
    wheatIssues,
    shunaReconciliations,
    refrigerators,
    millOps,
    flourDaily,
    flourQuotas.length,
    ledger,
  ]);

  const visibleHeaders = useMemo(
    () => currentReportData.headers.filter((_, idx) => !hiddenColumnIndices.includes(idx)),
    [currentReportData.headers, hiddenColumnIndices]
  );

  const visibleRows = useMemo(
    () =>
      currentReportData.rows.map((row) =>
        row.filter((_, idx) => !hiddenColumnIndices.includes(idx))
      ),
    [currentReportData.rows, hiddenColumnIndices]
  );

  const toggleColumnVisibility = (idx: number) => {
    setHiddenColumnIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-financials-reports-view">
      {/* التبديل بين دفتر الحسابات المالية المركزي ومركز التقارير الرسمي */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('financials')}
            data-testid="grain-fin-mode-btn"
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 ${
              mode === 'financials'
                ? 'bg-[#0f2342] text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>دفتر الحسابات المالية والتقييم المالي المجمع</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('reports')}
            data-testid="grain-reports-mode-btn"
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 ${
              mode === 'reports'
                ? 'bg-emerald-700 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileBarChart2 className="w-4 h-4" />
            <span>مركز التقارير والطباعة A4 وتصدير Excel (مع اختيار الأعمدة)</span>
          </button>
        </div>
      </div>

      {mode === 'financials' ? (
        <div className="space-y-4">
          {/* بطاقات الفصل المحاسبي بين الأصول الثابتة، المخزون السلعي، والحركة النقدية */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm">
              <div className="text-[11px] font-black text-indigo-700">
                إجمالي تقييم الأصول الثابتة (شون + ثلاجات + مطاحن)
              </div>
              <div className="text-xl font-black text-slate-900 mt-1">
                {consolidatedSummary.grandTotalFixedAssets.toLocaleString('ar-EG')} ج.م
              </div>
              <div className="text-[10px] font-bold text-slate-500 mt-1">
                شون: {consolidatedSummary.shunasFixedAssets.toLocaleString('ar-EG')} | ثلاجات:{' '}
                {consolidatedSummary.refsFixedAssets.toLocaleString('ar-EG')} | مطاحن:{' '}
                {consolidatedSummary.millsFixedAssets.toLocaleString('ar-EG')}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
              <div className="text-[11px] font-black text-emerald-700">
                إجمالي تقييم المخزون السلعي الحالي (قمح + دقيق + سلع مبردة)
              </div>
              <div className="text-xl font-black text-emerald-900 mt-1">
                {consolidatedSummary.grandTotalInventoryVal.toLocaleString('ar-EG')} ج.م
              </div>
              <div className="text-[10px] font-bold text-slate-500 mt-1">
                قمح الشون: {consolidatedSummary.shunasInventoryVal.toLocaleString('ar-EG')} ج.م
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
              <div className="text-[11px] font-black text-amber-800">
                إجمالي القيمة التقديرية الكلية لمنشآت القسم
              </div>
              <div className="text-xl font-black text-amber-900 mt-1">
                {(
                  consolidatedSummary.grandTotalFixedAssets +
                  consolidatedSummary.grandTotalInventoryVal
                ).toLocaleString('ar-EG')}{' '}
                ج.م
              </div>
              <div className="text-[10px] font-bold text-slate-500 mt-1">
                مجموع الأصول الثابتة + المخزون الفعلي المعتمد
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-sky-200 p-4 shadow-sm">
              <div className="text-[11px] font-black text-sky-800">
                صافي الحركة المالية والمستحقات المتبقية
              </div>
              <div className="text-xl font-black text-sky-900 mt-1">
                {consolidatedSummary.netCashMovement.toLocaleString('ar-EG')} ج.م
              </div>
              <div className="text-[10px] font-bold text-rose-700 mt-1">
                مستحقات متبقية للتحصيل:{' '}
                {consolidatedSummary.remainingReceivables.toLocaleString('ar-EG')} ج.م
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  دفتر الحسابات المالية المركزي لقسم صيانة الحبوب
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  يفصل بين قيود تقييم الأصول الثابتة، تقييم المخزون السلعي، والإيرادات والمصروفات الفعلية
                </p>
              </div>
              {canAdd && (
                <button
                  type="button"
                  onClick={() => setShowAddFinModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#0f2342] text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل قيد مالي جديد</span>
                </button>
              )}
            </div>
            <div className="p-3 border-b border-slate-100">
              <SmartTableSearchBar
                query={finSearch}
                onQueryChange={setFinSearch}
                totalMatches={ledger.filter((e) =>
                  matchesSmartSearch(finSearch, [e.documentNumber, e.facilityName, e.facilityCategory, e.transactionType, e.description])
                ).length}
                totalAll={ledger.length}
                placeholder="بحث برقم المستند أو المنشأة أو نوع الحركة أو البيان..."
                testId="grain-fin-ledger-search"
              />
            </div>
            <div className="overflow-x-auto">
              {(() => {
                const filteredLedger = ledger.filter((e) =>
                  matchesSmartSearch(finSearch, [e.documentNumber, e.facilityName, e.facilityCategory, e.transactionType, e.description])
                );
                const sumFixed = filteredLedger.reduce((s, e) => s + (e.fixedAssetsValuationAmount || 0), 0);
                const sumInv = filteredLedger.reduce((s, e) => s + (e.inventoryValuationAmount || 0), 0);
                const sumRev = filteredLedger.reduce((s, e) => s + (e.revenuesAmount || 0), 0);
                const sumExp = filteredLedger.reduce((s, e) => s + (e.expensesAmount || 0), 0);
                return (
                  <table className="w-full text-xs text-right compact-erp-table">
                    <thead className="bg-[#0f2342] text-white font-black">
                      <tr>
                        <th className="p-3">رقم المستند والتاريخ</th>
                        <th className="p-3">الفئة والمنشأة</th>
                        <th className="p-3">نوع الحركة المالية</th>
                        <th className="p-3 text-center">تقييم الأصول الثابتة</th>
                        <th className="p-3 text-center">تقييم المخزون السلعي</th>
                        <th className="p-3 text-center">الإيرادات الفعلية</th>
                        <th className="p-3 text-center">المصروفات والتكاليف</th>
                        <th className="p-3">البيان التفصيلي</th>
                        <th className="p-3 text-center">إدارة السجل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold">
                      {filteredLedger.map((e) => {
                        const openEditFin = () => setEditingFin({ ...e });
                        return (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="p-3">
                              <div className="font-mono font-black text-indigo-900">
                                {e.documentNumber}
                              </div>
                              <div className="text-[10px] text-slate-500">{e.date}</div>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-black ml-1">
                                {e.facilityCategory}
                              </span>
                              <span className="font-black text-slate-900">{e.facilityName}</span>
                            </td>
                            <td className="p-3 font-black text-amber-800">{e.transactionType}</td>
                            <td className="p-3 text-center">
                              {e.fixedAssetsValuationAmount > 0
                                ? `${e.fixedAssetsValuationAmount.toLocaleString('ar-EG')} ج.م`
                                : '-'}
                            </td>
                            <td className="p-3 text-center text-emerald-800">
                              {e.inventoryValuationAmount > 0
                                ? `${e.inventoryValuationAmount.toLocaleString('ar-EG')} ج.م`
                                : '-'}
                            </td>
                            <td className="p-3 text-center text-sky-800">
                              {e.revenuesAmount > 0
                                ? `${e.revenuesAmount.toLocaleString('ar-EG')} ج.م`
                                : '-'}
                            </td>
                            <td className="p-3 text-center text-rose-700">
                              {e.expensesAmount > 0
                                ? `${e.expensesAmount.toLocaleString('ar-EG')} ج.م`
                                : '-'}
                            </td>
                            <td className="p-3 text-slate-600">{e.description}</td>
                            <td className="p-3 text-center">
                              <ModuleRowActions
                                entityLabel={e.documentNumber}
                                updatedAt={(e as unknown as { updatedAt?: string }).updatedAt}
                                permissions={{
                                  canView: true,
                                  canAdd: Boolean(canAdd),
                                  canEdit: !isViewer,
                                  canDelete: !isViewer,
                                  canPrint: Boolean(canPrint),
                                  canExport: Boolean(canExport),
                                  isReadOnly: isViewer,
                                }}
                                testIdPrefix={`grain-fin-row-${e.id}`}
                                onView={() =>
                                  setProfileModal({
                                    isOpen: true,
                                    title: `قيد مالي مركزي رقم: ${e.documentNumber}`,
                                    subtitle: `${e.facilityCategory} — ${e.facilityName}`,
                                    entityType: 'قيد مالي بدفتر حسابات صيانة الحبوب',
                                    onEdit: openEditFin,
                                    fields: [
                                      { label: 'رقم المستند', value: e.documentNumber, mono: true },
                                      { label: 'التاريخ', value: e.date },
                                      { label: 'فئة المنشأة', value: e.facilityCategory },
                                      { label: 'اسم المنشأة', value: e.facilityName },
                                      { label: 'نوع الحركة المالية', value: e.transactionType },
                                      { label: 'تقييم الأصول الثابتة', value: `${e.fixedAssetsValuationAmount.toLocaleString('ar-EG')} ج.م`, mono: true },
                                      { label: 'تقييم المخزون السلعي', value: `${e.inventoryValuationAmount.toLocaleString('ar-EG')} ج.م`, mono: true },
                                      { label: 'الإيرادات الفعلية', value: `${e.revenuesAmount.toLocaleString('ar-EG')} ج.م`, mono: true },
                                      { label: 'المصروفات والتكاليف', value: `${e.expensesAmount.toLocaleString('ar-EG')} ج.م`, mono: true },
                                      { label: 'البيان التفصيلي', value: e.description },
                                    ],
                                  })
                                }
                                onEdit={openEditFin}
                                onDelete={() =>
                                  setDeleteModal({
                                    isOpen: true,
                                    entityId: e.id,
                                    entityTitle: e.documentNumber,
                                    recordSummary: [
                                      { label: 'رقم المستند', value: e.documentNumber },
                                      { label: 'المنشأة', value: e.facilityName },
                                      { label: 'البيان', value: e.description },
                                    ],
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <VillageGrandTotalRow
                        totalCount={filteredLedger.length}
                        labelColSpan={3}
                        title="الإجمالي العام لدفتر الحسابات المركزي TOTAL"
                        metricCells={[
                          { content: `${sumFixed.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: `${sumInv.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: `${sumRev.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: `${sumExp.toLocaleString('ar-EG')} ج.م`, mono: true },
                          { content: '—', colSpan: 2 },
                        ]}
                      />
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        /* مركز التقارير والطباعة A4 وتصدير Excel مع اختيار الأعمدة */
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  مركز التقارير الرسمية والطباعة A4 وتصدير Excel (قسم صيانة الحبوب)
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  اختر التقرير المطلوب، وحدد الأعمدة التي ترغب في إظهارها أو إخفائها قبل التصدير أو الطباعة الرسمية
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canExport && (
                  <button
                    type="button"
                    onClick={() =>
                      exportRowsToArabicCsv(
                        `grain_report_${selectedReport}`,
                        visibleHeaders,
                        visibleRows
                      )
                    }
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير التقرير المعروض Excel</span>
                  </button>
                )}
                {canPrint && (
                  <button
                    type="button"
                    onClick={() =>
                      printModuleReportA4({
                        title: currentReportData.title,
                        subtitle: currentReportData.subtitle,
                        branchName,
                        headers: visibleHeaders,
                        rows: visibleRows,
                        preparedBy: currentUserFullName,
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-[#0f2342] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة رسمية A4 بالهيدر والتوقيعات</span>
                  </button>
                )}
              </div>
            </div>

            {/* أزرار اختيار نوع التقرير */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              {[
                { id: 'daily_wheat_receipts', label: '1. تقرير دفتر استلام القمح اليومي بالشون' },
                { id: 'shunas_valuation', label: '2. تقرير الشون وتقييم الأصول والأرصدة' },
                { id: 'shuna_reconciliations', label: '3. تقرير مطابقة أرصدة الشون وفروق الجرد' },
                { id: 'refrigerators_summary', label: '4. تقرير قاعدة بيانات الثلاجات والطاقة' },
                { id: 'mills_extraction', label: '5. تقرير تشغيل المطاحن ونسب الاستخراج (82%)' },
                { id: 'flour_quotas_daily', label: '6. تقرير التوزيع اليومي لحصص الدقيق للمخابز' },
                { id: 'financial_consolidated', label: '7. التقرير المالي المجمع لقسم صيانة الحبوب' },
              ].map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => {
                    setSelectedReport(rep.id as OfficialReportKey);
                    setHiddenColumnIndices([]);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                    selectedReport === rep.id
                      ? 'bg-emerald-700 text-white shadow'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {rep.label}
                </button>
              ))}
            </div>

            {/* التحكم في إظهار / إخفاء الأعمدة */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 mb-2">
                <Columns3 className="w-4 h-4 text-indigo-600" />
                <span>تخصيص الأعمدة المعروضة في التقرير والطباعة:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {currentReportData.headers.map((h, idx) => {
                  const isVisible = !hiddenColumnIndices.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleColumnVisibility(idx)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all ${
                        isVisible
                          ? 'bg-white border-emerald-400 text-emerald-900'
                          : 'bg-slate-200 border-slate-300 text-slate-500 line-through'
                      }`}
                    >
                      {isVisible ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{h}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* معاينة جدول التقرير بشعار الوزارة المثبت وتجميع الوحدة المحلية والقرية */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b-2 border-[#0A1931] bg-slate-50 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={MINISTRY_LOGO_URL}
                  alt="شعار وزارة التموين والتجارة الداخلية"
                  className="w-16 h-16 object-contain rounded-xl border border-slate-300 bg-white p-1 shadow-xs shrink-0"
                />
                <div>
                  <div className="text-[11px] font-black text-slate-600">
                    جمهورية مصر العربية — وزارة التموين والتجارة الداخلية
                  </div>
                  <div className="text-xs font-black text-[#0A1931]">
                    محافظة الغربية — مديرية التموين والتجارة الداخلية بالغربية
                  </div>
                  <div className="text-xs font-black text-teal-700">
                    {branchName} • قسم صيانة الحبوب والمطاحن والشون
                  </div>
                </div>
              </div>
              <div className="text-center">
                <h4 className="text-sm sm:text-base font-black text-[#0A1931]">{currentReportData.title}</h4>
                <p className="text-xs font-bold text-slate-600 mt-0.5">{currentReportData.subtitle}</p>
              </div>
              <div className="text-left text-[11px] font-bold text-slate-700 space-y-0.5">
                <div>تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</div>
                <div>إجمالي السجلات: {visibleRows.length} سجل</div>
                <div>إعداد: {currentUserFullName}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right compact-erp-table">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    {visibleHeaders.map((h, i) => (
                      <th key={i} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {visibleRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-3">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {visibleHeaders.length > 0 && visibleRows.length > 0 && (() => {
                  const grouped = computeReportSubtotalsByLocalUnitAndVillage(visibleHeaders, visibleRows);
                  return (
                    <tfoot className="font-black text-xs">
                      {grouped.localUnitColIdx >= 0 &&
                        grouped.localUnitTotals.map((lu) => (
                          <tr key={`lu-${lu.localUnit}`} className="bg-sky-100/90 text-sky-950 border-t-2 border-sky-300">
                            {visibleHeaders.map((_, idx) => {
                              let val: string | number = '—';
                              if (idx === 0) val = `إجمالي الوحدة المحلية: ${lu.localUnit}`;
                              else if (idx === grouped.localUnitColIdx) val = lu.localUnit;
                              else if (idx === 1 && lu.columnSums[1] === null) val = `${lu.count} سجل`;
                              else if (lu.columnSums[idx] !== null) val = lu.columnSums[idx]!.toLocaleString('ar-EG');
                              return (
                                <td key={idx} className="p-2.5 border border-sky-200 text-center">
                                  {val}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      {grouped.villageColIdx >= 0 &&
                        grouped.villageTotals.map((v) => (
                          <tr key={`vil-${v.localUnit}-${v.village}`} className="bg-amber-50/90 text-amber-950 border-t border-amber-300">
                            {visibleHeaders.map((_, idx) => {
                              let val: string | number = '—';
                              if (idx === 0) val = `إجمالي القرية: ${v.village}`;
                              else if (idx === grouped.localUnitColIdx) val = v.localUnit;
                              else if (idx === grouped.villageColIdx) val = v.village;
                              else if (idx === 1 && v.columnSums[1] === null) val = `${v.count} سجل`;
                              else if (v.columnSums[idx] !== null) val = v.columnSums[idx]!.toLocaleString('ar-EG');
                              return (
                                <td key={idx} className="p-2.5 border border-amber-200 text-center">
                                  {val}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      <tr className="bg-[#0A1931] text-white border-t-2 border-[#D4AF37]">
                        {grouped.grandTotalRow.map((cell, idx) => (
                          <td key={idx} className="p-2.5 border border-slate-700 text-center">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تسجيل قيد مالي مركزي جديد */}
      {showAddFinModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل قيد مالي جديد بدفتر الحسابات المركزي لقسم صيانة الحبوب
            </h3>
            <form onSubmit={handleCreateFinEntry} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم المستند</label>
                  <input
                    type="text"
                    required
                    value={newFin.documentNumber}
                    onChange={(e) => setNewFin({ ...newFin, documentNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">فئة المنشأة</label>
                  <select
                    value={newFin.facilityCategory}
                    onChange={(e) =>
                      setNewFin({ ...newFin, facilityCategory: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="شونة">شونة</option>
                    <option value="ثلاجة">ثلاجة</option>
                    <option value="مطحن">مطحن</option>
                    <option value="حصص دقيق">حصص دقيق</option>
                    <option value="صيانة مركزية">صيانة مركزية</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم المنشأة</label>
                  <input
                    type="text"
                    required
                    value={newFin.facilityName}
                    onChange={(e) => setNewFin({ ...newFin, facilityName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نوع الحركة المالية</label>
                  <select
                    value={newFin.transactionType}
                    onChange={(e) =>
                      setNewFin({ ...newFin, transactionType: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="تقييم أصول ثابتة">تقييم أصول ثابتة</option>
                    <option value="تقييم مخزون سلعي">تقييم مخزون سلعي</option>
                    <option value="إيراد تخزين وتشغيل">إيراد تخزين وتشغيل</option>
                    <option value="مصروفات تشغيل وكهرباء">مصروفات تشغيل وكهرباء</option>
                    <option value="تكلفة صيانة وقطع غيار">تكلفة صيانة وقطع غيار</option>
                    <option value="تحصيل مستحقات">تحصيل مستحقات</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">مبلغ الإيرادات (ج.م)</label>
                  <input
                    type="number"
                    value={newFin.revenuesAmount}
                    onChange={(e) =>
                      setNewFin({ ...newFin, revenuesAmount: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">مبلغ المصروفات (ج.م)</label>
                  <input
                    type="number"
                    value={newFin.expensesAmount}
                    onChange={(e) =>
                      setNewFin({ ...newFin, expensesAmount: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">البيان التفصيلي</label>
                  <input
                    type="text"
                    required
                    value={newFin.description}
                    onChange={(e) => setNewFin({ ...newFin, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddFinModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0f2342] text-white font-black"
                >
                  حفظ القيد المالي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تعديل قيد مالي */}
      {editingFin && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تعديل القيد المالي: {editingFin.documentNumber}
            </h3>
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                onUpdateState(
                  (prev) => ({
                    ...prev,
                    centralFinancialLedger: (prev.centralFinancialLedger || []).map((item) =>
                      item.id === editingFin.id ? { ...editingFin, updatedAt: new Date().toISOString() } : item
                    ),
                  }),
                  `تعديل قيد مالي: ${editingFin.documentNumber}`
                );
                setEditingFin(null);
                onNotify('ok', `تم تعديل القيد المالي «${editingFin.documentNumber}» بنجاح.`);
              }}
              className="space-y-4 text-xs font-bold"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم المستند</label>
                  <input
                    type="text"
                    required
                    value={editingFin.documentNumber}
                    onChange={(e) => setEditingFin({ ...editingFin, documentNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم المنشأة</label>
                  <input
                    type="text"
                    required
                    value={editingFin.facilityName}
                    onChange={(e) => setEditingFin({ ...editingFin, facilityName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الإيرادات (ج.م)</label>
                  <input
                    type="number"
                    value={editingFin.revenuesAmount}
                    onChange={(e) => setEditingFin({ ...editingFin, revenuesAmount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المصروفات (ج.م)</label>
                  <input
                    type="number"
                    value={editingFin.expensesAmount}
                    onChange={(e) => setEditingFin({ ...editingFin, expensesAmount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">البيان التفصيلي</label>
                  <input
                    type="text"
                    required
                    value={editingFin.description}
                    onChange={(e) => setEditingFin({ ...editingFin, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingFin(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#0f2342] text-white font-black"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {profileModal && (
        <ModuleRecordProfileModal
          isOpen={profileModal.isOpen}
          title={profileModal.title}
          subtitle={profileModal.subtitle}
          entityType={profileModal.entityType}
          fields={profileModal.fields}
          canEdit={!isViewer}
          onEdit={profileModal.onEdit}
          onClose={() => setProfileModal(null)}
        />
      )}

      {deleteModal && (
        <ModuleDeleteConfirmModal
          isOpen={deleteModal.isOpen}
          entityTitle={deleteModal.entityTitle}
          recordSummary={deleteModal.recordSummary}
          canDelete={!isViewer}
          onClose={() => setDeleteModal(null)}
          onConfirmDelete={() => {
            onUpdateState(
              (prev) => ({
                ...prev,
                centralFinancialLedger: (prev.centralFinancialLedger || []).filter((item) => item.id !== deleteModal.entityId),
              }),
              `حذف قيد مالي: ${deleteModal.entityTitle}`
            );
            setDeleteModal(null);
            onNotify('ok', `تم حذف القيد المالي «${deleteModal.entityTitle}» بنجاح.`);
          }}
        />
      )}
    </div>
  );
};
