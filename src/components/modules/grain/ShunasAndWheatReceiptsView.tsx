import React, { useMemo, useState } from 'react';
import {
  Warehouse,
  FileText,
  Truck,
  Scale,
  CheckCircle2,
  XCircle,
  Printer,
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Search,
  Filter,
  Lock,
} from 'lucide-react';
import type {
  DailyWheatReceiptRecord,
  GrainMaintenanceState,
  ReceiptApprovalStatus,
  ShunaReconciliationRecord,
  ShunaRecord,
  ShunaWheatIssueRecord,
  WheatLedgerMovementRecord,
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
  computeShunaBookBalanceAndValuation,
  computeShunaReconciliationVariance,
  computeWheatReceiptNetAndValue,
} from '../../../utils/grainMaintenanceMath';
import { exportRowsToArabicCsv, printModuleReportA4 } from '../../../services/modulesStorage';

interface ShunasAndWheatReceiptsViewProps {
  state: GrainMaintenanceState;
  branchName: string;
  currentUserFullName: string;
  currentUser?: AppUser | null;
  permissions?: ModulePermissions;
  isViewer: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  villages: VillageHierarchy[];
  initialTab?: 'shunas' | 'receipts_book' | 'issues_book' | 'ledger' | 'reconciliation';
  onUpdateState: (updater: (prev: GrainMaintenanceState) => GrainMaintenanceState, summary: string) => void;
  onNotify: (type: 'ok' | 'err', text: string) => void;
}

export const ShunasAndWheatReceiptsView: React.FC<ShunasAndWheatReceiptsViewProps> = ({
  state,
  branchName,
  currentUserFullName,
  currentUser,
  permissions,
  isViewer,
  canAdd = !isViewer,
  canEdit = !isViewer,
  canPrint = !isViewer,
  canExport = !isViewer,
  villages,
  initialTab = 'shunas',
  onUpdateState,
  onNotify,
}) => {
  const effectivePermissions: ModulePermissions = useMemo(() => {
    if (permissions) return permissions;
    return resolveModuleCrudPermissions(currentUser || null, isViewer, 'grain_maintenance');
  }, [permissions, currentUser, isViewer]);

  const [activeTab, setActiveTab] = useState<
    'shunas' | 'receipts_book' | 'issues_book' | 'ledger' | 'reconciliation'
  >(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [shunaFilter, setShunaFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const shunas = state.shunas || [];
  const wheatReceipts = state.wheatReceipts || [];
  const wheatIssues = state.wheatIssues || [];
  const wheatLedgerMovements = state.wheatLedgerMovements || [];
  const shunaReconciliations = state.shunaReconciliations || [];
  const mills = state.mills || [];

  const today = new Date().toISOString().split('T')[0];

  // New Shuna modal state
  const [showAddShunaModal, setShowAddShunaModal] = useState(false);
  const [newShuna, setNewShuna] = useState({
    shunaCode: `SH-MHL-00${shunas.length + 1}`,
    shunaName: '',
    village: villages[0]?.village || 'بشبيش',
    localUnit: villages[0]?.localUnits?.[0] || 'بشبيش',
    affiliatedEntity: 'الشركة العامة للصوامع والتخزين',
    managerName: '',
    phone: '',
    totalAreaSqm: 4500,
    usedAreaSqm: 3200,
    storageCapacityTons: 5000,
    openingBalanceTons: 1000,
    tonPrice: state.settings?.defaultWheatTonPrice || 13333.33,
    assetsAndFixturesValue: 2500000,
    internalEquipmentValue: 1100000,
    scaleValue: 550000,
    handlingEquipmentValue: 750000,
    scaleStatus: 'يعمل ومعاير' as ShunaRecord['scaleStatus'],
    storageEquipmentStatus: 'ممتازة' as ShunaRecord['storageEquipmentStatus'],
    operationalStatus: 'تعمل' as ShunaRecord['operationalStatus'],
    lastMaintenanceDate: today,
    nextMaintenanceDate: today,
    evaluatorName: 'اللجنة الفنية والمالية بالمديرية',
    notes: '',
  });

  // New Daily Wheat Receipt Form State
  const [showAddReceiptModal, setShowAddReceiptModal] = useState(false);
  const [newReceipt, setNewReceipt] = useState({
    receiptOrderNumber: `WR-2026-${1005 + wheatReceipts.length}`,
    receiptDate: today,
    receiptTime: new Date().toTimeString().slice(0, 5),
    shunaCode: shunas[0]?.shunaCode || 'SH-MHL-001',
    supplierName: '',
    supplierNationalIdOrCode: '',
    wheatType: 'محلي' as 'محلي' | 'مستورد',
    agriculturalSeason: 'موسم حصاد 2026',
    vehicleNumber: '',
    driverName: '',
    scaleNumber: 'ميزان بسكول إلكتروني 1',
    grossWeightKg: 42000,
    tareWeightKg: 14000,
    moisturePct: 11.8,
    impuritiesPct: 0.8,
    cleanlinessGrade: '23.5 قيراط',
    qualityGrade: 'درجة أولى فاخرة',
    excludedWeightTons: 0,
    exclusionReason: '',
    tonPrice: state.settings?.defaultWheatTonPrice || 13333.33,
    inspectionReportNumber: `INSP-W-2026-${805 + wheatReceipts.length}`,
    shunaKeeperName: shunas[0]?.managerName || '',
    committeeMemberName: 'م/ سامي المتولي (رئيس لجنة الاستلام)',
    approvalStatus: 'معتمد' as ReceiptApprovalStatus,
    notes: '',
  });

  // New Wheat Issue to Mill Form State
  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [newIssue, setNewIssue] = useState({
    issueOrderNumber: `WI-2026-${505 + wheatIssues.length}`,
    issueDate: today,
    issueTime: new Date().toTimeString().slice(0, 5),
    shunaCode: shunas[0]?.shunaCode || 'SH-MHL-001',
    beneficiaryMillCode: mills[0]?.millCode || 'MILL-MHL-01',
    wheatType: 'محلي' as 'محلي' | 'مستورد',
    issuedWeightTons: 50,
    tonPrice: state.settings?.defaultWheatTonPrice || 13333.33,
    vehicleNumber: '',
    driverName: '',
    receiverName: '',
    adminOverrideReason: '',
    notes: '',
  });

  // New Reconciliation Form State
  const [showAddReconModal, setShowAddReconModal] = useState(false);
  const [newRecon, setNewRecon] = useState({
    reconciliationNumber: `REC-SH-2026-0${shunaReconciliations.length + 1}`,
    reconciliationDate: today,
    shunaCode: shunas[0]?.shunaCode || 'SH-MHL-001',
    physicalCountTons: 2850,
    committeeHead: 'م/ سامي المتولي',
    committeeMembers: 'لجنة الجرد والمطابقة الدورية',
    reasonOrExplanation: 'مطابقة دورية لأرصدة الشونة',
    actionTaken: 'اعتماد محضر الجرد',
    applyAsAdjustment: false,
    notes: '',
  });

  const shunasWithMetrics = useMemo(() => {
    return shunas.map((sh) => ({
      shuna: sh,
      metrics: computeShunaBookBalanceAndValuation({
        shuna: sh,
        wheatReceipts,
        wheatIssues,
        activeDateFilter: today,
      }),
    }));
  }, [shunas, wheatReceipts, wheatIssues, today]);

  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    title: string;
    entityType: string;
    subtitle?: string;
    onEdit?: () => void;
    fields: { label: string; value: React.ReactNode; mono?: boolean; badge?: boolean; badgeColor?: string; colSpan?: number }[];
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    entityType: 'shuna' | 'receipt' | 'issue' | 'reconciliation' | 'ledger';
    entityId: string;
    entityTitle: string;
    recordSummary: { label: string; value: string | number }[];
  } | null>(null);

  const [editingShuna, setEditingShuna] = useState<ShunaRecord | null>(null);
  const [editingSubRecord, setEditingSubRecord] = useState<{
    type: 'receipt' | 'issue' | 'reconciliation';
    title: string;
    data: Record<string, any>;
  } | null>(null);

  // Add/Edit Wheat Stock Movement Ledger modal state (متاح الإضافة والتعديل والحذف في أي وقت)
  const [ledgerModal, setLedgerModal] = useState<{
    mode: 'add' | 'edit';
    id?: string;
    movementCode: string;
    movementDate: string;
    movementTime: string;
    shunaCode: string;
    movementType: WheatLedgerMovementRecord['movementType'];
    referenceDocNumber: string;
    balanceBeforeTons: number;
    quantityTons: number;
    tonPrice: number;
    approvalStatus: ReceiptApprovalStatus;
    performedBy: string;
    notes: string;
  } | null>(null);

  const openAddLedgerModal = () => {
    const defaultShuna = shunas[0];
    setLedgerModal({
      mode: 'add',
      movementCode: `MOV-W-${100 + wheatLedgerMovements.length + 1}`,
      movementDate: today,
      movementTime: new Date().toTimeString().slice(0, 5),
      shunaCode: defaultShuna?.shunaCode || 'SH-MHL-001',
      movementType: 'وارد قمح معتمد',
      referenceDocNumber: `DOC-${Date.now().toString().slice(-4)}`,
      balanceBeforeTons: 0,
      quantityTons: 0,
      tonPrice: state.settings?.defaultWheatTonPrice || 13333.33,
      approvalStatus: 'معتمد',
      performedBy: currentUserFullName,
      notes: '',
    });
  };

  const openEditLedgerModal = (m: WheatLedgerMovementRecord) => {
    setLedgerModal({
      mode: 'edit',
      id: m.id,
      movementCode: m.movementCode,
      movementDate: m.movementDate,
      movementTime: m.movementTime,
      shunaCode: m.shunaCode,
      movementType: m.movementType,
      referenceDocNumber: m.referenceDocNumber,
      balanceBeforeTons: Number(m.balanceBeforeTons) || 0,
      quantityTons: Number(m.quantityTons) || 0,
      tonPrice: Number(m.tonPrice) || 13333.33,
      approvalStatus: m.approvalStatus || 'معتمد',
      performedBy: m.performedBy || currentUserFullName,
      notes: m.notes || '',
    });
  };

  const handleSaveLedgerModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerModal) return;
    const targetShuna = shunas.find((s) => s.shunaCode === ledgerModal.shunaCode);
    const shunaName = targetShuna?.shunaName || ledgerModal.shunaCode;
    const balanceBefore = Number(ledgerModal.balanceBeforeTons) || 0;
    const qty = Number(ledgerModal.quantityTons) || 0;
    const balanceAfter = Number((balanceBefore + qty).toFixed(3));
    const tonPrice = Number(ledgerModal.tonPrice) || 0;
    const totalValue = Math.round(Math.abs(qty) * tonPrice);

    if (ledgerModal.mode === 'add') {
      const created: WheatLedgerMovementRecord = {
        id: `wlm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        movementCode: ledgerModal.movementCode.trim() || `MOV-W-${Date.now()}`,
        movementDate: ledgerModal.movementDate || today,
        movementTime: ledgerModal.movementTime || '09:00',
        shunaCode: ledgerModal.shunaCode,
        shunaName,
        movementType: ledgerModal.movementType,
        referenceDocNumber: ledgerModal.referenceDocNumber.trim() || '—',
        balanceBeforeTons: balanceBefore,
        quantityTons: qty,
        balanceAfterTons: balanceAfter,
        tonPrice,
        totalValue,
        approvalStatus: ledgerModal.approvalStatus,
        performedBy: ledgerModal.performedBy.trim() || currentUserFullName,
        notes: ledgerModal.notes.trim(),
      };
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatLedgerMovements: [created, ...(prev.wheatLedgerMovements || [])],
        }),
        `إضافة حركة قمح بدفتر الأرصدة: ${created.movementCode}`
      );
      onNotify('ok', `تمت إضافة الحركة «${created.movementCode}» إلى دفتر حركة أرصدة القمح بنجاح.`);
    } else if (ledgerModal.id) {
      const targetId = ledgerModal.id;
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatLedgerMovements: (prev.wheatLedgerMovements || []).map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  movementCode: ledgerModal.movementCode.trim() || item.movementCode,
                  movementDate: ledgerModal.movementDate || item.movementDate,
                  movementTime: ledgerModal.movementTime || item.movementTime,
                  shunaCode: ledgerModal.shunaCode,
                  shunaName,
                  movementType: ledgerModal.movementType,
                  referenceDocNumber: ledgerModal.referenceDocNumber.trim() || '—',
                  balanceBeforeTons: balanceBefore,
                  quantityTons: qty,
                  balanceAfterTons: balanceAfter,
                  tonPrice,
                  totalValue,
                  approvalStatus: ledgerModal.approvalStatus,
                  performedBy: ledgerModal.performedBy.trim() || currentUserFullName,
                  notes: ledgerModal.notes.trim(),
                }
              : item
          ),
        }),
        `تعديل حركة قمح بدفتر الأرصدة: ${ledgerModal.movementCode}`
      );
      onNotify('ok', `تم تعديل الحركة «${ledgerModal.movementCode}» وحفظها بنجاح.`);
    }
    setLedgerModal(null);
  };

  const handleSaveSubRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubRecord) return;
    const { type, data } = editingSubRecord;
    const nowIso = new Date().toISOString();
    if (type === 'receipt') {
      const calc = computeWheatReceiptNetAndValue({
        grossWeightKg: Number(data.grossWeightKg) || 0,
        tareWeightKg: Number(data.tareWeightKg) || 0,
        excludedWeightTons: Number(data.excludedWeightTons) || 0,
        tonPrice: Number(data.tonPrice) || 13333.33,
      });
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatReceipts: (prev.wheatReceipts || []).map((r) =>
            r.id === data.id
              ? {
                  ...r,
                  ...data,
                  grossWeightKg: Number(data.grossWeightKg) || 0,
                  tareWeightKg: Number(data.tareWeightKg) || 0,
                  excludedWeightTons: Number(data.excludedWeightTons) || 0,
                  tonPrice: Number(data.tonPrice) || r.tonPrice,
                  netWeightKg: calc.netWeightKg,
                  netWeightTons: calc.netWeightTons,
                  acceptedNetWeightTons: calc.acceptedNetWeightTons,
                  totalSupplyValue: calc.totalSupplyValue,
                  updatedAt: nowIso,
                }
              : r
          ),
        }),
        `تعديل إذن استلام قمح: ${data.receiptOrderNumber}`
      );
      onNotify('ok', `تم تعديل إذن الاستلام «${data.receiptOrderNumber}» وحفظه بنجاح.`);
    } else if (type === 'issue') {
      const issued = Number(data.issuedWeightTons) || 0;
      const price = Number(data.tonPrice) || 13333.33;
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatIssues: (prev.wheatIssues || []).map((iss) =>
            iss.id === data.id
              ? {
                  ...iss,
                  ...data,
                  issuedWeightTons: issued,
                  totalIssuedValue: Math.round(issued * price),
                  updatedAt: nowIso,
                }
              : iss
          ),
        }),
        `تعديل إذن صرف قمح: ${data.issueOrderNumber}`
      );
      onNotify('ok', `تم تعديل إذن الصرف «${data.issueOrderNumber}» وحفظه بنجاح.`);
    } else if (type === 'reconciliation') {
      const phys = Number(data.physicalCountTons) || 0;
      const book = Number(data.bookBalanceTons) || 0;
      const variance = Number((phys - book).toFixed(3));
      const status = variance === 0 ? 'مطابق' : variance < 0 ? 'عجز' : 'زيادة';
      onUpdateState(
        (prev) => ({
          ...prev,
          shunaReconciliations: (prev.shunaReconciliations || []).map((rec) =>
            rec.id === data.id
              ? {
                  ...rec,
                  ...data,
                  physicalCountTons: phys,
                  varianceTons: variance,
                  reconciliationStatus: status,
                  updatedAt: nowIso,
                }
              : rec
          ),
        }),
        `تعديل محضر مطابقة جرد: ${data.reconciliationNumber}`
      );
      onNotify('ok', `تم تعديل محضر المطابقة «${data.reconciliationNumber}» وحفظه بنجاح.`);
    }
    setEditingSubRecord(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteModal) return;
    const { entityType, entityId, entityTitle } = deleteModal;
    if (entityType === 'shuna') {
      onUpdateState(
        (prev) => ({
          ...prev,
          shunas: (prev.shunas || []).filter((s) => s.id !== entityId && s.shunaCode !== entityId),
        }),
        `حذف شونة: ${entityTitle}`
      );
      onNotify('ok', `تم حذف الشونة «${entityTitle}» بنجاح.`);
    } else if (entityType === 'receipt') {
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatReceipts: (prev.wheatReceipts || []).filter((r) => r.id !== entityId && r.receiptOrderNumber !== entityId),
        }),
        `حذف إذن استلام قمح: ${entityTitle}`
      );
      onNotify('ok', `تم حذف إذن الاستلام «${entityTitle}» بنجاح.`);
    } else if (entityType === 'issue') {
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatIssues: (prev.wheatIssues || []).filter((i) => i.id !== entityId),
        }),
        `حذف إذن صرف قمح: ${entityTitle}`
      );
      onNotify('ok', `تم حذف إذن الصرف «${entityTitle}» بنجاح.`);
    } else if (entityType === 'reconciliation') {
      onUpdateState(
        (prev) => ({
          ...prev,
          shunaReconciliations: (prev.shunaReconciliations || []).filter((rec) => rec.id !== entityId),
        }),
        `حذف محضر مطابقة جرد: ${entityTitle}`
      );
      onNotify('ok', `تم حذف محضر المطابقة «${entityTitle}» بنجاح.`);
    } else if (entityType === 'ledger') {
      onUpdateState(
        (prev) => ({
          ...prev,
          wheatLedgerMovements: (prev.wheatLedgerMovements || []).filter((m) => m.id !== entityId),
        }),
        `حذف حركة من دفتر أرصدة القمح: ${entityTitle}`
      );
      onNotify('ok', `تم حذف الحركة «${entityTitle}» من دفتر أرصدة القمح بالشون بنجاح.`);
    }
    setDeleteModal(null);
  };

  const handleSaveEditShuna = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShuna) return;
    onUpdateState(
      (prev) => ({
        ...prev,
        shunas: (prev.shunas || []).map((s) => (s.id === editingShuna.id ? { ...editingShuna, updatedAt: new Date().toISOString() } : s)),
      }),
      `تعديل بيانات الشونة: ${editingShuna.shunaName}`
    );
    setEditingShuna(null);
    onNotify('ok', `تم تعديل بيانات الشونة «${editingShuna.shunaName}» وحفظها بنجاح.`);
  };

  const shunaGroupsResult = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: shunasWithMetrics,
      getLocalUnit: (x) => x.shuna.localUnit || x.shuna.village,
      numericFields: [
        { key: 'totalAreaSqm', getValue: (x) => x.shuna.totalAreaSqm },
        { key: 'remainingAreaSqm', getValue: (x) => x.metrics.remainingAreaSqm },
        { key: 'storageCapacityTons', getValue: (x) => x.shuna.storageCapacityTons },
        { key: 'openingBalanceTons', getValue: (x) => x.metrics.openingBalanceTons },
        { key: 'approvedInboundTons', getValue: (x) => x.metrics.approvedInboundTons },
        { key: 'approvedOutboundTons', getValue: (x) => x.metrics.approvedOutboundTons },
        { key: 'currentBookBalanceTons', getValue: (x) => x.metrics.currentBookBalanceTons },
        { key: 'stockValuationAmount', getValue: (x) => x.metrics.stockValuationAmount },
        { key: 'fixedAssetsValuationAmount', getValue: (x) => x.metrics.fixedAssetsValuationAmount },
        { key: 'totalEstimatedShunaValue', getValue: (x) => x.metrics.totalEstimatedShunaValue },
      ],
    });
  }, [shunasWithMetrics]);

  const liveReceiptCalc = useMemo(
    () =>
      computeWheatReceiptNetAndValue({
        grossWeightKg: newReceipt.grossWeightKg,
        tareWeightKg: newReceipt.tareWeightKg,
        excludedWeightTons: newReceipt.excludedWeightTons,
        tonPrice: newReceipt.tonPrice,
      }),
    [newReceipt.grossWeightKg, newReceipt.tareWeightKg, newReceipt.excludedWeightTons, newReceipt.tonPrice]
  );

  const filteredReceipts = useMemo(() => {
    return wheatReceipts.filter((r) => {
      if (shunaFilter !== 'ALL' && r.shunaCode !== shunaFilter) return false;
      if (statusFilter !== 'ALL' && r.approvalStatus !== statusFilter) return false;
      if (dateFrom && r.receiptDate < dateFrom) return false;
      if (dateTo && r.receiptDate > dateTo) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hit =
          r.receiptOrderNumber.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          r.shunaName.toLowerCase().includes(q) ||
          r.vehicleNumber.toLowerCase().includes(q) ||
          r.driverName.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [wheatReceipts, shunaFilter, statusFilter, dateFrom, dateTo, searchTerm]);

  const handleCreateShuna = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShuna.shunaName.trim()) {
      onNotify('err', 'يرجى إدخال اسم الشونة وموقعها.');
      return;
    }
    if (shunas.some((s) => s.shunaCode === newShuna.shunaCode.trim())) {
      onNotify('err', 'كود الشونة مستخدم بالفعل، يرجى اختيار كود فريد.');
      return;
    }
    const record: ShunaRecord = {
      id: `shuna-${Date.now()}`,
      serialNo: shunas.length + 1,
      shunaCode: newShuna.shunaCode.trim(),
      shunaName: newShuna.shunaName.trim(),
      village: newShuna.village,
      localUnit: newShuna.localUnit,
      affiliatedEntity: newShuna.affiliatedEntity,
      managerName: newShuna.managerName || 'غير محدد',
      phone: newShuna.phone,
      totalAreaSqm: Number(newShuna.totalAreaSqm) || 0,
      usedAreaSqm: Number(newShuna.usedAreaSqm) || 0,
      storageCapacityTons: Number(newShuna.storageCapacityTons) || 0,
      openingBalanceTons: Number(newShuna.openingBalanceTons) || 0,
      netTransfersInTons: 0,
      netTransfersOutTons: 0,
      approvedAdjustmentTons: 0,
      tonPrice: Number(newShuna.tonPrice) || 13333.33,
      assetsAndFixturesValue: Number(newShuna.assetsAndFixturesValue) || 0,
      internalEquipmentValue: Number(newShuna.internalEquipmentValue) || 0,
      scaleValue: Number(newShuna.scaleValue) || 0,
      handlingEquipmentValue: Number(newShuna.handlingEquipmentValue) || 0,
      scaleStatus: newShuna.scaleStatus,
      storageEquipmentStatus: newShuna.storageEquipmentStatus,
      operationalStatus: newShuna.operationalStatus,
      lastMaintenanceDate: newShuna.lastMaintenanceDate,
      nextMaintenanceDate: newShuna.nextMaintenanceDate,
      valuationDate: today,
      evaluatorName: newShuna.evaluatorName,
      notes: newShuna.notes,
      updatedAt: new Date().toISOString(),
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        shunas: [...(prev.shunas || []), record],
      }),
      `إضافة شونة جديدة: ${record.shunaName} (${record.shunaCode})`
    );
    setShowAddShunaModal(false);
    onNotify('ok', `تم تسجيل الشونة «${record.shunaName}» وربطها بدفتر استلام القمح اليومي.`);
  };

  const handleCreateWheatReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReceipt.supplierName.trim()) {
      onNotify('err', 'يرجى إدخال اسم المورد أو المزارع أو الجهة الموردة.');
      return;
    }
    if (!liveReceiptCalc.isValidWeight) {
      onNotify(
        'err',
        'خطأ في الأوزان: يجب أن يكون الوزن القائم أكبر من الوزن الفارغ وكلاهما قيم موجبة.'
      );
      return;
    }
    if (
      wheatReceipts.some(
        (r) => r.receiptOrderNumber.trim() === newReceipt.receiptOrderNumber.trim()
      )
    ) {
      onNotify('err', 'رقم إذن الاستلام مسجل مسبقاً! يمنع النظام تكرار رقم إذن الاستلام.');
      return;
    }

    const targetShuna = shunas.find((s) => s.shunaCode === newReceipt.shunaCode);
    if (!targetShuna) {
      onNotify('err', 'يرجى اختيار شونة صحيحة.');
      return;
    }

    const currentMetrics = computeShunaBookBalanceAndValuation({
      shuna: targetShuna,
      wheatReceipts,
      wheatIssues,
    });

    const record: DailyWheatReceiptRecord = {
      id: `wr-${Date.now()}`,
      serialNo: wheatReceipts.length + 1,
      receiptOrderNumber: newReceipt.receiptOrderNumber.trim(),
      receiptDate: newReceipt.receiptDate,
      receiptTime: newReceipt.receiptTime,
      shunaCode: targetShuna.shunaCode,
      shunaName: targetShuna.shunaName,
      supplierName: newReceipt.supplierName.trim(),
      supplierNationalIdOrCode: newReceipt.supplierNationalIdOrCode.trim() || '-',
      wheatType: newReceipt.wheatType,
      agriculturalSeason: newReceipt.agriculturalSeason,
      vehicleNumber: newReceipt.vehicleNumber.trim() || '-',
      driverName: newReceipt.driverName.trim() || '-',
      scaleNumber: newReceipt.scaleNumber,
      grossWeightKg: Number(newReceipt.grossWeightKg),
      tareWeightKg: Number(newReceipt.tareWeightKg),
      netWeightKg: liveReceiptCalc.netWeightKg,
      netWeightTons: liveReceiptCalc.netWeightTons,
      moisturePct: Number(newReceipt.moisturePct) || 0,
      impuritiesPct: Number(newReceipt.impuritiesPct) || 0,
      cleanlinessGrade: newReceipt.cleanlinessGrade,
      qualityGrade: newReceipt.qualityGrade,
      excludedWeightTons: liveReceiptCalc.excludedWeightTons,
      deductionsLog:
        liveReceiptCalc.excludedWeightTons > 0
          ? [
              {
                id: `ded-${Date.now()}`,
                reasonType: 'شوائب وغربلة',
                excludedWeightTons: liveReceiptCalc.excludedWeightTons,
                decisionOrReportRef: newReceipt.inspectionReportNumber,
                approvedBy: newReceipt.committeeMemberName,
                notes: newReceipt.exclusionReason || 'خصم معتمد بمحضر الفرز',
              },
            ]
          : [],
      acceptedNetWeightTons: liveReceiptCalc.acceptedNetWeightTons,
      tonPrice: Number(newReceipt.tonPrice),
      totalSupplyValue: liveReceiptCalc.totalSupplyValue,
      inspectionReportNumber: newReceipt.inspectionReportNumber,
      shunaKeeperName: newReceipt.shunaKeeperName || targetShuna.managerName,
      committeeMemberName: newReceipt.committeeMemberName,
      approvalStatus: newReceipt.approvalStatus,
      createdBy: currentUserFullName,
      approvedBy:
        newReceipt.approvalStatus === 'معتمد' ? currentUserFullName : undefined,
      approvedAt:
        newReceipt.approvalStatus === 'معتمد'
          ? new Date().toISOString().slice(0, 16).replace('T', ' ')
          : undefined,
      notes: newReceipt.notes,
      updatedAt: new Date().toISOString(),
    };

    const ledgerEntry: WheatLedgerMovementRecord | null =
      record.approvalStatus === 'معتمد'
        ? {
            id: `wlm-${Date.now()}`,
            movementCode: `MOV-W-${100 + wheatLedgerMovements.length + 1}`,
            movementDate: record.receiptDate,
            movementTime: record.receiptTime,
            shunaCode: record.shunaCode,
            shunaName: record.shunaName,
            movementType: 'وارد قمح معتمد',
            referenceDocNumber: record.receiptOrderNumber,
            balanceBeforeTons: currentMetrics.currentBookBalanceTons,
            quantityTons: record.acceptedNetWeightTons,
            balanceAfterTons:
              currentMetrics.currentBookBalanceTons + record.acceptedNetWeightTons,
            tonPrice: record.tonPrice,
            totalValue: record.totalSupplyValue,
            approvalStatus: 'معتمد',
            performedBy: currentUserFullName,
            notes: `إضافة تلقائية من إذن استلام قمح رقم ${record.receiptOrderNumber} (${record.supplierName})`,
          }
        : null;

    onUpdateState(
      (prev) => ({
        ...prev,
        wheatReceipts: [record, ...(prev.wheatReceipts || [])],
        wheatLedgerMovements: ledgerEntry
          ? [ledgerEntry, ...(prev.wheatLedgerMovements || [])]
          : prev.wheatLedgerMovements,
      }),
      `تسجيل إذن استلام قمح رقم ${record.receiptOrderNumber} بكمية مقبولة ${record.acceptedNetWeightTons} طن (${record.approvalStatus})`
    );
    setShowAddReceiptModal(false);
    onNotify(
      'ok',
      record.approvalStatus === 'معتمد'
        ? `تم اعتماد إذن الاستلام ${record.receiptOrderNumber} وإضافة ${record.acceptedNetWeightTons} طن فوراً لرصيد «${record.shunaName}».`
        : `تم حفظ إذن الاستلام ${record.receiptOrderNumber} بحالة «${record.approvalStatus}» (لن يؤثر في رصيد الشونة إلا بعد الاعتماد).`
    );
  };

  const handleApproveOrReverseReceipt = (
    receipt: DailyWheatReceiptRecord,
    nextStatus: ReceiptApprovalStatus
  ) => {
    if (isViewer) return;
    const targetShuna = shunas.find((s) => s.shunaCode === receipt.shunaCode);
    const currentMetrics = targetShuna
      ? computeShunaBookBalanceAndValuation({
          shuna: targetShuna,
          wheatReceipts,
          wheatIssues,
        })
      : null;

    const updatedReceipts = wheatReceipts.map((r) =>
      r.id === receipt.id
        ? {
            ...r,
            approvalStatus: nextStatus,
            approvedBy: nextStatus === 'معتمد' ? currentUserFullName : r.approvedBy,
            approvedAt:
              nextStatus === 'معتمد'
                ? new Date().toISOString().slice(0, 16).replace('T', ' ')
                : r.approvedAt,
            rejectionOrCancellationReason:
              nextStatus === 'ملغي' || nextStatus === 'مرفوض'
                ? `تم تحديث الحالة إلى ${nextStatus} بواسطة ${currentUserFullName}`
                : r.rejectionOrCancellationReason,
          }
        : r
    );

    let newMovements = [...wheatLedgerMovements];
    if (receipt.approvalStatus !== 'معتمد' && nextStatus === 'معتمد' && currentMetrics) {
      newMovements = [
        {
          id: `wlm-${Date.now()}`,
          movementCode: `MOV-W-${100 + newMovements.length + 1}`,
          movementDate: today,
          movementTime: new Date().toTimeString().slice(0, 5),
          shunaCode: receipt.shunaCode,
          shunaName: receipt.shunaName,
          movementType: 'وارد قمح معتمد',
          referenceDocNumber: receipt.receiptOrderNumber,
          balanceBeforeTons: currentMetrics.currentBookBalanceTons,
          quantityTons: receipt.acceptedNetWeightTons,
          balanceAfterTons:
            currentMetrics.currentBookBalanceTons + receipt.acceptedNetWeightTons,
          tonPrice: receipt.tonPrice,
          totalValue: receipt.totalSupplyValue,
          approvalStatus: 'معتمد',
          performedBy: currentUserFullName,
          notes: `اعتماد إذن استلام قمح رقم ${receipt.receiptOrderNumber}`,
        },
        ...newMovements,
      ];
    } else if (receipt.approvalStatus === 'معتمد' && nextStatus === 'ملغي' && currentMetrics) {
      newMovements = [
        {
          id: `wlm-${Date.now()}`,
          movementCode: `MOV-REV-${100 + newMovements.length + 1}`,
          movementDate: today,
          movementTime: new Date().toTimeString().slice(0, 5),
          shunaCode: receipt.shunaCode,
          shunaName: receipt.shunaName,
          movementType: 'عكس قيد',
          referenceDocNumber: receipt.receiptOrderNumber,
          balanceBeforeTons: currentMetrics.currentBookBalanceTons,
          quantityTons: -receipt.acceptedNetWeightTons,
          balanceAfterTons:
            currentMetrics.currentBookBalanceTons - receipt.acceptedNetWeightTons,
          tonPrice: receipt.tonPrice,
          totalValue: receipt.totalSupplyValue,
          approvalStatus: 'معتمد',
          performedBy: currentUserFullName,
          notes: `عكس قيد وإلغاء إذن استلام معتمد رقم ${receipt.receiptOrderNumber} مع الاحتفاظ بالسجل المرجعي`,
        },
        ...newMovements,
      ];
    }

    onUpdateState(
      (prev) => ({
        ...prev,
        wheatReceipts: updatedReceipts,
        wheatLedgerMovements: newMovements,
      }),
      `تحديث حالة إذن استلام القمح ${receipt.receiptOrderNumber} إلى «${nextStatus}»`
    );
    onNotify(
      'ok',
      `تم تحديث حالة الإذن ${receipt.receiptOrderNumber} إلى «${nextStatus}» وتحديث رصيد الشونة تلقائياً.`
    );
  };

  const handleCreateWheatIssue = (e: React.FormEvent) => {
    e.preventDefault();
    const targetShuna = shunas.find((s) => s.shunaCode === newIssue.shunaCode);
    const targetMill = mills.find((m) => m.millCode === newIssue.beneficiaryMillCode);
    if (!targetShuna || !targetMill) {
      onNotify('err', 'يرجى اختيار الشونة والمطحن المستفيد.');
      return;
    }
    const issuedTons = Number(newIssue.issuedWeightTons) || 0;
    if (issuedTons <= 0) {
      onNotify('err', 'يجب أن تكون الكمية المنصرفة أكبر من صفر.');
      return;
    }

    const currentMetrics = computeShunaBookBalanceAndValuation({
      shuna: targetShuna,
      wheatReceipts,
      wheatIssues,
    });

    if (
      issuedTons > currentMetrics.currentBookBalanceTons &&
      !newIssue.adminOverrideReason.trim()
    ) {
      onNotify(
        'err',
        `رفض الصرف: الكمية المطلوبة (${issuedTons} طن) تتجاوز الرصيد المتاح بالشونة (${currentMetrics.currentBookBalanceTons} طن). يلزم إدخال سبب التجاوز الإداري المعتمد.`
      );
      return;
    }

    const balanceBefore = currentMetrics.currentBookBalanceTons;
    const balanceAfter = Number((balanceBefore - issuedTons).toFixed(3));
    const totalVal = Number((issuedTons * (Number(newIssue.tonPrice) || 0)).toFixed(2));

    const issueRecord: ShunaWheatIssueRecord = {
      id: `wi-${Date.now()}`,
      serialNo: wheatIssues.length + 1,
      issueOrderNumber: newIssue.issueOrderNumber.trim(),
      issueDate: newIssue.issueDate,
      issueTime: newIssue.issueTime,
      shunaCode: targetShuna.shunaCode,
      shunaName: targetShuna.shunaName,
      beneficiaryMillCode: targetMill.millCode,
      beneficiaryMillName: targetMill.millName,
      wheatType: newIssue.wheatType,
      balanceBeforeIssueTons: balanceBefore,
      issuedWeightTons: issuedTons,
      balanceAfterIssueTons: balanceAfter,
      tonPrice: Number(newIssue.tonPrice) || 13333.33,
      totalIssuedValue: totalVal,
      vehicleNumber: newIssue.vehicleNumber || '-',
      driverName: newIssue.driverName || '-',
      receiverName: newIssue.receiverName || targetMill.managerName,
      approvalStatus: 'معتمد',
      adminOverrideReason: newIssue.adminOverrideReason.trim() || undefined,
      createdBy: currentUserFullName,
      approvedBy: currentUserFullName,
      notes: newIssue.notes,
    };

    const ledgerEntry: WheatLedgerMovementRecord = {
      id: `wlm-iss-${Date.now()}`,
      movementCode: `MOV-W-${100 + wheatLedgerMovements.length + 1}`,
      movementDate: issueRecord.issueDate,
      movementTime: issueRecord.issueTime,
      shunaCode: issueRecord.shunaCode,
      shunaName: issueRecord.shunaName,
      movementType: 'صرف قمح لمطحن',
      referenceDocNumber: issueRecord.issueOrderNumber,
      balanceBeforeTons: balanceBefore,
      quantityTons: -issuedTons,
      balanceAfterTons: balanceAfter,
      tonPrice: issueRecord.tonPrice,
      totalValue: totalVal,
      approvalStatus: 'معتمد',
      performedBy: currentUserFullName,
      notes: `صرف قمح إلى ${targetMill.millName} بموجب إذن ${issueRecord.issueOrderNumber}`,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        wheatIssues: [issueRecord, ...(prev.wheatIssues || [])],
        wheatLedgerMovements: [ledgerEntry, ...(prev.wheatLedgerMovements || [])],
      }),
      `صرف ${issuedTons} طن قمح من ${targetShuna.shunaName} إلى ${targetMill.millName}`
    );
    setShowAddIssueModal(false);
    onNotify(
      'ok',
      `تم اعتماد إذن الصرف ${issueRecord.issueOrderNumber} وخصم ${issuedTons} طن من رصيد الشونة تلقائياً.`
    );
  };

  const handleCreateReconciliation = (e: React.FormEvent) => {
    e.preventDefault();
    const targetShuna = shunas.find((s) => s.shunaCode === newRecon.shunaCode);
    if (!targetShuna) return;
    const metrics = computeShunaBookBalanceAndValuation({
      shuna: targetShuna,
      wheatReceipts,
      wheatIssues,
    });
    const physical = Number(newRecon.physicalCountTons) || 0;
    const { varianceTons, reconciliationStatus } = computeShunaReconciliationVariance(
      metrics.currentBookBalanceTons,
      physical
    );

    const rec: ShunaReconciliationRecord = {
      id: `rec-${Date.now()}`,
      reconciliationNumber: newRecon.reconciliationNumber,
      reconciliationDate: newRecon.reconciliationDate,
      shunaCode: targetShuna.shunaCode,
      shunaName: targetShuna.shunaName,
      bookBalanceTons: metrics.currentBookBalanceTons,
      physicalCountTons: physical,
      varianceTons,
      reconciliationStatus,
      committeeHead: newRecon.committeeHead,
      committeeMembers: newRecon.committeeMembers,
      reasonOrExplanation: newRecon.reasonOrExplanation,
      actionTaken: newRecon.actionTaken,
      appliedAsApprovedAdjustment: newRecon.applyAsAdjustment,
      notes: newRecon.notes,
    };

    onUpdateState(
      (prev) => ({
        ...prev,
        shunaReconciliations: [rec, ...(prev.shunaReconciliations || [])],
        shunas: newRecon.applyAsAdjustment
          ? (prev.shunas || []).map((s) =>
              s.shunaCode === targetShuna.shunaCode
                ? {
                    ...s,
                    approvedAdjustmentTons: Number(
                      ((s.approvedAdjustmentTons || 0) + varianceTons).toFixed(3)
                    ),
                  }
                : s
            )
          : prev.shunas,
      }),
      `تسجيل محضر مطابقة جرد شونة ${targetShuna.shunaName} (${reconciliationStatus}: ${varianceTons} طن)`
    );
    setShowAddReconModal(false);
    onNotify(
      'ok',
      `تم حفظ محضر مطابقة الجرد رقم ${rec.reconciliationNumber} بفرق (${varianceTons} طن - ${reconciliationStatus}).`
    );
  };

  const handlePrintOfficialReceiptVoucher = (r: DailyWheatReceiptRecord) => {
    printModuleReportA4({
      title: `إذن استلام قمح رسمي رقم (${r.receiptOrderNumber})`,
      subtitle: `دفتر استلام القمح اليومي - ${r.shunaName} (${r.shunaCode}) - الحالة: ${r.approvalStatus}`,
      branchName,
      headers: [
        'البيان',
        'القيمة المعتمدة',
        'البيان الفني والمالي',
        'القيمة المعتمدة',
      ],
      rows: [
        ['رقم إذن الاستلام', r.receiptOrderNumber, 'التاريخ والوقت', `${r.receiptDate} - ${r.receiptTime}`],
        ['اسم الشونة وكودها', `${r.shunaName} (${r.shunaCode})`, 'نوع القمح والموسم', `${r.wheatType} - ${r.agriculturalSeason}`],
        ['اسم المورد / الجهة', r.supplierName, 'الرقم القومي / الكود', r.supplierNationalIdOrCode],
        ['رقم السيارة والسائق', `${r.vehicleNumber} - ${r.driverName}`, 'رقم الميزان', r.scaleNumber],
        ['الوزن القائم (كجم)', r.grossWeightKg.toLocaleString('ar-EG'), 'الوزن الفارغ (كجم)', r.tareWeightKg.toLocaleString('ar-EG')],
        ['صافي الوزن (كجم)', r.netWeightKg.toLocaleString('ar-EG'), 'صافي الوزن (طن)', `${r.netWeightTons} طن`],
        ['نسبة الرطوبة / الشوائب', `${r.moisturePct}% رطوبة | ${r.impuritiesPct}% شوائب`, 'درجة النظافة والفرز', `${r.cleanlinessGrade} (${r.qualityGrade})`],
        ['الوزن المستبعد المعتمد (طن)', `${r.excludedWeightTons} طن`, 'الوزن الصافي المقبول (طن)', `${r.acceptedNetWeightTons} طن`],
        ['سعر الطن (ج.م)', `${r.tonPrice.toLocaleString('ar-EG')} ج.م`, 'إجمالي قيمة التوريد (ج.م)', `${r.totalSupplyValue.toLocaleString('ar-EG')} ج.م`],
        ['رقم محضر الفحص والفرز', r.inspectionReportNumber, 'أمين الشونة / عضو اللجنة', `${r.shunaKeeperName} | ${r.committeeMemberName}`],
      ],
      summaryItems: [
        { label: 'صافي الوزن المقبول', value: `${r.acceptedNetWeightTons} طن` },
        { label: 'درجة النظافة', value: r.cleanlinessGrade },
        { label: 'إجمالي قيمة التوريد', value: `${r.totalSupplyValue.toLocaleString('ar-EG')} ج.م` },
        { label: 'حالة الاعتماد', value: r.approvalStatus },
      ],
      preparedBy: currentUserFullName,
    });
  };

  return (
    <div className="space-y-5" dir="rtl" data-testid="grain-shunas-receipts-view">
      {/* شريط التنقل الداخلي لقسم الشون ودفتر استلام القمح اليومي */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'shunas', label: '1. قاعدة بيانات الشون وتقييم الأصول والأرصدة', icon: <Warehouse className="w-4 h-4" /> },
            { id: 'receipts_book', label: '2. دفتر استلام القمح اليومي (المصدر الوحيد للوارد)', icon: <FileText className="w-4 h-4" /> },
            { id: 'issues_book', label: '3. دفتر صرف القمح للمطاحن', icon: <Truck className="w-4 h-4" /> },
            { id: 'ledger', label: '4. دفتر حركة أرصدة القمح بالشون', icon: <Scale className="w-4 h-4" /> },
            { id: 'reconciliation', label: '5. مطابقة الجرد الفعلي والتسويات', icon: <ShieldCheck className="w-4 h-4" /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              data-testid={`shuna-subtab-${t.id}`}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                activeTab === t.id
                  ? 'bg-[#0f2342] text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>رصيد الشونة محمي ومربوط تلقائياً بالحركات المعتمدة فقط</span>
        </div>
      </div>

      {/* 1. قاعدة بيانات الشون وتقييم الأصول والمخزون */}
      {activeTab === 'shunas' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-base font-black text-slate-900">
                قاعدة بيانات الشون وتقييم الأصول والأرصدة الدفترية المعتمدة
              </h3>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                الرصيد الحالي للشونة = الرصيد الافتتاحي المعتمد + إجمالي الوارد المعتمد من دفتر الاستلام - إجمالي المنصرف المعتمد للمطاحن + صافي التحويلات والتسويات
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canAdd && (
                <button
                  type="button"
                  onClick={() => setShowAddShunaModal(true)}
                  data-testid="btn-add-shuna"
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة شونة جديدة</span>
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToArabicCsv(
                      'shunas_valuation_and_balances',
                      [
                        'م',
                        'كود الشونة',
                        'اسم الشونة',
                        'القرية',
                        'الجهة التابعة',
                        'المساحة الكلية م2',
                        'المساحة المتبقية م2',
                        'السعة التخزينية (طن)',
                        'الرصيد الافتتاحي (طن)',
                        'الوارد المعتمد (طن)',
                        'المنصرف المعتمد (طن)',
                        'الرصيد الحالي المحسوب (طن)',
                        'سعر الطن (ج.م)',
                        'قيمة المخزون السلعي (ج.م)',
                        'قيمة الأصول والمعدات والموازين (ج.م)',
                        'إجمالي القيمة التقديرية للشونة (ج.م)',
                        'حالة الميزان',
                        'حالة التشغيل',
                      ],
                      shunasWithMetrics.map(({ shuna, metrics }) => [
                        shuna.serialNo,
                        shuna.shunaCode,
                        shuna.shunaName,
                        shuna.village,
                        shuna.affiliatedEntity,
                        shuna.totalAreaSqm,
                        metrics.remainingAreaSqm,
                        shuna.storageCapacityTons,
                        metrics.openingBalanceTons,
                        metrics.approvedInboundTons,
                        metrics.approvedOutboundTons,
                        metrics.currentBookBalanceTons,
                        shuna.tonPrice,
                        metrics.stockValuationAmount,
                        metrics.fixedAssetsValuationAmount,
                        metrics.totalEstimatedShunaValue,
                        shuna.scaleStatus,
                        shuna.operationalStatus,
                      ])
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5"
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
                      title: 'بيان الشون وتقييم الأصول والأرصدة المعتمدة للقمح',
                      subtitle: 'فصل كامل بين قيمة الأصول الثابتة وقيمة المخزون السلعي المحسوب من دفتر استلام القمح اليومي',
                      branchName,
                      headers: [
                        'كود الشونة',
                        'اسم الشونة',
                        'القرية',
                        'السعة (طن)',
                        'الافتتاحي',
                        'الوارد المعتمد',
                        'المنصرف المعتمد',
                        'الرصيد الحالي (طن)',
                        'قيمة مخزون القمح',
                        'قيمة الأصول والمعدات',
                        'الإجمالي التقديري للشونة',
                        'حالة الميزان والتشغيل',
                      ],
                      rows: shunasWithMetrics.map(({ shuna, metrics }) => [
                        shuna.shunaCode,
                        shuna.shunaName,
                        shuna.village,
                        shuna.storageCapacityTons,
                        metrics.openingBalanceTons,
                        metrics.approvedInboundTons,
                        metrics.approvedOutboundTons,
                        metrics.currentBookBalanceTons,
                        `${metrics.stockValuationAmount.toLocaleString('ar-EG')} ج.م`,
                        `${metrics.fixedAssetsValuationAmount.toLocaleString('ar-EG')} ج.م`,
                        `${metrics.totalEstimatedShunaValue.toLocaleString('ar-EG')} ج.م`,
                        `${shuna.scaleStatus} / ${shuna.operationalStatus}`,
                      ]),
                      preparedBy: currentUserFullName,
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-[#0f2342] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة A4</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right compact-erp-table">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">كود الشونة</th>
                    <th className="p-3">اسم الشونة والقرية</th>
                    <th className="p-3">الجهة التابعة والمسؤول</th>
                    <th className="p-3 text-center">المساحة (م²) الكلية / المتبقية</th>
                    <th className="p-3 text-center">السعة التخزينية</th>
                    <th className="p-3 text-center">الافتتاحي (طن)</th>
                    <th className="p-3 text-center bg-emerald-950/60">الوارد المعتمد (طن)</th>
                    <th className="p-3 text-center bg-amber-950/60">المنصرف المعتمد (طن)</th>
                    <th className="p-3 text-center bg-sky-950/80">الرصيد الحالي المحسوب (للقراءة فقط)</th>
                    <th className="p-3 text-center">قيمة المخزون السلعي</th>
                    <th className="p-3 text-center">قيمة الأصول والمعدات والميزان</th>
                    <th className="p-3 text-center">إجمالي القيمة التقديرية</th>
                    <th className="p-3 text-center">حالة الميزان والتشغيل</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {shunaGroupsResult.groups.map((group) => (
                    <React.Fragment key={group.localUnit}>
                      {group.rows.map(({ shuna, metrics }) => (
                        <tr key={shuna.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-black text-amber-800">{shuna.shunaCode}</td>
                          <td className="p-3">
                            <div className="font-black text-slate-900">{shuna.shunaName}</div>
                            <div className="text-[11px] text-slate-500">
                              {shuna.village} - وحدة {shuna.localUnit}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="text-slate-800">{shuna.affiliatedEntity}</div>
                            <div className="text-[11px] text-slate-500">
                              {shuna.managerName} ({shuna.phone})
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div>{shuna.totalAreaSqm.toLocaleString('ar-EG')} م²</div>
                            <div className="text-[11px] text-emerald-700">
                              متبقي: {metrics.remainingAreaSqm.toLocaleString('ar-EG')} م²
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div>{shuna.storageCapacityTons.toLocaleString('ar-EG')} طن</div>
                            <div className="text-[10px] text-slate-500">
                              إشغال {metrics.occupancyPct}%
                            </div>
                          </td>
                          <td className="p-3 text-center">{metrics.openingBalanceTons.toLocaleString('ar-EG')}</td>
                          <td className="p-3 text-center font-black text-emerald-700 bg-emerald-50/60">
                            +{metrics.approvedInboundTons.toLocaleString('ar-EG')} طن
                            <div className="text-[10px] text-slate-500">
                              ({metrics.approvedReceiptsCount} إذن معتمد)
                            </div>
                          </td>
                          <td className="p-3 text-center font-black text-amber-800 bg-amber-50/60">
                            -{metrics.approvedOutboundTons.toLocaleString('ar-EG')} طن
                          </td>
                          <td className="p-3 text-center bg-sky-50/80">
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-900 text-white font-black text-xs">
                              <Lock className="w-3 h-3 text-sky-300" />
                              <span>{metrics.currentBookBalanceTons.toLocaleString('ar-EG')} طن</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              متاح للتخزين: {metrics.availableCapacityTons.toLocaleString('ar-EG')} طن
                            </div>
                          </td>
                          <td className="p-3 text-center font-black text-emerald-800">
                            {metrics.stockValuationAmount.toLocaleString('ar-EG')} ج.م
                          </td>
                          <td className="p-3 text-center text-slate-700">
                            <div>{metrics.fixedAssetsValuationAmount.toLocaleString('ar-EG')} ج.م</div>
                            <div className="text-[10px] text-slate-500">
                              ميزان: {shuna.scaleValue.toLocaleString('ar-EG')} ج.م
                            </div>
                          </td>
                          <td className="p-3 text-center font-black text-indigo-900">
                            {metrics.totalEstimatedShunaValue.toLocaleString('ar-EG')} ج.م
                          </td>
                          <td className="p-3 text-center space-y-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-black ${
                                shuna.operationalStatus === 'تعمل'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : shuna.operationalStatus === 'تحت الصيانة'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {shuna.operationalStatus}
                            </span>
                            <div className="text-[10px] text-slate-600">{shuna.scaleStatus}</div>
                          </td>
                          <td className="p-3 text-center">
                            <ModuleRowActions
                              entityLabel={shuna.shunaName}
                              updatedAt={shuna.updatedAt}
                              permissions={effectivePermissions}
                              testIdPrefix={`shuna-row-${shuna.id}`}
                              onView={() =>
                                setProfileModal({
                                  isOpen: true,
                                  title: `بطاقة الشونة: ${shuna.shunaName}`,
                                  subtitle: `كود ${shuna.shunaCode} — ${shuna.affiliatedEntity}`,
                                  entityType: 'بيانات تفصيلية لشونة معتمدة',
                                  onEdit: () => setEditingShuna(shuna),
                                  fields: [
                                    { label: 'كود الشونة', value: shuna.shunaCode, mono: true },
                                    { label: 'اسم الشونة', value: shuna.shunaName },
                                    { label: 'القرية / المركز', value: `${shuna.village} — وحدة ${shuna.localUnit}` },
                                    { label: 'الجهة التابعة', value: shuna.affiliatedEntity },
                                    { label: 'أمين / مدير الشونة', value: `${shuna.managerName} (${shuna.phone || 'بدون هاتف'})` },
                                    { label: 'المساحة الكلية', value: `${shuna.totalAreaSqm.toLocaleString()} م²` },
                                    { label: 'المساحة المتبقية', value: `${metrics.remainingAreaSqm.toLocaleString()} م²` },
                                    { label: 'السعة التخزينية القصوى', value: `${shuna.storageCapacityTons.toLocaleString()} طن` },
                                    { label: 'الرصيد الافتتاحي المعتمد', value: `${metrics.openingBalanceTons.toLocaleString()} طن` },
                                    { label: 'إجمالي الوارد المعتمد', value: `+${metrics.approvedInboundTons.toLocaleString()} طن` },
                                    { label: 'إجمالي المنصرف المعتمد للمطاحن', value: `-${metrics.approvedOutboundTons.toLocaleString()} طن` },
                                    { label: 'الرصيد الدفتري الحالي', value: `${metrics.currentBookBalanceTons.toLocaleString()} طن`, mono: true },
                                    { label: 'قيمة المخزون السلعي (القمح)', value: `${metrics.stockValuationAmount.toLocaleString()} ج.م` },
                                    { label: 'قيمة الأصول الثابتة والمعدات', value: `${metrics.fixedAssetsValuationAmount.toLocaleString()} ج.م` },
                                    { label: 'إجمالي القيمة التقديرية للشونة', value: `${metrics.totalEstimatedShunaValue.toLocaleString()} ج.م` },
                                    { label: 'حالة الميزان', value: shuna.scaleStatus, badge: true, badgeColor: 'teal' },
                                    { label: 'الحالة التشغيلية', value: shuna.operationalStatus, badge: true, badgeColor: 'green' },
                                    { label: 'تاريخ آخر تقييم فني', value: shuna.valuationDate || '2026-05-01' },
                                  ],
                                })
                              }
                              onEdit={() => setEditingShuna(shuna)}
                              onDelete={() =>
                                setDeleteModal({
                                  isOpen: true,
                                  entityType: 'shuna',
                                  entityId: shuna.id,
                                  entityTitle: shuna.shunaName,
                                  recordSummary: [
                                    { label: 'كود الشونة', value: shuna.shunaCode },
                                    { label: 'اسم الشونة', value: shuna.shunaName },
                                    { label: 'السعة التخزينية', value: `${shuna.storageCapacityTons} طن` },
                                    { label: 'الرصيد الحالي', value: `${metrics.currentBookBalanceTons} طن` },
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
                        labelColSpan={3}
                        metricCells={[
                          { content: `${group.subtotals.totalAreaSqm?.toLocaleString('ar-EG')} م² (متبقي ${group.subtotals.remainingAreaSqm?.toLocaleString('ar-EG')})`, align: 'center' },
                          { content: `${group.subtotals.storageCapacityTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                          { content: `${group.subtotals.openingBalanceTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                          { content: `+${group.subtotals.approvedInboundTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                          { content: `-${group.subtotals.approvedOutboundTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                          { content: `${group.subtotals.currentBookBalanceTons?.toLocaleString('ar-EG')} طن`, align: 'center', mono: true },
                          { content: `${group.subtotals.stockValuationAmount?.toLocaleString('ar-EG')} ج.م`, align: 'center' },
                          { content: `${group.subtotals.fixedAssetsValuationAmount?.toLocaleString('ar-EG')} ج.م`, align: 'center' },
                          { content: `${group.subtotals.totalEstimatedShunaValue?.toLocaleString('ar-EG')} ج.م`, align: 'center' },
                          { content: '—', align: 'center', colSpan: 2 },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  {shunaGroupsResult.groups.length > 0 && (
                    <VillageGrandTotalRow
                      totalCount={shunaGroupsResult.grandTotalCount}
                      labelColSpan={3}
                      metricCells={[
                        { content: `${shunaGroupsResult.grandTotals.totalAreaSqm?.toLocaleString('ar-EG')} م² (متبقي ${shunaGroupsResult.grandTotals.remainingAreaSqm?.toLocaleString('ar-EG')})`, align: 'center' },
                        { content: `${shunaGroupsResult.grandTotals.storageCapacityTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                        { content: `${shunaGroupsResult.grandTotals.openingBalanceTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                        { content: `+${shunaGroupsResult.grandTotals.approvedInboundTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                        { content: `-${shunaGroupsResult.grandTotals.approvedOutboundTons?.toLocaleString('ar-EG')} طن`, align: 'center' },
                        { content: `${shunaGroupsResult.grandTotals.currentBookBalanceTons?.toLocaleString('ar-EG')} طن`, align: 'center', mono: true },
                        { content: `${shunaGroupsResult.grandTotals.stockValuationAmount?.toLocaleString('ar-EG')} ج.م`, align: 'center' },
                        { content: `${shunaGroupsResult.grandTotals.fixedAssetsValuationAmount?.toLocaleString('ar-EG')} ج.م`, align: 'center' },
                        { content: `${shunaGroupsResult.grandTotals.totalEstimatedShunaValue?.toLocaleString('ar-EG')} ج.م`, align: 'center' },
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

      {/* 2. دفتر استلام القمح اليومي (27 عموداً + نظام الاعتماد + طباعة إذن استلام قمح رسمي) */}
      {activeTab === 'receipts_book' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  دفتر استلام القمح اليومي الرسمي (المصدر الوحيد لتغذية رصيد الشون)
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  صافي الوزن (كجم) = الوزن القائم - الوزن الفارغ | صافي الوزن (طن) = صافي الكجم ÷ 1000 | الوزن المقبول = صافي الطن - الاستبعادات المعتمدة بمحضر رسمي
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canAdd && (
                  <button
                    type="button"
                    onClick={() => setShowAddReceiptModal(true)}
                    data-testid="btn-add-wheat-receipt"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تسجيل إذن استلام قمح جديد</span>
                  </button>
                )}
                {canExport && (
                  <button
                    type="button"
                    onClick={() =>
                      exportRowsToArabicCsv(
                        'daily_wheat_receipts_book',
                        [
                          'م',
                          'رقم إذن الاستلام',
                          'تاريخ الاستلام',
                          'الوقت',
                          'كود الشونة',
                          'اسم الشونة',
                          'اسم المورد / المزارع',
                          'الرقم القومي / الكود',
                          'نوع القمح',
                          'الموسم',
                          'رقم السيارة',
                          'اسم السائق',
                          'رقم الميزان',
                          'الوزن القائم (كجم)',
                          'الوزن الفارغ (كجم)',
                          'صافي الوزن (كجم)',
                          'صافي الوزن (طن)',
                          'الرطوبة %',
                          'الشوائب %',
                          'درجة النظافة',
                          'الرتبة',
                          'الوزن المستبعد (طن)',
                          'الوزن المقبول (طن)',
                          'سعر الطن (ج.م)',
                          'إجمالي القيمة (ج.م)',
                          'محضر الفحص',
                          'أمين الشونة',
                          'عضو اللجنة',
                          'حالة الاعتماد',
                        ],
                        filteredReceipts.map((r, i) => [
                          i + 1,
                          r.receiptOrderNumber,
                          r.receiptDate,
                          r.receiptTime,
                          r.shunaCode,
                          r.shunaName,
                          r.supplierName,
                          r.supplierNationalIdOrCode,
                          r.wheatType,
                          r.agriculturalSeason,
                          r.vehicleNumber,
                          r.driverName,
                          r.scaleNumber,
                          r.grossWeightKg,
                          r.tareWeightKg,
                          r.netWeightKg,
                          r.netWeightTons,
                          r.moisturePct,
                          r.impuritiesPct,
                          r.cleanlinessGrade,
                          r.qualityGrade,
                          r.excludedWeightTons,
                          r.acceptedNetWeightTons,
                          r.tonPrice,
                          r.totalSupplyValue,
                          r.inspectionReportNumber,
                          r.shunaKeeperName,
                          r.committeeMemberName,
                          r.approvalStatus,
                        ])
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير دفتر الاستلام Excel</span>
                  </button>
                )}
                {canPrint && (
                  <button
                    type="button"
                    onClick={() =>
                      printModuleReportA4({
                        title: 'دفتر استلام القمح اليومي المعتمد بالشون',
                        subtitle: `إجمالي الأذون المعروضة: (${filteredReceipts.length}) إذن استلام`,
                        branchName,
                        headers: [
                          'رقم الإذن',
                          'التاريخ',
                          'الشونة',
                          'المورد / الجهة',
                          'السيارة',
                          'القائم (كجم)',
                          'الفارغ (كجم)',
                          'صافي (طن)',
                          'النظافة / الرطوبة',
                          'المستبعد',
                          'المقبول (طن)',
                          'إجمالي القيمة',
                          'الحالة',
                        ],
                        rows: filteredReceipts.map((r) => [
                          r.receiptOrderNumber,
                          r.receiptDate,
                          r.shunaName,
                          r.supplierName,
                          r.vehicleNumber,
                          r.grossWeightKg.toLocaleString('ar-EG'),
                          r.tareWeightKg.toLocaleString('ar-EG'),
                          r.netWeightTons,
                          `${r.cleanlinessGrade} (${r.moisturePct}%)`,
                          r.excludedWeightTons,
                          r.acceptedNetWeightTons,
                          `${r.totalSupplyValue.toLocaleString('ar-EG')} ج.م`,
                          r.approvalStatus,
                        ]),
                        preparedBy: currentUserFullName,
                      })
                    }
                    className="px-3 py-2 rounded-xl bg-[#0f2342] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الدفتر A4</span>
                  </button>
                )}
              </div>
            </div>

            {/* فلاتر البحث والتصفية لدفتر استلام القمح */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
              <div className="relative md:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="بحث برقم الإذن، اسم المورد، الشونة، رقم السيارة، السائق..."
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>
              <select
                value={shunaFilter}
                onChange={(e) => setShunaFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              >
                <option value="ALL">جميع الشون ({shunas.length})</option>
                {shunas.map((s) => (
                  <option key={s.shunaCode} value={s.shunaCode}>
                    {s.shunaName} ({s.shunaCode})
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
              >
                <option value="ALL">جميع حالات الاعتماد</option>
                <option value="معتمد">معتمد (مضاف للرصيد)</option>
                <option value="في انتظار المراجعة">في انتظار المراجعة</option>
                <option value="مسودة">مسودة</option>
                <option value="مرفوض">مرفوض</option>
                <option value="ملغي">ملغي</option>
              </select>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  title="من تاريخ"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  title="إلى تاريخ"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right compact-erp-table">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-2.5">م</th>
                    <th className="p-2.5">رقم الإذن والتاريخ</th>
                    <th className="p-2.5">الشونة</th>
                    <th className="p-2.5">المورد / المزارع</th>
                    <th className="p-2.5">السيارة والسائق</th>
                    <th className="p-2.5 text-center">القائم / الفارغ (كجم)</th>
                    <th className="p-2.5 text-center">صافي الوزن (كجم / طن)</th>
                    <th className="p-2.5 text-center">الرطوبة والشوائب والرتبة</th>
                    <th className="p-2.5 text-center">المستبعد المعتمد</th>
                    <th className="p-2.5 text-center bg-emerald-950/70">الوزن المقبول (طن)</th>
                    <th className="p-2.5 text-center">سعر الطن والإجمالي</th>
                    <th className="p-2.5 text-center">محضر الفرز واللجنة</th>
                    <th className="p-2.5 text-center">حالة الاعتماد</th>
                    <th className="p-2.5 text-center">إجراءات رسمية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {filteredReceipts.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-2.5 text-center">{idx + 1}</td>
                      <td className="p-2.5">
                        <div className="font-mono font-black text-indigo-900">
                          {r.receiptOrderNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.receiptDate} | {r.receiptTime}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-black text-slate-900">{r.shunaName}</div>
                        <div className="text-[10px] text-amber-700 font-mono">{r.shunaCode}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="text-slate-900">{r.supplierName}</div>
                        <div className="text-[10px] text-slate-500">
                          كود/قومي: {r.supplierNationalIdOrCode} | {r.wheatType} ({r.agriculturalSeason})
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div>{r.vehicleNumber}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.driverName} | {r.scaleNumber}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <div>قائم: {r.grossWeightKg.toLocaleString('ar-EG')}</div>
                        <div className="text-[11px] text-slate-500">
                          فارغ: {r.tareWeightKg.toLocaleString('ar-EG')}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="font-black text-slate-900">
                          {r.netWeightKg.toLocaleString('ar-EG')} كجم
                        </div>
                        <div className="text-[11px] text-indigo-700 font-black">
                          ({r.netWeightTons} طن)
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="text-emerald-800 font-black">{r.cleanlinessGrade}</div>
                        <div className="text-[10px] text-slate-500">
                          رطوبة {r.moisturePct}% | شوائب {r.impuritiesPct}%
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        {r.excludedWeightTons > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-black">
                            -{r.excludedWeightTons} طن
                          </span>
                        ) : (
                          <span className="text-slate-400">0 طن</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-black text-emerald-800 bg-emerald-50/70 text-sm">
                        {r.acceptedNetWeightTons} طن
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="font-black text-slate-900">
                          {r.totalSupplyValue.toLocaleString('ar-EG')} ج.م
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ({r.tonPrice.toLocaleString('ar-EG')} ج.م/طن)
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="font-mono text-[11px] text-slate-800">
                          {r.inspectionReportNumber}
                        </div>
                        <div className="text-[10px] text-slate-500">{r.shunaKeeperName}</div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-black ${
                            r.approvalStatus === 'معتمد'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : r.approvalStatus === 'في انتظار المراجعة' ||
                                r.approvalStatus === 'مسودة'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {r.approvalStatus}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <ModuleRowActions
                            entityLabel={r.receiptOrderNumber}
                            updatedAt={r.updatedAt}
                            permissions={effectivePermissions}
                            testIdPrefix={`receipt-row-${r.id}`}
                            onView={() =>
                              setProfileModal({
                                isOpen: true,
                                title: `إذن استلام قمح رقم: ${r.receiptOrderNumber}`,
                                subtitle: `${r.shunaName} (${r.shunaCode}) — حالة الاعتماد: ${r.approvalStatus}`,
                                entityType: 'بيانات تفصيلية لإذن استلام القمح',
                                onEdit: () =>
                                  setEditingSubRecord({
                                    type: 'receipt',
                                    title: `تعديل إذن استلام القمح: ${r.receiptOrderNumber}`,
                                    data: { ...r },
                                  }),
                                fields: [
                                  { label: 'رقم إذن الاستلام', value: r.receiptOrderNumber, mono: true },
                                  { label: 'تاريخ ووقت الاستلام', value: `${r.receiptDate} ${r.receiptTime}` },
                                  { label: 'الشونة المستلمة', value: `${r.shunaName} (${r.shunaCode})` },
                                  { label: 'المورد / المزارع', value: r.supplierName },
                                  { label: 'الرقم القومي / الكود', value: r.supplierNationalIdOrCode, mono: true },
                                  { label: 'نوع القمح والموسم', value: `${r.wheatType} — ${r.agriculturalSeason}` },
                                  { label: 'بيانات النقل', value: `سيارة ${r.vehicleNumber} (سائق: ${r.driverName})` },
                                  { label: 'الميزان المستخدم', value: r.scaleNumber },
                                  { label: 'الوزن القائم / الفارغ', value: `${r.grossWeightKg.toLocaleString()} كجم / ${r.tareWeightKg.toLocaleString()} كجم` },
                                  { label: 'صافي الوزن القائم', value: `${r.netWeightKg.toLocaleString()} كجم (${r.netWeightTons} طن)` },
                                  { label: 'الرطوبة / الشوائب', value: `رطوبة ${r.moisturePct}% | شوائب ${r.impuritiesPct}%` },
                                  { label: 'رتبة النظافة والجودة', value: `${r.cleanlinessGrade} — ${r.qualityGrade}` },
                                  { label: 'الوزن المستبعد المعتمد', value: `${r.excludedWeightTons} طن` },
                                  { label: 'الوزن الصافي المقبول المعتمد', value: `${r.acceptedNetWeightTons} طن`, mono: true },
                                  { label: 'سعر الطن المعتمد', value: `${r.tonPrice.toLocaleString()} ج.م` },
                                  { label: 'إجمالي قيمة التوريد', value: `${r.totalSupplyValue.toLocaleString()} ج.م`, mono: true },
                                  { label: 'محضر الفحص والفرز', value: r.inspectionReportNumber },
                                  { label: 'أمين الشونة وعضو اللجنة', value: `${r.shunaKeeperName} | ${r.committeeMemberName}` },
                                  { label: 'حالة الاعتماد', value: r.approvalStatus, badge: true, badgeColor: r.approvalStatus === 'معتمد' ? 'green' : 'amber' },
                                ],
                              })
                            }
                            onEdit={() =>
                              setEditingSubRecord({
                                type: 'receipt',
                                title: `تعديل إذن استلام القمح: ${r.receiptOrderNumber}`,
                                data: { ...r },
                              })
                            }
                            onPrint={() => handlePrintOfficialReceiptVoucher(r)}
                            onDelete={() =>
                              setDeleteModal({
                                isOpen: true,
                                entityType: 'receipt',
                                entityId: r.id,
                                entityTitle: r.receiptOrderNumber,
                                recordSummary: [
                                  { label: 'رقم الإذن', value: r.receiptOrderNumber },
                                  { label: 'الشونة', value: r.shunaName },
                                  { label: 'المورد', value: r.supplierName },
                                  { label: 'الكمية', value: `${r.acceptedNetWeightTons} طن` },
                                  { label: 'الحالة', value: r.approvalStatus },
                                ],
                              })
                            }
                          />
                          {canEdit && r.approvalStatus !== 'معتمد' && (
                            <button
                              type="button"
                              onClick={() => handleApproveOrReverseReceipt(r, 'معتمد')}
                              title="اعتماد الإذن وترحيله لرصيد الشونة"
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>اعتماد</span>
                            </button>
                          )}
                          {canEdit && r.approvalStatus === 'معتمد' && (
                            <button
                              type="button"
                              onClick={() => handleApproveOrReverseReceipt(r, 'ملغي')}
                              title="إلغاء بعكس قيد محاسبي (يمنع الحذف المباشر للأذون المعتمدة)"
                              className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>عكس قيد</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-black text-xs">
                  <tr>
                    <td colSpan={6} className="p-3">
                      إجمالي أذون الاستلام المعروضة ({filteredReceipts.length} إذن) — المعتمد منها فقط يغذي رصيد الشونة
                    </td>
                    <td className="p-3 text-center">
                      {filteredReceipts
                        .reduce((s, r) => s + (Number(r.netWeightTons) || 0), 0)
                        .toFixed(3)}{' '}
                      طن
                    </td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-center text-rose-300">
                      -
                      {filteredReceipts
                        .reduce((s, r) => s + (Number(r.excludedWeightTons) || 0), 0)
                        .toFixed(3)}{' '}
                      طن
                    </td>
                    <td className="p-3 text-center text-emerald-300 text-sm">
                      {filteredReceipts
                        .filter((r) => r.approvalStatus === 'معتمد')
                        .reduce((s, r) => s + (Number(r.acceptedNetWeightTons) || 0), 0)
                        .toFixed(3)}{' '}
                      طن معتمد
                    </td>
                    <td className="p-3 text-center text-amber-300">
                      {filteredReceipts
                        .filter((r) => r.approvalStatus === 'معتمد')
                        .reduce((s, r) => s + (Number(r.totalSupplyValue) || 0), 0)
                        .toLocaleString('ar-EG')}{' '}
                      ج.م
                    </td>
                    <td colSpan={3} className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. دفتر صرف القمح من الشون للمطاحن */}
      {activeTab === 'issues_book' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-base font-black text-slate-900">
                دفتر صرف القمح من الشون إلى المطاحن التموينية
              </h3>
              <p className="text-xs font-bold text-slate-500">
                يمنع النظام صرف أي كمية تتجاوز الرصيد المتاح في الشونة إلا بتجاوز إداري مسبب وموثق، ويرتبط كل إذن صرف باستلام المطحن
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddIssueModal(true)}
                data-testid="btn-add-wheat-issue"
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل إذن صرف قمح لمطحن</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right compact-erp-table">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم إذن الصرف</th>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">الشونة الموردة</th>
                    <th className="p-3">المطحن المستفيد</th>
                    <th className="p-3 text-center">نوع القمح</th>
                    <th className="p-3 text-center">الرصيد قبل الصرف</th>
                    <th className="p-3 text-center bg-amber-950/70">الكمية المنصرفة (طن)</th>
                    <th className="p-3 text-center">الرصيد بعد الصرف</th>
                    <th className="p-3 text-center">إجمالي القيمة</th>
                    <th className="p-3">السيارة والسائق والمستلم</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {wheatIssues.map((iss) => {
                    const openEditIssue = () =>
                      setEditingSubRecord({
                        type: 'issue',
                        title: `تعديل إذن صرف القمح: ${iss.issueOrderNumber}`,
                        data: { ...iss },
                      });
                    return (
                      <tr key={iss.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-black text-amber-800">
                          {iss.issueOrderNumber}
                        </td>
                        <td className="p-3">
                          {iss.issueDate} | {iss.issueTime}
                        </td>
                        <td className="p-3">
                          <div className="font-black text-slate-900">{iss.shunaName}</div>
                          <div className="text-[10px] text-slate-500">{iss.shunaCode}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-black text-indigo-900">{iss.beneficiaryMillName}</div>
                          <div className="text-[10px] text-slate-500">{iss.beneficiaryMillCode}</div>
                        </td>
                        <td className="p-3 text-center">{iss.wheatType}</td>
                        <td className="p-3 text-center">{iss.balanceBeforeIssueTons} طن</td>
                        <td className="p-3 text-center font-black text-amber-800 bg-amber-50/70">
                          {iss.issuedWeightTons} طن
                        </td>
                        <td className="p-3 text-center font-black text-emerald-800">
                          {iss.balanceAfterIssueTons} طن
                        </td>
                        <td className="p-3 text-center">
                          {iss.totalIssuedValue.toLocaleString('ar-EG')} ج.م
                        </td>
                        <td className="p-3">
                          <div>
                            {iss.vehicleNumber} - {iss.driverName}
                          </div>
                          <div className="text-[10px] text-slate-500">المستلم: {iss.receiverName}</div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-black">
                            {iss.approvalStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <ModuleRowActions
                            entityLabel={iss.issueOrderNumber}
                            updatedAt={(iss as unknown as { updatedAt?: string }).updatedAt}
                            permissions={effectivePermissions}
                            testIdPrefix={`issue-row-${iss.id}`}
                            onView={() =>
                              setProfileModal({
                                isOpen: true,
                                title: `إذن صرف قمح للمطحن: ${iss.issueOrderNumber}`,
                                subtitle: `${iss.shunaName} → ${iss.beneficiaryMillName}`,
                                entityType: 'إذن صرف قمح لمطحن تمويني',
                                onEdit: openEditIssue,
                                fields: [
                                  { label: 'رقم إذن الصرف', value: iss.issueOrderNumber, mono: true },
                                  { label: 'التاريخ والوقت', value: `${iss.issueDate} | ${iss.issueTime}` },
                                  { label: 'الشونة الموردة', value: `${iss.shunaName} (${iss.shunaCode})` },
                                  { label: 'المطحن المستفيد', value: `${iss.beneficiaryMillName} (${iss.beneficiaryMillCode})` },
                                  { label: 'نوع القمح', value: iss.wheatType },
                                  { label: 'الرصيد قبل الصرف', value: `${iss.balanceBeforeIssueTons} طن` },
                                  { label: 'الكمية المنصرفة', value: `${iss.issuedWeightTons} طن`, mono: true },
                                  { label: 'الرصيد بعد الصرف', value: `${iss.balanceAfterIssueTons} طن` },
                                  { label: 'إجمالي القيمة المالية', value: `${iss.totalIssuedValue.toLocaleString('ar-EG')} ج.م`, mono: true },
                                  { label: 'السيارة والسائق', value: `${iss.vehicleNumber} — ${iss.driverName}` },
                                  { label: 'المستلم بالمطحن', value: iss.receiverName },
                                  { label: 'الحالة', value: iss.approvalStatus },
                                ],
                              })
                            }
                            onEdit={openEditIssue}
                            onDelete={() =>
                              setDeleteModal({
                                isOpen: true,
                                entityType: 'issue',
                                entityId: iss.id,
                                entityTitle: iss.issueOrderNumber,
                                recordSummary: [
                                  { label: 'رقم إذن الصرف', value: iss.issueOrderNumber },
                                  { label: 'الشونة', value: iss.shunaName },
                                  { label: 'المطحن', value: iss.beneficiaryMillName },
                                  { label: 'الكمية المنصرفة', value: `${iss.issuedWeightTons} طن` },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <VillageGrandTotalRow
                    totalCount={wheatIssues.length}
                    labelColSpan={6}
                    title="الإجمالي العام للمنصرف من الشون للمطاحن TOTAL"
                    metricCells={[
                      { content: `${Number(wheatIssues.reduce((s, i) => s + (i.issuedWeightTons || 0), 0).toFixed(3))} طن`, mono: true },
                      { content: '—' },
                      { content: `${wheatIssues.reduce((s, i) => s + (i.totalIssuedValue || 0), 0).toLocaleString('ar-EG')} ج.م`, mono: true },
                      { content: '—', colSpan: 3 },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. دفتر حركة أرصدة القمح بالشون */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">
                دفتر حركة أرصدة القمح بالشون (متاح الإضافة والتعديل والحذف في أي وقت)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                يوثق الرصيد قبل وبعد كل حركة (رصيد افتتاحي، وارد معتمد، صرف لمطحن، تسوية جرد، عكس قيد) مع إتاحة الإضافة والتعديل والحذف المباشر
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                data-testid="btn-add-wheat-ledger"
                onClick={openAddLedgerModal}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة حركة جديدة بالدفتر</span>
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right compact-erp-table">
              <thead className="bg-[#0f2342] text-white font-black">
                <tr>
                  <th className="p-3">رقم الحركة</th>
                  <th className="p-3">التاريخ والوقت</th>
                  <th className="p-3">الشونة</th>
                  <th className="p-3">نوع الحركة</th>
                  <th className="p-3">المستند المرجعي</th>
                  <th className="p-3 text-center">الرصيد قبل الحركة</th>
                  <th className="p-3 text-center">الكمية (طن)</th>
                  <th className="p-3 text-center">الرصيد بعد الحركة</th>
                  <th className="p-3 text-center">القيمة المالية</th>
                  <th className="p-3">المسؤول والبيان</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold">
                {wheatLedgerMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-black text-slate-800">{m.movementCode}</td>
                    <td className="p-3">
                      {m.movementDate} | {m.movementTime}
                    </td>
                    <td className="p-3">{m.shunaName}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-black ${
                          m.quantityTons >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.movementType}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-indigo-800">{m.referenceDocNumber}</td>
                    <td className="p-3 text-center">{m.balanceBeforeTons} طن</td>
                    <td
                      className={`p-3 text-center font-black ${
                        m.quantityTons >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {m.quantityTons > 0 ? `+${m.quantityTons}` : m.quantityTons} طن
                    </td>
                    <td className="p-3 text-center font-black text-slate-900">
                      {m.balanceAfterTons} طن
                    </td>
                    <td className="p-3 text-center">
                      {m.totalValue.toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-3">
                      <div>{m.performedBy}</div>
                      <div className="text-[10px] text-slate-500">{m.notes}</div>
                    </td>
                    <td className="p-3 text-center">
                      <ModuleRowActions
                        entityLabel={m.movementCode}
                        permissions={effectivePermissions}
                        testIdPrefix={`ledger-row-${m.id}`}
                        onView={() =>
                          setProfileModal({
                            isOpen: true,
                            title: `حركة دفتر أرصدة القمح: ${m.movementCode}`,
                            subtitle: `${m.shunaName} — ${m.movementType}`,
                            entityType: 'قيد رقابي بدفتر أرصدة القمح',
                            onEdit: () => openEditLedgerModal(m),
                            fields: [
                              { label: 'كود الحركة', value: m.movementCode, mono: true },
                              { label: 'التاريخ والوقت', value: `${m.movementDate} | ${m.movementTime}` },
                              { label: 'الشونة', value: m.shunaName },
                              { label: 'نوع الحركة', value: m.movementType },
                              { label: 'المستند المرجعي', value: m.referenceDocNumber, mono: true },
                              { label: 'الرصيد قبل الحركة', value: `${m.balanceBeforeTons} طن` },
                              { label: 'الكمية', value: `${m.quantityTons} طن`, mono: true },
                              { label: 'الرصيد بعد الحركة', value: `${m.balanceAfterTons} طن`, mono: true },
                              { label: 'القيمة المالية', value: `${m.totalValue.toLocaleString('ar-EG')} ج.م` },
                              { label: 'المنفذ', value: m.performedBy },
                              { label: 'البيان', value: m.notes || '—' },
                            ],
                          })
                        }
                        onEdit={() => openEditLedgerModal(m)}
                        onDelete={() =>
                          setDeleteModal({
                            isOpen: true,
                            entityType: 'ledger',
                            entityId: m.id,
                            entityTitle: m.movementCode,
                            recordSummary: [
                              { label: 'كود الحركة', value: m.movementCode },
                              { label: 'الشونة', value: m.shunaName },
                              { label: 'نوع الحركة', value: m.movementType },
                              { label: 'الكمية', value: `${m.quantityTons} طن` },
                            ],
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {wheatLedgerMovements.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-500 font-bold">
                      لا توجد حركات مسجلة في دفتر حركة أرصدة القمح بالشون حالياً — يمكنك إضافة حركة جديدة في أي وقت.
                    </td>
                  </tr>
                )}
                <VillageGrandTotalRow
                  totalCount={wheatLedgerMovements.length}
                  labelColSpan={6}
                  title="الإجمالي العام لحركات دفتر أرصدة القمح TOTAL"
                  metricCells={[
                    { content: `${Number(wheatLedgerMovements.reduce((s, m) => s + (m.quantityTons || 0), 0).toFixed(3))} طن صافي`, mono: true },
                    { content: '—' },
                    { content: `${wheatLedgerMovements.reduce((s, m) => s + (m.totalValue || 0), 0).toLocaleString('ar-EG')} ج.م`, mono: true },
                    { content: '—', colSpan: 2 },
                  ]}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. مطابقة الجرد الفعلي والتسويات */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-base font-black text-slate-900">
                تقرير مطابقة أرصدة الشون (الرصيد الدفتري المحسوب مقابل الجرد الفعلي)
              </h3>
              <p className="text-xs font-bold text-slate-500">
                فرق الجرد = الرصيد الفعلي بالجرد - الرصيد الدفتري (اللون الأحمر للعجز، والأخضر للزيادة أو المطابقة)
              </p>
            </div>
            {canAdd && (
              <button
                type="button"
                onClick={() => setShowAddReconModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل محضر مطابقة وجرد فعلي</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right compact-erp-table">
                <thead className="bg-[#0f2342] text-white font-black">
                  <tr>
                    <th className="p-3">رقم محضر المطابقة</th>
                    <th className="p-3">تاريخ الجرد</th>
                    <th className="p-3">الشونة</th>
                    <th className="p-3 text-center">الرصيد الدفتري المحسوب</th>
                    <th className="p-3 text-center">الرصيد الفعلي بالجرد</th>
                    <th className="p-3 text-center">فرق الجرد (طن)</th>
                    <th className="p-3 text-center">حالة المطابقة</th>
                    <th className="p-3">لجنة الجرد</th>
                    <th className="p-3">تفسير الفرق والإجراء المتخذ</th>
                    <th className="p-3 text-center">إدارة السجل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-bold">
                  {shunaReconciliations.map((rec) => {
                    const openEditRecon = () =>
                      setEditingSubRecord({
                        type: 'reconciliation',
                        title: `تعديل محضر مطابقة الجرد: ${rec.reconciliationNumber}`,
                        data: { ...rec },
                      });
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-black text-indigo-900">
                          {rec.reconciliationNumber}
                        </td>
                        <td className="p-3">{rec.reconciliationDate}</td>
                        <td className="p-3 font-black text-slate-900">{rec.shunaName}</td>
                        <td className="p-3 text-center">{rec.bookBalanceTons} طن</td>
                        <td className="p-3 text-center font-black">{rec.physicalCountTons} طن</td>
                        <td
                          className={`p-3 text-center font-black ${
                            rec.varianceTons < 0
                              ? 'text-rose-700 bg-rose-50'
                              : rec.varianceTons > 0
                              ? 'text-emerald-700 bg-emerald-50'
                              : 'text-slate-700'
                          }`}
                        >
                          {rec.varianceTons > 0 ? `+${rec.varianceTons}` : rec.varianceTons} طن
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${
                              rec.reconciliationStatus === 'مطابق'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rec.reconciliationStatus === 'عجز'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-teal-100 text-teal-800'
                            }`}
                          >
                            {rec.reconciliationStatus}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-black">{rec.committeeHead}</div>
                          <div className="text-[10px] text-slate-500">{rec.committeeMembers}</div>
                        </td>
                        <td className="p-3">
                          <div>{rec.reasonOrExplanation}</div>
                          <div className="text-[10px] text-indigo-700">{rec.actionTaken}</div>
                        </td>
                        <td className="p-3 text-center">
                          <ModuleRowActions
                            entityLabel={rec.reconciliationNumber}
                            updatedAt={(rec as unknown as { updatedAt?: string }).updatedAt}
                            permissions={effectivePermissions}
                            testIdPrefix={`recon-row-${rec.id}`}
                            onView={() =>
                              setProfileModal({
                                isOpen: true,
                                title: `محضر مطابقة جرد: ${rec.reconciliationNumber}`,
                                subtitle: `${rec.shunaName} — ${rec.reconciliationStatus}`,
                                entityType: 'محضر جرد ومطابقة شونة',
                                onEdit: openEditRecon,
                                fields: [
                                  { label: 'رقم محضر المطابقة', value: rec.reconciliationNumber, mono: true },
                                  { label: 'تاريخ الجرد', value: rec.reconciliationDate },
                                  { label: 'الشونة', value: rec.shunaName },
                                  { label: 'الرصيد الدفتري المحسوب', value: `${rec.bookBalanceTons} طن`, mono: true },
                                  { label: 'الرصيد الفعلي بالجرد', value: `${rec.physicalCountTons} طن`, mono: true },
                                  { label: 'فرق الجرد', value: `${rec.varianceTons} طن`, mono: true },
                                  { label: 'حالة المطابقة', value: rec.reconciliationStatus },
                                  { label: 'رئيس اللجنة', value: rec.committeeHead },
                                  { label: 'أعضاء اللجنة', value: rec.committeeMembers },
                                  { label: 'التفسير والإجراء', value: `${rec.reasonOrExplanation} — ${rec.actionTaken}` },
                                ],
                              })
                            }
                            onEdit={openEditRecon}
                            onDelete={() =>
                              setDeleteModal({
                                isOpen: true,
                                entityType: 'reconciliation',
                                entityId: rec.id,
                                entityTitle: rec.reconciliationNumber,
                                recordSummary: [
                                  { label: 'رقم المحضر', value: rec.reconciliationNumber },
                                  { label: 'الشونة', value: rec.shunaName },
                                  { label: 'فرق الجرد', value: `${rec.varianceTons} طن` },
                                ],
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <VillageGrandTotalRow
                    totalCount={shunaReconciliations.length}
                    labelColSpan={3}
                    title="الإجمالي العام لمحاضر الجرد والمطابقة TOTAL"
                    metricCells={[
                      { content: `${Number(shunaReconciliations.reduce((s, r) => s + (r.bookBalanceTons || 0), 0).toFixed(3))} طن`, mono: true },
                      { content: `${Number(shunaReconciliations.reduce((s, r) => s + (r.physicalCountTons || 0), 0).toFixed(3))} طن`, mono: true },
                      { content: `${Number(shunaReconciliations.reduce((s, r) => s + (r.varianceTons || 0), 0).toFixed(3))} طن`, mono: true },
                      { content: '—', colSpan: 4 },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إضافة شونة جديدة */}
      {showAddShunaModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-black text-slate-900 mb-4">
              تسجيل شونة جديدة وتقييم أصولها ومعداتها
            </h3>
            <form onSubmit={handleCreateShuna} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">كود الشونة الفريد</label>
                  <input
                    type="text"
                    required
                    value={newShuna.shunaCode}
                    onChange={(e) => setNewShuna({ ...newShuna, shunaCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">اسم الشونة</label>
                  <input
                    type="text"
                    required
                    value={newShuna.shunaName}
                    onChange={(e) => setNewShuna({ ...newShuna, shunaName: e.target.value })}
                    placeholder="مثال: شونة المحلة الكبرى المطورة..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">القرية / الموقع</label>
                  <input
                    type="text"
                    value={newShuna.village}
                    onChange={(e) => setNewShuna({ ...newShuna, village: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الجهة التابعة لها</label>
                  <input
                    type="text"
                    value={newShuna.affiliatedEntity}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, affiliatedEntity: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم مسؤول الشونة</label>
                  <input
                    type="text"
                    value={newShuna.managerName}
                    onChange={(e) => setNewShuna({ ...newShuna, managerName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المساحة الكلية (م²)</label>
                  <input
                    type="number"
                    value={newShuna.totalAreaSqm}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, totalAreaSqm: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المساحة المستخدمة (م²)</label>
                  <input
                    type="number"
                    value={newShuna.usedAreaSqm}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, usedAreaSqm: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">السعة التخزينية (طن)</label>
                  <input
                    type="number"
                    value={newShuna.storageCapacityTons}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, storageCapacityTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الرصيد الافتتاحي المعتمد (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={newShuna.openingBalanceTons}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, openingBalanceTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">سعر الطن (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newShuna.tonPrice}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, tonPrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">قيمة الأصول والتجهيزات (ج.م)</label>
                  <input
                    type="number"
                    value={newShuna.assetsAndFixturesValue}
                    onChange={(e) =>
                      setNewShuna({
                        ...newShuna,
                        assetsAndFixturesValue: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">قيمة الميزان والمعدات (ج.م)</label>
                  <input
                    type="number"
                    value={newShuna.scaleValue}
                    onChange={(e) =>
                      setNewShuna({ ...newShuna, scaleValue: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddShunaModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 text-white font-black"
                >
                  حفظ بيانات الشونة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل إذن استلام قمح يومي جديد (27 حقلاً) */}
      {showAddReceiptModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6">
            <h3 className="text-lg font-black text-slate-900 mb-1">
              تسجيل إذن استلام قمح جديد في دفتر الاستلام اليومي
            </h3>
            <p className="text-xs font-bold text-slate-500 mb-4">
              يُحسب صافي الوزن بالكيلوجرام وبالطن والوزن المقبول وقيمة التوريد تلقائياً، ويُضاف لرصيد الشونة فور الاعتماد.
            </p>
            <form onSubmit={handleCreateWheatReceipt} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم إذن الاستلام الفريد</label>
                  <input
                    type="text"
                    required
                    value={newReceipt.receiptOrderNumber}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, receiptOrderNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">تاريخ الاستلام</label>
                  <input
                    type="date"
                    required
                    value={newReceipt.receiptDate}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, receiptDate: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">وقت الاستلام</label>
                  <input
                    type="time"
                    required
                    value={newReceipt.receiptTime}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, receiptTime: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الشونة المستلمة</label>
                  <select
                    value={newReceipt.shunaCode}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, shunaCode: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {shunas.map((s) => (
                      <option key={s.shunaCode} value={s.shunaCode}>
                        {s.shunaName} ({s.shunaCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">
                    اسم المورد / المزارع / الجمعية الموردة
                  </label>
                  <input
                    type="text"
                    required
                    value={newReceipt.supplierName}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, supplierName: e.target.value })
                    }
                    placeholder="مثال: الجمعية التعاونية الزراعية ببشبيش..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الرقم القومي أو كود المورد</label>
                  <input
                    type="text"
                    value={newReceipt.supplierNationalIdOrCode}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        supplierNationalIdOrCode: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نوع القمح</label>
                  <select
                    value={newReceipt.wheatType}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        wheatType: e.target.value as 'محلي' | 'مستورد',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="محلي">قمح محلي</option>
                    <option value="مستورد">قمح مستورد</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-slate-700">رقم السيارة</label>
                  <input
                    type="text"
                    value={newReceipt.vehicleNumber}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, vehicleNumber: e.target.value })
                    }
                    placeholder="غ ر ب ..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">اسم السائق</label>
                  <input
                    type="text"
                    value={newReceipt.driverName}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, driverName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن القائم بالكيلوجرام</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newReceipt.grossWeightKg}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        grossWeightKg: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الوزن الفارغ بالكيلوجرام</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newReceipt.tareWeightKg}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        tareWeightKg: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-slate-700">درجة النظافة والقيراط</label>
                  <select
                    value={newReceipt.cleanlinessGrade}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, cleanlinessGrade: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="23.5 قيراط">23.5 قيراط (أعلى رتبة)</option>
                    <option value="23 قيراط">23 قيراط</option>
                    <option value="22.5 قيراط">22.5 قيراط</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نسبة الرطوبة %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newReceipt.moisturePct}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, moisturePct: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">
                    الوزن المستبعد المعتمد بالطن (إن وجد)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={newReceipt.excludedWeightTons}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        excludedWeightTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">سعر الطن المعتمد (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newReceipt.tonPrice}
                    onChange={(e) =>
                      setNewReceipt({ ...newReceipt, tonPrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-slate-700">رقم محضر الفحص والفرز</label>
                  <input
                    type="text"
                    value={newReceipt.inspectionReportNumber}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        inspectionReportNumber: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">حالة الاعتماد عند الحفظ</label>
                  <select
                    value={newReceipt.approvalStatus}
                    onChange={(e) =>
                      setNewReceipt({
                        ...newReceipt,
                        approvalStatus: e.target.value as ReceiptApprovalStatus,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="معتمد">معتمد (يُرحّل فوراً لرصيد الشونة)</option>
                    <option value="في انتظار المراجعة">في انتظار المراجعة (لا يغير الرصيد)</option>
                    <option value="مسودة">مسودة (لا يغير الرصيد)</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">ملاحظات لجنة الاستلام</label>
                  <input
                    type="text"
                    value={newReceipt.notes}
                    onChange={(e) => setNewReceipt({ ...newReceipt, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* معاينة الحساب التلقائي الفوري */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[11px] text-slate-500">صافي الوزن (كجم)</div>
                  <div className="text-base font-black text-slate-900">
                    {liveReceiptCalc.netWeightKg.toLocaleString('ar-EG')} كجم
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">صافي الوزن (طن)</div>
                  <div className="text-base font-black text-indigo-800">
                    {liveReceiptCalc.netWeightTons} طن
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">الوزن الصافي المقبول (طن)</div>
                  <div className="text-base font-black text-emerald-700">
                    {liveReceiptCalc.acceptedNetWeightTons} طن
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">إجمالي قيمة التوريد</div>
                  <div className="text-base font-black text-amber-800">
                    {liveReceiptCalc.totalSupplyValue.toLocaleString('ar-EG')} ج.م
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddReceiptModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  data-testid="submit-wheat-receipt-btn"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                >
                  حفظ إذن الاستلام في الدفتر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل إذن صرف قمح من الشونة لمطحن */}
      {showAddIssueModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل إذن صرف قمح من الشونة إلى مطحن تمويني
            </h3>
            <form onSubmit={handleCreateWheatIssue} className="space-y-4 text-xs font-bold">
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">تاريخ الصرف</label>
                  <input
                    type="date"
                    required
                    value={newIssue.issueDate}
                    onChange={(e) => setNewIssue({ ...newIssue, issueDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الشونة المنصرف منها</label>
                  <select
                    value={newIssue.shunaCode}
                    onChange={(e) => setNewIssue({ ...newIssue, shunaCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {shunas.map((s) => (
                      <option key={s.shunaCode} value={s.shunaCode}>
                        {s.shunaName} ({s.shunaCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المطحن المستفيد</label>
                  <select
                    value={newIssue.beneficiaryMillCode}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, beneficiaryMillCode: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {mills.map((m) => (
                      <option key={m.millCode} value={m.millCode}>
                        {m.millName} ({m.millCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الكمية المنصرفة (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    min={0.1}
                    value={newIssue.issuedWeightTons}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, issuedWeightTons: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">رقم السيارة واسم السائق</label>
                  <input
                    type="text"
                    value={newIssue.vehicleNumber}
                    onChange={(e) =>
                      setNewIssue({ ...newIssue, vehicleNumber: e.target.value })
                    }
                    placeholder="رقم السيارة..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">
                    سبب التجاوز الإداري (إلزامي فقط إذا كانت الكمية أكبر من رصيد الشونة)
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
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
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
                  اعتماد إذن الصرف للمطحن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تسجيل محضر مطابقة جرد شونة */}
      {showAddReconModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تسجيل محضر مطابقة وجرد فعلي للشونة
            </h3>
            <form onSubmit={handleCreateReconciliation} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم محضر الجرد</label>
                  <input
                    type="text"
                    required
                    value={newRecon.reconciliationNumber}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, reconciliationNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الشونة</label>
                  <select
                    value={newRecon.shunaCode}
                    onChange={(e) => setNewRecon({ ...newRecon, shunaCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {shunas.map((s) => (
                      <option key={s.shunaCode} value={s.shunaCode}>
                        {s.shunaName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الرصيد الفعلي بالجرد (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newRecon.physicalCountTons}
                    onChange={(e) =>
                      setNewRecon({
                        ...newRecon,
                        physicalCountTons: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">رئيس لجنة الجرد</label>
                  <input
                    type="text"
                    value={newRecon.committeeHead}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, committeeHead: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-slate-700">تفسير الفرق والإجراء المتخذ</label>
                  <input
                    type="text"
                    value={newRecon.reasonOrExplanation}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, reasonOrExplanation: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="applyAdj"
                    checked={newRecon.applyAsAdjustment}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, applyAsAdjustment: e.target.checked })
                    }
                  />
                  <label htmlFor="applyAdj" className="text-slate-800">
                    ترحيل فرق الجرد كتسوية معتمدة في حقل التسويات المستقل للشونة (دون تعديل الحركات السابقة)
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddReconModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-black"
                >
                  حفظ محضر المطابقة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تعديل بيانات الشونة */}
      {editingShuna && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6">
            <h3 className="text-lg font-black text-slate-900 mb-3">
              تعديل بيانات الشونة: {editingShuna.shunaName}
            </h3>
            <form onSubmit={handleSaveEditShuna} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">اسم الشونة</label>
                  <input
                    type="text"
                    required
                    value={editingShuna.shunaName}
                    onChange={(e) => setEditingShuna({ ...editingShuna, shunaName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الجهة التابعة</label>
                  <input
                    type="text"
                    required
                    value={editingShuna.affiliatedEntity}
                    onChange={(e) => setEditingShuna({ ...editingShuna, affiliatedEntity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">أمين / مدير الشونة</label>
                  <input
                    type="text"
                    value={editingShuna.managerName}
                    onChange={(e) => setEditingShuna({ ...editingShuna, managerName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">رقم الهاتف</label>
                  <input
                    type="text"
                    value={editingShuna.phone}
                    onChange={(e) => setEditingShuna({ ...editingShuna, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">السعة التخزينية (طن)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingShuna.storageCapacityTons}
                    onChange={(e) => setEditingShuna({ ...editingShuna, storageCapacityTons: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">حالة الميزان</label>
                  <select
                    value={editingShuna.scaleStatus}
                    onChange={(e) => setEditingShuna({ ...editingShuna, scaleStatus: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="يعمل ومعاير">يعمل ومعاير</option>
                    <option value="يحتاج معايرة">يحتاج معايرة</option>
                    <option value="معطل">معطل</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الحالة التشغيلية</label>
                  <select
                    value={editingShuna.operationalStatus}
                    onChange={(e) => setEditingShuna({ ...editingShuna, operationalStatus: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="تعمل">تعمل</option>
                    <option value="تحت الصيانة">تحت الصيانة</option>
                    <option value="متوقفة">متوقفة</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingShuna(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold"
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

      {/* نافذة إضافة / تعديل حركة بدفتر أرصدة القمح بالشون */}
      {ledgerModal && (
        <div
          className="fixed inset-0 z-[9980] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => setLedgerModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border-2 border-[#0A1628] w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-3">
              {ledgerModal.mode === 'add'
                ? 'إضافة حركة جديدة بدفتر أرصدة القمح بالشون'
                : `تعديل حركة دفتر الأرصدة: ${ledgerModal.movementCode}`}
            </h3>
            <form onSubmit={handleSaveLedgerModal} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-slate-700">رقم / كود الحركة *</label>
                  <input
                    type="text"
                    required
                    data-testid="ledger-form-code"
                    value={ledgerModal.movementCode}
                    onChange={(e) => setLedgerModal({ ...ledgerModal, movementCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الشونة</label>
                  <select
                    value={ledgerModal.shunaCode}
                    onChange={(e) => setLedgerModal({ ...ledgerModal, shunaCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    {shunas.map((s) => (
                      <option key={s.shunaCode} value={s.shunaCode}>
                        {s.shunaName} ({s.shunaCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">تاريخ الحركة</label>
                  <input
                    type="date"
                    required
                    value={ledgerModal.movementDate}
                    onChange={(e) => setLedgerModal({ ...ledgerModal, movementDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">نوع الحركة</label>
                  <select
                    value={ledgerModal.movementType}
                    onChange={(e) =>
                      setLedgerModal({
                        ...ledgerModal,
                        movementType: e.target.value as WheatLedgerMovementRecord['movementType'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="رصيد افتتاحي">رصيد افتتاحي</option>
                    <option value="وارد قمح معتمد">وارد قمح معتمد</option>
                    <option value="صرف قمح لمطحن">صرف قمح لمطحن</option>
                    <option value="تحويل وارد">تحويل وارد</option>
                    <option value="تحويل صادر">تحويل صادر</option>
                    <option value="تسوية جرد معتمدة">تسوية جرد معتمدة</option>
                    <option value="عكس قيد">عكس قيد</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المستند المرجعي</label>
                  <input
                    type="text"
                    value={ledgerModal.referenceDocNumber}
                    onChange={(e) =>
                      setLedgerModal({ ...ledgerModal, referenceDocNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الرصيد قبل الحركة (طن)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={ledgerModal.balanceBeforeTons}
                    onChange={(e) =>
                      setLedgerModal({ ...ledgerModal, balanceBeforeTons: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">الكمية (طن — موجب للوارد وسالب للمنصرف)</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    data-testid="ledger-form-qty"
                    value={ledgerModal.quantityTons}
                    onChange={(e) =>
                      setLedgerModal({ ...ledgerModal, quantityTons: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">سعر الطن (ج.م)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ledgerModal.tonPrice}
                    onChange={(e) =>
                      setLedgerModal({ ...ledgerModal, tonPrice: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">المسؤول / المنفذ</label>
                  <input
                    type="text"
                    value={ledgerModal.performedBy}
                    onChange={(e) =>
                      setLedgerModal({ ...ledgerModal, performedBy: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-700">ملاحظات وبيان الحركة</label>
                  <input
                    type="text"
                    value={ledgerModal.notes}
                    onChange={(e) => setLedgerModal({ ...ledgerModal, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-black text-slate-700">
                <span>
                  الرصيد المحسوب بعد الحركة:{' '}
                  {(Number(ledgerModal.balanceBeforeTons || 0) + Number(ledgerModal.quantityTons || 0)).toFixed(3)} طن
                </span>
                <span>
                  القيمة المالية:{' '}
                  {Math.round(Math.abs(Number(ledgerModal.quantityTons || 0)) * Number(ledgerModal.tonPrice || 0)).toLocaleString('ar-EG')} ج.م
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setLedgerModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  data-testid="ledger-form-submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-black cursor-pointer"
                >
                  {ledgerModal.mode === 'add' ? 'إضافة الحركة وحفظها' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تعديل أذون الاستلام / الصرف / المطابقة */}
      {editingSubRecord && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-900 mb-3">{editingSubRecord.title}</h3>
            <form onSubmit={handleSaveSubRecord} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(editingSubRecord.data)
                  .filter(([k]) => !['id', 'updatedAt', 'netWeightKg', 'netWeightTons', 'acceptedNetWeightTons', 'totalSupplyValue', 'totalIssuedValue', 'varianceTons'].includes(k))
                  .map(([key, val]) => (
                    <div key={key}>
                      <label className="block mb-1 text-slate-700 font-mono text-[11px]">{key}</label>
                      <input
                        type={typeof val === 'number' ? 'number' : 'text'}
                        step={typeof val === 'number' ? 'any' : undefined}
                        value={val ?? ''}
                        onChange={(e) =>
                          setEditingSubRecord({
                            ...editingSubRecord,
                            data: {
                              ...editingSubRecord.data,
                              [key]: typeof val === 'number' ? Number(e.target.value) : e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300"
                      />
                    </div>
                  ))}
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingSubRecord(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-black"
                >
                  حفظ التعديلات
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
          canEdit={effectivePermissions.canEdit}
          onEdit={profileModal.onEdit}
          onClose={() => setProfileModal(null)}
        />
      )}

      {/* نافذة تأكيد الحذف */}
      {deleteModal && (
        <ModuleDeleteConfirmModal
          isOpen={deleteModal.isOpen}
          entityTitle={deleteModal.entityTitle}
          recordSummary={deleteModal.recordSummary}
          canDelete={effectivePermissions.canDelete !== false}
          onClose={() => setDeleteModal(null)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </div>
  );
};
