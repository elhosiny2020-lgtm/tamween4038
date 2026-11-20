import React, { useMemo, useState } from 'react';
import {
  Factory,
  FileBadge,
  Truck,
  Activity,
  PackageCheck,
  Cog,
  Wrench,
  ClipboardCheck,
  Landmark,
  Plus,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import type {
  GrainMaintenanceState,
  MillDailyOperationRecord,
  MillInspectionVisitRecord,
  MillProductionRecord,
  MillRecord,
  MillWheatReceiptRecord,
} from '../../../types/modules';
import type { VillageHierarchy } from '../../../types';
import {
  computeMillAssetValuation,
  computeMillExtractionAndLoss,
} from '../../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../../services/modulesStorage';

interface MillsDatabaseViewProps {
  state: GrainMaintenanceState;
  branchName: string;
  currentUserFullName: string;
  isViewer: boolean;
  canAdd?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  villages: VillageHierarchy[];
  onUpdateState: (updater: (prev: GrainMaintenanceState) => GrainMaintenanceState, summary: string) => void;
  onNotify: (type: 'ok' | 'err', text: string) => void;
}

export const MillsDatabaseView: React.FC<MillsDatabaseViewProps> = ({
  state,
  branchName,
  currentUserFullName,
  isViewer,
  canAdd = !isViewer,
  canPrint = !isViewer,
  canExport = !isViewer,
  villages,
  onUpdateState,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<
    | 'registry'
    | 'licenses'
    | 'wheat_receipts'
    | 'daily_operations'
    | 'production'
    | 'machinery'
    | 'maintenance'
    | 'inspections'
    | 'assets'
  >('registry');

  const mills = state.mills || [];
  const licenses = state.millLicenses || [];
  const wheatReceipts = state.millWheatReceipts || [];
  const dailyOperations = state.millDailyOperations || [];
  const productions = state.millProductions || [];
  const machinery = state.millMachinery || [];
  const maintenance = state.millMaintenance || [];
  const inspections = state.millInspections || [];
  const assets = state.millAssets || [];
  const shunaWheatIssues = state.wheatIssues || [];

  const today = new Date().toISOString().split('T')[0];

  // Add Mill Modal
  const [showAddMillModal, setShowAddMillModal] = useState(false);
  const [newMill, setNewMill] = useState({
    millCode: `MILL-MHL-0${mills.length + 1}`,
    millName: '',
    ownerCompany: '',
    operatingEntity: '',
    millSectorType: 'قطاع خاص' as MillRecord['millSectorType'],
    villageOrArea: villages[0]?.village || 'بشبيش',
    detailedAddress: '',
    phone: '',
    managerName: '',
    technicalOfficer: '',
    adminOfficer: '',
    dailyMillingCapacityTons: 150,
    millingLinesCount: 2,
    shiftsCount: 2,
    dailyOperatingHours: 16,
    wheatTypeUsed: 'قمح تمويني (محلي + مستورد)',
    producedFlourType: 'دقيق بلدي تمويني استخراج 82%',
    operationalStatus: 'يعمل' as MillRecord['operationalStatus'],
    notes: '',
  });

  // Add Daily Operation & Extraction Modal
  const [showAddOpModal, setShowAddOpModal] = useState(false);
  const [newOp, setNewOp] = useState({
    operationDate: today,
    millCode: mills[0]?.millCode || 'MILL-MHL-01',
    openingWheatBalanceTons: 285,
    inboundWheatTodayTons: 85,
    actualMilledWheatTons: 200,
    producedFlourTons: 164,
    standardExtractionPct: state.settings?.defaultStandardExtractionPct || 82,
    producedBranTons: 34,
    secondaryOutputsTons: 1.2,
    operatingHours: 20,
    downtimeHours: 0,
    downtimeReason: 'تشغيل منتظم',
    notes: '',
  });

  // Add Mill Wheat Receipt linked to Shuna Issue Order
  const [showAddWheatRecModal, setShowAddWheatRecModal] = useState(false);
  const [newWheatRec, setNewWheatRec] = useState({
    receiptOrderNumber: `MWR-2026-${705 + wheatReceipts.length}`,
    receiptDate: today,
    millCode: mills[0]?.millCode || 'MILL-MHL-01',
    linkedShunaIssueOrderNumber: shunaWheatIssues[0]?.issueOrderNumber || 'WI-2026-501',
    grossWeightTons: 65,
    tareWeightTons: 15,
    moisturePct: 11.8,
    impuritiesPct: 0.6,
    cleanlinessGrade: '23.5 قيراط',
    tonPrice: state.settings?.defaultWheatTonPrice || 13333.33,
    receiverName: currentUserFullName,
    notes: '',
  });

  // Add Mill Inspection Modal
  const [showAddInspModal, setShowAddInspModal] = useState(false);
  const [newInsp, setNewInsp] = useState({
    reportNumber: `INSP-MILL-2026-${20 + inspections.length}`,
    visitDate: today,
    millCode: mills[0]?.millCode || 'MILL-MHL-01',
    inspectorsCommittee: 'م/ سامي المتولي، لجنة الرقابة على المطاحن',
    generalCleanlinessStatus: 'مطابق' as MillInspectionVisitRecord['generalCleanlinessStatus'],
    machineryConditionStatus: 'جيدة' as MillInspectionVisitRecord['machineryConditionStatus'],
    balancesMatchStatus: 'مطابق' as MillInspectionVisitRecord['balancesMatchStatus'],
    extractionMatchStatus: 'مطابق للمعدل (82%)' as MillInspectionVisitRecord['extractionMatchStatus'],
    observedViolations: 'لا توجد مخالفات',
    legalOrAdminActions: 'إثبات الحالة بسجل التفتيش',
    recommendations: 'استمرار المتابعة الدورية',
  });

  const liveOpCalc = useMemo(
    () =>
      computeMillExtractionAndLoss({
        openingWheatBalanceTons: newOp.openingWheatBalanceTons,
        inboundWheatTodayTons: newOp.inboundWheatTodayTons,
        actualMilledWheatTons: newOp.actualMilledWheatTons,
        producedFlourTons: newOp.producedFlourTons,
        producedBranTons: newOp.producedBranTons,
        secondaryOutputsTons: newOp.secondaryOutputsTons,
        standardExtractionPct: newOp.standardExtractionPct,
        maxAllowedVariancePct: state.settings?.maxAllowedExtractionVariancePct || 1.5,
      }),
    [newOp, state.settings?.maxAllowedExtractionVariancePct]
  );

  const handleCreateMill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMill.millName.trim()) {
      onNotify('err', 'يرجى إدخال اسم المطحن.');
      return;
    }
    const dailyCap = Number(newMill.dailyMillingCapacityTons) || 0;
    const rec: MillRecord = {
      id: `mill-${Date.now()}`,
      serialNo: mills.length + 1,
      millCode: newMill.millCode.trim(),
      millName: newMill.millName.trim(),
      ownerCompany: newMill.ownerCompany || 'غير محدد',
      operatingEntity: newMill.operatingEntity || 'غير محدد',
      millSectorType: newMill.millSectorType,
      governorate: 'الغربية',
      center: branchName,
      villageOrArea: newMill.villageOrArea,
      detailedAddress: newMill.detailedAddress,
      phone: newMill.phone,
      managerName: newMill.managerName,
      technicalOfficer: newMill.technicalOfficer,
      adminOfficer: newMill.adminOfficer,
      dailyMillingCapacityTons: dailyCap,
      monthlyMillingCapacityTons: dailyCap * 30,
      millingLinesCount: Number(newMill.millingLinesCount) || 1,
      shiftsCount: Number(newMill.shiftsCount) || 1,
      dailyOperatingHours: Number(newMill.dailyOperatingHours) || 16,
      wheatTypeUsed: newMill.wheatTypeUsed,
      producedFlourType: newMill.producedFlourType,
      operationalStatus: newMill.operationalStatus,
      startDate: today,
      lastInspectionDate: today,
      notes: newMill.notes,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        mills: [...(prev.mills || []), rec],
      }),
      `إضافة مطحن جديد: ${rec.millName} (${rec.millCode})`
    );
    setShowAddMillModal(false);
    onNotify('ok', `تم تسجيل المطحن «${rec.millName}» بنجاح.`);
  };

  const handleCreateMillDailyOperation = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMill = mills.find((m) => m.millCode === newOp.millCode);
    if (!targetMill) return;

    const opRec: MillDailyOperationRecord = {
      id: `mop-${Date.now()}`,
      serialNo: dailyOperations.length + 1,
      operationDate: newOp.operationDate,
      millCode: targetMill.millCode,
      millName: targetMill.millName,
      openingWheatBalanceTons: Number(newOp.openingWheatBalanceTons),
      inboundWheatTodayTons: Number(newOp.inboundWheatTodayTons),
      totalAvailableWheatTons: liveOpCalc.totalAvailableWheatTons,
      actualMilledWheatTons: Number(newOp.actualMilledWheatTons),
      closingWheatBalanceTons: liveOpCalc.closingWheatBalanceTons,
      producedFlourTons: Number(newOp.producedFlourTons),
      actualExtractionPct: liveOpCalc.actualExtractionPct,
      standardExtractionPct: Number(newOp.standardExtractionPct),
      producedBranTons: Number(newOp.producedBranTons),
      branPct: liveOpCalc.branPct,
      secondaryOutputsTons: Number(newOp.secondaryOutputsTons),
      lossOrWasteTons: liveOpCalc.lossOrWasteTons,
      lossPct: liveOpCalc.lossPct,
      operatingHours: Number(newOp.operatingHours),
      downtimeHours: Number(newOp.downtimeHours),
      downtimeReason: newOp.downtimeReason,
      notes: newOp.notes,
    };

    // Also create a corresponding approved production batch record & update Mill Flour Stock Balance
    const sacksCount = Math.round((opRec.producedFlourTons * 1000) / 50);
    const flourTonPrice = state.settings?.defaultFlourTonPrice || 16000;
    const prodRec: MillProductionRecord = {
      id: `mprd-${Date.now()}`,
      serialNo: productions.length + 1,
      batchNumber: `BATCH-FLR-${Date.now().toString().slice(-4)}`,
      productionDate: opRec.operationDate,
      millCode: targetMill.millCode,
      millName: targetMill.millName,
      producedFlourType: targetMill.producedFlourType,
      inputWheatTons: opRec.actualMilledWheatTons,
      outputFlourTons: opRec.producedFlourTons,
      producedSacksCount: sacksCount,
      sackWeightKg: 50,
      targetProductionTons: Number(
        ((opRec.actualMilledWheatTons * opRec.standardExtractionPct) / 100).toFixed(3)
      ),
      targetAchievementPct: Number(
        ((opRec.actualExtractionPct || liveOpCalc.actualExtractionPct) /
          opRec.standardExtractionPct *
          100).toFixed(2)
      ),
      tonPrice: flourTonPrice,
      totalProducedFlourValue: Number((opRec.producedFlourTons * flourTonPrice).toFixed(2)),
      flourStockBeforeTons: 100,
      flourStockAfterTons: Number((100 + opRec.producedFlourTons).toFixed(3)),
      approvalStatus: 'معتمد',
      notes: `ترحيل تلقائي من تشغيل يوم ${opRec.operationDate} (استخراج ${liveOpCalc.actualExtractionPct}%)`,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        millDailyOperations: [opRec, ...(prev.millDailyOperations || [])],
        millProductions: [prodRec, ...(prev.millProductions || [])],
        millFlourStockBalances: (prev.millFlourStockBalances || []).map((b) =>
          b.millCode === targetMill.millCode
            ? {
                ...b,
                approvedProducedTons: Number(
                  (b.approvedProducedTons + opRec.producedFlourTons).toFixed(3)
                ),
              }
            : b
        ),
      }),
      `تسجيل تشغيل يومي وإنتاج دقيق للمطحن ${targetMill.millName} (استخراج ${liveOpCalc.actualExtractionPct}%)`
    );
    setShowAddOpModal(false);
    onNotify(
      liveOpCalc.isExtractionAbnormal ? 'err' : 'ok',
      liveOpCalc.isExtractionAbnormal
        ? `تنبيه رقابي: تم تسجيل التشغيل ولكن نسبة الاستخراج (${liveOpCalc.actualExtractionPct}%) تنحرف عن المعدل المقرر (${opRec.standardExtractionPct}%)!`
        : `تم تسجيل التشغيل اليومي وإضافة ${opRec.producedFlourTons} طن دقيق لمخزن المطحن.`
    );
  };

  const handleCreateMillWheatReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMill = mills.find((m) => m.millCode === newWheatRec.millCode);
    const linkedIssue = shunaWheatIssues.find(
      (i) => i.issueOrderNumber === newWheatRec.linkedShunaIssueOrderNumber
    );
    const netTons = Number((newWheatRec.grossWeightTons - newWheatRec.tareWeightTons).toFixed(3));
    if (netTons <= 0) {
      onNotify('err', 'الوزن القائم يجب أن يكون أكبر من الوزن الفارغ.');
      return;
    }

    const rec: MillWheatReceiptRecord = {
      id: `mwr-${Date.now()}`,
      serialNo: wheatReceipts.length + 1,
      receiptOrderNumber: newWheatRec.receiptOrderNumber.trim(),
      receiptDate: newWheatRec.receiptDate,
      millCode: newWheatRec.millCode,
      millName: targetMill?.millName || newWheatRec.millCode,
      sourceShunaOrSiloName: linkedIssue?.shunaName || 'شونة المحلة المركزية المطورة',
      linkedShunaIssueOrderNumber: newWheatRec.linkedShunaIssueOrderNumber,
      wheatType: linkedIssue?.wheatType || 'محلي',
      grossWeightTons: Number(newWheatRec.grossWeightTons),
      tareWeightTons: Number(newWheatRec.tareWeightTons),
      netReceivedWeightTons: netTons,
      moisturePct: Number(newWheatRec.moisturePct),
      impuritiesPct: Number(newWheatRec.impuritiesPct),
      cleanlinessGrade: newWheatRec.cleanlinessGrade,
      acceptedMillingWeightTons: netTons,
      tonPrice: Number(newWheatRec.tonPrice),
      totalValue: Number((netTons * Number(newWheatRec.tonPrice)).toFixed(2)),
      receiverName: newWheatRec.receiverName,
      approvalStatus: 'معتمد',
      notes: newWheatRec.notes,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        millWheatReceipts: [rec, ...(prev.millWheatReceipts || [])],
      }),
      `استلام قمح بالمطحن ${rec.millName} بموجب إذن صرف شونة رقم ${rec.linkedShunaIssueOrderNumber}`
    );
    setShowAddWheatRecModal(false);
    onNotify('ok', `تم اعتماد استلام ${netTons} طن قمح بالمطحن مربوطاً بإذن الشونة ${rec.linkedShunaIssueOrderNumber}.`);
  };

  const handleCreateMillInspection = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMill = mills.find((m) => m.millCode === newInsp.millCode);
    const rec: MillInspectionVisitRecord = {
      id: `minsp-${Date.now()}`,
      reportNumber: newInsp.reportNumber.trim(),
      visitDate: newInsp.visitDate,
      millCode: newInsp.millCode,
      millName: targetMill?.millName || newInsp.millCode,
      inspectorsCommittee: newInsp.inspectorsCommittee,
      generalCleanlinessStatus: newInsp.generalCleanlinessStatus,
      machineryConditionStatus: newInsp.machineryConditionStatus,
      balancesMatchStatus: newInsp.balancesMatchStatus,
      extractionMatchStatus: newInsp.extractionMatchStatus,
      observedViolations: newInsp.observedViolations,
      legalOrAdminActions: newInsp.legalOrAdminActions,
      recommendations: newInsp.recommendations,
      followUpStatus: 'قيد المتابعة',
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        millInspections: [rec, ...(prev.millInspections || [])],
      }),
      `تسجيل محضر مرور وتفتيش دوري على ${rec.millName}`
    );
    setShowAddInspModal(false);
    onNotify('ok', `تم حفظ محضر المرور الدوري رقم ${rec.reportNumber} بنجاح.`);
  };

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-mills-view">
      {/* التبويبات الفرعية لقاعدة بيانات المطاحن (9 جداول مترابطة) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-1.5">
        {[
          { id: 'registry', label: '1. سجل المطاحن الرئيسي (25 عموداً)', icon: <Factory className="w-4 h-4" /> },
          { id: 'licenses', label: '2. التراخيص والمستندات', icon: <FileBadge className="w-4 h-4" /> },
          { id: 'wheat_receipts', label: '3. دفتر استلام القمح بالمطاحن', icon: <Truck className="w-4 h-4" /> },
          { id: 'daily_operations', label: '4. التشغيل اليومي ونسب الاستخراج (82%)', icon: <Activity className="w-4 h-4" /> },
          { id: 'production', label: '5. سجل إنتاج الدقيق والشكائر', icon: <PackageCheck className="w-4 h-4" /> },
          { id: 'machinery', label: '6. معدات المطاحن وخطوط الطحن', icon: <Cog className="w-4 h-4" /> },
          { id: 'maintenance', label: '7. صيانة المطاحن والأعطال', icon: <Wrench className="w-4 h-4" /> },
          { id: 'inspections', label: '8. الفحص والمرور الدوري', icon: <ClipboardCheck className="w-4 h-4" /> },
          { id: 'assets', label: '9. التقييم المالي وأصول المطاحن', icon: <Landmark className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as any)}
            data-testid={`mill-subtab-${t.id}`}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              subTab === t.id
                ? 'bg-indigo-950 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 1. سجل المطاحن الرئيسي */}
      {subTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل المطاحن التموينية التابعة لنطاق الرقابة (قطاع عام وقطاع خاص)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                يتضمن القدرة الطحنية اليومية والشهرية، خطوط الطحن، الورديات، نوع القمح المستخدم، ونوع الدقيق المنتج
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canAdd && (
                <button
                  type="button"
                  onClick={() => setShowAddMillModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مطحن جديد</span>
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToArabicCsv(
                      'mills_registry',
                      [
                        'م',
                        'كود المطحن',
                        'اسم المطحن',
                        'الشركة المالكة',
                        'الجهة المشغلة',
                        'القطاع',
                        'القرية/المنطقة',
                        'العنوان',
                        'الهاتف',
                        'مدير المطحن',
                        'المسؤول الفني',
                        'القدرة اليومية (طن)',
                        'القدرة الشهرية (طن)',
                        'خطوط الطحن',
                        'الورديات',
                        'ساعات التشغيل',
                        'نوع القمح',
                        'نوع الدقيق المنتج',
                        'حالة التشغيل',
                        'آخر تفتيش',
                      ],
                      mills.map((m) => [
                        m.serialNo,
                        m.millCode,
                        m.millName,
                        m.ownerCompany,
                        m.operatingEntity,
                        m.millSectorType,
                        m.villageOrArea,
                        m.detailedAddress,
                        m.phone,
                        m.managerName,
                        m.technicalOfficer,
                        m.dailyMillingCapacityTons,
                        m.monthlyMillingCapacityTons,
                        m.millingLinesCount,
                        m.shiftsCount,
                        m.dailyOperatingHours,
                        m.wheatTypeUsed,
                        m.producedFlourType,
                        m.operationalStatus,
                        m.lastInspectionDate,
                      ])
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير Excel</span>
                </button>
              )}
              {canPrint && (
                <button
                  type="button"
                  onClick={() =>
                    printModuleReportA4({
                      title: 'سجل المطاحن التموينية والقدرات الطحنية',
                      subtitle: 'بيان المطاحن العاملة وخطوط الطحن ونوع الدقيق المنتج',
                      branchName,
                      headers: [
                        'كود المطحن',
                        'اسم المطحن',
                        'القطاع والشركة',
                        'المنطقة والعنوان',
                        'مدير المطحن / الفني',
                        'القدرة (يومي/شهري)',
                        'الخطوط والورديات',
                        'الدقيق المنتج',
                        'الحالة',
                      ],
                      rows: mills.map((m) => [
                        m.millCode,
                        m.millName,
                        `${m.millSectorType} - ${m.ownerCompany}`,
                        `${m.villageOrArea} - ${m.detailedAddress}`,
                        `${m.managerName} | ${m.technicalOfficer}`,
                        `${m.dailyMillingCapacityTons} / ${m.monthlyMillingCapacityTons} طن`,
                        `${m.millingLinesCount} خط / ${m.shiftsCount} وردية`,
                        m.producedFlourType,
                        m.operationalStatus,
                      ]),
                      preparedBy: currentUserFullName,
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-[#0f2342] text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة A4</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">كود المطحن</th>
                    <th className="p-3">اسم المطحن والقطاع</th>
                    <th className="p-3">الشركة المالكة والمشغلة</th>
                    <th className="p-3">المنطقة والعنوان</th>
                    <th className="p-3">المدير والمسؤول الفني</th>
                    <th className="p-3 text-center">القدرة الطحنية (يومي / شهري)</th>
                    <th className="p-3 text-center">الخطوط والورديات</th>
                    <th className="p-3">نوع الدقيق المنتج</th>
                    <th className="p-3 text-center">الحالة وآخر تفتيش</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {mills.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-black text-indigo-800">{m.millCode}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{m.millName}</div>
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-black">
                          {m.millSectorType}
                        </span>
                      </td>
                      <td className="p-3">
                        <div>{m.ownerCompany}</div>
                        <div className="text-[10px] text-slate-500">{m.operatingEntity}</div>
                      </td>
                      <td className="p-3">
                        <div>{m.villageOrArea}</div>
                        <div className="text-[10px] text-slate-500">{m.detailedAddress}</div>
                      </td>
                      <td className="p-3">
                        <div>مدير: {m.managerName}</div>
                        <div className="text-[10px] text-slate-500">
                          فني: {m.technicalOfficer} | {m.phone}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-black text-emerald-800">
                          {m.dailyMillingCapacityTons} طن/يوم
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {m.monthlyMillingCapacityTons.toLocaleString('ar-EG')} طن/شهر
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div>{m.millingLinesCount} خطوط طحن</div>
                        <div className="text-[10px] text-slate-500">
                          {m.shiftsCount} وردية ({m.dailyOperatingHours} س)
                        </div>
                      </td>
                      <td className="p-3 text-indigo-900 font-black">{m.producedFlourType}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-black ${
                            m.operationalStatus === 'يعمل'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {m.operationalStatus}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          تفتيش: {m.lastInspectionDate}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. تراخيص ومستندات المطاحن */}
      {subTab === 'licenses' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              سجل تراخيص ومستندات المطاحن وشهادات السلامة المهنية
            </h3>
            <p className="text-xs font-bold text-slate-500">
              يتابع صلاحية التراخيص والسجل التجاري والبطاقة الضريبية وعقود التشغيل مع تنبيه مبكر قبل الانتهاء
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">المطحن</th>
                  <th className="p-3">رقم الترخيص</th>
                  <th className="p-3 text-center">الإصدار / الانتهاء</th>
                  <th className="p-3">السجل التجاري والضريبية</th>
                  <th className="p-3">عقد التشغيل والملكية</th>
                  <th className="p-3">شهادات السلامة والصحة المهنية</th>
                  <th className="p-3 text-center">حالة المستندات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {licenses.map((lic) => (
                  <tr key={lic.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-black text-slate-900">{lic.millName}</div>
                      <div className="text-[10px] font-mono text-indigo-700">{lic.millCode}</div>
                    </td>
                    <td className="p-3 font-mono font-black">{lic.licenseNumber}</td>
                    <td className="p-3 text-center">
                      <div>إصدار: {lic.issueDate}</div>
                      <div className="text-rose-700">انتهاء: {lic.expiryDate}</div>
                    </td>
                    <td className="p-3">
                      <div>س.ت: {lic.commercialRegNumber}</div>
                      <div className="text-[10px] text-slate-500">ب.ض: {lic.taxCardNumber}</div>
                    </td>
                    <td className="p-3">
                      <div>{lic.operatingContractNumber}</div>
                      <div className="text-[10px] text-slate-500">{lic.ownershipOrLeaseDoc}</div>
                    </td>
                    <td className="p-3">{lic.safetyCertificatesStatus}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                          lic.documentStatus === 'سارية'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {lic.documentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. دفتر استلام القمح بالمطاحن (مربوط بإذن الصرف من الشونة) */}
      {subTab === 'wheat_receipts' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                دفتر استلام القمح بالمطاحن (مربوط مباشرة بأذون الصرف الصادرة من الشون)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                صافي الوزن المستلم = الوزن القائم - الوزن الفارغ، مع مطابقة رقم إذن صرف الشونة لمنع ازدواجية الصرف أو الفقد في الطريق
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddWheatRecModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل استلام قمح بالمطحن</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم إذن استلام المطحن</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">المطحن المستلم</th>
                    <th className="p-3">الشونة الموردة وإذن الصرف المرجعي</th>
                    <th className="p-3 text-center">القائم / الفارغ (طن)</th>
                    <th className="p-3 text-center bg-emerald-950/70">الوزن المقبول للطحن (طن)</th>
                    <th className="p-3 text-center">الرطوبة والنظافة</th>
                    <th className="p-3 text-center">إجمالي القيمة</th>
                    <th className="p-3">المستلم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {wheatReceipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-black text-indigo-900">
                        {r.receiptOrderNumber}
                      </td>
                      <td className="p-3">{r.receiptDate}</td>
                      <td className="p-3 font-black">{r.millName}</td>
                      <td className="p-3">
                        <div>{r.sourceShunaOrSiloName}</div>
                        <div className="text-[10px] font-mono text-amber-800">
                          إذن صرف الشونة: {r.linkedShunaIssueOrderNumber}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {r.grossWeightTons} / {r.tareWeightTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                        {r.acceptedMillingWeightTons} طن
                      </td>
                      <td className="p-3 text-center">
                        {r.cleanlinessGrade} ({r.moisturePct}% رطوبة)
                      </td>
                      <td className="p-3 text-center">
                        {r.totalValue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3">{r.receiverName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. سجل التشغيل اليومي للمطاحن ونسب الاستخراج والردة والفاقد */}
      {subTab === 'daily_operations' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل التشغيل اليومي للمطاحن ومعادلات الاستخراج (82%) والردة والفاقد
              </h3>
              <p className="text-xs font-bold text-slate-500">
                نسبة الاستخراج = (الدقيق الناتج ÷ القمح المطحون) × 100 | نسبة الردة = (الردة ÷ القمح المطحون) × 100 | نسبة الفاقد = ((القمح المطحون - مجموع النواتج) ÷ القمح المطحون) × 100
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddOpModal(true)}
                data-testid="btn-add-mill-operation"
                className="px-4 py-2 rounded-xl bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل يومية تشغيل وطحن جديدة</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">التاريخ والمطحن</th>
                    <th className="p-3 text-center">أول اليوم + الوارد</th>
                    <th className="p-3 text-center">القمح المطحون فعلياً</th>
                    <th className="p-3 text-center">رصيد آخر اليوم</th>
                    <th className="p-3 text-center bg-emerald-950/70">الدقيق المنتج (طن)</th>
                    <th className="p-3 text-center bg-indigo-950/80">نسبة الاستخراج (فعلي / مقرر)</th>
                    <th className="p-3 text-center">الردة الناتجة ونسبتها</th>
                    <th className="p-3 text-center">النواتج الثانوية (السن)</th>
                    <th className="p-3 text-center">الفاقد ونسبته %</th>
                    <th className="p-3 text-center">ساعات التشغيل / التوقف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {dailyOperations.map((op) => (
                    <tr key={op.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-black text-slate-900">{op.millName}</div>
                        <div className="text-[10px] text-slate-500">{op.operationDate}</div>
                      </td>
                      <td className="p-3 text-center">
                        <div>متاح: {op.totalAvailableWheatTons} طن</div>
                        <div className="text-[10px] text-slate-500">
                          ({op.openingWheatBalanceTons} + {op.inboundWheatTodayTons})
                        </div>
                      </td>
                      <td className="p-3 text-center font-black text-slate-900">
                        {op.actualMilledWheatTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-amber-800">
                        {op.closingWheatBalanceTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                        {op.producedFlourTons} طن
                      </td>
                      <td className="p-3 text-center bg-indigo-50">
                        <span className="font-black text-indigo-900">
                          {op.actualExtractionPct}%
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          المقرر: {op.standardExtractionPct}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div>{op.producedBranTons} طن</div>
                        <div className="text-[10px] text-slate-500">({op.branPct}%)</div>
                      </td>
                      <td className="p-3 text-center">{op.secondaryOutputsTons} طن</td>
                      <td className="p-3 text-center">
                        <div>{op.lossOrWasteTons} طن</div>
                        <div className="text-[10px] text-rose-700">({op.lossPct}%)</div>
                      </td>
                      <td className="p-3 text-center">
                        <div>تشغيل: {op.operatingHours} س</div>
                        <div className="text-[10px] text-slate-500">توقف: {op.downtimeHours} س</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. سجل إنتاج المطاحن */}
      {subTab === 'production' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              سجل إنتاج الدقيق والشكائر بالمطاحن (15 عموداً)
            </h3>
            <p className="text-xs font-bold text-slate-500">
              نسبة تحقيق المستهدف = (الإنتاج الفعلي ÷ الإنتاج المستهدف) × 100، مع إضافة الإنتاج المعتمد تلقائياً لرصيد الدقيق بالمطحن
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">رقم التشغيلة والتاريخ</th>
                  <th className="p-3">المطحن</th>
                  <th className="p-3">نوع الدقيق المنتج</th>
                  <th className="p-3 text-center">القمح الداخل</th>
                  <th className="p-3 text-center bg-emerald-950/70">الدقيق الناتج (طن)</th>
                  <th className="p-3 text-center">عدد الشكائر (50 كجم)</th>
                  <th className="p-3 text-center">تحقيق المستهدف %</th>
                  <th className="p-3 text-center">رصيد الدقيق (قبل / بعد)</th>
                  <th className="p-3 text-center">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {productions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-mono font-black text-indigo-900">{p.batchNumber}</div>
                      <div className="text-[10px] text-slate-500">{p.productionDate}</div>
                    </td>
                    <td className="p-3 font-black">{p.millName}</td>
                    <td className="p-3">{p.producedFlourType}</td>
                    <td className="p-3 text-center">{p.inputWheatTons} طن</td>
                    <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                      {p.outputFlourTons} طن
                    </td>
                    <td className="p-3 text-center font-black">
                      {p.producedSacksCount.toLocaleString('ar-EG')} شيكارة
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black">
                        {p.targetAchievementPct}%
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {p.flourStockBeforeTons} ←{' '}
                      <span className="font-black text-indigo-900">{p.flourStockAfterTons} طن</span>
                    </td>
                    <td className="p-3 text-center">
                      {p.totalProducedFlourValue.toLocaleString('ar-EG')} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. معدات المطاحن */}
      {subTab === 'machinery' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              سجل معدات المطاحن وخطوط الإنتاج (الدرافيل، المناخل، وحدات الترطيب، التعبئة)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">كود المعدة</th>
                  <th className="p-3">اسم المعدة والمطحن</th>
                  <th className="p-3">القسم / خط الإنتاج</th>
                  <th className="p-3">الشركة المصنعة والموديل</th>
                  <th className="p-3 text-center">القدرة التصميمية</th>
                  <th className="p-3 text-center">القيمة التقديرية</th>
                  <th className="p-3 text-center">حالة المعدة</th>
                  <th className="p-3 text-center">آخر صيانة / القادمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {machinery.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black text-indigo-800">{m.machineCode}</td>
                    <td className="p-3">
                      <div className="font-black text-slate-900">{m.machineName}</div>
                      <div className="text-[10px] text-slate-500">{m.millName}</div>
                    </td>
                    <td className="p-3">{m.productionLineOrDept}</td>
                    <td className="p-3">
                      <div>{m.manufacturer}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {m.model} ({m.serialNumber})
                      </div>
                    </td>
                    <td className="p-3 text-center">{m.ratedCapacity}</td>
                    <td className="p-3 text-center">
                      {m.estimatedValue.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black ${
                          m.status === 'تعمل'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="p-3 text-center text-[11px]">
                      <div>آخر: {m.lastMaintenanceDate}</div>
                      <div className="text-indigo-700">قادمة: {m.nextMaintenanceDate}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. صيانة المطاحن والأعطال */}
      {subTab === 'maintenance' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              سجل صيانة المطاحن والأعطال وتكلفة الإصلاح
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">رقم أمر الصيانة</th>
                  <th className="p-3">المطحن والمعدة</th>
                  <th className="p-3">نوع العطل</th>
                  <th className="p-3 text-center">مدة التوقف</th>
                  <th className="p-3">قطع الغيار المستخدمة</th>
                  <th className="p-3 text-center">إجمالي التكلفة</th>
                  <th className="p-3">المهندس / الفني</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {maintenance.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black text-amber-800">{m.orderNumber}</td>
                    <td className="p-3">
                      <div className="font-black">{m.millName}</div>
                      <div className="text-[10px] text-slate-500">{m.machineName}</div>
                    </td>
                    <td className="p-3">{m.faultType}</td>
                    <td className="p-3 text-center">{m.downtimeHours} ساعة</td>
                    <td className="p-3">{m.sparePartsUsed}</td>
                    <td className="p-3 text-center font-black text-rose-800">
                      {m.totalMaintenanceCost.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-3">{m.engineerOrTechnician}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-black">
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. سجل الفحص والمرور الدوري على المطاحن */}
      {subTab === 'inspections' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل الفحص والمرور الدوري للجان صيانة الحبوب على المطاحن
              </h3>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddInspModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل محضر مرور دوري جديد</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم المحضر والتاريخ</th>
                    <th className="p-3">المطحن واللجنة</th>
                    <th className="p-3 text-center">النظافة والمعدات</th>
                    <th className="p-3 text-center">مطابقة الأرصدة والاستخراج</th>
                    <th className="p-3">المخالفات أو الملاحظات المرصودة</th>
                    <th className="p-3">الإجراءات والتوصيات</th>
                    <th className="p-3 text-center">حالة المتابعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {inspections.map((ins) => (
                    <tr key={ins.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-mono font-black text-indigo-900">
                          {ins.reportNumber}
                        </div>
                        <div className="text-[10px] text-slate-500">{ins.visitDate}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-black">{ins.millName}</div>
                        <div className="text-[10px] text-slate-500">{ins.inspectorsCommittee}</div>
                      </td>
                      <td className="p-3 text-center">
                        <div>نظافة: {ins.generalCleanlinessStatus}</div>
                        <div className="text-[10px] text-slate-500">
                          معدات: {ins.machineryConditionStatus}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div>الأرصدة: {ins.balancesMatchStatus}</div>
                        <div className="text-[10px] text-emerald-700">
                          {ins.extractionMatchStatus}
                        </div>
                      </td>
                      <td className="p-3">{ins.observedViolations}</td>
                      <td className="p-3">
                        <div>{ins.legalOrAdminActions}</div>
                        <div className="text-[10px] text-indigo-700">{ins.recommendations}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-black">
                          {ins.followUpStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 9. التقييم المالي وأصول المطاحن */}
      {subTab === 'assets' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              التقييم المالي وأصول المطاحن (فصل الأصول الثابتة عن مخزون القمح والدقيق)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">المطحن</th>
                  <th className="p-3 text-center">الأرض والمباني</th>
                  <th className="p-3 text-center">خطوط الطحن والصوامع الداخلية</th>
                  <th className="p-3 text-center">الموازين والسيارات وقطع الغيار</th>
                  <th className="p-3 text-center bg-indigo-950/80">إجمالي الأصول الثابتة</th>
                  <th className="p-3 text-center bg-emerald-950/80">قيمة القمح والدقيق المخزن</th>
                  <th className="p-3 text-center bg-amber-950/80">إجمالي القيمة التقديرية للمطحن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {assets.map((a) => {
                  const calc = computeMillAssetValuation(a);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-black text-slate-900">{a.millName}</div>
                        <div className="text-[10px] font-mono text-indigo-700">{a.millCode}</div>
                      </td>
                      <td className="p-3 text-center">
                        {(a.landValue + a.buildingsValue).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center">
                        {(a.millingLinesValue + a.internalSilosValue).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center">
                        {(
                          a.scalesValue +
                          a.auxiliaryEquipmentValue +
                          a.vehiclesValue +
                          a.sparePartsInventoryValue
                        ).toLocaleString('ar-EG')}{' '}
                        ج.م
                      </td>
                      <td className="p-3 text-center font-black text-indigo-900 bg-indigo-50">
                        {calc.fixedAssetsTotal.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                        {calc.inventoryTotal.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center font-black text-amber-900 bg-amber-50">
                        {calc.totalEstimatedMillValue.toLocaleString('ar-EG')} ج.م
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة إضافة مطحن جديد */}
      {showAddMillModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">إضافة مطحن تمويني جديد</h3>
            <form onSubmit={handleCreateMill} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">كود المطحن</label>
                  <input
                    type="text"
                    required
                    value={newMill.millCode}
                    onChange={(e) => setNewMill({ ...newMill, millCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم المطحن</label>
                  <input
                    type="text"
                    required
                    value={newMill.millName}
                    onChange={(e) => setNewMill({ ...newMill, millName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">القدرة الطحنية اليومية (طن)</label>
                  <input
                    type="number"
                    required
                    value={newMill.dailyMillingCapacityTons}
                    onChange={(e) =>
                      setNewMill({
                        ...newMill,
                        dailyMillingCapacityTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نوع القطاع</label>
                  <select
                    value={newMill.millSectorType}
                    onChange={(e) =>
                      setNewMill({ ...newMill, millSectorType: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="قطاع عام">قطاع عام</option>
                    <option value="قطاع خاص">قطاع خاص</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddMillModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-700 text-white font-black"
                >
                  حفظ بيانات المطحن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل يومية تشغيل وطحن جديدة */}
      {showAddOpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل يومية تشغيل المطحن وحساب نسب الاستخراج والردة والفاقد تلقائياً
            </h3>
            <form onSubmit={handleCreateMillDailyOperation} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">المطحن</label>
                  <select
                    value={newOp.millCode}
                    onChange={(e) => setNewOp({ ...newOp, millCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {mills.map((m) => (
                      <option key={m.millCode} value={m.millCode}>
                        {m.millName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">القمح المطحون فعلياً (طن)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newOp.actualMilledWheatTons}
                    onChange={(e) =>
                      setNewOp({ ...newOp, actualMilledWheatTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الدقيق المنتج فعلياً (طن)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={newOp.producedFlourTons}
                    onChange={(e) =>
                      setNewOp({ ...newOp, producedFlourTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الردة الناتجة (طن)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newOp.producedBranTons}
                    onChange={(e) =>
                      setNewOp({ ...newOp, producedBranTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">النواتج الثانوية / السن (طن)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newOp.secondaryOutputsTons}
                    onChange={(e) =>
                      setNewOp({ ...newOp, secondaryOutputsTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">ساعات التشغيل</label>
                  <input
                    type="number"
                    value={newOp.operatingHours}
                    onChange={(e) =>
                      setNewOp({ ...newOp, operatingHours: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-500">نسبة الاستخراج الفعلية</div>
                  <div className="text-base font-black text-indigo-900">
                    {liveOpCalc.actualExtractionPct}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">نسبة إنتاج الردة</div>
                  <div className="text-base font-black text-emerald-800">{liveOpCalc.branPct}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">الفاقد ونسبته</div>
                  <div className="text-base font-black text-rose-700">
                    {liveOpCalc.lossOrWasteTons} طن ({liveOpCalc.lossPct}%)
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddOpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-700 text-white font-black"
                >
                  حفظ يومية التشغيل والإنتاج
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل استلام قمح بالمطحن */}
      {showAddWheatRecModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل استلام قمح بالمطحن (مربوط بإذن صرف الشونة)
            </h3>
            <form onSubmit={handleCreateMillWheatReceipt} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم إذن الاستلام بالمطحن</label>
                  <input
                    type="text"
                    required
                    value={newWheatRec.receiptOrderNumber}
                    onChange={(e) =>
                      setNewWheatRec({ ...newWheatRec, receiptOrderNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">رقم إذن الصرف الصادر من الشونة</label>
                  <input
                    type="text"
                    required
                    value={newWheatRec.linkedShunaIssueOrderNumber}
                    onChange={(e) =>
                      setNewWheatRec({
                        ...newWheatRec,
                        linkedShunaIssueOrderNumber: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن القائم (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newWheatRec.grossWeightTons}
                    onChange={(e) =>
                      setNewWheatRec({
                        ...newWheatRec,
                        grossWeightTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن الفارغ (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newWheatRec.tareWeightTons}
                    onChange={(e) =>
                      setNewWheatRec({
                        ...newWheatRec,
                        tareWeightTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddWheatRecModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-black"
                >
                  اعتماد الاستلام بالمطحن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل محضر مرور دوري على المطحن */}
      {showAddInspModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل محضر مرور وتفتيش دوري على المطحن
            </h3>
            <form onSubmit={handleCreateMillInspection} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم محضر المرور</label>
                  <input
                    type="text"
                    required
                    value={newInsp.reportNumber}
                    onChange={(e) => setNewInsp({ ...newInsp, reportNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المطحن</label>
                  <select
                    value={newInsp.millCode}
                    onChange={(e) => setNewInsp({ ...newInsp, millCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {mills.map((m) => (
                      <option key={m.millCode} value={m.millCode}>
                        {m.millName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">المخالفات أو الملاحظات المرصودة</label>
                  <input
                    type="text"
                    value={newInsp.observedViolations}
                    onChange={(e) =>
                      setNewInsp({ ...newInsp, observedViolations: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddInspModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-700 text-white font-black"
                >
                  حفظ محضر المرور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
