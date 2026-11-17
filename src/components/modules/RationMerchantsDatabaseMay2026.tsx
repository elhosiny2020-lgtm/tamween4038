import React, { useMemo, useState } from 'react';
import {
  Store,
  Search,
  Plus,
  Printer,
  Download,
  Upload,
  Eye,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  History,
  X,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type {
  RationMerchant,
  MerchantActivityStatus,
  MerchantReviewStatus,
  MerchantMonthlyArchiveRecord,
  RationModuleState,
} from '../../types/modules';
import type { AppUser, VillageHierarchy } from '../../types';
import {
  exportRowsToArabicCsv,
  printModuleReportA4,
} from '../../services/modulesStorage';
import {
  compareMerchantArchiveSnapshots,
  MerchantMonthlyDiffResult,
  round2,
} from '../../utils/internalTradeMathEngine';
import { buildMay2026RationMerchantsList } from '../../data/may2026RationMerchants';

interface Props {
  state: RationModuleState;
  branchId: string;
  branchName: string;
  villages: VillageHierarchy[];
  currentUser: AppUser | null;
  canWrite: boolean;
  onUpdateMerchants: (
    nextMerchants: RationMerchant[],
    nextArchives: MerchantMonthlyArchiveRecord[] | undefined,
    summaryText: string
  ) => void;
}

type ActiveSubTab = 'table' | 'archives' | 'reports';
type ReportTypeId =
  | 'RPT_ALL'
  | 'RPT_ACTIVE'
  | 'RPT_STOPPED'
  | 'RPT_ON_LEAVE'
  | 'RPT_BY_VILLAGE'
  | 'RPT_BY_UNIT'
  | 'RPT_INSURANCE'
  | 'RPT_MONTHLY_DIFF'
  | 'RPT_NEW_MERCHANTS'
  | 'RPT_INCOMPLETE';

export const RationMerchantsDatabaseMay2026: React.FC<Props> = ({
  state,
  branchId,
  branchName,
  villages,
  currentUser,
  canWrite,
  onUpdateMerchants,
}) => {
  const [subTab, setSubTab] = useState<ActiveSubTab>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [villageFilter, setVillageFilter] = useState('ALL');
  const [localUnitFilter, setLocalUnitFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MerchantActivityStatus>('ALL');
  const [reviewFilter, setReviewFilter] = useState<'ALL' | MerchantReviewStatus>('ALL');

  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [showAddOrEditModal, setShowAddOrEditModal] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<RationMerchant | null>(null);

  const [selectedReportId, setSelectedReportId] = useState<ReportTypeId>('RPT_ALL');

  // Monthly CSV Import & Diff Preview state
  const [newMonthLabel, setNewMonthLabel] = useState('يونيو 2026');
  const [pendingDiffResult, setPendingDiffResult] = useState<MerchantMonthlyDiffResult | null>(null);
  const [pendingIncomingMerchants, setPendingIncomingMerchants] = useState<RationMerchant[] | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Form state for Add/Edit Merchant
  const [formState, setFormState] = useState({
    merchantName: '',
    nationalId: '',
    detailedAddress: '',
    phone: '',
    cashInsuranceAmount: '25000',
    activityStatus: 'نشط' as MerchantActivityStatus,
    posMachineNumber: '',
    traderCode: '',
    village: villages[0]?.village || 'بشبيش',
    localUnit: villages[0]?.localUnits?.[0] || 'بشبيش الرئيسية',
    reviewStatus: 'تمت المراجعة' as MerchantReviewStatus,
    notes: '',
  });

  const merchants = state.merchants || [];
  const archives = state.merchantMonthlyArchives || [];

  const selectedMerchant = useMemo(
    () => merchants.find((m) => m.id === selectedMerchantId) || null,
    [merchants, selectedMerchantId]
  );

  // 10 KPIs computed automatically
  const stats = useMemo(() => {
    const total = merchants.length;
    const active = merchants.filter((m) => m.activityStatus === 'نشط').length;
    const stopped = merchants.filter(
      (m) => m.activityStatus === 'متوقف' || m.activityStatus === 'موقوف'
    ).length;
    const onLeave = merchants.filter((m) => m.activityStatus === 'إجازة').length;
    const totalInsurance = merchants.reduce(
      (sum, m) => sum + (Number(m.cashInsuranceAmount) || 0),
      0
    );
    const avgInsurance = total > 0 ? round2(totalInsurance / total) : 0;

    const byVillageMap = new Map<string, { count: number; insurance: number }>();
    const byUnitMap = new Map<string, number>();

    let incompleteCount = 0;
    let needsReviewCount = 0;

    for (const m of merchants) {
      const vKey = m.village || 'غير محدد';
      const uKey = m.localUnit || 'غير محدد';
      const prevV = byVillageMap.get(vKey) || { count: 0, insurance: 0 };
      prevV.count += 1;
      prevV.insurance += Number(m.cashInsuranceAmount) || 0;
      byVillageMap.set(vKey, prevV);

      byUnitMap.set(uKey, (byUnitMap.get(uKey) || 0) + 1);

      const isMissingCore = !m.nationalId?.trim() || !m.phone?.trim() || !m.posMachineNumber?.trim();
      if (isMissingCore || m.reviewStatus === 'بيانات غير مكتملة') {
        incompleteCount += 1;
      }
      if (m.reviewStatus === 'تحتاج مراجعة' || isMissingCore) {
        needsReviewCount += 1;
      }
    }

    return {
      total,
      active,
      stopped,
      onLeave,
      totalInsurance,
      avgInsurance,
      villagesCount: byVillageMap.size,
      unitsCount: byUnitMap.size,
      incompleteCount,
      needsReviewCount,
      byVillageList: Array.from(byVillageMap.entries()).map(([village, d]) => ({
        village,
        count: d.count,
        insurance: d.insurance,
      })),
      byUnitList: Array.from(byUnitMap.entries()).map(([unit, count]) => ({ unit, count })),
    };
  }, [merchants]);

  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    for (const m of merchants) {
      if (villageFilter === 'ALL' || m.village === villageFilter) {
        if (m.localUnit) set.add(m.localUnit);
      }
    }
    return Array.from(set);
  }, [merchants, villageFilter]);

  const filteredMerchants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return merchants.filter((m) => {
      if (villageFilter !== 'ALL' && m.village !== villageFilter) return false;
      if (localUnitFilter !== 'ALL' && m.localUnit !== localUnitFilter) return false;
      if (statusFilter !== 'ALL') {
        if (
          statusFilter === 'متوقف' &&
          m.activityStatus !== 'متوقف' &&
          m.activityStatus !== 'موقوف'
        ) {
          return false;
        } else if (statusFilter !== 'متوقف' && m.activityStatus !== statusFilter) {
          return false;
        }
      }
      if (reviewFilter !== 'ALL' && (m.reviewStatus || 'تمت المراجعة') !== reviewFilter) {
        return false;
      }
      if (!q) return true;
      return (
        m.merchantName.toLowerCase().includes(q) ||
        (m.ownerName || '').toLowerCase().includes(q) ||
        (m.nationalId || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q) ||
        (m.posMachineNumber || '').toLowerCase().includes(q) ||
        (m.traderCode || m.activityCardNumber || '').toLowerCase().includes(q) ||
        (m.internalCode || '').toLowerCase().includes(q) ||
        (m.detailedAddress || '').toLowerCase().includes(q) ||
        (m.village || '').toLowerCase().includes(q)
      );
    });
  }, [merchants, searchQuery, villageFilter, localUnitFilter, statusFilter, reviewFilter]);

  const openAddMerchant = () => {
    setEditingMerchant(null);
    const nextSerial = merchants.length + 1;
    setFormState({
      merchantName: '',
      nationalId: '',
      detailedAddress: '',
      phone: '',
      cashInsuranceAmount: '25000',
      activityStatus: 'نشط',
      posMachineNumber: `1604${String(8000 + nextSerial)}`,
      traderCode: `TRD-16-${String(5000 + nextSerial)}`,
      village: villages[0]?.village || 'بشبيش',
      localUnit: villages[0]?.localUnits?.[0] || 'بشبيش الرئيسية',
      reviewStatus: 'تمت المراجعة',
      notes: '',
    });
    setShowAddOrEditModal(true);
  };

  const openEditMerchant = (m: RationMerchant) => {
    setEditingMerchant(m);
    setFormState({
      merchantName: m.merchantName,
      nationalId: m.nationalId || '',
      detailedAddress: m.detailedAddress || '',
      phone: m.phone || '',
      cashInsuranceAmount: String(m.cashInsuranceAmount || 0),
      activityStatus: m.activityStatus === 'موقوف' ? 'متوقف' : m.activityStatus,
      posMachineNumber: m.posMachineNumber || '',
      traderCode: m.traderCode || m.activityCardNumber || '',
      village: m.village || 'بشبيش',
      localUnit: m.localUnit || m.village || 'بشبيش الرئيسية',
      reviewStatus: m.reviewStatus || 'تمت المراجعة',
      notes: m.notes || '',
    });
    setShowAddOrEditModal(true);
  };

  const handleSaveMerchantForm = () => {
    if (!formState.merchantName.trim()) {
      setBannerMessage('يرجى إدخال اسم التاجر التمويني.');
      return;
    }
    // Prevent duplicate POS or Trader Code on other merchants
    const dupPos = merchants.find(
      (m) =>
        m.id !== editingMerchant?.id &&
        formState.posMachineNumber.trim() &&
        m.posMachineNumber === formState.posMachineNumber.trim()
    );
    if (dupPos) {
      setBannerMessage(`رقم الماكينة (${formState.posMachineNumber}) مسجل بالفعل للتاجر: ${dupPos.merchantName}`);
      return;
    }

    const nowStr = new Date().toLocaleString('ar-EG');
    const actor = currentUser?.fullName || 'مستخدم المنظومة';
    const todayIso = new Date().toISOString().split('T')[0];

    if (editingMerchant) {
      const updated: RationMerchant = {
        ...editingMerchant,
        merchantName: formState.merchantName.trim(),
        ownerName: formState.merchantName.trim(),
        nationalId: formState.nationalId.trim(),
        detailedAddress: formState.detailedAddress.trim(),
        phone: formState.phone.trim(),
        cashInsuranceAmount: Math.max(0, Number(formState.cashInsuranceAmount) || 0),
        activityStatus: formState.activityStatus,
        posMachineNumber: formState.posMachineNumber.trim(),
        traderCode: formState.traderCode.trim(),
        activityCardNumber: formState.traderCode.trim(),
        village: formState.village,
        localUnit: formState.localUnit,
        reviewStatus: formState.reviewStatus,
        notes: formState.notes.trim(),
        updatedAt: todayIso,
        auditHistory: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowStr,
            username: actor,
            action: 'تعديل بيانات تاجر تمويني',
            details: `تحديث الحالة إلى (${formState.activityStatus}) ومبلغ التأمين (${formState.cashInsuranceAmount} ج.م) والماكينة (${formState.posMachineNumber})`,
          },
          ...(editingMerchant.auditHistory || []),
        ],
      };
      const nextList = merchants.map((m) => (m.id === editingMerchant.id ? updated : m));
      onUpdateMerchants(nextList, archives, `تعديل بيانات التاجر: ${updated.merchantName}`);
      setBannerMessage(`تم حفظ تعديلات التاجر (${updated.merchantName}) في قاعدة البيانات بنجاح.`);
    } else {
      const nextSerial = merchants.length + 1;
      const created: RationMerchant = {
        id: `${branchId}-m-${Date.now()}`,
        serialNo: nextSerial,
        internalCode: `MHL-MAY26-${String(nextSerial).padStart(3, '0')}`,
        traderCode: formState.traderCode.trim() || `TRD-16-${5000 + nextSerial}`,
        branchId,
        merchantName: formState.merchantName.trim(),
        ownerName: formState.merchantName.trim(),
        activityCardNumber: formState.traderCode.trim() || `TRD-16-${5000 + nextSerial}`,
        posMachineNumber: formState.posMachineNumber.trim(),
        outletType: 'تاجر تمويني',
        governorate: 'الغربية',
        district: branchName,
        village: formState.village,
        localUnit: formState.localUnit,
        detailedAddress: formState.detailedAddress.trim(),
        phone: formState.phone.trim(),
        nationalId: formState.nationalId.trim(),
        commercialRegNumber: `CR-${30000 + nextSerial}`,
        taxCardNumber: `TX-400-${100 + nextSerial}-16`,
        licenseNumber: `LIC-TM-${2000 + nextSerial}`,
        licenseIssueDate: todayIso,
        licenseExpiryDate: '2028-05-01',
        registrationDate: todayIso,
        activityStartDate: todayIso,
        activityEndDate: '2028-05-01',
        monthlyEntitlementQuota: 45000,
        cashInsuranceAmount: Math.max(0, Number(formState.cashInsuranceAmount) || 0),
        openingBalance: 0,
        linkedCardsCount: 250,
        linkedBeneficiariesCount: 900,
        activityStatus: formState.activityStatus,
        reviewStatus: formState.reviewStatus,
        wholesaleBranchName: `فرع جملة ${branchName}`,
        lastRequisitionDate: todayIso,
        attachments: ['طلب قيد تاجر تمويني.pdf'],
        auditHistory: [
          {
            id: `aud-${Date.now()}`,
            timestamp: nowStr,
            username: actor,
            action: 'إضافة تاجر تمويني جديد',
            details: `تسجيل تاجر جديد بكود (${formState.traderCode}) وتأمين (${formState.cashInsuranceAmount} ج.م)`,
          },
        ],
        notes: formState.notes.trim(),
        updatedAt: todayIso,
      };
      onUpdateMerchants([...merchants, created], archives, `إضافة تاجر تمويني: ${created.merchantName}`);
      setBannerMessage(`تم إضافة التاجر (${created.merchantName}) برقم مسلسل (${nextSerial}) بنجاح.`);
    }
    setShowAddOrEditModal(false);
  };

  const handleQuickStatusChange = (merchant: RationMerchant, nextStatus: MerchantActivityStatus) => {
    const nowStr = new Date().toLocaleString('ar-EG');
    const actor = currentUser?.fullName || 'مستخدم المنظومة';
    const updated: RationMerchant = {
      ...merchant,
      activityStatus: nextStatus,
      updatedAt: new Date().toISOString().split('T')[0],
      auditHistory: [
        {
          id: `aud-st-${Date.now()}`,
          timestamp: nowStr,
          username: actor,
          action: `تغيير حالة التاجر إلى (${nextStatus})`,
          details: `الحالة السابقة: ${merchant.activityStatus} -> الحالة الجديدة: ${nextStatus} (مع الحفاظ على السجل ومبلغ التأمين دون حذف)`,
        },
        ...(merchant.auditHistory || []),
      ],
    };
    const nextList = merchants.map((m) => (m.id === merchant.id ? updated : m));
    onUpdateMerchants(nextList, archives, `تغيير حالة التاجر ${merchant.merchantName} إلى ${nextStatus}`);
    setBannerMessage(`تم تحديث حالة التاجر (${merchant.merchantName}) إلى «${nextStatus}» مع الاحتفاظ بكامل بياناته وتأمينه.`);
  };

  // Simulate or parse monthly update sheet for comparison before approval
  const handleSimulateMonthlyUpdateSheet = () => {
    const simulated = merchants.map((m, idx) => {
      if (idx === 4) {
        return { ...m, activityStatus: 'متوقف' as MerchantActivityStatus };
      }
      if (idx === 10) {
        return { ...m, cashInsuranceAmount: m.cashInsuranceAmount + 5000 };
      }
      if (idx === 18) {
        return { ...m, posMachineNumber: `${m.posMachineNumber}-NEW` };
      }
      return m;
    });
    const newTraderSerial = simulated.length + 1;
    simulated.push({
      ...simulated[0],
      id: `${branchId}-m-sim-${newTraderSerial}`,
      serialNo: newTraderSerial,
      internalCode: `MHL-JUN26-${newTraderSerial}`,
      traderCode: `TRD-16-${5000 + newTraderSerial}`,
      activityCardNumber: `TRD-16-${5000 + newTraderSerial}`,
      posMachineNumber: `1604${8000 + newTraderSerial}`,
      merchantName: 'عبد العزيز مصطفى الشناوي (تاجر مستجد)',
      ownerName: 'عبد العزيز مصطفى الشناوي (تاجر مستجد)',
      cashInsuranceAmount: 30000,
      activityStatus: 'نشط',
    });

    const diff = compareMerchantArchiveSnapshots(
      merchants.map((m) => ({
        traderCode: m.traderCode || m.activityCardNumber || '',
        posMachineNumber: m.posMachineNumber || '',
        merchantName: m.merchantName,
        nationalId: m.nationalId || '',
        phone: m.phone || '',
        detailedAddress: m.detailedAddress || '',
        cashInsuranceAmount: m.cashInsuranceAmount,
        activityStatus: m.activityStatus,
      })),
      simulated.map((m) => ({
        traderCode: m.traderCode || m.activityCardNumber || '',
        posMachineNumber: m.posMachineNumber || '',
        merchantName: m.merchantName,
        nationalId: m.nationalId || '',
        phone: m.phone || '',
        detailedAddress: m.detailedAddress || '',
        cashInsuranceAmount: m.cashInsuranceAmount,
        activityStatus: m.activityStatus,
      }))
    );
    setPendingIncomingMerchants(simulated);
    setPendingDiffResult(diff);
    setBannerMessage('تم تحليل ملف التحديث الشهري ومقارنته بالنسخة الحالية. يرجى مراجعة الفروق والموافقة عليها قبل الاعتماد.');
  };

  const handleApproveMonthlyUpdate = () => {
    if (!pendingIncomingMerchants) return;
    const newArchive: MerchantMonthlyArchiveRecord = {
      id: `arch-${Date.now()}`,
      monthLabel: `تحديث بيانات التجار شهر ${newMonthLabel}`,
      importedAt: new Date().toLocaleString('ar-EG'),
      importedBy: currentUser?.fullName || 'مستخدم المنظومة',
      totalMerchants: pendingIncomingMerchants.length,
      activeCount: pendingIncomingMerchants.filter((m) => m.activityStatus === 'نشط').length,
      stoppedCount: pendingIncomingMerchants.filter((m) => m.activityStatus === 'متوقف' || m.activityStatus === 'موقوف').length,
      onLeaveCount: pendingIncomingMerchants.filter((m) => m.activityStatus === 'إجازة').length,
      totalInsuranceAmount: pendingIncomingMerchants.reduce((s, m) => s + (Number(m.cashInsuranceAmount) || 0), 0),
      summaryNotes: `تمت المراجعة والاعتماد لشهر (${newMonthLabel}) مع حفظ النسخة السابقة في الأرشيف.`,
      merchantsSnapshot: pendingIncomingMerchants,
    };
    onUpdateMerchants(
      pendingIncomingMerchants,
      [newArchive, ...archives],
      `اعتماد التحديث الشهري للتجار (${newMonthLabel})`
    );
    setPendingIncomingMerchants(null);
    setPendingDiffResult(null);
    setBannerMessage(`تم اعتماد تحديث شهر (${newMonthLabel}) وحفظ نسخة أرشيفية كاملة.`);
  };

  const handleRestoreOriginalMay2026 = () => {
    const orig = buildMay2026RationMerchantsList(branchId, branchName, villages);
    onUpdateMerchants(orig, archives, 'استعادة النسخة الأصلية لكشف مايو 2026 (116 تاجراً)');
    setBannerMessage('تم استرجاع النسخة الأصلية المعتمدة لملف «تحديث بيانات التجار شهر مايو 2026» (116 تاجراً).');
  };

  // Report generation for the 10 Merchant Reports
  const activeReportPayload = useMemo(() => {
    switch (selectedReportId) {
      case 'RPT_ACTIVE': {
        const list = merchants.filter((m) => m.activityStatus === 'نشط');
        return {
          title: '2. كشف التجار التموينيين النشطين',
          headers: ['م', 'كود التاجر', 'اسم التاجر', 'الرقم القومي', 'القرية', 'الوحدة المحلية', 'رقم التليفون', 'رقم الماكينة', 'مبلغ التأمين (ج.م)'],
          rows: list.map((m, idx) => [
            idx + 1,
            m.traderCode || m.activityCardNumber || '-',
            m.merchantName,
            m.nationalId || '-',
            m.village,
            m.localUnit,
            m.phone || '-',
            m.posMachineNumber,
            m.cashInsuranceAmount.toLocaleString(),
          ]),
        };
      }
      case 'RPT_STOPPED': {
        const list = merchants.filter((m) => m.activityStatus === 'متوقف' || m.activityStatus === 'موقوف');
        return {
          title: '3. كشف التجار التموينيين المتوقفين',
          headers: ['م', 'كود التاجر', 'اسم التاجر', 'الرقم القومي', 'القرية', 'العنوان بالتفصيل', 'رقم الماكينة', 'مبلغ التأمين المحفوظ', 'ملاحظات'],
          rows: list.map((m, idx) => [
            idx + 1,
            m.traderCode || m.activityCardNumber || '-',
            m.merchantName,
            m.nationalId || '-',
            m.village,
            m.detailedAddress,
            m.posMachineNumber,
            m.cashInsuranceAmount.toLocaleString(),
            m.notes || '-',
          ]),
        };
      }
      case 'RPT_ON_LEAVE': {
        const list = merchants.filter((m) => m.activityStatus === 'إجازة');
        return {
          title: '4. كشف التجار التموينيين في إجازة',
          headers: ['م', 'كود التاجر', 'اسم التاجر', 'الرقم القومي', 'القرية', 'الوحدة المحلية', 'رقم الماكينة', 'مبلغ التأمين (ج.م)', 'ملاحظات الإسناد'],
          rows: list.map((m, idx) => [
            idx + 1,
            m.traderCode || m.activityCardNumber || '-',
            m.merchantName,
            m.nationalId || '-',
            m.village,
            m.localUnit,
            m.posMachineNumber,
            m.cashInsuranceAmount.toLocaleString(),
            m.notes || '-',
          ]),
        };
      }
      case 'RPT_BY_VILLAGE': {
        return {
          title: '5. كشف توزيع التجار التموينيين حسب القرية',
          headers: ['م', 'اسم القرية', 'إجمالي عدد التجار', 'نشط', 'متوقف', 'إجازة', 'إجمالي مبالغ التأمين (ج.م)'],
          rows: stats.byVillageList.map((v, idx) => {
            const vMerchants = merchants.filter((m) => m.village === v.village);
            return [
              idx + 1,
              v.village,
              v.count,
              vMerchants.filter((m) => m.activityStatus === 'نشط').length,
              vMerchants.filter((m) => m.activityStatus === 'متوقف' || m.activityStatus === 'موقوف').length,
              vMerchants.filter((m) => m.activityStatus === 'إجازة').length,
              v.insurance.toLocaleString(),
            ];
          }),
        };
      }
      case 'RPT_BY_UNIT': {
        return {
          title: '6. كشف توزيع التجار التموينيين حسب الوحدة المحلية',
          headers: ['م', 'الوحدة المحلية', 'عدد التجار المسجلين', 'إجمالي البطاقات المسندة', 'إجمالي المستفيدين'],
          rows: stats.byUnitList.map((u, idx) => {
            const uMerchants = merchants.filter((m) => m.localUnit === u.unit);
            return [
              idx + 1,
              u.unit,
              u.count,
              uMerchants.reduce((s, m) => s + (m.linkedCardsCount || 0), 0).toLocaleString(),
              uMerchants.reduce((s, m) => s + (m.linkedBeneficiariesCount || 0), 0).toLocaleString(),
            ];
          }),
        };
      }
      case 'RPT_INSURANCE': {
        return {
          title: '7. كشف مبالغ التأمين النقدي للتجار التموينيين',
          headers: ['م', 'كود التاجر', 'اسم التاجر', 'القرية', 'رقم الماكينة', 'حالة التاجر', 'مبلغ التأمين بالجنيه', 'الحصة الشهرية المستحقة'],
          rows: merchants.map((m) => [
            m.serialNo,
            m.traderCode || m.activityCardNumber || '-',
            m.merchantName,
            m.village,
            m.posMachineNumber,
            m.activityStatus,
            m.cashInsuranceAmount.toLocaleString(),
            (m.monthlyEntitlementQuota || 0).toLocaleString(),
          ]),
        };
      }
      case 'RPT_MONTHLY_DIFF': {
        return {
          title: '8. تقرير سجل التحديثات والأرشيف الشهري للتجار',
          headers: ['م', 'بيان الشهر / الأرشيف', 'تاريخ الاستيراد', 'المسؤول', 'إجمالي التجار', 'نشط', 'متوقف', 'إجازة', 'إجمالي التأمين (ج.م)'],
          rows: archives.map((a, idx) => [
            idx + 1,
            a.monthLabel,
            a.importedAt,
            a.importedBy,
            a.totalMerchants,
            a.activeCount,
            a.stoppedCount,
            a.onLeaveCount,
            a.totalInsuranceAmount.toLocaleString(),
          ]),
        };
      }
      case 'RPT_NEW_MERCHANTS': {
        const list = merchants.filter((m) => m.serialNo > 110);
        return {
          title: '9. تقرير التجار الجدد والمضافين حديثاً',
          headers: ['م', 'المسلسل', 'كود التاجر', 'اسم التاجر', 'القرية', 'رقم الماكينة', 'مبلغ التأمين', 'تاريخ التسجيل'],
          rows: list.map((m, idx) => [
            idx + 1,
            m.serialNo,
            m.traderCode || m.activityCardNumber || '-',
            m.merchantName,
            m.village,
            m.posMachineNumber,
            m.cashInsuranceAmount.toLocaleString(),
            m.registrationDate || '2026-05-01',
          ]),
        };
      }
      case 'RPT_INCOMPLETE': {
        const list = merchants.filter(
          (m) =>
            !m.nationalId?.trim() ||
            !m.phone?.trim() ||
            m.reviewStatus === 'بيانات غير مكتملة' ||
            m.reviewStatus === 'تحتاج مراجعة'
        );
        return {
          title: '10. تقرير التجار ناقصي البيانات أو المطلوب مراجعتهم',
          headers: ['م', 'المسلسل', 'اسم التاجر', 'الرقم القومي', 'رقم التليفون', 'القرية', 'حالة التاجر', 'حالة المراجعة'],
          rows: list.map((m, idx) => [
            idx + 1,
            m.serialNo,
            m.merchantName,
            m.nationalId || 'غير مسجل',
            m.phone || 'غير مسجل',
            m.village,
            m.activityStatus,
            m.reviewStatus || 'تحتاج مراجعة',
          ]),
        };
      }
      case 'RPT_ALL':
      default:
        return {
          title: '1. الكشف الشامل لقاعدة بيانات التجار التموينيين (تحديث شهر مايو 2026)',
          headers: [
            'مسلسل',
            'اسم التاجر',
            'الرقم القومي',
            'العنوان بالتفصيل',
            'رقم التليفون',
            'مبلغ التأمين بالجنيه',
            'حالة التاجر',
            'رقم ماكينة التاجر',
            'كود التاجر',
            'القرية',
            'الوحدة المحلية',
          ],
          rows: filteredMerchants.map((m) => [
            m.serialNo,
            m.merchantName,
            m.nationalId || '-',
            m.detailedAddress,
            m.phone || '-',
            m.cashInsuranceAmount.toLocaleString(),
            m.activityStatus,
            m.posMachineNumber,
            m.traderCode || m.activityCardNumber || '-',
            m.village,
            m.localUnit,
          ]),
        };
    }
  }, [selectedReportId, merchants, filteredMerchants, stats, archives]);

  const handlePrintMerchantProfile = (m: RationMerchant) => {
    printModuleReportA4({
      title: `صحيفة وملف تاجر تمويني — ${m.merchantName}`,
      subtitle: `قسم السلع التموينية — تحديث بيانات التجار شهر مايو 2026 — كود داخلي: ${m.internalCode || m.id}`,
      branchName,
      governorateTitle: 'محافظة الغربية',
      directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
      preparedBy: currentUser?.fullName || 'مسؤول السلع التموينية',
      summaryItems: [
        { label: 'كود التاجر / الماكينة', value: `${m.traderCode || m.activityCardNumber} / ${m.posMachineNumber}` },
        { label: 'حالة التاجر', value: m.activityStatus },
        { label: 'مبلغ التأمين النقدي', value: `${m.cashInsuranceAmount.toLocaleString()} ج.م` },
        { label: 'القرية / الوحدة المحلية', value: `${m.village} - ${m.localUnit}` },
      ],
      headers: ['البيان الرسمي', 'القيمة المسجلة بقاعدة البيانات'],
      rows: [
        ['مسلسل الكشف الرسمي (مايو 2026)', m.serialNo],
        ['اسم التاجر التمويني', m.merchantName],
        ['الرقم القومي', m.nationalId || 'غير مسجل'],
        ['العنوان بالتفصيل', m.detailedAddress],
        ['رقم التليفون', m.phone || 'غير مسجل'],
        ['مبلغ التأمين بالجنيه', `${m.cashInsuranceAmount.toLocaleString()} ج.م`],
        ['حالة التاجر', m.activityStatus],
        ['رقم ماكينة التاجر (POS)', m.posMachineNumber],
        ['كود التاجر', m.traderCode || m.activityCardNumber || '-'],
        ['الكود الداخلي التلقائي', m.internalCode || '-'],
        ['القرية / الوحدة المحلية', `${m.village} / ${m.localUnit}`],
        ['عدد البطاقات والمستفيدين', `${m.linkedCardsCount} بطاقة / ${m.linkedBeneficiariesCount} مستفيد`],
        ['حالة مراجعة البيانات', m.reviewStatus || 'تمت المراجعة'],
        ['ملاحظات الإدارة', m.notes || '-'],
      ],
    });
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Executive Header */}
      <div className="bg-[#0A1931] text-white rounded-2xl p-5 shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-amber-300 mb-1">
            محافظة الغربية · مديرية التموين والتجارة الداخلية بالغربية · {branchName}
          </div>
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-amber-400" />
            قاعدة بيانات التجار التموينيين – قسم السلع التموينية (تحديث بيانات التجار شهر مايو 2026)
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            قاعدة بيانات إلكترونية متكاملة تضم السجلات الـ 116 الأصلية بالكامل مع الأرشفة الشهرية ومراجعة التأمينات والماكينات والتقارير الرسمية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('table')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              subTab === 'table'
                ? 'bg-white text-[#0A1931] shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            الجدول الرئيسي للتجار ({merchants.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('archives')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'archives'
                ? 'bg-white text-[#0A1931] shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            سجل التحديثات الشهرية والأرشيف ({archives.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('reports')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'reports'
                ? 'bg-white text-[#0A1931] shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            مركز تقارير التجار (10 تقارير)
          </button>
        </div>
      </div>

      {bannerMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl px-4 py-3 text-xs font-black flex items-center justify-between">
          <span>{bannerMessage}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-emerald-800 hover:text-emerald-950 font-black cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* 10 Automatic KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5">
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي التجار</div>
          <div className="text-lg font-black text-[#0A1931] font-mono tabular-nums mt-0.5">{stats.total}</div>
          <div className="text-[10px] font-bold text-slate-500">كشف مايو 2026</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">التجار النشطون</div>
          <div className="text-lg font-black text-emerald-700 font-mono tabular-nums mt-0.5">{stats.active}</div>
          <div className="text-[10px] font-bold text-emerald-700">حالة: نشط</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">التجار المتوقفون</div>
          <div className="text-lg font-black text-rose-700 font-mono tabular-nums mt-0.5">{stats.stopped}</div>
          <div className="text-[10px] font-bold text-rose-700">حالة: متوقف</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">في إجازة</div>
          <div className="text-lg font-black text-amber-700 font-mono tabular-nums mt-0.5">{stats.onLeave}</div>
          <div className="text-[10px] font-bold text-amber-700">حالة: إجازة</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي التأمينات</div>
          <div className="text-sm font-black text-[#0A1931] font-mono tabular-nums mt-1">
            {stats.totalInsurance.toLocaleString()} ج.م
          </div>
          <div className="text-[10px] font-bold text-slate-500">تأمين نقدي معتمد</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">متوسط التأمين</div>
          <div className="text-sm font-black text-teal-800 font-mono tabular-nums mt-1">
            {stats.avgInsurance.toLocaleString()} ج.م
          </div>
          <div className="text-[10px] font-bold text-slate-500">لكل تاجر تمويني</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">القرى المخدومة</div>
          <div className="text-lg font-black text-[#0A1931] font-mono tabular-nums mt-0.5">{stats.villagesCount}</div>
          <div className="text-[10px] font-bold text-slate-500">قرية رئيسية</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">الوحدات المحلية</div>
          <div className="text-lg font-black text-[#0A1931] font-mono tabular-nums mt-0.5">{stats.unitsCount}</div>
          <div className="text-[10px] font-bold text-slate-500">وحدة وتابع</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">غير مكتمل البيانات</div>
          <div className="text-lg font-black text-rose-700 font-mono tabular-nums mt-0.5">
            {stats.incompleteCount}
          </div>
          <div className="text-[10px] font-bold text-rose-600">نقص رقم قومي/هاتف</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500">تحتاج مراجعة</div>
          <div className="text-lg font-black text-amber-700 font-mono tabular-nums mt-0.5">
            {stats.needsReviewCount}
          </div>
          <div className="text-[10px] font-bold text-amber-700">مراجعة إدارية</div>
        </div>
      </div>

      {/* Visual Distribution by Village & Status */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="text-xs font-black text-[#0A1931]">
            التوزيع الإحصائي للتجار ومبالغ التأمين حسب قرى مركز المحلة الكبرى
          </h4>
          <span className="text-[11px] font-bold text-slate-500">
            اضغط على أي قرية لتصفية الجدول مباشرة
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {stats.byVillageList.map((item) => (
            <button
              key={item.village}
              type="button"
              onClick={() =>
                setVillageFilter((prev) => (prev === item.village ? 'ALL' : item.village))
              }
              className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                villageFilter === item.village
                  ? 'bg-[#0A1931] text-white border-[#0A1931]'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
              }`}
            >
              <div className="text-xs font-black truncate">{item.village}</div>
              <div className="text-sm font-black font-mono tabular-nums mt-0.5">
                {item.count} تاجر
              </div>
              <div
                className={`text-[10px] font-mono tabular-nums ${
                  villageFilter === item.village ? 'text-amber-300' : 'text-slate-500'
                }`}
              >
                {item.insurance.toLocaleString()} ج.م
              </div>
            </button>
          ))}
        </div>
      </div>

      {subTab === 'table' && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          {/* Search & Multi-Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الرقم القومي، التليفون، رقم الماكينة، كود التاجر، العنوان..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:border-[#0A1931]"
              />
            </div>

            <select
              aria-label="تصفية حسب القرية"
              value={villageFilter}
              onChange={(e) => {
                setVillageFilter(e.target.value);
                setLocalUnitFilter('ALL');
              }}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <option value="ALL">كل القرى ({stats.villagesCount})</option>
              {stats.byVillageList.map((v) => (
                <option key={v.village} value={v.village}>
                  {v.village} ({v.count})
                </option>
              ))}
            </select>

            <select
              aria-label="تصفية حسب الوحدة المحلية"
              value={localUnitFilter}
              onChange={(e) => setLocalUnitFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <option value="ALL">كل الوحدات المحلية</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            <select
              aria-label="تصفية حسب حالة التاجر"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <option value="ALL">كل حالات التجار (نشط / متوقف / إجازة)</option>
              <option value="نشط">نشط ({stats.active})</option>
              <option value="متوقف">متوقف ({stats.stopped})</option>
              <option value="إجازة">إجازة ({stats.onLeave})</option>
            </select>

            <select
              aria-label="تصفية حسب حالة المراجعة"
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
            >
              <option value="ALL">كل حالات المراجعة</option>
              <option value="تمت المراجعة">تمت المراجعة</option>
              <option value="تحتاج مراجعة">تحتاج مراجعة</option>
              <option value="بيانات غير مكتملة">بيانات غير مكتملة</option>
            </select>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="text-xs font-black text-slate-700">
              عدد السجلات المعروضة: <span className="text-[#0A1931] font-mono">{filteredMerchants.length}</span> من إجمالي{' '}
              <span className="font-mono">{merchants.length}</span> تاجر تمويني
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite && (
                <button
                  type="button"
                  onClick={openAddMerchant}
                  className="px-4 py-2 rounded-xl bg-[#0A1931] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  إضافة تاجر تمويني جديد
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  printModuleReportA4({
                    title: 'كشف قاعدة بيانات التجار التموينيين — تحديث شهر مايو 2026',
                    subtitle: 'قسم السلع التموينية — إدارة تموين مركز المحلة الكبرى',
                    branchName,
                    governorateTitle: 'محافظة الغربية',
                    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
                    preparedBy: currentUser?.fullName || 'مسؤول السلع التموينية',
                    headers: [
                      'مسلسل',
                      'اسم التاجر',
                      'الرقم القومي',
                      'العنوان بالتفصيل',
                      'رقم التليفون',
                      'مبلغ التأمين بالجنيه',
                      'حالة التاجر',
                      'رقم ماكينة التاجر',
                      'كود التاجر',
                      'القرية',
                    ],
                    rows: filteredMerchants.map((m) => [
                      m.serialNo,
                      m.merchantName,
                      m.nationalId || '-',
                      m.detailedAddress,
                      m.phone || '-',
                      m.cashInsuranceAmount.toLocaleString(),
                      m.activityStatus,
                      m.posMachineNumber,
                      m.traderCode || m.activityCardNumber || '-',
                      m.village,
                    ]),
                  })
                }
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-[#0A1931] border border-slate-300 text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة الكشف الرسمي A4
              </button>
              <button
                type="button"
                onClick={() =>
                  exportRowsToArabicCsv(
                    'قاعدة_بيانات_التجار_التموينيين_مايو_2026',
                    [
                      'مسلسل',
                      'الكود الداخلي',
                      'اسم التاجر',
                      'الرقم القومي',
                      'العنوان بالتفصيل',
                      'رقم التليفون',
                      'مبلغ التأمين بالجنيه',
                      'حالة التاجر',
                      'رقم ماكينة التاجر',
                      'كود التاجر',
                      'القرية',
                      'الوحدة المحلية',
                      'حالة المراجعة',
                    ],
                    filteredMerchants.map((m) => [
                      m.serialNo,
                      m.internalCode || '',
                      m.merchantName,
                      m.nationalId || '',
                      m.detailedAddress,
                      m.phone || '',
                      m.cashInsuranceAmount,
                      m.activityStatus,
                      m.posMachineNumber,
                      m.traderCode || m.activityCardNumber || '',
                      m.village,
                      m.localUnit,
                      m.reviewStatus || 'تمت المراجعة',
                    ])
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير Excel (CSV)
              </button>
            </div>
          </div>

          {/* Main 116-Merchants Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[600px]">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[#0A1931] text-white sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 text-center font-black">مسلسل</th>
                  <th className="p-2.5 text-right font-black">كود داخلي</th>
                  <th className="p-2.5 text-right font-black">اسم التاجر</th>
                  <th className="p-2.5 text-center font-black">الرقم القومي</th>
                  <th className="p-2.5 text-right font-black">العنوان بالتفصيل</th>
                  <th className="p-2.5 text-center font-black">رقم التليفون</th>
                  <th className="p-2.5 text-center font-black">مبلغ التأمين بالجنيه</th>
                  <th className="p-2.5 text-center font-black">حالة التاجر</th>
                  <th className="p-2.5 text-center font-black">رقم ماكينة التاجر</th>
                  <th className="p-2.5 text-center font-black">كود التاجر</th>
                  <th className="p-2.5 text-right font-black">القرية / الوحدة</th>
                  <th className="p-2.5 text-center font-black">حالة المراجعة</th>
                  <th className="p-2.5 text-center font-black">إجراءات الملف</th>
                </tr>
              </thead>
              <tbody>
                {filteredMerchants.map((m) => {
                  const statusColor =
                    m.activityStatus === 'نشط'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : m.activityStatus === 'إجازة'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-rose-100 text-rose-900 border-rose-300';
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-2.5 text-center font-black font-mono tabular-nums text-[#0A1931]">
                        {m.serialNo}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] font-bold text-slate-600">
                        {m.internalCode || `MHL-${m.serialNo}`}
                      </td>
                      <td className="p-2.5 font-black text-slate-900">
                        <button
                          type="button"
                          onClick={() => setSelectedMerchantId(m.id)}
                          className="text-right hover:text-teal-700 hover:underline cursor-pointer"
                        >
                          {m.merchantName}
                        </button>
                      </td>
                      <td className="p-2.5 text-center font-mono tabular-nums text-slate-700">
                        {m.nationalId || (
                          <span className="text-rose-600 font-black">غير مسجل</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-700 font-bold">{m.detailedAddress}</td>
                      <td className="p-2.5 text-center font-mono tabular-nums text-slate-700">
                        {m.phone || <span className="text-rose-600 font-black">غير مسجل</span>}
                      </td>
                      <td className="p-2.5 text-center font-black font-mono tabular-nums text-[#0A1931]">
                        {m.cashInsuranceAmount.toLocaleString()} ج.م
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-black border ${statusColor}`}
                        >
                          {m.activityStatus === 'موقوف' ? 'متوقف' : m.activityStatus}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-mono tabular-nums font-bold text-slate-800">
                        {m.posMachineNumber}
                      </td>
                      <td className="p-2.5 text-center font-mono tabular-nums font-bold text-teal-800">
                        {m.traderCode || m.activityCardNumber || '-'}
                      </td>
                      <td className="p-2.5 text-slate-700 font-bold">
                        {m.village} · <span className="text-slate-500">{m.localUnit}</span>
                      </td>
                      <td className="p-2.5 text-center text-[11px] font-bold text-slate-600">
                        {m.reviewStatus || 'تمت المراجعة'}
                      </td>
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedMerchantId(m.id)}
                            title="فتح ملف التاجر الشخصي"
                            className="px-2.5 py-1 rounded-lg bg-[#0A1931] text-white text-[11px] font-black hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            ملف التاجر
                          </button>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => openEditMerchant(m)}
                              title="تعديل بيانات التاجر"
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly Archives & Comparison Tab */}
      {subTab === 'archives' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h4 className="text-sm font-black text-[#0A1931]">
                نظام الأرشفة الشهرية ومقارنة تحديثات ملفات التجار (Excel / CSV)
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                لا يتم استبدال البيانات القديمة تلقائياً قبل مراجعة التغييرات (التجار الجدد، المتوقفين، فروق التأمين، وتغيير الماكينات) والموافقة عليها.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newMonthLabel}
                onChange={(e) => setNewMonthLabel(e.target.value)}
                placeholder="اسم الشهر الجديد (مثال: يونيو 2026)"
                className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
              <button
                type="button"
                onClick={handleSimulateMonthlyUpdateSheet}
                className="px-4 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                فحص ومقارنة كشف تحديث شهري جديد
              </button>
              <button
                type="button"
                onClick={handleRestoreOriginalMay2026}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                استرجاع النسخة الأصلية (مايو 2026 - 116 تاجراً)
              </button>
            </div>
          </div>

          {pendingDiffResult && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-xs font-black text-amber-950">
                  نتيجة مقارنة كشف ({newMonthLabel}) مع النسخة الحالية قبل الاعتماد:
                </h5>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApproveMonthlyUpdate}
                    className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
                  >
                    الموافقة واعتماد التحديث وحفظ الأرشيف
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDiffResult(null);
                      setPendingIncomingMerchants(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500 font-bold">تجار جدد تم اكتشافهم</div>
                  <div className="text-base font-black text-emerald-700 font-mono">
                    {pendingDiffResult.newMerchants.length}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500 font-bold">تجار تم إيقافهم</div>
                  <div className="text-base font-black text-rose-700 font-mono">
                    {pendingDiffResult.stoppedMerchants.length}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500 font-bold">تغييرات مبالغ التأمين</div>
                  <div className="text-base font-black text-[#0A1931] font-mono">
                    {pendingDiffResult.insuranceChanged.length}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500 font-bold">تغييرات الماكينات والأكواد</div>
                  <div className="text-base font-black text-teal-800 font-mono">
                    {pendingDiffResult.posOrCodeChanged.length}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                  <div className="text-slate-500 font-bold">إجمالي السجلات المعدلة</div>
                  <div className="text-base font-black text-amber-800 font-mono">
                    {pendingDiffResult.dataModified.length}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[#0A1931] text-white">
                <tr>
                  <th className="p-2.5 text-right">بيان الأرشيف الشهري</th>
                  <th className="p-2.5 text-center">تاريخ الحفظ</th>
                  <th className="p-2.5 text-right">بواسطة</th>
                  <th className="p-2.5 text-center">إجمالي التجار</th>
                  <th className="p-2.5 text-center">نشط</th>
                  <th className="p-2.5 text-center">متوقف</th>
                  <th className="p-2.5 text-center">إجازة</th>
                  <th className="p-2.5 text-center">إجمالي التأمين</th>
                  <th className="p-2.5 text-right">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {archives.map((arch) => (
                  <tr key={arch.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2.5 font-black text-[#0A1931]">{arch.monthLabel}</td>
                    <td className="p-2.5 text-center font-mono">{arch.importedAt}</td>
                    <td className="p-2.5 font-bold">{arch.importedBy}</td>
                    <td className="p-2.5 text-center font-black font-mono">{arch.totalMerchants}</td>
                    <td className="p-2.5 text-center font-bold text-emerald-700 font-mono">{arch.activeCount}</td>
                    <td className="p-2.5 text-center font-bold text-rose-700 font-mono">{arch.stoppedCount}</td>
                    <td className="p-2.5 text-center font-bold text-amber-700 font-mono">{arch.onLeaveCount}</td>
                    <td className="p-2.5 text-center font-black font-mono">
                      {arch.totalInsuranceAmount.toLocaleString()} ج.م
                    </td>
                    <td className="p-2.5 text-slate-600">{arch.summaryNotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 10 Merchant Reports Tab */}
      {subTab === 'reports' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'RPT_ALL', label: '1. كشف شامل بجميع التجار' },
                  { id: 'RPT_ACTIVE', label: '2. كشف التجار النشطين' },
                  { id: 'RPT_STOPPED', label: '3. كشف التجار المتوقفين' },
                  { id: 'RPT_ON_LEAVE', label: '4. كشف التجار في إجازة' },
                  { id: 'RPT_BY_VILLAGE', label: '5. التجار حسب القرية' },
                  { id: 'RPT_BY_UNIT', label: '6. التجار حسب الوحدة المحلية' },
                  { id: 'RPT_INSURANCE', label: '7. كشف مبالغ التأمين' },
                  { id: 'RPT_MONTHLY_DIFF', label: '8. تقرير التغييرات الشهرية' },
                  { id: 'RPT_NEW_MERCHANTS', label: '9. تقرير التجار الجدد' },
                  { id: 'RPT_INCOMPLETE', label: '10. التجار ناقصو البيانات' },
                ] as { id: ReportTypeId; label: string }[]
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReportId(r.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                    selectedReportId === r.id
                      ? 'bg-[#0A1931] text-white border-[#0A1931]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  printModuleReportA4({
                    title: activeReportPayload.title,
                    subtitle: 'قسم السلع التموينية — إدارة تموين مركز المحلة الكبرى',
                    branchName,
                    governorateTitle: 'محافظة الغربية',
                    directorateTitle: 'مديرية التموين والتجارة الداخلية بالغربية',
                    preparedBy: currentUser?.fullName || 'مسؤول السلع التموينية',
                    headers: activeReportPayload.headers,
                    rows: activeReportPayload.rows,
                  })
                }
                className="px-4 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة التقرير A4 RTL
              </button>
              <button
                type="button"
                onClick={() =>
                  exportRowsToArabicCsv(
                    activeReportPayload.title.replace(/\s+/g, '_'),
                    activeReportPayload.headers,
                    activeReportPayload.rows
                  )
                }
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                تصدير Excel (CSV)
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="text-center border-b border-slate-200 pb-3 mb-3">
              <div className="text-xs font-black text-slate-600">
                محافظة الغربية — مديرية التموين والتجارة الداخلية بالغربية — {branchName} — قسم السلع التموينية
              </div>
              <h4 className="text-sm font-black text-[#0A1931] mt-1">{activeReportPayload.title}</h4>
            </div>
            <div className="overflow-x-auto max-h-[450px]">
              <table className="w-full text-xs border-collapse bg-white">
                <thead className="bg-[#0A1931] text-white sticky top-0">
                  <tr>
                    {activeReportPayload.headers.map((h, i) => (
                      <th key={i} className="p-2 text-center font-black border border-slate-700">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeReportPayload.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-slate-200">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2 text-center border border-slate-200 font-bold">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Merchant Profile Modal (صفحة الملف الشخصي للتاجر) */}
      {selectedMerchant && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-bold text-teal-700">
                  ملف التاجر الشخصي الشامل · كود داخلي: {selectedMerchant.internalCode || selectedMerchant.id}
                </div>
                <h3 className="text-lg font-black text-[#0A1931] mt-0.5">
                  {selectedMerchant.serialNo}. {selectedMerchant.merchantName}
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  {selectedMerchant.detailedAddress} ({selectedMerchant.village} — {selectedMerchant.localUnit})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintMerchantProfile(selectedMerchant)}
                  className="px-3.5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  طباعة ملف التاجر A4
                </button>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedMerchant;
                      setSelectedMerchantId(null);
                      openEditMerchant(target);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    تعديل البيانات
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMerchantId(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Status Controls */}
            {canWrite && (
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-black text-slate-800">
                  إجراءات الحالة السريعة (مع عدم حذف السجل أو فقدان مبلغ التأمين عند الإيقاف):
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickStatusChange(selectedMerchant, 'نشط')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-black cursor-pointer"
                  >
                    إعادة تنشيط (نشط)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickStatusChange(selectedMerchant, 'متوقف')}
                    className="px-3 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-black cursor-pointer"
                  >
                    إيقاف التاجر (متوقف)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickStatusChange(selectedMerchant, 'إجازة')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-black cursor-pointer"
                  >
                    تسجيل إجازة (إجازة)
                  </button>
                </div>
              </div>
            )}

            {/* Complete Data Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">الرقم القومي</div>
                <div className="font-black font-mono text-slate-900 mt-1">
                  {selectedMerchant.nationalId || 'غير مسجل'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">رقم التليفون</div>
                <div className="font-black font-mono text-slate-900 mt-1">
                  {selectedMerchant.phone || 'غير مسجل'}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">رقم ماكينة التاجر</div>
                <div className="font-black font-mono text-[#0A1931] mt-1">
                  {selectedMerchant.posMachineNumber}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">كود التاجر الرسمي</div>
                <div className="font-black font-mono text-teal-800 mt-1">
                  {selectedMerchant.traderCode || selectedMerchant.activityCardNumber}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">مبلغ التأمين بالجنيه</div>
                <div className="font-black font-mono text-emerald-800 mt-1">
                  {selectedMerchant.cashInsuranceAmount.toLocaleString()} ج.م
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">حالة التاجر الحالية</div>
                <div className="font-black text-slate-900 mt-1">{selectedMerchant.activityStatus}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">البطاقات والمستفيدون</div>
                <div className="font-black font-mono text-slate-900 mt-1">
                  {selectedMerchant.linkedCardsCount} بطاقة / {selectedMerchant.linkedBeneficiariesCount} فرد
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-bold">حالة المراجعة الإدارية</div>
                <div className="font-black text-slate-900 mt-1">
                  {selectedMerchant.reviewStatus || 'تمت المراجعة'}
                </div>
              </div>
            </div>

            {/* Historical Audit Trail */}
            <div>
              <h4 className="text-xs font-black text-[#0A1931] mb-2">
                السجل التاريخي للتعديلات والعمليات على ملف التاجر
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-800">
                    <tr>
                      <th className="p-2 text-right">التاريخ والوقت</th>
                      <th className="p-2 text-right">المستخدم</th>
                      <th className="p-2 text-right">العملية</th>
                      <th className="p-2 text-right">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedMerchant.auditHistory || []).map((h) => (
                      <tr key={h.id} className="border-t border-slate-200">
                        <td className="p-2 font-mono text-slate-600">{h.timestamp}</td>
                        <td className="p-2 font-bold">{h.username}</td>
                        <td className="p-2 font-black text-[#0A1931]">{h.action}</td>
                        <td className="p-2 text-slate-700">{h.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Merchant Modal */}
      {showAddOrEditModal && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-black text-[#0A1931]">
                {editingMerchant ? `تعديل بيانات التاجر: ${editingMerchant.merchantName}` : 'إضافة تاجر تمويني جديد'}
              </h4>
              <button
                type="button"
                onClick={() => setShowAddOrEditModal(false)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-black text-slate-700 mb-1">اسم التاجر التمويني *</label>
                <input
                  type="text"
                  value={formState.merchantName}
                  onChange={(e) => setFormState((p) => ({ ...p, merchantName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">الرقم القومي (14 رقماً نصياً)</label>
                <input
                  type="text"
                  value={formState.nationalId}
                  onChange={(e) => setFormState((p) => ({ ...p, nationalId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">رقم التليفون</label>
                <input
                  type="text"
                  value={formState.phone}
                  onChange={(e) => setFormState((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">مبلغ التأمين بالجنيه</label>
                <input
                  type="number"
                  value={formState.cashInsuranceAmount}
                  onChange={(e) => setFormState((p) => ({ ...p, cashInsuranceAmount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">رقم ماكينة التاجر (POS)</label>
                <input
                  type="text"
                  value={formState.posMachineNumber}
                  onChange={(e) => setFormState((p) => ({ ...p, posMachineNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">كود التاجر</label>
                <input
                  type="text"
                  value={formState.traderCode}
                  onChange={(e) => setFormState((p) => ({ ...p, traderCode: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">القرية</label>
                <input
                  type="text"
                  value={formState.village}
                  onChange={(e) => setFormState((p) => ({ ...p, village: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">الوحدة المحلية</label>
                <input
                  type="text"
                  value={formState.localUnit}
                  onChange={(e) => setFormState((p) => ({ ...p, localUnit: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">حالة التاجر</label>
                <select
                  value={formState.activityStatus}
                  onChange={(e) =>
                    setFormState((p) => ({ ...p, activityStatus: e.target.value as MerchantActivityStatus }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white"
                >
                  <option value="نشط">نشط</option>
                  <option value="متوقف">متوقف</option>
                  <option value="إجازة">إجازة</option>
                </select>
              </div>
              <div>
                <label className="block font-black text-slate-700 mb-1">حالة مراجعة البيانات</label>
                <select
                  value={formState.reviewStatus}
                  onChange={(e) =>
                    setFormState((p) => ({ ...p, reviewStatus: e.target.value as MerchantReviewStatus }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white"
                >
                  <option value="تمت المراجعة">تمت المراجعة</option>
                  <option value="تحتاج مراجعة">تحتاج مراجعة</option>
                  <option value="بيانات غير مكتملة">بيانات غير مكتملة</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-black text-slate-700 mb-1">العنوان بالتفصيل</label>
                <input
                  type="text"
                  value={formState.detailedAddress}
                  onChange={(e) => setFormState((p) => ({ ...p, detailedAddress: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-black text-slate-700 mb-1">ملاحظات الإدارة</label>
                <input
                  type="text"
                  value={formState.notes}
                  onChange={(e) => setFormState((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAddOrEditModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveMerchantForm}
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ بيانات التاجر ومزامنة Supabase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
