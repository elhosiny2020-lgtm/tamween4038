import React, { useMemo, useState } from 'react';
import {
  ThermometerSnowflake,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Wrench,
  Wallet,
  Plus,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react';
import type {
  GrainMaintenanceState,
  RefrigeratorIssueRecord,
  RefrigeratorReceiptRecord,
  RefrigeratorRecord,
  RefrigeratorTempLogRecord,
} from '../../../types/modules';
import type { AppUser, VillageHierarchy } from '../../../types';
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
  computeRefrigeratorAssetValuation,
  computeRefrigeratorFinancialSummary,
  computeRefrigeratorRoomMetrics,
} from '../../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../../services/modulesStorage';

interface RefrigeratorsDatabaseViewProps {
  state: GrainMaintenanceState;
  branchName: string;
  currentUserFullName: string;
  currentUser?: AppUser | null;
  permissions?: ModulePermissions;
  isViewer: boolean;
  canAdd?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  villages: VillageHierarchy[];
  onUpdateState: (updater: (prev: GrainMaintenanceState) => GrainMaintenanceState, summary: string) => void;
  onNotify: (type: 'ok' | 'err', text: string) => void;
}

export const RefrigeratorsDatabaseView: React.FC<RefrigeratorsDatabaseViewProps> = ({
  state,
  branchName,
  currentUserFullName,
  currentUser,
  permissions,
  isViewer,
  canAdd = !isViewer,
  canPrint = !isViewer,
  canExport = !isViewer,
  villages,
  onUpdateState,
  onNotify,
}) => {
  const effectivePermissions: ModulePermissions = useMemo(() => {
    if (permissions) return permissions;
    return resolveModuleCrudPermissions(currentUser || null, isViewer, 'grain_maintenance');
  }, [permissions, currentUser, isViewer]);
  const [subTab, setSubTab] = useState<
    | 'registry'
    | 'rooms'
    | 'receipts'
    | 'issues'
    | 'valuation'
    | 'temp_logs'
    | 'maintenance'
    | 'financials'
  >('registry');

  const refrigerators = state.refrigerators || [];
  const rooms = state.refrigeratorRooms || [];
  const receipts = state.refrigeratorReceipts || [];
  const issues = state.refrigeratorIssues || [];
  const assets = state.refrigeratorAssets || [];
  const tempLogs = state.refrigeratorTempLogs || [];
  const maintenance = state.refrigeratorMaintenance || [];
  const financials = state.refrigeratorFinancials || [];

  const today = new Date().toISOString().split('T')[0];

  // Add Refrigerator Modal
  const [showAddRefModal, setShowAddRefModal] = useState(false);
  const [newRef, setNewRef] = useState({
    refrigeratorCode: `REF-MHL-00${refrigerators.length + 1}`,
    refrigeratorName: '',
    ownerName: '',
    operatingCompany: '',
    ownershipType: 'خاص' as RefrigeratorRecord['ownershipType'],
    village: villages[0]?.village || 'بشبيش',
    detailedAddress: '',
    phone: '',
    managerName: '',
    operationsOfficer: '',
    coolingRoomsCount: 4,
    freezingRoomsCount: 2,
    totalAreaSqm: 1500,
    designCapacityTons: 600,
    operationalCapacityTons: 540,
    coolingSystemType: 'فريون صناعي مركزي',
    operationalStatus: 'تعمل' as RefrigeratorRecord['operationalStatus'],
    notes: '',
  });

  // Add Refrigerator Inbound Receipt Modal
  const [showAddReceiptModal, setShowAddReceiptModal] = useState(false);
  const [newReceipt, setNewReceipt] = useState({
    receiptOrderNumber: `RR-2026-${305 + receipts.length}`,
    receiptDate: today,
    receiptTime: new Date().toTimeString().slice(0, 5),
    refrigeratorCode: refrigerators[0]?.refrigeratorCode || 'REF-MHL-001',
    roomNumber: rooms[0]?.roomNumber || 'غرفة تجميد (F-01)',
    depositorOrSupplierName: '',
    commodityType: 'لحوم ودواجن مجمدة تموينية',
    subCategory: 'فرز أول معبأ',
    packagesCount: 1000,
    grossWeightTons: 21,
    tareWeightTons: 1,
    unitOrTonPrice: 85000,
    receivingTempCelsius: -18,
    productionDate: today,
    expiryDate: '2027-05-01',
    receiverName: currentUserFullName,
    adminCapacityOverrideReason: '',
    notes: '',
  });

  // Add Refrigerator Outbound Issue Modal
  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    issueOrderNumber: `RI-2026-${405 + issues.length}`,
    issueDate: today,
    refrigeratorCode: refrigerators[0]?.refrigeratorCode || 'REF-MHL-001',
    roomNumber: rooms[0]?.roomNumber || 'غرفة تجميد (F-01)',
    beneficiaryEntityName: '',
    commodityType: 'لحوم ودواجن مجمدة تموينية',
    packagesCount: 500,
    netIssuedWeightTons: 10,
    unitOrTonPrice: 85000,
    issuerName: currentUserFullName,
    notes: '',
  });

  // Add Temp Log Modal
  const [showAddTempModal, setShowAddTempModal] = useState(false);
  const [newTemp, setNewTemp] = useState({
    refrigeratorCode: refrigerators[0]?.refrigeratorCode || 'REF-MHL-001',
    roomNumber: rooms[0]?.roomNumber || 'غرفة تجميد (F-01)',
    commodityType: 'لحوم ودواجن مجمدة تموينية',
    requiredTempCelsius: -18,
    actualTempCelsius: -18,
    coolingUnitsStatus: 'تعمل بكفاءة' as RefrigeratorTempLogRecord['coolingUnitsStatus'],
    powerStatus: 'تيار رئيسي منتظم' as RefrigeratorTempLogRecord['powerStatus'],
    backupGeneratorStatus: 'جاهز احتياطي' as RefrigeratorTempLogRecord['backupGeneratorStatus'],
    notes: '',
  });

  const roomsWithMetrics = useMemo(() => {
    return rooms.map((rm) => ({
      room: rm,
      metrics: computeRefrigeratorRoomMetrics({
        roomCapacityTons: rm.roomCapacityTons,
        openingBalanceTons: rm.openingBalanceTons,
        approvedInboundTons: rm.approvedInboundTons,
        approvedOutboundTons: rm.approvedOutboundTons,
      }),
    }));
  }, [rooms]);

  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    title: string;
    entityType: string;
    subtitle?: string;
    fields: { label: string; value: React.ReactNode; mono?: boolean; badge?: boolean; badgeColor?: string; colSpan?: number }[];
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    entityType: 'ref' | 'receipt';
    entityId: string;
    entityTitle: string;
    recordSummary: { label: string; value: string | number }[];
  } | null>(null);

  const handleConfirmDelete = () => {
    if (!deleteModal) return;
    const { entityType, entityId, entityTitle } = deleteModal;
    if (entityType === 'ref') {
      onUpdateState(
        (prev) => ({
          ...prev,
          refrigerators: (prev.refrigerators || []).filter((r) => r.id !== entityId && r.refrigeratorCode !== entityId),
        }),
        `حذف ثلاجة: ${entityTitle}`
      );
      onNotify('ok', `تم حذف الثلاجة «${entityTitle}» بنجاح.`);
    } else if (entityType === 'receipt') {
      onUpdateState(
        (prev) => ({
          ...prev,
          refrigeratorReceipts: (prev.refrigeratorReceipts || []).filter((r) => r.id !== entityId && r.receiptOrderNumber !== entityId),
        }),
        `حذف إذن استلام وارد للثلاجة: ${entityTitle}`
      );
      onNotify('ok', `تم حذف إذن الاستلام «${entityTitle}» بنجاح.`);
    }
    setDeleteModal(null);
  };

  const refGrouping = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: refrigerators,
      getLocalUnit: (r) => r.village,
      numericFields: [
        { key: 'coolingRoomsCount', getValue: (r) => r.coolingRoomsCount },
        { key: 'freezingRoomsCount', getValue: (r) => r.freezingRoomsCount },
        { key: 'totalAreaSqm', getValue: (r) => r.totalAreaSqm },
        { key: 'designCapacityTons', getValue: (r) => r.designCapacityTons },
        { key: 'operationalCapacityTons', getValue: (r) => r.operationalCapacityTons },
      ],
    });
  }, [refrigerators]);

  const handleCreateRefrigerator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRef.refrigeratorName.trim()) {
      onNotify('err', 'يرجى إدخال اسم الثلاجة.');
      return;
    }
    const rec: RefrigeratorRecord = {
      id: `ref-${Date.now()}`,
      serialNo: refrigerators.length + 1,
      refrigeratorCode: newRef.refrigeratorCode.trim(),
      refrigeratorName: newRef.refrigeratorName.trim(),
      ownerName: newRef.ownerName || 'غير محدد',
      operatingCompany: newRef.operatingCompany || 'غير محدد',
      ownershipType: newRef.ownershipType,
      governorate: 'الغربية',
      center: branchName,
      village: newRef.village,
      detailedAddress: newRef.detailedAddress,
      phone: newRef.phone,
      managerName: newRef.managerName,
      operationsOfficer: newRef.operationsOfficer,
      coolingRoomsCount: Number(newRef.coolingRoomsCount) || 0,
      freezingRoomsCount: Number(newRef.freezingRoomsCount) || 0,
      totalAreaSqm: Number(newRef.totalAreaSqm) || 0,
      designCapacityTons: Number(newRef.designCapacityTons) || 0,
      operationalCapacityTons: Number(newRef.operationalCapacityTons) || 0,
      coolingSystemType: newRef.coolingSystemType,
      operationalStatus: newRef.operationalStatus,
      startDate: today,
      lastInspectionDate: today,
      nextMaintenanceDate: today,
      notes: newRef.notes,
    };
    onUpdateState(
      (prev) => ({
        ...prev,
        refrigerators: [...(prev.refrigerators || []), rec],
      }),
      `إضافة ثلاجة جديدة: ${rec.refrigeratorName} (${rec.refrigeratorCode})`
    );
    setShowAddRefModal(false);
    onNotify('ok', `تم تسجيل الثلاجة «${rec.refrigeratorName}» بنجاح.`);
  };

  const handleCreateRefReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    const netTons = Number((newReceipt.grossWeightTons - newReceipt.tareWeightTons).toFixed(3));
    if (netTons <= 0) {
      onNotify('err', 'يجب أن يكون الوزن القائم أكبر من الوزن الفارغ.');
      return;
    }
    const targetRef = refrigerators.find((r) => r.refrigeratorCode === newReceipt.refrigeratorCode);
    const targetRoomEntry = roomsWithMetrics.find(
      (r) =>
        r.room.refrigeratorCode === newReceipt.refrigeratorCode &&
        r.room.roomNumber === newReceipt.roomNumber
    );

    if (
      targetRoomEntry &&
      netTons > targetRoomEntry.metrics.availableCapacityTons &&
      !newReceipt.adminCapacityOverrideReason.trim()
    ) {
      onNotify(
        'err',
        `تنبيه سعة الغرفة: الكمية الواردة (${netTons} طن) تتجاوز الطاقة المتاحة بالغرفة (${targetRoomEntry.metrics.availableCapacityTons} طن). يلزم كتابة سبب الاعتماد الاستثنائي.`
      );
      return;
    }

    const totalVal = Number((netTons * (Number(newReceipt.unitOrTonPrice) || 0)).toFixed(2));
    const rec: RefrigeratorReceiptRecord = {
      id: `rrec-${Date.now()}`,
      serialNo: receipts.length + 1,
      receiptOrderNumber: newReceipt.receiptOrderNumber.trim(),
      receiptDate: newReceipt.receiptDate,
      receiptTime: newReceipt.receiptTime,
      refrigeratorCode: newReceipt.refrigeratorCode,
      refrigeratorName: targetRef?.refrigeratorName || newReceipt.refrigeratorCode,
      roomNumber: newReceipt.roomNumber,
      depositorOrSupplierName: newReceipt.depositorOrSupplierName || 'جهة توريد معتمدة',
      commodityType: newReceipt.commodityType,
      subCategory: newReceipt.subCategory,
      packagesCount: Number(newReceipt.packagesCount) || 0,
      grossWeightTons: Number(newReceipt.grossWeightTons),
      tareWeightTons: Number(newReceipt.tareWeightTons),
      netWeightTons: netTons,
      unitOrTonPrice: Number(newReceipt.unitOrTonPrice),
      totalValue: totalVal,
      receivingTempCelsius: Number(newReceipt.receivingTempCelsius),
      commodityCondition: 'ممتازة ومطابقة',
      productionDate: newReceipt.productionDate,
      expiryDate: newReceipt.expiryDate,
      receiverName: newReceipt.receiverName,
      approvalStatus: 'معتمد',
      adminCapacityOverrideReason: newReceipt.adminCapacityOverrideReason.trim() || undefined,
      notes: newReceipt.notes,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        refrigeratorReceipts: [rec, ...(prev.refrigeratorReceipts || [])],
        refrigeratorRooms: (prev.refrigeratorRooms || []).map((rm) =>
          rm.refrigeratorCode === rec.refrigeratorCode && rm.roomNumber === rec.roomNumber
            ? {
                ...rm,
                approvedInboundTons: Number((rm.approvedInboundTons + netTons).toFixed(3)),
              }
            : rm
        ),
      }),
      `تسجيل إذن استلام ثلاجة رقم ${rec.receiptOrderNumber} بكمية ${netTons} طن`
    );
    setShowAddReceiptModal(false);
    onNotify('ok', `تم اعتماد إذن استلام الوارد ${rec.receiptOrderNumber} وتحديث رصيد الغرفة تلقائياً.`);
  };

  const handleCreateRefIssue = (e: React.FormEvent) => {
    e.preventDefault();
    const issuedTons = Number(newIssue.netIssuedWeightTons) || 0;
    if (issuedTons <= 0) {
      onNotify('err', 'الكمية المنصرفة يجب أن تكون أكبر من صفر.');
      return;
    }
    const targetRef = refrigerators.find((r) => r.refrigeratorCode === newIssue.refrigeratorCode);
    const targetRoomEntry = roomsWithMetrics.find(
      (r) =>
        r.room.refrigeratorCode === newIssue.refrigeratorCode &&
        r.room.roomNumber === newIssue.roomNumber
    );
    const balanceBefore = targetRoomEntry?.metrics.currentBalanceTons ?? 100;
    if (issuedTons > balanceBefore) {
      onNotify(
        'err',
        `رفض الصرف: الكمية المطلوبة (${issuedTons} طن) أكبر من الرصيد المتاح بالغرفة (${balanceBefore} طن).`
      );
      return;
    }
    const balanceAfter = Number((balanceBefore - issuedTons).toFixed(3));
    const totalVal = Number((issuedTons * (Number(newIssue.unitOrTonPrice) || 0)).toFixed(2));

    const rec: RefrigeratorIssueRecord = {
      id: `riss-${Date.now()}`,
      serialNo: issues.length + 1,
      issueOrderNumber: newIssue.issueOrderNumber.trim(),
      issueDate: newIssue.issueDate,
      refrigeratorCode: newIssue.refrigeratorCode,
      refrigeratorName: targetRef?.refrigeratorName || newIssue.refrigeratorCode,
      roomNumber: newIssue.roomNumber,
      beneficiaryEntityName: newIssue.beneficiaryEntityName || 'منفذ توزيع معتمد',
      commodityType: newIssue.commodityType,
      packagesCount: Number(newIssue.packagesCount) || 0,
      netIssuedWeightTons: issuedTons,
      balanceBeforeIssueTons: balanceBefore,
      balanceAfterIssueTons: balanceAfter,
      unitOrTonPrice: Number(newIssue.unitOrTonPrice),
      totalIssuedValue: totalVal,
      issuerName: newIssue.issuerName,
      approvalStatus: 'معتمد',
      notes: newIssue.notes,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        refrigeratorIssues: [rec, ...(prev.refrigeratorIssues || [])],
        refrigeratorRooms: (prev.refrigeratorRooms || []).map((rm) =>
          rm.refrigeratorCode === rec.refrigeratorCode && rm.roomNumber === rec.roomNumber
            ? {
                ...rm,
                approvedOutboundTons: Number((rm.approvedOutboundTons + issuedTons).toFixed(3)),
              }
            : rm
        ),
      }),
      `تسجيل إذن صرف من الثلاجة رقم ${rec.issueOrderNumber} بكمية ${issuedTons} طن`
    );
    setShowAddIssueModal(false);
    onNotify('ok', `تم اعتماد إذن الصرف ${rec.issueOrderNumber} وخصم ${issuedTons} طن من الغرفة.`);
  };

  const handleCreateTempLog = (e: React.FormEvent) => {
    e.preventDefault();
    const targetRef = refrigerators.find((r) => r.refrigeratorCode === newTemp.refrigeratorCode);
    const diff = Math.abs(newTemp.actualTempCelsius - newTemp.requiredTempCelsius);
    const alarm: RefrigeratorTempLogRecord['alarmStatus'] =
      newTemp.powerStatus === 'انقطاع تيار رئيسي'
        ? 'إنذار انقطاع كهرباء'
        : diff > 2.5
        ? 'إنذار ارتفاع حرارة'
        : 'طبيعي';

    const rec: RefrigeratorTempLogRecord = {
      id: `rtmp-${Date.now()}`,
      refrigeratorCode: newTemp.refrigeratorCode,
      refrigeratorName: targetRef?.refrigeratorName || newTemp.refrigeratorCode,
      roomNumber: newTemp.roomNumber,
      commodityType: newTemp.commodityType,
      requiredTempCelsius: Number(newTemp.requiredTempCelsius),
      actualTempCelsius: Number(newTemp.actualTempCelsius),
      measurementDateTime: new Date().toISOString().slice(0, 16).replace('T', ' '),
      coolingUnitsStatus: newTemp.coolingUnitsStatus,
      powerStatus: newTemp.powerStatus,
      backupGeneratorStatus: newTemp.backupGeneratorStatus,
      alarmStatus: alarm,
      technicianName: currentUserFullName,
      notes: newTemp.notes,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        refrigeratorTempLogs: [rec, ...(prev.refrigeratorTempLogs || [])],
      }),
      `تسجيل قراءة حرارة للغرفة ${rec.roomNumber} (${rec.actualTempCelsius}°C)`
    );
    setShowAddTempModal(false);
    onNotify(
      alarm === 'طبيعي' ? 'ok' : 'err',
      alarm === 'طبيعي'
        ? 'تم تسجيل قراءة درجة الحرارة بنجاح (في النطاق الآمن).'
        : `تنبيه فوري: ${alarm} في ${rec.refrigeratorName} (${rec.roomNumber})!`
    );
  };

  return (
    <div className="space-y-4" dir="rtl" data-testid="grain-refrigerators-view">
      {/* التبويبات الفرعية لقاعدة بيانات الثلاجات (8 جداول مترابطة) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-1.5">
        {[
          { id: 'registry', label: '1. سجل الثلاجات الرئيسي (23 عموداً)', icon: <ThermometerSnowflake className="w-4 h-4" /> },
          { id: 'rooms', label: '2. الطاقة التخزينية وأرصدة الغرف', icon: <Boxes className="w-4 h-4" /> },
          { id: 'receipts', label: '3. دفتر استلام الوارد اليومي', icon: <ArrowDownToLine className="w-4 h-4" /> },
          { id: 'issues', label: '4. دفتر صرف المنصرف اليومي', icon: <ArrowUpFromLine className="w-4 h-4" /> },
          { id: 'valuation', label: '5. التقييم المالي والأصول الثابتة', icon: <Landmark className="w-4 h-4" /> },
          { id: 'temp_logs', label: '6. درجات الحرارة والكهرباء والإنذارات', icon: <AlertTriangle className="w-4 h-4" /> },
          { id: 'maintenance', label: '7. صيانة الثلاجات والأعطال', icon: <Wrench className="w-4 h-4" /> },
          { id: 'financials', label: '8. المصروفات والمستحقات والتسعير', icon: <Wallet className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as any)}
            data-testid={`ref-subtab-${t.id}`}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              subTab === t.id
                ? 'bg-sky-900 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 1. سجل الثلاجات الرئيسي */}
      {subTab === 'registry' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل الثلاجات ومخازن التبريد والتجميد التابعة لإشراف القسم
              </h3>
              <p className="text-xs font-bold text-slate-500">
                يشمل بيانات الملكية، غرف التبريد والتجميد، الطاقة التصميمية والفعلية، حالة التشغيل، ومواعيد التفتيش والصيانة
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canAdd && (
                <button
                  type="button"
                  onClick={() => setShowAddRefModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة ثلاجة جديدة</span>
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToArabicCsv(
                      'refrigerators_registry',
                      [
                        'م',
                        'كود الثلاجة',
                        'اسم الثلاجة',
                        'المالك',
                        'الشركة المشغلة',
                        'نوع الملكية',
                        'القرية',
                        'العنوان',
                        'الهاتف',
                        'المدير المسؤول',
                        'مسؤول التشغيل',
                        'غرف التبريد',
                        'غرف التجميد',
                        'المساحة م2',
                        'الطاقة التصميمية (طن)',
                        'الطاقة الفعلية (طن)',
                        'نظام التبريد',
                        'حالة التشغيل',
                        'آخر فحص',
                        'الصيانة القادمة',
                      ],
                      refrigerators.map((r) => [
                        r.serialNo,
                        r.refrigeratorCode,
                        r.refrigeratorName,
                        r.ownerName,
                        r.operatingCompany,
                        r.ownershipType,
                        r.village,
                        r.detailedAddress,
                        r.phone,
                        r.managerName,
                        r.operationsOfficer,
                        r.coolingRoomsCount,
                        r.freezingRoomsCount,
                        r.totalAreaSqm,
                        r.designCapacityTons,
                        r.operationalCapacityTons,
                        r.coolingSystemType,
                        r.operationalStatus,
                        r.lastInspectionDate,
                        r.nextMaintenanceDate,
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
                      title: 'سجل الثلاجات ومخازن التبريد والتجميد',
                      subtitle: 'بيان الطاقة التصميمية والتشغيلية وحالة الغرف والمعدات',
                      branchName,
                      headers: [
                        'كود الثلاجة',
                        'اسم الثلاجة',
                        'الملكية والمالك',
                        'القرية والعنوان',
                        'المدير / التشغيل',
                        'الغرف (تبريد/تجميد)',
                        'الطاقة (تصميمي/فعلي)',
                        'نظام التبريد',
                        'الحالة',
                      ],
                      rows: refrigerators.map((r) => [
                        r.refrigeratorCode,
                        r.refrigeratorName,
                        `${r.ownershipType} - ${r.ownerName}`,
                        `${r.village} - ${r.detailedAddress}`,
                        `${r.managerName} (${r.phone})`,
                        `${r.coolingRoomsCount} تبريد / ${r.freezingRoomsCount} تجميد`,
                        `${r.designCapacityTons} / ${r.operationalCapacityTons} طن`,
                        r.coolingSystemType,
                        r.operationalStatus,
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
                    <th className="p-3">كود الثلاجة</th>
                    <th className="p-3">اسم الثلاجة والملكية</th>
                    <th className="p-3">المالك والشركة المشغلة</th>
                    <th className="p-3">القرية والعنوان</th>
                    <th className="p-3">المدير ومسؤول التشغيل</th>
                    <th className="p-3 text-center">الغرف والمساحة</th>
                    <th className="p-3 text-center">الطاقة (تصميمي / فعلي)</th>
                    <th className="p-3">نظام التبريد</th>
                    <th className="p-3 text-center">الحالة والصيانة</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {refGrouping.groups.map((group) => (
                    <React.Fragment key={group.localUnit}>
                      {group.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-black text-sky-800">{r.refrigeratorCode}</td>
                          <td className="p-3">
                            <div className="font-black text-slate-900">{r.refrigeratorName}</div>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-black">
                              ملكية: {r.ownershipType}
                            </span>
                          </td>
                          <td className="p-3">
                            <div>{r.ownerName}</div>
                            <div className="text-[10px] text-slate-500">{r.operatingCompany}</div>
                          </td>
                          <td className="p-3">
                            <div>{r.village}</div>
                            <div className="text-[10px] text-slate-500">{r.detailedAddress}</div>
                          </td>
                          <td className="p-3">
                            <div>{r.managerName}</div>
                            <div className="text-[10px] text-slate-500">
                              تشغيل: {r.operationsOfficer} | {r.phone}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div>
                              {r.coolingRoomsCount} تبريد + {r.freezingRoomsCount} تجميد
                            </div>
                            <div className="text-[10px] text-slate-500">{r.totalAreaSqm} م²</div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="font-black text-slate-900">{r.designCapacityTons} طن</div>
                            <div className="text-[10px] text-emerald-700">
                              فعلي: {r.operationalCapacityTons} طن
                            </div>
                          </td>
                          <td className="p-3 text-slate-700">{r.coolingSystemType}</td>
                          <td className="p-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-black ${
                                r.operationalStatus === 'تعمل'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : r.operationalStatus === 'تحت الصيانة'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {r.operationalStatus}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              صيانة قادمة: {r.nextMaintenanceDate}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <ModuleRowActions
                              entityLabel={r.refrigeratorName}
                              permissions={effectivePermissions}
                              testIdPrefix={`ref-row-${r.id}`}
                              onView={() =>
                                setProfileModal({
                                  isOpen: true,
                                  title: `بطاقة الثلاجة: ${r.refrigeratorName}`,
                                  subtitle: `كود ${r.refrigeratorCode} — ملكية ${r.ownershipType}`,
                                  entityType: 'بيانات تفصيلية لثلاجة ومخزن تبريد/تجميد',
                                  fields: [
                                    { label: 'كود الثلاجة', value: r.refrigeratorCode, mono: true },
                                    { label: 'اسم الثلاجة', value: r.refrigeratorName },
                                    { label: 'المالك / الشركة المشغلة', value: `${r.ownerName} (${r.operatingCompany})` },
                                    { label: 'الموقع والعنوان', value: `${r.village} — ${r.detailedAddress}` },
                                    { label: 'المدير ومسؤول التشغيل', value: `${r.managerName} | ${r.operationsOfficer} (${r.phone})` },
                                    { label: 'عدد الغرف والمساحة', value: `${r.coolingRoomsCount} تبريد + ${r.freezingRoomsCount} تجميد (${r.totalAreaSqm} م²)` },
                                    { label: 'الطاقة التصميمية', value: `${r.designCapacityTons} طن` },
                                    { label: 'الطاقة التشغيلية الفعلية', value: `${r.operationalCapacityTons} طن`, mono: true },
                                    { label: 'نظام التبريد', value: r.coolingSystemType },
                                    { label: 'الحالة التشغيلية', value: r.operationalStatus, badge: true, badgeColor: 'teal' },
                                    { label: 'تاريخ الصيانة القادمة', value: r.nextMaintenanceDate },
                                    { label: 'ملاحظات', value: r.notes || 'لا توجد' },
                                  ],
                                })
                              }
                              onDelete={() =>
                                setDeleteModal({
                                  isOpen: true,
                                  entityType: 'ref',
                                  entityId: r.id,
                                  entityTitle: r.refrigeratorName,
                                  recordSummary: [
                                    { label: 'كود الثلاجة', value: r.refrigeratorCode },
                                    { label: 'اسم الثلاجة', value: r.refrigeratorName },
                                    { label: 'المالك', value: r.ownerName },
                                    { label: 'الطاقة التشغيلية', value: `${r.operationalCapacityTons} طن` },
                                  ],
                                })
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
                          { content: `${group.subtotals.coolingRoomsCount} تبريد + ${group.subtotals.freezingRoomsCount} تجميد (${group.subtotals.totalAreaSqm?.toLocaleString('ar-EG')} م²)`, align: 'center' },
                          { content: `${group.subtotals.designCapacityTons?.toLocaleString('ar-EG')} / ${group.subtotals.operationalCapacityTons?.toLocaleString('ar-EG')} طن`, align: 'center', mono: true },
                          { content: '—', align: 'center', colSpan: 3 },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  {refGrouping.groups.length > 0 && (
                    <VillageGrandTotalRow
                      totalCount={refGrouping.grandTotalCount}
                      labelColSpan={5}
                      metricCells={[
                        { content: `${refGrouping.grandTotals.coolingRoomsCount} تبريد + ${refGrouping.grandTotals.freezingRoomsCount} تجميد (${refGrouping.grandTotals.totalAreaSqm?.toLocaleString('ar-EG')} م²)`, align: 'center' },
                        { content: `${refGrouping.grandTotals.designCapacityTons?.toLocaleString('ar-EG')} / ${refGrouping.grandTotals.operationalCapacityTons?.toLocaleString('ar-EG')} طن`, align: 'center', mono: true },
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

      {/* 2. الطاقة التخزينية وأرصدة الغرف */}
      {subTab === 'rooms' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              الطاقة التخزينية وأرصدة غرف التبريد والتجميد
            </h3>
            <p className="text-xs font-bold text-slate-500">
              الرصيد الحالي = الرصيد الافتتاحي + الوارد المعتمد - المنصرف المعتمد | الطاقة المتاحة = الطاقة التخزينية - الرصيد الحالي | نسبة الإشغال = (الرصيد الحالي ÷ الطاقة التخزينية) × 100
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">الثلاجة</th>
                  <th className="p-3">رقم الغرفة ونوعها</th>
                  <th className="p-3">نوع السلع المخزنة</th>
                  <th className="p-3 text-center">سعة الغرفة (طن)</th>
                  <th className="p-3 text-center">الافتتاحي</th>
                  <th className="p-3 text-center">الوارد المعتمد</th>
                  <th className="p-3 text-center">المنصرف المعتمد</th>
                  <th className="p-3 text-center bg-sky-950/80">الرصيد الحالي (طن)</th>
                  <th className="p-3 text-center">الطاقة المتاحة (طن)</th>
                  <th className="p-3 text-center">نسبة الإشغال %</th>
                  <th className="p-3 text-center">الحرارة المطلوبة</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {roomsWithMetrics.map(({ room, metrics }) => (
                  <tr key={room.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-black text-slate-900">{room.refrigeratorName}</div>
                      <div className="text-[10px] font-mono text-sky-700">{room.refrigeratorCode}</div>
                    </td>
                    <td className="p-3 font-black text-indigo-900">
                      {room.roomNumber} ({room.roomType})
                    </td>
                    <td className="p-3">{room.storedCommodityType}</td>
                    <td className="p-3 text-center">{room.roomCapacityTons} طن</td>
                    <td className="p-3 text-center">{room.openingBalanceTons} طن</td>
                    <td className="p-3 text-center text-emerald-700">+{room.approvedInboundTons} طن</td>
                    <td className="p-3 text-center text-amber-800">-{room.approvedOutboundTons} طن</td>
                    <td className="p-3 text-center font-black text-sky-900 bg-sky-50">
                      {metrics.currentBalanceTons} طن
                    </td>
                    <td className="p-3 text-center text-emerald-800">
                      {metrics.availableCapacityTons} طن
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-black ${
                          metrics.occupancyPct >= 90
                            ? 'bg-rose-100 text-rose-800'
                            : metrics.occupancyPct >= 75
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {metrics.occupancyPct}%
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono" dir="ltr">
                      {room.requiredTempCelsius}°C
                    </td>
                    <td className="p-3 text-center">{room.roomStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. دفتر استلام الوارد اليومي للثلاجات */}
      {subTab === 'receipts' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                دفتر استلام الوارد اليومي للثلاجات (22 عموداً)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                صافي الوزن = الوزن القائم - الوزن الفارغ | إجمالي القيمة = صافي الوزن × سعر الطن، مع التحقق من الطاقة المتاحة للغرفة
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddReceiptModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل إذن استلام وارد للثلاجة</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم الإذن والتاريخ</th>
                    <th className="p-3">الثلاجة والغرفة</th>
                    <th className="p-3">المورد / الجهة المودعة</th>
                    <th className="p-3">نوع السلعة والصنف</th>
                    <th className="p-3 text-center">العبوات</th>
                    <th className="p-3 text-center">القائم / الفارغ (طن)</th>
                    <th className="p-3 text-center bg-emerald-950/70">صافي الوزن (طن)</th>
                    <th className="p-3 text-center">سعر الطن والإجمالي</th>
                    <th className="p-3 text-center">حرارة الاستلام</th>
                    <th className="p-3 text-center">الصلاحية</th>
                    <th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {receipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-mono font-black text-indigo-900">
                          {r.receiptOrderNumber}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.receiptDate} | {r.receiptTime}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-black">{r.refrigeratorName}</div>
                        <div className="text-[10px] text-sky-700">{r.roomNumber}</div>
                      </td>
                      <td className="p-3">{r.depositorOrSupplierName}</td>
                      <td className="p-3">
                        <div>{r.commodityType}</div>
                        <div className="text-[10px] text-slate-500">{r.subCategory}</div>
                      </td>
                      <td className="p-3 text-center">{r.packagesCount.toLocaleString('ar-EG')}</td>
                      <td className="p-3 text-center">
                        {r.grossWeightTons} / {r.tareWeightTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50">
                        {r.netWeightTons} طن
                      </td>
                      <td className="p-3 text-center">
                        <div>{r.totalValue.toLocaleString('ar-EG')} ج.م</div>
                        <div className="text-[10px] text-slate-500">
                          ({r.unitOrTonPrice.toLocaleString('ar-EG')} ج.م/طن)
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono" dir="ltr">
                        {r.receivingTempCelsius}°C
                      </td>
                      <td className="p-3 text-center text-[11px]">
                        <div>إنتاج: {r.productionDate}</div>
                        <div className="text-rose-700">انتهاء: {r.expiryDate}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-black">
                          {r.approvalStatus}
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

      {/* 4. دفتر صرف المنصرف اليومي للثلاجات */}
      {subTab === 'issues' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                دفتر صرف المنصرف اليومي للثلاجات (16 عموداً)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                الرصيد بعد الصرف = الرصيد قبل الصرف - الكمية المنصرفة، مع منع السحب بأكثر من الرصيد المتاح بالغرفة
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddIssueModal(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل إذن صرف من الثلاجة</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم إذن الصرف</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">الثلاجة والغرفة</th>
                    <th className="p-3">الجهة المستلمة</th>
                    <th className="p-3">نوع السلعة</th>
                    <th className="p-3 text-center">الرصيد قبل الصرف</th>
                    <th className="p-3 text-center bg-amber-950/70">الوزن المنصرف (طن)</th>
                    <th className="p-3 text-center">الرصيد بعد الصرف</th>
                    <th className="p-3 text-center">إجمالي القيمة</th>
                    <th className="p-3">المسؤول عن الصرف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {issues.map((iss) => (
                    <tr key={iss.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-black text-amber-800">
                        {iss.issueOrderNumber}
                      </td>
                      <td className="p-3">{iss.issueDate}</td>
                      <td className="p-3">
                        <div className="font-black">{iss.refrigeratorName}</div>
                        <div className="text-[10px] text-sky-700">{iss.roomNumber}</div>
                      </td>
                      <td className="p-3">{iss.beneficiaryEntityName}</td>
                      <td className="p-3">{iss.commodityType}</td>
                      <td className="p-3 text-center">{iss.balanceBeforeIssueTons} طن</td>
                      <td className="p-3 text-center font-black text-amber-800 bg-amber-50">
                        {iss.netIssuedWeightTons} طن
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800">
                        {iss.balanceAfterIssueTons} طن
                      </td>
                      <td className="p-3 text-center">
                        {iss.totalIssuedValue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3">{iss.issuerName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. التقييم المالي وقيمة الثلاجات (فصل الأصول الثابتة عن المخزون) */}
      {subTab === 'valuation' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              التقييم المالي وقيمة الثلاجات (فصل الأصول الثابتة عن قيمة المخزون السلعي)
            </h3>
            <p className="text-xs font-bold text-slate-500">
              إجمالي قيمة الأصول الثابتة = مجموع (الأرض + المباني + غرف التبريد + الوحدات + المولدات + المعدات + الميزان + التجهيزات) | القيمة التقديرية الكلية = الأصول الثابتة + المخزون الحالي
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">الثلاجة</th>
                  <th className="p-3 text-center">الأرض والمباني</th>
                  <th className="p-3 text-center">غرف ووحدات التبريد</th>
                  <th className="p-3 text-center">المولدات والمعدات والميزان</th>
                  <th className="p-3 text-center bg-indigo-950/80">إجمالي الأصول الثابتة</th>
                  <th className="p-3 text-center bg-emerald-950/80">قيمة المخزون الحالي</th>
                  <th className="p-3 text-center bg-amber-950/80">إجمالي القيمة التقديرية</th>
                  <th className="p-3">لجنة التقييم والتاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {assets.map((a) => {
                  const calc = computeRefrigeratorAssetValuation(a);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-black text-slate-900">{a.refrigeratorName}</div>
                        <div className="text-[10px] font-mono text-sky-700">
                          {a.refrigeratorCode}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {(a.landValue + a.buildingsValue).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center">
                        {(
                          a.coolingRoomsValue + a.coolingUnitsCompressorsValue
                        ).toLocaleString('ar-EG')}{' '}
                        ج.م
                      </td>
                      <td className="p-3 text-center">
                        {(
                          a.generatorsValue +
                          a.equipmentAndForkliftsValue +
                          a.scaleValue +
                          a.furnitureAndFixturesValue
                        ).toLocaleString('ar-EG')}{' '}
                        ج.م
                      </td>
                      <td className="p-3 text-center font-black text-indigo-900 bg-indigo-50/70">
                        {calc.totalFixedAssetsValue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center font-black text-emerald-800 bg-emerald-50/70">
                        {calc.currentStoredInventoryValue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center font-black text-amber-900 bg-amber-50/70">
                        {calc.totalEstimatedValue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3">
                        <div>{a.evaluatorCommittee}</div>
                        <div className="text-[10px] text-slate-500">{a.valuationDate}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. جدول التشغيل ودرجات الحرارة والإنذارات */}
      {subTab === 'temp_logs' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                سجل التشغيل ودرجات الحرارة وحالة الكهرباء والمولد الاحتياطي
              </h3>
              <p className="text-xs font-bold text-slate-500">
                يطلق النظام إنذاراً فورياً عند انحراف درجة الحرارة الفعلية عن المطلوبة أو انقطاع التيار الكهربائي
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddTempModal(true)}
                className="px-4 py-2 rounded-xl bg-sky-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل قراءة حرارة وتشغيل</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">الثلاجة والغرفة</th>
                    <th className="p-3">نوع السلعة</th>
                    <th className="p-3 text-center">الحرارة المطلوبة</th>
                    <th className="p-3 text-center">الحرارة الفعلية</th>
                    <th className="p-3 text-center">وقت القياس</th>
                    <th className="p-3 text-center">وحدات التبريد</th>
                    <th className="p-3 text-center">الكهرباء والمولد</th>
                    <th className="p-3 text-center">حالة الإنذار</th>
                    <th className="p-3">الفني والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {tempLogs.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-black">{t.refrigeratorName}</div>
                        <div className="text-[10px] text-sky-700">{t.roomNumber}</div>
                      </td>
                      <td className="p-3">{t.commodityType}</td>
                      <td className="p-3 text-center font-mono" dir="ltr">
                        {t.requiredTempCelsius}°C
                      </td>
                      <td
                        className={`p-3 text-center font-mono font-black ${
                          t.alarmStatus !== 'طبيعي' ? 'text-rose-700 bg-rose-50' : 'text-emerald-700'
                        }`}
                        dir="ltr"
                      >
                        {t.actualTempCelsius}°C
                      </td>
                      <td className="p-3 text-center font-mono">{t.measurementDateTime}</td>
                      <td className="p-3 text-center">{t.coolingUnitsStatus}</td>
                      <td className="p-3 text-center">
                        <div>{t.powerStatus}</div>
                        <div className="text-[10px] text-slate-500">{t.backupGeneratorStatus}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                            t.alarmStatus === 'طبيعي'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {t.alarmStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <div>{t.technicianName}</div>
                        <div className="text-[10px] text-slate-500">{t.notes}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. صيانة الثلاجات والأعطال */}
      {subTab === 'maintenance' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              سجل صيانة الثلاجات والأعطال وتكاليف الإصلاح
            </h3>
            <p className="text-xs font-bold text-slate-500">
              إجمالي تكلفة الصيانة = تكلفة قطع الغيار + تكلفة المصنعية + المصروفات الإضافية
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">رقم أمر الصيانة</th>
                  <th className="p-3">الثلاجة والغرفة/المعدة</th>
                  <th className="p-3">نوع الصيانة والعطل</th>
                  <th className="p-3 text-center">تاريخ البلاغ والتوقف</th>
                  <th className="p-3">قطع الغيار المستخدمة</th>
                  <th className="p-3 text-center">قطع الغيار + المصنعية</th>
                  <th className="p-3 text-center">إجمالي التكلفة</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {maintenance.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black text-amber-800">{m.orderNumber}</td>
                    <td className="p-3">
                      <div className="font-black">{m.refrigeratorName}</div>
                      <div className="text-[10px] text-slate-500">{m.roomOrEquipmentNumber}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black ml-1">
                        {m.maintenanceType}
                      </span>
                      <span>{m.faultDescription}</span>
                    </td>
                    <td className="p-3 text-center">
                      <div>{m.reportDate}</div>
                      <div className="text-[10px] text-rose-700">توقف {m.downtimeHours} ساعة</div>
                    </td>
                    <td className="p-3">{m.sparePartsUsed}</td>
                    <td className="p-3 text-center">
                      {m.partsCost.toLocaleString('ar-EG')} + {m.laborCost.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-3 text-center font-black text-rose-800">
                      {m.totalMaintenanceCost.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-black">
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

      {/* 8. جدول المصروفات والمستحقات والتسعير */}
      {subTab === 'financials' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-black text-slate-900">
              جدول المصروفات والإيرادات والمستحقات ونظام التسعير للثلاجات (يومي / شهري / تعاقدي)
            </h3>
            <p className="text-xs font-bold text-slate-500">
              صافي الحركة المالية = الإيرادات - إجمالي المصروفات | المتبقي من المستحقات = إجمالي المستحقات - المدفوعات المسددة
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">رقم المستند والتاريخ</th>
                  <th className="p-3">الثلاجة</th>
                  <th className="p-3 text-center">نظام التسعير والتعريفة</th>
                  <th className="p-3 text-center">إجمالي المصروفات</th>
                  <th className="p-3 text-center">إيرادات التخزين والتشغيل</th>
                  <th className="p-3 text-center bg-emerald-950/70">صافي الحركة المالية</th>
                  <th className="p-3 text-center">المستحقات / المسدد</th>
                  <th className="p-3 text-center bg-rose-950/70">المتبقي من المستحقات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {financials.map((f) => {
                  const calc = computeRefrigeratorFinancialSummary(f);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-mono font-black">{f.documentNumber}</div>
                        <div className="text-[10px] text-slate-500">{f.date}</div>
                      </td>
                      <td className="p-3 font-black">{f.refrigeratorName}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-black">
                          {f.pricingMode}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {f.ratePerTon} ج.م/طن × {f.storedTonsBilled} طن
                        </div>
                      </td>
                      <td className="p-3 text-center text-rose-700">
                        {calc.totalExpenses.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center text-emerald-700 font-black">
                        {calc.effectiveRevenue.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center font-black text-emerald-900 bg-emerald-50">
                        {calc.netFinancialMovement.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center">
                        {f.totalReceivables.toLocaleString('ar-EG')} /{' '}
                        {f.paidAmount.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="p-3 text-center font-black text-rose-800 bg-rose-50">
                        {calc.remainingReceivables.toLocaleString('ar-EG')} ج.م
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نافذة إضافة ثلاجة جديدة */}
      {showAddRefModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">إضافة ثلاجة حفظ وتبريد جديدة</h3>
            <form onSubmit={handleCreateRefrigerator} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">كود الثلاجة</label>
                  <input
                    type="text"
                    required
                    value={newRef.refrigeratorCode}
                    onChange={(e) => setNewRef({ ...newRef, refrigeratorCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم الثلاجة</label>
                  <input
                    type="text"
                    required
                    value={newRef.refrigeratorName}
                    onChange={(e) => setNewRef({ ...newRef, refrigeratorName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم المالك</label>
                  <input
                    type="text"
                    value={newRef.ownerName}
                    onChange={(e) => setNewRef({ ...newRef, ownerName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نوع الملكية</label>
                  <select
                    value={newRef.ownershipType}
                    onChange={(e) =>
                      setNewRef({ ...newRef, ownershipType: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="حكومي">حكومي</option>
                    <option value="خاص">خاص</option>
                    <option value="مؤجر">مؤجر</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الطاقة التصميمية الكلية (طن)</label>
                  <input
                    type="number"
                    value={newRef.designCapacityTons}
                    onChange={(e) =>
                      setNewRef({ ...newRef, designCapacityTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الطاقة التشغيلية الفعلية (طن)</label>
                  <input
                    type="number"
                    value={newRef.operationalCapacityTons}
                    onChange={(e) =>
                      setNewRef({ ...newRef, operationalCapacityTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddRefModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-700 text-white font-black"
                >
                  حفظ الثلاجة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل استلام وارد للثلاجة */}
      {showAddReceiptModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل إذن استلام وارد يومي للثلاجة
            </h3>
            <form onSubmit={handleCreateRefReceipt} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم إذن الاستلام</label>
                  <input
                    type="text"
                    required
                    value={newReceipt.receiptOrderNumber}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, receiptOrderNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم المورد / الجهة المودعة</label>
                  <input
                    type="text"
                    required
                    value={newReceipt.depositorOrSupplierName}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, depositorOrSupplierName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن القائم (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newReceipt.grossWeightTons}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, grossWeightTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن الفارغ (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newReceipt.tareWeightTons}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, tareWeightTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">سعر الطن (ج.م)</label>
                  <input
                    type="number"
                    value={newReceipt.unitOrTonPrice}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, unitOrTonPrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">درجة حرارة الاستلام (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newReceipt.receivingTempCelsius}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        receivingTempCelsius: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddReceiptModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-black"
                >
                  اعتماد استلام الوارد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل صرف منصرف من الثلاجة */}
      {showAddIssueModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل إذن صرف يومي من الثلاجة
            </h3>
            <form onSubmit={handleCreateRefIssue} className="space-y-4 text-xs font-bold">
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
                  <label className="block mb-1 text-slate-700">الجهة المستلمة</label>
                  <input
                    type="text"
                    required
                    value={newIssue.beneficiaryEntityName}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, beneficiaryEntityName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن الصافي المنصرف (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newIssue.netIssuedWeightTons}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, netIssuedWeightTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">سعر الطن (ج.م)</label>
                  <input
                    type="number"
                    value={newIssue.unitOrTonPrice}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, unitOrTonPrice: Number(e.target.value) })
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
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-black"
                >
                  اعتماد إذن الصرف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل قراءة حرارة وتشغيل */}
      {showAddTempModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل قراءة درجة حرارة وحالة تشغيل الغرفة
            </h3>
            <form onSubmit={handleCreateTempLog} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">درجة الحرارة المطلوبة (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newTemp.requiredTempCelsius}
                    onChange={(e) =>
                      setNewTemp({ ...newTemp, requiredTempCelsius: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">درجة الحرارة الفعلية (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newTemp.actualTempCelsius}
                    onChange={(e) =>
                      setNewTemp({ ...newTemp, actualTempCelsius: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">حالة التيار الكهربائي</label>
                  <select
                    value={newTemp.powerStatus}
                    onChange={(e) =>
                      setNewTemp({ ...newTemp, powerStatus: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="تيار رئيسي منتظم">تيار رئيسي منتظم</option>
                    <option value="انقطاع تيار رئيسي">انقطاع تيار رئيسي</option>
                    <option value="تذبذب جهد">تذبذب جهد</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">حالة المولد الاحتياطي</label>
                  <select
                    value={newTemp.backupGeneratorStatus}
                    onChange={(e) =>
                      setNewTemp({
                        ...newTemp,
                        backupGeneratorStatus: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="جاهز احتياطي">جاهز احتياطي</option>
                    <option value="يعمل حالياً">يعمل حالياً</option>
                    <option value="عطل بالمولد">عطل بالمولد</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddTempModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-700 text-white font-black"
                >
                  حفظ القراءة وفحص الإنذار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة بطاقة السجل للقراءة فقط */}
      {profileModal && (
        <ModuleRecordProfileModal
          isOpen={profileModal.isOpen}
          title={profileModal.title}
          subtitle={profileModal.subtitle}
          entityType={profileModal.entityType}
          fields={profileModal.fields}
          onClose={() => setProfileModal(null)}
        />
      )}

      {/* نافذة تأكيد الحذف */}
      {deleteModal && (
        <ModuleDeleteConfirmModal
          isOpen={deleteModal.isOpen}
          entityTitle={deleteModal.entityTitle}
          recordSummary={deleteModal.recordSummary}
          canDelete={effectivePermissions.canDelete}
          blockReason={effectivePermissions.canDelete ? undefined : 'الحذف مقتصر على المشرف العام (Super Admin) فقط.'}
          onClose={() => setDeleteModal(null)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </div>
  );
};
