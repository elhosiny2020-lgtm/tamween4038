import React, { useMemo, useState } from 'react';
import {
  Wheat,
  CalendarCheck,
  CalendarRange,
  Truck,
  FileDiff,
  Network,
  Warehouse,
  Plus,
  Printer,
  FileSpreadsheet,
  Link2,
} from 'lucide-react';
import type {
  FlourDailyDistributionRecord,
  FlourIssueOrderRecord,
  FlourQuotaAmendmentRecord,
  FlourQuotaMasterRecord,
  GrainMaintenanceState,
  MillBakeryMappingRecord,
} from '../../../types/modules';
import type { AppUser, Bakery } from '../../../types';
import type { ModulePermissions } from '../../../utils/moduleCrudHelpers';
import { resolveModuleCrudPermissions } from '../../../utils/moduleCrudHelpers';
import { groupRecordsByLocalUnit } from '../../../utils/tableGroupingHelpers';
import {
  ModuleRowActions,
  LocalUnitSubtotalRow,
  VillageGrandTotalRow,
  ModuleRecordProfileModal,
  ModuleDeleteConfirmModal,
} from '../ModuleCrudShared';
import {
  computeFlourQuotaMetrics,
  computeMillFlourStockBalanceSummary,
} from '../../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../../services/modulesStorage';

interface FlourQuotasDatabaseViewProps {
  state: GrainMaintenanceState;
  branchName: string;
  currentUserFullName: string;
  currentUser?: AppUser | null;
  permissions?: ModulePermissions;
  isViewer: boolean;
  canAdd?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  bakeries: Bakery[];
  onUpdateState: (updater: (prev: GrainMaintenanceState) => GrainMaintenanceState, summary: string) => void;
  onNotify: (type: 'ok' | 'err', text: string) => void;
}

export const FlourQuotasDatabaseView: React.FC<FlourQuotasDatabaseViewProps> = ({
  state,
  branchName,
  currentUserFullName,
  currentUser,
  permissions,
  isViewer,
  canAdd = !isViewer,
  canPrint = !isViewer,
  canExport = !isViewer,
  bakeries,
  onUpdateState,
  onNotify,
}) => {
  const effectivePermissions: ModulePermissions = useMemo(() => {
    if (permissions) return permissions;
    return resolveModuleCrudPermissions(currentUser || null, isViewer, 'grain_maintenance');
  }, [permissions, currentUser, isViewer]);
  const [subTab, setSubTab] = useState<
    | 'master'
    | 'daily'
    | 'monthly'
    | 'issues'
    | 'amendments'
    | 'mapping'
    | 'mill_stock'
  >('master');

  const quotaMaster = state.flourQuotaMaster || [];
  const dailyDistributions = state.flourDailyDistributions || [];
  const monthlyQuotas = state.flourMonthlyQuotas || [];
  const flourIssues = state.flourIssues || [];
  const amendments = state.flourQuotaAmendments || [];
  const mappings = state.millBakeryMappings || [];
  const millStockBalances = state.millFlourStockBalances || [];
  const mills = state.mills || [];

  const today = new Date().toISOString().split('T')[0];

  // Add Quota Master linked to existing Bakery
  const [showAddQuotaModal, setShowAddQuotaModal] = useState(false);
  const [selectedBakeryId, setSelectedBakeryId] = useState<string>(bakeries[0]?.id || '');
  const [newQuota, setNewQuota] = useState({
    quotaCode: `FQ-MHL-00${quotaMaster.length + 1}`,
    allocationDecisionNumber: `قرار تمويني رقم ${140 + quotaMaster.length} لسنة 2026`,
    decisionDate: today,
    millCode: mills[0]?.millCode || 'MILL-MHL-01',
    extractionGrade: '82%' as '82%' | '72%',
    dailyQuotaTons: 1.0,
    effectiveStartDate: '2026-01-01',
    effectiveEndDate: '2026-12-31',
    allocationOrAmendmentReason: 'ربط حصة المخبز من قاعدة بيانات المخابز الرئيسية',
    notes: '',
  });

  // Add Flour Issue to Bakery Modal
  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    issueOrderNumber: `FI-2026-${905 + flourIssues.length}`,
    issueDate: today,
    issueTime: new Date().toTimeString().slice(0, 5),
    quotaCode: quotaMaster[0]?.quotaCode || 'FQ-MHL-001',
    issuedQuantityTons: quotaMaster[0]?.dailyQuotaTons || 1.2,
    tonPrice: state.settings?.defaultFlourTonPrice || 16000,
    vehicleNumber: '',
    driverName: '',
    receiverName: '',
    adminOverrideReason: '',
    notes: '',
  });

  // Add Quota Amendment Decision Modal
  const [showAddAmendModal, setShowAddAmendModal] = useState(false);
  const [newAmend, setNewAmend] = useState({
    decisionNumber: `قرار تعديل حصة رقم ${50 + amendments.length} لسنة 2026`,
    decisionDate: today,
    quotaCode: quotaMaster[0]?.quotaCode || 'FQ-MHL-001',
    newDailyQuotaTons: 1.3,
    amendmentType: 'زيادة' as FlourQuotaAmendmentRecord['amendmentType'],
    reason: 'تعديل الحصة اليومية بقرار لجنة المخابز بالمديرية',
    issuingAuthority: 'مديرية التموين والتجارة الداخلية بالغربية',
    effectiveStartDate: today,
    effectiveEndDate: '2026-12-31',
  });

  const selectedBakeryObj = useMemo(
    () => bakeries.find((b) => b.id === selectedBakeryId) || null,
    [bakeries, selectedBakeryId]
  );

  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    title: string;
    entityType: string;
    subtitle?: string;
    fields: { label: string; value: React.ReactNode; mono?: boolean; badge?: boolean; badgeColor?: string; colSpan?: number }[];
    onEdit?: () => void;
  } | null>(null);

  const [editingRecord, setEditingRecord] = useState<{
    sliceKey:
      | 'flourQuotaMaster'
      | 'flourDailyDistributions'
      | 'flourMonthlyQuotas'
      | 'flourIssues'
      | 'flourQuotaAmendments'
      | 'millBakeryMappings'
      | 'millFlourStockBalances';
    title: string;
    record: Record<string, any>;
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    sliceKey:
      | 'flourQuotaMaster'
      | 'flourDailyDistributions'
      | 'flourMonthlyQuotas'
      | 'flourIssues'
      | 'flourQuotaAmendments'
      | 'millBakeryMappings'
      | 'millFlourStockBalances';
    entityId: string;
    entityTitle: string;
    recordSummary: { label: string; value: string | number }[];
  } | null>(null);

  const handleSaveUniversalEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const { sliceKey, title, record } = editingRecord;
    onUpdateState(
      (prev) => ({
        ...prev,
        [sliceKey]: ((prev[sliceKey] as any[]) || []).map((item) =>
          item.id === record.id ? { ...item, ...record } : item
        ),
      }),
      `تعديل سجل حصص دقيق: ${title}`
    );
    onNotify('ok', `تم حفظ التعديلات على «${title}» بنجاح.`);
    setEditingRecord(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteModal) return;
    const { sliceKey, entityId, entityTitle } = deleteModal;
    onUpdateState(
      (prev) => ({
        ...prev,
        [sliceKey]: ((prev[sliceKey] as any[]) || []).filter(
          (q) => q.id !== entityId && q.quotaCode !== entityId
        ),
      }),
      `حذف سجل حصص دقيق: ${entityTitle}`
    );
    onNotify('ok', `تم حذف السجل «${entityTitle}» بنجاح.`);
    setDeleteModal(null);
  };

  const quotaGrouping = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: quotaMaster,
      getLocalUnit: (q) => q.localUnit || q.village,
      numericFields: [
        { key: 'dailyQuotaTons', getValue: (q) => q.dailyQuotaTons },
        { key: 'dailyQuotaSacks', getValue: (q) => q.dailyQuotaSacks },
        { key: 'weeklyQuotaTons', getValue: (q) => q.weeklyQuotaTons },
        { key: 'monthlyQuotaTons', getValue: (q) => q.monthlyQuotaTons },
        { key: 'annualQuotaTons', getValue: (q) => q.annualQuotaTons },
      ],
    });
  }, [quotaMaster]);

  const handleSelectBakeryForQuota = (bId: string) => {
    setSelectedBakeryId(bId);
    const b = bakeries.find((item) => item.id === bId);
    if (b) {
      // Automatically pull daily quota in tons from bakery's actualQuota sacks (50kg per sack)
      const tons = Number(((Number(b.actualQuota || b.insuranceQuota || 20) * 50) / 1000).toFixed(3));
      setNewQuota((prev) => ({
        ...prev,
        dailyQuotaTons: tons > 0 ? tons : 1.0,
      }));
    }
  };

  const handleCreateQuotaMaster = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMill = mills.find((m) => m.millCode === newQuota.millCode);
    if (!targetMill) return;

    const bakeryName = selectedBakeryObj
      ? `مخبز ${selectedBakeryObj.bakeryOwnerName}`
      : 'مخبز بلدي معتمد';
    const bakeryCode = selectedBakeryObj
      ? `MCH-${selectedBakeryObj.machineNumber}`
      : `BKR-MHL-00${quotaMaster.length + 1}`;
    const ownerName = selectedBakeryObj?.bakeryOwnerName || bakeryName;
    const village = selectedBakeryObj?.village || 'بشبيش';
    const localUnit = selectedBakeryObj?.localUnit || 'بشبيش';

    const calc = computeFlourQuotaMetrics({
      dailyQuotaTons: newQuota.dailyQuotaTons,
      sackWeightKg: 50,
      eligibleWorkingDays: 30,
    });

    const rec: FlourQuotaMasterRecord = {
      id: `fqm-${Date.now()}`,
      serialNo: quotaMaster.length + 1,
      quotaCode: newQuota.quotaCode.trim(),
      allocationDecisionNumber: newQuota.allocationDecisionNumber,
      decisionDate: newQuota.decisionDate,
      millCode: targetMill.millCode,
      millName: targetMill.millName,
      linkedBakeryId: selectedBakeryObj?.id,
      bakeryCode,
      bakeryName,
      ownerName,
      governorate: 'الغربية',
      center: branchName,
      village,
      localUnit,
      flourType: `دقيق بلدي تمويني استخراج ${newQuota.extractionGrade}`,
      extractionGrade: newQuota.extractionGrade,
      activityType: 'مخبز بلدي',
      dailyQuotaTons: Number(newQuota.dailyQuotaTons),
      dailyQuotaSacks: calc.dailyQuotaSacks,
      weeklyQuotaTons: calc.weeklyQuotaTons,
      monthlyQuotaTons: calc.monthlyQuotaTons,
      annualQuotaTons: calc.annualQuotaTons,
      effectiveStartDate: newQuota.effectiveStartDate,
      effectiveEndDate: newQuota.effectiveEndDate,
      quotaStatus: 'سارية',
      allocationOrAmendmentReason: newQuota.allocationOrAmendmentReason,
      notes: newQuota.notes,
    };

    const mappingRec: MillBakeryMappingRecord = {
      id: `mbm-${Date.now()}`,
      mappingCode: `MAP-MHL-00${mappings.length + 1}`,
      millCode: rec.millCode,
      millName: rec.millName,
      linkedBakeryId: rec.linkedBakeryId,
      bakeryCode: rec.bakeryCode,
      bakeryName: rec.bakeryName,
      ownerName: rec.ownerName,
      village: rec.village,
      localUnit: rec.localUnit,
      dailyQuotaTons: rec.dailyQuotaTons,
      monthlyQuotaTons: rec.monthlyQuotaTons,
      linkStartDate: rec.effectiveStartDate,
      linkEndDate: rec.effectiveEndDate,
      linkStatus: 'نشط',
      notes: 'ربط مباشر من قاعدة بيانات المخابز الرئيسية دون تكرار',
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        flourQuotaMaster: [...(prev.flourQuotaMaster || []), rec],
        millBakeryMappings: [...(prev.millBakeryMappings || []), mappingRec],
      }),
      `تخصيص وربط حصة دقيق (${rec.dailyQuotaTons} طن/يوم) للمخبز ${rec.bakeryName} على ${rec.millName}`
    );
    setShowAddQuotaModal(false);
    onNotify('ok', `تم ربط وتخصيص حصة الدقيق للمخبز «${rec.bakeryName}» بنجاح.`);
  };

  const handleCreateFlourIssue = (e: React.FormEvent) => {
    e.preventDefault();
    const targetQuota = quotaMaster.find((q) => q.quotaCode === newIssue.quotaCode);
    if (!targetQuota) {
      onNotify('err', 'يرجى اختيار الحصة التموينية الصحيحة.');
      return;
    }
    const issuedTons = Number(newIssue.issuedQuantityTons) || 0;
    if (issuedTons <= 0) {
      onNotify('err', 'الكمية المصروفة يجب أن تكون أكبر من صفر.');
      return;
    }

    // Check duplicate same-day full disbursement or exceeding prescribed daily quota
    const alreadyDisbursedToday = flourIssues
      .filter(
        (iss) =>
          iss.quotaCode === targetQuota.quotaCode &&
          iss.issueDate === newIssue.issueDate &&
          iss.approvalStatus === 'معتمد'
      )
      .reduce((sum, iss) => sum + (Number(iss.issuedQuantityTons) || 0), 0);

    if (
      alreadyDisbursedToday + issuedTons > targetQuota.dailyQuotaTons &&
      !newIssue.adminOverrideReason.trim()
    ) {
      onNotify(
        'err',
        `رفض الصرف: إجمالي الكمية المصروفة اليوم (${(alreadyDisbursedToday + issuedTons).toFixed(3)} طن) يتجاوز الحصة اليومية المقررة للمخبز (${targetQuota.dailyQuotaTons} طن). يلزم إدخال سبب التجاوز الإداري المعتمد.`
      );
      return;
    }

    const millStock = millStockBalances.find((b) => b.millCode === targetQuota.millCode);
    const stockSummary = millStock
      ? computeMillFlourStockBalanceSummary(millStock)
      : { currentStockBalanceTons: 200 };

    const balanceBefore = stockSummary.currentStockBalanceTons;
    const balanceAfter = Number((balanceBefore - issuedTons).toFixed(3));
    const sacksCount = Math.round((issuedTons * 1000) / 50);
    const totalVal = Number((issuedTons * (Number(newIssue.tonPrice) || 16000)).toFixed(2));

    const issueRec: FlourIssueOrderRecord = {
      id: `fiss-${Date.now()}`,
      serialNo: flourIssues.length + 1,
      issueOrderNumber: newIssue.issueOrderNumber.trim(),
      issueDate: newIssue.issueDate,
      issueTime: newIssue.issueTime,
      quotaCode: targetQuota.quotaCode,
      millCode: targetQuota.millCode,
      millName: targetQuota.millName,
      bakeryCode: targetQuota.bakeryCode,
      bakeryName: targetQuota.bakeryName,
      bakeryOwnerName: targetQuota.ownerName,
      village: targetQuota.village,
      localUnit: targetQuota.localUnit,
      prescribedQuotaTons: targetQuota.dailyQuotaTons,
      issuedQuantityTons: issuedTons,
      sacksCount,
      sackWeightKg: 50,
      balanceBeforeIssueTons: balanceBefore,
      balanceAfterIssueTons: balanceAfter,
      tonPrice: Number(newIssue.tonPrice) || 16000,
      totalValue: totalVal,
      vehicleNumber: newIssue.vehicleNumber || '-',
      driverName: newIssue.driverName || '-',
      receiverName: newIssue.receiverName || targetQuota.ownerName,
      approvalStatus: 'معتمد',
      adminOverrideReason: newIssue.adminOverrideReason.trim() || undefined,
      approvedBy: currentUserFullName,
      notes: newIssue.notes,
    };

    const totalTodayForQuota = Number((alreadyDisbursedToday + issuedTons).toFixed(3));
    const dailyMetrics = computeFlourQuotaMetrics({
      dailyQuotaTons: targetQuota.dailyQuotaTons,
      actualApprovedDisbursedTons: totalTodayForQuota,
    });

    const dailyDistRec: FlourDailyDistributionRecord = {
      id: `fdd-${Date.now()}`,
      date: issueRec.issueDate,
      quotaCode: targetQuota.quotaCode,
      millCode: targetQuota.millCode,
      millName: targetQuota.millName,
      bakeryCode: targetQuota.bakeryCode,
      bakeryName: targetQuota.bakeryName,
      village: targetQuota.village,
      localUnit: targetQuota.localUnit,
      prescribedDailyQuotaTons: targetQuota.dailyQuotaTons,
      actualApprovedDisbursedTons: totalTodayForQuota,
      remainingDailyTons: dailyMetrics.remainingDailyTons,
      executionPct: dailyMetrics.executionPct,
      issueOrderNumber: issueRec.issueOrderNumber,
      disbursementStatus: dailyMetrics.disbursementStatus,
      nonDisbursementOrShortageReason: '',
      notes: issueRec.notes || `صرف ${sacksCount} شيكارة معتمدة`,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        flourIssues: [issueRec, ...(prev.flourIssues || [])],
        flourDailyDistributions: [
          dailyDistRec,
          ...(prev.flourDailyDistributions || []).filter(
            (d) => !(d.quotaCode === targetQuota.quotaCode && d.date === issueRec.issueDate)
          ),
        ],
        millFlourStockBalances: (prev.millFlourStockBalances || []).map((b) =>
          b.millCode === targetQuota.millCode
            ? {
                ...b,
                actualDisbursedToBakeriesTons: Number(
                  (b.actualDisbursedToBakeriesTons + issuedTons).toFixed(3)
                ),
              }
            : b
        ),
      }),
      `صرف حصة دقيق (${issuedTons} طن / ${sacksCount} شيكارة) للمخبز ${targetQuota.bakeryName}`
    );
    setShowAddIssueModal(false);
    onNotify(
      'ok',
      `تم اعتماد إذن صرف الدقيق ${issueRec.issueOrderNumber} (${sacksCount} شيكارة) وخصمه من رصيد المطحن تلقائياً.`
    );
  };

  const handleCreateAmendment = (e: React.FormEvent) => {
    e.preventDefault();
    const targetQuota = quotaMaster.find((q) => q.quotaCode === newAmend.quotaCode);
    if (!targetQuota) return;

    const prevTons = targetQuota.dailyQuotaTons;
    const nextTons = Number(newAmend.newDailyQuotaTons) || 0;
    const deltaTons = Number((nextTons - prevTons).toFixed(3));
    const nextCalc = computeFlourQuotaMetrics({
      dailyQuotaTons: nextTons,
      sackWeightKg: 50,
      eligibleWorkingDays: 30,
    });

    const amendRec: FlourQuotaAmendmentRecord = {
      id: `fqa-${Date.now()}`,
      decisionNumber: newAmend.decisionNumber.trim(),
      decisionDate: newAmend.decisionDate,
      quotaCode: targetQuota.quotaCode,
      bakeryCode: targetQuota.bakeryCode,
      bakeryName: targetQuota.bakeryName,
      millCode: targetQuota.millCode,
      millName: targetQuota.millName,
      previousDailyQuotaTons: prevTons,
      newDailyQuotaTons: nextTons,
      changeDeltaTons: deltaTons,
      amendmentType: newAmend.amendmentType,
      reason: newAmend.reason,
      issuingAuthority: newAmend.issuingAuthority,
      effectiveStartDate: newAmend.effectiveStartDate,
      effectiveEndDate: newAmend.effectiveEndDate,
      status: 'منفذ',
      notes: `تم الاحتفاظ بالحصة التاريخية السابقة (${prevTons} طن) وتطبيق الحصة الجديدة (${nextTons} طن)`,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        flourQuotaAmendments: [amendRec, ...(prev.flourQuotaAmendments || [])],
        flourQuotaMaster: (prev.flourQuotaMaster || []).map((q) =>
          q.quotaCode === targetQuota.quotaCode
            ? {
                ...q,
                dailyQuotaTons: nextTons,
                dailyQuotaSacks: nextCalc.dailyQuotaSacks,
                weeklyQuotaTons: nextCalc.weeklyQuotaTons,
                monthlyQuotaTons: nextCalc.monthlyQuotaTons,
                annualQuotaTons: nextCalc.annualQuotaTons,
                quotaStatus: newAmend.amendmentType === 'إيقاف مؤقت' ? 'موقوفة' : 'معدلة',
                allocationOrAmendmentReason: `${newAmend.decisionNumber}: ${newAmend.reason}`,
              }
            : q
        ),
      }),
      `تعديل حصة الدقيق للمخبز ${targetQuota.bakeryName} من ${prevTons} إلى ${nextTons} طن/يوم`
    );
    setShowAddAmendModal(false);
    onNotify('ok', `تم تنفيذ قرار تعديل الحصة رقم ${amendRec.decisionNumber} وحفظ السجل التاريخي.`);
  };

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-flour-quotas-view">
      {/* التبويبات الفرعية لقاعدة بيانات حصص الدقيق المركزية (7 جداول مترابطة) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-1.5">
        {[
          { id: 'master', label: '1. سجل حصص الدقيق الرئيسي (24 عموداً)', icon: <Wheat className="w-4 h-4" /> },
          { id: 'daily', label: '2. التوزيع اليومي لحصص الدقيق', icon: <CalendarCheck className="w-4 h-4" /> },
          { id: 'monthly', label: '3. متابعة الحصص الشهرية والسنوية', icon: <CalendarRange className="w-4 h-4" /> },
          { id: 'issues', label: '4. دفتر صرف الدقيق للمخابز (19 عموداً)', icon: <Truck className="w-4 h-4" /> },
          { id: 'amendments', label: '5. قرارات تعديل الحصص', icon: <FileDiff className="w-4 h-4" /> },
          { id: 'mapping', label: '6. خريطة ارتباط المطاحن بالمخابز', icon: <Network className="w-4 h-4" /> },
          { id: 'mill_stock', label: '7. الأرصدة الفعلية وحركة الدقيق بالمطاحن', icon: <Warehouse className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as any)}
            data-testid={`quota-subtab-${t.id}`}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              subTab === t.id
                ? 'bg-amber-700 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 1. سجل حصص الدقيق الرئيسي */}
      {subTab === 'master' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل حصص الدقيق الرئيسي (مربوط مباشرة بالمطاحن وبقسم المخابز دون تكرار)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                يوضح قرار التخصيص، المطحن، المخبز، القرية، درجة الاستخراج (82% / 72%)، والحصة اليومية والأسبوعية والشهرية والسنوية بالطن وبالشيكارة
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canAdd && (
                <button
                  type="button"
                  onClick={() => setShowAddQuotaModal(true)}
                  data-testid="btn-add-flour-quota"
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Link2 className="w-4 h-4" />
                  <span>ربط وتخصيص حصة لمخبز</span>
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToArabicCsv(
                      'flour_quota_master',
                      [
                        'م',
                        'كود الحصة',
                        'رقم قرار التخصيص',
                        'تاريخ القرار',
                        'كود المطحن',
                        'اسم المطحن',
                        'كود المخبز',
                        'اسم المخبز',
                        'اسم صاحب المخبز',
                        'القرية',
                        'الوحدة المحلية',
                        'نوع الدقيق',
                        'درجة الاستخراج',
                        'الحصة اليومية (طن)',
                        'الحصة اليومية (شيكارة)',
                        'الحصة الأسبوعية (طن)',
                        'الحصة الشهرية (طن)',
                        'الحصة السنوية (طن)',
                        'بداية السريان',
                        'نهاية السريان',
                        'حالة الحصة',
                        'سبب التخصيص/التعديل',
                      ],
                      quotaMaster.map((q) => [
                        q.serialNo,
                        q.quotaCode,
                        q.allocationDecisionNumber,
                        q.decisionDate,
                        q.millCode,
                        q.millName,
                        q.bakeryCode,
                        q.bakeryName,
                        q.ownerName,
                        q.village,
                        q.localUnit,
                        q.flourType,
                        q.extractionGrade,
                        q.dailyQuotaTons,
                        q.dailyQuotaSacks,
                        q.weeklyQuotaTons,
                        q.monthlyQuotaTons,
                        q.annualQuotaTons,
                        q.effectiveStartDate,
                        q.effectiveEndDate,
                        q.quotaStatus,
                        q.allocationOrAmendmentReason,
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
                      title: 'سجل حصص الدقيق التموينية المخصصة للمخابز',
                      subtitle: 'مربوط بالمطاحن التموينية وقاعدة بيانات المخابز بالمركز',
                      branchName,
                      headers: [
                        'كود الحصة',
                        'قرار التخصيص',
                        'المطحن',
                        'المخبز والقرية',
                        'الاستخراج',
                        'يومي (طن / شيكارة)',
                        'أسبوعي (طن)',
                        'شهري (طن)',
                        'سنوي (طن)',
                        'الحالة',
                      ],
                      rows: quotaMaster.map((q) => [
                        q.quotaCode,
                        q.allocationDecisionNumber,
                        q.millName,
                        `${q.bakeryName} (${q.village})`,
                        q.extractionGrade,
                        `${q.dailyQuotaTons} طن (${q.dailyQuotaSacks} ش)`,
                        `${q.weeklyQuotaTons} طن`,
                        `${q.monthlyQuotaTons} طن`,
                        `${q.annualQuotaTons} طن`,
                        q.quotaStatus,
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
              <table className="w-full compact-erp-table text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">كود الحصة والقرار</th>
                    <th className="p-3">المطحن المربوط عليه</th>
                    <th className="p-3">المخبز وصاحب المخبز</th>
                    <th className="p-3">القرية والوحدة</th>
                    <th className="p-3 text-center">نوع الدقيق والاستخراج</th>
                    <th className="p-3 text-center bg-amber-950/70">الحصة اليومية (طن / شيكارة)</th>
                    <th className="p-3 text-center">الأسبوعية (طن)</th>
                    <th className="p-3 text-center">الشهرية (طن)</th>
                    <th className="p-3 text-center">السنوية (طن)</th>
                    <th className="p-3 text-center">حالة الحصة</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {quotaGrouping.groups.map((group) => (
                    <React.Fragment key={group.localUnit}>
                      {group.rows.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-mono font-black text-amber-800">{q.quotaCode}</div>
                            <div className="text-[10px] text-slate-500">
                              {q.allocationDecisionNumber} ({q.decisionDate})
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-black text-indigo-900">{q.millName}</div>
                            <div className="text-[10px] font-mono text-slate-500">{q.millCode}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-black text-slate-900">{q.bakeryName}</div>
                            <div className="text-[10px] text-slate-500">
                              كود: {q.bakeryCode} | المالك: {q.ownerName}
                            </div>
                          </td>
                          <td className="p-3">
                            <div>{q.village}</div>
                            <div className="text-[10px] text-slate-500">وحدة: {q.localUnit}</div>
                          </td>
                          <td className="p-3 text-center">
                            <div>{q.flourType}</div>
                            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-black">
                              استخراج {q.extractionGrade}
                            </span>
                          </td>
                          <td className="p-3 text-center bg-amber-50">
                            <div className="font-black text-amber-900 text-sm">
                              {q.dailyQuotaTons} طن
                            </div>
                            <div className="text-[11px] text-emerald-800 font-black">
                              ({q.dailyQuotaSacks} شيكارة × 50 كجم)
                            </div>
                          </td>
                          <td className="p-3 text-center">{q.weeklyQuotaTons} طن</td>
                          <td className="p-3 text-center font-black text-slate-900">
                            {q.monthlyQuotaTons} طن
                          </td>
                          <td className="p-3 text-center">{q.annualQuotaTons} طن</td>
                          <td className="p-3 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                                q.quotaStatus === 'سارية'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : q.quotaStatus === 'معدلة'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {q.quotaStatus}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <ModuleRowActions
                              entityLabel={q.bakeryName}
                              permissions={effectivePermissions}
                              onView={() =>
                                setProfileModal({
                                  isOpen: true,
                                  title: `ملف حصة الدقيق - ${q.bakeryName}`,
                                  entityType: 'حصة دقيق تمويني',
                                  subtitle: `${q.quotaCode} | ${q.millName}`,
                                  onEdit: () =>
                                    setEditingRecord({
                                      sliceKey: 'flourQuotaMaster',
                                      title: q.bakeryName,
                                      record: { ...q },
                                    }),
                                  fields: [
                                    { label: 'كود الحصة', value: q.quotaCode, mono: true },
                                    { label: 'رقم القرار التمويني', value: q.allocationDecisionNumber },
                                    { label: 'المخبز المستفيد', value: q.bakeryName },
                                    { label: 'كود المخبز', value: q.bakeryCode, mono: true },
                                    { label: 'صاحب المخبز', value: q.ownerName },
                                    { label: 'المطحن المربوط عليه', value: q.millName },
                                    { label: 'كود المطحن', value: q.millCode, mono: true },
                                    { label: 'القرية', value: q.village },
                                    { label: 'الوحدة المحلية', value: q.localUnit },
                                    { label: 'نوع الدقيق', value: q.flourType },
                                    {
                                      label: 'نسبة الاستخراج',
                                      value: `استخراج ${q.extractionGrade}`,
                                      badge: true,
                                      badgeColor: 'bg-indigo-100 text-indigo-800',
                                    },
                                    { label: 'الحصة اليومية بالطن', value: `${q.dailyQuotaTons} طن` },
                                    {
                                      label: 'الحصة اليومية بالشيكارة (50 كجم)',
                                      value: `${q.dailyQuotaSacks} شيكارة`,
                                    },
                                    { label: 'الحصة الأسبوعية بالطن', value: `${q.weeklyQuotaTons} طن` },
                                    { label: 'الحصة الشهرية بالطن', value: `${q.monthlyQuotaTons} طن` },
                                    { label: 'الحصة السنوية بالطن', value: `${q.annualQuotaTons} طن` },
                                    {
                                      label: 'حالة الحصة',
                                      value: q.quotaStatus,
                                      badge: true,
                                      badgeColor:
                                        q.quotaStatus === 'سارية'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800',
                                    },
                                    { label: 'تاريخ بدء السريان', value: q.effectiveStartDate },
                                    { label: 'تاريخ انتهاء السريان', value: q.effectiveEndDate },
                                    {
                                      label: 'سبب التخصيص أو التعديل',
                                      value: q.allocationOrAmendmentReason,
                                      colSpan: 2,
                                    },
                                    { label: 'ملاحظات', value: q.notes || 'لا توجد ملاحظات', colSpan: 2 },
                                  ],
                                })
                              }
                              onEdit={() =>
                                setEditingRecord({
                                  sliceKey: 'flourQuotaMaster',
                                  title: q.bakeryName,
                                  record: { ...q },
                                })
                              }
                              onDelete={() =>
                                setDeleteModal({
                                  isOpen: true,
                                  sliceKey: 'flourQuotaMaster',
                                  entityId: q.id,
                                  entityTitle: `${q.bakeryName} (${q.quotaCode})`,
                                  recordSummary: [
                                    { label: 'المخبز', value: q.bakeryName },
                                    { label: 'كود الحصة', value: q.quotaCode },
                                    { label: 'المطحن', value: q.millName },
                                    {
                                      label: 'الحصة اليومية',
                                      value: `${q.dailyQuotaTons} طن (${q.dailyQuotaSacks} شيكارة)`,
                                    },
                                  ],
                                })
                              }
                              isSuperAdmin={
                                currentUser?.role === 'superadmin' || permissions?.canDelete
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      <LocalUnitSubtotalRow
                        unitName={group.localUnit}
                        recordCount={group.count}
                        labelColSpan={5}
                        metricCells={[
                          {
                            content: (
                              <div className="font-black text-amber-900">
                                {Number(group.subtotals.dailyQuotaTons || 0).toFixed(2)} طن{' '}
                                <span className="text-emerald-800 text-[10px]">
                                  ({group.subtotals.dailyQuotaSacks || 0} شيكارة)
                                </span>
                              </div>
                            ),
                            align: 'center',
                          },
                          { content: `${Number(group.subtotals.weeklyQuotaTons || 0).toFixed(2)} طن`, align: 'center' },
                          { content: `${Number(group.subtotals.monthlyQuotaTons || 0).toFixed(2)} طن`, align: 'center' },
                          { content: `${Number(group.subtotals.annualQuotaTons || 0).toFixed(2)} طن`, align: 'center' },
                          { content: '—', align: 'center' },
                          { content: '—', align: 'center' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={quotaGrouping.grandTotalCount}
                    labelColSpan={5}
                    metricCells={[
                      {
                        content: (
                          <div className="font-black text-amber-900">
                            {Number(quotaGrouping.grandTotals.dailyQuotaTons || 0).toFixed(2)} طن{' '}
                            <span className="text-emerald-800 text-[10px]">
                              ({quotaGrouping.grandTotals.dailyQuotaSacks || 0} شيكارة)
                            </span>
                          </div>
                        ),
                        align: 'center',
                      },
                      { content: `${Number(quotaGrouping.grandTotals.weeklyQuotaTons || 0).toFixed(2)} طن`, align: 'center' },
                      { content: `${Number(quotaGrouping.grandTotals.monthlyQuotaTons || 0).toFixed(2)} طن`, align: 'center' },
                      { content: `${Number(quotaGrouping.grandTotals.annualQuotaTons || 0).toFixed(2)} طن`, align: 'center' },
                      { content: '—', align: 'center' },
                      { content: '—', align: 'center' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. التوزيع اليومي لحصص الدقيق */}
      {subTab === 'daily' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              التوزيع اليومي لحصص الدقيق ونسب التنفيذ الفعلية
            </h3>
            <p className="text-xs font-bold text-slate-500">
              المتبقي اليومي = الحصة اليومية المقررة - إجمالي الكمية المصروفة المعتمدة | نسبة التنفيذ = (الكمية المصروفة ÷ الحصة اليومية المقررة) × 100
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full compact-erp-table text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">المطحن</th>
                  <th className="p-3">المخبز والقرية</th>
                  <th className="p-3 text-center">الحصة اليومية المقررة</th>
                  <th className="p-3 text-center bg-emerald-950/70">المنصرف الفعلي المعتمد</th>
                  <th className="p-3 text-center">المتبقي اليومي</th>
                  <th className="p-3 text-center">نسبة التنفيذ %</th>
                  <th className="p-3 text-center">رقم إذن الصرف</th>
                  <th className="p-3 text-center">حالة الصرف اليومي</th>
                  <th className="p-3">سبب عدم الصرف / النقص</th>
                  <th className="p-3 text-center">إدارة السجل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {dailyDistributions.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono">{d.date}</td>
                    <td className="p-3">{d.millName}</td>
                    <td className="p-3">
                      <div className="font-black text-slate-900">{d.bakeryName}</div>
                      <div className="text-[10px] text-slate-500">{d.village}</div>
                    </td>
                    <td className="p-3 text-center font-black">{d.prescribedDailyQuotaTons} طن</td>
                    <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                      {d.actualApprovedDisbursedTons} طن
                    </td>
                    <td className="p-3 text-center text-rose-700 font-black">
                      {d.remainingDailyTons} طن
                    </td>
                    <td className="p-3 text-center font-black">{d.executionPct}%</td>
                    <td className="p-3 text-center font-mono text-indigo-800">
                      {d.issueOrderNumber}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                          d.disbursementStatus === 'تم الصرف بالكامل'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.disbursementStatus === 'صرف جزئي'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}
                      >
                        {d.disbursementStatus}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">
                      {d.nonDisbursementOrShortageReason || 'منتظم'}
                    </td>
                    <td className="p-3 text-center">
                      <ModuleRowActions
                        entityLabel={`${d.bakeryName} (${d.date})`}
                        permissions={effectivePermissions}
                        onView={() =>
                          setProfileModal({
                            isOpen: true,
                            title: `توزيع يومي: ${d.bakeryName}`,
                            subtitle: `${d.date} — ${d.millName}`,
                            entityType: 'توزيع يومي لحصة الدقيق',
                            onEdit: () =>
                              setEditingRecord({
                                sliceKey: 'flourDailyDistributions',
                                title: `${d.bakeryName} (${d.date})`,
                                record: { ...d },
                              }),
                            fields: [
                              { label: 'التاريخ', value: d.date, mono: true },
                              { label: 'المخبز', value: `${d.bakeryName} (${d.village})` },
                              { label: 'المطحن', value: d.millName },
                              { label: 'الحصة المقررة', value: `${d.prescribedDailyQuotaTons} طن`, mono: true },
                              { label: 'المنصرف الفعلي', value: `${d.actualApprovedDisbursedTons} طن`, mono: true },
                              { label: 'المتبقي اليومي', value: `${d.remainingDailyTons} طن`, mono: true },
                              { label: 'حالة الصرف', value: d.disbursementStatus, badge: true, badgeColor: 'teal' },
                            ],
                          })
                        }
                        onEdit={() =>
                          setEditingRecord({
                            sliceKey: 'flourDailyDistributions',
                            title: `${d.bakeryName} (${d.date})`,
                            record: { ...d },
                          })
                        }
                        onDelete={() =>
                          setDeleteModal({
                            isOpen: true,
                            sliceKey: 'flourDailyDistributions',
                            entityId: d.id,
                            entityTitle: `${d.bakeryName} (${d.date})`,
                            recordSummary: [
                              { label: 'المخبز', value: d.bakeryName },
                              { label: 'المنصرف', value: `${d.actualApprovedDisbursedTons} طن` },
                            ],
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {dailyDistributions.length > 0 && (
                  <VillageGrandTotalRow
                    totalCount={dailyDistributions.length}
                    labelColSpan={3}
                    metricCells={[
                      {
                        content: `${dailyDistributions.reduce((s, d) => s + (Number(d.prescribedDailyQuotaTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${dailyDistributions.reduce((s, d) => s + (Number(d.actualApprovedDisbursedTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${dailyDistributions.reduce((s, d) => s + (Number(d.remainingDailyTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      { content: '—', align: 'center', colSpan: 5 },
                    ]}
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. متابعة الحصص الشهرية والسنوية */}
      {subTab === 'monthly' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              متابعة الحصص الشهرية والسنوية (مع احتساب أيام العمل الفعلية وأيام التوقف)
            </h3>
            <p className="text-xs font-bold text-slate-500">
              إجمالي الحصة الشهرية = الحصة اليومية × عدد أيام الاستحقاق المعتمدة بعد استبعاد أيام التوقف
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full compact-erp-table text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">الشهر والسنة</th>
                  <th className="p-3">المطحن والمخبز</th>
                  <th className="p-3 text-center">الحصة اليومية</th>
                  <th className="p-3 text-center">أيام العمل / أيام التوقف</th>
                  <th className="p-3 text-center">الحصة الشهرية المقررة</th>
                  <th className="p-3 text-center">المنصرف الشهري / المتبقي</th>
                  <th className="p-3 text-center">نسبة التنفيذ الشهرية</th>
                  <th className="p-3 text-center">الحصة السنوية / المنصرف السنوي</th>
                  <th className="p-3 text-center">إدارة السجل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {monthlyQuotas.map((mq) => (
                  <tr key={mq.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black">
                      {mq.month}/{mq.year}
                    </td>
                    <td className="p-3">
                      <div className="font-black text-slate-900">{mq.bakeryName}</div>
                      <div className="text-[10px] text-indigo-700">{mq.millName}</div>
                    </td>
                    <td className="p-3 text-center">{mq.dailyQuotaTons} طن</td>
                    <td className="p-3 text-center">
                      <div>عمل: {mq.eligibleWorkingDays} يوم</div>
                      <div className="text-[10px] text-rose-700">توقف: {mq.stopDays} يوم</div>
                    </td>
                    <td className="p-3 text-center font-black">{mq.prescribedMonthlyQuotaTons} طن</td>
                    <td className="p-3 text-center">
                      <div className="text-emerald-700">منصرف: {mq.actualMonthlyDisbursedTons} طن</div>
                      <div className="text-[10px] text-amber-800">متبقي: {mq.remainingMonthlyTons} طن</div>
                    </td>
                    <td className="p-3 text-center font-black">{mq.monthlyExecutionPct}%</td>
                    <td className="p-3 text-center">
                      {mq.prescribedAnnualQuotaTons} / {mq.actualAnnualDisbursedTons} طن
                    </td>
                    <td className="p-3 text-center">
                      <ModuleRowActions
                        entityLabel={`${mq.bakeryName} (${mq.month}/${mq.year})`}
                        permissions={effectivePermissions}
                        onView={() =>
                          setProfileModal({
                            isOpen: true,
                            title: `حصة شهرية: ${mq.bakeryName}`,
                            subtitle: `${mq.month}/${mq.year}`,
                            entityType: 'متابعة حصة شهرية',
                            onEdit: () =>
                              setEditingRecord({
                                sliceKey: 'flourMonthlyQuotas',
                                title: `${mq.bakeryName} (${mq.month}/${mq.year})`,
                                record: { ...mq },
                              }),
                            fields: [
                              { label: 'الشهر والسنة', value: `${mq.month}/${mq.year}`, mono: true },
                              { label: 'المخبز', value: mq.bakeryName },
                              { label: 'المطحن', value: mq.millName },
                              { label: 'الحصة الشهرية المقررة', value: `${mq.prescribedMonthlyQuotaTons} طن`, mono: true },
                              { label: 'المنصرف الشهري', value: `${mq.actualMonthlyDisbursedTons} طن`, mono: true },
                            ],
                          })
                        }
                        onEdit={() =>
                          setEditingRecord({
                            sliceKey: 'flourMonthlyQuotas',
                            title: `${mq.bakeryName} (${mq.month}/${mq.year})`,
                            record: { ...mq },
                          })
                        }
                        onDelete={() =>
                          setDeleteModal({
                            isOpen: true,
                            sliceKey: 'flourMonthlyQuotas',
                            entityId: mq.id,
                            entityTitle: `${mq.bakeryName} (${mq.month}/${mq.year})`,
                            recordSummary: [
                              { label: 'المخبز', value: mq.bakeryName },
                              { label: 'الحصة الشهرية', value: `${mq.prescribedMonthlyQuotaTons} طن` },
                            ],
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {monthlyQuotas.length > 0 && (
                  <VillageGrandTotalRow
                    totalCount={monthlyQuotas.length}
                    labelColSpan={4}
                    metricCells={[
                      {
                        content: `${monthlyQuotas.reduce((s, mq) => s + (Number(mq.prescribedMonthlyQuotaTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${monthlyQuotas.reduce((s, mq) => s + (Number(mq.actualMonthlyDisbursedTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      { content: '—', align: 'center', colSpan: 3 },
                    ]}
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. دفتر صرف الدقيق للمخابز */}
      {subTab === 'issues' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                دفتر صرف الدقيق للمخابز التموينية (19 عموداً)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                الرصيد بعد الصرف = الرصيد قبل الصرف - الكمية المصروفة المعتمدة، مع منع صرف حصة أكبر من المقرر إلا بتجاوز إداري مسبب
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddIssueModal(true)}
                data-testid="btn-add-flour-issue"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل إذن صرف دقيق لمخبز</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full compact-erp-table text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم إذن الصرف والتاريخ</th>
                    <th className="p-3">المطحن</th>
                    <th className="p-3">المخبز وصاحب المخبز والقرية</th>
                    <th className="p-3 text-center">الحصة المقررة</th>
                    <th className="p-3 text-center bg-emerald-950/70">المنصرف الفعلي (طن / شيكارة)</th>
                    <th className="p-3 text-center">رصيد المطحن (قبل / بعد)</th>
                    <th className="p-3 text-center">إجمالي القيمة</th>
                    <th className="p-3">السيارة والسائق والمستلم</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {flourIssues.map((iss) => (
                    <tr key={iss.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-mono font-black text-indigo-900">
                          {iss.issueOrderNumber}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {iss.issueDate} | {iss.issueTime}
                        </div>
                      </td>
                      <td className="p-3 font-black">{iss.millName}</td>
                      <td className="p-3">
                        <div className="font-black text-slate-900">{iss.bakeryName}</div>
                        <div className="text-[10px] text-slate-500">
                          {iss.bakeryOwnerName} - {iss.village}
                        </div>
                      </td>
                      <td className="p-3 text-center">{iss.prescribedQuotaTons} طن</td>
                      <td className="p-3 text-center bg-emerald-50">
                        <div className="font-black text-emerald-800">{iss.issuedQuantityTons} طن</div>
                        <div className="text-[10px] text-slate-600">
                          ({iss.sacksCount} شيكارة × {iss.sackWeightKg} كجم)
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {iss.balanceBeforeIssueTons} ←{' '}
                        <span className="font-black text-indigo-900">
                          {iss.balanceAfterIssueTons} طن
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {iss.totalValue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3">
                        <div>
                          {iss.vehicleNumber} - {iss.driverName}
                        </div>
                        <div className="text-[10px] text-slate-500">المستلم: {iss.receiverName}</div>
                      </td>
                      <td className="p-3 text-center">
                        <ModuleRowActions
                          entityLabel={iss.issueOrderNumber}
                          permissions={effectivePermissions}
                          onView={() =>
                            setProfileModal({
                              isOpen: true,
                              title: `إذن صرف دقيق: ${iss.issueOrderNumber}`,
                              subtitle: `${iss.bakeryName} — ${iss.issueDate}`,
                              entityType: 'إذن صرف دقيق للمخابز',
                              onEdit: () =>
                                setEditingRecord({
                                  sliceKey: 'flourIssues',
                                  title: iss.issueOrderNumber,
                                  record: { ...iss },
                                }),
                              fields: [
                                { label: 'رقم الإذن', value: iss.issueOrderNumber, mono: true },
                                { label: 'المخبز', value: iss.bakeryName },
                                { label: 'المطحن', value: iss.millName },
                                { label: 'المنصرف الفعلي', value: `${iss.issuedQuantityTons} طن (${iss.sacksCount} شيكارة)`, mono: true },
                                { label: 'إجمالي القيمة', value: `${iss.totalValue.toLocaleString('ar-EG')} ج.م`, mono: true },
                              ],
                            })
                          }
                          onEdit={() =>
                            setEditingRecord({
                              sliceKey: 'flourIssues',
                              title: iss.issueOrderNumber,
                              record: { ...iss },
                            })
                          }
                          onDelete={() =>
                            setDeleteModal({
                              isOpen: true,
                              sliceKey: 'flourIssues',
                              entityId: iss.id,
                              entityTitle: iss.issueOrderNumber,
                              recordSummary: [
                                { label: 'رقم الإذن', value: iss.issueOrderNumber },
                                { label: 'المنصرف', value: `${iss.issuedQuantityTons} طن` },
                              ],
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {flourIssues.length > 0 && (
                    <VillageGrandTotalRow
                      totalCount={flourIssues.length}
                      labelColSpan={4}
                      metricCells={[
                        {
                          content: `${flourIssues.reduce((s, iss) => s + (Number(iss.issuedQuantityTons) || 0), 0).toFixed(2)} طن (${flourIssues.reduce((s, iss) => s + (Number(iss.sacksCount) || 0), 0)} ش)`,
                          align: 'center',
                          mono: true,
                        },
                        { content: '—', align: 'center' },
                        {
                          content: `${flourIssues.reduce((s, iss) => s + (Number(iss.totalValue) || 0), 0).toLocaleString('ar-EG')} ج.م`,
                          align: 'center',
                          mono: true,
                        },
                        { content: '—', align: 'center', colSpan: 2 },
                      ]}
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. قرارات تعديل الحصص */}
      {subTab === 'amendments' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل قرارات تعديل حصص الدقيق (زيادة / خفض / إيقاف مؤقت / نقل مطحن)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                مقدار التغيير = الحصة الجديدة - الحصة السابقة، مع حفظ السجل التاريخي للحصة قبل وبعد التعديل
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddAmendModal(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل قرار تعديل حصة</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full compact-erp-table text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم القرار وتاريخه</th>
                    <th className="p-3">المخبز والمطحن</th>
                    <th className="p-3 text-center">نوع التعديل</th>
                    <th className="p-3 text-center">الحصة السابقة</th>
                    <th className="p-3 text-center">الحصة الجديدة</th>
                    <th className="p-3 text-center">مقدار التغيير (طن)</th>
                    <th className="p-3">سبب التعديل والجهة المصدرة</th>
                    <th className="p-3 text-center">سريان القرار</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {amendments.map((am) => (
                    <tr key={am.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-black text-indigo-900">{am.decisionNumber}</div>
                        <div className="text-[10px] text-slate-500">{am.decisionDate}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-black">{am.bakeryName}</div>
                        <div className="text-[10px] text-slate-500">{am.millName}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-black">
                          {am.amendmentType}
                        </span>
                      </td>
                      <td className="p-3 text-center">{am.previousDailyQuotaTons} طن</td>
                      <td className="p-3 text-center font-black text-indigo-900">
                        {am.newDailyQuotaTons} طن
                      </td>
                      <td
                        className={`p-3 text-center font-black ${
                          am.changeDeltaTons >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {am.changeDeltaTons > 0 ? `+${am.changeDeltaTons}` : am.changeDeltaTons} طن
                      </td>
                      <td className="p-3">
                        <div>{am.reason}</div>
                        <div className="text-[10px] text-slate-500">{am.issuingAuthority}</div>
                      </td>
                      <td className="p-3 text-center text-[11px]">
                        من {am.effectiveStartDate} إلى {am.effectiveEndDate}
                      </td>
                      <td className="p-3 text-center">
                        <ModuleRowActions
                          entityLabel={am.decisionNumber}
                          permissions={effectivePermissions}
                          onView={() =>
                            setProfileModal({
                              isOpen: true,
                              title: `قرار تعديل حصة: ${am.decisionNumber}`,
                              subtitle: `${am.bakeryName} — ${am.decisionDate}`,
                              entityType: 'قرار تعديل حصة دقيق',
                              onEdit: () =>
                                setEditingRecord({
                                  sliceKey: 'flourQuotaAmendments',
                                  title: am.decisionNumber,
                                  record: { ...am },
                                }),
                              fields: [
                                { label: 'رقم القرار', value: am.decisionNumber },
                                { label: 'المخبز', value: am.bakeryName },
                                { label: 'نوع التعديل', value: am.amendmentType, badge: true, badgeColor: 'amber' },
                                { label: 'الحصة السابقة ← الجديدة', value: `${am.previousDailyQuotaTons} ← ${am.newDailyQuotaTons} طن`, mono: true },
                              ],
                            })
                          }
                          onEdit={() =>
                            setEditingRecord({
                              sliceKey: 'flourQuotaAmendments',
                              title: am.decisionNumber,
                              record: { ...am },
                            })
                          }
                          onDelete={() =>
                            setDeleteModal({
                              isOpen: true,
                              sliceKey: 'flourQuotaAmendments',
                              entityId: am.id,
                              entityTitle: am.decisionNumber,
                              recordSummary: [
                                { label: 'رقم القرار', value: am.decisionNumber },
                                { label: 'المخبز', value: am.bakeryName },
                              ],
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {amendments.length > 0 && (
                    <VillageGrandTotalRow
                      totalCount={amendments.length}
                      labelColSpan={3}
                      metricCells={[
                        {
                          content: `${amendments.reduce((s, am) => s + (Number(am.previousDailyQuotaTons) || 0), 0).toFixed(2)} طن`,
                          align: 'center',
                          mono: true,
                        },
                        {
                          content: `${amendments.reduce((s, am) => s + (Number(am.newDailyQuotaTons) || 0), 0).toFixed(2)} طن`,
                          align: 'center',
                          mono: true,
                        },
                        {
                          content: `${amendments.reduce((s, am) => s + (Number(am.changeDeltaTons) || 0), 0).toFixed(2)} طن`,
                          align: 'center',
                          mono: true,
                        },
                        { content: '—', align: 'center', colSpan: 3 },
                      ]}
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. خريطة ارتباط المطاحن بالمخابز */}
      {subTab === 'mapping' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              خريطة ارتباط المطاحن بالمخابز وتوزيع الحصص الجغرافي بالقرى والوحدات المحلية
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full compact-erp-table text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">كود الارتباط</th>
                  <th className="p-3">المطحن المغذي</th>
                  <th className="p-3">المخبز المربوط وصاحبه</th>
                  <th className="p-3">القرية والوحدة المحلية</th>
                  <th className="p-3 text-center">الحصة اليومية (طن)</th>
                  <th className="p-3 text-center">الحصة الشهرية (طن)</th>
                  <th className="p-3 text-center">فترة الارتباط</th>
                  <th className="p-3 text-center">حالة الارتباط</th>
                  <th className="p-3 text-center">إدارة السجل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {mappings.map((mp) => (
                  <tr key={mp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black text-indigo-800">{mp.mappingCode}</td>
                    <td className="p-3 font-black">{mp.millName}</td>
                    <td className="p-3">
                      <div className="font-black text-slate-900">{mp.bakeryName}</div>
                      <div className="text-[10px] text-slate-500">{mp.ownerName}</div>
                    </td>
                    <td className="p-3">
                      {mp.village} ({mp.localUnit})
                    </td>
                    <td className="p-3 text-center font-black text-amber-800">
                      {mp.dailyQuotaTons} طن
                    </td>
                    <td className="p-3 text-center font-black text-emerald-800">
                      {mp.monthlyQuotaTons} طن
                    </td>
                    <td className="p-3 text-center text-[11px]">
                      {mp.linkStartDate} ← {mp.linkEndDate}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-black">
                        {mp.linkStatus}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <ModuleRowActions
                        entityLabel={mp.mappingCode}
                        permissions={effectivePermissions}
                        onView={() =>
                          setProfileModal({
                            isOpen: true,
                            title: `ارتباط مطحن بمخبز: ${mp.mappingCode}`,
                            subtitle: `${mp.millName} ← ${mp.bakeryName}`,
                            entityType: 'خريطة ارتباط مطاحن ومخابز',
                            onEdit: () =>
                              setEditingRecord({
                                sliceKey: 'millBakeryMappings',
                                title: mp.mappingCode,
                                record: { ...mp },
                              }),
                            fields: [
                              { label: 'كود الارتباط', value: mp.mappingCode, mono: true },
                              { label: 'المطحن', value: mp.millName },
                              { label: 'المخبز', value: `${mp.bakeryName} (${mp.village})` },
                              { label: 'الحصة اليومية / الشهرية', value: `${mp.dailyQuotaTons} / ${mp.monthlyQuotaTons} طن`, mono: true },
                            ],
                          })
                        }
                        onEdit={() =>
                          setEditingRecord({
                            sliceKey: 'millBakeryMappings',
                            title: mp.mappingCode,
                            record: { ...mp },
                          })
                        }
                        onDelete={() =>
                          setDeleteModal({
                            isOpen: true,
                            sliceKey: 'millBakeryMappings',
                            entityId: mp.id,
                            entityTitle: mp.mappingCode,
                            recordSummary: [
                              { label: 'كود الارتباط', value: mp.mappingCode },
                              { label: 'المخبز', value: mp.bakeryName },
                            ],
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {mappings.length > 0 && (
                  <VillageGrandTotalRow
                    totalCount={mappings.length}
                    labelColSpan={4}
                    metricCells={[
                      {
                        content: `${mappings.reduce((s, mp) => s + (Number(mp.dailyQuotaTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${mappings.reduce((s, mp) => s + (Number(mp.monthlyQuotaTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      { content: '—', align: 'center', colSpan: 3 },
                    ]}
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. الأرصدة الفعلية وحركة الدقيق بالمطاحن */}
      {subTab === 'mill_stock' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              الأرصدة الفعلية وحركة الدقيق بالمطاحن (فصل الدقيق المنتج عن المخصص كحصص وعن المصروف فعلياً)
            </h3>
            <p className="text-xs font-bold text-slate-500">
              الرصيد الحالي = الرصيد الافتتاحي + الإنتاج المعتمد + الوارد + التحويلات الواردة - المنصرف للمخابز - التحويلات الصادرة + التسويات المعتمدة
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full compact-erp-table text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">المطحن ونوع الدقيق</th>
                  <th className="p-3 text-center">الافتتاحي (طن)</th>
                  <th className="p-3 text-center bg-indigo-950/70">الدقيق المنتج المعتمد</th>
                  <th className="p-3 text-center">إجمالي المتاح بالمطحن</th>
                  <th className="p-3 text-center bg-amber-950/70">المخصص كحصص للمخابز</th>
                  <th className="p-3 text-center bg-emerald-950/70">المنصرف الفعلي للمخابز</th>
                  <th className="p-3 text-center bg-sky-950/80">الرصيد الحالي الفعلي بالمطحن</th>
                  <th className="p-3 text-center">إدارة السجل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {millStockBalances.map((b) => {
                  const calc = computeMillFlourStockBalanceSummary(b);
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-black text-slate-900">{b.millName}</div>
                        <div className="text-[10px] text-slate-500">{b.flourType}</div>
                      </td>
                      <td className="p-3 text-center">{b.openingBalanceTons} طن</td>
                      <td className="p-3 text-center font-black text-indigo-800 bg-indigo-50">
                        +{b.approvedProducedTons} طن
                      </td>
                      <td className="p-3 text-center font-black">{calc.totalAvailableTons} طن</td>
                      <td className="p-3 text-center font-black text-amber-800 bg-amber-50">
                        {b.allocatedQuotaTotalTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                        -{b.actualDisbursedToBakeriesTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-sky-900 bg-sky-50 text-sm">
                        {calc.currentStockBalanceTons} طن
                      </td>
                      <td className="p-3 text-center">
                        <ModuleRowActions
                          entityLabel={b.millName}
                          permissions={effectivePermissions}
                          onView={() =>
                            setProfileModal({
                              isOpen: true,
                              title: `رصيد دقيق المطحن: ${b.millName}`,
                              subtitle: b.flourType,
                              entityType: 'أرصدة وحركة الدقيق بالمطاحن',
                              onEdit: () =>
                                setEditingRecord({
                                  sliceKey: 'millFlourStockBalances',
                                  title: b.millName,
                                  record: { ...b },
                                }),
                              fields: [
                                { label: 'المطحن', value: b.millName },
                                { label: 'الرصيد الافتتاحي', value: `${b.openingBalanceTons} طن`, mono: true },
                                { label: 'الإنتاج المعتمد', value: `${b.approvedProducedTons} طن`, mono: true },
                                { label: 'المنصرف للمخابز', value: `${b.actualDisbursedToBakeriesTons} طن`, mono: true },
                                { label: 'الرصيد الحالي الفعلي', value: `${calc.currentStockBalanceTons} طن`, mono: true },
                              ],
                            })
                          }
                          onEdit={() =>
                            setEditingRecord({
                              sliceKey: 'millFlourStockBalances',
                              title: b.millName,
                              record: { ...b },
                            })
                          }
                          onDelete={() =>
                            setDeleteModal({
                              isOpen: true,
                              sliceKey: 'millFlourStockBalances',
                              entityId: b.id,
                              entityTitle: b.millName,
                              recordSummary: [
                                { label: 'المطحن', value: b.millName },
                                { label: 'الرصيد الحالي', value: `${calc.currentStockBalanceTons} طن` },
                              ],
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {millStockBalances.length > 0 && (
                  <VillageGrandTotalRow
                    totalCount={millStockBalances.length}
                    labelColSpan={1}
                    metricCells={[
                      {
                        content: `${millStockBalances.reduce((s, b) => s + (Number(b.openingBalanceTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `+${millStockBalances.reduce((s, b) => s + (Number(b.approvedProducedTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${millStockBalances.reduce((s, b) => s + computeMillFlourStockBalanceSummary(b).totalAvailableTons, 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${millStockBalances.reduce((s, b) => s + (Number(b.allocatedQuotaTotalTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `-${millStockBalances.reduce((s, b) => s + (Number(b.actualDisbursedToBakeriesTons) || 0), 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      {
                        content: `${millStockBalances.reduce((s, b) => s + computeMillFlourStockBalanceSummary(b).currentStockBalanceTons, 0).toFixed(2)} طن`,
                        align: 'center',
                        mono: true,
                      },
                      { content: '—', align: 'center' },
                    ]}
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة ربط وتخصيص حصة دقيق لمخبز */}
      {showAddQuotaModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              ربط وتخصيص حصة دقيق لمخبز من قاعدة بيانات المخابز الرئيسية
            </h3>
            <form onSubmit={handleCreateQuotaMaster} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">
                    اختر المخبز من قاعدة بيانات المخابز الرئيسية (سحب تلقائي للقرية والحصة)
                  </label>
                  <select
                    value={selectedBakeryId}
                    onChange={(e) => handleSelectBakeryForQuota(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {bakeries.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bakeryOwnerName} — ماكينة ({b.machineNumber}) — {b.village} ({b.actualQuota} شيكارة)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المطحن المربوط عليه</label>
                  <select
                    value={newQuota.millCode}
                    onChange={(e) => setNewQuota({ ...newQuota, millCode: e.target.value })}
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
                  <label className="block mb-1 text-slate-700">الحصة اليومية المقررة (بالطن)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newQuota.dailyQuotaTons}
                    onChange={(e) =>
                      setNewQuota({ ...newQuota, dailyQuotaTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">رقم قرار التخصيص</label>
                  <input
                    type="text"
                    required
                    value={newQuota.allocationDecisionNumber}
                    onChange={(e) =>
                      setNewQuota({
                        ...newQuota,
                        allocationDecisionNumber: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">درجة الاستخراج</label>
                  <select
                    value={newQuota.extractionGrade}
                    onChange={(e) =>
                      setNewQuota({
                        ...newQuota,
                        extractionGrade: e.target.value as '82%' | '72%',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="82%">82% (بلدي مدعم)</option>
                    <option value="72%">72% (طباقي / حر)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddQuotaModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-black"
                >
                  حفظ وتفعيل الحصة التموينية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل إذن صرف دقيق لمخبز */}
      {showAddIssueModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل إذن صرف دقيق لمخبز تمويني
            </h3>
            <form onSubmit={handleCreateFlourIssue} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم إذن الصرف</label>
                  <input
                    type="text"
                    required
                    value={newIssue.issueOrderNumber}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, issueOrderNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المخبز والحصة</label>
                  <select
                    value={newIssue.quotaCode}
                    onChange={(e) => {
                      const q = quotaMaster.find((item) => item.quotaCode === e.target.value);
                      setNewIssue({
                        ...newIssue,
                        quotaCode: e.target.value,
                        issuedQuantityTons: q ? q.dailyQuotaTons : newIssue.issuedQuantityTons,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {quotaMaster.map((q) => (
                      <option key={q.quotaCode} value={q.quotaCode}>
                        {q.bakeryName} ({q.dailyQuotaTons} طن)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الكمية المصروفة (بالطن)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newIssue.issuedQuantityTons}
                    onChange={(e) =>
                      setNewIssue({
                        ...newIssue,
                        issuedQuantityTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">رقم السيارة واسم المستلم</label>
                  <input
                    type="text"
                    value={newIssue.receiverName}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, receiverName: e.target.value })
                    }
                    placeholder="اسم المستلم..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">
                    سبب التجاوز الإداري (إلزامي فقط في حال صرف كمية أكبر من الحصة اليومية)
                  </label>
                  <input
                    type="text"
                    value={newIssue.adminOverrideReason}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, adminOverrideReason: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddIssueModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-black"
                >
                  اعتماد إذن صرف الدقيق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة قرار تعديل حصة دقيق */}
      {showAddAmendModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل قرار تعديل حصة دقيق مع حفظ السجل التاريخي
            </h3>
            <form onSubmit={handleCreateAmendment} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم قرار التعديل</label>
                  <input
                    type="text"
                    required
                    value={newAmend.decisionNumber}
                    onChange={(e) =>
                      setNewAmend({ ...newAmend, decisionNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المخبز المستهدف</label>
                  <select
                    value={newAmend.quotaCode}
                    onChange={(e) => setNewAmend({ ...newAmend, quotaCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {quotaMaster.map((q) => (
                      <option key={q.quotaCode} value={q.quotaCode}>
                        {q.bakeryName} (الحالية: {q.dailyQuotaTons} طن)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الحصة اليومية الجديدة (طن)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={newAmend.newDailyQuotaTons}
                    onChange={(e) =>
                      setNewAmend({
                        ...newAmend,
                        newDailyQuotaTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نوع القرار</label>
                  <select
                    value={newAmend.amendmentType}
                    onChange={(e) =>
                      setNewAmend({ ...newAmend, amendmentType: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="زيادة">زيادة حصة</option>
                    <option value="خفض">خفض حصة</option>
                    <option value="إيقاف مؤقت">إيقاف مؤقت</option>
                    <option value="نقل مطحن">نقل مطحن</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">سبب التعديل</label>
                  <input
                    type="text"
                    required
                    value={newAmend.reason}
                    onChange={(e) => setNewAmend({ ...newAmend, reason: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddAmendModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-black"
                >
                  اعتماد قرار التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة التعديل السريع للسجل */}
      {editingRecord && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6 max-h-[88vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تعديل بيانات السجل: {editingRecord.title}
            </h3>
            <form onSubmit={handleSaveUniversalEdit} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(editingRecord.record)
                  .filter(([k, v]) => k !== 'id' && k !== 'serialNo' && (typeof v === 'string' || typeof v === 'number'))
                  .slice(0, 12)
                  .map(([key, val]) => (
                    <div key={key}>
                      <label className="block mb-1 text-slate-700 font-mono text-[11px]">{key}</label>
                      <input
                        type={typeof val === 'number' ? 'number' : 'text'}
                        step="any"
                        value={val as any}
                        onChange={(e) =>
                          setEditingRecord({
                            ...editingRecord,
                            record: {
                              ...editingRecord.record,
                              [key]: typeof val === 'number' ? Number(e.target.value) : e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                  ))}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-black"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة الملف التفصيلي للحصة مع الانتقال للتعديل */}
      {profileModal && (
        <ModuleRecordProfileModal
          isOpen={profileModal.isOpen}
          onClose={() => setProfileModal(null)}
          title={profileModal.title}
          entityType={profileModal.entityType}
          subtitle={profileModal.subtitle}
          fields={profileModal.fields}
          canEdit={effectivePermissions.canEdit}
          onEdit={profileModal.onEdit}
          printTitle="مديرية التموين والتجارة الداخلية بالغربية - إدارة تموين مركز المحلة الكبرى"
          preparedBy={currentUserFullName}
        />
      )}

      {/* نافذة تأكيد الحذف الخاصة بالسوبر أدمن */}
      {deleteModal && (
        <ModuleDeleteConfirmModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleConfirmDelete}
          entityTitle={deleteModal.entityTitle}
          entityTypeLabel="حصة دقيق تمويني"
          recordSummary={deleteModal.recordSummary}
          isSuperAdmin={currentUser?.role === 'superadmin' || permissions?.canDelete}
        />
      )}
    </div>
  );
};

