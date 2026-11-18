import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import DOMPurify from 'dompurify';
import {
  Building2,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Flame,
  Fuel,
  MapPin,
  Search,
  Plus,
  Edit3,
  Trash2,
  Printer,
  Download,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Scale,
  Users,
  TrendingUp,
  BarChart3,
  Layers,
  Bell,
  History,
  Store,
  Award,
  Sliders,
  ArrowUpDown,
  Lock,
  Sparkles,
} from 'lucide-react';
import type { AppUser, Bakery, VillageHierarchy } from '../../types';
import type {
  InternalTradeState,
  InternalTradeEstablishment,
  InternalTradeCampaign,
  InternalTradeViolationReport,
  InternalTradeSeizureRecord,
  InternalTradeComplaintRecord,
  InternalTradeMarketPriceRecord,
  LpgVillageCirculationRecord,
  PetroleumVillageCirculationRecord,
  FuelStationControlRecord,
  FuelStationDailyMovement,
  LpgDepotControlRecord,
  LpgDistributorRecord,
  UnifiedEstablishmentType,
  EstablishmentActivityStatus,
  ModuleAuditLog,
} from '../../types/modules';
import {
  calculateCampaignViolationRate,
  calculateCampaignComplianceRate,
  calculateCampaignReportRate,
  calculateLpgVillageMetrics,
  calculatePetroleumVillageMetrics,
  aggregateVillageFuelBreakdown,
} from '../../utils/internalTradeMathEngine';
import { createInitialInternalTradeState } from '../../data/internalTradeInitialData';
import { resolveModuleCrudPermissions } from '../../utils/moduleCrudHelpers';
import { isSuperAdmin } from '../../utils/departmentRbac';
import {
  groupRecordsByLocalUnit,
  normalizeLocalUnitLabel,
  roundMetric2,
} from '../../utils/tableGroupingHelpers';
import {
  buildInternalTradeDepartmentAlerts,
  canDeleteDepartmentAlert,
  canViewDepartmentAlerts,
  countUnreadDepartmentAlerts,
} from '../../utils/moduleAlertsEngine';
import {
  AuditLogAdminToolbar,
  DepartmentAlertsPanel,
  LocalUnitSubtotalRow,
  ModuleDeleteConfirmModal,
  ModuleRecordProfileModal,
  ModuleRowActions,
  VillageGrandTotalRow,
  type RecordProfileSection,
} from './ModuleCrudShared';

export type InternalTradeSubView =
  | 'dashboard'
  | 'establishments'
  | 'activities-licenses'
  | 'map'
  | 'campaigns'
  | 'violations'
  | 'seizures'
  | 'complaints'
  | 'prices'
  | 'lpg-circulation'
  | 'petroleum-circulation'
  | 'fuel-stations'
  | 'lpg-depots'
  | 'village-comparison'
  | 'alerts'
  | 'reports'
  | 'audit';

interface InternalTradeSuiteProps {
  state?: InternalTradeState;
  branchId: string;
  branchName: string;
  villages: VillageHierarchy[];
  bakeries: Bakery[];
  currentUser?: AppUser | null;
  initialSubView?: InternalTradeSubView;
  onChangeState: (next: InternalTradeState, actionSummary?: string) => void;
}

const ESTABLISHMENT_TYPES: UnifiedEstablishmentType[] = [
  'محل تجاري',
  'سوبر ماركت',
  'مخزن تجاري',
  'محطة وقود',
  'مستودع بوتاجاز',
  'موزع أسطوانات بوتاجاز',
  'مخبز بلدي',
  'مخبز سياحي',
  'مخبز إفرنجي',
  'منشأة أخرى',
];

const ESTABLISHMENT_STATUSES: EstablishmentActivityStatus[] = [
  'نشط',
  'متوقف',
  'مغلق',
  'تحت الفحص',
];

const FUEL_TYPES = ['بنزين 80', 'بنزين 92', 'بنزين 95', 'السولار', 'الكيروسين'];

export const InternalTradeSuite: React.FC<InternalTradeSuiteProps> = ({
  state: propState,
  branchId,
  branchName,
  villages,
  bakeries,
  currentUser,
  initialSubView = 'dashboard',
  onChangeState,
}) => {
  const state = useMemo(
    () => propState || createInitialInternalTradeState(branchId, branchName, villages),
    [propState, branchId, branchName, villages]
  );

  const [subView, setSubView] = useState<InternalTradeSubView>(initialSubView);
  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterVillage, setFilterVillage] = useState<string>('ALL');
  const [filterLocalUnit, setFilterLocalUnit] = useState<string>('ALL');
  const [filterEstType, setFilterEstType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [includeLinkedBakeries, setIncludeLinkedBakeries] = useState<boolean>(true);
  const [estPage, setEstPage] = useState<number>(1);
  const [estPageSize, setEstPageSize] = useState<number>(25);

  useEffect(() => {
    setEstPage(1);
  }, [deferredSearchQuery, filterVillage, filterLocalUnit, filterEstType, filterStatus, includeLinkedBakeries]);

  // Historical Dossier Modal state
  const [selectedDossierEst, setSelectedDossierEst] = useState<InternalTradeEstablishment | null>(null);
  const [dossierActiveTab, setDossierActiveTab] = useState<'overview' | 'timeline' | 'violations' | 'print'>('timeline');

  // Unified Magic Eye Read-Only Modal & Admin Delete Confirm Modal
  const [profileModal, setProfileModal] = useState<{
    title: string;
    subtitle?: string;
    badgeText?: string;
    sections: RecordProfileSection[];
    updatedAt?: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    title: string;
    summary: { label: string; value: string | number }[];
    onConfirm: () => void;
  } | null>(null);

  // Add/Edit Modals
  const [isEstModalOpen, setIsEstModalOpen] = useState(false);
  const [editingEst, setEditingEst] = useState<InternalTradeEstablishment | null>(null);

  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<InternalTradeCampaign | null>(null);

  const [isViolationModalOpen, setIsViolationModalOpen] = useState(false);
  const [editingViolation, setEditingViolation] = useState<InternalTradeViolationReport | null>(null);

  const [isSeizureModalOpen, setIsSeizureModalOpen] = useState(false);
  const [editingSeizure, setEditingSeizure] = useState<InternalTradeSeizureRecord | null>(null);

  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [editingComplaint, setEditingComplaint] = useState<InternalTradeComplaintRecord | null>(null);

  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<InternalTradeMarketPriceRecord | null>(null);

  const [isLpgQuotaModalOpen, setIsLpgQuotaModalOpen] = useState(false);
  const [editingLpgRecord, setEditingLpgRecord] = useState<LpgVillageCirculationRecord | null>(null);

  const [isPetroQuotaModalOpen, setIsPetroQuotaModalOpen] = useState(false);
  const [editingPetroRecord, setEditingPetroRecord] = useState<PetroleumVillageCirculationRecord | null>(null);

  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isFuelStationModalOpen, setIsFuelStationModalOpen] = useState(false);
  const [editingFuelStation, setEditingFuelStation] = useState<FuelStationControlRecord | null>(null);

  const [isLpgDepotModalOpen, setIsLpgDepotModalOpen] = useState(false);
  const [editingLpgDepot, setEditingLpgDepot] = useState<LpgDepotControlRecord | null>(null);

  const [isLpgDistModalOpen, setIsLpgDistModalOpen] = useState(false);
  const [editingLpgDist, setEditingLpgDist] = useState<LpgDistributorRecord | null>(null);

  // Village comparison selection
  const [compareVillagesSelected, setCompareVillagesSelected] = useState<string[]>(() =>
    state.lpgVillageCirculation.slice(0, 4).map((v) => v.village)
  );

  // Official Report selection
  const [selectedReportId, setSelectedReportId] = useState<string>('rep-establishments');

  const permissions = useMemo(
    () => resolveModuleCrudPermissions(currentUser ?? null, false, 'internal_trade'),
    [currentUser]
  );
  const isAdmin = useMemo(() => isSuperAdmin(currentUser), [currentUser]);
  const canSeeAlerts = useMemo(
    () => canViewDepartmentAlerts(currentUser, 'internal_trade'),
    [currentUser]
  );

  const commitInternalTradeState = (
    nextSlice: Partial<InternalTradeState>,
    actionSummary: string,
    audit?: {
      actionType: ModuleAuditLog['actionType'];
      entityName: string;
      entityId: string;
      beforeSummary?: string;
      afterSummary?: string;
    }
  ) => {
    const baseLogs = state.auditLogs || [];
    const nextLogs = audit
      ? [
          {
            id: `it-aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            branchId,
            module: 'internal_trade' as const,
            timestamp: new Date().toISOString(),
            username: currentUser?.username || 'system',
            userFullName: currentUser?.fullName || currentUser?.username || 'مستخدم النظام',
            actionType: audit.actionType,
            entityName: audit.entityName,
            entityId: audit.entityId,
            beforeSummary: audit.beforeSummary,
            afterSummary: audit.afterSummary,
          },
          ...baseLogs,
        ]
      : baseLogs;

    onChangeState(
      {
        ...state,
        ...nextSlice,
        auditLogs: nextLogs,
      },
      actionSummary
    );
  };

  const departmentAlerts = useMemo(
    () => buildInternalTradeDepartmentAlerts(state),
    [state]
  );
  const unreadAlertsCount = useMemo(
    () => countUnreadDepartmentAlerts(departmentAlerts, state.readAlertIds || []),
    [departmentAlerts, state.readAlertIds]
  );

  const uniqueVillages = useMemo(() => {
    const set = new Set<string>();
    villages.forEach((v) => {
      if (v.village) set.add(v.village);
      (v.localUnits || []).forEach((u: string) => set.add(u));
    });
    state.establishments.forEach((e) => e.village && set.add(e.village));
    state.lpgVillageCirculation.forEach((l) => l.village && set.add(l.village));
    return Array.from(set);
  }, [villages, state.establishments, state.lpgVillageCirculation]);

  const uniqueLocalUnits = useMemo(() => {
    const set = new Set<string>();
    villages.forEach((v) => {
      if (v.village) set.add(`الوحدة المحلية بـ${v.village}`);
      (v.localUnits || []).forEach((u: string) => set.add(u));
    });
    state.establishments.forEach((e) => e.localUnit && set.add(e.localUnit));
    state.lpgVillageCirculation.forEach((l) => l.localUnit && set.add(l.localUnit));
    return Array.from(set);
  }, [villages, state.establishments, state.lpgVillageCirculation]);

  // Convert existing Bakeries into read-only Unified Establishment rows so the Unified Control Center integrates them without duplicating or deleting them
  const mappedBakeriesAsEstablishments: InternalTradeEstablishment[] = useMemo(() => {
    if (!includeLinkedBakeries) return [];
    return bakeries.map((b, idx) => ({
      id: `linked-bakery-${b.id}`,
      establishmentCode: `BAK-${b.machineNumber || idx + 100}`,
      linkedBakeryId: b.id,
      ownerName: b.bakeryOwnerName,
      establishmentName: `مخبز ${b.bakeryOwnerName} (${b.bakeryCategory || 'بلدي'})`,
      nationalId: b.nationalId || '27801011600000',
      phone: b.phone || '01000000000',
      governorate: 'الغربية',
      center: 'المحلة الكبرى',
      village: b.village || 'بلقينا',
      localUnit: b.localUnit || 'الوحدة المحلية ببلقينا',
      detailedAddress: `${b.village} - ماكينة رقم ${b.machineNumber}`,
      establishmentType:
        b.bakeryCategory?.includes('سياحي')
          ? 'مخبز سياحي'
          : b.bakeryCategory?.includes('فينو') || b.bakeryCategory?.includes('إفرنجي')
          ? 'مخبز إفرنجي'
          : 'مخبز بلدي',
      activityType: b.breadType || 'إنتاج خبز بلدي مدعم',
      activityCategory: 'المخابز والسلع الاستراتيجية',
      commercialRegNumber: b.commercialRegNumber || `س.ت-${b.machineNumber}`,
      commercialRegIssueDate: '2021-01-01',
      commercialRegExpiryDate: b.commercialRegDate || '2027-01-01',
      taxCardNumber: b.taxCardNumber || `ب.ض-${b.machineNumber}`,
      taxCardIssueDate: '2021-01-01',
      licenseNumber: b.bakeryLicenseNumber || `ترخيص-${b.machineNumber}`,
      licenseIssuingEntity: 'مديرية التموين بالغربية',
      licenseIssueDate: '2020-01-01',
      licenseExpiryDate: b.bakeryLicenseDate || '2027-06-30',
      activityStatus:
        b.activityStatus?.includes('توقف') || b.activityStatus?.includes('موقوف')
          ? 'متوقف'
          : b.activityStatus?.includes('غلق')
          ? 'مغلق'
          : 'نشط',
      activityStartDate: '2018-01-01',
      lat: 30.97 + ((idx % 10) - 5) * 0.014,
      lng: 31.16 + ((Math.floor(idx / 10) % 10) - 5) * 0.014,
      notes: `مخبز مربوط تلقائياً من قاعدة بيانات المخابز — الحصة اليومية: ${b.actualQuota} شيكارة`,
      attachments: ['رخصة تشغيل المخبز.pdf', 'شهادة السجل التجاري.pdf'],
    }));
  }, [bakeries, includeLinkedBakeries]);

  const allUnifiedEstablishments = useMemo(() => {
    return [...state.establishments, ...mappedBakeriesAsEstablishments];
  }, [state.establishments, mappedBakeriesAsEstablishments]);

  // Indexed Violation Lookups (O(1) per establishment — eliminates search/render freeze)
  const { violationCountByCode, violationSearchTextByCode } = useMemo(() => {
    const countMap = new Map<string, number>();
    const reportMap = new Map<string, string>();
    for (const v of state.violations) {
      countMap.set(v.establishmentCode, (countMap.get(v.establishmentCode) || 0) + 1);
      const prev = reportMap.get(v.establishmentCode) || '';
      reportMap.set(v.establishmentCode, `${prev} ${String(v.reportNumber || '').toLowerCase()}`);
    }
    return { violationCountByCode: countMap, violationSearchTextByCode: reportMap };
  }, [state.violations]);

  const indexedEstablishments = useMemo(() => {
    return allUnifiedEstablishments.map((e) => ({
      est: e,
      searchBlob: [
        e.establishmentCode,
        e.ownerName,
        e.establishmentName,
        e.nationalId,
        e.phone,
        e.commercialRegNumber,
        e.taxCardNumber,
        e.licenseNumber,
        e.village,
        e.localUnit,
        e.activityType,
        violationSearchTextByCode.get(e.establishmentCode) || '',
      ]
        .join(' ')
        .toLowerCase(),
    }));
  }, [allUnifiedEstablishments, violationSearchTextByCode]);

  const filteredEstablishments = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const out: InternalTradeEstablishment[] = [];
    for (const item of indexedEstablishments) {
      const e = item.est;
      if (filterVillage !== 'ALL' && e.village !== filterVillage) continue;
      if (filterLocalUnit !== 'ALL' && e.localUnit !== filterLocalUnit) continue;
      if (filterEstType !== 'ALL' && e.establishmentType !== filterEstType) continue;
      if (filterStatus !== 'ALL' && e.activityStatus !== filterStatus) continue;
      if (q && !item.searchBlob.includes(q)) continue;
      out.push(e);
    }
    return out;
  }, [
    indexedEstablishments,
    deferredSearchQuery,
    filterVillage,
    filterLocalUnit,
    filterEstType,
    filterStatus,
  ]);

  const estTotalPages = Math.max(1, Math.ceil(filteredEstablishments.length / estPageSize));
  const safeEstPage = Math.min(estPage, estTotalPages);
  const paginatedEstablishments = useMemo(() => {
    const start = (safeEstPage - 1) * estPageSize;
    return filteredEstablishments.slice(start, start + estPageSize);
  }, [filteredEstablishments, safeEstPage, estPageSize]);

  const groupedEstablishmentsPage = useMemo(
    () =>
      groupRecordsByLocalUnit({
        rows: paginatedEstablishments,
        getLocalUnit: (e) => e.localUnit || e.village,
        numericFields: [
          {
            key: 'violationsCount',
            getValue: (e) => violationCountByCode.get(e.establishmentCode) || 0,
          },
          {
            key: 'activeCount',
            getValue: (e) => (e.activityStatus === 'نشط' ? 1 : 0),
          },
        ],
        sortUnitsAlphabetically: true,
      }),
    [paginatedEstablishments, violationCountByCode]
  );

  const groupedAllEstablishmentsGrand = useMemo(
    () =>
      groupRecordsByLocalUnit({
        rows: filteredEstablishments,
        getLocalUnit: (e) => e.localUnit || e.village,
        numericFields: [
          {
            key: 'violationsCount',
            getValue: (e) => violationCountByCode.get(e.establishmentCode) || 0,
          },
          {
            key: 'activeCount',
            getValue: (e) => (e.activityStatus === 'نشط' ? 1 : 0),
          },
        ],
      }),
    [filteredEstablishments, violationCountByCode]
  );

  // Compute LPG Metrics for all villages
  const lpgCalculatedRows = useMemo(() => {
    return state.lpgVillageCirculation.map((rec) => ({
      record: rec,
      metrics: calculateLpgVillageMetrics(rec),
    }));
  }, [state.lpgVillageCirculation]);

  // Compute Petroleum Metrics for all records & village breakdowns
  const petroleumCalculatedRows = useMemo(() => {
    return state.petroleumVillageCirculation.map((rec) => ({
      record: rec,
      metrics: calculatePetroleumVillageMetrics(rec),
    }));
  }, [state.petroleumVillageCirculation]);

  const villageFuelBreakdowns = useMemo(() => {
    return aggregateVillageFuelBreakdown(state.petroleumVillageCirculation);
  }, [state.petroleumVillageCirculation]);

  // Grouped LPG Circulation Rows by Local Unit
  const groupedLpgRows = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: lpgCalculatedRows,
      getLocalUnit: (item) => item.record.localUnit || item.record.village,
      numericFields: [
        { key: 'population', getValue: (item) => item.record.population },
        { key: 'familiesCount', getValue: (item) => item.record.familiesCount },
        { key: 'depotsCount', getValue: (item) => item.record.depotsCount },
        { key: 'distributorsCount', getValue: (item) => item.record.distributorsCount },
        { key: 'prescribedMonthlyQuota', getValue: (item) => item.record.prescribedMonthlyQuota },
        { key: 'actualInboundQty', getValue: (item) => item.record.actualInboundQty },
        { key: 'actualDisbursedQty', getValue: (item) => item.record.actualDisbursedQty },
        { key: 'remainingQty', getValue: (item) => item.metrics.remainingQty },
        { key: 'quotaVariance', getValue: (item) => item.metrics.quotaVariance },
      ],
      deriveMetrics: (sums) => {
        const pop = sums.population || 0;
        const fam = sums.familiesCount || 0;
        const disbursed = sums.actualDisbursedQty || 0;
        const quota = sums.prescribedMonthlyQuota || 0;
        const quotaExecutionPct = quota > 0 ? Math.round((disbursed / quota) * 100) : 0;
        const dailyPerCapita = pop > 0 ? Number((disbursed / (pop * 30)).toFixed(4)) : 0;
        const monthlyPerCapita = pop > 0 ? Number((disbursed / pop).toFixed(4)) : 0;
        const familyMonthlyShare = fam > 0 ? Number((disbursed / fam).toFixed(2)) : 0;
        const annualPerCapita = pop > 0 ? Number(((disbursed * 12) / pop).toFixed(4)) : 0;
        let status = 'مستقرة';
        if (quotaExecutionPct < 85 || (fam > 0 && familyMonthlyShare < 1.2)) {
          status = 'تعاني من عجز';
        } else if (quotaExecutionPct > 105) {
          status = 'فائض';
        }
        return {
          quotaExecutionPct,
          dailyPerCapita,
          monthlyPerCapita,
          familyMonthlyShare,
          annualPerCapita,
          status,
        };
      },
      sortUnitsAlphabetically: true,
    });
  }, [lpgCalculatedRows]);

  // Grouped Petroleum Circulation Rows by Local Unit
  const groupedPetroRows = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: petroleumCalculatedRows,
      getLocalUnit: (item) => item.record.localUnit || item.record.village,
      numericFields: [
        { key: 'population', getValue: (item) => item.record.population },
        { key: 'openingBalanceLiters', getValue: (item) => item.record.openingBalanceLiters },
        { key: 'inboundLiters', getValue: (item) => item.record.inboundLiters },
        { key: 'disbursedLiters', getValue: (item) => item.record.disbursedLiters },
        { key: 'closingBalanceLiters', getValue: (item) => item.metrics.closingBalanceLiters },
      ],
      deriveMetrics: (sums) => {
        const pop = sums.population || 0;
        const opening = sums.openingBalanceLiters || 0;
        const inbound = sums.inboundLiters || 0;
        const disbursed = sums.disbursedLiters || 0;
        const totalAvailable = opening + inbound;
        const availabilityRatioPct = totalAvailable > 0 ? Math.round((disbursed / totalAvailable) * 100) : 0;
        const dailyPerCapitaLiters = pop > 0 ? Number((disbursed / (pop * 30)).toFixed(4)) : 0;
        const monthlyPerCapitaLiters = pop > 0 ? Number((disbursed / pop).toFixed(3)) : 0;
        const annualPerCapitaLiters = pop > 0 ? Number(((disbursed * 12) / pop).toFixed(2)) : 0;
        return {
          availabilityRatioPct,
          dailyPerCapitaLiters,
          monthlyPerCapitaLiters,
          annualPerCapitaLiters,
        };
      },
      sortUnitsAlphabetically: true,
    });
  }, [petroleumCalculatedRows]);

  // Grouped Fuel Breakdowns Matrix
  const groupedFuelBreakdowns = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: villageFuelBreakdowns,
      getLocalUnit: (vb) => vb.localUnit || vb.village,
      numericFields: [
        { key: 'population', getValue: (vb) => vb.population },
        { key: 'gasoline80Liters', getValue: (vb) => vb.gasoline80Liters },
        { key: 'gasoline92Liters', getValue: (vb) => vb.gasoline92Liters },
        { key: 'gasoline95Liters', getValue: (vb) => vb.gasoline95Liters },
        { key: 'dieselLiters', getValue: (vb) => vb.dieselLiters },
        { key: 'keroseneLiters', getValue: (vb) => vb.keroseneLiters },
        { key: 'totalAllFuelsLiters', getValue: (vb) => vb.totalAllFuelsLiters },
      ],
      deriveMetrics: (sums) => {
        const pop = sums.population || 0;
        return {
          gasoline80PerCapita: pop > 0 ? Number((sums.gasoline80Liters / pop).toFixed(3)) : 0,
          gasoline92PerCapita: pop > 0 ? Number((sums.gasoline92Liters / pop).toFixed(3)) : 0,
          gasoline95PerCapita: pop > 0 ? Number((sums.gasoline95Liters / pop).toFixed(3)) : 0,
          dieselPerCapita: pop > 0 ? Number((sums.dieselLiters / pop).toFixed(3)) : 0,
          kerosenePerCapita: pop > 0 ? Number((sums.keroseneLiters / pop).toFixed(3)) : 0,
        };
      },
      sortUnitsAlphabetically: true,
    });
  }, [villageFuelBreakdowns]);

  // Grouped Fuel Stations
  const groupedFuelStations = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: state.fuelStations,
      getLocalUnit: (st) => st.localUnit || st.village,
      numericFields: [
        { key: 'tanksCount', getValue: (st) => st.tanksCount },
        { key: 'tankCapacityLiters', getValue: (st) => st.tankCapacityLiters },
        { key: 'openingBalanceLiters', getValue: (st) => st.openingBalanceLiters },
        { key: 'inboundLiters', getValue: (st) => st.inboundLiters },
        { key: 'soldDisbursedLiters', getValue: (st) => st.soldDisbursedLiters },
        { key: 'actualStockLiters', getValue: (st) => st.actualStockLiters },
      ],
      deriveMetrics: (sums) => {
        const bookBalance =
          (sums.openingBalanceLiters || 0) + (sums.inboundLiters || 0) - (sums.soldDisbursedLiters || 0);
        const inventoryDiff = (sums.actualStockLiters || 0) - bookBalance;
        return { bookBalance, inventoryDiff };
      },
      sortUnitsAlphabetically: true,
    });
  }, [state.fuelStations]);

  // Grouped LPG Depots
  const groupedLpgDepots = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: state.lpgDepots,
      getLocalUnit: (d) => d.localUnit || d.village,
      numericFields: [
        { key: 'prescribedQuota', getValue: (d) => d.prescribedQuota },
        { key: 'inboundCylinders', getValue: (d) => d.inboundCylinders },
        { key: 'disbursedCylinders', getValue: (d) => d.disbursedCylinders },
        { key: 'fullCylindersCount', getValue: (d) => d.fullCylindersCount },
        { key: 'emptyCylindersCount', getValue: (d) => d.emptyCylindersCount },
        { key: 'damagedCylindersCount', getValue: (d) => d.damagedCylindersCount },
      ],
      deriveMetrics: (sums) => {
        const remaining = Math.max(0, (sums.inboundCylinders || 0) - (sums.disbursedCylinders || 0));
        return { remaining };
      },
      sortUnitsAlphabetically: true,
    });
  }, [state.lpgDepots]);

  // Grouped LPG Distributors
  const groupedDistributors = useMemo(() => {
    return groupRecordsByLocalUnit({
      rows: state.lpgDistributors,
      getLocalUnit: (dist) => dist.localUnit || dist.distributionScopeVillage || dist.affiliatedDepotName,
      numericFields: [
        { key: 'prescribedQuota', getValue: (d) => d.prescribedQuota },
        { key: 'receivedQty', getValue: (d) => d.receivedQty },
        { key: 'distributedQty', getValue: (d) => d.distributedQty },
      ],
      deriveMetrics: (sums) => {
        const remaining = Math.max(0, (sums.receivedQty || 0) - (sums.distributedQty || 0));
        return { remaining };
      },
      sortUnitsAlphabetically: true,
    });
  }, [state.lpgDistributors]);

  // Smart Alerts (6 Categories + Fuel/LPG Variance Alerts)
  const smartAlerts = useMemo(() => {
    const todayMs = Date.now();
    const alertDaysMs = (state.settings?.licenseAlertDaysBefore || 30) * 86400000;
    const list: {
      id: string;
      category:
        | 'تراخيص قاربت على الانتهاء'
        | 'سجلات تجارية قاربت على الانتهاء'
        | 'منشآت غير مستوفاة للمستندات'
        | 'شكاوى لم يتم فحصها'
        | 'محاضر لم تستكمل بياناتها'
        | 'حملات لم يُسجل لها تقرير نهائي'
        | 'عجز في حصص البوتاجاز أو فروق جرد الوقود';
      severity: 'critical' | 'warning' | 'info';
      title: string;
      detail: string;
      targetCode: string;
      village: string;
    }[] = [];

    state.establishments.forEach((est) => {
      if (est.licenseExpiryDate) {
        const expMs = new Date(est.licenseExpiryDate).getTime();
        if (!Number.isNaN(expMs)) {
          if (expMs < todayMs) {
            list.push({
              id: `lic-exp-${est.id}`,
              category: 'تراخيص قاربت على الانتهاء',
              severity: 'critical',
              title: `انتهاء ترخيص منشأة: ${est.establishmentName}`,
              detail: `رقم الترخيص ${est.licenseNumber} انتهى بتاريخ ${est.licenseExpiryDate} — المالك: ${est.ownerName}`,
              targetCode: est.establishmentCode,
              village: est.village,
            });
          } else if (expMs - todayMs <= alertDaysMs) {
            list.push({
              id: `lic-soon-${est.id}`,
              category: 'تراخيص قاربت على الانتهاء',
              severity: 'warning',
              title: `قرب انتهاء ترخيص: ${est.establishmentName}`,
              detail: `ينتهي الترخيص رقم ${est.licenseNumber} بتاريخ ${est.licenseExpiryDate}`,
              targetCode: est.establishmentCode,
              village: est.village,
            });
          }
        }
      }

      if (est.commercialRegExpiryDate) {
        const regMs = new Date(est.commercialRegExpiryDate).getTime();
        if (!Number.isNaN(regMs) && regMs - todayMs <= alertDaysMs) {
          list.push({
            id: `reg-exp-${est.id}`,
            category: 'سجلات تجارية قاربت على الانتهاء',
            severity: regMs < todayMs ? 'critical' : 'warning',
            title: `تنبيه سجل تجاري: ${est.establishmentName}`,
            detail: `السجل التجاري رقم ${est.commercialRegNumber} تاريخ انتهائه ${est.commercialRegExpiryDate}`,
            targetCode: est.establishmentCode,
            village: est.village,
          });
        }
      }

      if (!est.attachments || est.attachments.length === 0 || !est.taxCardNumber || !est.licenseNumber) {
        list.push({
          id: `doc-inc-${est.id}`,
          category: 'منشآت غير مستوفاة للمستندات',
          severity: 'warning',
          title: `ملف مستندات غير مكتمل: ${est.establishmentName}`,
          detail: `يرجى استكمال صور المستندات المرفقة أو بيانات البطاقة الضريبية والترخيص (${est.ownerName})`,
          targetCode: est.establishmentCode,
          village: est.village,
        });
      }
    });

    state.complaints.forEach((cmp) => {
      if (cmp.status === 'جديدة' || cmp.status === 'قيد الفحص' || !cmp.inspectionDate) {
        list.push({
          id: `cmp-open-${cmp.id}`,
          category: 'شكاوى لم يتم فحصها',
          severity: cmp.status === 'جديدة' ? 'critical' : 'warning',
          title: `شكوى رقم ${cmp.complaintNumber} بانتظار الحسم (${cmp.complaintType})`,
          detail: `المشكو في حقه: ${cmp.targetEstablishmentName} — مصدر الشكوى: ${cmp.source}`,
          targetCode: cmp.targetEstablishmentCode || cmp.complaintNumber,
          village: cmp.village,
        });
      }
    });

    state.violations.forEach((vio) => {
      if (!vio.caseNumber || vio.status === 'جديد') {
        list.push({
          id: `vio-inc-${vio.id}`,
          category: 'محاضر لم تستكمل بياناتها',
          severity: 'warning',
          title: `محضر رقم ${vio.reportNumber} يحتاج استكمال رقم القضية / الإرسال للنيابة`,
          detail: `المنشأة: ${vio.establishmentName} — المخالفة: ${vio.violationType}`,
          targetCode: vio.establishmentCode,
          village: vio.village,
        });
      }
    });

    state.campaigns.forEach((camp) => {
      if (!camp.finalReportSubmitted) {
        list.push({
          id: `camp-rep-${camp.id}`,
          category: 'حملات لم يُسجل لها تقرير نهائي',
          severity: 'warning',
          title: `حملة رقم ${camp.campaignNumber} لم يُعتمد تقريرها النهائي`,
          detail: `النطاق: ${camp.geographicScope} — رئيس الحملة: ${camp.campaignHead}`,
          targetCode: camp.campaignNumber,
          village: camp.village,
        });
      }
    });

    lpgCalculatedRows.forEach(({ record, metrics }) => {
      if (metrics.villageStatus === 'تعاني من عجز') {
        list.push({
          id: `lpg-def-${record.id}`,
          category: 'عجز في حصص البوتاجاز أو فروق جرد الوقود',
          severity: 'critical',
          title: `عجز في تغطية أسطوانات البوتاجاز بقرية ${record.village}`,
          detail: `نسبة التغطية ${metrics.quotaExecutionPct}% — نصيب الأسرة الشهري ${metrics.familyMonthlyShareCylinders} أسطوانة`,
          targetCode: record.villageCode,
          village: record.village,
        });
      }
    });

    state.fuelStations.forEach((st) => {
      const book = st.openingBalanceLiters + st.inboundLiters - st.soldDisbursedLiters;
      const diff = st.actualStockLiters - book;
      if (Math.abs(diff) > 150) {
        list.push({
          id: `fuel-var-${st.id}`,
          category: 'عجز في حصص البوتاجاز أو فروق جرد الوقود',
          severity: 'critical',
          title: `فرق جرد وقود بمحطة ${st.stationName}`,
          detail: `الرصيد الدفتري ${book.toLocaleString()} لتر مقابل الفعلي ${st.actualStockLiters.toLocaleString()} لتر (الفرق: ${diff.toLocaleString()} لتر)`,
          targetCode: st.stationCode,
          village: st.village,
        });
      }
    });

    return list;
  }, [state, lpgCalculatedRows]);

  // Unified KPI Summary
  const kpiSummary = useMemo(() => {
    const totalEstablishments = allUnifiedEstablishments.length;
    const activeEstablishments = allUnifiedEstablishments.filter((e) => e.activityStatus === 'نشط').length;
    const closedOrStopped = allUnifiedEstablishments.filter(
      (e) => e.activityStatus === 'مغلق' || e.activityStatus === 'متوقف'
    ).length;
    const totalCampaigns = state.campaigns.length;
    const totalViolations = state.violations.length;
    const totalSeizures = state.seizures.length;
    const totalSeizuresValue = state.seizures.reduce((sum, s) => sum + (Number(s.totalValue) || 0), 0);
    const openComplaints = state.complaints.filter((c) => c.status !== 'تم الفحص والحل' && c.status !== 'مغلقة').length;
    const resolvedComplaints = state.complaints.length - openComplaints;
    const reconciledViolations = state.violations.filter((v) => v.status === 'تم التصالح').length;
    const totalCollectedFines = state.violations.reduce(
      (sum, v) => sum + (Number(v.reconciliationAmount) || 0),
      0
    );

    const totalPopulationLpg = state.lpgVillageCirculation.reduce((s, r) => s + r.population, 0);
    const totalFamiliesLpg = state.lpgVillageCirculation.reduce((s, r) => s + r.familiesCount, 0);
    const totalDisbursedCylinders = state.lpgVillageCirculation.reduce(
      (s, r) => s + r.actualDisbursedQty,
      0
    );
    const overallMonthlyPerCapitaCyl =
      totalPopulationLpg > 0 ? Number((totalDisbursedCylinders / totalPopulationLpg).toFixed(4)) : 0;
    const overallFamilyShareCyl =
      totalFamiliesLpg > 0 ? Number((totalDisbursedCylinders / totalFamiliesLpg).toFixed(2)) : 0;

    return {
      totalEstablishments,
      activeEstablishments,
      closedOrStopped,
      totalCampaigns,
      totalViolations,
      totalSeizures,
      totalSeizuresValue,
      openComplaints,
      resolvedComplaints,
      reconciledViolations,
      totalCollectedFines,
      totalDisbursedCylinders,
      overallMonthlyPerCapitaCyl,
      overallFamilyShareCyl,
    };
  }, [allUnifiedEstablishments, state]);

  // Build Unified Chronological Regulatory Timeline for a selected establishment
  const buildEstablishmentTimeline = (est: InternalTradeEstablishment) => {
    const events: {
      id: string;
      date: string;
      type: 'حملة تفتيشية' | 'محضر مخالفة' | 'ضبط وتحفظ' | 'شكوى وبلاغ' | 'تصالح وسداد' | 'غلق / ترخيص';
      badgeColor: string;
      title: string;
      description: string;
      referenceNo: string;
    }[] = [];

    if (est.activityStartDate) {
      events.push({
        id: `start-${est.id}`,
        date: est.activityStartDate,
        type: 'غلق / ترخيص',
        badgeColor: 'bg-blue-50 text-blue-900 border-blue-200',
        title: 'بدء النشاط وإصدار ملف المنشأة بالرقابة التموينية',
        description: `ترخيص رقم ${est.licenseNumber} صادر من ${est.licenseIssuingEntity} — سجل تجاري ${est.commercialRegNumber}`,
        referenceNo: est.establishmentCode,
      });
    }

    state.campaigns
      .filter((c) => c.visitedEstablishmentCodes.includes(est.establishmentCode) || c.village === est.village)
      .forEach((c) => {
        events.push({
          id: `camp-${c.id}`,
          date: c.campaignDate,
          type: 'حملة تفتيشية',
          badgeColor: 'bg-indigo-50 text-indigo-900 border-indigo-200',
          title: `مرور حملة تموينية (${c.campaignType}) برئاسة ${c.campaignHead}`,
          description: `النطاق: ${c.geographicScope} — الملاحظات: ${c.notes}`,
          referenceNo: c.campaignNumber,
        });
      });

    state.violations
      .filter((v) => v.establishmentCode === est.establishmentCode || v.establishmentName === est.establishmentName)
      .forEach((v) => {
        events.push({
          id: `vio-${v.id}`,
          date: v.reportDate,
          type: 'محضر مخالفة',
          badgeColor: 'bg-rose-50 text-rose-900 border-rose-200',
          title: `تحرير محضر مخالفة: ${v.violationType}`,
          description: `${v.violationDescription} — القانون: ${v.governingLawOrDecision} (${v.legalArticle}) — النيابة: ${v.prosecutionEntity}`,
          referenceNo: v.reportNumber,
        });

        if (v.status === 'تم التصالح' && v.paymentDate) {
          events.push({
            id: `rec-${v.id}`,
            date: v.paymentDate,
            type: 'تصالح وسداد',
            badgeColor: 'bg-emerald-50 text-emerald-900 border-emerald-200',
            title: `إتمام التصالح وسداد الغرامة بمبلغ ${v.reconciliationAmount.toLocaleString()} ج.م`,
            description: `طريقة السداد: ${v.paymentMethod} — نتيجة التصرف: ${v.dispositionResult}`,
            referenceNo: v.caseNumber || v.reportNumber,
          });
        }
      });

    state.seizures
      .filter((s) => s.establishmentCode === est.establishmentCode)
      .forEach((s) => {
        events.push({
          id: `seiz-${s.id}`,
          date: s.seizureDate,
          type: 'ضبط وتحفظ',
          badgeColor: 'bg-amber-50 text-amber-900 border-amber-200',
          title: `تحفظ على مضبوطات: ${s.commodityType} (${s.quantity} ${s.unit})`,
          description: `${s.commodityDescription} — القيمة التقديرية: ${s.totalValue.toLocaleString()} ج.م — الحالة: ${s.seizureStatus}`,
          referenceNo: s.seizureOrderNumber,
        });
      });

    state.complaints
      .filter(
        (cmp) =>
          cmp.targetEstablishmentCode === est.establishmentCode ||
          cmp.targetEstablishmentName === est.establishmentName
      )
      .forEach((cmp) => {
        events.push({
          id: `cmp-${cmp.id}`,
          date: cmp.receivedDate,
          type: 'شكوى وبلاغ',
          badgeColor: 'bg-purple-50 text-purple-900 border-purple-200',
          title: `شكوى مواطن (${cmp.complaintType}) عبر ${cmp.source}`,
          description: `الموضوع: ${cmp.subject} — نتيجة الفحص: ${cmp.inspectionResult} — الإجراء: ${cmp.actionTaken}`,
          referenceNo: cmp.complaintNumber,
        });
      });

    if (est.closureDate && est.closureDecisionNo) {
      events.push({
        id: `close-${est.id}`,
        date: est.closureDate,
        type: 'غلق / ترخيص',
        badgeColor: 'bg-red-100 text-red-900 border-red-300',
        title: `قرار غلق إداري رقم ${est.closureDecisionNo}`,
        description: `سبب الغلق: ${est.closureReason || 'مخالفة شروط الترخيص'}`,
        referenceNo: est.closureDecisionNo,
      });
    }

    return events.sort((a, b) => b.date.localeCompare(a.date));
  };

  // CSV Export Helper
  const handleExportCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    if (!permissions.canExport) return;
    const bom = '\uFEFF';
    const csvContent =
      bom +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join(
        '\n'
      );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Official Iframe A4 Print Helper (zero window.open)
  const handlePrintOfficialReport = (title: string, tableHtml: string) => {
    if (!permissions.canPrint) return;
    const escapeHtmlText = (val: unknown) =>
      String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const escTitle = escapeHtmlText(title);
    const escBranchName = escapeHtmlText(branchName);
    const escUserName = escapeHtmlText(currentUser?.fullName || 'مسؤول الرقابة التموينية');
    const safeTableHtml = DOMPurify.sanitize(String(tableHtml || ''), {
      USE_PROFILES: { html: true },
      ADD_ATTR: ['dir', 'colspan', 'rowspan', 'style', 'class'],
    });
    const htmlDoc = `<!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>${escTitle}</title>
        <style>
          body { font-family: 'Cairo', 'Tajawal', sans-serif; margin: 16px; color: #0A1931; direction: rtl; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #0A1931; padding-bottom: 12px; margin-bottom: 18px; }
          .header-right h2, .header-right h3, .header-right p { margin: 2px 0; }
          .report-title { text-align: center; background: #F8FAFC; border: 2px solid #0A1931; padding: 10px; border-radius: 10px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #0A1931; padding: 6px 8px; text-align: right; }
          th { background: #0A1931; color: #FFFFFF; font-weight: bold; }
          tr:nth-child(even) { background: #F8FAFC; }
          .signatures { display: flex; justify-content: space-between; margin-top: 36px; font-weight: bold; font-size: 13px; }
          @media print { @page { size: A4 landscape; margin: 12mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-right">
            <h3>محافظة الغربية</h3>
            <h3>مديرية التموين والتجارة الداخلية بالغربية</h3>
            <h2>${escBranchName} — قسم التجارة الداخلية والرقابة الموحدة</h2>
          </div>
          <div class="header-left">
            <p><strong>تاريخ التقرير:</strong> ${escapeHtmlText(new Date().toLocaleDateString('ar-EG'))}</p>
            <p><strong>المستخدم:</strong> ${escUserName}</p>
          </div>
        </div>
        <div class="report-title">
          <h2>${escTitle}</h2>
        </div>
        ${safeTableHtml}
        <div class="signatures">
          <div>المختص / مفتش التجارة الداخلية<br/><br/>.........................</div>
          <div>رئيس قسم التجارة الداخلية<br/><br/>.........................</div>
          <div>مدير إدارة تموين مركز المحلة الكبرى<br/><br/>.........................</div>
        </div>
      </body>
      </html>`;

    const existing = document.getElementById('internal-trade-print-iframe');
    if (existing) existing.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'internal-trade-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!frameDoc) {
      iframe.remove();
      window.print();
      return;
    }
    frameDoc.open();
    frameDoc.write(htmlDoc);
    frameDoc.close();
    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 1200);
      }
    };
    setTimeout(triggerPrint, 120);
  };

  // Categorized Sub-Navigation Groups (no cramped horizontal scrollbar)
  const navGroups: {
    groupTitle: string;
    buttons: { id: InternalTradeSubView; label: string; icon: React.ReactNode; badge?: number | string }[];
  }[] = [
    {
      groupTitle: 'المنشآت والأنشطة والخريطة',
      buttons: [
        { id: 'dashboard', label: 'المركز الرقابي الموحد', icon: <BarChart3 className="w-4 h-4" /> },
        {
          id: 'establishments',
          label: '1. المحلات والمنشآت',
          icon: <Store className="w-4 h-4" />,
          badge: allUnifiedEstablishments.length,
        },
        {
          id: 'activities-licenses',
          label: '2-3. الأنشطة والتراخيص والمغلقة',
          icon: <Award className="w-4 h-4" />,
        },
        { id: 'map', label: 'خريطة الرقابة', icon: <MapPin className="w-4 h-4" /> },
      ],
    },
    {
      groupTitle: 'الحملات والمحاضر والشكاوى والأسعار',
      buttons: [
        {
          id: 'campaigns',
          label: '4. الحملات التموينية',
          icon: <ShieldCheck className="w-4 h-4" />,
          badge: state.campaigns.length,
        },
        {
          id: 'violations',
          label: '5-11. المحاضر والتصالحات',
          icon: <Scale className="w-4 h-4" />,
          badge: state.violations.length,
        },
        {
          id: 'seizures',
          label: '6. المضبوطات والتحفظات',
          icon: <Lock className="w-4 h-4" />,
          badge: state.seizures.length,
        },
        {
          id: 'complaints',
          label: '7. الشكاوى والبلاغات',
          icon: <Bell className="w-4 h-4" />,
          badge: state.complaints.length,
        },
        {
          id: 'prices',
          label: '8-9. الأسعار والأسواق',
          icon: <TrendingUp className="w-4 h-4" />,
          badge: state.marketPrices.length,
        },
      ],
    },
    {
      groupTitle: 'تداول البوتاجاز والمواد البترولية',
      buttons: [
        {
          id: 'lpg-circulation',
          label: 'تداول البوتاجاز ونصيب الفرد',
          icon: <Flame className="w-4 h-4 text-orange-600" />,
          badge: `${state.lpgVillageCirculation.length} قرى`,
        },
        {
          id: 'petroleum-circulation',
          label: 'المواد البترولية (باللتر)',
          icon: <Fuel className="w-4 h-4 text-blue-700" />,
        },
        {
          id: 'fuel-stations',
          label: 'رقابة محطات الوقود',
          icon: <Fuel className="w-4 h-4" />,
          badge: state.fuelStations.length,
        },
        {
          id: 'lpg-depots',
          label: 'مستودعات البوتاجاز والموزعون',
          icon: <Building2 className="w-4 h-4" />,
          badge: state.lpgDepots.length + state.lpgDistributors.length,
        },
        {
          id: 'village-comparison',
          label: 'مقارنة القرى والوحدات',
          icon: <Layers className="w-4 h-4" />,
        },
      ],
    },
    {
      groupTitle: 'التنبيهات والتقارير وسجل التدقيق',
      buttons: [
        ...(canSeeAlerts
          ? [
              {
                id: 'alerts' as const,
                label: 'التنبيهات والإشعارات',
                icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
                badge: unreadAlertsCount > 0 ? unreadAlertsCount : departmentAlerts.length,
              },
            ]
          : []),
        {
          id: 'reports',
          label: '12. مركز التقارير والطباعة',
          icon: <Printer className="w-4 h-4" />,
        },
        {
          id: 'audit',
          label: 'سجل التدقيق والأمان',
          icon: <History className="w-4 h-4" />,
          badge: (state.auditLogs || []).length,
        },
      ],
    },
  ];

  return (
    <div dir="rtl" className="space-y-5 text-[#0A1931] enlarged-bold-table">
      {/* Executive Header Banner — Matte White & Royal Navy */}
      <div className="bg-white border-2 border-[#0A1931] rounded-3xl p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#0A1931] text-white flex items-center justify-center shadow-md shrink-0">
              <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-lg bg-[#0A1931] text-white text-xs font-black">
                  محافظة الغربية — مديرية التموين والتجارة الداخلية
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-100 border border-[#0A1931]/30 text-[#0A1931] text-xs font-black">
                  {branchName}
                </span>
              </div>
              <h1 className="text-2xl font-black text-[#0A1931] mt-1.5">
                منظومة قسم التجارة الداخلية والمركز الرقابي الموحد وتداول البوتاجاز والمواد البترولية
              </h1>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                قاعدة بيانات موحدة تربط المحلات والأنشطة والتراخيص والحملات والمحاضر والمضبوطات والشكاوى والمخابز ومستودعات البوتاجاز ومحطات الوقود ومتوسط نصيب الفرد
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setEditingEst(null);
                setIsEstModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2.5 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة منشأة تجارية</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCampaign(null);
                setIsCampaignModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2.5 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>تسجيل حملة تموينية</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingViolation(null);
                setIsViolationModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2.5 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Scale className="w-4 h-4" />
              <span>تحرير محضر مخالفة</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('reports')}
              className="px-4 py-2.5 bg-[#0A1931] hover:bg-[#132a4f] text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#D4AF37]" />
              <span>مركز التقارير الرسمية (A4)</span>
            </button>
          </div>
        </div>

        {/* Categorized Sub-Navigation Cards (Clear Large Bold Buttons — Zero Horizontal Scrollbar) */}
        <div
          className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"
          data-testid="internal-trade-categorized-tabs"
        >
          {navGroups.map((group) => (
            <div
              key={group.groupTitle}
              className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-2.5 space-y-2"
            >
              <div className="text-[11px] font-black text-[#0A1931] px-2 py-1 rounded-lg bg-slate-200/70">
                {group.groupTitle}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.buttons.map((btn) => {
                  const active = subView === btn.id;
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      data-testid={`internal-trade-tab-${btn.id}`}
                      onClick={() => setSubView(btn.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border-2 transition cursor-pointer shadow-2xs ${
                        active
                          ? 'bg-[#0A1931] text-white border-[#0A1931]'
                          : 'bg-white hover:bg-slate-100 text-[#0A1931] border-slate-300 hover:border-[#0A1931]'
                      }`}
                    >
                      {btn.icon}
                      <span>{btn.label}</span>
                      {btn.badge !== undefined && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black ${
                            active ? 'bg-[#D4AF37] text-[#0A1931]' : 'bg-slate-100 text-[#0A1931]'
                          }`}
                        >
                          {btn.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* =====================================================================
          VIEW 1: UNIFIED CONTROL CENTER DASHBOARD (المركز الرقابي الموحد)
         ===================================================================== */}
      {subView === 'dashboard' && (
        <div className="space-y-5">
          {/* 12 Executive KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3.5">
            <div className="bg-white border-2 border-[#0A1931]/15 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-slate-500">إجمالي المنشآت الموحدة</div>
              <div className="text-2xl font-black text-[#0A1931] mt-1 font-mono">
                {kpiSummary.totalEstablishments}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                تجار + محلات + مخابز + وقود + بوتاجاز
              </div>
            </div>

            <div className="bg-white border-2 border-emerald-600/25 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-emerald-800">المنشآت النشطة</div>
              <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
                {kpiSummary.activeEstablishments}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                مغلق أو متوقف: {kpiSummary.closedOrStopped}
              </div>
            </div>

            <div className="bg-white border-2 border-indigo-600/25 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-indigo-900">إجمالي الحملات التموينية</div>
              <div className="text-2xl font-black text-indigo-800 mt-1 font-mono">
                {kpiSummary.totalCampaigns}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                تفتيش دوري ومفاجئ ومشترك
              </div>
            </div>

            <div className="bg-white border-2 border-rose-600/25 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-rose-900">المحاضر والمخالفات</div>
              <div className="text-2xl font-black text-rose-700 mt-1 font-mono">
                {kpiSummary.totalViolations}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                تم التصالح في: {kpiSummary.reconciledViolations} محضر
              </div>
            </div>

            <div className="bg-white border-2 border-amber-600/25 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-amber-900">المضبوطات والتحفظات</div>
              <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
                {kpiSummary.totalSeizures}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                القيمة: {kpiSummary.totalSeizuresValue.toLocaleString()} ج.م
              </div>
            </div>

            <div className="bg-white border-2 border-purple-600/25 rounded-2xl p-4 shadow-xs">
              <div className="text-xs font-bold text-purple-900">الشكاوى والغرامات المحصلة</div>
              <div className="text-2xl font-black text-purple-800 mt-1 font-mono">
                {kpiSummary.totalCollectedFines.toLocaleString()} <span className="text-xs">ج.م</span>
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                شكاوى مفتوحة: {kpiSummary.openComplaints} | محلولة: {kpiSummary.resolvedComplaints}
              </div>
            </div>
          </div>

          {/* LPG & Petroleum Per-Capita Executive Summary Banner */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center font-black">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[#0A1931]">
                      مؤشر تداول أسطوانات البوتاجاز ومتوسط نصيب الفرد والأسرة
                    </h3>
                    <p className="text-xs font-bold text-slate-500">
                      إجمالي قرى المركز المسجلة: {state.lpgVillageCirculation.length} قرى ووحدات محلية
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('lpg-circulation')}
                  className="px-3 py-1.5 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black transition cursor-pointer"
                >
                  فتح جدول البوتاجاز
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-slate-500">إجمالي المنصرف الشهري</div>
                  <div className="text-lg font-black text-[#0A1931] font-mono mt-0.5">
                    {kpiSummary.totalDisbursedCylinders.toLocaleString()} أسطوانة
                  </div>
                </div>
                <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-slate-500">متوسط نصيب الفرد الشهري</div>
                  <div className="text-lg font-black text-orange-700 font-mono mt-0.5">
                    {kpiSummary.overallMonthlyPerCapitaCyl} أسطوانة/فرد
                  </div>
                </div>
                <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-slate-500">متوسط نصيب الأسرة الشهري</div>
                  <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                    {kpiSummary.overallFamilyShareCyl} أسطوانة/أسرة
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-black">
                    <Fuel className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[#0A1931]">
                      مؤشر المواد البترولية ومتوسط نصيب الفرد باللتر (لكل منتج مستقل)
                    </h3>
                    <p className="text-xs font-bold text-slate-500">
                      محطات الوقود الخاضعة للرقابة: {state.fuelStations.length} محطات
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView('petroleum-circulation')}
                  className="px-3 py-1.5 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black transition cursor-pointer"
                >
                  فتح جدول الوقود
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-3">
                {FUEL_TYPES.map((ft) => {
                  const recs = state.petroleumVillageCirculation.filter((r) => r.fuelType === ft);
                  const totalLiters = recs.reduce((s, r) => s + r.disbursedLiters, 0);
                  const totalPop = recs.reduce((s, r) => s + r.population, 0);
                  const avgPerCapita = totalPop > 0 ? (totalLiters / totalPop).toFixed(2) : '0.00';
                  return (
                    <div key={ft} className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 text-center">
                      <div className="text-[11px] font-black text-[#0A1931]">{ft}</div>
                      <div className="text-sm font-black text-blue-800 font-mono mt-1">{avgPerCapita}</div>
                      <div className="text-[10px] font-bold text-slate-500">لتر / فرد شهرياً</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Distribution by Establishment Type & Top Villages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-black text-[#0A1931] mb-3">
                توزيع المنشآت بالمركز الرقابي الموحد حسب نوع المنشأة
              </h3>
              <div className="space-y-2.5">
                {ESTABLISHMENT_TYPES.map((type) => {
                  const count = allUnifiedEstablishments.filter((e) => e.establishmentType === type).length;
                  if (count === 0) return null;
                  const pct = Math.round((count / Math.max(1, allUnifiedEstablishments.length)) * 100);
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>{type}</span>
                        <span className="font-mono font-black">
                          {count} منشأة ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0A1931] rounded-full"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border-2 border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-[#0A1931]">
                  أحدث التنبيهات الرقابية العاجلة ({smartAlerts.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setSubView('alerts')}
                  className="text-xs font-black text-blue-800 hover:underline cursor-pointer"
                >
                  عرض جميع التنبيهات ←
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {smartAlerts.slice(0, 6).map((al) => (
                  <div
                    key={al.id}
                    className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                      al.severity === 'critical'
                        ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                        : 'bg-amber-50/70 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-black">{al.title}</div>
                      <div className="text-[11px] font-semibold opacity-85 mt-0.5">{al.detail}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[10px] font-black shrink-0">
                      {al.village}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 2: UNIFIED COMMERCIAL ESTABLISHMENTS DATABASE (1. قاعدة بيانات المحلات والمنشآت)
         ===================================================================== */}
      {subView === 'establishments' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                1. قاعدة بيانات المحلات والمنشآت التجارية والتموينية الموحدة
              </h2>
              <p className="text-xs font-bold text-slate-500">
                اضغط على «الملف التاريخي الرقابي» لأي منشأة لعرض سجل الزيارات والحملات والمحاضر والمضبوطات والشكاوى والتصالحات
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-slate-300 text-xs font-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLinkedBakeries}
                  onChange={(e) => setIncludeLinkedBakeries(e.target.checked)}
                  className="rounded text-[#0A1931]"
                />
                <span>إدراج المخابز المربوطة ({bakeries.length} مخبز) بالمركز الرقابي الموحد</span>
              </label>

              <button
                type="button"
                onClick={() =>
                  handleExportCsv(
                    'internal-trade-establishments',
                    [
                      'كود المنشأة',
                      'اسم المنشأة',
                      'اسم صاحب المنشأة',
                      'الرقم القومي',
                      'الهاتف',
                      'نوع المنشأة',
                      'النشاط التجاري',
                      'القرية',
                      'الوحدة المحلية',
                      'السجل التجاري',
                      'انتهاء السجل',
                      'البطاقة الضريبية',
                      'رقم الترخيص',
                      'انتهاء الترخيص',
                      'حالة النشاط',
                    ],
                    filteredEstablishments.map((e) => [
                      e.establishmentCode,
                      e.establishmentName,
                      e.ownerName,
                      e.nationalId,
                      e.phone,
                      e.establishmentType,
                      e.activityType,
                      e.village,
                      e.localUnit,
                      e.commercialRegNumber,
                      e.commercialRegExpiryDate,
                      e.taxCardNumber,
                      e.licenseNumber,
                      e.licenseExpiryDate,
                      e.activityStatus,
                    ])
                  )
                }
                className="px-3.5 py-2 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            </div>
          </div>

          {/* Search & Multi-Filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-[#F8FAFC] p-3.5 rounded-2xl border border-slate-200">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث باسم المالك، اسم المحل، كود المنشأة، الرقم القومي، السجل، الضريبية، الترخيص، أو رقم المحضر..."
                className="w-full pr-9 pl-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-[#0A1931]"
              />
            </div>

            <select
              value={filterEstType}
              onChange={(e) => setFilterEstType(e.target.value)}
              aria-label="تصفية حسب نوع المنشأة"
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-[#0A1931]"
            >
              <option value="ALL">جميع أنواع المنشآت ({allUnifiedEstablishments.length})</option>
              {ESTABLISHMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={filterVillage}
              onChange={(e) => setFilterVillage(e.target.value)}
              aria-label="تصفية حسب القرية"
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-[#0A1931]"
            >
              <option value="ALL">جميع القرى</option>
              {uniqueVillages.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="تصفية حسب حالة النشاط"
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-[#0A1931]"
            >
              <option value="ALL">جميع الحالات</option>
              {ESTABLISHMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold bg-[#F8FAFC] px-3.5 py-2 rounded-xl border border-slate-200">
            <span>
              إجمالي النتائج: <strong className="font-mono text-[#0A1931]">{filteredEstablishments.length}</strong> منشأة (صفحة{' '}
              <strong className="font-mono">{safeEstPage}</strong> من <strong className="font-mono">{estTotalPages}</strong>)
            </span>
            <div className="flex items-center gap-2">
              <select
                value={estPageSize}
                onChange={(e) => {
                  setEstPageSize(Number(e.target.value) || 25);
                  setEstPage(1);
                }}
                aria-label="عدد السجلات بالصفحة"
                className="px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono text-xs"
              >
                <option value={25}>25 / صفحة</option>
                <option value={50}>50 / صفحة</option>
                <option value={100}>100 / صفحة</option>
              </select>
              <button
                type="button"
                disabled={safeEstPage <= 1}
                onClick={() => setEstPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-black disabled:opacity-40 cursor-pointer"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={safeEstPage >= estTotalPages}
                onClick={() => setEstPage((p) => Math.min(estTotalPages, p + 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg font-black disabled:opacity-40 cursor-pointer"
              >
                التالي
              </button>
            </div>
          </div>

          {/* Unified Establishments Table Grouped by Local Unit */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">كود المنشأة</th>
                  <th className="py-3 px-3">اسم المحل / المنشأة</th>
                  <th className="py-3 px-3">اسم صاحب المنشأة</th>
                  <th className="py-3 px-3">نوع المنشأة والنشاط</th>
                  <th className="py-3 px-3">القرية / الوحدة المحلية</th>
                  <th className="py-3 px-3">السجل التجاري والبطاقة الضريبية</th>
                  <th className="py-3 px-3">رقم الترخيص وانتهاؤه</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3 text-center">الإجراءات والملف التاريخي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedEstablishments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center font-black text-slate-500">
                      لا توجد منشآت مطابقة لخيارات البحث أو التصفية الحالية.
                    </td>
                  </tr>
                ) : (
                  <>
                    {groupedEstablishmentsPage.groups.map((grp) => (
                      <React.Fragment key={`est-grp-${grp.localUnit}`}>
                        {grp.rows.map((est) => {
                          const vioCount = violationCountByCode.get(est.establishmentCode) || 0;
                          return (
                            <tr key={est.id} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 font-mono font-black text-[#0A1931]">
                                {est.establishmentCode}
                              </td>
                              <td className="py-2.5 px-3 font-black text-[#0A1931]">
                                <div>{est.establishmentName}</div>
                                <div className="text-[11px] font-semibold text-slate-500">{est.detailedAddress}</div>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{est.ownerName}</div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  قومي: {est.nationalId} | ت: {est.phone}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 font-black text-[11px]">
                                  {est.establishmentType}
                                </span>
                                <div className="text-[11px] font-semibold text-slate-600 mt-0.5">
                                  {est.activityType}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{est.village}</div>
                                <div className="text-[11px] text-slate-500">{est.localUnit}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                <div>س.ت: {est.commercialRegNumber}</div>
                                <div className="text-slate-500">ب.ض: {est.taxCardNumber}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                <div className="font-bold">{est.licenseNumber}</div>
                                <div className="text-slate-500">ينتهي: {est.licenseExpiryDate}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                                    est.activityStatus === 'نشط'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : est.activityStatus === 'مغلق'
                                      ? 'bg-rose-100 text-rose-900'
                                      : est.activityStatus === 'متوقف'
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'bg-blue-100 text-blue-900'
                                  }`}
                                >
                                  {est.activityStatus}
                                </span>
                                {vioCount > 0 && (
                                  <div className="text-[10px] font-black text-rose-700 mt-1">
                                    {vioCount} محاضر مسجلة
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <ModuleRowActions
                                  entityLabel={est.establishmentName}
                                  updatedAt={est.updatedAt}
                                  permissions={{
                                    ...permissions,
                                    canEdit: !est.linkedBakeryId && permissions.canEdit,
                                    canDelete: !est.linkedBakeryId && permissions.canDelete,
                                  }}
                                  testIdPrefix={`it-est-${est.id}`}
                                  extraAction={
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedDossierEst(est);
                                        setDossierActiveTab('timeline');
                                      }}
                                      className="px-2 py-1 bg-[#0A1931] hover:bg-[#152C52] text-white rounded-lg text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <History className="w-3 h-3 text-[#D4AF37]" />
                                      <span>الملف</span>
                                    </button>
                                  }
                                  onView={() =>
                                    setProfileModal({
                                      title: `منشأة: ${est.establishmentName}`,
                                      subtitle: `${est.establishmentCode} — ${est.village} (${est.localUnit})`,
                                      badgeText: est.establishmentType,
                                      updatedAt: est.updatedAt,
                                      sections: [
                                        {
                                          title: 'البيانات الأساسية والمالك',
                                          fields: [
                                            { label: 'كود المنشأة', value: est.establishmentCode, mono: true },
                                            { label: 'اسم المنشأة', value: est.establishmentName, highlight: true },
                                            { label: 'اسم المالك', value: est.ownerName },
                                            { label: 'الرقم القومي', value: est.nationalId, mono: true },
                                            { label: 'رقم الهاتف', value: est.phone, mono: true },
                                            { label: 'القرية والوحدة المحلية', value: `${est.village} / ${est.localUnit}` },
                                            { label: 'العنوان التفصيلي', value: est.detailedAddress },
                                            { label: 'نوع النشاط', value: `${est.establishmentType} — ${est.activityType}` },
                                            { label: 'الحالة', value: est.activityStatus, highlight: true },
                                          ],
                                        },
                                        {
                                          title: 'التراخيص والسجل التجاري والبطاقة الضريبية',
                                          fields: [
                                            { label: 'رقم السجل التجاري', value: est.commercialRegNumber, mono: true },
                                            { label: 'انتهاء السجل التجاري', value: est.commercialRegExpiryDate, mono: true },
                                            { label: 'البطاقة الضريبية', value: est.taxCardNumber, mono: true },
                                            { label: 'رقم الترخيص', value: est.licenseNumber, mono: true },
                                            { label: 'انتهاء الترخيص', value: est.licenseExpiryDate, mono: true },
                                            { label: 'جهة الإصدار', value: est.licenseIssuingEntity },
                                            { label: 'عدد المحاضر المسجلة', value: vioCount, mono: true },
                                            { label: 'ملاحظات', value: est.notes },
                                          ],
                                        },
                                      ],
                                    })
                                  }
                                  onEdit={
                                    !est.linkedBakeryId
                                      ? () => {
                                          setEditingEst(est);
                                          setIsEstModalOpen(true);
                                        }
                                      : undefined
                                  }
                                  onDelete={
                                    !est.linkedBakeryId
                                      ? () =>
                                          setDeleteTarget({
                                            title: est.establishmentName,
                                            summary: [
                                              { label: 'كود المنشأة', value: est.establishmentCode },
                                              { label: 'المالك', value: est.ownerName },
                                              { label: 'القرية', value: est.village },
                                            ],
                                            onConfirm: () =>
                                              commitInternalTradeState(
                                                {
                                                  establishments: state.establishments.filter(
                                                    (x) => x.id !== est.id
                                                  ),
                                                },
                                                `تم حذف المنشأة "${est.establishmentName}" (${est.establishmentCode})`,
                                                {
                                                  actionType: 'حذف',
                                                  entityName: 'منشأة تجارية',
                                                  entityId: est.establishmentCode,
                                                  beforeSummary: est.establishmentName,
                                                }
                                              ),
                                          })
                                      : undefined
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                        <LocalUnitSubtotalRow
                          unitName={grp.localUnit}
                          recordCount={grp.count}
                          labelColSpan={7}
                          metricCells={[
                            {
                              content: `نشط: ${grp.subtotals.activeCount || 0} | محاضر: ${grp.subtotals.violationsCount || 0}`,
                              align: 'center',
                              mono: true,
                            },
                            { content: `${grp.count} منشأة بالصفحة`, align: 'center', mono: true },
                          ]}
                        />
                      </React.Fragment>
                    ))}
                    <VillageGrandTotalRow
                      totalCount={groupedAllEstablishmentsGrand.grandTotalCount}
                      labelColSpan={7}
                      metricCells={[
                        {
                          content: `إجمالي النشط: ${groupedAllEstablishmentsGrand.grandTotals.activeCount || 0} | المحاضر: ${groupedAllEstablishmentsGrand.grandTotals.violationsCount || 0}`,
                          align: 'center',
                          mono: true,
                        },
                        {
                          content: `${groupedAllEstablishmentsGrand.grandTotalCount} منشأة`,
                          align: 'center',
                          mono: true,
                        },
                      ]}
                    />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 3: ACTIVITIES, LICENSES & CLOSED ESTABLISHMENTS (2, 3, 10)
         ===================================================================== */}
      {subView === 'activities-licenses' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Commercial Activities Summary */}
            <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5">
              <h3 className="text-base font-black text-[#0A1931] mb-3">
                2. قاعدة بيانات الأنشطة التجارية وتصنيفاتها النوعية
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#0A1931] text-white font-black">
                    <tr>
                      <th className="py-2.5 px-3">نوع المنشأة</th>
                      <th className="py-2.5 px-3">تصنيف النشاط</th>
                      <th className="py-2.5 px-3">عدد المنشآت</th>
                      <th className="py-2.5 px-3">النشط</th>
                      <th className="py-2.5 px-3">مغلق / متوقف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ESTABLISHMENT_TYPES.map((t) => {
                      const rows = allUnifiedEstablishments.filter((e) => e.establishmentType === t);
                      if (rows.length === 0) return null;
                      const active = rows.filter((r) => r.activityStatus === 'نشط').length;
                      return (
                        <tr key={t}>
                          <td className="py-2 px-3 font-black">{t}</td>
                          <td className="py-2 px-3 font-bold text-slate-600">
                            {rows[0]?.activityCategory || 'تجارة داخلية وتموين'}
                          </td>
                          <td className="py-2 px-3 font-mono font-black">{rows.length}</td>
                          <td className="py-2 px-3 font-mono font-black text-emerald-700">{active}</td>
                          <td className="py-2 px-3 font-mono font-black text-rose-700">
                            {rows.length - active}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Closed & Stopped Establishments (10) */}
            <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5">
              <h3 className="text-base font-black text-[#0A1931] mb-3">
                10. قاعدة بيانات المنشآت المغلقة والمتوقفة وتحت الفحص
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#0A1931] text-white font-black">
                    <tr>
                      <th className="py-2.5 px-3">كود المنشأة</th>
                      <th className="py-2.5 px-3">المنشأة والمالك</th>
                      <th className="py-2.5 px-3">القرية</th>
                      <th className="py-2.5 px-3">الحالة</th>
                      <th className="py-2.5 px-3">قرار وسبب الغلق / التوقف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {allUnifiedEstablishments
                      .filter((e) => e.activityStatus !== 'نشط')
                      .map((e) => (
                        <tr key={e.id}>
                          <td className="py-2 px-3 font-mono font-black">{e.establishmentCode}</td>
                          <td className="py-2 px-3 font-bold">
                            <div>{e.establishmentName}</div>
                            <div className="text-[11px] text-slate-500">{e.ownerName}</div>
                          </td>
                          <td className="py-2 px-3 font-bold">{e.village}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 font-black text-[11px]">
                              {e.activityStatus}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-[11px] font-bold text-slate-700">
                            {e.closureDecisionNo ? `قرار ${e.closureDecisionNo}: ` : ''}
                            {e.closureReason || e.notes || 'قيد المراجعة الرقابية'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 3. Licenses & Commercial Registrations Registry */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5">
            <h3 className="text-base font-black text-[#0A1931] mb-3">
              3. قاعدة بيانات التراخيص والسجلات التجارية والبطاقات الضريبية
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-2.5 px-3">كود المنشأة</th>
                    <th className="py-2.5 px-3">اسم المنشأة</th>
                    <th className="py-2.5 px-3">رقم السجل التجاري</th>
                    <th className="py-2.5 px-3">تاريخ انتهاء السجل</th>
                    <th className="py-2.5 px-3">البطاقة الضريبية</th>
                    <th className="py-2.5 px-3">رقم الترخيص</th>
                    <th className="py-2.5 px-3">جهة الإصدار</th>
                    <th className="py-2.5 px-3">تاريخ انتهاء الترخيص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.establishments.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-black">{e.establishmentCode}</td>
                      <td className="py-2 px-3 font-black">{e.establishmentName}</td>
                      <td className="py-2 px-3 font-mono">{e.commercialRegNumber}</td>
                      <td className="py-2 px-3 font-mono">{e.commercialRegExpiryDate}</td>
                      <td className="py-2 px-3 font-mono">{e.taxCardNumber}</td>
                      <td className="py-2 px-3 font-mono font-bold">{e.licenseNumber}</td>
                      <td className="py-2 px-3 font-bold">{e.licenseIssuingEntity}</td>
                      <td className="py-2 px-3 font-mono font-black text-blue-900">
                        {e.licenseExpiryDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 4: INTERACTIVE REGULATORY MAP (خريطة الرقابة التموينية لمركز المحلة الكبرى)
         ===================================================================== */}
      {subView === 'map' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                خريطة الرقابة التموينية التفاعلية — قرى ووحدات مركز المحلة الكبرى
              </h2>
              <p className="text-xs font-bold text-slate-500">
                توضح مواقع المخابز والمحلات التجارية ومحطات الوقود ومستودعات البوتاجاز والمخازن — اضغط على أي موقع لفتح ملفه التاريخي
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterEstType}
                onChange={(e) => setFilterEstType(e.target.value)}
                className="px-3 py-2 bg-[#F8FAFC] border border-slate-300 rounded-xl text-xs font-black"
              >
                <option value="ALL">كل أنواع المنشآت على الخريطة</option>
                {ESTABLISHMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={filterVillage}
                onChange={(e) => setFilterVillage(e.target.value)}
                className="px-3 py-2 bg-[#F8FAFC] border border-slate-300 rounded-xl text-xs font-black"
              >
                <option value="ALL">كل قرى مركز المحلة الكبرى</option>
                {uniqueVillages.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Map Canvas */}
          <div className="relative w-full h-[460px] rounded-2xl border-2 border-[#0A1931] bg-gradient-to-br from-[#F8FAFC] via-blue-50/40 to-emerald-50/40 overflow-hidden p-4">
            {/* Grid Lines */}
            <div className="absolute inset-0 bg-[radial-gradient(#0A1931_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 h-full overflow-y-auto p-1">
              {filteredEstablishments.slice(0, 35).map((est) => {
                const isViolating = state.violations.some(
                  (v) => v.establishmentCode === est.establishmentCode
                );
                return (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => {
                      setSelectedDossierEst(est);
                      setDossierActiveTab('timeline');
                    }}
                    className={`text-right p-3 rounded-2xl border-2 transition shadow-xs hover:scale-[1.02] cursor-pointer flex flex-col justify-between ${
                      est.activityStatus === 'مغلق'
                        ? 'bg-rose-50 border-rose-500 text-rose-950'
                        : isViolating
                        ? 'bg-amber-50 border-amber-500 text-amber-950'
                        : 'bg-white border-[#0A1931] text-[#0A1931]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-[#0A1931] text-white text-[10px] font-black">
                          {est.establishmentType}
                        </span>
                        <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
                      </div>
                      <div className="text-xs font-black mt-2 line-clamp-1">
                        {est.establishmentName}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600 line-clamp-1">
                        {est.ownerName}
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-black">
                      <span>{est.village}</span>
                      <span>{est.activityStatus}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 5: SUPPLY CAMPAIGNS & PERFORMANCE KPI ENGINE (4. الحملات التموينية)
         ===================================================================== */}
      {subView === 'campaigns' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                4. قاعدة بيانات الحملات التموينية ومؤشر أداء الحملات التلقائي
              </h2>
              <p className="text-xs font-bold text-slate-500">
                تُحسب نسبة المنشآت المخالفة ونسبة الالتزام ومعدل تحرير المحاضر تلقائياً مع التجميع حسب الوحدة المحلية
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingCampaign(null);
                setIsCampaignModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>تسجيل حملة جديدة</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">رقم الحملة</th>
                  <th className="py-3 px-3">التاريخ والنوع</th>
                  <th className="py-3 px-3">النطاق الجغرافي / الوحدة المحلية</th>
                  <th className="py-3 px-3">رئيس وأعضاء الحملة</th>
                  <th className="py-3 px-3 text-center">المفتش عليها</th>
                  <th className="py-3 px-3 text-center">السليمة</th>
                  <th className="py-3 px-3 text-center">المخالفة</th>
                  <th className="py-3 px-3 text-center">المحاضر</th>
                  <th className="py-3 px-3 text-center">نسبة المخالفة ∑</th>
                  <th className="py-3 px-3 text-center">نسبة الالتزام ∑</th>
                  <th className="py-3 px-3 text-center">معدل المحاضر ∑</th>
                  <th className="py-3 px-3">المضبوطات والتقرير</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center font-black text-slate-500">
                      لا توجد حملات تموينية مسجلة حتى الآن.
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const groupedCamps = groupRecordsByLocalUnit({
                      rows: state.campaigns,
                      getLocalUnit: (c) => c.localUnit || c.village,
                      numericFields: [
                        { key: 'inspected', getValue: (c) => c.inspectedCount },
                        { key: 'compliant', getValue: (c) => c.compliantCount },
                        { key: 'violating', getValue: (c) => c.violatingCount },
                        { key: 'reports', getValue: (c) => c.reportsIssuedCount },
                      ],
                      deriveMetrics: (sums) => ({
                        vioRate: calculateCampaignViolationRate(sums.violating, sums.inspected),
                        compRate: calculateCampaignComplianceRate(sums.compliant, sums.inspected),
                        repRate: calculateCampaignReportRate(sums.reports, sums.inspected),
                      }),
                      sortUnitsAlphabetically: true,
                    });
                    return (
                      <>
                        {groupedCamps.groups.map((grp) => (
                          <React.Fragment key={`camp-grp-${grp.localUnit}`}>
                            {grp.rows.map((c) => {
                              const vioRate = calculateCampaignViolationRate(c.violatingCount, c.inspectedCount);
                              const compRate = calculateCampaignComplianceRate(c.compliantCount, c.inspectedCount);
                              const repRate = calculateCampaignReportRate(c.reportsIssuedCount, c.inspectedCount);
                              return (
                                <tr key={c.id} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3 font-mono font-black">{c.campaignNumber}</td>
                                  <td className="py-2.5 px-3 font-bold">
                                    <div>
                                      {c.campaignDate} ({c.campaignTime})
                                    </div>
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-black">
                                      حملة {c.campaignType}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-bold">
                                    <div>{c.geographicScope}</div>
                                    <div className="text-[11px] text-slate-500">{c.localUnit}</div>
                                  </td>
                                  <td className="py-2.5 px-3 font-bold">
                                    <div className="text-[#0A1931]">رئيس: {c.campaignHead}</div>
                                    <div className="text-[11px] text-slate-500">
                                      الأعضاء: {(c.campaignMembers || []).join('، ')}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black">{c.inspectedCount}</td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-700">
                                    {c.compliantCount}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black text-rose-700">
                                    {c.violatingCount}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black text-indigo-800">
                                    {c.reportsIssuedCount}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black text-rose-700 bg-rose-50/50">
                                    {vioRate}%
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-700 bg-emerald-50/50">
                                    {compRate}%
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-black text-blue-800 bg-blue-50/50">
                                    {repRate}%
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px] font-bold">
                                    <div>{c.totalReservedQtySummary}</div>
                                    <span
                                      className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-black ${
                                        c.finalReportSubmitted
                                          ? 'bg-emerald-100 text-emerald-900'
                                          : 'bg-amber-100 text-amber-900'
                                      }`}
                                    >
                                      {c.finalReportSubmitted ? 'تم تقديم التقرير النهائي' : 'بانتظار التقرير النهائي'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <ModuleRowActions
                                      entityLabel={`الحملة ${c.campaignNumber}`}
                                      updatedAt={c.updatedAt}
                                      permissions={permissions}
                                      testIdPrefix={`it-camp-${c.id}`}
                                      onView={() =>
                                        setProfileModal({
                                          title: `حملة تموينية: ${c.campaignNumber}`,
                                          subtitle: `${c.village} (${c.localUnit})`,
                                          badgeText: `حملة ${c.campaignType}`,
                                          updatedAt: c.updatedAt,
                                          sections: [
                                            {
                                              title: 'بيانات الحملة الميدانية',
                                              fields: [
                                                { label: 'رقم الحملة', value: c.campaignNumber, mono: true },
                                                { label: 'التاريخ والوقت', value: `${c.campaignDate} (${c.campaignTime})`, mono: true },
                                                { label: 'القرية والوحدة المحلية', value: `${c.village} / ${c.localUnit}` },
                                                { label: 'النطاق الجغرافي', value: c.geographicScope },
                                                { label: 'رئيس الحملة', value: c.campaignHead, highlight: true },
                                                { label: 'الأعضاء', value: (c.campaignMembers || []).join('، ') },
                                              ],
                                            },
                                            {
                                              title: 'نتائج التفتيش ومؤشرات الأداء',
                                              fields: [
                                                { label: 'المنشآت المفتش عليها', value: c.inspectedCount, mono: true },
                                                { label: 'السليمة', value: `${c.compliantCount} (${compRate}%)`, mono: true },
                                                { label: 'المخالفة', value: `${c.violatingCount} (${vioRate}%)`, mono: true },
                                                { label: 'المحاضر المحررة', value: `${c.reportsIssuedCount} (${repRate}%)`, mono: true },
                                                { label: 'ملخص المضبوطات', value: c.totalReservedQtySummary },
                                                { label: 'التقرير النهائي', value: c.finalReportSubmitted ? 'معتمد ومقدم' : 'قيد الاستكمال' },
                                              ],
                                            },
                                          ],
                                        })
                                      }
                                      onEdit={() => {
                                        setEditingCampaign(c);
                                        setIsCampaignModalOpen(true);
                                      }}
                                      onDelete={() =>
                                        setDeleteTarget({
                                          title: `الحملة ${c.campaignNumber}`,
                                          summary: [
                                            { label: 'رقم الحملة', value: c.campaignNumber },
                                            { label: 'القرية', value: c.village },
                                            { label: 'رئيس الحملة', value: c.campaignHead },
                                          ],
                                          onConfirm: () =>
                                            commitInternalTradeState(
                                              { campaigns: state.campaigns.filter((x) => x.id !== c.id) },
                                              `تم حذف الحملة التموينية رقم ${c.campaignNumber}`,
                                              {
                                                actionType: 'حذف',
                                                entityName: 'حملة تموينية',
                                                entityId: c.campaignNumber,
                                                beforeSummary: c.geographicScope,
                                              }
                                            ),
                                        })
                                      }
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                            <LocalUnitSubtotalRow
                              unitName={grp.localUnit}
                              recordCount={grp.count}
                              labelColSpan={4}
                              metricCells={[
                                { content: grp.subtotals.inspected, mono: true },
                                { content: grp.subtotals.compliant, mono: true },
                                { content: grp.subtotals.violating, mono: true },
                                { content: grp.subtotals.reports, mono: true },
                                { content: `${grp.subtotals.vioRate}%`, mono: true },
                                { content: `${grp.subtotals.compRate}%`, mono: true },
                                { content: `${grp.subtotals.repRate}%`, mono: true },
                                { content: '—', colSpan: 2 },
                              ]}
                            />
                          </React.Fragment>
                        ))}
                        <VillageGrandTotalRow
                          totalCount={groupedCamps.grandTotalCount}
                          labelColSpan={4}
                          metricCells={[
                            { content: groupedCamps.grandTotals.inspected, mono: true },
                            { content: groupedCamps.grandTotals.compliant, mono: true },
                            { content: groupedCamps.grandTotals.violating, mono: true },
                            { content: groupedCamps.grandTotals.reports, mono: true },
                            { content: `${groupedCamps.grandTotals.vioRate}%`, mono: true },
                            { content: `${groupedCamps.grandTotals.compRate}%`, mono: true },
                            { content: `${groupedCamps.grandTotals.repRate}%`, mono: true },
                            { content: '—', colSpan: 2 },
                          ]}
                        />
                      </>
                    );
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 6: VIOLATIONS, REPORTS & RECONCILIATIONS (5 & 11)
         ===================================================================== */}
      {subView === 'violations' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                5 & 11. قاعدة بيانات المخالفات والمحاضر والتصالحات والغرامات
              </h2>
              <p className="text-xs font-bold text-slate-500">
                متابعة متكاملة للمحاضر المحررة ومواد القانون والنيابة المختصة ومبالغ التصالح والسداد
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingViolation(null);
                setIsViolationModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>تحرير محضر جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">رقم المحضر</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">المنشأة والمخالف</th>
                  <th className="py-3 px-3">القرية / الوحدة المحلية</th>
                  <th className="py-3 px-3">نوع ووصف المخالفة</th>
                  <th className="py-3 px-3">القانون والمادة</th>
                  <th className="py-3 px-3">رقم القضية والنيابة</th>
                  <th className="py-3 px-3">الغرامة / مبلغ التصالح</th>
                  <th className="py-3 px-3">حالة المحضر</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(() => {
                  const groupedVio = groupRecordsByLocalUnit({
                    rows: state.violations,
                    getLocalUnit: (v) => v.localUnit || v.village,
                    numericFields: [
                      { key: 'fineAmount', getValue: (v) => v.fineAmount },
                      { key: 'reconciliationAmount', getValue: (v) => v.reconciliationAmount },
                    ],
                    sortUnitsAlphabetically: true,
                  });
                  return (
                    <>
                      {groupedVio.groups.map((grp) => (
                        <React.Fragment key={`vio-grp-${grp.localUnit}`}>
                          {grp.rows.map((v) => (
                            <tr key={v.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono font-black text-rose-800">{v.reportNumber}</td>
                              <td className="py-2.5 px-3 font-mono font-bold">{v.reportDate}</td>
                              <td className="py-2.5 px-3 font-bold">
                                <div className="font-black text-[#0A1931]">{v.establishmentName}</div>
                                <div className="text-[11px] text-slate-500">
                                  المخالف: {v.ownerName} ({v.establishmentCode})
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{v.village}</div>
                                <div className="text-[11px] text-slate-500">{v.localUnit}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-black text-rose-900">{v.violationType}</div>
                                <div className="text-[11px] text-slate-600">{v.violationDescription}</div>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] font-bold">
                                <div>{v.governingLawOrDecision}</div>
                                <div className="text-slate-500">{v.legalArticle}</div>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] font-bold">
                                <div>{v.caseNumber || 'قيد القيد'}</div>
                                <div className="text-slate-500">{v.prosecutionEntity}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black">
                                <div>مقررة: {v.fineAmount.toLocaleString()} ج.م</div>
                                {v.reconciliationAmount > 0 && (
                                  <div className="text-emerald-700">
                                    مسدد تصالح: {v.reconciliationAmount.toLocaleString()} ج.م
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                                    v.status === 'تم التصالح'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : v.status === 'جديد'
                                      ? 'bg-rose-100 text-rose-900'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {v.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <ModuleRowActions
                                  entityLabel={`محضر ${v.reportNumber}`}
                                  updatedAt={v.updatedAt}
                                  permissions={permissions}
                                  testIdPrefix={`it-vio-${v.id}`}
                                  onView={() =>
                                    setProfileModal({
                                      title: `محضر مخالفة: ${v.reportNumber}`,
                                      subtitle: `${v.establishmentName} — ${v.village}`,
                                      badgeText: v.status,
                                      updatedAt: v.updatedAt,
                                      sections: [
                                        {
                                          title: 'بيانات المحضر والمنشأة',
                                          fields: [
                                            { label: 'رقم المحضر', value: v.reportNumber, mono: true },
                                            { label: 'تاريخ المحضر', value: v.reportDate, mono: true },
                                            { label: 'المنشأة والكود', value: `${v.establishmentName} (${v.establishmentCode})` },
                                            { label: 'المخالف', value: v.ownerName },
                                            { label: 'القرية والوحدة المحلية', value: `${v.village} / ${v.localUnit}` },
                                            { label: 'نوع المخالفة', value: v.violationType, highlight: true },
                                            { label: 'الوصف', value: v.violationDescription },
                                          ],
                                        },
                                        {
                                          title: 'القيد القانوني والتصالحات',
                                          fields: [
                                            { label: 'القانون والمادة', value: `${v.governingLawOrDecision} — ${v.legalArticle}` },
                                            { label: 'رقم القضية', value: v.caseNumber || '—', mono: true },
                                            { label: 'النيابة المختصة', value: v.prosecutionEntity },
                                            { label: 'الغرامة المقررة', value: `${v.fineAmount.toLocaleString()} ج.م`, mono: true },
                                            { label: 'مبلغ التصالح المسدد', value: `${v.reconciliationAmount.toLocaleString()} ج.م`, mono: true },
                                            { label: 'نتيجة التصرف', value: v.dispositionResult },
                                          ],
                                        },
                                      ],
                                    })
                                  }
                                  onEdit={() => {
                                    setEditingViolation(v);
                                    setIsViolationModalOpen(true);
                                  }}
                                  onDelete={() =>
                                    setDeleteTarget({
                                      title: `محضر ${v.reportNumber}`,
                                      summary: [
                                        { label: 'رقم المحضر', value: v.reportNumber },
                                        { label: 'المنشأة', value: v.establishmentName },
                                        { label: 'الغرامة', value: `${v.fineAmount.toLocaleString()} ج.م` },
                                      ],
                                      onConfirm: () =>
                                        commitInternalTradeState(
                                          { violations: state.violations.filter((x) => x.id !== v.id) },
                                          `تم حذف المحضر رقم ${v.reportNumber}`,
                                          {
                                            actionType: 'حذف',
                                            entityName: 'محضر مخالفة',
                                            entityId: v.reportNumber,
                                            beforeSummary: v.establishmentName,
                                          }
                                        ),
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                          <LocalUnitSubtotalRow
                            unitName={grp.localUnit}
                            recordCount={grp.count}
                            labelColSpan={7}
                            metricCells={[
                              {
                                content: `غرامات: ${grp.subtotals.fineAmount.toLocaleString()} | تصالح: ${grp.subtotals.reconciliationAmount.toLocaleString()} ج.م`,
                                mono: true,
                                align: 'right',
                              },
                              { content: `${grp.count} محاضر`, colSpan: 2, mono: true },
                            ]}
                          />
                        </React.Fragment>
                      ))}
                      <VillageGrandTotalRow
                        totalCount={groupedVio.grandTotalCount}
                        labelColSpan={7}
                        metricCells={[
                          {
                            content: `إجمالي الغرامات: ${groupedVio.grandTotals.fineAmount.toLocaleString()} | التصالح: ${groupedVio.grandTotals.reconciliationAmount.toLocaleString()} ج.م`,
                            mono: true,
                            align: 'right',
                          },
                          { content: `${groupedVio.grandTotalCount} محاضر`, colSpan: 2, mono: true },
                        ]}
                      />
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 7: SEIZURES & RESERVATIONS (6. المضبوطات والتحفظات)
         ===================================================================== */}
      {subView === 'seizures' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                6. قاعدة بيانات المضبوطات والتحفظات التموينية
              </h2>
              <p className="text-xs font-bold text-slate-500">
                يُحسب إجمالي القيمة التقديرية للمضبوطات تلقائياً (الكمية × سعر الوحدة)
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingSeizure(null);
                setIsSeizureModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>تسجيل محضر ضبط وتحفظ</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">رقم الضبط</th>
                  <th className="py-3 px-3">المحضر المرتبط</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">المنشأة والقرية</th>
                  <th className="py-3 px-3">السلعة المضبوطة</th>
                  <th className="py-3 px-3">الكمية والوحدة</th>
                  <th className="py-3 px-3">سعر الوحدة</th>
                  <th className="py-3 px-3">إجمالي القيمة ∑</th>
                  <th className="py-3 px-3">مكان التحفظ والحالة</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(() => {
                  const groupedSeiz = groupRecordsByLocalUnit({
                    rows: state.seizures,
                    getLocalUnit: (s) => s.village,
                    numericFields: [
                      { key: 'quantity', getValue: (s) => s.quantity },
                      { key: 'totalValue', getValue: (s) => s.quantity * s.unitPrice },
                    ],
                    sortUnitsAlphabetically: true,
                  });
                  return (
                    <>
                      {groupedSeiz.groups.map((grp) => (
                        <React.Fragment key={`sez-grp-${grp.localUnit}`}>
                          {grp.rows.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono font-black">{s.seizureOrderNumber}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-rose-800">{s.linkedReportNumber}</td>
                              <td className="py-2.5 px-3 font-mono">{s.seizureDate}</td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{s.establishmentName}</div>
                                <div className="text-[11px] text-slate-500">{s.village}</div>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{s.commodityType}</div>
                                <div className="text-[11px] text-slate-500">{s.commodityDescription}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black">
                                {s.quantity.toLocaleString()} {s.unit}
                              </td>
                              <td className="py-2.5 px-3 font-mono">{s.unitPrice.toLocaleString()} ج.م</td>
                              <td className="py-2.5 px-3 font-mono font-black text-amber-800 bg-amber-50/60">
                                {(s.quantity * s.unitPrice).toLocaleString()} ج.م
                              </td>
                              <td className="py-2.5 px-3 text-[11px] font-bold">
                                <div>{s.storageLocation}</div>
                                <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-black">
                                  {s.seizureStatus}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <ModuleRowActions
                                  entityLabel={`حرز ${s.seizureOrderNumber}`}
                                  updatedAt={s.updatedAt}
                                  permissions={permissions}
                                  testIdPrefix={`it-sez-${s.id}`}
                                  onView={() =>
                                    setProfileModal({
                                      title: `محضر ضبط وتحفظ: ${s.seizureOrderNumber}`,
                                      subtitle: `${s.establishmentName} — ${s.village}`,
                                      badgeText: s.seizureStatus,
                                      updatedAt: s.updatedAt,
                                      sections: [
                                        {
                                          title: 'بيانات الضبطية',
                                          fields: [
                                            { label: 'رقم أمر الضبط', value: s.seizureOrderNumber, mono: true },
                                            { label: 'المحضر المرتبط', value: s.linkedReportNumber, mono: true },
                                            { label: 'التاريخ', value: s.seizureDate, mono: true },
                                            { label: 'المنشأة والقرية', value: `${s.establishmentName} — ${s.village}` },
                                            { label: 'السلعة المضبوطة', value: s.commodityType, highlight: true },
                                            { label: 'الكمية وسعر الوحدة', value: `${s.quantity} ${s.unit} × ${s.unitPrice} ج.م`, mono: true },
                                            { label: 'إجمالي القيمة التقديرية', value: `${(s.quantity * s.unitPrice).toLocaleString()} ج.م`, mono: true, highlight: true },
                                            { label: 'مكان التحفظ', value: s.storageLocation },
                                          ],
                                        },
                                      ],
                                    })
                                  }
                                  onEdit={() => {
                                    setEditingSeizure(s);
                                    setIsSeizureModalOpen(true);
                                  }}
                                  onDelete={() =>
                                    setDeleteTarget({
                                      title: `حرز ${s.seizureOrderNumber}`,
                                      summary: [
                                        { label: 'رقم الضبط', value: s.seizureOrderNumber },
                                        { label: 'السلعة', value: s.commodityType },
                                        { label: 'القيمة', value: `${(s.quantity * s.unitPrice).toLocaleString()} ج.م` },
                                      ],
                                      onConfirm: () =>
                                        commitInternalTradeState(
                                          { seizures: state.seizures.filter((x) => x.id !== s.id) },
                                          `تم حذف محضر الضبط رقم ${s.seizureOrderNumber}`,
                                          {
                                            actionType: 'حذف',
                                            entityName: 'ضبطية وتحفظ',
                                            entityId: s.seizureOrderNumber,
                                            beforeSummary: s.commodityType,
                                          }
                                        ),
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                          <LocalUnitSubtotalRow
                            unitName={grp.localUnit}
                            recordCount={grp.count}
                            labelColSpan={5}
                            metricCells={[
                              { content: grp.subtotals.quantity.toLocaleString(), mono: true },
                              { content: '—' },
                              { content: `${grp.subtotals.totalValue.toLocaleString()} ج.م`, mono: true },
                              { content: `${grp.count} أحراز`, colSpan: 2, mono: true },
                            ]}
                          />
                        </React.Fragment>
                      ))}
                      <VillageGrandTotalRow
                        totalCount={groupedSeiz.grandTotalCount}
                        labelColSpan={5}
                        metricCells={[
                          { content: groupedSeiz.grandTotals.quantity.toLocaleString(), mono: true },
                          { content: '—' },
                          { content: `${groupedSeiz.grandTotals.totalValue.toLocaleString()} ج.م`, mono: true },
                          { content: `${groupedSeiz.grandTotalCount} أحراز`, colSpan: 2, mono: true },
                        ]}
                      />
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 8: COMPLAINTS & REPORTS (7. الشكاوى والبلاغات)
         ===================================================================== */}
      {subView === 'complaints' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                7. قاعدة بيانات الشكاوى والبلاغات التموينية
              </h2>
              <p className="text-xs font-bold text-slate-500">
                متابعة شكاوى المواطنين الواردة من الخط الساخن 16528 وبوابة الشكاوى الحكومية والحضور الشخصي
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingComplaint(null);
                setIsComplaintModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>تسجيل شكوى جديدة</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">رقم الشكوى</th>
                  <th className="py-3 px-3">تاريخ الورود والمصدر</th>
                  <th className="py-3 px-3">مقدم الشكوى</th>
                  <th className="py-3 px-3">المنشأة المشكو في حقها / الوحدة</th>
                  <th className="py-3 px-3">نوع وموضوع الشكوى</th>
                  <th className="py-3 px-3">المفتش المكلف والنتيجة</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(() => {
                  const groupedCmp = groupRecordsByLocalUnit({
                    rows: state.complaints,
                    getLocalUnit: (c) => c.localUnit || c.village,
                    numericFields: [
                      {
                        key: 'resolved',
                        getValue: (c) => (c.status === 'تم الفحص والحل' || c.status === 'مغلقة' ? 1 : 0),
                      },
                      {
                        key: 'open',
                        getValue: (c) => (c.status === 'تم الفحص والحل' || c.status === 'مغلقة' ? 0 : 1),
                      },
                    ],
                    sortUnitsAlphabetically: true,
                  });
                  return (
                    <>
                      {groupedCmp.groups.map((grp) => (
                        <React.Fragment key={`cmp-grp-${grp.localUnit}`}>
                          {grp.rows.map((cmp) => (
                            <tr key={cmp.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono font-black">{cmp.complaintNumber}</td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{cmp.receivedDate}</div>
                                <div className="text-[11px] text-slate-500">{cmp.source}</div>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{cmp.complainantName}</div>
                                <div className="text-[11px] font-mono text-slate-500">{cmp.phone}</div>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                <div>{cmp.targetEstablishmentName}</div>
                                <div className="text-[11px] text-slate-500">
                                  {cmp.village} ({cmp.localUnit})
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-black text-[10px]">
                                  {cmp.complaintType}
                                </span>
                                <div className="text-[11px] font-semibold mt-0.5">{cmp.subject}</div>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] font-bold">
                                <div>المفتش: {cmp.assignedEmployee}</div>
                                <div className="text-slate-600">{cmp.inspectionResult}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                                    cmp.status === 'تم الفحص والحل' || cmp.status === 'مغلقة'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {cmp.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <ModuleRowActions
                                  entityLabel={`شكوى ${cmp.complaintNumber}`}
                                  updatedAt={cmp.updatedAt}
                                  permissions={permissions}
                                  testIdPrefix={`it-cmp-${cmp.id}`}
                                  onView={() =>
                                    setProfileModal({
                                      title: `شكوى رقم: ${cmp.complaintNumber}`,
                                      subtitle: `${cmp.source} — ${cmp.receivedDate}`,
                                      badgeText: cmp.status,
                                      updatedAt: cmp.updatedAt,
                                      sections: [
                                        {
                                          title: 'بيانات الشكوى والنتيجة',
                                          fields: [
                                            { label: 'رقم الشكوى', value: cmp.complaintNumber, mono: true },
                                            { label: 'مقدم الشكوى', value: `${cmp.complainantName} (${cmp.phone})` },
                                            { label: 'المشكو في حقه', value: cmp.targetEstablishmentName, highlight: true },
                                            { label: 'القرية والوحدة', value: `${cmp.village} / ${cmp.localUnit}` },
                                            { label: 'النوع', value: cmp.complaintType },
                                            { label: 'الموضوع', value: cmp.subject },
                                            { label: 'المفتش المكلف', value: cmp.assignedEmployee },
                                            { label: 'نتيجة الفحص والإجراء', value: `${cmp.inspectionResult} — ${cmp.actionTaken}` },
                                          ],
                                        },
                                      ],
                                    })
                                  }
                                  onEdit={() => {
                                    setEditingComplaint(cmp);
                                    setIsComplaintModalOpen(true);
                                  }}
                                  onDelete={() =>
                                    setDeleteTarget({
                                      title: `شكوى ${cmp.complaintNumber}`,
                                      summary: [
                                        { label: 'رقم الشكوى', value: cmp.complaintNumber },
                                        { label: 'مقدم الشكوى', value: cmp.complainantName },
                                        { label: 'المشكو في حقه', value: cmp.targetEstablishmentName },
                                      ],
                                      onConfirm: () =>
                                        commitInternalTradeState(
                                          { complaints: state.complaints.filter((x) => x.id !== cmp.id) },
                                          `تم حذف الشكوى رقم ${cmp.complaintNumber}`,
                                          {
                                            actionType: 'حذف',
                                            entityName: 'شكوى وبلاغ',
                                            entityId: cmp.complaintNumber,
                                            beforeSummary: cmp.subject,
                                          }
                                        ),
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                          <LocalUnitSubtotalRow
                            unitName={grp.localUnit}
                            recordCount={grp.count}
                            labelColSpan={6}
                            metricCells={[
                              {
                                content: `محلولة: ${grp.subtotals.resolved} | قيد المتابعة: ${grp.subtotals.open}`,
                                mono: true,
                                colSpan: 2,
                              },
                            ]}
                          />
                        </React.Fragment>
                      ))}
                      <VillageGrandTotalRow
                        totalCount={groupedCmp.grandTotalCount}
                        labelColSpan={6}
                        metricCells={[
                          {
                            content: `إجمالي محلولة: ${groupedCmp.grandTotals.resolved} | مفتوحة: ${groupedCmp.grandTotals.open}`,
                            mono: true,
                            colSpan: 2,
                          },
                        ]}
                      />
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 9: MARKET PRICES & COMMODITIES SURVEILLANCE (8 & 9)
         ===================================================================== */}
      {subView === 'prices' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                8 & 9. قاعدة بيانات الأسعار ومتابعة الأسواق والسلع والمنتجات
              </h2>
              <p className="text-xs font-bold text-slate-500">
                مقارنة السعر الرسمي أو الاسترشادي بالسعر الفعلي في الأسواق وحساب نسبة التغير والانحراف السعري تلقائياً
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingPrice(null);
                setIsPriceModalOpen(true);
              }}
              disabled={!permissions.canAdd}
              className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>رصد سعر سلعة بالسوق</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">كود السلعة</th>
                  <th className="py-3 px-3">اسم السلعة والتصنيف</th>
                  <th className="py-3 px-3">الوحدة</th>
                  <th className="py-3 px-3">السعر الاسترشادي</th>
                  <th className="py-3 px-3">السعر الفعلي بالسوق</th>
                  <th className="py-3 px-3">الفرق السعري ∑</th>
                  <th className="py-3 px-3">نسبة التغير عن الفترة السابقة ∑</th>
                  <th className="py-3 px-3">المنشأة والقرية</th>
                  <th className="py-3 px-3">تاريخ الرصد والمفتش</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(() => {
                  const groupedPrices = groupRecordsByLocalUnit({
                    rows: state.marketPrices,
                    getLocalUnit: (p) => p.localUnit || p.village,
                    numericFields: [
                      { key: 'overpriceCount', getValue: (p) => (p.actualMarketPrice > p.declaredPrice ? 1 : 0) },
                    ],
                    sortUnitsAlphabetically: true,
                  });
                  return (
                    <>
                      {groupedPrices.groups.map((grp) => (
                        <React.Fragment key={`prc-grp-${grp.localUnit}`}>
                          {grp.rows.map((p) => {
                            const diff = Number((p.actualMarketPrice - p.declaredPrice).toFixed(2));
                            const changePct =
                              p.previousPeriodPrice > 0
                                ? Number(
                                    (((p.actualMarketPrice - p.previousPeriodPrice) / p.previousPeriodPrice) * 100).toFixed(1)
                                  )
                                : 0;
                            return (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-mono font-black">{p.commodityCode}</td>
                                <td className="py-2.5 px-3 font-bold">
                                  <div className="font-black">{p.commodityName}</div>
                                  <div className="text-[11px] text-slate-500">{p.category}</div>
                                </td>
                                <td className="py-2.5 px-3 font-bold">{p.unit}</td>
                                <td className="py-2.5 px-3 font-mono font-bold">{p.declaredPrice} ج.م</td>
                                <td className="py-2.5 px-3 font-mono font-black text-[#0A1931]">
                                  {p.actualMarketPrice} ج.م
                                </td>
                                <td
                                  className={`py-2.5 px-3 font-mono font-black ${
                                    diff > 0 ? 'text-rose-700 bg-rose-50/50' : 'text-emerald-700 bg-emerald-50/50'
                                  }`}
                                >
                                  {diff > 0 ? `+${diff}` : diff} ج.م
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold">
                                  {changePct > 0 ? `+${changePct}%` : `${changePct}%`}
                                </td>
                                <td className="py-2.5 px-3 font-bold">
                                  <div>{p.establishmentName}</div>
                                  <div className="text-[11px] text-slate-500">{p.village}</div>
                                </td>
                                <td className="py-2.5 px-3 text-[11px] font-bold">
                                  <div>{p.observationDate}</div>
                                  <div className="text-slate-500">{p.observerEmployee}</div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <ModuleRowActions
                                    entityLabel={`رصد ${p.commodityName}`}
                                    permissions={permissions}
                                    testIdPrefix={`it-prc-${p.id}`}
                                    onView={() =>
                                      setProfileModal({
                                        title: `رصد سعر سلعة: ${p.commodityName}`,
                                        subtitle: `${p.establishmentName} — ${p.village}`,
                                        badgeText: p.category,
                                        sections: [
                                          {
                                            title: 'مؤشرات السعر والمتابعة',
                                            fields: [
                                              { label: 'كود السلعة', value: p.commodityCode, mono: true },
                                              { label: 'اسم السلعة والوحدة', value: `${p.commodityName} (${p.unit})` },
                                              { label: 'السعر الرسمي', value: `${p.declaredPrice} ج.م`, mono: true },
                                              { label: 'السعر الفعلي بالسوق', value: `${p.actualMarketPrice} ج.م`, mono: true, highlight: true },
                                              { label: 'الفرق السعري', value: `${diff > 0 ? `+${diff}` : diff} ج.م`, mono: true },
                                              { label: 'تاريخ الرصد والمفتش', value: `${p.observationDate} — ${p.observerEmployee}` },
                                            ],
                                          },
                                        ],
                                      })
                                    }
                                    onEdit={() => {
                                      setEditingPrice(p);
                                      setIsPriceModalOpen(true);
                                    }}
                                    onDelete={() =>
                                      setDeleteTarget({
                                        title: `رصد ${p.commodityName}`,
                                        summary: [
                                          { label: 'السلعة', value: p.commodityName },
                                          { label: 'المنشأة', value: p.establishmentName },
                                          { label: 'السعر الفعلي', value: `${p.actualMarketPrice} ج.م` },
                                        ],
                                        onConfirm: () =>
                                          commitInternalTradeState(
                                            { marketPrices: state.marketPrices.filter((x) => x.id !== p.id) },
                                            `تم حذف رصد السعر للسلعة "${p.commodityName}"`,
                                            {
                                              actionType: 'حذف',
                                              entityName: 'رصد سعر سلعة',
                                              entityId: p.commodityCode,
                                              beforeSummary: p.commodityName,
                                            }
                                          ),
                                      })
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                          <LocalUnitSubtotalRow
                            unitName={grp.localUnit}
                            recordCount={grp.count}
                            labelColSpan={7}
                            metricCells={[
                              {
                                content: `تجاوز سعر رسمي: ${grp.subtotals.overpriceCount} من ${grp.count} سلع`,
                                colSpan: 3,
                                mono: true,
                              },
                            ]}
                          />
                        </React.Fragment>
                      ))}
                      <VillageGrandTotalRow
                        totalCount={groupedPrices.grandTotalCount}
                        labelColSpan={7}
                        metricCells={[
                          {
                            content: `إجمالي سلع متجاوزة للسعر الرسمي: ${groupedPrices.grandTotals.overpriceCount}`,
                            colSpan: 3,
                            mono: true,
                          },
                        ]}
                      />
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 10: LPG CYLINDERS CIRCULATION & PER-CAPITA ENGINE
         ===================================================================== */}
      {subView === 'lpg-circulation' && (
        <div className="space-y-5">
          {/* Table 1: Full 21-Column LPG Circulation Table */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0A1931]">
                  جدول بيانات تداول أسطوانات البوتاجاز لكل قرية ووحدة محلية (بالأسطوانة)
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  الأسطوانة المنزلية القياسية: {state.settings.domesticCylinderWeightKg} كجم | الأسطوانة التجارية: {state.settings.commercialCylinderWeightKg} كجم — جميع المعادلات تُحسب تلقائياً
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingLpgRecord(null);
                    setIsLpgQuotaModalOpen(true);
                  }}
                  disabled={!permissions.canAdd}
                  className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <span>إضافة / تحديث حصة قرية</span>
                </button>
                {permissions.canExport && (
                  <button
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        'lpg-village-circulation',
                        [
                          'مسلسل',
                          'كود القرية',
                          'اسم القرية',
                          'الوحدة المحلية',
                          'عدد السكان',
                          'عدد الأسر',
                          'المستودعات',
                          'الموزعون',
                          'نوع الأسطوانة',
                          'الوزن كجم',
                          'الحصة الشهرية المقررة',
                          'الوارد الفعلي',
                          'المنصرف الفعلي',
                          'المتبقي',
                          'العجز أو الفائض',
                          'نسبة التنفيذ %',
                          'نصيب الفرد اليومي (أسطوانة)',
                          'نصيب الفرد الشهري (أسطوانة)',
                          'نصيب الأسرة الشهري (أسطوانة)',
                          'نصيب الفرد السنوي (أسطوانة)',
                          'تقييم القرية',
                        ],
                        lpgCalculatedRows.map(({ record: r, metrics: m }) => [
                          r.serialNo,
                          r.villageCode,
                          r.village,
                          r.localUnit,
                          r.population,
                          r.familiesCount,
                          r.depotsCount,
                          r.distributorsCount,
                          r.cylinderType,
                          r.cylinderWeightKg,
                          r.prescribedMonthlyQuota,
                          r.actualInboundQty,
                          r.actualDisbursedQty,
                          m.remainingQty,
                          m.quotaVariance,
                          m.quotaExecutionPct,
                          m.dailyPerCapitaCylinders,
                          m.monthlyPerCapitaCylinders,
                          m.familyMonthlyShareCylinders,
                          m.annualPerCapitaCylinders,
                          m.villageStatus,
                        ])
                      )
                    }
                    className="px-3.5 py-2 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير Excel</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-2.5">م</th>
                    <th className="py-3 px-2.5">كود القرية</th>
                    <th className="py-3 px-2.5">القرية / الوحدة المحلية</th>
                    <th className="py-3 px-2.5">عدد السكان</th>
                    <th className="py-3 px-2.5">عدد الأسر</th>
                    <th className="py-3 px-2.5">المستودعات / الموزعون</th>
                    <th className="py-3 px-2.5">نوع ووزن الأسطوانة</th>
                    <th className="py-3 px-2.5">الحصة الشهرية</th>
                    <th className="py-3 px-2.5">الوارد الفعلي</th>
                    <th className="py-3 px-2.5">المنصرف الفعلي</th>
                    <th className="py-3 px-2.5">المتبقي ∑</th>
                    <th className="py-3 px-2.5">العجز / الفائض ∑</th>
                    <th className="py-3 px-2.5">نسبة التنفيذ ∑</th>
                    <th className="py-3 px-2.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedLpgRows.groups.map((grp) => (
                    <React.Fragment key={grp.localUnit}>
                      {grp.items.map(({ record: r, metrics: m }) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono font-bold">{r.serialNo}</td>
                          <td className="py-2 px-2.5 font-mono font-black">{r.villageCode}</td>
                          <td className="py-2 px-2.5 font-bold">
                            <div className="font-black text-[#0A1931]">{r.village}</div>
                            <div className="text-[11px] text-slate-500">{r.localUnit}</div>
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold">{r.population.toLocaleString()}</td>
                          <td className="py-2 px-2.5 font-mono font-bold">{r.familiesCount.toLocaleString()}</td>
                          <td className="py-2 px-2.5 font-mono text-[11px]">
                            {r.depotsCount} مستودع / {r.distributorsCount} موزع
                          </td>
                          <td className="py-2 px-2.5 font-bold">
                            <div>{r.cylinderType}</div>
                            <div className="text-[11px] font-mono text-slate-500">{r.cylinderWeightKg} كجم</div>
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold">
                            {r.prescribedMonthlyQuota.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold text-blue-800">
                            {r.actualInboundQty.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black text-[#0A1931]">
                            {r.actualDisbursedQty.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold">{m.remainingQty.toLocaleString()}</td>
                          <td
                            className={`py-2 px-2.5 font-mono font-black ${
                              m.quotaVariance < 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {m.quotaVariance.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black">{m.quotaExecutionPct}%</td>
                          <td className="py-2 px-2.5 text-center">
                            <ModuleRowActions
                              entityLabel={`حصة قرية ${r.village}`}
                              permissions={permissions}
                              testIdPrefix={`it-lpg-${r.id}`}
                              onView={() =>
                                setProfileModal({
                                  title: `تداول بوتاجاز قرية: ${r.village}`,
                                  subtitle: `${r.localUnit} — كود: ${r.villageCode}`,
                                  badgeText: m.villageStatus,
                                  sections: [
                                    {
                                      title: 'البيانات الديموغرافية والشبكة',
                                      fields: [
                                        { label: 'عدد السكان', value: r.population.toLocaleString(), mono: true },
                                        { label: 'عدد الأسر', value: r.familiesCount.toLocaleString(), mono: true },
                                        { label: 'المستودعات والموزعون', value: `${r.depotsCount} مستودع / ${r.distributorsCount} موزع` },
                                        { label: 'نوع الأسطوانة والوزن', value: `${r.cylinderType} (${r.cylinderWeightKg} كجم)` },
                                      ],
                                    },
                                    {
                                      title: 'الحصص والكميات ومؤشرات الأداء',
                                      fields: [
                                        { label: 'الحصة الشهرية المقررة', value: `${r.prescribedMonthlyQuota.toLocaleString()} أسطوانة`, mono: true },
                                        { label: 'الوارد الفعلي', value: `${r.actualInboundQty.toLocaleString()} أسطوانة`, mono: true },
                                        { label: 'المنصرف الفعلي', value: `${r.actualDisbursedQty.toLocaleString()} أسطوانة`, mono: true, highlight: true },
                                        { label: 'الرصيد المتبقي', value: `${m.remainingQty.toLocaleString()} أسطوانة`, mono: true },
                                        { label: 'العجز / الفائض', value: `${m.quotaVariance.toLocaleString()} أسطوانة`, mono: true },
                                        { label: 'نسبة التنفيذ', value: `${m.quotaExecutionPct}%`, mono: true },
                                        { label: 'نصيب الفرد الشهري', value: `${m.monthlyPerCapitaCylinders} أسطوانة`, mono: true },
                                        { label: 'نصيب الأسرة الشهري', value: `${m.familyMonthlyShareCylinders} أسطوانة`, mono: true },
                                      ],
                                    },
                                  ],
                                })
                              }
                              onEdit={() => {
                                setEditingLpgRecord(r);
                                setIsLpgQuotaModalOpen(true);
                              }}
                              onDelete={() =>
                                setDeleteTarget({
                                  title: `حصة قرية ${r.village}`,
                                  summary: [
                                    { label: 'القرية', value: r.village },
                                    { label: 'الوحدة المحلية', value: r.localUnit },
                                    { label: 'الحصة الشهرية', value: r.prescribedMonthlyQuota },
                                  ],
                                  onConfirm: () =>
                                    commitInternalTradeState(
                                      {
                                        lpgVillageCirculation: state.lpgVillageCirculation.filter(
                                          (x) => x.id !== r.id
                                        ),
                                      },
                                      `تم حذف سجل حصة قرية ${r.village}`,
                                      {
                                        actionType: 'حذف',
                                        entityName: 'حصة قرية بوتاجاز',
                                        entityId: r.villageCode,
                                        beforeSummary: r.village,
                                      }
                                    ),
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={3}
                        metricCells={[
                          { content: grp.subtotals.population.toLocaleString(), mono: true },
                          { content: grp.subtotals.familiesCount.toLocaleString(), mono: true },
                          { content: `${grp.subtotals.depotsCount}م / ${grp.subtotals.distributorsCount}ز`, mono: true },
                          { content: '—' },
                          { content: grp.subtotals.prescribedMonthlyQuota.toLocaleString(), mono: true },
                          { content: grp.subtotals.actualInboundQty.toLocaleString(), mono: true },
                          { content: grp.subtotals.actualDisbursedQty.toLocaleString(), mono: true },
                          { content: grp.subtotals.remainingQty.toLocaleString(), mono: true },
                          { content: grp.subtotals.quotaVariance.toLocaleString(), mono: true },
                          { content: `${grp.derivedMetrics.quotaExecutionPct}%`, mono: true },
                          { content: '—' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedLpgRows.grandTotalCount}
                    labelColSpan={3}
                    metricCells={[
                      { content: groupedLpgRows.grandTotals.population.toLocaleString(), mono: true },
                      { content: groupedLpgRows.grandTotals.familiesCount.toLocaleString(), mono: true },
                      { content: `${groupedLpgRows.grandTotals.depotsCount}م / ${groupedLpgRows.grandTotals.distributorsCount}ز`, mono: true },
                      { content: '—' },
                      { content: groupedLpgRows.grandTotals.prescribedMonthlyQuota.toLocaleString(), mono: true },
                      { content: groupedLpgRows.grandTotals.actualInboundQty.toLocaleString(), mono: true },
                      { content: groupedLpgRows.grandTotals.actualDisbursedQty.toLocaleString(), mono: true },
                      { content: groupedLpgRows.grandTotals.remainingQty.toLocaleString(), mono: true },
                      { content: groupedLpgRows.grandTotals.quotaVariance.toLocaleString(), mono: true },
                      { content: `${groupedLpgRows.derivedGrandMetrics.quotaExecutionPct}%`, mono: true },
                      { content: '—' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Dedicated Per-Capita LPG Table (جدول متوسط نصيب الفرد والأسرة من أسطوانات البوتاجاز) */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-3">
            <h3 className="text-base font-black text-[#0A1931]">
              جدول متوسط نصيب الفرد والأسرة من أسطوانات البوتاجاز (تلقائي بالأسطوانة لكل قرية ووحدة محلية)
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-3">القرية</th>
                    <th className="py-3 px-3">الوحدة المحلية</th>
                    <th className="py-3 px-3">عدد السكان</th>
                    <th className="py-3 px-3">عدد الأسر</th>
                    <th className="py-3 px-3">الأسطوانات المنصرفة</th>
                    <th className="py-3 px-3">متوسط نصيب الفرد اليومي (أسطوانة) ∑</th>
                    <th className="py-3 px-3">متوسط نصيب الفرد الشهري (أسطوانة) ∑</th>
                    <th className="py-3 px-3">متوسط نصيب الأسرة الشهري (أسطوانة) ∑</th>
                    <th className="py-3 px-3">متوسط نصيب الفرد السنوي (أسطوانة) ∑</th>
                    <th className="py-3 px-3">تقييم حالة القرية ∑</th>
                    <th className="py-3 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedLpgRows.groups.map((grp) => (
                    <React.Fragment key={`percap-grp-${grp.localUnit}`}>
                      {grp.items.map(({ record: r, metrics: m }) => (
                        <tr key={`percap-${r.id}`} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-black text-[#0A1931]">{r.village}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-600">{r.localUnit}</td>
                          <td className="py-2.5 px-3 font-mono">{r.population.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-mono">{r.familiesCount.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-mono font-black">
                            {r.actualDisbursedQty.toLocaleString()} أسطوانة
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-blue-900 bg-blue-50/40">
                            {m.dailyPerCapitaCylinders}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-orange-800 bg-orange-50/40">
                            {m.monthlyPerCapitaCylinders}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-emerald-800 bg-emerald-50/40">
                            {m.familyMonthlyShareCylinders}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-indigo-900 bg-indigo-50/40">
                            {m.annualPerCapitaCylinders}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                                m.villageStatus === 'مكتفية'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : m.villageStatus === 'تحتاج دعم'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-rose-100 text-rose-900'
                              }`}
                            >
                              {m.villageStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <ModuleRowActions
                              entityLabel={`مؤشر نصيب الفرد لقرية ${r.village}`}
                              permissions={permissions}
                              testIdPrefix={`it-lpg-pc-${r.id}`}
                              onView={() =>
                                setProfileModal({
                                  title: `متوسط نصيب الفرد: قرية ${r.village}`,
                                  subtitle: `${r.localUnit}`,
                                  badgeText: m.villageStatus,
                                  sections: [
                                    {
                                      title: 'معدلات نصيب الفرد والأسرة من الأسطوانات',
                                      fields: [
                                        { label: 'السكان', value: r.population.toLocaleString(), mono: true },
                                        { label: 'الأسر', value: r.familiesCount.toLocaleString(), mono: true },
                                        { label: 'المنصرف الفعلي', value: `${r.actualDisbursedQty.toLocaleString()} أسطوانة`, mono: true },
                                        { label: 'نصيب الفرد اليومي', value: `${m.dailyPerCapitaCylinders} أسطوانة`, mono: true },
                                        { label: 'نصيب الفرد الشهري', value: `${m.monthlyPerCapitaCylinders} أسطوانة`, mono: true, highlight: true },
                                        { label: 'نصيب الأسرة الشهري', value: `${m.familyMonthlyShareCylinders} أسطوانة`, mono: true, highlight: true },
                                        { label: 'نصيب الفرد السنوي', value: `${m.annualPerCapitaCylinders} أسطوانة`, mono: true },
                                      ],
                                    },
                                  ],
                                })
                              }
                              onEdit={() => {
                                setEditingLpgRecord(r);
                                setIsLpgQuotaModalOpen(true);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={2}
                        metricCells={[
                          { content: grp.subtotals.population.toLocaleString(), mono: true },
                          { content: grp.subtotals.familiesCount.toLocaleString(), mono: true },
                          { content: `${grp.subtotals.actualDisbursedQty.toLocaleString()} أسطوانة`, mono: true },
                          { content: grp.derivedMetrics.dailyPerCapita, mono: true },
                          { content: grp.derivedMetrics.monthlyPerCapita, mono: true },
                          { content: grp.derivedMetrics.familyMonthlyShare, mono: true },
                          { content: grp.derivedMetrics.annualPerCapita, mono: true },
                          { content: grp.derivedMetrics.status },
                          { content: '—' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedLpgRows.grandTotalCount}
                    labelColSpan={2}
                    metricCells={[
                      { content: groupedLpgRows.grandTotals.population.toLocaleString(), mono: true },
                      { content: groupedLpgRows.grandTotals.familiesCount.toLocaleString(), mono: true },
                      { content: `${groupedLpgRows.grandTotals.actualDisbursedQty.toLocaleString()} أسطوانة`, mono: true },
                      { content: groupedLpgRows.derivedGrandMetrics.dailyPerCapita, mono: true },
                      { content: groupedLpgRows.derivedGrandMetrics.monthlyPerCapita, mono: true },
                      { content: groupedLpgRows.derivedGrandMetrics.familyMonthlyShare, mono: true },
                      { content: groupedLpgRows.derivedGrandMetrics.annualPerCapita, mono: true },
                      { content: groupedLpgRows.derivedGrandMetrics.status },
                      { content: '—' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 11: PETROLEUM PRODUCTS CIRCULATION & PER-CAPITA IN LITERS
         ===================================================================== */}
      {subView === 'petroleum-circulation' && (
        <div className="space-y-5">
          {/* Table 1: Detailed Petroleum Circulation per Fuel Type */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0A1931]">
                  قاعدة بيانات تداول المواد البترولية (بنزين 80 / 92 / 95 / سولار / كيروسين) باللتر
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  يُحسب كل نوع وقود بشكل مستقل تماماً باللتر دون خلط الأنواع معاً في متوسط واحد
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPetroRecord(null);
                  setIsPetroQuotaModalOpen(true);
                }}
                disabled={!permissions.canAdd}
                className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>إضافة سجل مادة بترولية</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-2.5">م</th>
                    <th className="py-3 px-2.5">القرية / الوحدة المحلية</th>
                    <th className="py-3 px-2.5">عدد السكان</th>
                    <th className="py-3 px-2.5">نوع المادة البترولية</th>
                    <th className="py-3 px-2.5">رصيد أول المدة (لتر)</th>
                    <th className="py-3 px-2.5">الوارد (لتر)</th>
                    <th className="py-3 px-2.5">المنصرف الفعلي (لتر)</th>
                    <th className="py-3 px-2.5">الرصيد المتبقي ∑</th>
                    <th className="py-3 px-2.5">نسبة توافر الوقود ∑</th>
                    <th className="py-3 px-2.5">نصيب الفرد اليومي (لتر) ∑</th>
                    <th className="py-3 px-2.5">نصيب الفرد الشهري (لتر) ∑</th>
                    <th className="py-3 px-2.5">نصيب الفرد السنوي (لتر) ∑</th>
                    <th className="py-3 px-2.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedPetroRows.groups.map((grp) => (
                    <React.Fragment key={grp.localUnit}>
                      {grp.items.map(({ record: r, metrics: m }) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono">{r.serialNo}</td>
                          <td className="py-2 px-2.5 font-bold">
                            <div className="font-black text-[#0A1931]">{r.village}</div>
                            <div className="text-[11px] text-slate-500">{r.localUnit}</div>
                          </td>
                          <td className="py-2 px-2.5 font-mono">{r.population.toLocaleString()}</td>
                          <td className="py-2 px-2.5">
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-950 font-black">
                              {r.fuelType}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono">{r.openingBalanceLiters.toLocaleString()}</td>
                          <td className="py-2 px-2.5 font-mono font-bold text-blue-800">
                            {r.inboundLiters.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black text-[#0A1931]">
                            {r.disbursedLiters.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold">
                            {m.closingBalanceLiters.toLocaleString()}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black text-emerald-700">
                            {m.availabilityRatioPct}%
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black bg-slate-50">
                            {m.dailyPerCapitaLiters}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black text-blue-900 bg-blue-50/40">
                            {m.monthlyPerCapitaLiters}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black text-indigo-900 bg-indigo-50/40">
                            {m.annualPerCapitaLiters}
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            <ModuleRowActions
                              entityLabel={`مادة بترولية ${r.fuelType} بـ${r.village}`}
                              permissions={permissions}
                              testIdPrefix={`it-petro-${r.id}`}
                              onView={() =>
                                setProfileModal({
                                  title: `تداول ${r.fuelType}: قرية ${r.village}`,
                                  subtitle: `${r.localUnit}`,
                                  badgeText: `${m.availabilityRatioPct}% نسبة توافر`,
                                  sections: [
                                    {
                                      title: 'بيانات التداول ومؤشرات الاستهلاك باللتر',
                                      fields: [
                                        { label: 'عدد السكان', value: r.population.toLocaleString(), mono: true },
                                        { label: 'نوع الوقود', value: r.fuelType },
                                        { label: 'رصيد أول المدة', value: `${r.openingBalanceLiters.toLocaleString()} لتر`, mono: true },
                                        { label: 'الوارد', value: `${r.inboundLiters.toLocaleString()} لتر`, mono: true },
                                        { label: 'المنصرف الفعلي', value: `${r.disbursedLiters.toLocaleString()} لتر`, mono: true, highlight: true },
                                        { label: 'الرصيد المتبقي', value: `${m.closingBalanceLiters.toLocaleString()} لتر`, mono: true },
                                        { label: 'نسبة توافر الوقود', value: `${m.availabilityRatioPct}%`, mono: true },
                                        { label: 'نصيب الفرد اليومي', value: `${m.dailyPerCapitaLiters} لتر`, mono: true },
                                        { label: 'نصيب الفرد الشهري', value: `${m.monthlyPerCapitaLiters} لتر`, mono: true, highlight: true },
                                        { label: 'نصيب الفرد السنوي', value: `${m.annualPerCapitaLiters} لتر`, mono: true },
                                      ],
                                    },
                                  ],
                                })
                              }
                              onEdit={() => {
                                setEditingPetroRecord(r);
                                setIsPetroQuotaModalOpen(true);
                              }}
                              onDelete={() =>
                                setDeleteTarget({
                                  title: `سجل ${r.fuelType} بقرية ${r.village}`,
                                  summary: [
                                    { label: 'القرية', value: r.village },
                                    { label: 'نوع الوقود', value: r.fuelType },
                                    { label: 'المنصرف الفعلي', value: `${r.disbursedLiters.toLocaleString()} لتر` },
                                  ],
                                  onConfirm: () =>
                                    commitInternalTradeState(
                                      {
                                        petroleumVillageCirculation: state.petroleumVillageCirculation.filter(
                                          (x) => x.id !== r.id
                                        ),
                                      },
                                      `تم حذف سجل تداول ${r.fuelType} لقرية ${r.village}`,
                                      {
                                        actionType: 'حذف',
                                        entityName: 'تداول مواد بترولية',
                                        entityId: `${r.village}-${r.fuelType}`,
                                        beforeSummary: `${r.village} - ${r.fuelType}`,
                                      }
                                    ),
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={2}
                        metricCells={[
                          { content: grp.subtotals.population.toLocaleString(), mono: true },
                          { content: '—' },
                          { content: grp.subtotals.openingBalanceLiters.toLocaleString(), mono: true },
                          { content: grp.subtotals.inboundLiters.toLocaleString(), mono: true },
                          { content: grp.subtotals.disbursedLiters.toLocaleString(), mono: true },
                          { content: grp.subtotals.closingBalanceLiters.toLocaleString(), mono: true },
                          { content: `${grp.derivedMetrics.availabilityRatioPct}%`, mono: true },
                          { content: grp.derivedMetrics.dailyPerCapitaLiters, mono: true },
                          { content: grp.derivedMetrics.monthlyPerCapitaLiters, mono: true },
                          { content: grp.derivedMetrics.annualPerCapitaLiters, mono: true },
                          { content: '—' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedPetroRows.grandTotalCount}
                    labelColSpan={2}
                    metricCells={[
                      { content: groupedPetroRows.grandTotals.population.toLocaleString(), mono: true },
                      { content: '—' },
                      { content: groupedPetroRows.grandTotals.openingBalanceLiters.toLocaleString(), mono: true },
                      { content: groupedPetroRows.grandTotals.inboundLiters.toLocaleString(), mono: true },
                      { content: groupedPetroRows.grandTotals.disbursedLiters.toLocaleString(), mono: true },
                      { content: groupedPetroRows.grandTotals.closingBalanceLiters.toLocaleString(), mono: true },
                      { content: `${groupedPetroRows.derivedGrandMetrics.availabilityRatioPct}%`, mono: true },
                      { content: groupedPetroRows.derivedGrandMetrics.dailyPerCapitaLiters, mono: true },
                      { content: groupedPetroRows.derivedGrandMetrics.monthlyPerCapitaLiters, mono: true },
                      { content: groupedPetroRows.derivedGrandMetrics.annualPerCapitaLiters, mono: true },
                      { content: '—' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Aggregated Per-Capita Matrix by Fuel Type per Village */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-3">
            <h3 className="text-base font-black text-[#0A1931]">
              جدول متوسط نصيب الفرد الشهري من المواد البترولية باللتر (مفصلاً لكل نوع وقود على حدة)
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-3">القرية</th>
                    <th className="py-3 px-3">الوحدة المحلية</th>
                    <th className="py-3 px-3">عدد السكان</th>
                    <th className="py-3 px-3">نصيب الفرد من بنزين 80 (لتر)</th>
                    <th className="py-3 px-3">نصيب الفرد من بنزين 92 (لتر)</th>
                    <th className="py-3 px-3">نصيب الفرد من بنزين 95 (لتر)</th>
                    <th className="py-3 px-3">نصيب الفرد من السولار (لتر)</th>
                    <th className="py-3 px-3">نصيب الفرد من الكيروسين (لتر)</th>
                    <th className="py-3 px-3">إجمالي اللترات المنصرفة (مؤشر عام مستقل)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedFuelBreakdowns.groups.map((grp) => (
                    <React.Fragment key={`fb-grp-${grp.localUnit}`}>
                      {grp.items.map((vb) => (
                        <tr key={vb.village} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-black text-[#0A1931]">{vb.village}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-600">{vb.localUnit}</td>
                          <td className="py-2.5 px-3 font-mono">{vb.population.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-mono font-black text-blue-900">
                            {vb.gasoline80PerCapitaLiters} لتر
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-emerald-800">
                            {vb.gasoline92PerCapitaLiters} لتر
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-purple-900">
                            {vb.gasoline95PerCapitaLiters} لتر
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-amber-900 bg-amber-50/40">
                            {vb.dieselPerCapitaLiters} لتر
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-slate-700">
                            {vb.kerosenePerCapitaLiters} لتر
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black bg-slate-100">
                            {vb.totalAllFuelsLiters.toLocaleString()} لتر
                          </td>
                        </tr>
                      ))}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={2}
                        metricCells={[
                          { content: grp.subtotals.population.toLocaleString(), mono: true },
                          { content: `${grp.derivedMetrics.gasoline80PerCapita} لتر`, mono: true },
                          { content: `${grp.derivedMetrics.gasoline92PerCapita} لتر`, mono: true },
                          { content: `${grp.derivedMetrics.gasoline95PerCapita} لتر`, mono: true },
                          { content: `${grp.derivedMetrics.dieselPerCapita} لتر`, mono: true },
                          { content: `${grp.derivedMetrics.kerosenePerCapita} لتر`, mono: true },
                          { content: `${grp.subtotals.totalAllFuelsLiters.toLocaleString()} لتر`, mono: true },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedFuelBreakdowns.grandTotalCount}
                    labelColSpan={2}
                    metricCells={[
                      { content: groupedFuelBreakdowns.grandTotals.population.toLocaleString(), mono: true },
                      { content: `${groupedFuelBreakdowns.derivedGrandMetrics.gasoline80PerCapita} لتر`, mono: true },
                      { content: `${groupedFuelBreakdowns.derivedGrandMetrics.gasoline92PerCapita} لتر`, mono: true },
                      { content: `${groupedFuelBreakdowns.derivedGrandMetrics.gasoline95PerCapita} لتر`, mono: true },
                      { content: `${groupedFuelBreakdowns.derivedGrandMetrics.dieselPerCapita} لتر`, mono: true },
                      { content: `${groupedFuelBreakdowns.derivedGrandMetrics.kerosenePerCapita} لتر`, mono: true },
                      { content: `${groupedFuelBreakdowns.grandTotals.totalAllFuelsLiters.toLocaleString()} لتر`, mono: true },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 12: FUEL STATIONS CONTROL & DAILY MOVEMENTS LOG
         ===================================================================== */}
      {subView === 'fuel-stations' && (
        <div className="space-y-5">
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0A1931]">
                  وحدة الرقابة على محطات الوقود ومطابقة الرصيد الدفتري بالرصيد الفعلي
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  الرصيد الدفتري = الرصيد الافتتاحي + الوارد − المنصرف | فرق الجرد = الرصيد الفعلي − الرصيد الدفتري
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingFuelStation(null);
                    setIsFuelStationModalOpen(true);
                  }}
                  disabled={!permissions.canAdd}
                  className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <span>إضافة محطة وقود</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(true)}
                  disabled={!permissions.canAdd}
                  className="px-3.5 py-2 bg-white hover:bg-[#0A1931] text-[#0A1931] hover:text-white border-2 border-[#0A1931] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل حركة يومية</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-3">كود المحطة</th>
                    <th className="py-3 px-3">اسم المحطة والشركة</th>
                    <th className="py-3 px-3">القرية / العنوان</th>
                    <th className="py-3 px-3">الخزانات والسعة</th>
                    <th className="py-3 px-3">الوقود الرئيسي</th>
                    <th className="py-3 px-3">افتتاحي + وارد − منصرف</th>
                    <th className="py-3 px-3">الرصيد الدفتري ∑</th>
                    <th className="py-3 px-3">الرصيد الفعلي بالجرد</th>
                    <th className="py-3 px-3">فرق الجرد ∑</th>
                    <th className="py-3 px-3">الحالة والإجراء</th>
                    <th className="py-3 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedFuelStations.groups.map((grp) => (
                    <React.Fragment key={grp.localUnit}>
                      {grp.items.map((st) => {
                        const bookBalance =
                          st.openingBalanceLiters + st.inboundLiters - st.soldDisbursedLiters;
                        const diff = st.actualStockLiters - bookBalance;
                        return (
                          <tr key={st.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-black">{st.stationCode}</td>
                            <td className="py-2.5 px-3 font-bold">
                              <div className="font-black text-[#0A1931]">{st.stationName}</div>
                              <div className="text-[11px] text-slate-500">
                                شركة: {st.distributionCompany} | المدير: {st.managerName}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              <div>{st.village}</div>
                              <div className="text-[11px] text-slate-500">{st.address}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              <div>{st.tanksCount} خزانات</div>
                              <div>سعة {st.tankCapacityLiters.toLocaleString()} لتر</div>
                            </td>
                            <td className="py-2.5 px-3 font-black text-blue-900">{st.primaryFuelType}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              {st.openingBalanceLiters.toLocaleString()} + {st.inboundLiters.toLocaleString()} −{' '}
                              {st.soldDisbursedLiters.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black bg-slate-50">
                              {bookBalance.toLocaleString()} لتر
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black">
                              {st.actualStockLiters.toLocaleString()} لتر
                            </td>
                            <td
                              className={`py-2.5 px-3 font-mono font-black ${
                                Math.abs(diff) > 150
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()} لتر
                            </td>
                            <td className="py-2.5 px-3 text-[11px] font-bold">
                              <div>{st.stationStatus}</div>
                              <div className="text-slate-500">{st.inspectionActionTaken}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <ModuleRowActions
                                entityLabel={`محطة وقود ${st.stationName}`}
                                permissions={permissions}
                                testIdPrefix={`it-st-${st.id}`}
                                onView={() =>
                                  setProfileModal({
                                    title: `محطة وقود: ${st.stationName}`,
                                    subtitle: `${st.distributionCompany} — كود: ${st.stationCode}`,
                                    badgeText: st.stationStatus,
                                    sections: [
                                      {
                                        title: 'البيانات الأساسية والموقع',
                                        fields: [
                                          { label: 'كود المحطة', value: st.stationCode, mono: true },
                                          { label: 'اسم المحطة', value: st.stationName },
                                          { label: 'شركة التوزيع', value: st.distributionCompany },
                                          { label: 'المدير المسؤول', value: st.managerName },
                                          { label: 'القرية والوحدة', value: `${st.village} — ${st.localUnit}` },
                                          { label: 'العنوان التفصيلي', value: st.address },
                                        ],
                                      },
                                      {
                                        title: 'الخزانات والأرصدة وفروق الجرد',
                                        fields: [
                                          { label: 'الخزانات والسعة', value: `${st.tanksCount} خزانات (${st.tankCapacityLiters.toLocaleString()} لتر)` },
                                          { label: 'نوع الوقود الرئيسي', value: st.primaryFuelType },
                                          { label: 'الرصيد الافتتاحي', value: `${st.openingBalanceLiters.toLocaleString()} لتر`, mono: true },
                                          { label: 'الوارد', value: `${st.inboundLiters.toLocaleString()} لتر`, mono: true },
                                          { label: 'المنصرف والمبيعات', value: `${st.soldDisbursedLiters.toLocaleString()} لتر`, mono: true },
                                          { label: 'الرصيد الدفتري', value: `${bookBalance.toLocaleString()} لتر`, mono: true },
                                          { label: 'الرصيد الفعلي بالجرد', value: `${st.actualStockLiters.toLocaleString()} لتر`, mono: true, highlight: true },
                                          { label: 'فرق الجرد', value: `${diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()} لتر`, mono: true },
                                          { label: 'الإجراء الرقابي المتخذ', value: st.inspectionActionTaken || 'لا يوجد' },
                                        ],
                                      },
                                    ],
                                  })
                                }
                                onEdit={() => {
                                  setEditingFuelStation(st);
                                  setIsFuelStationModalOpen(true);
                                }}
                                onDelete={() =>
                                  setDeleteTarget({
                                    title: `محطة ${st.stationName}`,
                                    summary: [
                                      { label: 'المحطة', value: st.stationName },
                                      { label: 'القرية', value: st.village },
                                      { label: 'الشركة', value: st.distributionCompany },
                                    ],
                                    onConfirm: () =>
                                      commitInternalTradeState(
                                        {
                                          fuelStations: state.fuelStations.filter((x) => x.id !== st.id),
                                        },
                                        `تم حذف بيانات محطة الوقود ${st.stationName}`,
                                        {
                                          actionType: 'حذف',
                                          entityName: 'محطة وقود',
                                          entityId: st.stationCode,
                                          beforeSummary: st.stationName,
                                        }
                                      ),
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={3}
                        metricCells={[
                          { content: `${grp.subtotals.tanksCount}خ (${grp.subtotals.tankCapacityLiters.toLocaleString()} لتر)`, mono: true },
                          { content: '—' },
                          { content: `${grp.subtotals.openingBalanceLiters.toLocaleString()} + ${grp.subtotals.inboundLiters.toLocaleString()} − ${grp.subtotals.soldDisbursedLiters.toLocaleString()}`, mono: true },
                          { content: `${grp.derivedMetrics.bookBalance.toLocaleString()} لتر`, mono: true },
                          { content: `${grp.subtotals.actualStockLiters.toLocaleString()} لتر`, mono: true },
                          { content: `${Number(grp.derivedMetrics.inventoryDiff) > 0 ? `+${Number(grp.derivedMetrics.inventoryDiff).toLocaleString()}` : Number(grp.derivedMetrics.inventoryDiff || 0).toLocaleString()} لتر`, mono: true },
                          { content: '—' },
                          { content: '—' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedFuelStations.grandTotalCount}
                    labelColSpan={3}
                    metricCells={[
                      { content: `${groupedFuelStations.grandTotals.tanksCount}خ (${groupedFuelStations.grandTotals.tankCapacityLiters.toLocaleString()} لتر)`, mono: true },
                      { content: '—' },
                      { content: `${groupedFuelStations.grandTotals.openingBalanceLiters.toLocaleString()} + ${groupedFuelStations.grandTotals.inboundLiters.toLocaleString()} − ${groupedFuelStations.grandTotals.soldDisbursedLiters.toLocaleString()}`, mono: true },
                      { content: `${groupedFuelStations.derivedGrandMetrics.bookBalance.toLocaleString()} لتر`, mono: true },
                      { content: `${groupedFuelStations.grandTotals.actualStockLiters.toLocaleString()} لتر`, mono: true },
                      { content: `${Number(groupedFuelStations.derivedGrandMetrics.inventoryDiff) > 0 ? `+${Number(groupedFuelStations.derivedGrandMetrics.inventoryDiff).toLocaleString()}` : Number(groupedFuelStations.derivedGrandMetrics.inventoryDiff || 0).toLocaleString()} لتر`, mono: true },
                      { content: '—' },
                      { content: '—' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Movements Log */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-3">
            <h3 className="text-base font-black text-[#0A1931]">
              سجل الحركة اليومية لمحطات الوقود (الوارد والمنصرف والجرد الفعلي)
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">المحطة</th>
                    <th className="py-2.5 px-3">نوع الوقود</th>
                    <th className="py-2.5 px-3">نوع الحركة</th>
                    <th className="py-2.5 px-3">الكمية (لتر)</th>
                    <th className="py-2.5 px-3">رقم المستند / الفاتورة</th>
                    <th className="py-2.5 px-3">المسؤول / المفتش</th>
                    <th className="py-2.5 px-3">ملاحظات</th>
                    <th className="py-2.5 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.fuelStationMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 px-3 font-mono font-bold">{m.movementDate}</td>
                      <td className="py-2 px-3 font-black">{m.stationName}</td>
                      <td className="py-2 px-3 font-bold text-blue-900">{m.fuelType}</td>
                      <td className="py-2 px-3 font-black">{m.movementType}</td>
                      <td className="py-2 px-3 font-mono font-black">{m.quantityLiters.toLocaleString()} لتر</td>
                      <td className="py-2 px-3 font-mono">{m.invoiceOrDocNumber}</td>
                      <td className="py-2 px-3 font-bold">{m.inspectorOrOperator}</td>
                      <td className="py-2 px-3 text-slate-600">{m.notes}</td>
                      <td className="py-2 px-3 text-center">
                        <ModuleRowActions
                          entityLabel={`حركة ${m.movementType} بمحطة ${m.stationName}`}
                          permissions={permissions}
                          testIdPrefix={`it-fmov-${m.id}`}
                          onView={() =>
                            setProfileModal({
                              title: `حركة وقود: ${m.stationName}`,
                              subtitle: `${m.movementDate} — ${m.movementType}`,
                              sections: [
                                {
                                  title: 'تفاصيل حركة الوقود والمستند',
                                  fields: [
                                    { label: 'المحطة', value: m.stationName },
                                    { label: 'نوع الوقود', value: m.fuelType },
                                    { label: 'نوع الحركة', value: m.movementType },
                                    { label: 'الكمية باللتر', value: `${m.quantityLiters.toLocaleString()} لتر`, mono: true },
                                    { label: 'رقم الفاتورة / المستند', value: m.invoiceOrDocNumber, mono: true },
                                    { label: 'المسؤول / المفتش', value: m.inspectorOrOperator },
                                    { label: 'ملاحظات', value: m.notes || 'لا يوجد' },
                                  ],
                                },
                              ],
                            })
                          }
                          onDelete={() =>
                            setDeleteTarget({
                              title: `حركة وقود بمحطة ${m.stationName}`,
                              summary: [
                                { label: 'المحطة', value: m.stationName },
                                { label: 'التاريخ', value: m.movementDate },
                                { label: 'الكمية', value: `${m.quantityLiters.toLocaleString()} لتر` },
                              ],
                              onConfirm: () =>
                                commitInternalTradeState(
                                  {
                                    fuelStationMovements: state.fuelStationMovements.filter((x) => x.id !== m.id),
                                  },
                                  `تم حذف حركة الوقود بمحطة ${m.stationName}`,
                                  {
                                    actionType: 'حذف',
                                    entityName: 'حركة وقود يومية',
                                    entityId: m.invoiceOrDocNumber,
                                    beforeSummary: `${m.stationName} - ${m.quantityLiters} لتر`,
                                  }
                                ),
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 13: LPG DEPOTS & DISTRIBUTORS CONTROL
         ===================================================================== */}
      {subView === 'lpg-depots' && (
        <div className="space-y-5">
          {/* Depots Table */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0A1931]">
                  وحدة الرقابة على مستودعات البوتاجاز الرئيسية ({state.lpgDepots.length} مستودعات)
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  متابعة الأرصدة، الحصص، الأسطوانات الممتلئة والفارغة والتالفة، والتراخيص
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingLpgDepot(null);
                  setIsLpgDepotModalOpen(true);
                }}
                disabled={!permissions.canAdd}
                className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>إضافة مستودع بوتاجاز</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-3">كود المستودع</th>
                    <th className="py-3 px-3">اسم المستودع والمالك</th>
                    <th className="py-3 px-3">القرية / الوحدة</th>
                    <th className="py-3 px-3">الترخيص وانتهاؤه</th>
                    <th className="py-3 px-3">الحصة المقررة</th>
                    <th className="py-3 px-3">الوارد / المنصرف</th>
                    <th className="py-3 px-3">المتبقي ∑</th>
                    <th className="py-3 px-3">ممتلئة / فارغة / تالفة</th>
                    <th className="py-3 px-3">نتيجة الجرد والمخالفات</th>
                    <th className="py-3 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedLpgDepots.groups.map((grp) => (
                    <React.Fragment key={grp.localUnit}>
                      {grp.items.map((d) => {
                        const rem = Math.max(0, d.inboundCylinders - d.disbursedCylinders);
                        return (
                          <tr key={d.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-black">{d.depotCode}</td>
                            <td className="py-2.5 px-3 font-bold">
                              <div className="font-black text-[#0A1931]">{d.depotName}</div>
                              <div className="text-[11px] text-slate-500">المالك: {d.ownerName}</div>
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              <div>{d.village}</div>
                              <div className="text-[11px] text-slate-500">{d.localUnit}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              <div>{d.licenseNumber}</div>
                              <div className="text-slate-500">ينتهي: {d.licenseExpiryDate}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              {d.prescribedQuota.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              وارد: {d.inboundCylinders.toLocaleString()} | منصرف:{' '}
                              {d.disbursedCylinders.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black text-blue-900 bg-blue-50/40">
                              {rem.toLocaleString()} أسطوانة
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              ممتلئة: {d.fullCylindersCount} | فارغة: {d.emptyCylindersCount} | تالفة:{' '}
                              {d.damagedCylindersCount}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] font-bold">
                              <div>{d.inventoryResult}</div>
                              <div className="text-rose-700">{d.violationsSummary}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <ModuleRowActions
                                entityLabel={`مستودع ${d.depotName}`}
                                permissions={permissions}
                                testIdPrefix={`it-depot-${d.id}`}
                                onView={() =>
                                  setProfileModal({
                                    title: `مستودع بوتاجاز: ${d.depotName}`,
                                    subtitle: `${d.village} (${d.localUnit}) — كود: ${d.depotCode}`,
                                    badgeText: `${rem.toLocaleString()} أسطوانة رصيد`,
                                    sections: [
                                      {
                                        title: 'البيانات الأساسية والتراخيص',
                                        fields: [
                                          { label: 'كود المستودع', value: d.depotCode, mono: true },
                                          { label: 'اسم المستودع', value: d.depotName },
                                          { label: 'المالك والمدير', value: `${d.ownerName} / ${d.managerName || '—'}` },
                                          { label: 'الموقع والعنوان', value: `${d.village} — ${d.address}` },
                                          { label: 'رقم الترخيص وانتهاؤه', value: `${d.licenseNumber} (حتى ${d.licenseExpiryDate})` },
                                        ],
                                      },
                                      {
                                        title: 'الحصص والرصيد ومخزون الأسطوانات',
                                        fields: [
                                          { label: 'الحصة الشهرية', value: `${d.prescribedQuota.toLocaleString()} أسطوانة`, mono: true },
                                          { label: 'الوارد الفعلي', value: `${d.inboundCylinders.toLocaleString()} أسطوانة`, mono: true },
                                          { label: 'المنصرف الفعلي', value: `${d.disbursedCylinders.toLocaleString()} أسطوانة`, mono: true, highlight: true },
                                          { label: 'المتبقي', value: `${rem.toLocaleString()} أسطوانة`, mono: true },
                                          { label: 'الأسطوانات الممتلئة', value: d.fullCylindersCount.toLocaleString(), mono: true },
                                          { label: 'الأسطوانات الفارغة', value: d.emptyCylindersCount.toLocaleString(), mono: true },
                                          { label: 'الأسطوانات التالفة', value: d.damagedCylindersCount.toLocaleString(), mono: true },
                                          { label: 'الموزعون التابعون', value: `${d.affiliatedDistributorsCount} موزعين` },
                                          { label: 'نتيجة الجرد', value: d.inventoryResult },
                                          { label: 'ملخص المخالفات', value: d.violationsSummary || 'لا توجد مخالفات' },
                                        ],
                                      },
                                    ],
                                  })
                                }
                                onEdit={() => {
                                  setEditingLpgDepot(d);
                                  setIsLpgDepotModalOpen(true);
                                }}
                                onDelete={() =>
                                  setDeleteTarget({
                                    title: `مستودع ${d.depotName}`,
                                    summary: [
                                      { label: 'المستودع', value: d.depotName },
                                      { label: 'القرية', value: d.village },
                                      { label: 'الحصة', value: d.prescribedQuota },
                                    ],
                                    onConfirm: () =>
                                      commitInternalTradeState(
                                        {
                                          lpgDepots: state.lpgDepots.filter((x) => x.id !== d.id),
                                        },
                                        `تم حذف بيانات مستودع البوتاجاز ${d.depotName}`,
                                        {
                                          actionType: 'حذف',
                                          entityName: 'مستودع بوتاجاز',
                                          entityId: d.depotCode,
                                          beforeSummary: d.depotName,
                                        }
                                      ),
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={3}
                        metricCells={[
                          { content: '—' },
                          { content: grp.subtotals.prescribedQuota.toLocaleString(), mono: true },
                          { content: `وارد: ${grp.subtotals.inboundCylinders.toLocaleString()} | منصرف: ${grp.subtotals.disbursedCylinders.toLocaleString()}`, mono: true },
                          { content: `${grp.derivedMetrics.remaining.toLocaleString()} أسطوانة`, mono: true },
                          { content: `م:${grp.subtotals.fullCylindersCount} | ف:${grp.subtotals.emptyCylindersCount} | ت:${grp.subtotals.damagedCylindersCount}`, mono: true },
                          { content: '—' },
                          { content: '—' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedLpgDepots.grandTotalCount}
                    labelColSpan={3}
                    metricCells={[
                      { content: '—' },
                      { content: groupedLpgDepots.grandTotals.prescribedQuota.toLocaleString(), mono: true },
                      { content: `وارد: ${groupedLpgDepots.grandTotals.inboundCylinders.toLocaleString()} | منصرف: ${groupedLpgDepots.grandTotals.disbursedCylinders.toLocaleString()}`, mono: true },
                      { content: `${groupedLpgDepots.derivedGrandMetrics.remaining.toLocaleString()} أسطوانة`, mono: true },
                      { content: `م:${groupedLpgDepots.grandTotals.fullCylindersCount} | ف:${groupedLpgDepots.grandTotals.emptyCylindersCount} | ت:${groupedLpgDepots.grandTotals.damagedCylindersCount}`, mono: true },
                      { content: '—' },
                      { content: '—' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* Distributors Table */}
          <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-[#0A1931]">
                  سجل موزعي أسطوانات البوتاجاز المعتمدين ({state.lpgDistributors.length} موزعين)
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  متابعة خطوط سير وسيارات التوزيع والحصص المستلمة والموزعة
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingLpgDist(null);
                  setIsLpgDistModalOpen(true);
                }}
                disabled={!permissions.canAdd}
                className="px-4 py-2 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>إضافة موزع أسطوانات</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="py-3 px-3">كود الموزع</th>
                    <th className="py-3 px-3">اسم الموزع والرقم القومي</th>
                    <th className="py-3 px-3">الهاتف</th>
                    <th className="py-3 px-3">نطاق التوزيع (القرية)</th>
                    <th className="py-3 px-3">المستودع التابع له</th>
                    <th className="py-3 px-3">الحصة / المستلم / الموزع / المتبقي ∑</th>
                    <th className="py-3 px-3">وسيلة النقل والترخيص</th>
                    <th className="py-3 px-3">الحالة</th>
                    <th className="py-3 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedDistributors.groups.map((grp) => (
                    <React.Fragment key={grp.localUnit}>
                      {grp.items.map((dist) => {
                        const rem = Math.max(0, dist.receivedQty - dist.distributedQty);
                        return (
                          <tr key={dist.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-black">{dist.distributorCode}</td>
                            <td className="py-2.5 px-3 font-bold">
                              <div className="font-black">{dist.distributorName}</div>
                              <div className="text-[11px] font-mono text-slate-500">{dist.nationalId}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono">{dist.phone}</td>
                            <td className="py-2.5 px-3 font-bold">{dist.distributionScopeVillage}</td>
                            <td className="py-2.5 px-3 font-bold">{dist.affiliatedDepotName}</td>
                            <td className="py-2.5 px-3 font-mono text-[11px] font-bold">
                              حصة: {dist.prescribedQuota} | استلم: {dist.receivedQty} | وزع:{' '}
                              {dist.distributedQty} | متبقي: {rem}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] font-bold">
                              <div>{dist.vehicleDetails}</div>
                              <div className="text-slate-500">{dist.licenseNumber}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-black text-[11px]">
                                {dist.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <ModuleRowActions
                                entityLabel={`موزع ${dist.distributorName}`}
                                permissions={permissions}
                                testIdPrefix={`it-dist-${dist.id}`}
                                onView={() =>
                                  setProfileModal({
                                    title: `موزع بوتاجاز معتمد: ${dist.distributorName}`,
                                    subtitle: `نطاق التوزيع: ${dist.distributionScopeVillage} — كود: ${dist.distributorCode}`,
                                    badgeText: dist.status,
                                    sections: [
                                      {
                                        title: 'بيانات الموزع والترخيص ووسيلة النقل',
                                        fields: [
                                          { label: 'كود الموزع', value: dist.distributorCode, mono: true },
                                          { label: 'اسم الموزع', value: dist.distributorName },
                                          { label: 'الرقم القومي', value: dist.nationalId, mono: true },
                                          { label: 'الهاتف', value: dist.phone, mono: true },
                                          { label: 'نطاق التوزيع', value: dist.distributionScopeVillage },
                                          { label: 'المستودع التابع له', value: dist.affiliatedDepotName },
                                          { label: 'وسيلة النقل', value: dist.vehicleDetails },
                                          { label: 'رقم ترخيص السيارة', value: dist.licenseNumber, mono: true },
                                        ],
                                      },
                                      {
                                        title: 'الحصص وكميات الاستلام والتوزيع',
                                        fields: [
                                          { label: 'الحصة المقررة', value: `${dist.prescribedQuota} أسطوانة`, mono: true },
                                          { label: 'المستلم الفعلي', value: `${dist.receivedQty} أسطوانة`, mono: true },
                                          { label: 'الموزع الفعلي', value: `${dist.distributedQty} أسطوانة`, mono: true, highlight: true },
                                          { label: 'المتبقي لديه', value: `${rem} أسطوانة`, mono: true },
                                          { label: 'المخالفات السابقة', value: dist.previousViolations || 'لا توجد' },
                                          { label: 'ملخص السجل اليومي', value: dist.dailyMonthlyLogSummary || 'منتظم' },
                                        ],
                                      },
                                    ],
                                  })
                                }
                                onEdit={() => {
                                  setEditingLpgDist(dist);
                                  setIsLpgDistModalOpen(true);
                                }}
                                onDelete={() =>
                                  setDeleteTarget({
                                    title: `موزع ${dist.distributorName}`,
                                    summary: [
                                      { label: 'الموزع', value: dist.distributorName },
                                      { label: 'القرية', value: dist.distributionScopeVillage },
                                      { label: 'المستودع', value: dist.affiliatedDepotName },
                                    ],
                                    onConfirm: () =>
                                      commitInternalTradeState(
                                        {
                                          lpgDistributors: state.lpgDistributors.filter((x) => x.id !== dist.id),
                                        },
                                        `تم حذف بيانات الموزع ${dist.distributorName}`,
                                        {
                                          actionType: 'حذف',
                                          entityName: 'موزع بوتاجاز',
                                          entityId: dist.distributorCode,
                                          beforeSummary: dist.distributorName,
                                        }
                                      ),
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                      <LocalUnitSubtotalRow
                        unitName={grp.localUnit}
                        recordCount={grp.count}
                        labelColSpan={4}
                        metricCells={[
                          { content: '—' },
                          { content: `حصة:${grp.subtotals.prescribedQuota} | استلم:${grp.subtotals.receivedQty} | وزع:${grp.subtotals.distributedQty} | متبقي:${grp.derivedMetrics.remaining}`, mono: true },
                          { content: '—' },
                          { content: '—' },
                          { content: '—' },
                        ]}
                      />
                    </React.Fragment>
                  ))}
                  <VillageGrandTotalRow
                    totalCount={groupedDistributors.grandTotalCount}
                    labelColSpan={4}
                    metricCells={[
                      { content: '—' },
                      { content: `حصة:${groupedDistributors.grandTotals.prescribedQuota} | استلم:${groupedDistributors.grandTotals.receivedQty} | وزع:${groupedDistributors.grandTotals.distributedQty} | متبقي:${groupedDistributors.derivedGrandMetrics.remaining}`, mono: true },
                      { content: '—' },
                      { content: '—' },
                      { content: '—' },
                    ]}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 14: VILLAGE & LOCAL UNIT COMPARISON SCREEN (شاشة المقارنة بين القرى)
         ===================================================================== */}
      {subView === 'village-comparison' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-5">
          <div>
            <h2 className="text-lg font-black text-[#0A1931]">
              شاشة المقارنة التحليلية بين القرى والوحدات المحلية (البوتاجاز والمواد البترولية والرقابة)
            </h2>
            <p className="text-xs font-bold text-slate-500">
              اختر قريتين أو أكثر للمقارنة المباشرة في عدد السكان والحصص والكميات المنصرفة ومتوسط نصيب الفرد والأسرة ونسب التغطية
            </p>
          </div>

          {/* Highest & Lowest Per-Capita Summary Cards */}
          {(() => {
            const sortedLpg = [...lpgCalculatedRows].sort(
              (a, b) => b.metrics.monthlyPerCapitaCylinders - a.metrics.monthlyPerCapitaCylinders
            );
            const highestLpg = sortedLpg[0];
            const lowestLpg = sortedLpg[sortedLpg.length - 1];

            const sortedDiesel = [...villageFuelBreakdowns].sort(
              (a, b) => b.dieselPerCapitaLiters - a.dieselPerCapitaLiters
            );
            const highestDiesel = sortedDiesel[0];
            const lowestDiesel = sortedDiesel[sortedDiesel.length - 1];

            return (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300">
                  <div className="text-xs font-black text-emerald-950">أعلى قرية في نصيب الفرد من البوتاجاز</div>
                  <div className="text-lg font-black text-emerald-800 mt-1">
                    {highestLpg?.record.village}
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-900">
                    {highestLpg?.metrics.monthlyPerCapitaCylinders} أسطوانة/فرد ({highestLpg?.metrics.familyMonthlyShareCylinders} للأسرة)
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300">
                  <div className="text-xs font-black text-rose-950">أقل قرية في نصيب الفرد من البوتاجاز</div>
                  <div className="text-lg font-black text-rose-800 mt-1">
                    {lowestLpg?.record.village}
                  </div>
                  <div className="text-xs font-mono font-bold text-rose-900">
                    {lowestLpg?.metrics.monthlyPerCapitaCylinders} أسطوانة/فرد ({lowestLpg?.metrics.familyMonthlyShareCylinders} للأسرة)
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-300">
                  <div className="text-xs font-black text-blue-950">أعلى قرية في نصيب الفرد من السولار</div>
                  <div className="text-lg font-black text-blue-800 mt-1">
                    {highestDiesel?.village}
                  </div>
                  <div className="text-xs font-mono font-bold text-blue-900">
                    {highestDiesel?.dieselPerCapitaLiters} لتر / فرد شهرياً
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300">
                  <div className="text-xs font-black text-amber-950">أقل قرية في نصيب الفرد من السولار</div>
                  <div className="text-lg font-black text-amber-800 mt-1">
                    {lowestDiesel?.village}
                  </div>
                  <div className="text-xs font-mono font-bold text-amber-900">
                    {lowestDiesel?.dieselPerCapitaLiters} لتر / فرد شهرياً
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Village Multi-Select Checkboxes */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200">
            <div className="text-xs font-black text-[#0A1931] mb-2">
              حدد القرى المراد مقارنتها جنباً إلى جنب:
            </div>
            <div className="flex flex-wrap gap-2">
              {state.lpgVillageCirculation.map((v) => {
                const checked = compareVillagesSelected.includes(v.village);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() =>
                      setCompareVillagesSelected((prev) =>
                        checked ? prev.filter((x) => x !== v.village) : [...prev, v.village]
                      )
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer ${
                      checked
                        ? 'bg-[#0A1931] text-white border-[#0A1931]'
                        : 'bg-white text-[#0A1931] border-slate-300'
                    }`}
                  >
                    {v.village}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Side-by-Side Comparison Matrix */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">القرية</th>
                  <th className="py-3 px-3">الوحدة المحلية</th>
                  <th className="py-3 px-3">عدد السكان</th>
                  <th className="py-3 px-3">عدد الأسر</th>
                  <th className="py-3 px-3">حصة البوتاجاز</th>
                  <th className="py-3 px-3">المنصرف (أسطوانة)</th>
                  <th className="py-3 px-3">نسبة تغطية البوتاجاز</th>
                  <th className="py-3 px-3">نصيب الفرد (أسطوانة)</th>
                  <th className="py-3 px-3">نصيب الأسرة (أسطوانة)</th>
                  <th className="py-3 px-3">نصيب الفرد بنزين 92 (لتر)</th>
                  <th className="py-3 px-3">نصيب الفرد سولار (لتر)</th>
                  <th className="py-3 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lpgCalculatedRows
                  .filter(({ record }) => compareVillagesSelected.includes(record.village))
                  .map(({ record: r, metrics: m }) => {
                    const fuel = villageFuelBreakdowns.find((f) => f.village === r.village);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-black text-[#0A1931]">{r.village}</td>
                        <td className="py-2.5 px-3 font-bold">{r.localUnit}</td>
                        <td className="py-2.5 px-3 font-mono">{r.population.toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-mono">{r.familiesCount.toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-mono">{r.prescribedMonthlyQuota.toLocaleString()}</td>
                        <td className="py-2.5 px-3 font-mono font-black">
                          {r.actualDisbursedQty.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black">{m.quotaExecutionPct}%</td>
                        <td className="py-2.5 px-3 font-mono font-black text-orange-800">
                          {m.monthlyPerCapitaCylinders}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-emerald-800">
                          {m.familyMonthlyShareCylinders}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-blue-900">
                          {fuel?.gasoline92PerCapitaLiters ?? 0} لتر
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-amber-900">
                          {fuel?.dieselPerCapitaLiters ?? 0} لتر
                        </td>
                        <td className="py-2.5 px-3 font-black">{m.villageStatus}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 15: SMART ALERTS CENTER (نظام التنبيهات الذكية)
         ===================================================================== */}
      {subView === 'alerts' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                مركز التنبيهات الرقابية الذكية — قسم التجارة الداخلية والبوتاجاز والمواد البترولية
              </h2>
              <p className="text-xs font-bold text-slate-500">
                تنبيهات استباقية للتراخيص، السجلات، الشكاوى المعلقة، المحاضر، وفروق جرد الوقود وعجز الحصص
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-[#0A1931] text-white text-xs font-black font-mono">
                {departmentAlerts.length} تنبيه
              </span>
            </div>
          </div>
          <DepartmentAlertsPanel
            title="لوحة التنبيهات والرقابة التموينية"
            departmentLabel="التجارة الداخلية"
            alerts={departmentAlerts}
            readAlertIds={state.readAlertIds || []}
            canDeleteAlerts={isAdmin}
            onMarkRead={(alertId: string) => {
              const nextRead = Array.from(new Set([...(state.readAlertIds || []), alertId]));
              commitInternalTradeState({ readAlertIds: nextRead }, 'تم تحديد التنبيه كمقروء');
            }}
            onMarkAllRead={(allIds: string[]) => {
              commitInternalTradeState({ readAlertIds: allIds }, 'تم تحديد جميع التنبيهات كمقروءة');
            }}
          />
        </div>
      )}

      {/* =====================================================================
          VIEW 16: OFFICIAL REPORTS & STATISTICS CENTER (12. مركز التقارير والطباعة)
         ===================================================================== */}
      {subView === 'reports' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                12. مركز التقارير والإحصائيات الرسمية المعتمدة (طباعة A4 عرضية وتصدير Excel)
              </h2>
              <p className="text-xs font-bold text-slate-500">
                ترويسة رسمية: محافظة الغربية — مديرية التموين والتجارة الداخلية بالغربية — {branchName} — قسم التجارة الداخلية
              </p>
            </div>
            <div className="flex items-center gap-2">
              {permissions.canPrint && (
                <button
                  type="button"
                  onClick={() => {
                    const container = document.getElementById('internal-trade-printable-area');
                    handlePrintOfficialReport(
                      'تقرير رسمي معتمد — قسم التجارة الداخلية والرقابة التموينية',
                      container?.innerHTML || ''
                    );
                  }}
                  className="px-4 py-2.5 bg-[#0A1931] text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-[#D4AF37]" />
                  <span>طباعة التقرير الرسمي (A4)</span>
                </button>
              )}
            </div>
          </div>

          {/* 12 Official Report Selector Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { id: 'rep-establishments', label: '1. سجل المنشآت والمحلات التجارية الموحد' },
              { id: 'rep-campaigns', label: '2. تقرير الحملات التموينية ومؤشرات الأداء' },
              { id: 'rep-violations', label: '3. سجل المخالفات والمحاضر والتصالحات' },
              { id: 'rep-seizures', label: '4. سجل المضبوطات والتحفظات وقيمتها' },
              { id: 'rep-complaints', label: '5. تقرير الشكاوى والبلاغات التموينية' },
              { id: 'rep-prices', label: '6. تقرير الأسعار ومتابعة الأسواق' },
              { id: 'rep-lpg-villages', label: '7. تقرير تداول أسطوانات البوتاجاز بالقرى' },
              { id: 'rep-lpg-percapita', label: '8. تقرير متوسط نصيب الفرد والأسرة من البوتاجاز' },
              { id: 'rep-petro-percapita', label: '9. تقرير المواد البترولية ونصيب الفرد باللتر' },
              { id: 'rep-fuel-stations', label: '10. تقرير الرقابة على محطات الوقود وفروق الجرد' },
              { id: 'rep-lpg-depots', label: '11. تقرير مستودعات البوتاجاز والموزعين' },
              { id: 'rep-deficit-villages', label: '12. تقرير القرى الأكثر احتياجاً والعجز والفائض' },
            ].map((rep) => (
              <button
                key={rep.id}
                type="button"
                onClick={() => setSelectedReportId(rep.id)}
                className={`p-3 rounded-xl text-right text-xs font-black border-2 transition cursor-pointer ${
                  selectedReportId === rep.id
                    ? 'bg-[#0A1931] text-white border-[#0A1931]'
                    : 'bg-[#F8FAFC] hover:bg-white text-[#0A1931] border-slate-300'
                }`}
              >
                {rep.label}
              </button>
            ))}
          </div>

          {/* Printable Preview Container */}
          <div
            id="internal-trade-printable-area"
            className="border-2 border-[#0A1931] rounded-2xl p-6 bg-white space-y-4"
          >
            <div className="flex items-center justify-between border-b-2 border-[#0A1931] pb-4">
              <div>
                <div className="text-xs font-black text-slate-600">محافظة الغربية</div>
                <div className="text-sm font-black text-[#0A1931]">
                  مديرية التموين والتجارة الداخلية بالغربية
                </div>
                <div className="text-base font-black text-[#0A1931]">
                  {branchName} — قسم التجارة الداخلية والرقابة الموحدة
                </div>
              </div>
              <div className="text-left text-xs font-bold">
                <div>تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')}</div>
                <div>إجمالي المنشآت الموحدة: {allUnifiedEstablishments.length} منشأة</div>
              </div>
            </div>

            {selectedReportId === 'rep-lpg-percapita' ? (
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="border border-slate-400 p-2">القرية</th>
                    <th className="border border-slate-400 p-2">الوحدة المحلية</th>
                    <th className="border border-slate-400 p-2">عدد السكان</th>
                    <th className="border border-slate-400 p-2">عدد الأسر</th>
                    <th className="border border-slate-400 p-2">الحصة الشهرية</th>
                    <th className="border border-slate-400 p-2">المنصرف الفعلي</th>
                    <th className="border border-slate-400 p-2">نصيب الفرد اليومي</th>
                    <th className="border border-slate-400 p-2">نصيب الفرد الشهري</th>
                    <th className="border border-slate-400 p-2">نصيب الأسرة الشهري</th>
                    <th className="border border-slate-400 p-2">نصيب الفرد السنوي</th>
                    <th className="border border-slate-400 p-2">التقييم</th>
                  </tr>
                </thead>
                <tbody>
                  {lpgCalculatedRows.map(({ record: r, metrics: m }) => (
                    <tr key={r.id}>
                      <td className="border border-slate-300 p-2 font-black">{r.village}</td>
                      <td className="border border-slate-300 p-2">{r.localUnit}</td>
                      <td className="border border-slate-300 p-2 font-mono">{r.population.toLocaleString()}</td>
                      <td className="border border-slate-300 p-2 font-mono">{r.familiesCount.toLocaleString()}</td>
                      <td className="border border-slate-300 p-2 font-mono">{r.prescribedMonthlyQuota.toLocaleString()}</td>
                      <td className="border border-slate-300 p-2 font-mono font-black">{r.actualDisbursedQty.toLocaleString()}</td>
                      <td className="border border-slate-300 p-2 font-mono">{m.dailyPerCapitaCylinders}</td>
                      <td className="border border-slate-300 p-2 font-mono font-black">{m.monthlyPerCapitaCylinders}</td>
                      <td className="border border-slate-300 p-2 font-mono font-black">{m.familyMonthlyShareCylinders}</td>
                      <td className="border border-slate-300 p-2 font-mono">{m.annualPerCapitaCylinders}</td>
                      <td className="border border-slate-300 p-2 font-black">{m.villageStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : selectedReportId === 'rep-petro-percapita' ? (
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="border border-slate-400 p-2">القرية</th>
                    <th className="border border-slate-400 p-2">عدد السكان</th>
                    <th className="border border-slate-400 p-2">بنزين 80 (لتر/فرد)</th>
                    <th className="border border-slate-400 p-2">بنزين 92 (لتر/فرد)</th>
                    <th className="border border-slate-400 p-2">بنزين 95 (لتر/فرد)</th>
                    <th className="border border-slate-400 p-2">السولار (لتر/فرد)</th>
                    <th className="border border-slate-400 p-2">الكيروسين (لتر/فرد)</th>
                    <th className="border border-slate-400 p-2">إجمالي اللترات</th>
                  </tr>
                </thead>
                <tbody>
                  {villageFuelBreakdowns.map((vb) => (
                    <tr key={vb.village}>
                      <td className="border border-slate-300 p-2 font-black">{vb.village}</td>
                      <td className="border border-slate-300 p-2 font-mono">{vb.population.toLocaleString()}</td>
                      <td className="border border-slate-300 p-2 font-mono">{vb.gasoline80PerCapitaLiters}</td>
                      <td className="border border-slate-300 p-2 font-mono">{vb.gasoline92PerCapitaLiters}</td>
                      <td className="border border-slate-300 p-2 font-mono">{vb.gasoline95PerCapitaLiters}</td>
                      <td className="border border-slate-300 p-2 font-mono font-black">{vb.dieselPerCapitaLiters}</td>
                      <td className="border border-slate-300 p-2 font-mono">{vb.kerosenePerCapitaLiters}</td>
                      <td className="border border-slate-300 p-2 font-mono font-black">{vb.totalAllFuelsLiters.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-[#0A1931] text-white font-black">
                  <tr>
                    <th className="border border-slate-400 p-2">كود المنشأة</th>
                    <th className="border border-slate-400 p-2">اسم المنشأة</th>
                    <th className="border border-slate-400 p-2">المالك</th>
                    <th className="border border-slate-400 p-2">نوع المنشأة</th>
                    <th className="border border-slate-400 p-2">القرية</th>
                    <th className="border border-slate-400 p-2">رقم الترخيص</th>
                    <th className="border border-slate-400 p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEstablishments.slice(0, 45).map((e) => (
                    <tr key={e.id}>
                      <td className="border border-slate-300 p-2 font-mono font-bold">{e.establishmentCode}</td>
                      <td className="border border-slate-300 p-2 font-black">{e.establishmentName}</td>
                      <td className="border border-slate-300 p-2">{e.ownerName}</td>
                      <td className="border border-slate-300 p-2">{e.establishmentType}</td>
                      <td className="border border-slate-300 p-2">{e.village}</td>
                      <td className="border border-slate-300 p-2 font-mono">{e.licenseNumber}</td>
                      <td className="border border-slate-300 p-2 font-black">{e.activityStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 17: AUDIT LOG & SECURITY (سجل التدقيق والأمان)
         ===================================================================== */}
      {subView === 'audit' && (
        <div className="bg-white border-2 border-[#0A1931] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0A1931]">
                سجل التدقيق والأمان والعمليات الرقابية لقسم التجارة الداخلية
              </h2>
              <p className="text-xs font-bold text-slate-500">
                سجل أمني يوثق جميع عمليات الإضافة والتعديل والحذف وتاريخها وهوية المستخدم المنفذ
              </p>
            </div>
          </div>

          <AuditLogAdminToolbar
            sliceKey="internalTrade"
            branchId={branchId}
            scopeLabel="التجارة الداخلية والرقابة"
            isSuperAdmin={Boolean(currentUser?.role === 'superadmin' || isAdmin)}
            totalLogsCount={(state.auditLogs || []).length}
            onAuditLogsCleared={() => {
              commitInternalTradeState(
                { auditLogs: [] },
                'تم إفراغ سجل التدقيق بواسطة المشرف العام بعد التحقق الأمني المزدوج'
              );
            }}
          />

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0A1931] text-white font-black">
                <tr>
                  <th className="py-3 px-3">التوقيت والتاريخ</th>
                  <th className="py-3 px-3">المستخدم</th>
                  <th className="py-3 px-3">نوع العملية</th>
                  <th className="py-3 px-3">السجل / المنشأة</th>
                  <th className="py-3 px-3">كود السجل</th>
                  <th className="py-3 px-3">البيان السابق</th>
                  <th className="py-3 px-3">البيان اللاحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(state.auditLogs || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                      لا توجد سجلات تدقيق مسجلة حتى الآن
                    </td>
                  </tr>
                ) : (
                  (state.auditLogs || []).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-600">
                        {new Date(log.timestamp).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <div>{log.userFullName}</div>
                        <div className="text-[10px] font-mono text-slate-400">@{log.username}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            log.actionType === 'حذف'
                              ? 'bg-rose-100 text-rose-900'
                              : log.actionType === 'تعديل'
                              ? 'bg-amber-100 text-amber-900'
                              : log.actionType === 'إضافة'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-blue-100 text-blue-900'
                          }`}
                        >
                          {log.actionType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-black text-[#0A1931]">{log.entityName}</td>
                      <td className="py-2.5 px-3 font-mono font-bold">{log.entityId}</td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{log.beforeSummary || '—'}</td>
                      <td className="py-2.5 px-3 text-[#0A1931] font-bold max-w-xs truncate">
                        {log.afterSummary || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: UNIFIED HISTORICAL DOSSIER (الملف التاريخي الموحد للمنشأة)
         ===================================================================== */}
      {selectedDossierEst && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 bg-[#0A1931] text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-[#D4AF37] text-[#0A1931] text-xs font-mono font-black">
                    {selectedDossierEst.establishmentCode}
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-white/15 text-white text-xs font-bold">
                    {selectedDossierEst.establishmentType}
                  </span>
                </div>
                <h3 className="text-lg font-black mt-1">
                  الملف التاريخي الموحد للمنشأة: {selectedDossierEst.establishmentName}
                </h3>
                <p className="text-xs text-slate-300 font-bold">
                  المالك: {selectedDossierEst.ownerName} | القرية: {selectedDossierEst.village} ({selectedDossierEst.localUnit})
                </p>
              </div>
              <div className="flex items-center gap-2">
                {permissions.canPrint && (
                  <button
                    type="button"
                    onClick={() => {
                      const timeline = buildEstablishmentTimeline(selectedDossierEst);
                      const rowsHtml = timeline
                        .map(
                          (ev) =>
                            `<tr><td>${ev.date}</td><td>${ev.type}</td><td>${ev.referenceNo}</td><td>${ev.title}</td><td>${ev.description}</td></tr>`
                        )
                        .join('');
                      handlePrintOfficialReport(
                        `الملف التاريخي الموحد للمنشأة: ${selectedDossierEst.establishmentName} (${selectedDossierEst.establishmentCode})`,
                        `<p><strong>المالك:</strong> ${selectedDossierEst.ownerName} | <strong>الرقم القومي:</strong> ${selectedDossierEst.nationalId} | <strong>الترخيص:</strong> ${selectedDossierEst.licenseNumber} | <strong>السجل التجاري:</strong> ${selectedDossierEst.commercialRegNumber}</p>
                         <table><thead><tr><th>التاريخ</th><th>نوع الإجراء</th><th>رقم المرجع</th><th>البيان</th><th>التفاصيل والنتيجة</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
                      );
                    }}
                    className="px-3.5 py-2 bg-[#D4AF37] text-[#0A1931] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الملف الكامل (A4 PDF)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedDossierEst(null)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black cursor-pointer"
                >
                  إغلاق ✕
                </button>
              </div>
            </div>

            {/* Dossier Tabs */}
            <div className="px-5 pt-3 border-b border-slate-200 flex items-center gap-2 bg-[#F8FAFC]">
              {[
                { id: 'timeline', label: 'التاريخ الرقابي للمنشأة (التسلسل الزمني الشامل)' },
                { id: 'overview', label: 'البيانات الأساسية والتراخيص والمستندات' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDossierActiveTab(t.id as 'timeline' | 'overview')}
                  className={`px-4 py-2.5 rounded-t-xl text-xs font-black border-t-2 border-x-2 transition cursor-pointer ${
                    dossierActiveTab === t.id
                      ? 'bg-white text-[#0A1931] border-[#0A1931]'
                      : 'bg-slate-100 text-slate-600 border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {dossierActiveTab === 'timeline' ? (
                <div className="space-y-3">
                  <div className="text-xs font-black text-[#0A1931] mb-2">
                    سجل «التاريخ الرقابي للمنشأة» مرتباً زمنياً (الزيارات، الحملات، المحاضر، المضبوطات، الشكاوى، التصالحات، والغلق):
                  </div>
                  {buildEstablishmentTimeline(selectedDossierEst).map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl border-2 border-slate-200 bg-[#F8FAFC] flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-md border text-[11px] font-black ${ev.badgeColor}`}>
                            {ev.type}
                          </span>
                          <span className="font-mono text-xs font-black text-[#0A1931]">
                            مرجع: {ev.referenceNo}
                          </span>
                        </div>
                        <div className="text-sm font-black text-[#0A1931]">{ev.title}</div>
                        <div className="text-xs font-semibold text-slate-600">{ev.description}</div>
                      </div>
                      <div className="px-3 py-1 rounded-xl bg-white border border-slate-300 font-mono text-xs font-black text-[#0A1931] shrink-0">
                        {ev.date}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">الرقم القومي للمالك</div>
                    <div className="font-mono font-black text-sm mt-0.5">{selectedDossierEst.nationalId}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">رقم الهاتف</div>
                    <div className="font-mono font-black text-sm mt-0.5">{selectedDossierEst.phone}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">العنوان التفصيلي</div>
                    <div className="font-black text-sm mt-0.5">{selectedDossierEst.detailedAddress}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">السجل التجاري وانتهاؤه</div>
                    <div className="font-mono font-black text-sm mt-0.5">
                      {selectedDossierEst.commercialRegNumber} (حتى {selectedDossierEst.commercialRegExpiryDate})
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">البطاقة الضريبية</div>
                    <div className="font-mono font-black text-sm mt-0.5">{selectedDossierEst.taxCardNumber}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-bold">الترخيص وانتهاؤه</div>
                    <div className="font-mono font-black text-sm mt-0.5">
                      {selectedDossierEst.licenseNumber} (حتى {selectedDossierEst.licenseExpiryDate})
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT ESTABLISHMENT
         ===================================================================== */}
      {isEstModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newRec: InternalTradeEstablishment = {
                id: editingEst?.id || `it-est-${Date.now()}`,
                establishmentCode:
                  String(fd.get('establishmentCode') || '').trim() ||
                  `IT-2026-${100 + state.establishments.length + 1}`,
                ownerName: String(fd.get('ownerName') || '').trim(),
                establishmentName: String(fd.get('establishmentName') || '').trim(),
                nationalId: String(fd.get('nationalId') || '').trim(),
                phone: String(fd.get('phone') || '').trim(),
                governorate: 'الغربية',
                center: 'المحلة الكبرى',
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                detailedAddress: String(fd.get('detailedAddress') || '').trim(),
                establishmentType: (fd.get('establishmentType') as UnifiedEstablishmentType) || 'محل تجاري',
                activityType: String(fd.get('activityType') || 'تجارة سلع غذائية'),
                activityCategory: String(fd.get('activityCategory') || 'السلع الغذائية والاستهلاكية'),
                commercialRegNumber: String(fd.get('commercialRegNumber') || 'س.ت-جديد'),
                commercialRegIssueDate: '2024-01-01',
                commercialRegExpiryDate: String(fd.get('commercialRegExpiryDate') || '2028-01-01'),
                taxCardNumber: String(fd.get('taxCardNumber') || 'ب.ض-جديد'),
                taxCardIssueDate: '2024-01-01',
                licenseNumber: String(fd.get('licenseNumber') || 'ترخيص-جديد'),
                licenseIssuingEntity: 'الوحدة المحلية / التموين',
                licenseIssueDate: '2024-01-01',
                licenseExpiryDate: String(fd.get('licenseExpiryDate') || '2028-01-01'),
                activityStatus: (fd.get('activityStatus') as EstablishmentActivityStatus) || 'نشط',
                activityStartDate: new Date().toISOString().slice(0, 10),
                notes: String(fd.get('notes') || ''),
                attachments: ['صورة بطاقة الرقم القومي.pdf', 'صورة السجل التجاري والترخيص.pdf'],
              };
              const nextEsts = editingEst
                ? state.establishments.map((x) => (x.id === editingEst.id ? newRec : x))
                : [newRec, ...state.establishments];
              onChangeState(
                { ...state, establishments: nextEsts },
                `تم حفظ بيانات المنشأة "${newRec.establishmentName}" في قاعدة بيانات التجارة الداخلية`
              );
              setIsEstModalOpen(false);
              setEditingEst(null);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-[#0A1931]">
              {editingEst ? 'تعديل بيانات المنشأة التجارية' : 'إضافة منشأة جديدة بالمركز الرقابي الموحد'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم المحل / المنشأة التجارية *</label>
                <input
                  name="establishmentName"
                  required
                  defaultValue={editingEst?.establishmentName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">اسم صاحب المنشأة *</label>
                <input
                  name="ownerName"
                  required
                  defaultValue={editingEst?.ownerName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">نوع المنشأة *</label>
                <select
                  name="establishmentType"
                  defaultValue={editingEst?.establishmentType || 'محل تجاري'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {ESTABLISHMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع النشاط التجاري *</label>
                <input
                  name="activityType"
                  required
                  defaultValue={editingEst?.activityType || 'بقالة وتموين ومواد غذائية'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الرقم القومي *</label>
                <input
                  name="nationalId"
                  required
                  defaultValue={editingEst?.nationalId || '28201011601234'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم الهاتف *</label>
                <input
                  name="phone"
                  required
                  defaultValue={editingEst?.phone || '01012345678'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select
                  name="village"
                  defaultValue={editingEst?.village || uniqueVillages[0] || 'بلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">الوحدة المحلية *</label>
                <select
                  name="localUnit"
                  defaultValue={editingEst?.localUnit || uniqueLocalUnits[0] || 'الوحدة المحلية ببلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueLocalUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">رقم السجل التجاري</label>
                <input
                  name="commercialRegNumber"
                  defaultValue={editingEst?.commercialRegNumber || '54210-غربية'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم البطاقة الضريبية</label>
                <input
                  name="taxCardNumber"
                  defaultValue={editingEst?.taxCardNumber || '412-890-112'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم الترخيص</label>
                <input
                  name="licenseNumber"
                  defaultValue={editingEst?.licenseNumber || 'ترخيص-901/2026'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">حالة النشاط</label>
                <select
                  name="activityStatus"
                  defaultValue={editingEst?.activityStatus || 'نشط'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {ESTABLISHMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="font-black block mb-1">العنوان التفصيلي</label>
                <input
                  name="detailedAddress"
                  defaultValue={editingEst?.detailedAddress || 'الشارع الرئيسي - مركز المحلة الكبرى'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEstModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ المنشأة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT LPG VILLAGE QUOTA
         ===================================================================== */}
      {isLpgQuotaModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const rec: LpgVillageCirculationRecord = {
                id: editingLpgRecord?.id || `lpg-vil-${Date.now()}`,
                serialNo: editingLpgRecord?.serialNo || state.lpgVillageCirculation.length + 1,
                villageCode: String(fd.get('villageCode') || `VIL-MHL-${state.lpgVillageCirculation.length + 1}`),
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                population: Number(fd.get('population') || 25000),
                familiesCount: Number(fd.get('familiesCount') || 5200),
                beneficiariesCount: Number(fd.get('population') || 25000),
                depotsCount: Number(fd.get('depotsCount') || 1),
                distributorsCount: Number(fd.get('distributorsCount') || 3),
                cylinderType:
                  (fd.get('cylinderType') as 'أسطوانة منزلية' | 'أسطوانة تجارية' | 'أسطوانة أخرى') ||
                  'أسطوانة منزلية',
                cylinderWeightKg: Number(fd.get('cylinderWeightKg') || 12.5),
                prescribedMonthlyQuota: Number(fd.get('prescribedMonthlyQuota') || 9500),
                prescribedDailyQuota: Math.round(Number(fd.get('prescribedMonthlyQuota') || 9500) / 30),
                actualInboundQty: Number(fd.get('actualInboundQty') || 9300),
                actualDisbursedQty: Number(fd.get('actualDisbursedQty') || 9150),
                monthKey: '2026-05',
                notes: String(fd.get('notes') || ''),
              };
              const nextList = editingLpgRecord
                ? state.lpgVillageCirculation.map((x) => (x.id === editingLpgRecord.id ? rec : x))
                : [...state.lpgVillageCirculation, rec];
              onChangeState(
                { ...state, lpgVillageCirculation: nextList },
                `تم تحديث بيانات تداول أسطوانات البوتاجاز ومتوسط نصيب الفرد لقرية "${rec.village}"`
              );
              setIsLpgQuotaModalOpen(false);
              setEditingLpgRecord(null);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-xl w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">
              {editingLpgRecord
                ? `تعديل بيانات البوتاجاز لقرية ${editingLpgRecord.village}`
                : 'إضافة سجل تداول أسطوانات بوتاجاز لقرية'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم القرية *</label>
                <input
                  name="village"
                  required
                  defaultValue={editingLpgRecord?.village || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوحدة المحلية *</label>
                <input
                  name="localUnit"
                  required
                  defaultValue={editingLpgRecord?.localUnit || 'الوحدة المحلية'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد السكان *</label>
                <input
                  name="population"
                  type="number"
                  min={1}
                  required
                  defaultValue={editingLpgRecord?.population || 30000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد الأسر *</label>
                <input
                  name="familiesCount"
                  type="number"
                  min={1}
                  required
                  defaultValue={editingLpgRecord?.familiesCount || 6000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">نوع الأسطوانة</label>
                <select
                  name="cylinderType"
                  defaultValue={editingLpgRecord?.cylinderType || 'أسطوانة منزلية'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="أسطوانة منزلية">أسطوانة منزلية (12.5 كجم)</option>
                  <option value="أسطوانة تجارية">أسطوانة تجارية (25 كجم)</option>
                  <option value="أسطوانة أخرى">أسطوانة أخرى</option>
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">وزن الأسطوانة (كجم)</label>
                <input
                  name="cylinderWeightKg"
                  type="number"
                  step="0.5"
                  defaultValue={editingLpgRecord?.cylinderWeightKg || 12.5}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الحصة الشهرية المقررة (أسطوانة)</label>
                <input
                  name="prescribedMonthlyQuota"
                  type="number"
                  min={0}
                  required
                  defaultValue={editingLpgRecord?.prescribedMonthlyQuota || 9500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوارد الفعلي (أسطوانة)</label>
                <input
                  name="actualInboundQty"
                  type="number"
                  min={0}
                  required
                  defaultValue={editingLpgRecord?.actualInboundQty || 9300}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="font-black block mb-1">المنصرف الفعلي للمواطنين (أسطوانة)</label>
                <input
                  name="actualDisbursedQty"
                  type="number"
                  min={0}
                  required
                  defaultValue={editingLpgRecord?.actualDisbursedQty || 9100}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsLpgQuotaModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ وحساب نصيب الفرد تلقائياً
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD CAMPAIGN
         ===================================================================== */}
      {isCampaignModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const inspected = Number(fd.get('inspectedCount') || 15);
              const violating = Number(fd.get('violatingCount') || 3);
              const compliant = Math.max(0, inspected - violating);
              const newCamp: InternalTradeCampaign = {
                id: `camp-${Date.now()}`,
                campaignNumber: `CMP-2026-0${state.campaigns.length + 1}`,
                campaignDate: String(fd.get('campaignDate') || new Date().toISOString().slice(0, 10)),
                campaignTime: '10:00 ص',
                campaignType:
                  (fd.get('campaignType') as 'دورية' | 'مفاجئة' | 'مشتركة' | 'بناءً على شكوى' | 'ليلية') ||
                  'دورية',
                geographicScope: String(fd.get('geographicScope') || 'قرى مركز المحلة الكبرى'),
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                campaignHead: String(fd.get('campaignHead') || 'رئيس قسم التجارة الداخلية'),
                campaignMembers: String(fd.get('campaignMembers') || 'مفتش أول الرقابة، مفتش التجارة الداخلية')
                  .split('،')
                  .map((s) => s.trim()),
                inspectedCount: inspected,
                compliantCount: compliant,
                violatingCount: violating,
                reportsIssuedCount: Number(fd.get('reportsIssuedCount') || violating),
                totalSeizuresCount: Number(fd.get('totalSeizuresCount') || 1),
                totalReservedQtySummary: String(fd.get('totalReservedQtySummary') || 'لا توجد مضبوطات متحفظ عليها'),
                visitedEstablishmentCodes: [],
                finalReportSubmitted: true,
                notes: String(fd.get('notes') || ''),
                attachments: ['تقرير الحملة التموينية.pdf'],
              };
              onChangeState(
                { ...state, campaigns: [newCamp, ...state.campaigns] },
                `تم تسجيل الحملة التموينية رقم ${newCamp.campaignNumber} وحساب مؤشرات الأداء تلقائياً`
              );
              setIsCampaignModalOpen(false);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">تسجيل حملة تموينية جديدة</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">تاريخ الحملة *</label>
                <input
                  name="campaignDate"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">نوع الحملة *</label>
                <select
                  name="campaignType"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="دورية">دورية</option>
                  <option value="مفاجئة">مفاجئة</option>
                  <option value="مشتركة">مشتركة</option>
                  <option value="بناءً على شكوى">بناءً على شكوى</option>
                  <option value="ليلية">ليلية</option>
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select
                  name="village"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">رئيس الحملة *</label>
                <input
                  name="campaignHead"
                  required
                  defaultValue="أ/ طارق عبد السلام الشافعي"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد المنشآت المفتش عليها *</label>
                <input
                  name="inspectedCount"
                  type="number"
                  min={0}
                  defaultValue={20}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد المنشآت المخالفة *</label>
                <input
                  name="violatingCount"
                  type="number"
                  min={0}
                  defaultValue={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد المحاضر المحررة *</label>
                <input
                  name="reportsIssuedCount"
                  type="number"
                  min={0}
                  defaultValue={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">ملخص المضبوطات</label>
                <input
                  name="totalReservedQtySummary"
                  defaultValue="ضبط سلع مجهولة المصدر"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsCampaignModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ الحملة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD VIOLATION REPORT
         ===================================================================== */}
      {isViolationModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const targetCode = String(fd.get('establishmentCode') || state.establishments[0]?.establishmentCode || 'IT-2026-101');
              const matchedEst = allUnifiedEstablishments.find((x) => x.establishmentCode === targetCode);
              const newVio: InternalTradeViolationReport = {
                id: `vio-${Date.now()}`,
                reportNumber: String(fd.get('reportNumber') || `${1480 + state.violations.length} جنح أمن دولة طوارئ`),
                reportDate: String(fd.get('reportDate') || new Date().toISOString().slice(0, 10)),
                reportTime: '11:30 ص',
                ownerName: matchedEst?.ownerName || String(fd.get('ownerName') || 'مخالف تمويني'),
                establishmentCode: targetCode,
                establishmentName: matchedEst?.establishmentName || 'منشأة تجارية',
                activityType: matchedEst?.activityType || 'تجارة داخلية',
                address: matchedEst?.detailedAddress || 'مركز المحلة الكبرى',
                village: matchedEst?.village || 'بلقينا',
                localUnit: matchedEst?.localUnit || 'الوحدة المحلية ببلقينا',
                violationType: String(fd.get('violationType') || 'عدم إعلان أسعار'),
                violationDescription: String(fd.get('violationDescription') || 'تحرير محضر مخالفة تموينية خلال المرور الميداني'),
                governingLawOrDecision: String(fd.get('governingLawOrDecision') || 'المرسوم بقانون 95 لسنة 1945'),
                legalArticle: 'المادة 13',
                fineAmount: Number(fd.get('fineAmount') || 5000),
                issuingEntity: 'قسم التجارة الداخلية بتموين مركز المحلة',
                caseNumber: String(fd.get('caseNumber') || `قضية ${2100 + state.violations.length} لسنة 2026`),
                prosecutionEntity: 'نيابة مركز المحلة الكبرى',
                status: 'تم الإرسال',
                dispositionResult: 'قيد العرض على النيابة',
                reconciliationAmount: 0,
                paymentDate: '',
                paymentMethod: 'لم يسدد بعد',
                attachments: ['صورة المحضر الرسمي.pdf'],
              };
              onChangeState(
                { ...state, violations: [newVio, ...state.violations] },
                `تم تسجيل المحضر رقم "${newVio.reportNumber}" وربطه بالملف التاريخي للمنشأة`
              );
              setIsViolationModalOpen(false);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">تحرير محضر مخالفة تموينية جديد</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">رقم المحضر *</label>
                <input
                  name="reportNumber"
                  required
                  defaultValue={`${1520 + state.violations.length} جنح تموين مركز المحلة`}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">تاريخ المحضر *</label>
                <input
                  name="reportDate"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="font-black block mb-1">المنشأة المرتبطة بالمحضر *</label>
                <select
                  name="establishmentCode"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {allUnifiedEstablishments.slice(0, 60).map((est) => (
                    <option key={est.id} value={est.establishmentCode}>
                      {est.establishmentCode} — {est.establishmentName} ({est.village})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع المخالفة *</label>
                <select
                  name="violationType"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="عدم الإعلان عن الأسعار">عدم الإعلان عن الأسعار</option>
                  <option value="البيع بأزيد من السعر الرسمي">البيع بأزيد من السعر الرسمي</option>
                  <option value="حيازة سلع منتهية الصلاحية أو مجهولة المصدر">حيازة سلع منتهية الصلاحية أو مجهولة المصدر</option>
                  <option value="التصرف في حصة أسطوانات البوتاجاز">التصرف في حصة أسطوانات البوتاجاز</option>
                  <option value="غش تجاري وتلاعب في عدادات محطة وقود">غش تجاري وتلاعب في عدادات محطة وقود</option>
                  <option value="إدارة منشأة بدون ترخيص">إدارة منشأة بدون ترخيص</option>
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">الغرامة المقررة (ج.م) *</label>
                <input
                  name="fineAmount"
                  type="number"
                  min={0}
                  defaultValue={5000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="font-black block mb-1">وصف المخالفة بالتفصيل</label>
                <input
                  name="violationDescription"
                  defaultValue="ضبط مخالفة تموينية أثناء حملة التفتيش والرقابة التجارية"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsViolationModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ المحضر
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD SEIZURE RECORD
         ===================================================================== */}
      {isSeizureModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const qty = Number(fd.get('quantity') || 100);
              const unitPrice = Number(fd.get('unitPrice') || 45);
              const newSeiz: InternalTradeSeizureRecord = {
                id: `seiz-${Date.now()}`,
                seizureOrderNumber: `SEZ-2026-0${state.seizures.length + 1}`,
                linkedReportNumber: String(fd.get('linkedReportNumber') || state.violations[0]?.reportNumber || '1425 جنح تموين'),
                seizureDate: String(fd.get('seizureDate') || new Date().toISOString().slice(0, 10)),
                establishmentCode: String(fd.get('establishmentCode') || 'IT-2026-101'),
                establishmentName: String(fd.get('establishmentName') || 'منشأة تجارية'),
                ownerName: String(fd.get('ownerName') || 'تاجر تمويني'),
                village: String(fd.get('village') || 'بلقينا'),
                commodityType: String(fd.get('commodityType') || 'سلع غذائية'),
                commodityDescription: String(fd.get('commodityDescription') || 'مضبوطات متحفظ عليها لحين قرار النيابة'),
                quantity: qty,
                unit: String(fd.get('unit') || 'كجم'),
                unitPrice,
                totalValue: Number((qty * unitPrice).toFixed(2)),
                storageLocation: String(fd.get('storageLocation') || 'مخزن التحفظ المركزي بالمحلة'),
                seizureStatus: 'متحفظ عليها',
                dispositionDate: '',
                dispositionEntity: 'النيابة العامة',
                dispositionResult: 'قيد العرض على النيابة',
                notes: '',
                attachments: ['محضر التحفظ الرسمي.pdf'],
              };
              onChangeState(
                { ...state, seizures: [newSeiz, ...state.seizures] },
                `تم تسجيل محضر الضبط رقم ${newSeiz.seizureOrderNumber} بإجمالي قيمة ${newSeiz.totalValue.toLocaleString()} ج.م`
              );
              setIsSeizureModalOpen(false);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">تسجيل محضر ضبط وتحفظ جديد</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم المنشأة *</label>
                <input
                  name="establishmentName"
                  required
                  defaultValue="مخزن سلع غذائية"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select
                  name="village"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع السلعة المضبوطة *</label>
                <input
                  name="commodityType"
                  required
                  defaultValue="سكر وأرز وزيت طعام"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوحدة *</label>
                <input
                  name="unit"
                  required
                  defaultValue="كجم"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الكمية المضبوطة *</label>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  required
                  defaultValue={250}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">سعر الوحدة التقديري (ج.م) *</label>
                <input
                  name="unitPrice"
                  type="number"
                  min={1}
                  required
                  defaultValue={35}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsSeizureModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ المضبوطات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD COMPLAINT RECORD
         ===================================================================== */}
      {isComplaintModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newCmp: InternalTradeComplaintRecord = {
                id: `cmp-${Date.now()}`,
                complaintNumber: `SHK-2026-0${state.complaints.length + 1}`,
                receivedDate: new Date().toISOString().slice(0, 10),
                source:
                  (fd.get('source') as InternalTradeComplaintRecord['source']) || 'بوابة الشكاوى الحكومية',
                complainantName: String(fd.get('complainantName') || 'مواطن'),
                phone: String(fd.get('phone') || '01000000000'),
                subject: String(fd.get('subject') || 'شكوى تموينية'),
                targetEstablishmentName: String(fd.get('targetEstablishmentName') || 'منشأة تجارية'),
                targetAddress: 'مركز المحلة الكبرى',
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: 'الوحدة المحلية',
                complaintType:
                  (fd.get('complaintType') as InternalTradeComplaintRecord['complaintType']) ||
                  'مغالاة في الأسعار',
                assignedEmployee: String(fd.get('assignedEmployee') || 'مفتش التجارة الداخلية'),
                inspectionDate: new Date().toISOString().slice(0, 10),
                inspectionResult: 'قيد المعاينة الميدانية والفحص',
                actionTaken: 'تكليف حملة لفحص الشكوى',
                status: 'قيد الفحص',
                closureDate: '',
                attachments: [],
              };
              onChangeState(
                { ...state, complaints: [newCmp, ...state.complaints] },
                `تم تسجيل الشكوى رقم ${newCmp.complaintNumber} وتكليف مفتش التجارة الداخلية بفحصها`
              );
              setIsComplaintModalOpen(false);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">تسجيل شكوى أو بلاغ تمويني جديد</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم مقدم الشكوى *</label>
                <input
                  name="complainantName"
                  required
                  defaultValue="أحمد محمود المواطن"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم الهاتف *</label>
                <input
                  name="phone"
                  required
                  defaultValue="01011223344"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">مصدر الشكوى</label>
                <select name="source" className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold">
                  <option value="بوابة الشكاوى الحكومية">بوابة الشكاوى الحكومية</option>
                  <option value="الخط الساخن 16528">الخط الساخن 16528</option>
                  <option value="حضور شخصي">حضور شخصي</option>
                  <option value="مديرية التموين">مديرية التموين</option>
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع الشكوى</label>
                <select
                  name="complaintType"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="مغالاة في الأسعار">مغالاة في الأسعار</option>
                  <option value="نقص وزن / أسطوانات">نقص وزن / أسطوانات</option>
                  <option value="سلع منتهية الصلاحية">سلع منتهية الصلاحية</option>
                  <option value="امتناع عن البيع">امتناع عن البيع</option>
                  <option value="غش تجاري">غش تجاري</option>
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">المنشأة المشكو في حقها *</label>
                <input
                  name="targetEstablishmentName"
                  required
                  defaultValue="محل تجاري / مستودع"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select name="village" className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold">
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="font-black block mb-1">موضوع الشكوى بالتفصيل *</label>
                <input
                  name="subject"
                  required
                  defaultValue="البيع بأزيد من السعر المعلن وعدم إعطاء فاتورة"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsComplaintModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ الشكوى
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD MARKET PRICE OBSERVATION
         ===================================================================== */}
      {isPriceModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const newPrice: InternalTradeMarketPriceRecord = {
                id: `price-${Date.now()}`,
                commodityCode: `CMD-0${state.marketPrices.length + 1}`,
                commodityName: String(fd.get('commodityName') || 'أرز أبيض معبأ'),
                category: String(fd.get('category') || 'سلع أساسية'),
                unit: String(fd.get('unit') || 'كجم'),
                declaredPrice: Number(fd.get('declaredPrice') || 30),
                actualMarketPrice: Number(fd.get('actualMarketPrice') || 32),
                previousPeriodPrice: Number(fd.get('previousPeriodPrice') || 31),
                establishmentName: String(fd.get('establishmentName') || 'سوبر ماركت بالقرية'),
                observationDate: new Date().toISOString().slice(0, 10),
                monthKey: '2026-05',
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: 'الوحدة المحلية',
                observerEmployee: currentUser?.fullName || 'مفتش متابعة الأسواق',
                notes: '',
              };
              onChangeState(
                { ...state, marketPrices: [newPrice, ...state.marketPrices] },
                `تم رصد سعر السلعة "${newPrice.commodityName}" في قرية ${newPrice.village}`
              );
              setIsPriceModalOpen(false);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">رصد سعر سلعة بالأسواق</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم السلعة *</label>
                <input
                  name="commodityName"
                  required
                  defaultValue="سكر أبيض معبأ 1 كجم"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوحدة *</label>
                <input
                  name="unit"
                  required
                  defaultValue="كجم"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">السعر الاسترشادي / الرسمي (ج.م) *</label>
                <input
                  name="declaredPrice"
                  type="number"
                  step="0.5"
                  required
                  defaultValue={30}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">السعر الفعلي بالسوق (ج.م) *</label>
                <input
                  name="actualMarketPrice"
                  type="number"
                  step="0.5"
                  required
                  defaultValue={33}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select name="village" className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold">
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">المنشأة التي تم الرصد بها</label>
                <input
                  name="establishmentName"
                  defaultValue="هايبر وسوبر ماركت القرية"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsPriceModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ الرصد السعري
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT PETROLEUM VILLAGE CIRCULATION RECORD
         ===================================================================== */}
      {isPetroQuotaModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            key={editingPetroRecord?.id || 'new-petro'}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const rec: PetroleumVillageCirculationRecord = {
                id: editingPetroRecord?.id || `petro-${Date.now()}`,
                serialNo: editingPetroRecord?.serialNo || state.petroleumVillageCirculation.length + 1,
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                population: Number(fd.get('population') || 35000),
                stationsCount: 1,
                fuelType: String(fd.get('fuelType') || 'السولار'),
                unit: 'لتر',
                openingBalanceLiters: Number(fd.get('openingBalanceLiters') || 15000),
                inboundLiters: Number(fd.get('inboundLiters') || 120000),
                disbursedLiters: Number(fd.get('disbursedLiters') || 118000),
                prescribedQuotaLiters: Number(fd.get('prescribedQuotaLiters') || 125000),
                monthKey: '2026-05',
                notes: '',
              };
              const nextList = editingPetroRecord
                ? state.petroleumVillageCirculation.map((x) => (x.id === editingPetroRecord.id ? rec : x))
                : [rec, ...state.petroleumVillageCirculation];
              commitInternalTradeState(
                { petroleumVillageCirculation: nextList },
                `تم تسجيل بيانات تداول "${rec.fuelType}" لقرية ${rec.village} وحساب نصيب الفرد باللتر تلقائياً`,
                {
                  actionType: editingPetroRecord ? 'تعديل' : 'إضافة',
                  entityName: 'تداول مواد بترولية',
                  entityId: `${rec.village}-${rec.fuelType}`,
                  beforeSummary: editingPetroRecord?.fuelType,
                  afterSummary: `${rec.disbursedLiters} لتر`,
                }
              );
              setIsPetroQuotaModalOpen(false);
              setEditingPetroRecord(null);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">
              {editingPetroRecord
                ? `تعديل سجل ${editingPetroRecord.fuelType} لقرية ${editingPetroRecord.village}`
                : 'إضافة سجل تداول مادة بترولية باللتر (مستقل لكل نوع وقود)'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select
                  name="village"
                  defaultValue={editingPetroRecord?.village || uniqueVillages[0] || 'بلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع المادة البترولية *</label>
                <select
                  name="fuelType"
                  defaultValue={editingPetroRecord?.fuelType || 'السولار'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {FUEL_TYPES.map((ft) => (
                    <option key={ft} value={ft}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">عدد السكان *</label>
                <input
                  name="population"
                  type="number"
                  min={1}
                  defaultValue={editingPetroRecord?.population || 38000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رصيد أول المدة (لتر)</label>
                <input
                  name="openingBalanceLiters"
                  type="number"
                  min={0}
                  defaultValue={editingPetroRecord?.openingBalanceLiters ?? 12000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الكمية الواردة (لتر) *</label>
                <input
                  name="inboundLiters"
                  type="number"
                  min={0}
                  defaultValue={editingPetroRecord?.inboundLiters ?? 95000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">المنصرف الفعلي (لتر) *</label>
                <input
                  name="disbursedLiters"
                  type="number"
                  min={0}
                  defaultValue={editingPetroRecord?.disbursedLiters ?? 92000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsPetroQuotaModalOpen(false);
                  setEditingPetroRecord(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ وحساب نصيب الفرد باللتر
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT FUEL STATION
         ===================================================================== */}
      {isFuelStationModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            key={editingFuelStation?.id || 'new-station'}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const rec: FuelStationControlRecord = {
                id: editingFuelStation?.id || `st-${Date.now()}`,
                stationCode:
                  editingFuelStation?.stationCode ||
                  String(fd.get('stationCode') || `ST-MHL-0${state.fuelStations.length + 1}`),
                stationName: String(fd.get('stationName') || 'محطة وقود جديدة'),
                ownerName: String(fd.get('ownerName') || 'صاحب المحطة'),
                managerName: String(fd.get('managerName') || 'مدير المحطة'),
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                address: String(fd.get('address') || 'طريق المحلة'),
                distributionCompany: String(fd.get('distributionCompany') || 'مصر للبترول'),
                availableFuelTypes: ['بنزين 80', 'بنزين 92', 'السولار'],
                tanksCount: Number(fd.get('tanksCount') || 4),
                tankCapacityLiters: Number(fd.get('tankCapacityLiters') || 90000),
                pumpMetersReadingSummary: 'عدادات سرية إلكترونية سليمة',
                primaryFuelType: String(fd.get('primaryFuelType') || 'السولار'),
                openingBalanceLiters: Number(fd.get('openingBalanceLiters') || 25000),
                inboundLiters: Number(fd.get('inboundLiters') || 120000),
                soldDisbursedLiters: Number(fd.get('soldDisbursedLiters') || 115000),
                actualStockLiters: Number(fd.get('actualStockLiters') || 30000),
                lastInventoryDate: new Date().toISOString().slice(0, 10),
                licenseStatus: 'ساري',
                stationStatus: (fd.get('stationStatus') as FuelStationControlRecord['stationStatus']) || 'تعمل بانتظام',
                inspectionActionTaken: String(fd.get('inspectionActionTaken') || 'مطابق للسجلات'),
                notes: '',
              };
              const nextList = editingFuelStation
                ? state.fuelStations.map((x) => (x.id === editingFuelStation.id ? rec : x))
                : [rec, ...state.fuelStations];
              commitInternalTradeState(
                { fuelStations: nextList },
                `تم حفظ بيانات محطة الوقود "${rec.stationName}" ومطابقة الرصيد الدفتري بالفعلي`,
                {
                  actionType: editingFuelStation ? 'تعديل' : 'إضافة',
                  entityName: 'محطة وقود',
                  entityId: rec.stationCode,
                  beforeSummary: editingFuelStation?.stationName,
                  afterSummary: rec.stationName,
                }
              );
              setIsFuelStationModalOpen(false);
              setEditingFuelStation(null);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-[#0A1931]">
              {editingFuelStation ? `تعديل بيانات محطة ${editingFuelStation.stationName}` : 'إضافة محطة وقود جديدة'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم المحطة *</label>
                <input
                  name="stationName"
                  required
                  defaultValue={editingFuelStation?.stationName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">شركة التوزيع *</label>
                <input
                  name="distributionCompany"
                  required
                  defaultValue={editingFuelStation?.distributionCompany || 'مصر للبترول'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">اسم المدير المسؤول *</label>
                <input
                  name="managerName"
                  required
                  defaultValue={editingFuelStation?.managerName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوقود الرئيسي *</label>
                <select
                  name="primaryFuelType"
                  defaultValue={editingFuelStation?.primaryFuelType || 'السولار'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select
                  name="village"
                  defaultValue={editingFuelStation?.village || uniqueVillages[0] || 'بلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">الوحدة المحلية *</label>
                <input
                  name="localUnit"
                  defaultValue={editingFuelStation?.localUnit || 'الوحدة المحلية ببلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد الخزانات *</label>
                <input
                  name="tanksCount"
                  type="number"
                  min={1}
                  defaultValue={editingFuelStation?.tanksCount ?? 4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">إجمالي سعة الخزانات (لتر) *</label>
                <input
                  name="tankCapacityLiters"
                  type="number"
                  min={1000}
                  defaultValue={editingFuelStation?.tankCapacityLiters ?? 90000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رصيد أول المدة (لتر) *</label>
                <input
                  name="openingBalanceLiters"
                  type="number"
                  min={0}
                  defaultValue={editingFuelStation?.openingBalanceLiters ?? 20000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوارد الفعلي (لتر) *</label>
                <input
                  name="inboundLiters"
                  type="number"
                  min={0}
                  defaultValue={editingFuelStation?.inboundLiters ?? 110000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">المنصرف والمبيعات (لتر) *</label>
                <input
                  name="soldDisbursedLiters"
                  type="number"
                  min={0}
                  defaultValue={editingFuelStation?.soldDisbursedLiters ?? 105000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الرصيد الفعلي بالجرد (لتر) *</label>
                <input
                  name="actualStockLiters"
                  type="number"
                  min={0}
                  defaultValue={editingFuelStation?.actualStockLiters ?? 25000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsFuelStationModalOpen(false);
                  setEditingFuelStation(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ المحطة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT LPG DEPOT
         ===================================================================== */}
      {isLpgDepotModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            key={editingLpgDepot?.id || 'new-depot'}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const rec: LpgDepotControlRecord = {
                id: editingLpgDepot?.id || `depot-${Date.now()}`,
                depotCode:
                  editingLpgDepot?.depotCode ||
                  String(fd.get('depotCode') || `DPT-MHL-0${state.lpgDepots.length + 1}`),
                depotName: String(fd.get('depotName') || 'مستودع بوتاجاز'),
                ownerName: String(fd.get('ownerName') || 'صاحب المستودع'),
                managerName: String(fd.get('managerName') || 'مدير المستودع'),
                address: String(fd.get('address') || 'مركز المحلة'),
                village: String(fd.get('village') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                licenseNumber: String(fd.get('licenseNumber') || 'ترخيص-بوتاجاز-99'),
                licenseExpiryDate: String(fd.get('licenseExpiryDate') || '2027-12-31'),
                prescribedQuota: Number(fd.get('prescribedQuota') || 15000),
                inboundCylinders: Number(fd.get('inboundCylinders') || 14800),
                disbursedCylinders: Number(fd.get('disbursedCylinders') || 14500),
                fullCylindersCount: Number(fd.get('fullCylindersCount') || 300),
                emptyCylindersCount: Number(fd.get('emptyCylindersCount') || 280),
                damagedCylindersCount: Number(fd.get('damagedCylindersCount') || 15),
                inventoryResult: 'مطابق للجرد الفعلي',
                campaignsSummary: 'تم التفتيش الدوري عليه',
                violationsSummary: '',
                affiliatedDistributorsCount: Number(fd.get('affiliatedDistributorsCount') || 4),
                notes: '',
              };
              const nextList = editingLpgDepot
                ? state.lpgDepots.map((x) => (x.id === editingLpgDepot.id ? rec : x))
                : [rec, ...state.lpgDepots];
              commitInternalTradeState(
                { lpgDepots: nextList },
                `تم حفظ بيانات مستودع البوتاجاز "${rec.depotName}"`,
                {
                  actionType: editingLpgDepot ? 'تعديل' : 'إضافة',
                  entityName: 'مستودع بوتاجاز',
                  entityId: rec.depotCode,
                  beforeSummary: editingLpgDepot?.depotName,
                  afterSummary: rec.depotName,
                }
              );
              setIsLpgDepotModalOpen(false);
              setEditingLpgDepot(null);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-[#0A1931]">
              {editingLpgDepot ? `تعديل مستودع ${editingLpgDepot.depotName}` : 'إضافة مستودع بوتاجاز جديد'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم المستودع *</label>
                <input
                  name="depotName"
                  required
                  defaultValue={editingLpgDepot?.depotName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">اسم صاحب المستودع *</label>
                <input
                  name="ownerName"
                  required
                  defaultValue={editingLpgDepot?.ownerName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">القرية *</label>
                <select
                  name="village"
                  defaultValue={editingLpgDepot?.village || uniqueVillages[0] || 'بلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">الوحدة المحلية *</label>
                <input
                  name="localUnit"
                  defaultValue={editingLpgDepot?.localUnit || 'الوحدة المحلية'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم الترخيص</label>
                <input
                  name="licenseNumber"
                  defaultValue={editingLpgDepot?.licenseNumber || 'ترخيص-بوتاجاز-2026'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">تاريخ انتهاء الترخيص</label>
                <input
                  name="licenseExpiryDate"
                  type="date"
                  defaultValue={editingLpgDepot?.licenseExpiryDate || '2028-12-31'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الحصة المقررة (أسطوانة) *</label>
                <input
                  name="prescribedQuota"
                  type="number"
                  min={100}
                  defaultValue={editingLpgDepot?.prescribedQuota ?? 15000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الوارد الفعلي (أسطوانة) *</label>
                <input
                  name="inboundCylinders"
                  type="number"
                  min={0}
                  defaultValue={editingLpgDepot?.inboundCylinders ?? 14800}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">المنصرف الفعلي (أسطوانة) *</label>
                <input
                  name="disbursedCylinders"
                  type="number"
                  min={0}
                  defaultValue={editingLpgDepot?.disbursedCylinders ?? 14500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">عدد الموزعين المعتمدين</label>
                <input
                  name="affiliatedDistributorsCount"
                  type="number"
                  min={0}
                  defaultValue={editingLpgDepot?.affiliatedDistributorsCount ?? 4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsLpgDepotModalOpen(false);
                  setEditingLpgDepot(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ المستودع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD / EDIT LPG DISTRIBUTOR
         ===================================================================== */}
      {isLpgDistModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            key={editingLpgDist?.id || 'new-dist'}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const rec: LpgDistributorRecord = {
                id: editingLpgDist?.id || `dist-${Date.now()}`,
                distributorCode:
                  editingLpgDist?.distributorCode ||
                  String(fd.get('distributorCode') || `DST-MHL-0${state.lpgDistributors.length + 1}`),
                distributorName: String(fd.get('distributorName') || 'موزع أسطوانات'),
                nationalId: String(fd.get('nationalId') || '28501011600000'),
                phone: String(fd.get('phone') || '01000000000'),
                address: String(fd.get('address') || 'مركز المحلة'),
                distributionScopeVillage: String(fd.get('distributionScopeVillage') || 'بلقينا'),
                localUnit: String(fd.get('localUnit') || 'الوحدة المحلية ببلقينا'),
                affiliatedDepotName: String(fd.get('affiliatedDepotName') || 'مستودع بلقينا الرئيسي'),
                prescribedQuota: Number(fd.get('prescribedQuota') || 2500),
                receivedQty: Number(fd.get('receivedQty') || 2500),
                distributedQty: Number(fd.get('distributedQty') || 2450),
                vehicleDetails: String(fd.get('vehicleDetails') || 'سيارة نصف نقل - نقل أسطوانات'),
                licenseNumber: String(fd.get('licenseNumber') || 'ط د ر 8812'),
                status: (fd.get('status') as LpgDistributorRecord['status']) || 'نشط',
                previousViolations: '',
                dailyMonthlyLogSummary: 'توزيع منتظم',
              };
              const nextList = editingLpgDist
                ? state.lpgDistributors.map((x) => (x.id === editingLpgDist.id ? rec : x))
                : [rec, ...state.lpgDistributors];
              commitInternalTradeState(
                { lpgDistributors: nextList },
                `تم حفظ بيانات الموزع "${rec.distributorName}"`,
                {
                  actionType: editingLpgDist ? 'تعديل' : 'إضافة',
                  entityName: 'موزع بوتاجاز',
                  entityId: rec.distributorCode,
                  beforeSummary: editingLpgDist?.distributorName,
                  afterSummary: rec.distributorName,
                }
              );
              setIsLpgDistModalOpen(false);
              setEditingLpgDist(null);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-black text-[#0A1931]">
              {editingLpgDist ? `تعديل بيانات الموزع ${editingLpgDist.distributorName}` : 'إضافة موزع أسطوانات معتمد'}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-black block mb-1">اسم الموزع *</label>
                <input
                  name="distributorName"
                  required
                  defaultValue={editingLpgDist?.distributorName || ''}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الرقم القومي (14 رقم) *</label>
                <input
                  name="nationalId"
                  required
                  defaultValue={editingLpgDist?.nationalId || '28501011600000'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم الهاتف *</label>
                <input
                  name="phone"
                  required
                  defaultValue={editingLpgDist?.phone || '01012345678'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">نطاق التوزيع (القرية) *</label>
                <select
                  name="distributionScopeVillage"
                  defaultValue={editingLpgDist?.distributionScopeVillage || uniqueVillages[0] || 'بلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {uniqueVillages.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">المستودع التابع له *</label>
                <input
                  name="affiliatedDepotName"
                  required
                  defaultValue={editingLpgDist?.affiliatedDepotName || state.lpgDepots[0]?.depotName || 'مستودع بلقينا'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">الحصة المقررة (أسطوانة) *</label>
                <input
                  name="prescribedQuota"
                  type="number"
                  min={1}
                  defaultValue={editingLpgDist?.prescribedQuota ?? 2500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">بيانات وسيلة النقل</label>
                <input
                  name="vehicleDetails"
                  defaultValue={editingLpgDist?.vehicleDetails || 'سيارة ربع نقل صندوق حديدي'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم ترخيص السيارة</label>
                <input
                  name="licenseNumber"
                  defaultValue={editingLpgDist?.licenseNumber || 'ط د ر 8812'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsLpgDistModalOpen(false);
                  setEditingLpgDist(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ الموزع
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL: ADD FUEL STATION DAILY MOVEMENT
         ===================================================================== */}
      {isMovementModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const stCode = String(fd.get('stationCode') || state.fuelStations[0]?.stationCode || 'ST-MHL-01');
              const stObj = state.fuelStations.find((s) => s.stationCode === stCode);
              const newMov: FuelStationDailyMovement = {
                id: `fmov-${Date.now()}`,
                stationCode: stCode,
                stationName: stObj?.stationName || 'محطة وقود',
                movementDate: new Date().toISOString().slice(0, 10),
                fuelType: String(fd.get('fuelType') || 'السولار'),
                movementType:
                  (fd.get('movementType') as FuelStationDailyMovement['movementType']) || 'استلام وارد',
                quantityLiters: Number(fd.get('quantityLiters') || 20000),
                invoiceOrDocNumber: String(fd.get('invoiceOrDocNumber') || 'INV-2026-880'),
                inspectorOrOperator: currentUser?.fullName || 'مفتش الرقابة على المواد البترولية',
                notes: String(fd.get('notes') || 'مطابق لسجل 21 بترول'),
              };
              commitInternalTradeState(
                {
                  fuelStationMovements: [newMov, ...state.fuelStationMovements],
                },
                `تم تسجيل حركة ${newMov.movementType} (${newMov.quantityLiters.toLocaleString()} لتر ${newMov.fuelType}) بمحطة ${newMov.stationName}`,
                {
                  actionType: 'إضافة',
                  entityName: 'حركة وقود يومية',
                  entityId: newMov.invoiceOrDocNumber,
                  afterSummary: `${newMov.stationName} - ${newMov.quantityLiters} لتر`,
                }
              );
              setIsMovementModalOpen(false);
            }}
            className="bg-white border-2 border-[#0A1931] rounded-3xl max-w-lg w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-[#0A1931]">تسجيل حركة وقود يومية بمحطة</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-black block mb-1">المحطة *</label>
                <select name="stationCode" className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold">
                  {state.fuelStations.map((st) => (
                    <option key={st.id} value={st.stationCode}>
                      {st.stationCode} — {st.stationName} ({st.village})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع الوقود *</label>
                <select name="fuelType" className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold">
                  {FUEL_TYPES.map((ft) => (
                    <option key={ft} value={ft}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">نوع الحركة *</label>
                <select name="movementType" className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold">
                  <option value="استلام وارد">استلام وارد</option>
                  <option value="صرف ومبيعات">صرف ومبيعات</option>
                  <option value="جرد فعلي">جرد فعلي</option>
                </select>
              </div>
              <div>
                <label className="font-black block mb-1">الكمية (باللتر) *</label>
                <input
                  name="quantityLiters"
                  type="number"
                  min={1}
                  defaultValue={25000}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-black block mb-1">رقم الفاتورة / المستند</label>
                <input
                  name="invoiceOrDocNumber"
                  defaultValue="فاتورة شحن رقم 9401"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsMovementModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#0A1931] text-white text-xs font-black cursor-pointer"
              >
                حفظ الحركة اليومية
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          GLOBAL MAGIC EYE PROFILE MODAL & DELETE CONFIRMATION MODAL
         ===================================================================== */}
      {profileModal && (
        <ModuleRecordProfileModal
          isOpen={true}
          title={profileModal.title}
          subtitle={profileModal.subtitle}
          badgeText={profileModal.badgeText}
          sections={profileModal.sections}
          updatedAt={profileModal.updatedAt}
          onClose={() => setProfileModal(null)}
        />
      )}

      {deleteTarget && (
        <ModuleDeleteConfirmModal
          isOpen={true}
          canDelete={permissions.canDelete}
          entityTitle={deleteTarget.title}
          recordSummary={deleteTarget.summary}
          onConfirmDelete={() => {
            deleteTarget.onConfirm();
            setDeleteTarget(null);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

