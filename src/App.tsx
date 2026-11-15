import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  ColumnTitles,
  SystemConfig,
  AppUser,
  DailyAlertConfig,
  InboxChatMessage,
  SupplyBranch
} from './types';
import {
  AppState,
  DEFAULT_BRANCH_ID,
  getBranchesList,
  setActiveBranchId,
  loadInitialState,
  persistFullState,
  saveSessionUser,
  saveBackupToPartition,
  mergeAutoSaveOntoCurrent,
  autoDiscoverAndMergeAllDatabases,
  factoryReset,
  setupDiskAutoBackup,
  getActiveDiskBackupInfo,
  mergeStates,
  mergeUsersList,
  saveBranchesList,
  createSupplyBranch,
  renameSupplyBranch,
  deleteSupplyBranch,
  syncAllBranchesFromCloudPayload,
  readBranchPartitionFromLocal,
  isDefaultSeedState
} from './storage';
import {
  loadBranchAuthVault,
  saveBranchAuthVault,
  sanitizeBranchUsers,
} from './services/branchAuthVault';
import {
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_VILLAGES_HIERARCHY,
  DEFAULT_ISSUING_ENTITIES,
  DEFAULT_VIOLATION_TYPES,
  DEFAULT_ACTIVITY_STATUSES,
  DEFAULT_BAKERY_CATEGORIES,
  DEFAULT_BREAD_TYPES,
  DEFAULT_BREAD_TYPE_COUNTS,
  DEFAULT_LINE_TYPES,
  DEFAULT_FUEL_TYPES,
  DEFAULT_LEASE_CONTRACT_TYPES,
  DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
  PAYMENT_METHODS,
  DEFAULT_COLUMN_TITLES,
  INITIAL_BAKERIES,
  INITIAL_DEBTS,
  INITIAL_USERS,
  INITIAL_DAILY_TASKS,
  INITIAL_INBOX_MESSAGES,
  DEFAULT_OFFICIAL_LOGO
} from './defaultData';
import {
  formatDateDDMMYYYY,
  synchronizeBakeryAndDebts,
  recalculateAllDatabaseEquations,
  calculateAnnualWeightedAveragesReport,
  calculateBakeriesColumnTotals,
  matchesVillageOrUnitFilter,
  normalizeArabicText,
  syncLocalUnitDemographicsAcrossBakeries,
  getLocalUnitKey,
} from './utils/auditHelper';
import {
  computeFullBranchDigest,
  shouldTriggerDebtAlert,
  mergeHighDebtAlerts,
  DEFAULT_DEBT_ALERT_THRESHOLD,
} from './lib/firebaseSyncHelpers';
import {
  isSelfRealtimeEvent,
  getSupabaseConfig,
  subscribeToSupabaseRealtime,
  fetchDatabaseFromSupabase,
  clearSupabaseDatabaseData,
  subscribeToConnectionStatus,
  getCloudConnectionSnapshot,
  retrySupabaseConnection,
  CloudConnectionSnapshot,
  fetchHighDebtAlertsFromSupabase,
  syncHighDebtAlertsToSupabase,
  clearHighDebtAlertsInSupabase,
  subscribeToSupabaseHighDebtAlerts,
  recordRealtimeDiagnosticEvent,
  requestRealtimeBranchInit,
} from './lib/supabase';
import {
  applyGranularRowChangeToState,
  batchSyncToDb,
  DbMutationResult,
  deleteRowFromDb,
  flushRowMutationQueue,
  resolveConflictWithServerRow,
  saveRowToDb,
  shouldApplyIncomingCloudStateForBranch,
} from './services/supabaseDb';
import type { RowMutationTable } from './services/offlineMutationQueue';
import { getExpirationAlerts } from './components/AlertsModal';
import { LoginModal } from './components/LoginModal';
import { HeaderCustomizerModal } from './components/HeaderCustomizerModal';
import { VillageManagerModal } from './components/VillageManagerModal';
import { BakeryModal } from './components/BakeryModal';
import { ColumnTitlesModal } from './components/ColumnTitlesModal';
import { AlertsModal } from './components/AlertsModal';
import { DebtsView } from './components/DebtsView';
import { ReportModal } from './components/ReportModal';
import { BackupModal } from './components/BackupModal';
import { PublishModal } from './components/PublishModal';
import { UsersManagerModal } from './components/UsersManagerModal';
import { ActivityStatusModal } from './components/ActivityStatusModal';
import { WeeklyInstallmentsModal } from './components/WeeklyInstallmentsModal';
import { AuditModal } from './components/AuditModal';
import { BakeryAnalyticsCharts } from './components/BakeryAnalyticsCharts';
import { BakeryDebtsPieChart } from './components/BakeryDebtsPieChart';
import { LocalUnitsSummaryModal } from './components/LocalUnitsSummaryModal';
import { DailyAlertSettingsModal } from './components/DailyAlertSettingsModal';
import { DailyAlertNotificationModal } from './components/DailyAlertNotificationModal';
import { AnnualBudgetFrequencyModal } from './components/AnnualBudgetFrequencyModal';
import { AdminNotificationsDrawer } from './components/AdminNotificationsDrawer';
import { DailyTasksModal } from './components/DailyTasksModal';
import { SystemMasterEditorModal, DropdownCategoryKey } from './components/SystemMasterEditorModal';
import { AdvancedPermissionsModal } from './components/AdvancedPermissionsModal';
import { InboxChatModal } from './components/InboxChatModal';
import { DailyEntryBriefingModal } from './components/DailyEntryBriefingModal';
import { RightSidebar, SidebarNavId } from './components/RightSidebar';
import { ReportsCenterView, ReportTemplateId } from './components/ReportsCenterView';
import { HomeDashboardView } from './components/HomeDashboardView';
import { BakeryDetailsModal } from './components/BakeryDetailsModal';
import { GoogleWorkspaceModal } from './components/GoogleWorkspaceModal';
import { BranchesManagerModal } from './components/BranchesManagerModal';
import { VaultSecurityGateModal } from './components/VaultSecurityGateModal';
import { InteractiveDashboardPage } from './components/InteractiveDashboardPage';
import {
  deduplicateSupplyBranches,
  getStoredVaultPasscode,
  getStoredVaultUsername,
  setStoredVaultPasscode,
  getBranchVaultCredentialsMap,
  updateBranchVaultCredentialsMap,
} from './utils/branchVaultUtils';
import { HighDebtAlertNotification } from './types';
import {
  downloadUpdatedAppHtml,
  downloadAppLauncherHtml,
  downloadMinistryDesktopShortcut,
  downloadWindowsDesktopInstallerBat,
  downloadWindowsExeLauncher,
  openStandaloneAppInNewTab
} from './utils/htmlExporter';
import { usePWAInstall } from './hooks/usePWAInstall';
import { hasPermission, getRoleNameArabic } from './permissions';

import {
  Store,
  Scale,
  Bell,
  MapPin,
  FileText,
  Settings,
  HardDrive,
  Users,
  LogOut,
  Download,
  Plus,
  Search,
  Filter,
  FileSpreadsheet,
  Printer,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Columns3,
  Calendar,
  Check,
  ChevronDown,
  Layers,
  ExternalLink,
  Lock,
  X,
  LayoutDashboard,
  Building,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Building2,
  Database,
  Upload,
  Globe,
  BarChart3,
  PieChart,
  Table,
  ListTodo,
  Sliders,
  Inbox,
  RefreshCw,
  UploadCloud,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Home,
  Save,
  Clock,
  RotateCw,
  BookOpen,
  Activity,
  KeyRound,
  Unlock,
} from 'lucide-react';
import { UserGuideView } from './components/UserGuideView';
import { RealtimeDiagnosticsView } from './components/RealtimeDiagnosticsView';

const BAKERY_COLUMN_TOOLTIPS: Record<string, string> = {
  index: 'الرقم المسلسل للمخبز في السجل العام للإدارة',
  actions: 'أزرار التعديل الفوري لبيانات المخبز وحذف المخبز نهائياً من القاعدة',
  bakeryOwnerName: 'الاسم الثلاثي أو الرباعي لصاحب المخبز أو المرخص له بالتشغيل',
  machineNumber: 'رقم ماكينة صرف الخبز الذكية المسجلة بوزارة التموين',
  village: 'القرية الرئيسية المقام بها المخبز التابعة لمركز المحلة الكبرى',
  localUnit: 'الوحدة المحلية الإدارية المشرفة على نطاق المخبز',
  responsibleManager: 'المدير المسئول عن إدارة وتشغيل المخبز',
  remainingDebt: 'إجمالي المديونيات والغرامات والفرق المالي المتبقي على المخبز بالجنيه المصري',
  insuranceQuota: 'الحصة التأمينية المقررة للمخبز من الدقيق بالشكائر يومياً',
  actualQuota: 'الحصة الفعلية المنصرفة للمخبز بناءً على متوسطات المبيعات',
  insuranceValue: 'إجمالي القيمة المالية للحصة التأمينية بالجنيه المصري',
  loavesCount: 'عدد الأرغفة المنتجة بناءً على حصة الدقيق (معدل 1250 رغيف/شكارة)',
  villagePopulation: 'عدد السكان المستهدفين بالقرية المخدومة من قبل المخبز',
  perCapitaAverage: 'متوسط نصيب الفرد اليومي من حصة الخبز بالقرية (علامة عشرية ورقمين فقط 0.00)',
  beneficiaries2023: 'عدد البطاقات والمستفيدين المسجلين لعام 2023',
  avg2023: 'متوسط الصرف اليومي للمستفيدين لعام 2023',
  beneficiaries2024: 'عدد البطاقات والمستفيدين المسجلين لعام 2024',
  avg2024: 'متوسط الصرف اليومي للمستفيدين لعام 2024',
  beneficiaries2025: 'عدد البطاقات والمستفيدين المسجلين لعام 2025',
  avg2025: 'متوسط الصرف اليومي المستهدف لعام 2025',
  avgDiff: 'معدل التغير والتطور السنوي في متوسط الصرف بين الأعوام',
  activityStatus: 'حالة تشغيل المخبز الحالية (يعمل، متوقف، ميعاد تصفية، مغلق بقرار)',
  bakeryCategory: 'نوع المخابز (بلدي مدعم، بلدي مطور، سياحي 72%، فينو وأفرنجي، طباقي)',
  breadType: 'نوع الخبز المنتجة (ماكينة، آلي، نصف آلي، بلدي طري، طابونة)',
  flourBagPrice: 'سعر شيكارة الدقيق التمويني المقررة للمخبز بالجنيه المصري',
  breadTypeCount: 'عدد خطوط السير والمجموعات الإنتاجية بالمخبز',
  lineType: 'نوع خط الإنتاج (ميكانيكي كامل، نصف آلي، يدوي)',
  fuelType: 'نوع الوقود المستخدم في الأفران (سولار، غاز طبيعي، مازوت)',
  phone: 'رقم هاتف صاحب المخبز أو المدير المسؤول للتواصل الفوري',
  nationalId: 'الرقم القومي (14 رقم) لصاحب المخبز المسجل بالبطاقة الشخصية',
  commercialRegNumber: 'رقم السجل التجاري المسجل للمخبز',
  commercialRegDate: 'تاريخ انتهاء السجل التجاري المنظم لنشاط المخبز',
  bakeryLicenseNumber: 'رقم رخصة تشغيل المخبز',
  bakeryLicenseDate: 'تاريخ انتهاء رخصة المخبز الصادرة من مجلس المدينة/المركز',
  leaseContractType: 'نوع حيازة المقر (إيجار أو تمليك)',
  leaseAgreementDate: 'تاريخ انتهاء عقد الإيجار أو الملكية لمقر المخبز',
  taxCardNumber: 'رقم البطاقة الضريبية المسجل للمخبز',
  taxCardDate: 'تاريخ انتهاء البطاقة الضريبية ومتابعة الموقف الضريبي',
};

const ThHeaderTooltip: React.FC<{ label: string; tooltipKey: string; className?: string }> = ({
  label,
  tooltipKey,
  className = '',
}) => {
  const tooltipText = BAKERY_COLUMN_TOOLTIPS[tooltipKey];
  return (
    <div className={`group relative inline-flex items-center gap-1 justify-center cursor-help ${className}`}>
      <span>{label}</span>
      {tooltipText && (
        <div className="absolute bottom-full mb-1.5 hidden group-hover:block z-50 w-52 p-2 bg-slate-950 text-amber-300 text-[10px] font-bold rounded-xl shadow-2xl border border-amber-500/60 text-center pointer-events-none transition-all leading-tight">
          {tooltipText}
          <div className="w-2 h-2 bg-slate-950 border-r border-b border-amber-500/60 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
        </div>
      )}
    </div>
  );
};

export default function App() {
  const { isInstallable, install } = usePWAInstall();
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'charts' | 'bakeries' | 'debts' | 'reports' | 'user-guide' | 'realtime-diagnostics'
  >(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (search.includes('debug=realtime') || hash.includes('diagnostics')) {
        return 'realtime-diagnostics';
      }
    }
    return 'bakeries';
  });
  const [activeReportId, setActiveReportId] = useState<ReportTemplateId>('bak-all');
  const [activeSidebarNavId, setActiveSidebarNavId] = useState<SidebarNavId>('bakeries-all');
  const [breadcrumbGroup, setBreadcrumbGroup] = useState<string>('إدارة المخابز');
  const [breadcrumbItem, setBreadcrumbItem] = useState<string>('قاعدة بيانات المخابز');
  const [columnViewMode, setColumnViewMode] = useState<
    'ALL' | 'BASIC' | 'BREAD' | 'QUOTAS' | 'INSURANCE' | 'BENEFICIARIES' | 'EQUATIONS'
  >('ALL');
  const [groupingViewMode, setGroupingViewMode] = useState<'HIERARCHICAL' | 'FLAT'>('HIERARCHICAL');
  const [sortField, setSortField] = useState<string>('index');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [showAdvancedSearchPanel, setShowAdvancedSearchPanel] = useState<boolean>(true);
  const [searchFocusMode, setSearchFocusMode] = useState<'ALL' | 'NAME' | 'MACHINE'>('ALL');
  const [detailsBakery, setDetailsBakery] = useState<Bakery | null>(null);
  const [isActionLocked, setIsActionLocked] = useState<boolean>(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [vaultGateModal, setVaultGateModal] = useState<{
    isOpen: boolean;
    section: 'backup' | 'branches' | 'both';
    label?: string;
    initialMode?: 'unlock' | 'change';
    initialTargetBranchId?: string | 'ALL';
    onAfterUnlock?: () => void;
  }>({ isOpen: false, section: 'both', initialMode: 'unlock', initialTargetBranchId: 'ALL' });
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [saveTimestamp, setSaveTimestamp] = useState<string>('');
  const [isSavingPulse, setIsSavingPulse] = useState(false);
  const [currentDateTimeStr, setCurrentDateTimeStr] = useState<string>(() =>
    new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  );

  // Success / Warning / Error Toast Notification after confirmed save
  interface SaveToastInfo {
    id: number;
    message: string;
    timestamp: string;
    variant?: 'success' | 'warning' | 'error';
  }
  const [saveToast, setSaveToast] = useState<SaveToastInfo | null>(null);
  const latestAppStateRef = React.useRef<AppState | null>(null);
  latestAppStateRef.current = appState;
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [connectionSnapshot, setConnectionSnapshot] = useState<CloudConnectionSnapshot>(() =>
    getCloudConnectionSnapshot()
  );
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  // Search & Filter state for main Bakery table (with 180ms debouncing for rapid typing)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDebouncedSearchTerm('');
      return;
    }
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 180);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [selectedVillage, setSelectedVillage] = useState('ALL');
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedActivity, setSelectedActivity] = useState('ALL');
  const [selectedDebtFilter, setSelectedDebtFilter] = useState<'ALL' | 'HAS_DEBT' | 'NO_DEBT'>('ALL');
  // Bakery Category Filter (الكل، بلدي مدعم، سياحي 72%، فينو وأفرنجي، طباقي)
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  // License Expiry Timeline Filter (الكل، منتهية بالفعل، تنتهي خلال 30 يوماً، تنتهي خلال 60 يوماً، تنتهي خلال 90 يوماً، سارية لأكثر من 90 يوماً)
  const [selectedLicenseExpiryFilter, setSelectedLicenseExpiryFilter] = useState<
    'ALL' | 'EXPIRED' | 'WITHIN_30' | 'WITHIN_60' | 'WITHIN_90' | 'VALID'
  >('ALL');
  // Additional Dual/Multi-Filter Dropdowns (نوع الخبز + نوع الوقود وخط الإنتاج)
  const [selectedBreadTypeFilter, setSelectedBreadTypeFilter] = useState<string>('ALL');
  const [selectedFuelTypeFilter, setSelectedFuelTypeFilter] = useState<string>('ALL');

  // Expected Flour Bag Price (ج.م / شيكارة) for Annual Budget Estimation
  const [flourBagPrice, setFlourBagPrice] = useState<number>(750);

  // Selected Row for professional highlighting
  const [selectedBakeryRowId, setSelectedBakeryRowId] = useState<string | null>(null);

  // Cross-filtering to Debts Tab
  const [debtFilterBakeryId, setDebtFilterBakeryId] = useState<string | undefined>(undefined);

  // Modals state
  const [isBakeryModalOpen, setIsBakeryModalOpen] = useState(false);
  const [bakeryToEdit, setBakeryToEdit] = useState<Bakery | null>(null);

  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [isHeaderModalOpen, setIsHeaderModalOpen] = useState(false);
  const [isVillageModalOpen, setIsVillageModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalInitialTab, setReportModalInitialTab] = useState<'bakeries' | 'debts' | 'bakery-debts' | 'users' | 'annual-averages'>('bakeries');
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isWeeklyInstallmentsModalOpen, setIsWeeklyInstallmentsModalOpen] = useState(false);
  const [selectedInstallmentBakeryId, setSelectedInstallmentBakeryId] = useState<string | undefined>(undefined);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isBudgetFrequencyModalOpen, setIsBudgetFrequencyModalOpen] = useState(false);
  const [isLocalUnitsModalOpen, setIsLocalUnitsModalOpen] = useState(false);
  const [isDailySettingsModalOpen, setIsDailySettingsModalOpen] = useState(false);
  const [isDailyTasksModalOpen, setIsDailyTasksModalOpen] = useState(false);
  const [isMasterEditorModalOpen, setIsMasterEditorModalOpen] = useState(false);
  const [isAdvancedPermissionsModalOpen, setIsAdvancedPermissionsModalOpen] = useState(false);
  const [isInboxModalOpen, setIsInboxModalOpen] = useState(false);
  const [isDailyBriefingModalOpen, setIsDailyBriefingModalOpen] = useState(false);
  const [isDisplaySettingsModalOpen, setIsDisplaySettingsModalOpen] = useState(false);
  const [isBranchesModalOpen, setIsBranchesModalOpen] = useState(false);
  const [isGoogleWorkspaceModalOpen, setIsGoogleWorkspaceModalOpen] = useState(false);
  const [googleWorkspaceInitialTab, setGoogleWorkspaceInitialTab] = useState<'calendar' | 'tasks' | 'forms'>('calendar');
  const [debtsColumnGroup, setDebtsColumnGroup] = useState<'ALL' | 'SUMMARY' | 'VIOLATIONS' | 'ADDED_DISPOSAL'>('ALL');
  const [debtsPageSize, setDebtsPageSize] = useState<number>(50);
  const [showDebtsAlertsKeyModal, setShowDebtsAlertsKeyModal] = useState<boolean>(false);
  const [openDebtScheduleSignal, setOpenDebtScheduleSignal] = useState<number>(0);
  const [externalDebtsManageListModal, setExternalDebtsManageListModal] = useState<'entities' | 'violations' | null>(null);
  const [masterEditorInitialCategory, setMasterEditorInitialCategory] = useState<DropdownCategoryKey>('ALL');
  const [dailyNotificationData, setDailyNotificationData] = useState<{
    isOpen: boolean;
    alertTime: string;
    expiredBakeries: { bakery: Bakery; docName: string; expiryDate: string; daysDiff: number }[];
  }>({
    isOpen: false,
    alertTime: '09:00',
    expiredBakeries: [],
  });
  const [isAdminDrawerOpen, setIsAdminDrawerOpen] = useState(false);

  // High Debt Notifications State for Admin Manager Control
  const [highDebtNotifications, setHighDebtNotifications] = useState<HighDebtAlertNotification[]>(() => {
    try {
      const saved = localStorage.getItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Helper to append a high debt notification for managers & sync across devices in real time via Supabase
  const addHighDebtNotification = useCallback(
    (
      bakeryId: string,
      bakeryOwnerName: string,
      machineNumber: string,
      village: string,
      debtAmount: number,
      actionType: 'ADD_DEBT' | 'EDIT_DEBT' | 'HIGH_DEBT_SURGE',
      thresholdUsed?: number
    ) => {
      const effectiveThreshold =
        thresholdUsed ??
        appState?.systemConfig?.debtAlertThreshold ??
        DEFAULT_DEBT_ALERT_THRESHOLD;
      const newNotif: HighDebtAlertNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        bakeryId,
        bakeryOwnerName,
        machineNumber,
        village,
        debtAmount,
        thresholdUsed: effectiveThreshold,
        branchId: appState?.activeBranchId || DEFAULT_BRANCH_ID,
        createdAtIso: new Date().toISOString(),
        editedBy: appState?.currentUser?.fullName || 'مستخدم منظومة',
        editorRole: getRoleNameArabic(appState?.currentUser?.role || 'inspector'),
        timestamp: new Date().toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
        actionType,
        isRead: false,
      };
      setHighDebtNotifications((prev) => {
        const updated = [newNotif, ...prev].slice(0, 150);
        try {
          localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
        } catch {
          // fallback
        }
        syncHighDebtAlertsToSupabase(updated, effectiveThreshold).catch(() => {});
        return updated;
      });
    },
    [appState?.currentUser, appState?.systemConfig?.debtAlertThreshold, appState?.activeBranchId]
  );

  // Sync High-Debt Alerts & Threshold live across all devices on Supabase Realtime
  useEffect(() => {
    let disposed = false;

    fetchHighDebtAlertsFromSupabase()
      .then((res) => {
        if (disposed || !res) return;
        if (res.alerts.length > 0) {
          setHighDebtNotifications((prev) => {
            const merged = mergeHighDebtAlerts(prev, res.alerts);
            try {
              localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
        if (res.debtAlertThreshold > 0) {
          setAppState((prev) =>
            prev && prev.systemConfig.debtAlertThreshold !== res.debtAlertThreshold
              ? {
                  ...prev,
                  systemConfig: {
                    ...prev.systemConfig,
                    debtAlertThreshold: res.debtAlertThreshold,
                  },
                }
              : prev
          );
        }
      })
      .catch(() => {});

    const unsubAlerts = subscribeToSupabaseHighDebtAlerts(
      ({ alerts, debtAlertThreshold, fromRemoteClient, cleared }) => {
        if (disposed) return;
        if ((cleared || alerts.length === 0) && fromRemoteClient) {
          setHighDebtNotifications([]);
          try {
            localStorage.removeItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS');
          } catch {}
        } else if (alerts.length > 0) {
          setHighDebtNotifications((prev) => {
            const merged = mergeHighDebtAlerts(prev, alerts);
            try {
              localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
        if (debtAlertThreshold > 0) {
          setAppState((prev) =>
            prev && prev.systemConfig.debtAlertThreshold !== debtAlertThreshold
              ? {
                  ...prev,
                  systemConfig: {
                    ...prev.systemConfig,
                    debtAlertThreshold,
                  },
                }
              : prev
          );
        }
      }
    );

    return () => {
      disposed = true;
      unsubAlerts();
    };
  }, []);

  // Format current Arabic clock timestamp
  const getArabicTimestamp = () => {
    const d = new Date();
    return d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  // Initial State Loading with 350ms failsafe timeout
  useEffect(() => {
    let hasLoaded = false;

    const isAutoStart =
      typeof window !== 'undefined' && window.location.search.includes('autostart=1');

    // Failsafe timer: if storage loading takes longer than 6000ms, open app with preloaded or defaults
    const failsafe = setTimeout(() => {
      if (!hasLoaded) {
        hasLoaded = true;
        const preloaded = typeof window !== 'undefined'
          ? (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> }).PRELOADED_TAMWEEN_STATE
          : undefined;
        const usersList = preloaded?.users ?? INITIAL_USERS;
        setAppState({
          bakeries: [],
          debts: [],
          villages: preloaded?.villages ?? DEFAULT_VILLAGES_HIERARCHY,
          issuingEntities: preloaded?.issuingEntities ?? DEFAULT_ISSUING_ENTITIES,
          violationTypes: preloaded?.violationTypes ?? DEFAULT_VIOLATION_TYPES,
          activityStatuses: preloaded?.activityStatuses ?? DEFAULT_ACTIVITY_STATUSES,
          bakeryCategories: preloaded?.bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES,
          breadTypes: preloaded?.breadTypes ?? DEFAULT_BREAD_TYPES,
          breadTypeCounts: preloaded?.breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS,
          lineTypes: preloaded?.lineTypes ?? DEFAULT_LINE_TYPES,
          fuelTypes: preloaded?.fuelTypes ?? DEFAULT_FUEL_TYPES,
          leaseContractTypes: preloaded?.leaseContractTypes ?? DEFAULT_LEASE_CONTRACT_TYPES,
          responsibleManagerOptions: preloaded?.responsibleManagerOptions ?? DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
          paymentMethods: preloaded?.paymentMethods ?? PAYMENT_METHODS,
          dailyTasks: [],
          columnTitles: preloaded?.columnTitles ?? DEFAULT_COLUMN_TITLES,
          systemConfig: preloaded?.systemConfig ?? DEFAULT_SYSTEM_CONFIG,
          users: usersList,
          currentUser: isAutoStart ? usersList[0] : null,
        });
        setSaveTimestamp(getArabicTimestamp());
      }
    }, 6000);

    loadInitialState()
      .then((state) => {
        if (!hasLoaded) {
          hasLoaded = true;
          clearTimeout(failsafe);
          setAppState({
            ...state,
            currentUser: isAutoStart ? (state.currentUser || state.users[0] || INITIAL_USERS[0]) : state.currentUser,
          });
          setSaveTimestamp(getArabicTimestamp());
          if (pendingCloudUpdateRef.current && applyIncomingCloudStateRef.current) {
            const pending = pendingCloudUpdateRef.current;
            pendingCloudUpdateRef.current = null;
            setTimeout(() => {
              applyIncomingCloudStateRef.current?.(pending.data, pending.timestamp);
            }, 20);
          }
        }
      })
      .catch((err) => {
        if (!hasLoaded) {
          hasLoaded = true;
          clearTimeout(failsafe);
          console.error('loadInitialState catch:', err);
          setAppState({
            bakeries: [],
            debts: [],
            villages: DEFAULT_VILLAGES_HIERARCHY,
            issuingEntities: DEFAULT_ISSUING_ENTITIES,
            violationTypes: DEFAULT_VIOLATION_TYPES,
            activityStatuses: DEFAULT_ACTIVITY_STATUSES,
            bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
            breadTypes: DEFAULT_BREAD_TYPES,
            breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
            lineTypes: DEFAULT_LINE_TYPES,
            fuelTypes: DEFAULT_FUEL_TYPES,
            leaseContractTypes: DEFAULT_LEASE_CONTRACT_TYPES,
            responsibleManagerOptions: DEFAULT_RESPONSIBLE_MANAGER_OPTIONS,
            paymentMethods: PAYMENT_METHODS,
            dailyTasks: [],
            inboxMessages: INITIAL_INBOX_MESSAGES,
            columnTitles: DEFAULT_COLUMN_TITLES,
            systemConfig: DEFAULT_SYSTEM_CONFIG,
            users: INITIAL_USERS,
            currentUser: isAutoStart ? INITIAL_USERS[0] : null,
          });
          setSaveTimestamp(getArabicTimestamp());
        }
      });

    return () => clearTimeout(failsafe);
  }, []);

  // Subscribe to smart cloud connection state transitions (connected / syncing / error / offline)
  useEffect(() => {
    return subscribeToConnectionStatus(setConnectionSnapshot);
  }, []);

  const lastAppliedCloudTimestampRef = React.useRef<string>('');
  const pendingCloudUpdateRef = React.useRef<{ data: AppState; timestamp?: string } | null>(null);
  const applyIncomingCloudStateRef = React.useRef<
    ((incomingData: AppState, remoteTimestamp?: string) => void) | null
  >(null);

  // Hidden Diagnostics Shortcut Listener: Ctrl+Shift+D or Alt+Shift+D toggles Realtime Diagnostics View
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.altKey) && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.key === 'ي')) {
        e.preventDefault();
        setActiveTab((prev) => (prev === 'realtime-diagnostics' ? 'bakeries' : 'realtime-diagnostics'));
        setBreadcrumbGroup('مرصد التشخيص المتقدم');
        setBreadcrumbItem('صفحة تشخيص Supabase Realtime و WebSockets');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Exclusive Real-Time Synchronization via Supabase & Cloud DB across all devices & all branches:
  useEffect(() => {
    const applyIncomingCloudState = (
      incomingData: AppState,
      remoteTimestamp?: string,
      options?: { forceRealtimePush?: boolean }
    ) => {
      if (!incomingData) return;

      // 1. Write all branch partitions from cloud payload into their respective isolated local storage keys
      syncAllBranchesFromCloudPayload(incomingData, remoteTimestamp, {
        forceRealtimePush: Boolean(options?.forceRealtimePush),
      });
      if (remoteTimestamp) {
        lastAppliedCloudTimestampRef.current = remoteTimestamp;
      }

      setAppState((current) => {
        if (!current) {
          pendingCloudUpdateRef.current = { data: incomingData, timestamp: remoteTimestamp };
          return current;
        }

        const currentBranchId = current.activeBranchId || DEFAULT_BRANCH_ID;
        if (!shouldApplyIncomingCloudStateForBranch(currentBranchId, incomingData)) {
          return current;
        }

        const incomingBranches =
          Array.isArray(incomingData.branches) && incomingData.branches.length > 0
            ? incomingData.branches
            : getBranchesList();
        const activeBranchObj = incomingBranches.find((b) => b.id === currentBranchId);
        const syncedPartition = readBranchPartitionFromLocal(currentBranchId);

        // Extract incoming branch partition directly in memory from incomingData so AppState updates
        // immediately even if localStorage quota is full or if incomingData is top-level
        const directPartitions = (incomingData as any)?.branchPartitions as
          | Record<string, Partial<AppState>>
          | undefined;
        const directBranchData: Partial<AppState> | null =
          directPartitions?.[currentBranchId] ||
          ((incomingData.activeBranchId || DEFAULT_BRANCH_ID) === currentBranchId && !directPartitions
            ? incomingData
            : null);

        const rawBakeries = Array.isArray(directBranchData?.bakeries)
          ? directBranchData!.bakeries!
          : Array.isArray(syncedPartition.bakeries)
          ? syncedPartition.bakeries
          : current.bakeries;
        const rawDebts = Array.isArray(directBranchData?.debts)
          ? directBranchData!.debts!
          : Array.isArray(syncedPartition.debts)
          ? syncedPartition.debts
          : current.debts;

        const syncedMemory = synchronizeBakeryAndDebts(rawBakeries, rawDebts);
        const nextBakeries = syncedMemory.bakeries;
        const nextDebts = syncedMemory.debts;

        const nextUsers =
          Array.isArray(directBranchData?.users) && directBranchData!.users!.length > 0
            ? directBranchData!.users!
            : Array.isArray(syncedPartition.users) && syncedPartition.users.length > 0
            ? syncedPartition.users
            : current.users;
        const nextVillages =
          (Array.isArray(directBranchData?.villages) && directBranchData!.villages!.length > 0
            ? directBranchData!.villages
            : syncedPartition.villages) || current.villages;
        const nextTasks =
          directBranchData?.dailyTasks || syncedPartition.dailyTasks || current.dailyTasks;
        const nextMessages =
          directBranchData?.inboxMessages || syncedPartition.inboxMessages || current.inboxMessages;
        const nextConfig: SystemConfig = {
          ...current.systemConfig,
          ...(syncedPartition.systemConfig || {}),
          ...(directBranchData?.systemConfig || {}),
          administrationTitle: activeBranchObj?.name || current.systemConfig.administrationTitle,
          logoBase64: DEFAULT_OFFICIAL_LOGO,
        };

        const resolvedCurrentUser = current.currentUser
          ? nextUsers.find(
              (u) =>
                u.id === current.currentUser!.id ||
                u.username.toLowerCase() === current.currentUser!.username.toLowerCase()
            ) || current.currentUser
          : null;

        // Complete structural digest check across ALL fields so no remote edit is ever skipped
        const currentSig = computeFullBranchDigest({
          bakeries: current.bakeries,
          debts: current.debts,
          users: current.users,
          villages: current.villages,
          dailyTasks: current.dailyTasks,
          inboxMessages: current.inboxMessages,
          systemConfig: current.systemConfig,
          branches: current.branches || [],
        });
        const nextSig = computeFullBranchDigest({
          bakeries: nextBakeries,
          debts: nextDebts,
          users: nextUsers,
          villages: nextVillages,
          dailyTasks: nextTasks,
          inboxMessages: nextMessages,
          systemConfig: nextConfig,
          branches: incomingBranches,
        });
        if (currentSig === nextSig) {
          return current;
        }

        const updatedState: AppState = {
          ...current,
          ...(syncedPartition as AppState),
          ...(directBranchData as Partial<AppState>),
          activeBranchId: currentBranchId,
          branches: incomingBranches,
          bakeries: nextBakeries,
          debts: nextDebts,
          villages: nextVillages,
          dailyTasks: nextTasks,
          inboxMessages: nextMessages,
          users: nextUsers,
          systemConfig: nextConfig,
          currentUser: resolvedCurrentUser,
        };

        queueMicrotask(() => {
          setSaveTimestamp(
            new Date().toLocaleTimeString('ar-EG', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
          recordRealtimeDiagnosticEvent({
            direction: 'APPSTATE',
            channel: 'APPSTATE_MEMORY',
            eventType: 'APPSTATE_UPDATED_IMMEDIATELY',
            table: 'bakeries',
            summary: `تم تحديث كائن AppState في الذاكرة فوراً (${nextBakeries.length} مخبز، ${nextDebts.length} مديونية، ${nextVillages.length} قرية)`,
            payloadPreview: JSON.stringify({
              branchId: currentBranchId,
              bakeriesCount: nextBakeries.length,
              debtsCount: nextDebts.length,
              villagesCount: nextVillages.length,
              remoteTimestamp,
            }),
          });
        });

        return updatedState;
      });
    };

    applyIncomingCloudStateRef.current = applyIncomingCloudState;

    // 1. Deferred initial external Supabase pull (avoids duplicating loadInitialState boot read)
    const bootSupaTimer = setTimeout(() => {
      fetchDatabaseFromSupabase()
        .then((supaRes) => {
          if (
            supaRes &&
            supaRes.success &&
            supaRes.data &&
            (!supaRes.timestamp || supaRes.timestamp !== lastAppliedCloudTimestampRef.current)
          ) {
            applyIncomingCloudState(supaRes.data, supaRes.timestamp, { forceRealtimePush: false });
          }
        })
        .catch(() => {});
    }, 1500);

    // 2. Real-time Listener: Adopt live database & row-level updates across devices immediately
    const unsubscribeSupabase = subscribeToSupabaseRealtime({
      onUpdate: (supaData, remoteTimestamp) => {
        applyIncomingCloudState(supaData, remoteTimestamp, { forceRealtimePush: true });
      },
      onRowChange: (change) => {
        if (change.table === 'high_debt_alerts') {
          if (change.eventType === 'DELETE') {
            const delId = String(change.oldRow?.id || '');
            if (delId) {
              setHighDebtNotifications((prev) => {
                const updated = prev.filter((n) => String(n.id) !== delId);
                try {
                  localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
                } catch {}
                return updated;
              });
            }
          } else if (change.newRow) {
            setHighDebtNotifications((prev) => {
              const incoming = change.newRow as HighDebtAlertNotification;
              const merged = mergeHighDebtAlerts(prev, [incoming]);
              try {
                localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
          return;
        }

        setAppState((current) => {
          if (!current) return current;
          const nextState = applyGranularRowChangeToState(current, change as any);
          if (nextState === current) return current;

          const persistedCopy = {
            ...nextState,
            systemConfig: {
              ...nextState.systemConfig,
              logoBase64: DEFAULT_OFFICIAL_LOGO,
            },
          };
          latestAppStateRef.current = persistedCopy;
          queueMicrotask(() => {
            setSaveTimestamp(getArabicTimestamp());
            recordRealtimeDiagnosticEvent({
              direction: 'APPSTATE',
              channel: 'APPSTATE_MEMORY',
              eventType: `ROW_APPLIED:${change.table}:${change.eventType}`,
              sqlOperation: change.eventType,
              table: change.table,
              affectedTable: change.table,
              summary: `تم تحديث كائن AppState فوراً استجابة لتعديل سجل في جدول (${change.table})`,
            });
            persistFullState(persistedCopy, { skipCloudSync: true }).catch(() => {});
          });
          return persistedCopy;
        });
      },
    });

    // 3. Cross-tab BroadcastChannel listener on same device (skip self-echoes)
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('tamween_cross_device_sync');
        bc.onmessage = (ev) => {
          if (ev.data?.type === 'STATE_UPDATED') {
            if (isSelfRealtimeEvent(ev.data?.clientId)) return;
            fetchDatabaseFromSupabase()
              .then((res) => {
                if (res.success && res.data) {
                  applyIncomingCloudState(res.data, res.timestamp);
                }
              })
              .catch(() => {});
          }
        };
      } catch {}
    }

    // 4. Continuous 2.5-second Authoritative PostgreSQL Bootstrap Poll across devices:
    // Guarantees instant multi-device & cross-browser sync even if WebSockets/SSE are buffered by proxies
    const livePgPollTimer = setInterval(async () => {
      try {
        if (typeof window === 'undefined' || typeof navigator === 'undefined' || navigator.onLine === false) {
          return;
        }
        // Skip polling while a local mutation is actively being committed
        const current = latestAppStateRef.current;
        if (!current) return;
        const activeBranchId = current.activeBranchId || DEFAULT_BRANCH_ID;
        const resp = await fetch(
          `${window.location.protocol}//${window.location.host}/api/db/bootstrap?branchId=${encodeURIComponent(
            activeBranchId
          )}&_t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
          }
        ).catch(() => null);
        if (!resp || !resp.ok) return;
        const bootJson = await resp.json().catch(() => null);
        if (!bootJson?.success) return;

        const bootPayload: any = {
          activeBranchId,
          branches: bootJson.branches,
          villages: bootJson.villages?.length ? bootJson.villages : undefined,
          bakeries: Array.isArray(bootJson.bakeries) ? bootJson.bakeries : [],
          debts: Array.isArray(bootJson.debts) ? bootJson.debts : [],
          users: bootJson.users?.length ? bootJson.users : undefined,
          dailyTasks: bootJson.dailyTasks,
          inboxMessages: bootJson.inboxMessages,
          ...(bootJson.systemConfig ? { systemConfig: bootJson.systemConfig } : {}),
          ...(bootJson.columnTitles && Object.keys(bootJson.columnTitles).length > 0
            ? { columnTitles: bootJson.columnTitles }
            : {}),
          ...(bootJson.activityStatuses?.length ? { activityStatuses: bootJson.activityStatuses } : {}),
          ...(bootJson.dropdownLists || {}),
        };
        applyIncomingCloudState(bootPayload as AppState, bootJson.timestamp, {
          forceRealtimePush: true,
        });
      } catch {}
    }, 2500);

    return () => {
      clearTimeout(bootSupaTimer);
      clearInterval(livePgPollTimer);
      unsubscribeSupabase();
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, []);

  // Open Daily Entry Briefing Modal automatically once when user enters the database
  const [hasShownDailyBriefingSession, setHasShownDailyBriefingSession] = useState(false);
  useEffect(() => {
    if (appState?.currentUser && !hasShownDailyBriefingSession) {
      setHasShownDailyBriefingSession(true);
      const isAutoStart =
        typeof window !== 'undefined' && window.location.search.includes('autostart=1');
      if (!isAutoStart) {
        setIsDailyBriefingModalOpen(true);
      }
    }
  }, [appState?.currentUser, hasShownDailyBriefingSession]);

  // Async Optimistic Save with Row-Level PostgreSQL/Supabase confirmation & conflict/error rollback
  const saveLockRef = React.useRef<Promise<void>>(Promise.resolve());

  const commitRowMutation = useCallback(
    (params: {
      nextState: AppState;
      toastMessage: string;
      table?: RowMutationTable;
      branchId?: string;
      executeDb: () => Promise<DbMutationResult>;
      patchReturnedRow?: (current: AppState, savedRow: any) => AppState;
    }): Promise<DbMutationResult> => {
      const previousState = latestAppStateRef.current;
      latestAppStateRef.current = params.nextState;
      setAppState(params.nextState);
      setIsSavingPulse(true);
      const ts = getArabicTimestamp();
      const diskInfo = getActiveDiskBackupInfo();
      const diskSuffix = diskInfo.hasHandle
        ? ` (وتحديث النسخة الاحتياطية على القرص: ${diskInfo.fileName})`
        : '';
      const baseMsg = params.toastMessage + diskSuffix;
      const effectiveBranchId =
        params.branchId || params.nextState.activeBranchId || DEFAULT_BRANCH_ID;

      const mutationPromise = saveLockRef.current
        .catch(() => {})
        .then(async (): Promise<DbMutationResult> => {
          const res = await params.executeDb();
          if (res.success) {
            let confirmedState = latestAppStateRef.current || params.nextState;
            if (res.row && params.patchReturnedRow) {
              confirmedState = params.patchReturnedRow(confirmedState, res.row);
              latestAppStateRef.current = confirmedState;
              setAppState(confirmedState);
            }
            await persistFullState(confirmedState, { skipCloudSync: true }).catch(() => {});
            setSaveTimestamp(ts);
            setSaveToast({
              id: Date.now(),
              message: baseMsg,
              timestamp: ts,
              variant: 'success',
            });
          } else if (res.queuedOffline) {
            await persistFullState(params.nextState, { skipCloudSync: true }).catch(() => {});
            setSaveTimestamp(ts);
            setSaveToast({
              id: Date.now(),
              message:
                'انقطع الاتصال بالإنترنت — تم حفظ العملية بأمان في قائمة الانتظار وستُرسل تلقائياً فور عودة الاتصال.',
              timestamp: ts,
              variant: 'warning',
            });
          } else if (res.conflict) {
            await persistFullState(params.nextState, { skipCloudSync: true }).catch(() => {});
            setSaveTimestamp(ts);
            setSaveToast({
              id: Date.now(),
              message: baseMsg,
              timestamp: ts,
              variant: 'success',
            });
          } else {
            if (previousState) {
              latestAppStateRef.current = previousState;
              setAppState(previousState);
              await persistFullState(previousState, { skipCloudSync: true }).catch(() => {});
            }
            setSaveToast({
              id: Date.now(),
              message:
                res.error ||
                'تعذر حفظ التعديلات على قاعدة البيانات — تم التراجع عن التعديل محلياً.',
              timestamp: ts,
              variant: 'error',
            });
          }
          return res;
        })
        .finally(() => {
          setTimeout(() => setIsSavingPulse(false), 600);
        });

      saveLockRef.current = mutationPromise.then(
        () => undefined,
        () => undefined
      );
      return mutationPromise;
    },
    []
  );

  const triggerSave = useCallback((newState: AppState, toastMessage?: string) => {
    const previousState = latestAppStateRef.current;
    latestAppStateRef.current = newState;
    setAppState(newState);
    setIsSavingPulse(true);
    const ts = getArabicTimestamp();
    const diskInfo = getActiveDiskBackupInfo();
    const diskSuffix = diskInfo.hasHandle ? ` (وتحديث النسخة الاحتياطية على القرص: ${diskInfo.fileName})` : '';
    const baseMsg = (toastMessage || 'تم الحفظ والمزامنة مع قاعدة البيانات بنجاح') + diskSuffix;
    const branchId = newState.activeBranchId || DEFAULT_BRANCH_ID;

    saveLockRef.current = saveLockRef.current
      .catch(() => {})
      .then(async () => {
        const batchRes = await batchSyncToDb({
          branchId,
          data: newState,
          pruneRemoved: true,
          sqlOperation: 'UPDATE',
          affectedTable: 'bakeries',
        });

        if (batchRes.success) {
          await persistFullState(newState, { skipCloudSync: true }).catch(() => {});
          setSaveTimestamp(ts);
          setSaveToast({
            id: Date.now(),
            message: baseMsg,
            timestamp: ts,
            variant: 'success',
          });
          return;
        }

        // Offline fallback: persist full snapshot into offline queue so zero work is lost
        const res = await persistFullState(newState);
        if (res.cloudSynced || res.queuedOffline || batchRes.queuedOffline) {
          setSaveTimestamp(res.syncedAt || ts);
          setSaveToast({
            id: Date.now(),
            message:
              res.queuedOffline || batchRes.queuedOffline
                ? 'انقطع الاتصال بالإنترنت — تم حفظ التعديل بأمان في قائمة الانتظار وسيُرسل تلقائياً عند عودة الشبكة.'
                : baseMsg,
            timestamp: res.syncedAt || ts,
            variant: res.queuedOffline || batchRes.queuedOffline ? 'warning' : 'success',
          });
        } else {
          if (previousState) {
            latestAppStateRef.current = previousState;
            setAppState(previousState);
            await persistFullState(previousState, { skipCloudSync: true }).catch(() => {});
          }
          setSaveToast({
            id: Date.now(),
            message:
              batchRes.error ||
              res.error ||
              'تعذر حفظ التعديلات على قاعدة بيانات Supabase — تم التراجع عن التعديل محلياً.',
            timestamp: ts,
            variant: 'error',
          });
        }
      })
      .finally(() => {
        setTimeout(() => setIsSavingPulse(false), 600);
      });
  }, []);

  // Auto-dismiss save toast after 3.8 seconds
  useEffect(() => {
    if (saveToast) {
      const timer = setTimeout(() => {
        setSaveToast(null);
      }, 3800);
      return () => clearTimeout(timer);
    }
  }, [saveToast]);

  // Note: Redundant 15-second full-state serialization interval removed to prevent UI lag during navigation; triggerSave persists immediately on every state change.

  // Automated Daily License Expiry Alert Check Loop (Checks every 30 seconds)
  useEffect(() => {
    if (!appState) return;
    const dailyConfig = appState.systemConfig?.dailyAlertConfig;
    if (!dailyConfig || dailyConfig.enabled === false) return;

    const checkDailyAlert = () => {
      const now = new Date();
      const currentHour = String(now.getHours()).padStart(2, '0');
      const currentMinute = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHour}:${currentMinute}`;
      const todayDateStr = now.toISOString().split('T')[0];

      // Check if current time matches scheduled alert time and hasn't fired today
      const lastFiredLocally = typeof localStorage !== 'undefined' ? localStorage.getItem('TAMWEEN_DAILY_ALERT_LAST_DATE') : null;
      if (currentTimeStr === dailyConfig.alertTime && dailyConfig.lastAlertDate !== todayDateStr && lastFiredLocally !== todayDateStr) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDocs = dailyConfig.targetDocs && dailyConfig.targetDocs.length > 0
          ? dailyConfig.targetDocs
          : ['bakeryLicenseDate', 'commercialRegDate', 'leaseAgreementDate', 'taxCardDate'];
        const threshold = dailyConfig.daysThreshold ?? 0;

        const docLabels: Record<string, string> = {
          bakeryLicenseDate: 'رخصة تشغيل المخبز التمويني',
          commercialRegDate: 'السجل التجاري',
          leaseAgreementDate: 'عقد الإيجار / الملكية',
          taxCardDate: 'البطاقة الضريبية',
        };

        const matches: { bakery: Bakery; docName: string; expiryDate: string; daysDiff: number }[] = [];

        appState.bakeries.forEach((b) => {
          targetDocs.forEach((docKey) => {
            const dateStr = (b as any)[docKey];
            if (!dateStr || !String(dateStr).trim()) return;
            const d = new Date(String(dateStr).trim());
            if (isNaN(d.getTime())) return;
            d.setHours(0, 0, 0, 0);

            const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= threshold) {
              matches.push({
                bakery: b,
                docName: docLabels[docKey] || docKey,
                expiryDate: dateStr,
                daysDiff: diffDays,
              });
            }
          });
        });

        if (matches.length > 0) {
          setDailyNotificationData({
            isOpen: true,
            alertTime: dailyConfig.alertTime,
            expiredBakeries: matches,
          });

          // Web Notification API
          if (dailyConfig.notifyBrowser && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('🔔 إخطار إداري يومي - تموين المحلة الكبرى', {
                body: `تذكير يومي (${dailyConfig.alertTime}): يوجد عدد (${matches.length}) مخابز منتهية التراخيص تتطلب المتابعة الفورية.`,
                icon: '/favicon.ico',
              });
            } catch {
              // fallback
            }
          }

          // Mark today as alerted in localStorage to avoid re-triggering loop
          try {
            localStorage.setItem('TAMWEEN_DAILY_ALERT_LAST_DATE', todayDateStr);
          } catch {}
        }
      }
    };

    checkDailyAlert();
    const interval = setInterval(checkDailyAlert, 60000);
    return () => clearInterval(interval);
  }, [appState?.systemConfig?.dailyAlertConfig, appState?.bakeries]);

  const handleSaveDailyAlertConfig = (updatedConfig: DailyAlertConfig) => {
    if (!appState) return;
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const nextConfig = {
      ...appState.systemConfig,
      dailyAlertConfig: updatedConfig,
    };
    const updatedState = {
      ...appState,
      systemConfig: nextConfig,
    };
    commitRowMutation({
      nextState: updatedState,
      table: 'system_config',
      branchId,
      toastMessage: `تم حفظ وتأكيد موعد التنبيه اليومي (${updatedConfig.alertTime}) في قاعدة البيانات بنجاح`,
      executeDb: () =>
        saveRowToDb({
          table: 'system_config',
          branchId,
          row: {
            branchId,
            systemConfig: nextConfig,
            columnTitles: appState.columnTitles,
            activityStatuses: appState.activityStatuses,
          },
          operation: 'UPDATE',
        }),
    });
  };

  const handleTriggerTestAlert = (matchingBakeries: { bakery: Bakery; docName: string; expiryDate: string; daysDiff: number }[]) => {
    const alertTime = appState?.systemConfig?.dailyAlertConfig?.alertTime || '09:00';
    setDailyNotificationData({
      isOpen: true,
      alertTime,
      expiredBakeries: matchingBakeries,
    });
  };

  // Expiration alerts engine scan
  const alertsList = useMemo(() => {
    if (!appState) return [];
    return getExpirationAlerts(appState.bakeries);
  }, [appState]);

  // Compute map of remaining debts per bakery
  const bakeryRemainingDebtsMap = useMemo(() => {
    if (!appState) return {};
    const map: Record<string, number> = {};
    appState.debts.forEach((d) => {
      map[d.bakeryId] = (map[d.bakeryId] || 0) + (d.netRemainingDebt || 0);
    });
    return map;
  }, [appState]);

  // List of bakeries with debts > 20,000 EGP requiring weekly installments
  const largeDebtsList = useMemo(() => {
    if (!appState) return [];
    return appState.bakeries
      .map((b) => ({
        bakery: b,
        totalDebt: bakeryRemainingDebtsMap[b.id] || 0,
      }))
      .filter((item) => item.totalDebt > 20000)
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }, [appState, bakeryRemainingDebtsMap]);

  // Dynamic villages filter (all hierarchy villages + any custom villages present in bakeries)
  const availableVillagesFilter = useMemo(() => {
    if (!appState) return [];
    const seenNorm = new Set<string>();
    const list: string[] = [];
    appState.villages.forEach((v) => {
      const norm = normalizeArabicText(v.village);
      if (v.village && !seenNorm.has(norm)) {
        seenNorm.add(norm);
        list.push(v.village);
      }
    });
    appState.bakeries.forEach((b) => {
      const vName = (b.village || '').trim();
      const norm = normalizeArabicText(vName);
      if (vName && !seenNorm.has(norm)) {
        seenNorm.add(norm);
        list.push(vName);
      }
    });
    return list;
  }, [appState]);

  // Dynamic units for selected village filter (all units or village-specific, including any custom units on bakeries)
  const availableUnitsFilter = useMemo(() => {
    if (!appState) return [];
    const set = new Set<string>();
    if (selectedVillage !== 'ALL') {
      const targetNorm = normalizeArabicText(selectedVillage);
      const v = appState.villages.find((x) => normalizeArabicText(x.village) === targetNorm);
      if (v) {
        v.localUnits.forEach((u) => {
          if (u && u.trim()) set.add(u.trim());
        });
      }
      appState.bakeries.forEach((b) => {
        if (
          normalizeArabicText(b.village) === targetNorm ||
          (v && v.localUnits.some((u) => normalizeArabicText(u) === normalizeArabicText(b.localUnit)))
        ) {
          if (b.localUnit && b.localUnit.trim()) set.add(b.localUnit.trim());
        }
      });
      return Array.from(set);
    }
    appState.villages.forEach((v) =>
      v.localUnits.forEach((u) => {
        if (u && u.trim()) set.add(u.trim());
      })
    );
    appState.bakeries.forEach((b) => {
      if (b.localUnit && b.localUnit.trim()) set.add(b.localUnit.trim());
    });
    return Array.from(set);
  }, [appState, selectedVillage]);

  // Precompute count of bakeries expiring across timeline intervals
  const licenseExpiryCounts = useMemo(() => {
    if (!appState) return { expired: 0, within30: 0, within60: 0, within90: 0, valid: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expired = 0;
    let within30 = 0;
    let within60 = 0;
    let within90 = 0;
    let valid = 0;

    appState.bakeries.forEach((b) => {
      const datesToCheck = [
        b.bakeryLicenseDate,
        b.commercialRegDate,
        b.leaseAgreementDate,
        b.taxCardDate,
      ].filter(Boolean);

      let minDays = Infinity;
      datesToCheck.forEach((dStr) => {
        if (!dStr) return;
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 3600 * 24));
          if (diffDays < minDays) minDays = diffDays;
        }
      });

      if (datesToCheck.length === 0) {
        valid++;
      } else {
        if (minDays < 0) expired++;
        if (minDays <= 30) within30++;
        if (minDays <= 60) within60++;
        if (minDays <= 90) within90++;
        if (minDays > 90) valid++;
      }
    });

    return { expired, within30, within60, within90, valid };
  }, [appState]);

  // Precompute bakery category counts
  const categoryCounts = useMemo(() => {
    if (!appState) return { baladi: 0, baladiMotawar: 0, tourist: 0, fino: 0, tabaqi: 0 };
    let baladi = 0, baladiMotawar = 0, tourist = 0, fino = 0, tabaqi = 0;
    appState.bakeries.forEach((b) => {
      const cat = b.bakeryCategory || 'مخبز بلدي مدعم';
      if (cat.includes('مطور')) baladiMotawar++;
      else if (cat.includes('سياحي')) tourist++;
      else if (cat.includes('فينو')) fino++;
      else if (cat.includes('طباقي')) tabaqi++;
      else baladi++;
    });
    return { baladi, baladiMotawar, tourist, fino, tabaqi };
  }, [appState]);

  // Filtered bakeries for main table
  const filteredBakeries = useMemo(() => {
    const today = new Date();
    if (!appState) return [];

    return appState.bakeries.filter((b) => {
      if (!matchesVillageOrUnitFilter(b, selectedVillage, selectedUnit, appState.villages)) {
        return false;
      }
      if (selectedActivity !== 'ALL' && b.activityStatus !== selectedActivity) return false;

      // Filter by Bakery Category (تصنيف المخبز)
      if (selectedCategoryFilter !== 'ALL') {
        const cat = b.bakeryCategory || 'مخبز بلدي مدعم';
        if (!cat.includes(selectedCategoryFilter)) return false;
      }

      const debt = bakeryRemainingDebtsMap[b.id] || 0;
      if (selectedDebtFilter === 'HAS_DEBT' && debt <= 0) return false;
      if (selectedDebtFilter === 'NO_DEBT' && debt > 0) return false;

      // Filter by License Expiry timeline
      if (selectedLicenseExpiryFilter !== 'ALL') {
        const datesToCheck = [
          b.bakeryLicenseDate,
          b.commercialRegDate,
          b.leaseAgreementDate,
          b.taxCardDate,
        ].filter(Boolean);

        // Find the earliest expiration days remaining among all docs
        let minDaysRemaining = Infinity;
        datesToCheck.forEach((dStr) => {
          if (!dStr) return;
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            d.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((d.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (diffDays < minDaysRemaining) {
              minDaysRemaining = diffDays;
            }
          }
        });

        if (datesToCheck.length === 0) {
          // If no dates set, exclude unless viewing all
          if (selectedLicenseExpiryFilter !== 'VALID') return false;
        } else {
          switch (selectedLicenseExpiryFilter) {
            case 'EXPIRED':
              if (minDaysRemaining >= 0) return false;
              break;
            case 'WITHIN_30':
              // Either already expired or expires within 30 days
              if (minDaysRemaining > 30) return false;
              break;
            case 'WITHIN_60':
              // Expires within 60 days
              if (minDaysRemaining > 60) return false;
              break;
            case 'WITHIN_90':
              // Expires within 90 days
              if (minDaysRemaining > 90) return false;
              break;
            case 'VALID':
              // Valid for more than 90 days
              if (minDaysRemaining <= 90) return false;
              break;
          }
        }
      }

      // Dual/Multi Filter: Bread Type (نوع الخبز)
      if (selectedBreadTypeFilter !== 'ALL' && b.breadType !== selectedBreadTypeFilter) {
        return false;
      }

      // Dual/Multi Filter: Fuel Type / Line Type (نوع الوقود / خط الإنتاج)
      if (
        selectedFuelTypeFilter !== 'ALL' &&
        b.fuelType !== selectedFuelTypeFilter &&
        b.lineType !== selectedFuelTypeFilter
      ) {
        return false;
      }

      if (debouncedSearchTerm.trim()) {
        const q = debouncedSearchTerm.toLowerCase();
        if (searchFocusMode === 'NAME') {
          if (!b.bakeryOwnerName.toLowerCase().includes(q)) return false;
        } else if (searchFocusMode === 'MACHINE') {
          if (!b.machineNumber.toLowerCase().includes(q)) return false;
        } else {
          const match =
            b.bakeryOwnerName.toLowerCase().includes(q) ||
            b.machineNumber.includes(q) ||
            b.village.toLowerCase().includes(q) ||
            b.localUnit.toLowerCase().includes(q) ||
            (b.responsibleManager || '').toLowerCase().includes(q) ||
            (b.commercialRegNumber || '').toLowerCase().includes(q) ||
            (b.bakeryLicenseNumber || '').toLowerCase().includes(q) ||
            (b.taxCardNumber || '').toLowerCase().includes(q) ||
            (b.leaseContractType || '').toLowerCase().includes(q) ||
            b.phone.includes(q) ||
            b.nationalId.includes(q);
          if (!match) return false;
        }
      }
      return true;
    });
  }, [
    appState,
    selectedVillage,
    selectedUnit,
    selectedActivity,
    selectedDebtFilter,
    selectedCategoryFilter,
    selectedLicenseExpiryFilter,
    selectedBreadTypeFilter,
    selectedFuelTypeFilter,
    debouncedSearchTerm,
    searchFocusMode,
    bakeryRemainingDebtsMap,
  ]);

  // Sorted bakeries for table display
  const sortedBakeries = useMemo(() => {
    const list = [...filteredBakeries];
    if (sortField === 'index') {
      return sortDirection === 'asc' ? list : list.reverse();
    }
    list.sort((a, b) => {
      let valA: any;
      let valB: any;
      if (sortField === 'remainingDebt') {
        valA = bakeryRemainingDebtsMap[a.id] || 0;
        valB = bakeryRemainingDebtsMap[b.id] || 0;
      } else if (
        sortField === 'perCapitaAverage' ||
        sortField === 'avg2023' ||
        sortField === 'avg2024' ||
        sortField === 'avg2025' ||
        sortField === 'avgDiff'
      ) {
        valA = parseFloat(String((a as any)[sortField] || '0')) || 0;
        valB = parseFloat(String((b as any)[sortField] || '0')) || 0;
      } else {
        valA = (a as any)[sortField];
        valB = (b as any)[sortField];
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA ?? '').trim();
      const strB = String(valB ?? '').trim();
      return sortDirection === 'asc'
        ? strA.localeCompare(strB, 'ar')
        : strB.localeCompare(strA, 'ar');
    });
    return list;
  }, [filteredBakeries, sortField, sortDirection, bakeryRemainingDebtsMap]);

  const totalPages = Math.max(1, Math.ceil(sortedBakeries.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedBakeries = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return sortedBakeries.slice(startIdx, startIdx + pageSize);
  }, [sortedBakeries, safeCurrentPage, pageSize]);

  // Memoized Grand Totals across ALL sortedBakeries for tfoot ("صف الإجماليات TOTAL SUMMARY")
  const grandTotals = useMemo(() => {
    return calculateBakeriesColumnTotals(sortedBakeries, bakeryRemainingDebtsMap);
  }, [sortedBakeries, bakeryRemainingDebtsMap]);

  // In-table Local Unit Grouping Engine (Paginated rows + Full Local Unit Totals from sortedBakeries; NO intermediate Village total row)
  const hierarchicalGroups = useMemo(() => {
    const pageList = paginatedBakeries;
    if (!pageList || pageList.length === 0) return [];

    // Pre-index all matching bakeries in sortedBakeries by local unit so subtotals reflect full unit sums
    const fullUnitBakeMap = new Map<string, Bakery[]>();
    sortedBakeries.forEach((b) => {
      const unitKey = getLocalUnitKey(b.village, b.localUnit);
      const existing = fullUnitBakeMap.get(unitKey);
      if (existing) {
        existing.push(b);
      } else {
        fullUnitBakeMap.set(unitKey, [b]);
      }
    });

    // Group current page's bakeries by Village -> Local Unit so same-village units stay together cleanly
    const villageMap = new Map<
      string,
      { displayName: string; unitsMap: Map<string, { displayName: string; fullKey: string; bakeries: Bakery[] }> }
    >();

    pageList.forEach((b) => {
      const vRaw = (b.village || 'غير محدد').trim();
      const uRaw = (b.localUnit || 'غير محدد').trim();
      const vKey = normalizeArabicText(vRaw) || 'غير محدد';
      const uKey = normalizeArabicText(uRaw) || 'غير محدد';
      const fullUnitKey = getLocalUnitKey(vRaw, uRaw);

      if (!villageMap.has(vKey)) {
        villageMap.set(vKey, {
          displayName: vRaw,
          unitsMap: new Map(),
        });
      }
      const vEntry = villageMap.get(vKey)!;
      if (!vEntry.unitsMap.has(uKey)) {
        vEntry.unitsMap.set(uKey, {
          displayName: uRaw,
          fullKey: fullUnitKey,
          bakeries: [],
        });
      }
      vEntry.unitsMap.get(uKey)!.bakeries.push(b);
    });

    type LocalUnitGroupItem = ReturnType<typeof calculateBakeriesColumnTotals> & {
      localUnit: string;
      village: string;
      bakeries: Bakery[];
    };

    const result: LocalUnitGroupItem[] = [];

    villageMap.forEach((vEntry) => {
      vEntry.unitsMap.forEach((uEntry) => {
        const fullUnitBakeries = fullUnitBakeMap.get(uEntry.fullKey) || uEntry.bakeries;
        const uTotals = calculateBakeriesColumnTotals(fullUnitBakeries, bakeryRemainingDebtsMap);
        result.push({
          ...uTotals,
          localUnit: uEntry.displayName,
          village: vEntry.displayName,
          bakeries: uEntry.bakeries,
        });
      });
    });

    return result;
  }, [paginatedBakeries, sortedBakeries, bakeryRemainingDebtsMap]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Statistics for bakeries
  const bakeryStats = useMemo(() => {
    if (!appState) return { count: 0, totalInsurance: 0, totalActual: 0, totalLoaves: 0, totalDebts: 0 };
    let totalInsurance = 0;
    let totalActual = 0;
    let totalLoaves = 0;
    let totalDebts = 0;

    appState.bakeries.forEach((b) => {
      totalInsurance += b.insuranceQuota || 0;
      totalActual += b.actualQuota || 0;
      totalLoaves += b.loavesCount || 0;
      totalDebts += bakeryRemainingDebtsMap[b.id] || 0;
    });

    return {
      count: appState.bakeries.length,
      totalInsurance,
      totalActual,
      totalLoaves,
      totalDebts,
    };
  }, [appState?.bakeries, bakeryRemainingDebtsMap]);

  // Annual Weighted Averages Report Summary (المتوسط العام المرجح بأعداد المستفيدين 2023 - 2025)
  const annualWeightedSummary = useMemo(() => {
    if (!appState) return null;
    return calculateAnnualWeightedAveragesReport(filteredBakeries.length > 0 ? filteredBakeries : appState.bakeries);
  }, [appState?.bakeries, filteredBakeries]);

  // Keep fresh ref of appState for 10-min pre-logout autosave
  const appStateRef = React.useRef(appState);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // Handle Logout (Terminates session safely without resetting data)
  const handleLogout = useCallback((reason?: string) => {
    saveSessionUser(null);
    setLogoutReason(reason || null);
    setAppState((prev) => (prev ? { ...prev, currentUser: null } : null));
  }, []);

  // Handle Safe Save and Logout (حفظ آمن وتسجيل خروج فوري)
  const handleSafeSaveAndLogout = useCallback(async () => {
    const initialState = latestAppStateRef.current || appStateRef.current || appState;
    if (!initialState) return;
    try {
      setIsSavingPulse(true);
      await saveLockRef.current.catch(() => {});
      await flushRowMutationQueue().catch(() => {});
      const current = latestAppStateRef.current || appStateRef.current || initialState;
      const branchId = current.activeBranchId || DEFAULT_BRANCH_ID;
      const batchRes = await batchSyncToDb({
        branchId,
        data: current,
        pruneRemoved: true,
        sqlOperation: 'UPDATE',
        affectedTable: 'bakeries',
      });
      await persistFullState(current, { skipCloudSync: batchRes.success }).catch(() => {});
      handleLogout('تم الحفظ الآمن لكافة السجلات والبيانات وتأمين تسجيل الخروج بنجاح.');
    } catch (err) {
      console.error('Error during safe save and logout:', err);
      handleLogout('تم تسجيل الخروج وقفل الجلسة بنجاح.');
    } finally {
      setIsSavingPulse(false);
    }
  }, [appState, handleLogout]);

  const [isSyncingWithCloud, setIsSyncingWithCloud] = useState(false);

  const handleSwitchBranch = useCallback(
    async (targetBranchId: string, updatedBranchesList?: SupplyBranch[]) => {
      setActiveBranchId(targetBranchId);
      requestRealtimeBranchInit(targetBranchId);
      setSelectedVillage('ALL');
      setSelectedUnit('ALL');
      setSelectedActivity('ALL');
      setSelectedDebtFilter('ALL');
      setSelectedCategoryFilter('ALL');
      setSelectedLicenseExpiryFilter('ALL');
      setSelectedBreadTypeFilter('ALL');
      setSelectedFuelTypeFilter('ALL');
      setSearchTerm('');
      setCurrentPage(1);
      setDebtFilterBakeryId(undefined);
      setDetailsBakery(null);
      setIsVaultUnlocked(false);

      const branchesToUse = updatedBranchesList || getBranchesList();
      if (updatedBranchesList) {
        saveBranchesList(branchesToUse);
      }
      const branchObj = branchesToUse.find((b) => b.id === targetBranchId);

      // 1. Immediately apply local branch partition & isolated branch auth vault (0ms UI response)
      const immediatePartition = readBranchPartitionFromLocal(targetBranchId);
      const immediateVault = loadBranchAuthVault(targetBranchId, branchObj?.name);

      setAppState((prev) => {
        if (!prev) return prev;
        const prevUser = prev.currentUser;
        // Only keep user logged in if they actually exist in the target branch's isolated vault with matching credentials
        const resolvedBranchUser = prevUser
          ? immediateVault.users.find(
              (u) =>
                u.username.toLowerCase() === prevUser.username.toLowerCase() &&
                (u.password || '') === (prevUser.password || '')
            ) || null
          : null;
        if (prevUser && !resolvedBranchUser) {
          saveSessionUser(null);
        } else if (resolvedBranchUser) {
          saveSessionUser(resolvedBranchUser);
        }
        return {
          ...prev,
          ...(immediatePartition as AppState),
          activeBranchId: targetBranchId,
          branches: branchesToUse,
          users: immediateVault.users,
          currentUser: resolvedBranchUser,
          systemConfig: {
            ...prev.systemConfig,
            ...(immediatePartition.systemConfig || {}),
            administrationTitle: branchObj?.name || prev.systemConfig.administrationTitle,
            rolePermissions: immediateVault.rolePermissions,
            roleLabels: immediateVault.roleLabels,
            customRoles: immediateVault.customRoles,
            logoBase64: DEFAULT_OFFICIAL_LOGO,
          },
        };
      });

      // 2. Fetch latest cloud updates in background and refresh active branch state
      const loaded = await loadInitialState(targetBranchId);
      const refreshedVault = loadBranchAuthVault(targetBranchId, branchObj?.name);
      setAppState((prev) => {
        const prevUser = prev?.currentUser;
        const resolvedBranchUser = prevUser
          ? refreshedVault.users.find(
              (u) =>
                u.username.toLowerCase() === prevUser.username.toLowerCase() &&
                (u.password || '') === (prevUser.password || '')
            ) || null
          : null;
        if (prevUser && !resolvedBranchUser) {
          saveSessionUser(null);
        }
        return {
          ...loaded,
          activeBranchId: targetBranchId,
          branches: branchesToUse,
          users: refreshedVault.users,
          currentUser: resolvedBranchUser,
          systemConfig: {
            ...loaded.systemConfig,
            administrationTitle: branchObj?.name || loaded.systemConfig.administrationTitle,
            rolePermissions: refreshedVault.rolePermissions,
            roleLabels: refreshedVault.roleLabels,
            customRoles: refreshedVault.customRoles,
            logoBase64: DEFAULT_OFFICIAL_LOGO,
          },
        };
      });
      setSaveToast({
        id: Date.now(),
        message: `تم الدخول إلى واجهة (${branchObj?.name || 'الإدارة التموينية'}) بقاعدة بيانات وصلاحيات مستقلة ومنفصلة تماماً`,
        timestamp: getArabicTimestamp(),
      });
    },
    []
  );

  const handleManualCloudPull = useCallback(async () => {
    setIsSyncingWithCloud(true);
    try {
      const supaRes = await fetchDatabaseFromSupabase();
      const cloudData: Partial<AppState> | undefined = supaRes.success ? supaRes.data : undefined;
      const savedAt: string | undefined = supaRes.timestamp;

      if (cloudData) {
        syncAllBranchesFromCloudPayload(cloudData, savedAt);
        setAppState((prev) => {
          if (!prev) return prev;
          const currentBranchId = prev.activeBranchId || DEFAULT_BRANCH_ID;
          const updatedBranches = getBranchesList();
          const branchObj = updatedBranches.find((b) => b.id === currentBranchId);
          const syncedPartition = readBranchPartitionFromLocal(currentBranchId);
          const nextUsers = syncedPartition.users || prev.users;
          const resolvedUser = prev.currentUser
            ? nextUsers.find(
                (u) =>
                  u.id === prev.currentUser!.id ||
                  u.username.toLowerCase() === prev.currentUser!.username.toLowerCase()
              ) || prev.currentUser
            : null;
          return {
            ...prev,
            ...(syncedPartition as AppState),
            activeBranchId: currentBranchId,
            branches: updatedBranches,
            users: nextUsers,
            systemConfig: {
              ...prev.systemConfig,
              ...(syncedPartition.systemConfig || {}),
              administrationTitle: branchObj?.name || prev.systemConfig.administrationTitle,
              logoBase64: DEFAULT_OFFICIAL_LOGO,
            },
            currentUser: resolvedUser,
          };
        });
        const activeBranchId = appStateRef.current?.activeBranchId || DEFAULT_BRANCH_ID;
        const activePart = readBranchPartitionFromLocal(activeBranchId);
        const dateStr = savedAt ? new Date(savedAt).toLocaleTimeString('ar-EG') : '';
        setSaveToast({
          id: Date.now(),
          message: `تمت مزامنة أحدث البيانات والصلاحيات السحابية لجميع الفروع بنجاح (${activePart.bakeries?.length || 0} مخبز • ${activePart.debts?.length || 0} قيد مديونية بالفرع الحالي - توقيت: ${dateStr})`,
          timestamp: getArabicTimestamp(),
        });
      } else {
        setSaveToast({
          id: Date.now(),
          message: 'بيانات جهازك محدثة بالفعل، لم يتم العثور على سجلات جديدة على الخادم السحابي.',
          timestamp: getArabicTimestamp(),
          variant: 'success',
        });
      }
    } catch (err) {
      console.error('Cloud pull error:', err);
      setSaveToast({
        id: Date.now(),
        message: 'تعذر الاتصال بالخادم السحابي لجلب أحدث البيانات. تحقق من اتصال الإنترنت.',
        timestamp: getArabicTimestamp(),
        variant: 'error',
      });
    } finally {
      setIsSyncingWithCloud(false);
    }
  }, []);

  const handleRetryConnection = useCallback(async () => {
    setIsRetryingConnection(true);
    try {
      const res = await retrySupabaseConnection(appStateRef.current);
      if (res.success && res.pulledData) {
        applyIncomingCloudStateRef.current?.(res.pulledData, res.pulledTimestamp);
      }
      setSaveToast({
        id: Date.now(),
        message: res.message,
        timestamp: getArabicTimestamp(),
        variant: res.success ? 'success' : 'error',
      });
    } catch (err: any) {
      setSaveToast({
        id: Date.now(),
        message: err?.message || 'تعذر إعادة الاتصال بالخادم السحابي',
        timestamp: getArabicTimestamp(),
        variant: 'error',
      });
    } finally {
      setIsRetryingConnection(false);
    }
  }, []);

  // Global Escape key modal closing is intentionally disabled per user preference so windows only close via explicit close buttons.

  // Auto-logout when user leaves the computer / idle for 10 minutes (with automatic full pre-logout save)
  useEffect(() => {
    if (!appState?.currentUser) return;

    let idleTimeout: ReturnType<typeof setTimeout>;
    const IDLE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes of inactivity

    const resetIdleTimer = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(async () => {
        // Pre-logout autosave of all registered data
        if (latestAppStateRef.current || appStateRef.current) {
          try {
            await saveLockRef.current.catch(() => {});
            await flushRowMutationQueue().catch(() => {});
            const latest = latestAppStateRef.current || appStateRef.current;
            if (latest) {
              const branchId = latest.activeBranchId || DEFAULT_BRANCH_ID;
              const batchRes = await batchSyncToDb({
                branchId,
                data: latest,
                pruneRemoved: true,
                sqlOperation: 'UPDATE',
                affectedTable: 'bakeries',
              });
              await persistFullState(latest, { skipCloudSync: batchRes.success }).catch(() => {});
            }
          } catch (e) {
            console.error('Pre-logout autosave failed:', e);
          }
        }
        handleLogout('تم الحفظ التلقائي لجميع البيانات وقفل الشاشة وتأمين تسجيل الخروج التلقائي لعدم وجود نشاط لمدة 10 دقائق.');
      }, IDLE_LIMIT_MS);
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    // Auto-logout when leaving the computer (closing tab / window or navigating away)
    const handlePageExit = () => {
      saveSessionUser(null);
    };
    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      clearTimeout(idleTimeout);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [appState?.currentUser, handleLogout]);

  if (!appState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-sans">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-base font-black">جاري تحميل المنظومة التموينية وقاعدة البيانات...</h2>
          <p className="text-xs text-amber-200">مديرية التموين بالغربية - إدارة تموين مركز المحلة الكبرى</p>
        </div>
      </div>
    );
  }

  // Helper to maintain single definitive database instance without additive merging on login
  const performGmailDriveAdditiveMerge = (baseState: AppState, user: AppUser): AppState => {
    return {
      ...baseState,
      currentUser: user,
      systemConfig: {
        ...baseState.systemConfig,
        logoBase64: DEFAULT_OFFICIAL_LOGO,
      },
    };
  };

  // If not logged in, show Animated Login with Branch Dropdown Selector
  if (!appState.currentUser) {
    const activeBranchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const branchesList = appState.branches || getBranchesList();
    return (
      <LoginModal
        systemConfig={appState.systemConfig}
        users={appState.users}
        logoutReason={logoutReason}
        branches={branchesList}
        activeBranchId={activeBranchId}
        onSelectBranch={(branchId) => {
          handleSwitchBranch(branchId, branchesList);
        }}
        onLoginSuccess={(user) => {
          setLogoutReason(null);
          const scopedUser: AppUser = { ...user, branchId: activeBranchId };
          saveSessionUser(scopedUser);
          setAppState((prev) => {
            if (!prev) return prev;
            const branchId = prev.activeBranchId || activeBranchId;
            const adminTitle =
              prev.systemConfig?.administrationTitle || appState.systemConfig.administrationTitle;
            const mergedState = performGmailDriveAdditiveMerge(prev, scopedUser);
            const updatedUsers = sanitizeBranchUsers(
              mergedState.users.map((u) => (u.id === scopedUser.id ? { ...u, ...scopedUser } : u)),
              branchId,
              adminTitle
            );
            const finalState: AppState = {
              ...mergedState,
              users: updatedUsers,
              currentUser: scopedUser,
            };
            latestAppStateRef.current = finalState;
            return finalState;
          });
          setSaveToast({
            id: Date.now(),
            message: `تم تسجيل الدخول إلى (${appState.systemConfig.administrationTitle}) بنجاح`,
            timestamp: getArabicTimestamp(),
          });
          setIsDailyBriefingModalOpen(true);
        }}
        onRegisterUser={async (newUser) => {
          const scopedNewUser: AppUser = {
            ...newUser,
            branchId: activeBranchId,
            department: newUser.department || appState.systemConfig.administrationTitle,
          };
          const updatedUsers = sanitizeBranchUsers(
            [...appState.users, scopedNewUser],
            activeBranchId,
            appState.systemConfig.administrationTitle
          );
          const baseWithUser: AppState = {
            ...appState,
            users: updatedUsers,
          };
          const mergedState = performGmailDriveAdditiveMerge(baseWithUser, scopedNewUser);
          const res = await commitRowMutation({
            nextState: { ...mergedState, currentUser: null },
            table: 'app_users',
            branchId: activeBranchId,
            toastMessage: `تم تسجيل وحفظ المستخدم الجديد (${scopedNewUser.username}) في قاعدة البيانات بنجاح`,
            executeDb: () =>
              saveRowToDb({
                table: 'app_users',
                branchId: activeBranchId,
                row: scopedNewUser,
                operation: 'INSERT',
              }),
          });
          if (res.success || res.queuedOffline) {
            saveBranchAuthVault(activeBranchId, {
              branchName: appState.systemConfig.administrationTitle,
              users: updatedUsers,
              rolePermissions: appState.systemConfig.rolePermissions,
              roleLabels: appState.systemConfig.roleLabels,
              customRoles: appState.systemConfig.customRoles,
            });
          }
          return res;
        }}
      />
    );
  }

  // Inbox Messages Helpers
  const inboxMessages = appState.inboxMessages || INITIAL_INBOX_MESSAGES;
  const unreadInboxCount = inboxMessages.filter(
    (m) => !m.readBy || !m.readBy.includes(appState.currentUser?.username || 'admin')
  ).length;

  const handleSendInboxMessage = (msgInput: Omit<InboxChatMessage, 'id' | 'timestamp' | 'readBy'>) => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const newMsg: InboxChatMessage = {
      ...msgInput,
      id: `msg-${Date.now()}`,
      timestamp: new Date().toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      readBy: [appState.currentUser?.username || 'admin'],
    };
    const updatedMessages = [...inboxMessages, newMsg];
    commitRowMutation({
      nextState: { ...appState, inboxMessages: updatedMessages },
      table: 'inbox_messages',
      branchId,
      toastMessage: 'تم إرسال الرسالة / التعليمات الإدارية وحفظها ومزامنتها لجميع الأجهزة بنجاح',
      executeDb: () =>
        saveRowToDb({
          table: 'inbox_messages',
          branchId,
          row: newMsg,
          operation: 'INSERT',
        }),
    });
  };

  const handleDeleteInboxMessage = (msgId: string) => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const updatedMessages = inboxMessages.filter((m) => m.id !== msgId);
    commitRowMutation({
      nextState: { ...appState, inboxMessages: updatedMessages },
      table: 'inbox_messages',
      branchId,
      toastMessage: 'تم حذف الرسالة من قاعدة البيانات ومزامنة صندوق الوارد',
      executeDb: () =>
        deleteRowFromDb({
          table: 'inbox_messages',
          id: msgId,
          branchId,
        }),
    });
  };

  const handleMarkAllInboxRead = () => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const username = appState.currentUser?.username || 'admin';
    const unreadMsgs = inboxMessages.filter((m) => !m.readBy || !m.readBy.includes(username));
    if (unreadMsgs.length === 0) return;
    const updatedMessages = inboxMessages.map((m) => ({
      ...m,
      readBy: Array.from(new Set([...(m.readBy || []), username])),
    }));
    const nextState = { ...appState, inboxMessages: updatedMessages };
    latestAppStateRef.current = nextState;
    setAppState(nextState);
    persistFullState(nextState, { skipCloudSync: true }).catch(() => {});
    Promise.all(
      unreadMsgs.map((m) =>
        saveRowToDb({
          table: 'inbox_messages',
          branchId,
          row: { ...m, readBy: Array.from(new Set([...(m.readBy || []), username])) },
          operation: 'UPDATE',
        })
      )
    ).catch(() => {});
  };

  // Handlers for Bakery
  const handleSaveBakery = (bakery: Bakery) => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const existingIndex = appState.bakeries.findIndex((b) => b.id === bakery.id);
    const existingBakery = existingIndex >= 0 ? appState.bakeries[existingIndex] : undefined;
    const expectedVersion =
      typeof (existingBakery as any)?.version === 'number'
        ? (existingBakery as any).version
        : undefined;

    let updated: Bakery[];
    if (existingIndex >= 0) {
      updated = [...appState.bakeries];
      updated[existingIndex] = { ...existingBakery, ...bakery };
    } else {
      updated = [bakery, ...appState.bakeries];
    }
    const unifiedUpdated = syncLocalUnitDemographicsAcrossBakeries(
      updated,
      bakery.village,
      bakery.localUnit,
      {
        villagePopulation: bakery.villagePopulation,
        beneficiaries2023: bakery.beneficiaries2023,
        beneficiaries2024: bakery.beneficiaries2024,
        beneficiaries2025: bakery.beneficiaries2025,
      }
    );
    const synced = synchronizeBakeryAndDebts(unifiedUpdated, appState.debts);
    const savedBakery = synced.bakeries.find((b) => b.id === bakery.id) || bakery;

    // Identify sibling bakeries in the same local unit whose demographics were unified
    const siblingUpdates = synced.bakeries.filter((b) => {
      if (b.id === bakery.id) return false;
      const prev = appState.bakeries.find((p) => p.id === b.id);
      return (
        prev &&
        (prev.villagePopulation !== b.villagePopulation ||
          prev.beneficiaries2023 !== b.beneficiaries2023 ||
          prev.beneficiaries2024 !== b.beneficiaries2024 ||
          prev.beneficiaries2025 !== b.beneficiaries2025 ||
          prev.perCapitaAverage !== b.perCapitaAverage)
      );
    });

    return commitRowMutation({
      nextState: { ...appState, bakeries: synced.bakeries, debts: synced.debts },
      table: 'bakeries',
      branchId,
      toastMessage:
        existingIndex >= 0
          ? `تم حفظ وتعديل بيانات مخبز (${bakery.bakeryOwnerName}) وتوحيد إحصائيات الوحدة المحلية ومزامنة السجلات بنجاح`
          : `تم إضافة وحفظ بيانات مخبز (${bakery.bakeryOwnerName}) وتوحيد إحصائيات الوحدة المحلية بنجاح`,
      executeDb: async () => {
        const primaryRes = await saveRowToDb({
          table: 'bakeries',
          branchId,
          row: savedBakery,
          operation: existingIndex >= 0 ? 'UPDATE' : 'INSERT',
          expectedVersion,
        });
        if (!primaryRes.success) return primaryRes;
        const returnedSiblings: Bakery[] = [];
        if (siblingUpdates.length > 0) {
          for (const sib of siblingUpdates) {
            const sibRes = await saveRowToDb({
              table: 'bakeries',
              branchId,
              row: sib,
              operation: 'UPDATE',
            }).catch(() => null);
            if (sibRes?.success && sibRes.row) {
              returnedSiblings.push(sibRes.row);
            }
          }
        }
        return {
          ...primaryRes,
          row: { ...primaryRes.row, __returnedSiblings: returnedSiblings },
        };
      },
      patchReturnedRow: (current, savedRow) => {
        const { __returnedSiblings, ...cleanSavedRow } = savedRow || {};
        const sibMap = new Map<string, any>(
          Array.isArray(__returnedSiblings) ? __returnedSiblings.map((s: any) => [String(s.id), s]) : []
        );
        return {
          ...current,
          bakeries: current.bakeries.map((b) => {
            if (b.id === cleanSavedRow.id) return { ...b, ...cleanSavedRow };
            if (sibMap.has(String(b.id))) return { ...b, ...sibMap.get(String(b.id)) };
            return b;
          }),
        };
      },
    });
  };

  const handleRecalculateAllDatabaseEquations = () => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    // 1. Save a safety snapshot before global recalculation
    try {
      localStorage.setItem(
        'TAMWEEN_PRE_RECALC_SAFETY_BACKUP',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          bakeries: appState.bakeries,
          debts: appState.debts,
        })
      );
    } catch {}

    // 2. Execute full database recalculation
    const result = recalculateAllDatabaseEquations(appState.bakeries, appState.debts);
    const nextState = {
      ...appState,
      bakeries: result.bakeries,
      debts: result.debts,
    };
    commitRowMutation({
      nextState,
      branchId,
      toastMessage: `تم تنفيذ احتساب المعادلات لجميع سجلات قاعدة البيانات (${result.bakeries.length} مخبز و ${result.debts.length} مديونية) ومزامنتها بنجاح!`,
      executeDb: () =>
        batchSyncToDb({
          branchId,
          data: { bakeries: result.bakeries, debts: result.debts },
          pruneRemoved: false,
          sqlOperation: 'UPDATE',
          affectedTable: 'bakeries',
        }),
    });
    setIsAuditModalOpen(true);
  };

  const handleDeleteBakery = (bakeryId: string, ownerName: string) => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    setPendingConfirm({
      title: 'تأكيد حذف المخبز نهائياً',
      message: `هل أنت متأكد من حذف المخبز الخاص بـ "${ownerName}" نهائياً من المنظومة؟`,
      confirmLabel: 'حذف المخبز نهائياً',
      variant: 'danger',
      onConfirm: () => {
        const updatedBakeries = appState.bakeries.filter((b) => String(b.id) !== String(bakeryId));
        const updatedDebts = appState.debts.filter((d) => String(d.bakeryId) !== String(bakeryId));
        commitRowMutation({
          nextState: { ...appState, bakeries: updatedBakeries, debts: updatedDebts },
          table: 'bakeries',
          branchId,
          toastMessage: `تم حذف مخبز (${ownerName}) وتحديث قاعدة البيانات وجميع الأجهزة بنجاح`,
          executeDb: () =>
            deleteRowFromDb({
              table: 'bakeries',
              id: bakeryId,
              branchId,
            }),
        });
      },
    });
  };

  // Handlers for Debts
  const handleSaveDebt = (debt: DebtRecord) => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const existingIndex = appState.debts.findIndex((d) => String(d.id) === String(debt.id));
    const existingDebt = existingIndex >= 0 ? appState.debts[existingIndex] : undefined;
    const expectedVersion =
      typeof (existingDebt as any)?.version === 'number'
        ? (existingDebt as any).version
        : undefined;

    let updated: DebtRecord[];
    if (existingIndex >= 0) {
      updated = [...appState.debts];
      updated[existingIndex] = { ...existingDebt, ...debt };
    } else {
      updated = [debt, ...appState.debts];
    }

    const synced = synchronizeBakeryAndDebts(appState.bakeries, updated);
    const savedDebt = synced.debts.find((d) => String(d.id) === String(debt.id)) || debt;
    const alertThreshold =
      appState.systemConfig?.debtAlertThreshold ?? DEFAULT_DEBT_ALERT_THRESHOLD;
    const exceedsAlertThreshold = shouldTriggerDebtAlert(savedDebt.netRemainingDebt, alertThreshold);

    if (exceedsAlertThreshold) {
      addHighDebtNotification(
        savedDebt.bakeryId,
        savedDebt.bakeryOwnerName,
        savedDebt.machineNumber,
        savedDebt.village,
        savedDebt.netRemainingDebt,
        existingIndex >= 0 ? 'EDIT_DEBT' : 'ADD_DEBT',
        alertThreshold
      );
    }

    const alertSuffix = exceedsAlertThreshold
      ? ` — ⚠️ تنبيه: تجاوزت المديونية (${savedDebt.netRemainingDebt.toLocaleString('en-US')} ج.م) حد التنبيه (${alertThreshold.toLocaleString('en-US')} ج.م) وتم إضافته لسجل التنبيهات!`
      : '';

    return commitRowMutation({
      nextState: { ...appState, bakeries: synced.bakeries, debts: synced.debts },
      table: 'debts',
      branchId,
      toastMessage:
        (existingIndex >= 0
          ? 'تم تعديل وحفظ قيد المديونية وإعادة احتساب الأرصدة ومزامنتها بنجاح'
          : 'تم إضافة وتسجيل قيد المديونية وإعادة احتساب الأرصدة ومزامنتها بنجاح') + alertSuffix,
      executeDb: () =>
        saveRowToDb({
          table: 'debts',
          branchId,
          row: savedDebt,
          operation: existingIndex >= 0 ? 'UPDATE' : 'INSERT',
          expectedVersion,
        }),
      patchReturnedRow: (current, returnedDebt) => {
        const resynced = synchronizeBakeryAndDebts(
          current.bakeries,
          current.debts.map((d) => (String(d.id) === String(returnedDebt.id) ? { ...d, ...returnedDebt } : d))
        );
        return { ...current, bakeries: resynced.bakeries, debts: resynced.debts };
      },
    });
  };

  const handleDeleteDebt = (debtId: string) => {
    const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const updated = appState.debts.filter((d) => String(d.id) !== String(debtId));
    const synced = synchronizeBakeryAndDebts(appState.bakeries, updated);
    commitRowMutation({
      nextState: { ...appState, bakeries: synced.bakeries, debts: synced.debts },
      table: 'debts',
      branchId,
      toastMessage: 'تم حذف قيد المديونية وتحديث الأرصدة وجميع الأجهزة بنجاح',
      executeDb: () =>
        deleteRowFromDb({
          table: 'debts',
          id: debtId,
          branchId,
        }),
    });
  };

  // Quick 1-click partition save
  const handleQuickPartitionSave = async () => {
    const payload = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      governorate: appState.systemConfig.governorateTitle,
      directorate: appState.systemConfig.directorateTitle,
      administration: appState.systemConfig.administrationTitle,
      data: {
        bakeries: appState.bakeries,
        debts: appState.debts,
        villages: appState.villages,
        issuingEntities: appState.issuingEntities,
        violationTypes: appState.violationTypes,
        activityStatuses: appState.activityStatuses,
        columnTitles: appState.columnTitles,
        systemConfig: appState.systemConfig,
        users: appState.users,
      },
    };
    const res = await saveBackupToPartition(payload);
    setSaveToast({
      id: Date.now(),
      message: res.message,
      timestamp: getArabicTimestamp(),
    });
  };

  // Main Bakery table CSV export
  const handleExportBakeryCSV = () => {
    const ct = appState.columnTitles;
    const headers = [
      ct.index,
      ct.bakeryOwnerName,
      ct.machineNumber,
      ct.village,
      ct.localUnit,
      ct.responsibleManager || 'المدير المسئول',
      ct.remainingDebt,
      ct.insuranceValue,
      ct.insuranceQuota,
      ct.actualQuota,
      ct.loavesCount,
      ct.perCapitaAverage,
      ct.villagePopulation,
      ct.beneficiaries2023,
      ct.beneficiaries2024,
      ct.beneficiaries2025,
      ct.avg2023,
      ct.avg2024,
      ct.avg2025,
      ct.avgDiff,
      ct.activityStatus,
      ct.bakeryCategory,
      ct.breadType,
      ct.flourBagPrice || 'سعر الشيكارة',
      ct.breadTypeCount,
      ct.lineType,
      ct.fuelType,
      ct.phone,
      ct.nationalId,
      ct.commercialRegNumber || 'رقم السجل التجاري',
      ct.commercialRegDate,
      ct.bakeryLicenseNumber || 'رقم الرخصة',
      ct.bakeryLicenseDate,
      ct.leaseContractType || 'عقد الإيجار (إيجار/تمليك)',
      ct.leaseAgreementDate,
      ct.taxCardNumber || 'رقم البطاقة الضريبية',
      ct.taxCardDate,
    ];

    const rows = filteredBakeries.map((b, idx) => [
      idx + 1,
      `"${b.bakeryOwnerName.replace(/"/g, '""')}"`,
      `"${b.machineNumber}"`,
      `"${b.village}"`,
      `"${b.localUnit}"`,
      `"${(b.responsibleManager || '').replace(/"/g, '""')}"`,
      bakeryRemainingDebtsMap[b.id] || 0,
      b.insuranceValue,
      b.insuranceQuota,
      b.actualQuota,
      b.loavesCount,
      Number(b.perCapitaAverage || 0).toFixed(2),
      b.villagePopulation,
      b.beneficiaries2023,
      b.beneficiaries2024,
      b.beneficiaries2025,
      b.avg2023,
      b.avg2024,
      b.avg2025,
      b.avgDiff,
      `"${b.activityStatus}"`,
      `"${b.bakeryCategory || 'مخبز بلدي مدعم'}"`,
      `"${b.breadType}"`,
      b.flourBagPrice ?? 950,
      b.breadTypeCount,
      `"${b.lineType}"`,
      `"${b.fuelType}"`,
      `"${b.phone}"`,
      `"${b.nationalId}"`,
      `"${(b.commercialRegNumber || '').replace(/"/g, '""')}"`,
      `"${b.commercialRegDate}"`,
      `"${(b.bakeryLicenseNumber || '').replace(/"/g, '""')}"`,
      `"${b.bakeryLicenseDate}"`,
      `"${(b.leaseContractType || 'إيجار').replace(/"/g, '""')}"`,
      `"${b.leaseAgreementDate}"`,
      `"${(b.taxCardNumber || '').replace(/"/g, '""')}"`,
      `"${b.taxCardDate}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `قاعدة_بيانات_مخابز_مركز_المحلة_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const ct = appState.columnTitles;

  // Guarded action runner to prevent duplicate executions on rapid clicks
  const runGuardedAction = (fn: () => void) => {
    if (isActionLocked) return;
    setIsActionLocked(true);
    try {
      fn();
    } finally {
      setTimeout(() => setIsActionLocked(false), 450);
    }
  };

  // Comprehensive Sidebar Navigation Handler (Routes all 4 ERP Sections without page reload)
  const handleSelectSidebarNav = (navId: SidebarNavId, groupTitle: string, itemLabel: string) => {
    setActiveSidebarNavId(navId);
    setBreadcrumbGroup(groupTitle);
    setBreadcrumbItem(itemLabel);

    switch (navId) {
      // 1. قسم إدارة المخابز
      case 'user-guide':
        setActiveTab('user-guide');
        break;
      case 'bakeries-all':
        setActiveTab('bakeries');
        setColumnViewMode('ALL');
        break;
      case 'data-add-bakery':
        if (appState.currentUser?.role !== 'viewer') {
          setBakeryToEdit(null);
          setIsBakeryModalOpen(true);
        }
        break;
      case 'search-by-name':
        setActiveTab('bakeries');
        setSearchFocusMode('NAME');
        setShowAdvancedSearchPanel(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        break;
      case 'search-by-machine':
        setActiveTab('bakeries');
        setSearchFocusMode('MACHINE');
        setShowAdvancedSearchPanel(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        break;
      case 'search-by-area':
      case 'search-by-bread':
      case 'search-advanced':
        setActiveTab('bakeries');
        setSearchFocusMode('ALL');
        setShowAdvancedSearchPanel(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        break;
      case 'calc-equations-view':
      case 'calc-insurance-quota':
      case 'calc-loaves':
      case 'calc-avg-2023':
      case 'calc-avg-2024':
      case 'calc-avg-2025':
      case 'calc-per-bakery':
      case 'calc-cum-diff':
        setActiveTab('bakeries');
        setColumnViewMode('EQUATIONS');
        break;
      case 'calc-recalculate-all':
        handleRecalculateAllDatabaseEquations();
        break;
      case 'report-per-capita':
        setReportModalInitialTab('annual-averages');
        setIsReportModalOpen(true);
        break;
      case 'settings-alerts':
        setIsAlertsModalOpen(true);
        break;

      // 2. قسم التعديلات
      case 'data-edit-bakery':
        if (selectedBakeryRowId) {
          const found = appState.bakeries.find((b) => b.id === selectedBakeryRowId);
          if (found) {
            setBakeryToEdit(found);
            setIsBakeryModalOpen(true);
            break;
          }
        }
        if (appState.bakeries.length > 0 && appState.currentUser?.role !== 'viewer') {
          setBakeryToEdit(appState.bakeries[0]);
          setIsBakeryModalOpen(true);
        } else {
          setMasterEditorInitialCategory('ALL');
          setIsMasterEditorModalOpen(true);
        }
        break;
      case 'data-edit-master':
        setMasterEditorInitialCategory('ALL');
        setIsMasterEditorModalOpen(true);
        break;
      case 'settings-view-mode':
        setIsDisplaySettingsModalOpen(true);
        break;
      case 'settings-display':
        setIsColumnModalOpen(true);
        break;

      // 3. قسم سجل المديونيات
      case 'debts-records':
        setActiveTab('debts');
        setDebtFilterBakeryId(undefined);
        setShowDebtsAlertsKeyModal(false);
        break;
      case 'debts-add-schedule':
        setActiveTab('debts');
        setDebtFilterBakeryId(undefined);
        setShowDebtsAlertsKeyModal(false);
        setOpenDebtScheduleSignal((prev) => prev + 1);
        break;
      case 'debts-alerts-key':
        setActiveTab('debts');
        setShowDebtsAlertsKeyModal(true);
        break;
      case 'debts-installments':
        setSelectedInstallmentBakeryId(undefined);
        setIsWeeklyInstallmentsModalOpen(true);
        break;

      // 4. قسم الفروع مفتوح لاختيار الفرع على الواجهة (والإضافة/التعديل/الحذف داخل النافذة محمي بالباسورد)
      case 'branches-manage':
        setIsBranchesModalOpen(true);
        break;
      case 'ops-save-data':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ — حفظ البيانات', () => {
          triggerSave(appState, 'تم حفظ وتثبيت كافة التغييرات في قاعدة البيانات بنجاح');
        });
        break;
      case 'data-import':
      case 'data-backup':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ الاحتياطي واستيراد البيانات', () => {
          setIsBackupModalOpen(true);
        });
        break;
      case 'data-export':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ — تصدير قاعدة البيانات', () => {
          handleExportBakeryCSV();
        });
        break;
      case 'workspace-calendar':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ — تقويم Google Calendar', () => {
          setGoogleWorkspaceInitialTab('calendar');
          setIsGoogleWorkspaceModalOpen(true);
        });
        break;
      case 'workspace-tasks':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ — مهام Google Tasks', () => {
          setGoogleWorkspaceInitialTab('tasks');
          setIsGoogleWorkspaceModalOpen(true);
        });
        break;
      case 'workspace-forms':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ — نماذج Google Forms', () => {
          setGoogleWorkspaceInitialTab('forms');
          setIsGoogleWorkspaceModalOpen(true);
        });
        break;

      // Additional & Dashboard routes
      case 'realtime-diagnostics':
        requireVaultAccess('backup', 'قسم الحفظ والنسخ — لوحة Realtime والحماية', () => {
          setActiveTab('realtime-diagnostics');
        });
        break;
      case 'dashboard-charts':
        setActiveTab('charts');
        break;
      case 'alerts-drawer-log':
        setIsAdminDrawerOpen(true);
        break;
      case 'dashboard-home':
      case 'dashboard-kpis':
      case 'dashboard-updates':
        setActiveTab('dashboard');
        break;
      case 'reports-center':
      case 'report-detailed':
        setActiveTab('reports');
        setActiveReportId('bak-all');
        break;
      case 'report-summary':
        setActiveTab('reports');
        setActiveReportId('comp-totals');
        break;
      case 'report-years-comparison':
        setActiveTab('reports');
        setActiveReportId('comp-3years');
        break;
      case 'report-insurance-quotas':
        setActiveTab('reports');
        setActiveReportId('ins-quotas');
        break;
      case 'report-differences':
        setActiveTab('reports');
        setActiveReportId('avg-cumdiff');
        break;
      case 'data-integrity':
        setIsAuditModalOpen(true);
        break;
      case 'settings-system':
        setIsHeaderModalOpen(true);
        break;
      case 'settings-users':
        setIsAdvancedPermissionsModalOpen(true);
        break;
      case 'settings-logs':
        setIsInboxModalOpen(true);
        break;
      case 'settings-daily-tasks':
        setIsDailyTasksModalOpen(true);
        break;
      case 'settings-logout':
        void handleSafeSaveAndLogout();
        break;
    }
  };

  // Mandatory 4 Core Identifying Columns (اسم المخبز، رقم الماكينة، اسم القرية، اسم الوحدة المحلية) are ALWAYS visible
  const showBasicCols = true;
  const showDebtCol = columnViewMode === 'ALL' || columnViewMode === 'BASIC' || columnViewMode === 'INSURANCE';
  const showQuotaCols =
    columnViewMode === 'ALL' ||
    columnViewMode === 'QUOTAS' ||
    columnViewMode === 'INSURANCE' ||
    columnViewMode === 'EQUATIONS';
  const showDemographicsCols =
    columnViewMode === 'ALL' || columnViewMode === 'BENEFICIARIES' || columnViewMode === 'EQUATIONS';
  const showOperationsCols =
    columnViewMode === 'ALL' || columnViewMode === 'BREAD' || columnViewMode === 'QUOTAS' || columnViewMode === 'INSURANCE';
  const showContactLicenseCols = columnViewMode === 'ALL' || columnViewMode === 'BASIC';

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-50 inline-block mr-1" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-sky-300 inline-block mr-1" />
    ) : (
      <ArrowDown className="w-3 h-3 text-sky-300 inline-block mr-1" />
    );
  };

  const totalNotificationsCount =
    alertsList.length + unreadInboxCount + highDebtNotifications.filter((n) => !n.isRead).length;

  const cleanBranchesList = deduplicateSupplyBranches(appState.branches || getBranchesList());
  const configuredVaultPasscode = getStoredVaultPasscode(appState.systemConfig?.vaultPasscode);
  const configuredVaultUsername = getStoredVaultUsername(appState.systemConfig?.vaultUsername);
  const configuredBranchCredentialsMap = getBranchVaultCredentialsMap(
    cleanBranchesList,
    appState.systemConfig?.branchVaultCredentials,
    configuredVaultUsername,
    configuredVaultPasscode
  );

  const requireVaultAccess = (
    section: 'backup' | 'branches' | 'both',
    label: string,
    action: () => void
  ) => {
    if (isVaultUnlocked) {
      action();
      return;
    }
    setVaultGateModal({
      isOpen: true,
      section,
      label,
      initialMode: 'unlock',
      initialTargetBranchId: appState.activeBranchId || DEFAULT_BRANCH_ID,
      onAfterUnlock: action,
    });
  };

  const handleUpdateVaultPasscode = async (
    newPasscode: string,
    newUsername?: string,
    targetBranchId: string | 'ALL' = 'ALL'
  ) => {
    const normalizedPass = setStoredVaultPasscode(newPasscode, newUsername);
    const normalizedUser = getStoredVaultUsername(newUsername || configuredVaultUsername);
    const updatedCredentialsMap = updateBranchVaultCredentialsMap({
      targetBranchId,
      newUsername: normalizedUser,
      newPassword: normalizedPass,
      branches: cleanBranchesList,
      existingMap: configuredBranchCredentialsMap,
      fallbackUsername: configuredVaultUsername,
      fallbackPasscode: configuredVaultPasscode,
    });

    const activeBranchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
    const activeBranchCred = updatedCredentialsMap[activeBranchId];
    const nextConfig: SystemConfig = {
      ...appState.systemConfig,
      vaultUsername: activeBranchCred?.username || normalizedUser,
      vaultPasscode: activeBranchCred?.password || normalizedPass,
      branchVaultCredentials: updatedCredentialsMap,
    };
    const updatedState: AppState = {
      ...appState,
      systemConfig: nextConfig,
    };

    const targetLabel =
      targetBranchId === 'ALL'
        ? `جميع الفروع التموينية (${cleanBranchesList.length} فروع)`
        : cleanBranchesList.find((b) => b.id === targetBranchId)?.name || targetBranchId;

    await commitRowMutation({
      nextState: updatedState,
      table: 'system_config',
      branchId: activeBranchId,
      toastMessage: `تم تحديث وحفظ الـ Username والـ Password لقسم الحفظ والنسخ على (${targetLabel}) في قاعدة البيانات بنجاح`,
      executeDb: async () => {
        const primaryRes = await saveRowToDb({
          table: 'system_config',
          branchId: activeBranchId,
          row: {
            branchId: activeBranchId,
            systemConfig: nextConfig,
            columnTitles: appState.columnTitles,
            activityStatuses: appState.activityStatuses,
          },
          operation: 'UPDATE',
        });
        if (targetBranchId === 'ALL') {
          for (const br of cleanBranchesList) {
            if (br.id === activeBranchId) continue;
            await saveRowToDb({
              table: 'system_config',
              branchId: br.id,
              row: {
                branchId: br.id,
                systemConfig: {
                  ...nextConfig,
                  administrationTitle: br.name,
                  vaultUsername: normalizedUser,
                  vaultPasscode: normalizedPass,
                  branchVaultCredentials: updatedCredentialsMap,
                },
                columnTitles: appState.columnTitles,
                activityStatuses: appState.activityStatuses,
              },
              operation: 'UPDATE',
            }).catch(() => {});
          }
        } else if (targetBranchId !== activeBranchId) {
          const targetBrObj = cleanBranchesList.find((b) => b.id === targetBranchId);
          await saveRowToDb({
            table: 'system_config',
            branchId: targetBranchId,
            row: {
              branchId: targetBranchId,
              systemConfig: {
                ...nextConfig,
                administrationTitle: targetBrObj?.name || nextConfig.administrationTitle,
                vaultUsername: normalizedUser,
                vaultPasscode: normalizedPass,
                branchVaultCredentials: updatedCredentialsMap,
              },
              columnTitles: appState.columnTitles,
              activityStatuses: appState.activityStatuses,
            },
            operation: 'UPDATE',
          }).catch(() => {});
        }
        return primaryRes;
      },
    });
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col bg-[#FAF8F5] text-[#0A1628] font-sans selection:bg-[#0D9488] selection:text-white"
    >
      {/* 1. Executive Midnight Navy, Royal Teal & Champagne Gold Top Header */}
      <header className="bg-[#0A1628] border-b border-[#D4AF37]/35 text-white shadow-xl sticky top-0 z-30 no-print">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#D4AF37] via-[#0D9488] to-[#D4AF37]" />
        <div className="max-w-[1920px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Right Zone: Emblem, Directorate & Administration Name, System Name */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsHeaderModalOpen(true)}
              title="تخصيص بيانات الترويسة والشعار"
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D4AF37] via-amber-400 to-[#0D9488] p-0.5 shadow-lg shadow-[#D4AF37]/20 flex items-center justify-center shrink-0 cursor-pointer transition hover:scale-105"
            >
              <div className="w-full h-full rounded-[14px] bg-white p-1 flex items-center justify-center">
                <img
                  src={appState.systemConfig.logoBase64}
                  alt="شعار المنظومة"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black text-[#D4AF37] flex-wrap">
                <span>{appState.systemConfig.directorateTitle}</span>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="text-[#5EEAD4]">{appState.systemConfig.administrationTitle}</span>
                {/* Smart Connection Status Indicator & Retry Button */}
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span
                    role="status"
                    aria-live="polite"
                    data-testid="cloud-connection-indicator"
                    data-connection-status={connectionSnapshot.status}
                    onClick={() =>
                      handleSelectSidebarNav(
                        'realtime-diagnostics',
                        'مرصد التشخيص المتقدم',
                        'صفحة تشخيص Supabase Realtime و WebSockets'
                      )
                    }
                    title={`${connectionSnapshot.detail} — اضغط لفتح لوحة التشخيص المخفية (Ctrl+Shift+D)`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-black transition-colors cursor-pointer ${
                      connectionSnapshot.status === 'connected'
                        ? 'bg-[#10B981]/15 text-emerald-300 border-[#10B981]/40 hover:bg-[#10B981]/25'
                        : connectionSnapshot.status === 'syncing'
                        ? 'bg-[#D4AF37]/15 text-amber-200 border-[#D4AF37]/40 hover:bg-[#D4AF37]/25'
                        : 'bg-[#F43F5E]/20 text-rose-200 border-[#F43F5E]/40 hover:bg-[#F43F5E]/30'
                    }`}
                  >
                    {connectionSnapshot.status === 'syncing' ? (
                      <RotateCw className="w-3 h-3 text-[#D4AF37] animate-spin" />
                    ) : (
                      <span className="relative flex h-2 w-2">
                        {connectionSnapshot.status === 'connected' && (
                          <span className="beacon-dot-live animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            connectionSnapshot.status === 'connected' ? 'bg-[#10B981]' : 'bg-[#F43F5E]'
                          }`}
                        />
                      </span>
                    )}
                    <span>{connectionSnapshot.label}</span>
                    {connectionSnapshot.pendingQueueCount > 0 && (
                      <span
                        title="عمليات محفوظة في قائمة الانتظار للمزامنة فور عودة الاتصال"
                        className="px-1.5 py-0.2 bg-amber-600 text-white rounded text-[10px] font-black"
                      >
                        قائمة الانتظار: {connectionSnapshot.pendingQueueCount}
                      </span>
                    )}
                    {connectionSnapshot.lastSyncAt && connectionSnapshot.status === 'connected' && (
                      <span className="hidden xl:inline text-[10px] text-emerald-300 font-semibold">
                        ({connectionSnapshot.lastSyncAt})
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="open-realtime-diagnostics-btn"
                    onClick={() =>
                      handleSelectSidebarNav(
                        'realtime-diagnostics',
                        'مرصد التشخيص المتقدم',
                        'صفحة تشخيص Supabase Realtime و WebSockets'
                      )
                    }
                    title="فتح الصفحة التشخيصية المخفية لـ Supabase Realtime و WebSockets (Ctrl+Shift+D)"
                    className={`inline-flex items-center justify-center p-1 rounded-lg border transition cursor-pointer ${
                      activeTab === 'realtime-diagnostics'
                        ? 'bg-[#0D9488] text-white border-[#D4AF37] shadow-xs'
                        : 'bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border-white/10'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                  </button>
                  {(connectionSnapshot.status === 'error' || connectionSnapshot.status === 'offline') && (
                    <button
                      type="button"
                      data-testid="retry-connection-btn"
                      onClick={handleRetryConnection}
                      disabled={isRetryingConnection}
                      title={connectionSnapshot.detail || 'إعادة محاولة الاتصال بخادم Supabase'}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#F43F5E] hover:bg-rose-600 disabled:opacity-60 text-white text-[11px] font-black shadow-2xs transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRetryingConnection ? 'animate-spin' : ''}`} />
                      <span>{isRetryingConnection ? 'جاري المحاولة...' : 'إعادة محاولة الاتصال'}</span>
                    </button>
                  )}
                </div>
              </div>
              <h1 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                منظومة إدارة بيانات المخابز والتموين والمديونيات
              </h1>
            </div>
          </div>

          {/* Left Zone: Date & Time, Open Branch Switcher, Notifications, User, Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date & Time + Autosave */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-200 bg-[#0F1E36] px-3 py-1.5 rounded-xl border border-white/10">
              <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{currentDateTimeStr}</span>
              {saveTimestamp && (
                <>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-[#10B981] font-bold">حُفظ {saveTimestamp}</span>
                </>
              )}
            </div>

            {/* High-Debt Alerts Log Drawer Button in Header */}
            <button
              type="button"
              data-testid="header-alerts-drawer-btn"
              onClick={() => setIsAdminDrawerOpen(true)}
              className={`relative px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                highDebtNotifications.filter((n) => !n.isRead).length > 0
                  ? 'bg-[#F43F5E]/20 hover:bg-[#F43F5E]/30 text-rose-200 border-[#F43F5E]/50'
                  : 'bg-[#0F1E36] hover:bg-white/10 text-slate-200 border-white/10'
              }`}
              title="فتح سجل تنبيهات المديونيات المتجاوزة للحد وضبط قيمة التنبيه"
            >
              <AlertTriangle className="w-4 h-4 text-[#F43F5E]" />
              <span>سجل التنبيهات</span>
              {highDebtNotifications.filter((n) => !n.isRead).length > 0 && (
                <span
                  data-testid="alerts-unread-badge"
                  className="px-2 py-0.5 bg-[#F43F5E] text-white rounded-full text-[10px] font-mono font-black tabular-nums badge-animated-coral animate-pulse"
                >
                  {highDebtNotifications.filter((n) => !n.isRead).length}
                </span>
              )}
            </button>

            {/* Daily Briefing Notifications Button */}
            <button
              type="button"
              onClick={() => setIsDailyBriefingModalOpen(true)}
              className="relative px-3 py-1.5 bg-[#0F1E36] hover:bg-white/10 text-slate-200 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="الإشعارات والتنبيهات اليومية للمديونيات والتراخيص"
            >
              <Bell className="w-4 h-4 text-[#D4AF37]" />
              <span>الإشعارات</span>
              {totalNotificationsCount > 0 && (
                <span className="px-2 py-0.5 bg-[#F43F5E] text-white rounded-full text-[10px] font-mono font-black tabular-nums badge-animated-coral animate-pulse">
                  {totalNotificationsCount}
                </span>
              )}
            </button>

            {/* Current User Profile */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0F1E36] border border-[#0D9488]/40 rounded-xl text-xs">
              <span className="font-extrabold text-white">{appState.currentUser.fullName}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-[#5EEAD4] font-bold">
                {getRoleNameArabic(appState.currentUser.role, appState.systemConfig)}
              </span>
            </div>

            {/* Header Direct Branch Dropdown Switcher — ALWAYS OPEN ON THE INTERFACE */}
            <div className="flex items-center gap-1.5 bg-[#0F1E36] text-[#FDE68A] px-3 py-1.5 rounded-xl border border-[#D4AF37]/50 shadow-sm">
              <Building2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <label htmlFor="header-branch-select" className="text-[11px] font-black text-[#D4AF37] hidden md:inline">
                الفرع / الإدارة:
              </label>
              <select
                id="header-branch-select"
                data-testid="header-branch-select"
                value={appState.activeBranchId || DEFAULT_BRANCH_ID}
                onChange={(e) => handleSwitchBranch(e.target.value, cleanBranchesList)}
                className="bg-[#0F1E36] text-white font-black text-xs cursor-pointer focus:outline-none pr-1"
                title="اختيار الإدارة التموينية أو الفرع مباشرة من الواجهة"
              >
                {cleanBranchesList.map((branch) => (
                  <option key={branch.id} value={branch.id} className="bg-[#0A1628] text-white font-bold">
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Branches Manager Button — Opens directly to view/switch branches; Add/Edit/Delete inside requires password */}
            <button
              type="button"
              data-testid="header-branches-manager-btn"
              onClick={() => setIsBranchesModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-l from-[#D4AF37] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#0A1628] rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-[#D4AF37]"
              title="فتح قسم الفروع للتنقل بين الإدارات (الإضافة أو التعديل أو الحذف محمي بالباسورد)"
            >
              <Building2 className="w-3.5 h-3.5 text-[#0A1628]" />
              <span>قسم الفروع ({cleanBranchesList.length})</span>
            </button>

            {/* Secret Vault Gate Button for Backup & Branch Modifications */}
            <button
              type="button"
              data-testid="header-vault-gate-btn"
              onClick={() =>
                setVaultGateModal({
                  isOpen: true,
                  section: 'both',
                  label: 'بوابة الحماية السرية لقسم الحفظ والنسخ وتعديلات الفروع',
                })
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-sm border ${
                isVaultUnlocked
                  ? 'bg-[#10B981] text-white border-emerald-400'
                  : 'bg-[#0F1E36] hover:bg-[#0D9488] text-[#FDE68A] hover:text-white border-[#D4AF37]/40'
              }`}
              title="بوابة الحماية السرية (Username & Password) لقسم الحفظ والنسخ وتعديل/إضافة الفروع"
            >
              {isVaultUnlocked ? (
                <Unlock className="w-3.5 h-3.5 text-white" />
              ) : (
                <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
              )}
              <span>{isVaultUnlocked ? 'الحماية السرية (مفتوح)' : 'الحماية السرية 🔒'}</span>
            </button>

            {/* Account Settings Button */}
            <button
              type="button"
              onClick={() => setIsUsersModalOpen(true)}
              className="px-3 py-1.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="إعدادات الحساب وإدارة المستخدمين"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>إعدادات الحساب</span>
            </button>

            {/* Open in Web Page Direct Button */}
            <button
              type="button"
              onClick={() => {
                const res = openStandaloneAppInNewTab(appState);
                setSaveToast({
                  id: Date.now(),
                  message: `تم فتح المنظومة في صفحة إنترنت مستقلة بنجاح (${res.url})`,
                  timestamp: getArabicTimestamp(),
                });
              }}
              className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="فتح المنظومة مباشرة في صفحة إنترنت مستقلة"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
              <span>فتح في صفحة إنترنت</span>
            </button>

            {/* Download EXE Direct Button */}
            <button
              type="button"
              onClick={async () => {
                const res = await downloadWindowsExeLauncher();
                setSaveToast({
                  id: Date.now(),
                  message: res.message,
                  timestamp: getArabicTimestamp(),
                });
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-2xs border border-amber-300"
              title="تنزيل البرنامج التنفيذي لنظام ويندوز (منظومة_وزارة_التموين.exe)"
            >
              <Download className="w-3.5 h-3.5 text-slate-950" />
              <span>تنزيل البرنامج EXE</span>
            </button>

            {/* Supabase & Cloud Backup Button (Protected by Vault Passcode) */}
            <button
              type="button"
              data-testid="header-backup-modal-btn"
              onClick={() =>
                requireVaultAccess('backup', 'قسم الحفظ والنسخ السحابي Supabase', () => {
                  setIsBackupModalOpen(true);
                })
              }
              className="px-3 py-1.5 bg-teal-800 hover:bg-teal-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-2xs border border-teal-500/40"
              title="قسم الحفظ والنسخ السحابي (محمي بالرقم السري)"
            >
              {isVaultUnlocked ? (
                <HardDrive className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span className="hidden sm:inline">Supabase والنسخ السحابي</span>
            </button>

            {/* Google Workspace (Calendar, Tasks, Forms) Button (Protected by Vault Passcode) */}
            <button
              type="button"
              onClick={() =>
                requireVaultAccess('backup', 'قسم الحفظ والنسخ — Google Workspace', () => {
                  setGoogleWorkspaceInitialTab('calendar');
                  setIsGoogleWorkspaceModalOpen(true);
                })
              }
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="مركز خدمات Google Workspace (محمي بالرقم السري)"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Google Workspace</span>
            </button>

            {/* Multi-Device Cloud Sync Button */}
            <button
              type="button"
              onClick={handleManualCloudPull}
              disabled={isSyncingWithCloud}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-emerald-400/40"
              title="مزامنة سحابية فورية وجلب أحدث السجلات المسجلة من الأجهزة الأخرى"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncingWithCloud ? 'animate-spin text-amber-300' : 'text-emerald-300'}`} />
              <span className="hidden md:inline">{isSyncingWithCloud ? 'جاري المزامنة...' : 'مزامنة الأجهزة 🔄'}</span>
            </button>

            {/* Publish & Cloud Hosting Button (Protected by Vault Passcode) */}
            <button
              type="button"
              onClick={() =>
                requireVaultAccess('backup', 'قسم الحفظ والنسخ — النشر والاستضافة السحابية', () => {
                  setIsPublishModalOpen(true);
                })
              }
              className="px-3 py-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-blue-400/30"
              title="نشر واستضافة المنظومة سحابياً (محمي بالرقم السري)"
            >
              <UploadCloud className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">نشر واستضافة (Cloudflare / Vercel)</span>
            </button>

            {/* Safe Save & Logout Button in Header */}
            <button
              type="button"
              onClick={handleSafeSaveAndLogout}
              className="px-3 py-1.5 bg-gradient-to-r from-red-700 via-rose-700 to-red-800 hover:from-red-600 hover:to-rose-600 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-md border border-red-500/50"
              title="حفظ آمن لكافة بيانات وسجلات المنظومة وتسجيل الخروج وقفل الشاشة فوراً"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-200" />
              <span>خروج وحفظ آمن</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Calm Semantic Alert Banners (if any urgent expirations or large debts) */}
      {(alertsList.length > 0 || largeDebtsList.length > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 no-print">
          <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              {alertsList.length > 0 && (
                <span className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>يوجد ({alertsList.length}) ترخيص أو عقد قارب على الانتهاء أو منتهي.</span>
                  <button
                    type="button"
                    onClick={() => setIsAlertsModalOpen(true)}
                    className="text-[#1E40AF] font-bold underline hover:text-[#0F2342] cursor-pointer mr-1"
                  >
                    عرض التراخيص
                  </button>
                </span>
              )}
              {largeDebtsList.length > 0 && (
                <span className="flex items-center gap-1.5 font-semibold">
                  <span aria-hidden="true">·</span>
                  <span>يوجد ({largeDebtsList.length}) مخبز تجاوزت مديونيتها 20,000 ج.م (دفعات أسبوعية).</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInstallmentBakeryId(undefined);
                      setIsWeeklyInstallmentsModalOpen(true);
                    }}
                    className="text-red-700 font-bold underline hover:text-red-900 cursor-pointer mr-1"
                  >
                    جدول الدفعات الأسبوعية
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Layout Container: Permanent Right Sidebar + Left Content Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row w-full max-w-[1920px] mx-auto">
        {/* Right-Side Collapsible Navigation Sidebar (القائمة الجانبية الكحلية على اليمين) */}
        <RightSidebar
          activeNavId={activeSidebarNavId}
          onSelectNav={handleSelectSidebarNav}
          bakeriesCount={appState.bakeries.length}
          debtsCount={appState.debts.length}
          alertsCount={alertsList.length}
          unreadInboxCount={unreadInboxCount}
          pendingTasksCount={(appState.dailyTasks || []).filter((t) => t.status !== 'completed').length}
          largeDebtsCount={largeDebtsList.length}
          logoBase64={appState.systemConfig.logoBase64}
          administrationTitle={appState.systemConfig.administrationTitle}
          directorateTitle={appState.systemConfig.directorateTitle}
          connectionStatus={connectionSnapshot.status}
          connectionLabel={connectionSnapshot.label}
          isVaultUnlocked={isVaultUnlocked}
          onOpenVaultGate={(section, label) =>
            setVaultGateModal({
              isOpen: true,
              section,
              label,
            })
          }
          onLockVault={() => setIsVaultUnlocked(false)}
        />

        {/* Main Workspace Canvas (Matte Off-White) */}
        <main className="flex-1 min-w-0 p-4 sm:p-5 space-y-4">
          {/* 3.1 Breadcrumbs & Quick View Switcher Bar */}
          <div className="bg-white border border-[#D4AF37]/30 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm no-print">
            {/* Breadcrumb Path */}
            <nav aria-label="مسار التنقل" className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('dashboard-home', 'لوحة التحكم', 'الصفحة الرئيسية')}
                className="text-slate-500 hover:text-[#0D9488] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 text-[#0D9488]" />
                <span>الرئيسية</span>
              </button>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-600 font-bold">{breadcrumbGroup}</span>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#0A1628] font-black">{breadcrumbItem}</span>
            </nav>

            {/* Primary View Mode Segmented Switcher */}
            <div className="flex items-center flex-wrap gap-1.5 bg-[#F1F5F9] p-1.5 rounded-xl border border-slate-200">
              <button
                type="button"
                data-testid="nav-dashboard-charts-tab"
                onClick={() =>
                  handleSelectSidebarNav(
                    'dashboard-charts',
                    'لوحة التحكم',
                    'لوحة التحكم والرسوم البيانية'
                  )
                }
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'charts'
                    ? 'bg-gradient-to-l from-[#0A1628] to-[#0D9488] text-white shadow-sm'
                    : 'text-[#0A1628] hover:bg-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>لوحة التحكم والرسوم</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('dashboard-home', 'لوحة التحكم', 'الصفحة الرئيسية')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-l from-[#0A1628] to-[#0D9488] text-white shadow-sm'
                    : 'text-[#0A1628] hover:bg-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>الصفحة الرئيسية</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('bakeries-all', 'إدارة المخابز', 'قاعدة بيانات المخابز')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'bakeries'
                    ? 'bg-gradient-to-l from-[#0A1628] to-[#0D9488] text-white shadow-sm'
                    : 'text-[#0A1628] hover:bg-white'
                }`}
              >
                <Store className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>قاعدة بيانات المخابز ({appState.bakeries.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('debts-records', 'إدارة المخابز', 'سجل مديونيات المخابز')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'debts'
                    ? 'bg-gradient-to-l from-[#0A1628] to-[#0D9488] text-white shadow-sm'
                    : 'text-[#0A1628] hover:bg-white'
                }`}
              >
                <Scale className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>سجل المديونيات ({appState.debts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('reports-center', 'مركز التقارير والطباعة', 'شاشة التقارير والطباعة المتقدمة')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'reports'
                    ? 'bg-gradient-to-l from-[#0A1628] to-[#0D9488] text-white shadow-sm'
                    : 'text-[#0A1628] hover:bg-white'
                }`}
              >
                <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>مركز التقارير والطباعة</span>
              </button>
              <button
                type="button"
                data-testid="nav-user-guide-tab"
                onClick={() => handleSelectSidebarNav('user-guide', '1. قسم إدارة المخابز', 'دليل المستخدم (صور وفيديو)')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'user-guide'
                    ? 'bg-[#10B981] text-white shadow-sm'
                    : 'text-[#0D9488] bg-[#0D9488]/10 hover:bg-[#0D9488] hover:text-white border border-[#0D9488]/30'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>دليل المستخدم</span>
              </button>
            </div>
          </div>

          {/* 3.2 Unified Command Toolbar */}
          <div className="bg-white border border-[#D4AF37]/30 rounded-2xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                data-testid="toolbar-dashboard-btn"
                onClick={() =>
                  handleSelectSidebarNav(
                    'dashboard-charts',
                    'لوحة التحكم',
                    'لوحة التحكم والرسوم البيانية'
                  )
                }
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border ${
                  activeTab === 'charts'
                    ? 'bg-[#0A1628] text-[#D4AF37] border-[#D4AF37]/50 shadow-sm'
                    : 'bg-[#F1F5F9] hover:bg-[#0A1628] text-[#0A1628] hover:text-white border-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#0D9488]" />
                <span>لوحة التحكم</span>
              </button>
              <button
                type="button"
                data-testid="toolbar-alerts-drawer-btn"
                onClick={() => setIsAdminDrawerOpen(true)}
                className="px-3 py-2 bg-rose-50 hover:bg-[#F43F5E] text-rose-800 hover:text-white border border-rose-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>سجل التنبيهات</span>
                {highDebtNotifications.filter((n) => !n.isRead).length > 0 && (
                  <span className="px-1.5 py-0.2 bg-[#F43F5E] text-white rounded-full text-[10px] font-mono tabular-nums font-black">
                    {highDebtNotifications.filter((n) => !n.isRead).length}
                  </span>
                )}
              </button>
              {/* 1. Add Bakery */}
              {appState.currentUser?.role !== 'viewer' && (
                <button
                  type="button"
                  onClick={() =>
                    runGuardedAction(() => {
                      setBakeryToEdit(null);
                      setIsBakeryModalOpen(true);
                    })
                  }
                  className="px-3.5 py-2 bg-gradient-to-l from-[#0A1628] to-[#0D9488] hover:from-[#0F1E36] hover:to-[#0F766E] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-[#D4AF37]/30"
                >
                  <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>إضافة مخبز</span>
                </button>
              )}

              {/* 2. Edit Data */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() => {
                    if (selectedBakeryRowId) {
                      const found = appState.bakeries.find((b) => b.id === selectedBakeryRowId);
                      if (found) {
                        setBakeryToEdit(found);
                        setIsBakeryModalOpen(true);
                        return;
                      }
                    }
                    setMasterEditorInitialCategory('ALL');
                    setIsMasterEditorModalOpen(true);
                  })
                }
                className="px-2.5 py-1.5 bg-[#1E40AF] hover:bg-[#2563EB] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="تعديل المخبز المحدد أو تعديل القوائم والبيانات"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>تعديل البيانات</span>
              </button>

              {/* 3. Save Changes */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() => {
                    triggerSave(appState, 'تم حفظ وتأكيد جميع التغييرات في قاعدة البيانات بنجاح');
                  })
                }
                className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ التغييرات</span>
              </button>

              {/* 3.2 Safe Save & Logout Button (زر خروج وحفظ آمن أعلى الجداول) */}
              <button
                type="button"
                onClick={handleSafeSaveAndLogout}
                className="px-3 py-1.5 bg-gradient-to-r from-red-700 via-rose-700 to-red-800 hover:from-red-600 hover:to-rose-600 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-red-500/60"
                title="حفظ آمن لكافة بيانات وسجلات الجداول وتسجيل الخروج وقفل الشاشة فوراً"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-200" />
                <span>خروج وحفظ آمن</span>
              </button>

              {/* 4. Recalculate Results */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() => {
                    setPendingConfirm({
                      title: 'إعادة احتساب نتائج المعادلات',
                      message: 'هل ترغب في إعادة احتساب وتدقيق جميع المعادلات الحسابية لكافة المخابز والمديونيات الآن؟',
                      confirmLabel: 'تنفيذ إعادة الاحتساب',
                      variant: 'primary',
                      onConfirm: () => handleRecalculateAllDatabaseEquations(),
                    });
                  })
                }
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0F2342] border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5 text-[#1E40AF]" />
                <span>إعادة احتساب النتائج</span>
              </button>

              {/* 5. Refresh Data */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() => {
                    const synced = recalculateAllDatabaseEquations(appState.bakeries, appState.debts);
                    triggerSave(
                      { ...appState, bakeries: synced.bakeries, debts: synced.debts },
                      'تم تحديث البيانات ومزامنة كافة الجداول والمعادلات بنجاح'
                    );
                  })
                }
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                <span>تحديث البيانات</span>
              </button>

              {/* 6. Print */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() => {
                    setReportModalInitialTab(activeTab === 'debts' ? 'debts' : 'bakeries');
                    setIsReportModalOpen(true);
                  })
                }
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#0F2342]" />
                <span>طباعة</span>
              </button>

              {/* 7. Export Excel (Protected by Vault Passcode) */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() =>
                    requireVaultAccess('backup', 'قسم الحفظ والنسخ — تصدير Excel', handleExportBakeryCSV)
                  )
                }
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-emerald-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>تصدير Excel</span>
              </button>

              {/* 8. Import Excel / Backup (Protected by Vault Passcode) */}
              <button
                type="button"
                onClick={() =>
                  runGuardedAction(() =>
                    requireVaultAccess('backup', 'قسم الحفظ والنسخ — استيراد Excel والنسخ الاحتياطي', () =>
                      setIsBackupModalOpen(true)
                    )
                  )
                }
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#1E40AF]" />
                <span>استيراد Excel</span>
              </button>
            </div>

            {/* 9. Advanced Search & Instant Search Input inside Toolbar */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[260px] max-w-md">
              <button
                type="button"
                onClick={() => {
                  if (activeTab !== 'bakeries') setActiveTab('bakeries');
                  setShowAdvancedSearchPanel((prev) => !prev);
                  setTimeout(() => searchInputRef.current?.focus(), 80);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border shrink-0 ${
                  showAdvancedSearchPanel && activeTab === 'bakeries'
                    ? 'bg-[#EFF6FF] text-[#1E3A8A] border-blue-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>بحث متقدم</span>
              </button>

              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={
                    searchFocusMode === 'NAME'
                      ? 'ابحث باسم صاحب المخبز...'
                      : searchFocusMode === 'MACHINE'
                      ? 'ابحث برقم الماكينة / المخبز...'
                      : 'بحث فوري بالاسم، رقم الماكينة، القرية...'
                  }
                  className="w-full pr-8 pl-6 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-[#1E40AF] focus:border-[#1E40AF] transition"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setSearchFocusMode('ALL');
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 3.3 Dynamic Active View Content */}
          <div key={activeTab} className="tab-content-enter">
            {activeTab === 'dashboard' ? (
              <HomeDashboardView
              bakeries={appState.bakeries}
              debts={appState.debts}
              villages={appState.villages}
              activeSubMode={activeSidebarNavId}
              onNavigateToBakeries={(opts) => {
                setActiveTab('bakeries');
                if (opts?.columnFocus) setColumnViewMode(opts.columnFocus);
                if (opts?.village) setSelectedVillage(opts.village);
                if (opts?.activityStatus) setSelectedActivity(opts.activityStatus);
                setBreadcrumbGroup('إدارة المخابز');
                setBreadcrumbItem('قاعدة بيانات المخابز');
              }}
              onSelectBakeryDetails={(b) => setDetailsBakery(b)}
              onRecalculateEquations={handleRecalculateAllDatabaseEquations}
              onOpenLocalUnitsModal={() => setIsLocalUnitsModalOpen(true)}
            />
          ) : activeTab === 'charts' ? (
            /* NEW INTERACTIVE RECHARTS DASHBOARD VIEW */
            <InteractiveDashboardPage
              bakeries={appState.bakeries}
              debts={appState.debts}
              villages={appState.villages}
              debtAlertThreshold={
                appState.systemConfig?.debtAlertThreshold ?? DEFAULT_DEBT_ALERT_THRESHOLD
              }
              unreadAlertsCount={highDebtNotifications.filter((n) => !n.isRead).length}
              administrationTitle={appState.systemConfig.administrationTitle}
              onNavigateToBakeries={(opts) => {
                setActiveTab('bakeries');
                if (opts?.village) setSelectedVillage(opts.village);
                if (opts?.activityStatus) setSelectedActivity(opts.activityStatus);
                setBreadcrumbGroup('إدارة المخابز');
                setBreadcrumbItem('قاعدة بيانات المخابز');
              }}
              onNavigateToDebts={(bakeryId) => {
                setDebtFilterBakeryId(bakeryId);
                setActiveTab('debts');
                setBreadcrumbGroup('إدارة المخابز');
                setBreadcrumbItem('سجل مديونيات المخابز');
              }}
              onOpenAlertsDrawer={() => setIsAdminDrawerOpen(true)}
            />
          ) : activeTab === 'user-guide' ? (
            /* USER GUIDE VIEW (دليل المستخدم المصور والفيديو) */
            <UserGuideView
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                if (tab === 'bakeries') {
                  setActiveSidebarNavId('bakeries-all');
                  setBreadcrumbGroup('1. قسم إدارة المخابز');
                  setBreadcrumbItem('إدارة المخابز');
                } else if (tab === 'debts') {
                  setActiveSidebarNavId('debts-records');
                  setBreadcrumbGroup('3. قسم سجل المديونيات');
                  setBreadcrumbItem('سجل المديونيات');
                } else if (tab === 'reports') {
                  setActiveSidebarNavId('reports-center');
                  setBreadcrumbGroup('مركز التقارير والطباعة');
                  setBreadcrumbItem('شاشة التقارير والطباعة المتقدمة');
                } else if (tab === 'charts') {
                  setActiveSidebarNavId('dashboard-charts');
                  setBreadcrumbGroup('1. قسم إدارة المخابز');
                  setBreadcrumbItem('لوحة التحكم والرسوم البيانية');
                }
              }}
              onOpenModal={(modal) => {
                if (modal === 'add-bakery') {
                  setBakeryToEdit(null);
                  setIsBakeryModalOpen(true);
                } else if (modal === 'add-debt') {
                  setActiveTab('debts');
                  setOpenDebtScheduleSignal((prev) => prev + 1);
                } else if (modal === 'backup-sync') {
                  setIsBackupModalOpen(true);
                } else if (modal === 'villages-units') {
                  setIsLocalUnitsModalOpen(true);
                } else if (modal === 'branches') {
                  setIsBranchesModalOpen(true);
                } else if (modal === 'users') {
                  setIsUsersModalOpen(true);
                } else if (modal === 'audit') {
                  setIsAuditModalOpen(true);
                }
              }}
              bakeriesCount={appState.bakeries.length}
              debtsCount={appState.debts.length}
              villagesCount={appState.villages.length}
            />
          ) : activeTab === 'realtime-diagnostics' ? (
            /* HIDDEN REALTIME DIAGNOSTICS VIEW (صفحة التشخيص المخفية لـ Supabase Realtime و WebSockets) */
            <RealtimeDiagnosticsView
              appState={appState}
              saveTimestamp={saveTimestamp}
              onForceReconnect={handleRetryConnection}
              onForceSyncNow={async () => {
                await flushRowMutationQueue().catch(() => {});
                await triggerSave(appState, 'تم دفع وتحديث حالة AppState لحظياً عبر قنوات Realtime بنجاح');
                await handleManualCloudPull();
              }}
              onPurgeAllDatabases={async () => {
                const res = await clearSupabaseDatabaseData();
                await factoryReset();
                setHighDebtNotifications([]);
                setAppState((prev) =>
                  prev
                    ? {
                        ...prev,
                        bakeries: [],
                        debts: [],
                        dailyTasks: [],
                        inboxMessages: [],
                      }
                    : prev
                );
                const nowAr = getArabicTimestamp();
                setSaveTimestamp(nowAr);
                setSaveToast({
                  id: Date.now(),
                  message: res.message,
                  timestamp: nowAr,
                  variant: 'success',
                });
                return res;
              }}
              onClose={() => {
                setActiveTab('bakeries');
                setActiveSidebarNavId('bakeries-all');
                setBreadcrumbGroup('1. قسم إدارة المخابز');
                setBreadcrumbItem('إدارة المخابز');
              }}
            />
          ) : activeTab === 'reports' ? (
            /* REPORTS CENTER VIEW */
            <ReportsCenterView
              bakeries={appState.bakeries}
              debts={appState.debts}
              villages={appState.villages}
              systemConfig={appState.systemConfig}
              currentUser={appState.currentUser}
              initialReportId={activeReportId}
            />
          ) : activeTab === 'debts' ? (
            /* DEBTS VIEW */
            <DebtsView
              bakeries={appState.bakeries}
              debts={appState.debts}
              villages={appState.villages}
              issuingEntities={appState.issuingEntities}
              violationTypes={appState.violationTypes}
              systemConfig={appState.systemConfig}
              currentUser={appState.currentUser}
              onSaveDebt={handleSaveDebt}
              onDeleteDebt={handleDeleteDebt}
              onUpdateEntities={(ents) => {
                const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
                commitRowMutation({
                  nextState: { ...appState, issuingEntities: ents },
                  table: 'dropdown_lists',
                  branchId,
                  toastMessage: 'تم تحديث قائمة الجهات المحررة في قاعدة البيانات بنجاح',
                  executeDb: () =>
                    saveRowToDb({
                      table: 'dropdown_lists',
                      branchId,
                      row: {
                        id: `${branchId}__issuingEntities`,
                        branchId,
                        listKey: 'issuingEntities',
                        options: ents,
                      },
                      operation: 'UPDATE',
                    }),
                });
              }}
              onUpdateViolations={(viols) => {
                const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
                commitRowMutation({
                  nextState: { ...appState, violationTypes: viols },
                  table: 'dropdown_lists',
                  branchId,
                  toastMessage: 'تم تحديث قائمة أنواع المخالفات في قاعدة البيانات بنجاح',
                  executeDb: () =>
                    saveRowToDb({
                      table: 'dropdown_lists',
                      branchId,
                      row: {
                        id: `${branchId}__violationTypes`,
                        branchId,
                        listKey: 'violationTypes',
                        options: viols,
                      },
                      operation: 'UPDATE',
                    }),
                });
              }}
              onRenameEntity={(oldName, newName) => {
                if (!oldName.trim() || !newName.trim() || oldName === newName) return;
                const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
                const updatedEntities = appState.issuingEntities.map((e) => (e === oldName ? newName : e));
                const updatedDebts = appState.debts.map((d) =>
                  d.issuingEntity === oldName ? { ...d, issuingEntity: newName } : d
                );
                commitRowMutation({
                  nextState: { ...appState, issuingEntities: updatedEntities, debts: updatedDebts },
                  branchId,
                  toastMessage: `تم تعديل الجهة المحررة إلى "${newName}" وتحديث القيود المرتبطة بها في قاعدة البيانات`,
                  executeDb: () =>
                    batchSyncToDb({
                      branchId,
                      data: { issuingEntities: updatedEntities, debts: updatedDebts },
                      pruneRemoved: false,
                      sqlOperation: 'UPDATE',
                      affectedTable: 'debts',
                    }),
                });
              }}
              onRenameViolation={(oldName, newName) => {
                if (!oldName.trim() || !newName.trim() || oldName === newName) return;
                const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
                const updatedViolations = appState.violationTypes.map((v) => (v === oldName ? newName : v));
                const updatedDebts = appState.debts.map((d) =>
                  d.violationType === oldName ? { ...d, violationType: newName } : d
                );
                commitRowMutation({
                  nextState: { ...appState, violationTypes: updatedViolations, debts: updatedDebts },
                  branchId,
                  toastMessage: `تم تعديل نوع المخالفة إلى "${newName}" وتحديث القيود المرتبطة بها في قاعدة البيانات`,
                  executeDb: () =>
                    batchSyncToDb({
                      branchId,
                      data: { violationTypes: updatedViolations, debts: updatedDebts },
                      pruneRemoved: false,
                      sqlOperation: 'UPDATE',
                      affectedTable: 'debts',
                    }),
                });
              }}
              filterBakeryId={debtFilterBakeryId}
              onClearBakeryFilter={() => setDebtFilterBakeryId(undefined)}
              onOpenReportModal={(tab) => {
                setReportModalInitialTab(tab || 'debts');
                setIsReportModalOpen(true);
              }}
              showAlertsKeyModal={showDebtsAlertsKeyModal}
              onCloseAlertsKeyModal={() => setShowDebtsAlertsKeyModal(false)}
              externalManageListModal={externalDebtsManageListModal}
              onCloseExternalManageListModal={() => setExternalDebtsManageListModal(null)}
              debtsColumnGroup={debtsColumnGroup}
              debtsPageSize={debtsPageSize}
              onSafeSaveAndLogout={handleSafeSaveAndLogout}
              openScheduleSignal={openDebtScheduleSignal}
            />
          ) : (
            /* BAKERIES DATABASE VIEW (تصميم احترافي متحرك لقاعدة بيانات المخابز بدون المساس بالمعادلات) */
            <div className="space-y-4 animate-fade-in">
              {/* Summary Strip Above Bakeries Table (Luxury Midnight Navy / Royal Teal / Champagne Gold Cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                <div className="executive-card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#0A1628] to-[#0D9488] absolute top-0 right-0 left-0" />
                  <span className="text-[11px] font-black text-slate-600 block">إجمالي المخابز</span>
                  <span className="text-2xl font-black font-mono tabular-nums text-[#0A1628] block mt-1">{bakeryStats.count}</span>
                  <span className="text-[10px] font-bold text-[#0D9488]">مخبز مسجل بالقاعدة</span>
                </div>
                <div className="executive-card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#D4AF37] to-amber-500 absolute top-0 right-0 left-0" />
                  <span className="text-[11px] font-black text-slate-600 block">إجمالي الحصة التأمينية</span>
                  <span className="text-2xl font-black font-mono tabular-nums text-amber-700 block mt-1">
                    {Number(bakeryStats.totalInsurance.toFixed(2)).toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-amber-800">شيكارة (حساب تلقائي ∑)</span>
                </div>
                <div className="executive-card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#0D9488] to-teal-500 absolute top-0 right-0 left-0" />
                  <span className="text-[11px] font-black text-slate-600 block">إجمالي الحصة الفعلية</span>
                  <span className="text-2xl font-black font-mono tabular-nums text-[#0D9488] block mt-1">{bakeryStats.totalActual.toLocaleString()}</span>
                  <span className="text-[10px] font-bold text-teal-800">شيكارة يومياً</span>
                </div>
                <div className="executive-card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#10B981] to-emerald-600 absolute top-0 right-0 left-0" />
                  <span className="text-[11px] font-black text-slate-600 block">إجمالي الأرغفة اليومية</span>
                  <span className="text-2xl font-black font-mono tabular-nums text-[#10B981] block mt-1">{bakeryStats.totalLoaves.toLocaleString()}</span>
                  <span className="text-[10px] font-bold text-emerald-800">رغيف بلدي مدعم</span>
                </div>
                <div className="executive-card rounded-2xl p-4 text-center relative overflow-hidden">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#0A1628] to-[#D4AF37] absolute top-0 right-0 left-0" />
                  <span className="text-[11px] font-black text-slate-600 block">متوسط نصيب الفرد (2025)</span>
                  <span className="text-2xl font-black font-mono tabular-nums text-[#0A1628] block mt-1">
                    {annualWeightedSummary?.weightedGeneralAvg2025 || '0.00'}
                  </span>
                  <span className="text-[10px] font-bold text-[#0D9488]">رغيف / مستفيد</span>
                </div>
                <div className="executive-card rounded-2xl p-4 text-center col-span-2 sm:col-span-1 relative overflow-hidden">
                  <div className="h-1.5 w-full bg-gradient-to-r from-[#F43F5E] to-rose-600 absolute top-0 right-0 left-0" />
                  <span className="text-[11px] font-black text-slate-600 block">إجمالي المديونيات المتبقية</span>
                  <span className="text-2xl font-black font-mono tabular-nums text-[#F43F5E] block mt-1">{bakeryStats.totalDebts.toLocaleString()}</span>
                  <span className="text-[10px] font-bold text-rose-800">جنيه مصري</span>
                </div>
              </div>

              {/* Advanced Filters & Column View Selector Card */}
              <div className="bg-white border border-[#D4AF37]/30 rounded-2xl p-4 shadow-sm space-y-3 no-print">
                {/* Column Group View Tabs (لتسهيل قراءة البيانات وعدم ازدحام الشاشة) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-600 ml-1">نطاق عرض الأعمدة:</span>
                    {(
                      [
                        { id: 'ALL', label: 'كافة الأعمدة (شامل)' },
                        { id: 'BASIC', label: 'البيانات الأساسية والتراخيص' },
                        { id: 'BREAD', label: 'أنواع الخبز والتشغيل' },
                        { id: 'QUOTAS', label: 'الحصص الفعلية والأرغفة' },
                        { id: 'INSURANCE', label: 'المبالغ والحصص التأمينية' },
                        { id: 'BENEFICIARIES', label: 'بيانات المستفيدين (2023-2025)' },
                        { id: 'EQUATIONS', label: 'الحسابات والمعادلات السبع ∑' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setColumnViewMode(tab.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          columnViewMode === tab.id
                            ? 'bg-[#0F2342] text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Legend for Calculated vs Manual & Missing Cells */}
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-[#EFF6FF] border border-blue-300 inline-block" />
                      <span>عمود محسوب تلقائياً (∑)</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-white border border-slate-300 inline-block" />
                      <span>بيانات مدخلة يدوياً</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-amber-50 border border-amber-400 inline-block" />
                      <span>بيانات ناقصة</span>
                    </span>
                  </div>
                </div>

                {/* Collapsible Advanced Multi-Criteria Filter Panel */}
                {showAdvancedSearchPanel && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs">
                      {/* 1. Village */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">1. القرية / المنطقة</label>
                        <select
                          value={selectedVillage}
                          onChange={(e) => {
                            setSelectedVillage(e.target.value);
                            setSelectedUnit('ALL');
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">كافة القرى ({availableVillagesFilter.length})</option>
                          {availableVillagesFilter.map((vName) => (
                            <option key={vName} value={vName}>
                              {vName}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 2. Activity Status */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">2. حالة التشغيل</label>
                        <select
                          value={selectedActivity}
                          onChange={(e) => {
                            setSelectedActivity(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">كافة الحالات</option>
                          {appState.activityStatuses.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 3. Local Unit */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">3. الوحدة المحلية</label>
                        <select
                          value={selectedUnit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedUnit(val);
                            if (val !== 'ALL' && selectedVillage !== 'ALL') {
                              const parentV = appState.villages.find((v) =>
                                v.localUnits.some((u) => normalizeArabicText(u) === normalizeArabicText(val))
                              );
                              if (parentV && normalizeArabicText(parentV.village) !== normalizeArabicText(selectedVillage)) {
                                setSelectedVillage(parentV.village);
                              }
                            }
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">كافة الوحدات ({availableUnitsFilter.length})</option>
                          {availableUnitsFilter.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 4. Bread Type */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">4. نوع الخبز</label>
                        <select
                          value={selectedBreadTypeFilter}
                          onChange={(e) => {
                            setSelectedBreadTypeFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">كافة أنواع الخبز</option>
                          {Array.from(
                            new Set([
                              ...(appState.breadTypes || []),
                              ...appState.bakeries.map((b) => b.breadType).filter(Boolean),
                            ])
                          ).map((bt) => (
                            <option key={bt} value={bt}>
                              {bt}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 5. Fuel / Line Type */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">5. الوقود / خط الإنتاج</label>
                        <select
                          value={selectedFuelTypeFilter}
                          onChange={(e) => {
                            setSelectedFuelTypeFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">الكل</option>
                          {Array.from(
                            new Set([
                              ...(appState.fuelTypes || []),
                              ...(appState.lineTypes || []),
                            ])
                          ).map((ft) => (
                            <option key={ft} value={ft}>
                              {ft}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 6. Bakery Category */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">6. تصنيف المخبز</label>
                        <select
                          value={selectedCategoryFilter}
                          onChange={(e) => {
                            setSelectedCategoryFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">كافة التصنيفات ({appState.bakeries.length})</option>
                          <option value="مدعم">بلدي مدعم ({categoryCounts.baladi})</option>
                          <option value="مطور">بلدي مطور ({categoryCounts.baladiMotawar})</option>
                          <option value="سياحي">سياحي 72% ({categoryCounts.tourist})</option>
                          <option value="فينو">فينو وأفرنجي ({categoryCounts.fino})</option>
                          <option value="طباقي">طباقي ({categoryCounts.tabaqi})</option>
                        </select>
                      </div>

                      {/* 7. Debt Status */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">7. موقف المديونية</label>
                        <select
                          value={selectedDebtFilter}
                          onChange={(e) => {
                            setSelectedDebtFilter(e.target.value as 'ALL' | 'HAS_DEBT' | 'NO_DEBT');
                            setCurrentPage(1);
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-1 focus:ring-[#1E40AF] cursor-pointer"
                        >
                          <option value="ALL">الكل (مديون وخالص)</option>
                          <option value="HAS_DEBT">عليه مديونية متبقية</option>
                          <option value="NO_DEBT">خالص المديونية (0 ج.م)</option>
                        </select>
                      </div>
                    </div>

                    {/* Quick Filter Status & Reset Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-500 font-semibold">فلتر صلاحية التراخيص:</span>
                        {(
                          [
                            { id: 'ALL', label: `الكل (${appState.bakeries.length})` },
                            { id: 'EXPIRED', label: `منتهية (${licenseExpiryCounts.expired})` },
                            { id: 'WITHIN_30', label: `خلال 30 يوم (${licenseExpiryCounts.within30})` },
                            { id: 'VALID', label: `سارية (${licenseExpiryCounts.valid})` },
                          ] as const
                        ).map((lf) => (
                          <button
                            key={lf.id}
                            type="button"
                            onClick={() => {
                              setSelectedLicenseExpiryFilter(lf.id);
                              setCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                              selectedLicenseExpiryFilter === lf.id
                                ? 'bg-[#1E3A8A] text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {lf.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-bold">
                          نتائج البحث: <span className="text-[#0F2342] font-mono">{sortedBakeries.length}</span> من{' '}
                          <span className="font-mono">{appState.bakeries.length}</span> مخبز
                        </span>
                        {(selectedVillage !== 'ALL' ||
                          selectedUnit !== 'ALL' ||
                          selectedActivity !== 'ALL' ||
                          selectedCategoryFilter !== 'ALL' ||
                          selectedDebtFilter !== 'ALL' ||
                          selectedBreadTypeFilter !== 'ALL' ||
                          selectedFuelTypeFilter !== 'ALL' ||
                          selectedLicenseExpiryFilter !== 'ALL' ||
                          searchTerm.trim() !== '') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVillage('ALL');
                              setSelectedUnit('ALL');
                              setSelectedActivity('ALL');
                              setSelectedCategoryFilter('ALL');
                              setSelectedDebtFilter('ALL');
                              setSelectedBreadTypeFilter('ALL');
                              setSelectedFuelTypeFilter('ALL');
                              setSelectedLicenseExpiryFilter('ALL');
                              setSearchTerm('');
                              setSearchFocusMode('ALL');
                              setCurrentPage(1);
                            }}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>إعادة تعيين الفلاتر</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Main Bakeries Data Table (Pure White & Light Gray with Sticky Navy Headers) */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[680px] relative">
                  <table className="w-full text-center border-collapse text-xs">
                    {/* Grouped Super Headers */}
                    <thead className="sticky top-0 z-20 bg-[#0F2342] text-white font-bold shadow-xs">
                      <tr className="border-b border-[#1E3A5F]">
                        <th
                          rowSpan={2}
                          onClick={() => handleSort('index')}
                          className="py-2.5 px-2 bg-[#0B1B34] border-l border-[#1E3A5F] text-slate-200 w-12 cursor-pointer hover:bg-[#16315B]"
                        >
                          <span>{ct.index}</span>
                          {renderSortIcon('index')}
                        </th>

                        {showBasicCols && (
                          <th colSpan={5} className="py-2 px-2 bg-[#0F2342] border-l border-[#1E3A5F] text-sky-200">
                            البيانات الأساسية وموقع المخبز (مدخل يدوي)
                          </th>
                        )}

                        {showDebtCol && (
                          <th
                            rowSpan={2}
                            onClick={() => handleSort('remainingDebt')}
                            className="py-2.5 px-2 bg-[#162F57] border-l border-[#1E3A5F] text-rose-200 min-w-[115px] cursor-pointer hover:bg-[#1E3A8A]"
                          >
                            <ThHeaderTooltip label={ct.remainingDebt} tooltipKey="remainingDebt" />
                            {renderSortIcon('remainingDebt')}
                          </th>
                        )}

                        {showQuotaCols && (
                          <th colSpan={5} className="py-2 px-2 bg-[#152E54] border-l border-[#1E3A5F] text-sky-200">
                            الحصص والبيانات التأمينية والأرغفة (شامل الأعمدة الحسابية ∑)
                          </th>
                        )}

                        {showDemographicsCols && (
                          <th colSpan={8} className="py-2 px-2 bg-[#0F2342] border-l border-[#1E3A5F] text-sky-200">
                            السكان والمستفيدون ومتوسطات نصيب الفرد (2023 - 2025) ∑
                          </th>
                        )}

                        {showOperationsCols && (
                          <th colSpan={7} className="py-2 px-2 bg-[#152E54] border-l border-[#1E3A5F] text-slate-200">
                            التصنيف ونوع الخبز والتشغيل
                          </th>
                        )}

                        {showContactLicenseCols && (
                          <>
                            <th colSpan={2} className="py-2 px-2 bg-[#0F2342] border-l border-[#1E3A5F] text-slate-200">
                              الاتصال والهوية
                            </th>
                            <th colSpan={8} className="py-2 px-2 bg-[#152E54] border-l border-[#1E3A5F] text-slate-200">
                              التراخيص والعقود
                            </th>
                          </>
                        )}

                        <th
                          rowSpan={2}
                          className="py-2.5 px-2 bg-[#0B1B34] text-sky-200 min-w-[125px] no-print text-center"
                        >
                          الإجراءات والعرض
                        </th>
                      </tr>

                      {/* Sub-Headers Row with Sorting & Calculated Badges */}
                      <tr className="bg-[#16315B] text-[11px] text-slate-100 font-bold border-b border-[#1E3A5F]">
                        {showBasicCols && (
                          <>
                            <th
                              onClick={() => handleSort('bakeryOwnerName')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[165px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.bakeryOwnerName} tooltipKey="bakeryOwnerName" />
                              {renderSortIcon('bakeryOwnerName')}
                            </th>
                            <th
                              onClick={() => handleSort('machineNumber')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.machineNumber} tooltipKey="machineNumber" />
                              {renderSortIcon('machineNumber')}
                            </th>
                            <th
                              onClick={() => handleSort('village')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.village} tooltipKey="village" />
                              {renderSortIcon('village')}
                            </th>
                            <th
                              onClick={() => handleSort('localUnit')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.localUnit} tooltipKey="localUnit" />
                              {renderSortIcon('localUnit')}
                            </th>
                            <th
                              onClick={() => handleSort('responsibleManager')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[125px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.responsibleManager || 'المدير المسئول'} tooltipKey="responsibleManager" />
                              {renderSortIcon('responsibleManager')}
                            </th>
                          </>
                        )}

                        {showQuotaCols && (
                          <>
                            <th
                              onClick={() => handleSort('insuranceValue')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[100px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.insuranceValue} tooltipKey="insuranceValue" />
                              {renderSortIcon('insuranceValue')}
                            </th>
                            <th
                              onClick={() => handleSort('insuranceQuota')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[105px] bg-[#1E3A8A] text-sky-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.insuranceQuota} tooltipKey="insuranceQuota" />
                              {renderSortIcon('insuranceQuota')}
                              <span className="block text-[9px] text-sky-300 font-normal">حساب تلقائي ∑</span>
                            </th>
                            <th
                              onClick={() => handleSort('actualQuota')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.actualQuota} tooltipKey="actualQuota" />
                              {renderSortIcon('actualQuota')}
                            </th>
                            <th
                              onClick={() => handleSort('loavesCount')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[105px] bg-[#1E3A8A] text-sky-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.loavesCount} tooltipKey="loavesCount" />
                              {renderSortIcon('loavesCount')}
                              <span className="block text-[9px] text-sky-300 font-normal">حساب تلقائي ∑</span>
                            </th>
                            <th
                              onClick={() => handleSort('perCapitaAverage')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[115px] bg-[#1E3A8A] text-sky-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.perCapitaAverage} tooltipKey="perCapitaAverage" />
                              {renderSortIcon('perCapitaAverage')}
                              <span className="block text-[9px] text-sky-300 font-normal">حساب تلقائي ∑</span>
                            </th>
                          </>
                        )}

                        {showDemographicsCols && (
                          <>
                            <th
                              onClick={() => handleSort('villagePopulation')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.villagePopulation} tooltipKey="villagePopulation" />
                              {renderSortIcon('villagePopulation')}
                            </th>
                            <th
                              onClick={() => handleSort('beneficiaries2023')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.beneficiaries2023} tooltipKey="beneficiaries2023" />
                              {renderSortIcon('beneficiaries2023')}
                            </th>
                            <th
                              onClick={() => handleSort('beneficiaries2024')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.beneficiaries2024} tooltipKey="beneficiaries2024" />
                              {renderSortIcon('beneficiaries2024')}
                            </th>
                            <th
                              onClick={() => handleSort('beneficiaries2025')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] cursor-pointer hover:bg-[#1E40AF]"
                            >
                              <ThHeaderTooltip label={ct.beneficiaries2025} tooltipKey="beneficiaries2025" />
                              {renderSortIcon('beneficiaries2025')}
                            </th>
                            <th
                              onClick={() => handleSort('avg2023')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] bg-[#1E3A8A] text-sky-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.avg2023} tooltipKey="avg2023" />
                              {renderSortIcon('avg2023')}
                              <span className="block text-[9px] text-sky-300 font-normal">حساب تلقائي ∑</span>
                            </th>
                            <th
                              onClick={() => handleSort('avg2024')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] bg-[#1E3A8A] text-sky-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.avg2024} tooltipKey="avg2024" />
                              {renderSortIcon('avg2024')}
                              <span className="block text-[9px] text-sky-300 font-normal">حساب تلقائي ∑</span>
                            </th>
                            <th
                              onClick={() => handleSort('avg2025')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px] bg-[#1E3A8A] text-sky-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.avg2025} tooltipKey="avg2025" />
                              {renderSortIcon('avg2025')}
                              <span className="block text-[9px] text-sky-300 font-normal">حساب تلقائي ∑</span>
                            </th>
                            <th
                              onClick={() => handleSort('avgDiff')}
                              className="py-2 px-2 border-l border-[#1E3A5F] min-w-[100px] bg-[#1E3A8A] text-amber-200 cursor-pointer hover:bg-[#2563EB]"
                            >
                              <ThHeaderTooltip label={ct.avgDiff} tooltipKey="avgDiff" />
                              {renderSortIcon('avgDiff')}
                              <span className="block text-[9px] text-amber-200 font-normal">حساب تلقائي ∑</span>
                            </th>
                          </>
                        )}

                        {showOperationsCols && (
                          <>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[80px]">
                              <ThHeaderTooltip label={ct.activityStatus} tooltipKey="activityStatus" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[110px]">
                              <ThHeaderTooltip label={ct.bakeryCategory} tooltipKey="bakeryCategory" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px]">
                              <ThHeaderTooltip label={ct.breadType} tooltipKey="breadType" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[90px]">
                              <ThHeaderTooltip label={ct.flourBagPrice || 'سعر الشيكارة'} tooltipKey="flourBagPrice" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.breadTypeCount} tooltipKey="breadTypeCount" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.lineType} tooltipKey="lineType" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.fuelType} tooltipKey="fuelType" />
                            </th>
                          </>
                        )}

                        {showContactLicenseCols && (
                          <>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[100px]">
                              <ThHeaderTooltip label={ct.phone} tooltipKey="phone" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[120px]">
                              <ThHeaderTooltip label={ct.nationalId} tooltipKey="nationalId" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px]">
                              <ThHeaderTooltip label={ct.commercialRegNumber || 'رقم السجل التجاري'} tooltipKey="commercialRegNumber" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.commercialRegDate} tooltipKey="commercialRegDate" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px]">
                              <ThHeaderTooltip label={ct.bakeryLicenseNumber || 'رقم الرخصة'} tooltipKey="bakeryLicenseNumber" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.bakeryLicenseDate} tooltipKey="bakeryLicenseDate" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[90px]">
                              <ThHeaderTooltip label={ct.leaseContractType || 'عقد الإيجار (إيجار/تمليك)'} tooltipKey="leaseContractType" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.leaseAgreementDate} tooltipKey="leaseAgreementDate" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[95px]">
                              <ThHeaderTooltip label={ct.taxCardNumber || 'رقم البطاقة الضريبية'} tooltipKey="taxCardNumber" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.taxCardDate} tooltipKey="taxCardDate" />
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>

                    {/* Table Body (Pure White & Very Light Gray with Dark Charcoal Text) */}
                    <tbody className="divide-y divide-slate-200 font-semibold text-slate-800">
                      {sortedBakeries.length === 0 ? (
                        <tr>
                          <td colSpan={38} className="py-12 text-center text-slate-500 font-bold bg-white">
                            لا توجد أي مخابز مطابقة لمعايير البحث أو التصفية الحالية
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          // Helper to render a single bakery row
                          const renderBakeryRow = (b: Bakery, globalIndex: number) => {
                            const isSelected = selectedBakeryRowId === b.id;
                            const remainingDebt = bakeryRemainingDebtsMap[b.id] || 0;

                            const today = new Date();
                            const checkExpiry = (dStr?: string) => {
                              if (!dStr) return false;
                              const d = new Date(dStr);
                              if (isNaN(d.getTime())) return false;
                              const diff = (d.getTime() - today.getTime()) / (1000 * 3600 * 24);
                              return diff <= 15;
                            };

                            const hasLicenseWarning = checkExpiry(b.bakeryLicenseDate);
                            const hasCommWarning = checkExpiry(b.commercialRegDate);
                            const hasLeaseWarning = checkExpiry(b.leaseAgreementDate);
                            const hasTaxWarning = checkExpiry(b.taxCardDate);

                            const isMissingPhone = !b.phone || !b.phone.trim();
                            const isMissingNatId = !b.nationalId || !b.nationalId.trim();
                            const isMissingBen2023 = !b.beneficiaries2023 || b.beneficiaries2023 <= 0;
                            const isMissingBen2024 = !b.beneficiaries2024 || b.beneficiaries2024 <= 0;
                            const isMissingBen2025 = !b.beneficiaries2025 || b.beneficiaries2025 <= 0;

                            return (
                              <tr
                                key={b.id}
                                onClick={() => setSelectedBakeryRowId(b.id)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'row-selected'
                                    : globalIndex % 2 === 0
                                    ? 'bg-white hover:bg-blue-50/40'
                                    : 'bg-[#F8FAFC] hover:bg-blue-50/40'
                                }`}
                              >
                                <td className="py-2.5 px-2 border-l border-slate-200 text-slate-500 num-enlarged">
                                  {globalIndex}
                                </td>

                                {showBasicCols && (
                                  <>
                                    <td className="py-2.5 px-2.5 border-l border-slate-200 font-extrabold text-slate-900 text-right">
                                      {b.bakeryOwnerName}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged text-[#1E3A8A]">
                                      {b.machineNumber}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700">{b.village}</td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-600">{b.localUnit}</td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-800 font-bold">
                                      {b.responsibleManager || '-'}
                                    </td>
                                  </>
                                )}

                                {showDebtCol && (
                                  <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged">
                                    {remainingDebt > 0 ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDebtFilterBakeryId(b.id);
                                            setActiveTab('debts');
                                          }}
                                          className={`px-2 py-0.5 rounded-md text-xs font-bold transition cursor-pointer border ${
                                            remainingDebt > 20000
                                              ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                                              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                          }`}
                                          title="انقر لعرض تفاصيل مديونيات المخبز"
                                        >
                                          {remainingDebt.toLocaleString()} ج.م
                                        </button>
                                        {remainingDebt > 20000 && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedInstallmentBakeryId(b.id);
                                              setIsWeeklyInstallmentsModalOpen(true);
                                            }}
                                            className="text-[10px] text-red-700 underline hover:text-red-900 font-bold cursor-pointer"
                                          >
                                            دفعات أسبوعية
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-bold">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>خالص (0)</span>
                                      </span>
                                    )}
                                  </td>
                                )}

                                {showQuotaCols && (
                                  <>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged text-slate-800">
                                      {b.insuranceValue?.toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF]/70 text-[#0F2342] font-extrabold">
                                      {b.insuranceQuota}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged text-slate-900">
                                      {b.actualQuota}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF]/70 text-[#0F2342] font-extrabold">
                                      {b.loavesCount?.toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF]/70 text-emerald-800 font-extrabold">
                                      {Number(b.perCapitaAverage || 0).toFixed(2)}
                                    </td>
                                  </>
                                )}

                                {showDemographicsCols && (
                                  <>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged text-slate-700">
                                      {b.villagePopulation?.toLocaleString()}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        isMissingBen2023 ? 'bg-amber-50 text-amber-800' : 'text-slate-700'
                                      }`}
                                    >
                                      {b.beneficiaries2023?.toLocaleString() || 'ناقص'}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        isMissingBen2024 ? 'bg-amber-50 text-amber-800' : 'text-slate-700'
                                      }`}
                                    >
                                      {b.beneficiaries2024?.toLocaleString() || 'ناقص'}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        isMissingBen2025 ? 'bg-amber-50 text-amber-800' : 'text-slate-700'
                                      }`}
                                    >
                                      {b.beneficiaries2025?.toLocaleString() || 'ناقص'}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF]/70 text-[#1E3A8A]">
                                      {b.avg2023}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF]/70 text-[#1E3A8A]">
                                      {b.avg2024}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF]/70 text-[#1E3A8A]">
                                      {b.avg2025}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged bg-[#EFF6FF] text-[#0F2342] font-extrabold">
                                      {b.avgDiff}
                                    </td>
                                  </>
                                )}

                                {showOperationsCols && (
                                  <>
                                    <td className="py-2.5 px-2 border-l border-slate-200">
                                      <span
                                        className={`font-bold text-[11px] ${
                                          b.activityStatus === 'شغال' ? 'text-emerald-700' : 'text-red-700'
                                        }`}
                                      >
                                        {b.activityStatus}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700">
                                      {b.bakeryCategory || 'مخبز بلدي مدعم'}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700">{b.breadType}</td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged text-slate-800">
                                      {(b.flourBagPrice ?? 950).toLocaleString()} ج.م
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 num-enlarged text-[#1E3A8A]">
                                      {b.breadTypeCount || 660}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700">{b.lineType}</td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 text-slate-700">{b.fuelType}</td>
                                  </>
                                )}

                                {showContactLicenseCols && (
                                  <>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged font-mono ${
                                        isMissingPhone ? 'bg-amber-50 text-amber-800' : 'text-slate-700'
                                      }`}
                                    >
                                      {isMissingPhone ? (
                                        <span className="text-[10px] font-bold">بيانات ناقصة</span>
                                      ) : (
                                        <a
                                          href={`tel:${b.phone}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-[#1E40AF] hover:underline"
                                        >
                                          {b.phone}
                                        </a>
                                      )}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged font-mono ${
                                        isMissingNatId ? 'bg-amber-50 text-amber-800' : 'text-slate-700'
                                      }`}
                                    >
                                      {isMissingNatId ? 'بيانات ناقصة' : b.nationalId}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                                      {b.commercialRegNumber || '-'}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        !b.commercialRegDate
                                          ? 'bg-amber-50 text-amber-800'
                                          : hasCommWarning
                                          ? 'bg-red-50 text-red-700 font-bold'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {formatDateDDMMYYYY(b.commercialRegDate) || 'ناقص'}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                                      {b.bakeryLicenseNumber || '-'}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        !b.bakeryLicenseDate
                                          ? 'bg-amber-50 text-amber-800'
                                          : hasLicenseWarning
                                          ? 'bg-red-50 text-red-700 font-bold'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {formatDateDDMMYYYY(b.bakeryLicenseDate) || 'ناقص'}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 font-bold text-slate-800">
                                      {b.leaseContractType || 'إيجار'}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        !b.leaseAgreementDate
                                          ? 'bg-amber-50 text-amber-800'
                                          : hasLeaseWarning
                                          ? 'bg-red-50 text-red-700 font-bold'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {formatDateDDMMYYYY(b.leaseAgreementDate) || 'ناقص'}
                                    </td>
                                    <td className="py-2.5 px-2 border-l border-slate-200 font-mono text-slate-700">
                                      {b.taxCardNumber || '-'}
                                    </td>
                                    <td
                                      className={`py-2.5 px-2 border-l border-slate-200 num-enlarged ${
                                        !b.taxCardDate
                                          ? 'bg-amber-50 text-amber-800'
                                          : hasTaxWarning
                                          ? 'bg-red-50 text-red-700 font-bold'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      {formatDateDDMMYYYY(b.taxCardDate) || 'ناقص'}
                                    </td>
                                  </>
                                )}

                                <td className="py-2 px-2 no-print text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDetailsBakery(b);
                                      }}
                                      className="p-1.5 text-[#1E40AF] hover:bg-blue-100 rounded-lg transition cursor-pointer"
                                      title="عرض تفصيلي لبيانات ومعادلات المخبز"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>

                                    {appState.currentUser?.role !== 'viewer' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setBakeryToEdit(b);
                                            setIsBakeryModalOpen(true);
                                          }}
                                          className="p-1.5 text-slate-700 hover:text-[#0F2342] hover:bg-slate-200 rounded-lg transition cursor-pointer"
                                          title="تعديل بيانات المخبز"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteBakery(b.id, b.bakeryOwnerName);
                                          }}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                          title="حذف المخبز"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          };

                          // Helper to render Local Unit Subtotal Row (إجمالي الوحدة المحلية مع ذكر اسم الوحدة المحلية)
                          const renderLocalUnitSubtotalRow = (uGroup: any) => (
                            <tr
                              key={`utotal-${uGroup.village}-${uGroup.localUnit}`}
                              className="village-total-row bg-[#DBEAFE] text-[#0F2342] font-black border-t-2 border-b-2 border-sky-400 shadow-xs text-xs"
                            >
                              <td className="py-2.5 px-2 border-l border-sky-300 text-[#0369A1] font-extrabold">∑</td>
                              {showBasicCols && (
                                <>
                                  <td className="py-2.5 px-2.5 border-l border-sky-300 text-right font-black text-[#0F2342]">
                                    إجمالي الوحدة المحلية ({uGroup.localUnit}) — قرية {uGroup.village}
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged text-[#1E3A8A]">
                                    {uGroup.bakeryCount} مخبز
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 font-bold">{uGroup.village}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 font-bold">{uGroup.localUnit}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 font-bold">-</td>
                                </>
                              )}
                              {showDebtCol && (
                                <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-rose-700">
                                  {uGroup.remainingDebt > 0 ? `${uGroup.remainingDebt.toLocaleString()} ج.م` : 'خالص (0)'}
                                </td>
                              )}
                              {showQuotaCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{uGroup.insuranceValue?.toLocaleString()} ج.م</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-[#0F2342] bg-sky-200/60">
                                    {uGroup.insuranceQuota?.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{uGroup.actualQuota?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-[#0F2342] bg-sky-200/60">
                                    {uGroup.loavesCount?.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-emerald-800 bg-sky-200/60">
                                    {uGroup.perCapitaAverage}
                                  </td>
                                </>
                              )}
                              {showDemographicsCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{uGroup.villagePopulation?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{uGroup.beneficiaries2023?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{uGroup.beneficiaries2024?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{uGroup.beneficiaries2025?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged bg-sky-200/60 text-[#1E3A8A]">{uGroup.avg2023}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged bg-sky-200/60 text-[#1E3A8A]">{uGroup.avg2024}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged bg-sky-200/60 text-[#1E3A8A]">{uGroup.avg2025}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-amber-900 bg-sky-200/80">{uGroup.avgDiff}</td>
                                </>
                              )}
                              {showOperationsCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-bold">{uGroup.activitySummaryLabel}</td>
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                </>
                              )}
                              {showContactLicenseCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-2.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                </>
                              )}
                              <td className="py-2.5 px-2 no-print blackout-summary-cell bg-black" />
                            </tr>
                          );

                          if (groupingViewMode === 'HIERARCHICAL') {
                            const elements: React.ReactNode[] = [];
                            let pageRunningIndex = (safeCurrentPage - 1) * pageSize;

                            hierarchicalGroups.forEach((uGroup) => {
                              uGroup.bakeries.forEach((b) => {
                                pageRunningIndex++;
                                elements.push(renderBakeryRow(b, pageRunningIndex));
                              });
                              elements.push(renderLocalUnitSubtotalRow(uGroup));
                            });

                            return elements;
                          } else {
                            return paginatedBakeries.map((b, idx) => {
                              const globalIndex = (safeCurrentPage - 1) * pageSize + idx + 1;
                              return renderBakeryRow(b, globalIndex);
                            });
                          }
                        })()
                      )}
                    </tbody>

                    {/* Dedicated Sticky Summary Footer ("صف الإجماليات TOTAL SUMMARY") — Sums ALL Local Unit Rows Across Villages */}
                    {sortedBakeries.length > 0 && (
                      <tfoot className="sticky bottom-0 z-20 bg-[#051124] text-amber-300 font-extrabold border-t-4 border-amber-500 shadow-xl text-xs">
                        {(() => {
                          return (
                            <tr className="total-summary-row">
                              <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-amber-400 font-black text-sm">🏛️</td>
                              {showBasicCols && (
                                <>
                                  <td className="py-3.5 px-2.5 border-l border-[#1E3A5F] text-right font-black text-amber-300 text-xs sm:text-sm">
                                    صف الإجماليات TOTAL SUMMARY ({grandTotals.uniqueUnitsCount} وحدة محلية • {grandTotals.bakeryCount} مخبز)
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.bakeryCount} ماكينة / مخبز
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-amber-200 font-black">
                                    {grandTotals.uniqueVillagesLabel}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-amber-200 font-black">
                                    {grandTotals.uniqueUnitsLabel}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-amber-200 font-black">
                                    -
                                  </td>
                                </>
                              )}
                              {showDebtCol && (
                                <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-rose-300 text-sm">
                                  {grandTotals.remainingDebt > 0
                                    ? `${grandTotals.remainingDebt.toLocaleString()} ج.م`
                                    : 'خالص (0 ج.م)'}
                                </td>
                              )}
                              {showQuotaCols && (
                                <>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.insuranceValue.toLocaleString()} ج.م
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-amber-300 bg-[#0F2342]">
                                    {grandTotals.insuranceQuota.toLocaleString()} شيكارة
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.actualQuota.toLocaleString()} شيكارة
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-amber-300 bg-[#0F2342]">
                                    {grandTotals.loavesCount.toLocaleString()} رغيف
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-emerald-300 bg-[#0F2342]">
                                    {grandTotals.perCapitaAverage}
                                  </td>
                                </>
                              )}
                              {showDemographicsCols && (
                                <>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.villagePopulation.toLocaleString()}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.beneficiaries2023.toLocaleString()}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.beneficiaries2024.toLocaleString()}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {grandTotals.beneficiaries2025.toLocaleString()}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged bg-[#0F2342] text-sky-200">
                                    {grandTotals.avg2023}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged bg-[#0F2342] text-sky-200">
                                    {grandTotals.avg2024}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged bg-[#0F2342] text-sky-200">
                                    {grandTotals.avg2025}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-amber-400 bg-[#162F57]">
                                    {grandTotals.avgDiff}
                                  </td>
                                </>
                              )}
                              {showOperationsCols && (
                                <>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-bold">
                                    {grandTotals.activitySummaryLabel}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                </>
                              )}
                              {showContactLicenseCols && (
                                <>
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                  <td className="py-3.5 px-2 border-l border-neutral-800 blackout-summary-cell bg-black" />
                                </>
                              )}
                              <td className="py-3.5 px-2 no-print blackout-summary-cell bg-black" />
                            </tr>
                          );
                        })()}
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination & Page Size Control Bar */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
                  <div className="flex items-center gap-2 text-slate-600 font-semibold">
                    <span>
                      عرض السجلات من{' '}
                      <strong className="font-mono text-[#0F2342]">
                        {sortedBakeries.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
                      </strong>{' '}
                      إلى{' '}
                      <strong className="font-mono text-[#0F2342]">
                        {Math.min(safeCurrentPage * pageSize, sortedBakeries.length)}
                      </strong>{' '}
                      من إجمالي <strong className="font-mono text-[#0F2342]">{sortedBakeries.length}</strong> مخبز
                    </span>

                    <span aria-hidden="true">·</span>

                    <label className="flex items-center gap-1.5">
                      <span>عدد السجلات بالصفحة:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="px-2 py-1 bg-white border border-slate-300 rounded-md font-mono font-bold text-slate-800 cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={9999}>الكل ({sortedBakeries.length})</option>
                      </select>
                    </label>
                  </div>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700 cursor-pointer flex items-center gap-1"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      <span>السابق</span>
                    </button>

                    <span className="px-3 py-1 font-mono font-bold text-[#0F2342]">
                      صفحة {safeCurrentPage} من {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700 cursor-pointer flex items-center gap-1"
                    >
                      <span>التالي</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Weighted Annual Averages Summary Footer */}
                {annualWeightedSummary && (
                  <div className="px-4 py-3 bg-[#EFF6FF] border-t border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs text-[#0F2342]">
                    <div className="flex items-center gap-2 font-extrabold">
                      <Calculator className="w-4 h-4 text-[#1E40AF]" />
                      <span>المتوسط السنوي العام المرجح ({annualWeightedSummary.rows.length} مخبز):</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono font-bold text-[11px] tabular-nums">
                      <span>إجمالي الأرغفة: {annualWeightedSummary.totalLoaves.toLocaleString()}</span>
                      <span aria-hidden="true">·</span>
                      <span>عام 2023: {annualWeightedSummary.weightedGeneralAvg2023}</span>
                      <span aria-hidden="true">·</span>
                      <span>عام 2024: {annualWeightedSummary.weightedGeneralAvg2024}</span>
                      <span aria-hidden="true">·</span>
                      <span>عام 2025: {annualWeightedSummary.weightedGeneralAvg2025}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-800">
                        الفرق التراكمي: {annualWeightedSummary.cumulativeWeightedDiff2025vs2023}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* 4. Clean Official Footer */}
      <footer className="bg-white text-slate-600 border-t border-slate-200 py-3.5 px-4 text-center text-xs font-semibold no-print mt-auto">
        <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <p>
            {appState.systemConfig.governorateTitle} · {appState.systemConfig.directorateTitle} ·{' '}
            {appState.systemConfig.administrationTitle}
          </p>
          <p className="text-[#0F2342] font-bold">
            تنفيذ وتصميم م/ أحمد الحسيني - تليفون: 01004414038
          </p>
        </div>
      </footer>

      {/* Detailed Bakery Profile Modal (عرض تفصيلي لكل مخبز) */}
      <BakeryDetailsModal
        isOpen={!!detailsBakery}
        onClose={() => setDetailsBakery(null)}
        bakery={detailsBakery}
        debts={appState.debts}
        columnTitles={appState.columnTitles}
        canEdit={appState.currentUser?.role !== 'viewer'}
        onEditBakery={(bakery) => {
          setBakeryToEdit(bakery);
          setIsBakeryModalOpen(true);
        }}
        onJumpToDebts={(bakeryId) => {
          setDebtFilterBakeryId(bakeryId);
          setActiveTab('debts');
        }}
      />

      {/* MODALS */}
      {/* 1. Add / Edit Bakery Modal */}
      {isBakeryModalOpen && (
        <BakeryModal
          isOpen={isBakeryModalOpen}
          onClose={() => setIsBakeryModalOpen(false)}
          bakeryToEdit={bakeryToEdit}
          existingBakeries={appState.bakeries}
          villages={appState.villages}
          activityStatuses={appState.activityStatuses}
          bakeryCategories={appState.bakeryCategories}
          breadTypes={appState.breadTypes}
          breadTypeCounts={appState.breadTypeCounts}
          lineTypes={appState.lineTypes}
          fuelTypes={appState.fuelTypes}
          leaseContractTypes={appState.leaseContractTypes}
          responsibleManagerOptions={appState.responsibleManagerOptions}
          currentUser={appState.currentUser}
          onAddActivityStatus={(newStatus) => {
            if (!appState.activityStatuses.includes(newStatus)) {
              const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
              const updatedStatuses = [...appState.activityStatuses, newStatus];
              commitRowMutation({
                nextState: { ...appState, activityStatuses: updatedStatuses },
                table: 'dropdown_lists',
                branchId,
                toastMessage: 'تم إضافة حالة النشاط الجديدة وحفظها في قاعدة البيانات بنجاح',
                executeDb: async () => {
                  const res = await saveRowToDb({
                    table: 'dropdown_lists',
                    branchId,
                    row: {
                      id: `${branchId}__activityStatuses`,
                      branchId,
                      listKey: 'activityStatuses',
                      options: updatedStatuses,
                    },
                    operation: 'UPDATE',
                  });
                  await saveRowToDb({
                    table: 'system_config',
                    branchId,
                    row: {
                      branchId,
                      systemConfig: appState.systemConfig,
                      columnTitles: appState.columnTitles,
                      activityStatuses: updatedStatuses,
                    },
                    operation: 'UPDATE',
                  }).catch(() => {});
                  return res;
                },
              });
            }
          }}
          onAddLocalUnit={(villageName, newUnit) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const existingVillage = appState.villages.find((v) => v.village === villageName);
            const targetVillage: VillageHierarchy = existingVillage
              ? {
                  village: villageName,
                  localUnits:
                    newUnit && !existingVillage.localUnits.includes(newUnit)
                      ? [...existingVillage.localUnits, newUnit]
                      : existingVillage.localUnits,
                }
              : { village: villageName, localUnits: newUnit ? [newUnit] : [] };
            const updatedVillages = existingVillage
              ? appState.villages.map((v) => (v.village === villageName ? targetVillage : v))
              : [...appState.villages, targetVillage];
            commitRowMutation({
              nextState: { ...appState, villages: updatedVillages },
              table: 'villages',
              branchId,
              toastMessage: 'تم حفظ القرية والوحدة المحلية في قاعدة البيانات بنجاح',
              executeDb: () =>
                saveRowToDb({
                  table: 'villages',
                  branchId,
                  row: {
                    id: `${branchId}__${villageName}`,
                    branchId,
                    village: villageName,
                    localUnits: targetVillage.localUnits,
                  },
                  operation: existingVillage ? 'UPDATE' : 'INSERT',
                }),
            });
          }}
          onUpdateDropdownList={(listKey, updatedList) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            commitRowMutation({
              nextState: {
                ...appState,
                [listKey]: updatedList,
              },
              table: 'dropdown_lists',
              branchId,
              toastMessage: 'تم تحديث وحفظ القائمة المنسدلة في قاعدة البيانات بنجاح',
              executeDb: () =>
                saveRowToDb({
                  table: 'dropdown_lists',
                  branchId,
                  row: {
                    id: `${branchId}__${listKey}`,
                    branchId,
                    listKey,
                    options: updatedList,
                  },
                  operation: 'UPDATE',
                }),
            });
          }}
          onOpenMasterDropdownEditor={() => {
            setIsBakeryModalOpen(false);
            setMasterEditorInitialCategory('ALL');
            setIsMasterEditorModalOpen(true);
          }}
          onSave={handleSaveBakery}
        />
      )}

      {/* 1.1 Daily Tasks Manager Modal (إدارة المهام اليومية) */}
      {isDailyTasksModalOpen && (
        <DailyTasksModal
          isOpen={isDailyTasksModalOpen}
          onClose={() => setIsDailyTasksModalOpen(false)}
          tasks={appState.dailyTasks || []}
          bakeries={appState.bakeries}
          currentUser={appState.currentUser}
          onSaveTasks={(updatedTasks, toastMessage) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const prevTasks = appState.dailyTasks || [];
            const nextMap = new Map(updatedTasks.map((t) => [String(t.id), t]));
            const deletedTasks = prevTasks.filter((t) => !nextMap.has(String(t.id)));
            const changedTasks = updatedTasks.filter((t) => {
              const prev = prevTasks.find((p) => String(p.id) === String(t.id));
              return !prev || JSON.stringify(prev) !== JSON.stringify(t);
            });
            commitRowMutation({
              nextState: { ...appState, dailyTasks: updatedTasks },
              table: 'daily_tasks',
              branchId,
              toastMessage: toastMessage || 'تم حفظ المهام اليومية في قاعدة البيانات بنجاح',
              executeDb: async () => {
                let lastRes: DbMutationResult = { success: true };
                for (const del of deletedTasks) {
                  lastRes = await deleteRowFromDb({
                    table: 'daily_tasks',
                    id: del.id,
                    branchId,
                  });
                  if (!lastRes.success) return lastRes;
                }
                for (const chg of changedTasks) {
                  const isNew = !prevTasks.some((p) => String(p.id) === String(chg.id));
                  lastRes = await saveRowToDb({
                    table: 'daily_tasks',
                    branchId,
                    row: chg,
                    operation: isNew ? 'INSERT' : 'UPDATE',
                  });
                  if (!lastRes.success) return lastRes;
                }
                return lastRes;
              },
            });
          }}
        />
      )}

      {/* 1.2 Unified Master System & Dropdowns Editor Modal (التعديل داخل المنظومة / التعديل على جميع القوائم المنسدلة) */}
      {isMasterEditorModalOpen && (
        <SystemMasterEditorModal
          isOpen={isMasterEditorModalOpen}
          onClose={() => setIsMasterEditorModalOpen(false)}
          appState={appState}
          onUpdateState={(newState, toastMsg) => triggerSave(newState, toastMsg)}
          initialCategory={masterEditorInitialCategory}
          onOpenColumnTitles={() => {
            setIsMasterEditorModalOpen(false);
            setIsColumnModalOpen(true);
          }}
          onOpenHeaderCustomizer={() => {
            setIsMasterEditorModalOpen(false);
            setIsHeaderModalOpen(true);
          }}
          onOpenDailyReminders={() => {
            setIsMasterEditorModalOpen(false);
            setIsDailySettingsModalOpen(true);
          }}
          onOpenUsersManager={() => {
            setIsMasterEditorModalOpen(false);
            setIsUsersModalOpen(true);
          }}
          onOpenVillagesManager={() => {
            setIsMasterEditorModalOpen(false);
            setIsVillageModalOpen(true);
          }}
        />
      )}

      {/* 2. Modify Column Titles Modal */}
      {isColumnModalOpen && (
        <ColumnTitlesModal
          isOpen={isColumnModalOpen}
          onClose={() => setIsColumnModalOpen(false)}
          titles={appState.columnTitles}
          onSaveTitles={(updatedTitles) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            commitRowMutation({
              nextState: { ...appState, columnTitles: updatedTitles },
              table: 'system_config',
              branchId,
              toastMessage: 'تم حفظ وتحديث مسميات رؤوس الخانات في قاعدة البيانات بنجاح',
              executeDb: () =>
                saveRowToDb({
                  table: 'system_config',
                  branchId,
                  row: {
                    branchId,
                    systemConfig: appState.systemConfig,
                    columnTitles: updatedTitles,
                    activityStatuses: appState.activityStatuses,
                  },
                  operation: 'UPDATE',
                }),
            });
          }}
        />
      )}

      {/* 3. Automatic Expiration Alerts Modal */}
      {isAlertsModalOpen && (
        <AlertsModal
          isOpen={isAlertsModalOpen}
          onClose={() => setIsAlertsModalOpen(false)}
          bakeries={appState.bakeries}
          debts={appState.debts}
          onOpenDailySettings={() => {
            setIsAlertsModalOpen(false);
            setIsDailySettingsModalOpen(true);
          }}
          onOpenWeeklyInstallments={(bakeryId) => {
            setSelectedInstallmentBakeryId(bakeryId);
            setIsWeeklyInstallmentsModalOpen(true);
          }}
          onOpenBakeryEdit={(bakeryId) => {
            const found = appState.bakeries.find((b) => b.id === bakeryId);
            if (found) {
              setBakeryToEdit(found);
              setIsBakeryModalOpen(true);
            }
          }}
        />
      )}

      {/* 3.1 Weekly Installments Modal for Debts > 20,000 EGP */}
      {isWeeklyInstallmentsModalOpen && (
        <WeeklyInstallmentsModal
          isOpen={isWeeklyInstallmentsModalOpen}
          onClose={() => {
            setIsWeeklyInstallmentsModalOpen(false);
            setSelectedInstallmentBakeryId(undefined);
          }}
          bakeries={appState.bakeries}
          debts={appState.debts}
          systemConfig={appState.systemConfig}
          initialBakeryId={selectedInstallmentBakeryId}
          currentUser={appState.currentUser}
        />
      )}

      {/* 3.2 Activity Statuses Manager Modal */}
      {isActivityModalOpen && (
        <ActivityStatusModal
          isOpen={isActivityModalOpen}
          onClose={() => setIsActivityModalOpen(false)}
          statuses={appState.activityStatuses}
          bakeries={appState.bakeries}
          onSaveStatuses={(updatedStatuses) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            commitRowMutation({
              nextState: { ...appState, activityStatuses: updatedStatuses },
              table: 'system_config',
              branchId,
              toastMessage: 'تم حفظ وتحديث حالات نشاط المخابز في قاعدة البيانات بنجاح',
              executeDb: async () => {
                const res = await saveRowToDb({
                  table: 'system_config',
                  branchId,
                  row: {
                    branchId,
                    systemConfig: appState.systemConfig,
                    columnTitles: appState.columnTitles,
                    activityStatuses: updatedStatuses,
                  },
                  operation: 'UPDATE',
                });
                await saveRowToDb({
                  table: 'dropdown_lists',
                  branchId,
                  row: {
                    id: `${branchId}__activityStatuses`,
                    branchId,
                    listKey: 'activityStatuses',
                    options: updatedStatuses,
                  },
                  operation: 'UPDATE',
                }).catch(() => {});
                return res;
              },
            });
          }}
        />
      )}

      {/* 4. Header & System Settings Customizer Modal (includes 'إعدادات التذكير') */}
      {isHeaderModalOpen && (
        <HeaderCustomizerModal
          isOpen={isHeaderModalOpen}
          onClose={() => setIsHeaderModalOpen(false)}
          config={appState.systemConfig}
          onSaveConfig={(updatedConfig) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            commitRowMutation({
              nextState: { ...appState, systemConfig: updatedConfig },
              table: 'system_config',
              branchId,
              toastMessage: 'تم حفظ وتحديث إعدادات النظام والترويسة في قاعدة البيانات بنجاح',
              executeDb: () =>
                saveRowToDb({
                  table: 'system_config',
                  branchId,
                  row: {
                    branchId,
                    systemConfig: updatedConfig,
                    columnTitles: appState.columnTitles,
                    activityStatuses: appState.activityStatuses,
                  },
                  operation: 'UPDATE',
                }),
            });
          }}
          onOpenDailyAlertSettings={() => setIsDailySettingsModalOpen(true)}
        />
      )}

      {/* 5. Village Hierarchy Manager Modal */}
      {isVillageModalOpen && (
        <VillageManagerModal
          isOpen={isVillageModalOpen}
          onClose={() => setIsVillageModalOpen(false)}
          villages={appState.villages}
          onSaveVillages={(updatedVillages) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const prevVillages = appState.villages || [];
            const nextNames = new Set(updatedVillages.map((v) => v.village));
            const deleted = prevVillages.filter((v) => !nextNames.has(v.village));
            const changed = updatedVillages.filter((v) => {
              const prev = prevVillages.find((p) => p.village === v.village);
              return !prev || JSON.stringify(prev.localUnits) !== JSON.stringify(v.localUnits);
            });
            return commitRowMutation({
              nextState: { ...appState, villages: updatedVillages },
              table: 'villages',
              branchId,
              toastMessage: 'تم حفظ وتحديث القرى والوحدات المحلية في قاعدة البيانات بنجاح',
              executeDb: async () => {
                let lastRes: DbMutationResult = { success: true };
                for (const del of deleted) {
                  lastRes = await deleteRowFromDb({
                    table: 'villages',
                    id: `${branchId}__${del.village}`,
                    branchId,
                  });
                  if (!lastRes.success) return lastRes;
                }
                for (const chg of changed) {
                  const isNew = !prevVillages.some((p) => p.village === chg.village);
                  lastRes = await saveRowToDb({
                    table: 'villages',
                    branchId,
                    row: {
                      id: `${branchId}__${chg.village}`,
                      branchId,
                      village: chg.village,
                      localUnits: chg.localUnits,
                    },
                    operation: isNew ? 'INSERT' : 'UPDATE',
                  });
                  if (!lastRes.success) return lastRes;
                }
                return lastRes;
              },
            });
          }}
        />
      )}

      {/* 6. Landscape A4 Reporting Center Modal */}
      {isReportModalOpen && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          bakeries={appState.bakeries}
          debts={appState.debts}
          villages={appState.villages}
          columnTitles={appState.columnTitles}
          systemConfig={appState.systemConfig}
          currentUser={appState.currentUser}
          users={appState.users}
          initialReportType={reportModalInitialTab}
        />
      )}

      {/* 7. Backup & Partition & Google Drive & Factory Reset Modal */}
      {isBackupModalOpen && (
        <BackupModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          currentState={appState}
          onRestoreState={(restored) => triggerSave(restored, 'تم استعادة وتطبيق قاعدة البيانات بنجاح')}
          onFactoryReset={async () => {
            await clearSupabaseDatabaseData().catch(() => {});
            await factoryReset();
            setHighDebtNotifications([]);
            setAppState((prev) =>
              prev
                ? {
                    ...prev,
                    bakeries: [],
                    debts: [],
                    dailyTasks: [],
                  }
                : prev
            );
          }}
        />
      )}

      {/* 7.1 Publish and Cloud Deploy Engine Modal */}
      {isPublishModalOpen && (
        <PublishModal
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          currentState={appState}
        />
      )}

      {/* 8. Users & Inspectors Manager Modal (Strictly Isolated per Supply Administration / Branch) */}
      {isUsersModalOpen && (
        <UsersManagerModal
          isOpen={isUsersModalOpen}
          onClose={() => setIsUsersModalOpen(false)}
          branchName={appState.systemConfig.administrationTitle}
          users={appState.users}
          currentUser={appState.currentUser}
          onAddUser={async (newUser) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const scopedUser: AppUser = {
              ...newUser,
              branchId,
              department: newUser.department || appState.systemConfig.administrationTitle,
            };
            const updatedUsers = sanitizeBranchUsers(
              [...appState.users, scopedUser],
              branchId,
              appState.systemConfig.administrationTitle
            );
            const res = await commitRowMutation({
              nextState: { ...appState, users: updatedUsers },
              table: 'app_users',
              branchId,
              toastMessage: `تم إضافة وحفظ المستخدم (${scopedUser.username}) في قاعدة البيانات ومزامنته لجميع الأجهزة`,
              executeDb: () =>
                saveRowToDb({
                  table: 'app_users',
                  branchId,
                  row: scopedUser,
                  operation: 'INSERT',
                }),
            });
            if (res.success || res.queuedOffline) {
              saveBranchAuthVault(branchId, {
                branchName: appState.systemConfig.administrationTitle,
                users: updatedUsers,
                rolePermissions: appState.systemConfig.rolePermissions,
                roleLabels: appState.systemConfig.roleLabels,
                customRoles: appState.systemConfig.customRoles,
              });
            }
            return res;
          }}
          onUpdateUser={async (updatedUser) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const scopedUser: AppUser = { ...updatedUser, branchId };
            const updatedUsers = sanitizeBranchUsers(
              appState.users.map((u) => (u.id === scopedUser.id ? scopedUser : u)),
              branchId,
              appState.systemConfig.administrationTitle
            );
            const isCurrent = appState.currentUser?.id === scopedUser.id;
            const res = await commitRowMutation({
              nextState: {
                ...appState,
                users: updatedUsers,
                currentUser: isCurrent ? scopedUser : appState.currentUser,
              },
              table: 'app_users',
              branchId,
              toastMessage: `تم حفظ تعديل بيانات الحساب (${scopedUser.fullName}) والصلاحيات ومزامنته لجميع الأجهزة`,
              executeDb: () =>
                saveRowToDb({
                  table: 'app_users',
                  branchId,
                  row: scopedUser,
                  operation: 'UPDATE',
                }),
            });
            if (res.success || res.queuedOffline) {
              if (isCurrent) saveSessionUser(scopedUser);
              saveBranchAuthVault(branchId, {
                branchName: appState.systemConfig.administrationTitle,
                users: updatedUsers,
                rolePermissions: appState.systemConfig.rolePermissions,
                roleLabels: appState.systemConfig.roleLabels,
                customRoles: appState.systemConfig.customRoles,
              });
            }
            return res;
          }}
          onDeleteUser={async (userId) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const updatedUsers = sanitizeBranchUsers(
              appState.users.filter((u) => u.id !== userId),
              branchId,
              appState.systemConfig.administrationTitle
            );
            const res = await commitRowMutation({
              nextState: { ...appState, users: updatedUsers },
              table: 'app_users',
              branchId,
              toastMessage: `تم حذف المستخدم من قاعدة البيانات ومزامنة التحديث لجميع الأجهزة`,
              executeDb: () =>
                deleteRowFromDb({
                  table: 'app_users',
                  id: userId,
                  branchId,
                }),
            });
            if (res.success || res.queuedOffline) {
              saveBranchAuthVault(branchId, {
                branchName: appState.systemConfig.administrationTitle,
                users: updatedUsers,
                rolePermissions: appState.systemConfig.rolePermissions,
                roleLabels: appState.systemConfig.roleLabels,
                customRoles: appState.systemConfig.customRoles,
              });
            }
            return res;
          }}
        />
      )}

      {/* 8.1 Advanced Role Permissions & Users Management Modal (إعدادات الصلاحيات المتقدمة في SystemConfig - مستقلة لكل إدارة) */}
      {isAdvancedPermissionsModalOpen && (
        <AdvancedPermissionsModal
          isOpen={isAdvancedPermissionsModalOpen}
          onClose={() => setIsAdvancedPermissionsModalOpen(false)}
          systemConfig={appState.systemConfig}
          onSaveSystemConfig={(updatedConfig: SystemConfig) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            saveBranchAuthVault(branchId, {
              branchName: appState.systemConfig.administrationTitle,
              users: appState.users,
              rolePermissions: updatedConfig.rolePermissions,
              roleLabels: updatedConfig.roleLabels,
              customRoles: updatedConfig.customRoles,
            });
            commitRowMutation({
              nextState: { ...appState, systemConfig: updatedConfig },
              table: 'system_config',
              branchId,
              toastMessage: `تم حفظ إعدادات الصلاحيات المتقدمة والأدوار لـ (${appState.systemConfig.administrationTitle}) ومزامنتها لجميع الأجهزة`,
              executeDb: () =>
                saveRowToDb({
                  table: 'system_config',
                  branchId,
                  row: {
                    branchId,
                    systemConfig: updatedConfig,
                    columnTitles: appState.columnTitles,
                    activityStatuses: appState.activityStatuses,
                  },
                  operation: 'UPDATE',
                }),
            });
          }}
          users={appState.users}
          currentUser={appState.currentUser}
          onAddUser={async (newUser) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const scopedUser: AppUser = {
              ...newUser,
              branchId,
              department: newUser.department || appState.systemConfig.administrationTitle,
            };
            const updatedUsers = sanitizeBranchUsers(
              [...appState.users, scopedUser],
              branchId,
              appState.systemConfig.administrationTitle
            );
            const res = await commitRowMutation({
              nextState: { ...appState, users: updatedUsers },
              table: 'app_users',
              branchId,
              toastMessage: `تم إضافة وحفظ المستخدم الجديد (${scopedUser.fullName}) في قاعدة البيانات ومزامنته لجميع الأجهزة`,
              executeDb: () =>
                saveRowToDb({
                  table: 'app_users',
                  branchId,
                  row: scopedUser,
                  operation: 'INSERT',
                }),
            });
            if (res.success || res.queuedOffline) {
              saveBranchAuthVault(branchId, {
                branchName: appState.systemConfig.administrationTitle,
                users: updatedUsers,
                rolePermissions: appState.systemConfig.rolePermissions,
                roleLabels: appState.systemConfig.roleLabels,
                customRoles: appState.systemConfig.customRoles,
              });
            }
            return res;
          }}
          onUpdateUser={async (updatedUser) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const scopedUser: AppUser = { ...updatedUser, branchId };
            const updatedUsers = sanitizeBranchUsers(
              appState.users.map((u) => (u.id === scopedUser.id ? scopedUser : u)),
              branchId,
              appState.systemConfig.administrationTitle
            );
            const isCurrent = appState.currentUser?.id === scopedUser.id;
            const res = await commitRowMutation({
              nextState: {
                ...appState,
                users: updatedUsers,
                currentUser: isCurrent ? scopedUser : appState.currentUser,
              },
              table: 'app_users',
              branchId,
              toastMessage: `تم حفظ تعديل بيانات الحساب (${scopedUser.fullName}) واليوزر والباسورد ومزامنته لجميع الأجهزة`,
              executeDb: () =>
                saveRowToDb({
                  table: 'app_users',
                  branchId,
                  row: scopedUser,
                  operation: 'UPDATE',
                }),
            });
            if (res.success || res.queuedOffline) {
              if (isCurrent) saveSessionUser(scopedUser);
              saveBranchAuthVault(branchId, {
                branchName: appState.systemConfig.administrationTitle,
                users: updatedUsers,
                rolePermissions: appState.systemConfig.rolePermissions,
                roleLabels: appState.systemConfig.roleLabels,
                customRoles: appState.systemConfig.customRoles,
              });
            }
            return res;
          }}
          onDeleteUser={async (userId) => {
            const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
            const updatedUsers = sanitizeBranchUsers(
              appState.users.filter((u) => u.id !== userId),
              branchId,
              appState.systemConfig.administrationTitle
            );
            const res = await commitRowMutation({
              nextState: { ...appState, users: updatedUsers },
              table: 'app_users',
              branchId,
              toastMessage: `تم حذف المستخدم من قاعدة البيانات ومزامنة القائمة لجميع الأجهزة`,
              executeDb: () =>
                deleteRowFromDb({
                  table: 'app_users',
                  id: userId,
                  branchId,
                }),
            });
            if (res.success || res.queuedOffline) {
              saveBranchAuthVault(branchId, {
                branchName: appState.systemConfig.administrationTitle,
                users: updatedUsers,
                rolePermissions: appState.systemConfig.rolePermissions,
                roleLabels: appState.systemConfig.roleLabels,
                customRoles: appState.systemConfig.customRoles,
              });
            }
            return res;
          }}
        />
      )}

      {/* 9. Comprehensive Math & Code Audit Verification Modal */}
      {isAuditModalOpen && (
        <AuditModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          bakeries={appState.bakeries}
          debts={appState.debts}
          systemConfig={appState.systemConfig}
        />
      )}

      {/* 10. Interactive Annual Budget Frequency & 12-Month Breakdown Modal */}
      {isBudgetFrequencyModalOpen && (
        <AnnualBudgetFrequencyModal
          isOpen={isBudgetFrequencyModalOpen}
          onClose={() => setIsBudgetFrequencyModalOpen(false)}
          bakeries={appState.bakeries}
          flourBagPrice={flourBagPrice}
          onUpdateFlourBagPrice={(price) => setFlourBagPrice(price)}
          systemConfig={appState.systemConfig}
          currentUser={appState.currentUser}
        />
      )}

      {/* 11. Statistical Summary by Local Unit Modal (ملخص إحصائي) */}
      {isLocalUnitsModalOpen && (
        <LocalUnitsSummaryModal
          isOpen={isLocalUnitsModalOpen}
          onClose={() => setIsLocalUnitsModalOpen(false)}
          bakeries={appState.bakeries}
          debts={appState.debts}
          villages={appState.villages}
          systemConfig={appState.systemConfig}
          onNavigateToBakeries={(localUnit) => {
            setActiveTab('bakeries');
            setSelectedUnit(localUnit);
          }}
          onNavigateToDebts={(localUnit) => {
            setActiveTab('debts');
            setSelectedUnit(localUnit);
          }}
        />
      )}

      {/* 12. Daily Alert & Reminder Settings Modal (إعدادات التنبيه اليومي والتذكير) */}
      {isDailySettingsModalOpen && (
        <DailyAlertSettingsModal
          isOpen={isDailySettingsModalOpen}
          onClose={() => setIsDailySettingsModalOpen(false)}
          config={
            appState.systemConfig?.dailyAlertConfig || {
              enabled: true,
              alertTime: '09:00',
              notifyBrowser: true,
              notifySound: true,
              targetDocs: ['bakeryLicenseDate', 'commercialRegDate', 'leaseAgreementDate', 'taxCardDate'],
              daysThreshold: 15,
            }
          }
          bakeries={appState.bakeries}
          currentUser={appState.currentUser}
          onSaveConfig={handleSaveDailyAlertConfig}
          onTriggerTestAlert={handleTriggerTestAlert}
        />
      )}

      {/* 13. Daily Alert Notification Popup Modal */}
      {dailyNotificationData.isOpen && (
        <DailyAlertNotificationModal
          isOpen={dailyNotificationData.isOpen}
          onClose={() => setDailyNotificationData((prev) => ({ ...prev, isOpen: false }))}
          expiredBakeries={dailyNotificationData.expiredBakeries}
          alertTime={dailyNotificationData.alertTime}
          onViewInBakeriesTable={() => {
            setDailyNotificationData((prev) => ({ ...prev, isOpen: false }));
            setActiveTab('bakeries');
          }}
          onOpenAlertsCenter={() => {
            setDailyNotificationData((prev) => ({ ...prev, isOpen: false }));
            setIsAlertsModalOpen(true);
          }}
        />
      )}

      {/* 14. Inbox Chat & Administrative Instructions Modal (صندوق الوارد) */}
      <InboxChatModal
        isOpen={isInboxModalOpen}
        onClose={() => setIsInboxModalOpen(false)}
        currentUser={appState.currentUser}
        users={appState.users}
        bakeries={appState.bakeries}
        messages={inboxMessages}
        onSendMessage={handleSendInboxMessage}
        onDeleteMessage={handleDeleteInboxMessage}
        onMarkAllRead={handleMarkAllInboxRead}
      />

      {/* 15. Daily Database Entry Comprehensive Briefing Modal (شاشة التنبيه اليومي للمديونيات والتراخيص والعقود المنتهية) */}
      <DailyEntryBriefingModal
        isOpen={isDailyBriefingModalOpen}
        onClose={() => setIsDailyBriefingModalOpen(false)}
        bakeries={appState.bakeries}
        debts={appState.debts}
        expiryLeadDays={appState.systemConfig?.dailyAlertConfig?.daysThreshold || 30}
        onJumpToDebtsView={() => {
          setActiveTab('debts');
          setDebtFilterBakeryId(undefined);
        }}
        onOpenAlertsModal={() => setIsAlertsModalOpen(true)}
        onOpenInboxModal={() => setIsInboxModalOpen(true)}
        onEditBakery={(bakery) => {
          setBakeryToEdit(bakery);
          setIsBakeryModalOpen(true);
        }}
        unreadInboxCount={unreadInboxCount}
      />

      {/* 16. ERP Display & Column Group Settings Modal (إعدادات العرض تحت قسم التعديلات) */}
      {isDisplaySettingsModalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 cursor-pointer no-print"
          onClick={() => setIsDisplaySettingsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border-2 border-[#0F2342] w-full max-w-2xl p-6 cursor-default space-y-5"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#0F2342] text-amber-300">
                  <Eye className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0F2342]">
                    إعدادات العرض وتنظيم الجداول (قسم التعديلات)
                  </h3>
                  <p className="text-xs font-bold text-slate-500">
                    التحكم المركزي في نمط العرض والتجميع الهرمي ومجموعات الأعمدة لجدولي المخابز والمديونيات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDisplaySettingsModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. Bakeries Grouping Mode */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="font-black text-[#0F2342] block">
                  1. نمط تجميع صفوف جدول المخابز (الإجماليات الفرعية حسب القرية والوحدة المحلية):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGroupingViewMode('HIERARCHICAL')}
                    className={`p-3 rounded-xl border text-right font-black transition cursor-pointer ${
                      groupingViewMode === 'HIERARCHICAL'
                        ? 'bg-[#0F2342] text-amber-300 border-[#0F2342] shadow-md'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div>تجميع حسب الوحدة المحلية (صف إجمالي الوحدة المحلية ← صف الإجماليات)</div>
                    <div className="text-[10px] font-bold opacity-80 mt-0.5">
                      يعرض صف إجمالي الوحدة المحلية وسط الجدول + صف الإجماليات TOTAL SUMMARY لتوتال القرية بالكامل
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupingViewMode('FLAT')}
                    className={`p-3 rounded-xl border text-right font-black transition cursor-pointer ${
                      groupingViewMode === 'FLAT'
                        ? 'bg-[#0F2342] text-amber-300 border-[#0F2342] shadow-md'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div>عرض مسطح بنظام الصفحات (بدون فواصل فرعية)</div>
                    <div className="text-[10px] font-bold opacity-80 mt-0.5">
                      يعرض المخابز متتالية مع صف الإجماليات TOTAL SUMMARY بالأسفل
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Bakeries Column View Mode */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="font-black text-[#0F2342] block">
                  2. نطاق عرض أعمدة جدول المخابز (مع ثبات الأعمدة الـ 4 الأساسية دائماً):
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'ALL', label: 'كافة الأعمدة (شامل)' },
                      { id: 'BASIC', label: 'البيانات الأساسية والتراخيص' },
                      { id: 'BREAD', label: 'أنواع الخبز والتشغيل' },
                      { id: 'QUOTAS', label: 'الحصص الفعلية والأرغفة' },
                      { id: 'INSURANCE', label: 'المبالغ والحصص التأمينية' },
                      { id: 'BENEFICIARIES', label: 'بيانات المستفيدين (2023-2025)' },
                      { id: 'EQUATIONS', label: 'الحسابات والمعادلات السبع ∑' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setColumnViewMode(mode.id)}
                      className={`px-3 py-2 rounded-xl font-black transition cursor-pointer border ${
                        columnViewMode === mode.id
                          ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Debts Column Group Mode */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="font-black text-[#0F2342] block">
                  3. نطاق عرض أعمدة جدول سجل المديونيات (مع ثبات الأعمدة الـ 4 الأساسية دائماً):
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'ALL', label: 'كافة أعمدة المديونيات (شامل)' },
                      { id: 'SUMMARY', label: 'العرض المالي المختصر' },
                      { id: 'VIOLATIONS', label: 'المخالفات وسدادها فقط' },
                      { id: 'ADDED_DISPOSAL', label: 'المضاف والتصرف وسدادهما' },
                    ] as const
                  ).map((dMode) => (
                    <button
                      key={dMode.id}
                      type="button"
                      onClick={() => setDebtsColumnGroup(dMode.id)}
                      className={`px-3 py-2 rounded-xl font-black transition cursor-pointer border ${
                        debtsColumnGroup === dMode.id
                          ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {dMode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Page Sizes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="font-black text-[#0F2342] block mb-1.5">
                    عدد السجلات بالصفحة (جدول المخابز):
                  </label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
                  >
                    <option value={15}>15 مخبز بالصفحة</option>
                    <option value={25}>25 مخبز بالصفحة</option>
                    <option value={50}>50 مخبز بالصفحة</option>
                    <option value={100}>100 مخبز بالصفحة</option>
                    <option value={500}>عرض الكل (500)</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="font-black text-[#0F2342] block mb-1.5">
                    عدد القيود بالصفحة (جدول سجل المديونيات):
                  </label>
                  <select
                    value={debtsPageSize}
                    onChange={(e) => setDebtsPageSize(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
                  >
                    <option value={25}>25 قيد بالصفحة</option>
                    <option value={50}>50 قيد بالصفحة</option>
                    <option value={100}>100 قيد بالصفحة</option>
                    <option value={500}>عرض الكل (500)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setIsDisplaySettingsModalOpen(false);
                  setIsColumnModalOpen(true);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#0F2342] border border-slate-300 rounded-xl text-xs font-black cursor-pointer"
              >
                فتح إعدادات ومسميات الأعمدة...
              </button>
              <button
                type="button"
                onClick={() => setIsDisplaySettingsModalOpen(false)}
                className="px-6 py-2.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-amber-300 rounded-xl text-xs font-black cursor-pointer shadow-md"
              >
                تطبيق إعدادات العرض والعودة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Floating Save / Queue / Error Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-md animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`text-white border-2 rounded-2xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md ring-4 ${
              saveToast.variant === 'error'
                ? 'bg-gradient-to-r from-slate-950 via-red-950 to-slate-900 border-red-400 ring-red-500/20'
                : saveToast.variant === 'warning'
                ? 'bg-gradient-to-r from-slate-950 via-amber-950 to-slate-900 border-amber-400 ring-amber-500/20'
                : 'bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 border-emerald-400 ring-emerald-500/20'
            }`}
          >
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                saveToast.variant === 'error'
                  ? 'bg-red-500/20 border-red-400/50 text-red-300'
                  : saveToast.variant === 'warning'
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              }`}
            >
              {saveToast.variant === 'error' || saveToast.variant === 'warning' ? (
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-6 h-6 animate-pulse" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4
                  className={`text-xs font-black ${
                    saveToast.variant === 'error'
                      ? 'text-red-300'
                      : saveToast.variant === 'warning'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {saveToast.variant === 'error'
                    ? 'تعذر الحفظ — تم التراجع محلياً'
                    : saveToast.variant === 'warning'
                    ? 'محفوظ في قائمة انتظار المزامنة (غير متصل)'
                    : 'تم الحفظ والمزامنة مع Supabase بنجاح'}
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">{saveToast.timestamp}</span>
              </div>
              <p className="text-xs font-bold text-slate-100 mt-0.5 leading-snug">
                {saveToast.message}
              </p>
            </div>
            <button
              onClick={() => setSaveToast(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Admin Manager Notifications Drawer Sidebar */}
      <AdminNotificationsDrawer
        isOpen={isAdminDrawerOpen}
        onClose={() => setIsAdminDrawerOpen(false)}
        notifications={highDebtNotifications}
        debtAlertThreshold={
          appState.systemConfig?.debtAlertThreshold ?? DEFAULT_DEBT_ALERT_THRESHOLD
        }
        onUpdateThreshold={(newThreshold) => {
          const branchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
          const nextConfig: SystemConfig = {
            ...appState.systemConfig,
            debtAlertThreshold: newThreshold,
          };
          const updatedState: AppState = {
            ...appState,
            systemConfig: nextConfig,
          };
          syncHighDebtAlertsToSupabase(highDebtNotifications, newThreshold).catch(() => {});
          commitRowMutation({
            nextState: updatedState,
            table: 'system_config',
            branchId,
            toastMessage: `تم تحديث حد التنبيه التلقائي للمديونية إلى (${newThreshold.toLocaleString('en-US')} ج.م) في قاعدة البيانات بنجاح`,
            executeDb: () =>
              saveRowToDb({
                table: 'system_config',
                branchId,
                row: {
                  branchId,
                  systemConfig: nextConfig,
                  columnTitles: appState.columnTitles,
                  activityStatuses: appState.activityStatuses,
                },
                operation: 'UPDATE',
              }),
          });
        }}
        onMarkAsRead={(id) => {
          const threshold =
            appState.systemConfig?.debtAlertThreshold ?? DEFAULT_DEBT_ALERT_THRESHOLD;
          setHighDebtNotifications((prev) => {
            const updated = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
            try {
              localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
            } catch {}
            syncHighDebtAlertsToSupabase(updated, threshold).catch(() => {});
            return updated;
          });
        }}
        onMarkAllAsRead={() => {
          const threshold =
            appState.systemConfig?.debtAlertThreshold ?? DEFAULT_DEBT_ALERT_THRESHOLD;
          setHighDebtNotifications((prev) => {
            const updated = prev.map((n) => ({ ...n, isRead: true }));
            try {
              localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
            } catch {}
            syncHighDebtAlertsToSupabase(updated, threshold).catch(() => {});
            return updated;
          });
        }}
        onClearAll={() => {
          const threshold =
            appState.systemConfig?.debtAlertThreshold ?? DEFAULT_DEBT_ALERT_THRESHOLD;
          setHighDebtNotifications([]);
          try {
            localStorage.removeItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS');
          } catch {}
          clearHighDebtAlertsInSupabase(threshold).catch(() => {});
        }}
        onSelectBakeryDebt={(bakeryId) => {
          setDebtFilterBakeryId(bakeryId);
          setActiveTab('debts');
        }}
      />

      {/* Google Workspace Integration Modal (Google Calendar, Google Tasks, Google Forms) */}
      <GoogleWorkspaceModal
        isOpen={isGoogleWorkspaceModalOpen}
        onClose={() => setIsGoogleWorkspaceModalOpen(false)}
        bakeries={appState.bakeries}
        debts={appState.debts}
        dailyTasks={appState.dailyTasks || []}
        initialTab={googleWorkspaceInitialTab}
      />

      {/* Multi-Branch / Supply Departments Manager Modal (قسم الفروع والإدارات التموينية) */}
      <BranchesManagerModal
        isOpen={isBranchesModalOpen}
        onClose={() => setIsBranchesModalOpen(false)}
        branches={cleanBranchesList}
        activeBranchId={appState.activeBranchId || DEFAULT_BRANCH_ID}
        isVaultUnlocked={isVaultUnlocked}
        onRequireVaultUnlock={(label, onUnlocked) => {
          requireVaultAccess('branches', label, onUnlocked);
        }}
        onSelectBranch={(branchId) => {
          handleSwitchBranch(branchId, cleanBranchesList);
        }}
        onCreateBranch={async (name, directorate, governorate, description) => {
          const created = createSupplyBranch(name, directorate, governorate, description);
          if (!created.success || !created.newBranch) return;
          const deduplicatedNext = deduplicateSupplyBranches(created.branches);
          saveBranchesList(deduplicatedNext);
          await saveRowToDb({
            table: 'branches',
            branchId: created.newBranch.id,
            row: created.newBranch,
            operation: 'INSERT',
          });
          handleSwitchBranch(created.newBranch.id, deduplicatedNext);
        }}
        onRenameBranch={async (branchId, name, directorate, governorate, description) => {
          const renamed = renameSupplyBranch(branchId, name, directorate, governorate, description);
          if (!renamed.success || !renamed.updatedBranch) return;
          const deduplicatedNext = deduplicateSupplyBranches(renamed.branches);
          saveBranchesList(deduplicatedNext);
          const currentBranchId = appState.activeBranchId || DEFAULT_BRANCH_ID;
          const nextState: AppState = {
            ...appState,
            branches: deduplicatedNext,
            systemConfig:
              branchId === currentBranchId
                ? {
                    ...appState.systemConfig,
                    administrationTitle: renamed.updatedBranch.name,
                    directorateTitle:
                      renamed.updatedBranch.directorateTitle ||
                      renamed.updatedBranch.directorate ||
                      appState.systemConfig.directorateTitle,
                    governorateTitle:
                      renamed.updatedBranch.governorateTitle ||
                      renamed.updatedBranch.governorate ||
                      appState.systemConfig.governorateTitle,
                  }
                : appState.systemConfig,
          };
          await commitRowMutation({
            nextState,
            table: 'branches',
            branchId,
            toastMessage: `تم تعديل اسم الفرع إلى "${renamed.updatedBranch.name}" ومزامنته لجميع الأجهزة`,
            executeDb: () =>
              saveRowToDb({
                table: 'branches',
                branchId,
                row: renamed.updatedBranch!,
                operation: 'UPDATE',
              }),
          });
        }}
        onDeleteBranch={async (branchId) => {
          const deleted = deleteSupplyBranch(branchId);
          if (!deleted.success) return;
          const deduplicatedNext = deduplicateSupplyBranches(deleted.branches);
          saveBranchesList(deduplicatedNext);
          await deleteRowFromDb({
            table: 'branches',
            id: branchId,
            branchId,
          });
          handleSwitchBranch(deleted.nextActiveBranchId || DEFAULT_BRANCH_ID, deduplicatedNext);
        }}
      />

      {/* Master Secret Passcode Gate Modal for Backup & Copy and Branch Modifications */}
      <VaultSecurityGateModal
        isOpen={vaultGateModal.isOpen}
        onClose={() => setVaultGateModal((prev) => ({ ...prev, isOpen: false }))}
        mode={vaultGateModal.initialMode === 'change' ? 'change_passcode' : 'unlock'}
        targetLabel={vaultGateModal.label || 'بوابة الحماية السرية'}
        activeBranchId={appState.activeBranchId || DEFAULT_BRANCH_ID}
        branches={cleanBranchesList}
        branchCredentialsMap={configuredBranchCredentialsMap}
        globalUsername={configuredVaultUsername}
        currentPasscode={configuredVaultPasscode}
        onUnlockSuccess={() => {
          setIsVaultUnlocked(true);
          const pendingFn = vaultGateModal.onAfterUnlock;
          setVaultGateModal((prev) => ({ ...prev, isOpen: false, onAfterUnlock: undefined }));
          if (pendingFn) {
            pendingFn();
          }
        }}
        onChangeCredentials={async ({ targetScope, newUsername, newPasscode }) => {
          await handleUpdateVaultPasscode(
            newPasscode,
            newUsername,
            targetScope === 'all' ? 'ALL' : targetScope
          );
        }}
      />

      {/* In-App Accessible Confirmation Modal (Replaces window.confirm) */}
      {pendingConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-confirm-title"
          className="fixed inset-0 z-[10000] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  pendingConfirm.variant === 'danger'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-[#1E3A8A]'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="app-confirm-title" className="text-sm font-black text-[#0F2342]">
                  {pendingConfirm.title}
                </h3>
                <p className="text-xs font-semibold text-slate-600 mt-1.5 leading-relaxed">
                  {pendingConfirm.message}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = pendingConfirm.onConfirm;
                  setPendingConfirm(null);
                  fn();
                }}
                className={`px-4 py-2 rounded-xl text-white text-xs font-black cursor-pointer transition shadow-xs ${
                  pendingConfirm.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#1E3A8A] hover:bg-[#0F2342]'
                }`}
              >
                {pendingConfirm.confirmLabel || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
