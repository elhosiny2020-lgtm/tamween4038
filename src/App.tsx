import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  ColumnTitles,
  SystemConfig,
  AppUser,
  DailyAlertConfig,
  InboxChatMessage
} from './types';
import {
  AppState,
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
  fetchLatestServerState,
  syncStateToServer
} from './storage';
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
} from './utils/auditHelper';
import {
  testFirestoreConnection,
  loadSharedStateFromFirestore,
  syncSharedStateToFirestore,
} from './lib/firebase';
import {
  subscribeToSupabaseRealtime,
  fetchDatabaseFromSupabase,
} from './lib/supabase';
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
  RotateCw
} from 'lucide-react';

const BAKERY_COLUMN_TOOLTIPS: Record<string, string> = {
  index: 'الرقم المسلسل للمخبز في السجل العام للإدارة',
  actions: 'أزرار التعديل الفوري لبيانات المخبز وحذف المخبز نهائياً من القاعدة',
  bakeryOwnerName: 'الاسم الثلاثي أو الرباعي لصاحب المخبز أو المرخص له بالتشغيل',
  machineNumber: 'رقم ماكينة صرف الخبز الذكية المسجلة بوزارة التموين',
  village: 'القرية الرئيسية المقام بها المخبز التابعة لمركز المحلة الكبرى',
  localUnit: 'الوحدة المحلية الإدارية المشرفة على نطاق المخبز',
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
  commercialRegDate: 'تاريخ انتهاء السجل التجاري المنظم لنشاط المخبز',
  bakeryLicenseDate: 'تاريخ انتهاء رخصة المخبز الصادرة من مجلس المدينة/المركز',
  leaseAgreementDate: 'تاريخ انتهاء عقد الإيجار أو الملكية لمقر المخبز',
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'charts' | 'bakeries' | 'debts' | 'reports'>('bakeries');
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

  // Success Toast Notification on every data edit/save
  interface SaveToastInfo {
    id: number;
    message: string;
    timestamp: string;
  }
  const [saveToast, setSaveToast] = useState<SaveToastInfo | null>(null);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);

  // Search & Filter state for main Bakery table
  const [searchTerm, setSearchTerm] = useState('');
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
  const [isGoogleWorkspaceModalOpen, setIsGoogleWorkspaceModalOpen] = useState(false);
  const [googleWorkspaceInitialTab, setGoogleWorkspaceInitialTab] = useState<'calendar' | 'tasks' | 'forms'>('calendar');
  const [debtsColumnGroup, setDebtsColumnGroup] = useState<'ALL' | 'SUMMARY' | 'VIOLATIONS' | 'ADDED_DISPOSAL'>('ALL');
  const [debtsPageSize, setDebtsPageSize] = useState<number>(50);
  const [showDebtsAlertsKeyModal, setShowDebtsAlertsKeyModal] = useState<boolean>(false);
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

  // Helper to append a high debt notification for managers
  const addHighDebtNotification = useCallback(
    (
      bakeryId: string,
      bakeryOwnerName: string,
      machineNumber: string,
      village: string,
      debtAmount: number,
      actionType: 'ADD_DEBT' | 'EDIT_DEBT' | 'HIGH_DEBT_SURGE'
    ) => {
      const newNotif: HighDebtAlertNotification = {
        id: `notif-${Date.now()}`,
        bakeryId,
        bakeryOwnerName,
        machineNumber,
        village,
        debtAmount,
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
        const updated = [newNotif, ...prev];
        try {
          localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
        } catch {
          // fallback
        }
        return updated;
      });
    },
    [appState?.currentUser]
  );

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

    // Failsafe timer: if storage loading takes longer than 350ms, open app immediately with preloaded or defaults!
    const failsafe = setTimeout(() => {
      if (!hasLoaded) {
        hasLoaded = true;
        const preloaded = typeof window !== 'undefined'
          ? (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> }).PRELOADED_TAMWEEN_STATE
          : undefined;
        const usersList = preloaded?.users ?? INITIAL_USERS;
        setAppState({
          bakeries: preloaded?.bakeries ?? INITIAL_BAKERIES,
          debts: preloaded?.debts ?? INITIAL_DEBTS,
          villages: preloaded?.villages ?? DEFAULT_VILLAGES_HIERARCHY,
          issuingEntities: preloaded?.issuingEntities ?? DEFAULT_ISSUING_ENTITIES,
          violationTypes: preloaded?.violationTypes ?? DEFAULT_VIOLATION_TYPES,
          activityStatuses: preloaded?.activityStatuses ?? DEFAULT_ACTIVITY_STATUSES,
          bakeryCategories: preloaded?.bakeryCategories ?? DEFAULT_BAKERY_CATEGORIES,
          breadTypes: preloaded?.breadTypes ?? DEFAULT_BREAD_TYPES,
          breadTypeCounts: preloaded?.breadTypeCounts ?? DEFAULT_BREAD_TYPE_COUNTS,
          lineTypes: preloaded?.lineTypes ?? DEFAULT_LINE_TYPES,
          fuelTypes: preloaded?.fuelTypes ?? DEFAULT_FUEL_TYPES,
          paymentMethods: preloaded?.paymentMethods ?? PAYMENT_METHODS,
          dailyTasks: preloaded?.dailyTasks ?? INITIAL_DAILY_TASKS,
          columnTitles: preloaded?.columnTitles ?? DEFAULT_COLUMN_TITLES,
          systemConfig: preloaded?.systemConfig ?? DEFAULT_SYSTEM_CONFIG,
          users: usersList,
          currentUser: isAutoStart ? usersList[0] : null,
        });
        setSaveTimestamp(getArabicTimestamp());
      }
    }, 350);

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
        }
      })
      .catch((err) => {
        if (!hasLoaded) {
          hasLoaded = true;
          clearTimeout(failsafe);
          console.error('loadInitialState catch:', err);
          setAppState({
            bakeries: INITIAL_BAKERIES,
            debts: INITIAL_DEBTS,
            villages: DEFAULT_VILLAGES_HIERARCHY,
            issuingEntities: DEFAULT_ISSUING_ENTITIES,
            violationTypes: DEFAULT_VIOLATION_TYPES,
            activityStatuses: DEFAULT_ACTIVITY_STATUSES,
            bakeryCategories: DEFAULT_BAKERY_CATEGORIES,
            breadTypes: DEFAULT_BREAD_TYPES,
            breadTypeCounts: DEFAULT_BREAD_TYPE_COUNTS,
            lineTypes: DEFAULT_LINE_TYPES,
            fuelTypes: DEFAULT_FUEL_TYPES,
            paymentMethods: PAYMENT_METHODS,
            dailyTasks: INITIAL_DAILY_TASKS,
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

  // Verify Firestore connection on boot per Firebase integration guidelines
  useEffect(() => {
    testFirestoreConnection().catch(() => {});
  }, []);

  // Exclusive Cross-Device Real-Time Synchronization via Supabase:
  useEffect(() => {
    // 1. When opening from any device, fetch the latest data recorded last time on any other device
    const loadLatestFromSupabaseOnBoot = async () => {
      try {
        const supaRes = await fetchDatabaseFromSupabase();
        if (
          supaRes &&
          supaRes.success &&
          supaRes.data &&
          Array.isArray(supaRes.data.bakeries) &&
          supaRes.data.bakeries.length > 0
        ) {
          setAppState((current) => {
            if (!current) return current;
            const updated: AppState = {
              ...current,
              ...supaRes.data!,
              currentUser: current.currentUser,
            };
            // Persist the freshest state from Supabase to local storage
            persistFullState(updated).catch(() => {});
            return updated;
          });
        }
      } catch (err) {
        console.warn('Supabase cross-device boot fetch error:', err);
      }
    };

    loadLatestFromSupabaseOnBoot();

    // 2. Real-time Supabase Listener: Adopt live updates directly without merging
    const unsubscribeSupabase = subscribeToSupabaseRealtime((supaData) => {
      if (
        supaData &&
        Array.isArray(supaData.bakeries) &&
        supaData.bakeries.length > 0
      ) {
        setAppState((current) => {
          if (!current) return current;
          // Adopt the latest Supabase state directly without merge conflicts
          const directUpdate: AppState = {
            ...current,
            ...supaData,
            currentUser: current.currentUser,
          };
          persistFullState(directUpdate).catch(() => {});
          return directUpdate;
        });
      }
    });

    return () => {
      unsubscribeSupabase();
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

  // Save helper that updates storage, timestamp, visual pulse, and displays success toast
  const triggerSave = useCallback((newState: AppState, toastMessage?: string) => {
    setAppState(newState);
    setIsSavingPulse(true);
    const ts = getArabicTimestamp();
    setSaveTimestamp(ts);
    const diskInfo = getActiveDiskBackupInfo();
    const diskSuffix = diskInfo.hasHandle ? ` (وتحديث النسخة الاحتياطية على القرص: ${diskInfo.fileName})` : '';
    const msg = (toastMessage || 'تم حفظ وتأمين كافة البيانات بنجاح') + diskSuffix;
    setSaveToast({ id: Date.now(), message: msg, timestamp: ts });
    persistFullState(newState).then(() => {
      setTimeout(() => setIsSavingPulse(false), 900);
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
      if (currentTimeStr === dailyConfig.alertTime && dailyConfig.lastAlertDate !== todayDateStr) {
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

          // Mark today as alerted to avoid multiple firings today
          const updatedConfig: DailyAlertConfig = {
            ...dailyConfig,
            lastAlertDate: todayDateStr,
          };
          triggerSave({
            ...appState,
            systemConfig: {
              ...appState.systemConfig,
              dailyAlertConfig: updatedConfig,
            },
          });
        }
      }
    };

    checkDailyAlert();
    const interval = setInterval(checkDailyAlert, 30000);
    return () => clearInterval(interval);
  }, [appState]);

  const handleSaveDailyAlertConfig = (updatedConfig: DailyAlertConfig) => {
    if (!appState) return;
    const updatedState = {
      ...appState,
      systemConfig: {
        ...appState.systemConfig,
        dailyAlertConfig: updatedConfig,
      },
    };
    triggerSave(updatedState, `تم حفظ وتأكيد موعد التنبيه اليومي (${updatedConfig.alertTime}) بنجاح`);
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

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
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
    searchTerm,
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

  // In-table Hierarchical Grouping Engine (Paginated rows for zero DOM lag + Full Village & Local Unit Totals from sortedBakeries)
  const hierarchicalGroups = useMemo(() => {
    const pageList = paginatedBakeries;
    if (!pageList || pageList.length === 0) return [];

    // Pre-index all matching bakeries in sortedBakeries by village & unit so subtotals reflect full village/unit sums
    const fullVillageBakeMap = new Map<string, Bakery[]>();
    const fullUnitBakeMap = new Map<string, Bakery[]>();
    sortedBakeries.forEach((b) => {
      const vKey = normalizeArabicText((b.village || 'غير محدد').trim()) || 'غير محدد';
      const uKey = `${vKey}__${normalizeArabicText((b.localUnit || 'غير محدد').trim()) || 'غير محدد'}`;
      if (!fullVillageBakeMap.has(vKey)) fullVillageBakeMap.set(vKey, []);
      fullVillageBakeMap.get(vKey)!.push(b);
      if (!fullUnitBakeMap.has(uKey)) fullUnitBakeMap.set(uKey, []);
      fullUnitBakeMap.get(uKey)!.push(b);
    });

    // Group current page's bakeries by Mother Village (القرية) -> Local Unit (الوحدة المحلية التابعة)
    const villageMap = new Map<string, { displayName: string; unitsMap: Map<string, { displayName: string; fullKey: string; bakeries: Bakery[] }> }>();

    pageList.forEach((b) => {
      const vRaw = (b.village || 'غير محدد').trim();
      const uRaw = (b.localUnit || 'غير محدد').trim();
      const vKey = normalizeArabicText(vRaw) || 'غير محدد';
      const uKey = normalizeArabicText(uRaw) || 'غير محدد';
      const fullUnitKey = `${vKey}__${uKey}`;

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

    type SubUnitGroupItem = ReturnType<typeof calculateBakeriesColumnTotals> & {
      localUnit: string;
      village: string;
      bakeries: Bakery[];
    };
    type VillageGroupItem = ReturnType<typeof calculateBakeriesColumnTotals> & {
      localUnit: string;
      villages: SubUnitGroupItem[];
    };

    const result: VillageGroupItem[] = [];

    villageMap.forEach((vEntry, vKey) => {
      const unitSubGroups: SubUnitGroupItem[] = [];

      vEntry.unitsMap.forEach((uEntry) => {
        const fullUnitBakeries = fullUnitBakeMap.get(uEntry.fullKey) || uEntry.bakeries;
        const uTotals = calculateBakeriesColumnTotals(fullUnitBakeries, bakeryRemainingDebtsMap);
        unitSubGroups.push({
          ...uTotals,
          localUnit: uEntry.displayName,
          village: vEntry.displayName,
          bakeries: uEntry.bakeries,
        });
      });

      const fullVillageBakeries = fullVillageBakeMap.get(vKey) || [];
      const vTotals = calculateBakeriesColumnTotals(fullVillageBakeries, bakeryRemainingDebtsMap);
      result.push({
        ...vTotals,
        localUnit: vEntry.displayName,
        villages: unitSubGroups,
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
  }, [appState, bakeryRemainingDebtsMap]);

  // Annual Weighted Averages Report Summary (المتوسط العام المرجح بأعداد المستفيدين 2023 - 2025)
  const annualWeightedSummary = useMemo(() => {
    if (!appState) return null;
    return calculateAnnualWeightedAveragesReport(filteredBakeries.length > 0 ? filteredBakeries : appState.bakeries);
  }, [appState, filteredBakeries]);

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
    if (!appState) return;
    try {
      triggerSave(appState, 'جاري الحفظ الآمن لكافة بيانات المنظومة وقفل الجلسة...');
      await persistFullState(appState);
      setTimeout(() => {
        handleLogout('تم الحفظ الآمن لكافة السجلات والبيانات وتأمين تسجيل الخروج بنجاح.');
      }, 350);
    } catch (err) {
      console.error('Error during safe save and logout:', err);
      handleLogout('تم تسجيل الخروج وقفل الجلسة بنجاح.');
    }
  }, [appState, triggerSave, handleLogout]);

  const [isSyncingWithCloud, setIsSyncingWithCloud] = useState(false);

  const handleManualCloudPull = useCallback(async () => {
    setIsSyncingWithCloud(true);
    try {
      let snap: {
        data?: Partial<AppState>;
        bakeriesCount?: number;
        debtsCount?: number;
        savedAt?: string;
      } | null = null;

      try {
        const firestoreSnap = await loadSharedStateFromFirestore();
        if (
          firestoreSnap &&
          firestoreSnap.data &&
          Array.isArray(firestoreSnap.data.bakeries) &&
          firestoreSnap.data.bakeries.length > 0
        ) {
          snap = {
            data: firestoreSnap.data,
            bakeriesCount: firestoreSnap.bakeriesCount,
            debtsCount: firestoreSnap.debtsCount,
            savedAt: firestoreSnap.updatedAt,
          };
        }
      } catch {}

      if (!snap) {
        snap = await fetchLatestServerState();
      }

      if (snap && snap.data && Array.isArray(snap.data.bakeries) && snap.data.bakeries.length > 0) {
        setAppState((prev) => {
          if (!prev) return prev;
          const merged = mergeStates(prev, snap!.data!);
          persistFullState(merged).catch(() => {});
          return {
            ...merged,
            currentUser: prev.currentUser,
          };
        });
        const dateStr = snap.savedAt ? new Date(snap.savedAt).toLocaleTimeString('ar-EG') : '';
        setSaveToast({
          id: Date.now(),
          message: `تمت مزامنة أحدث البيانات السحابية بنجاح (${snap.bakeriesCount} مخبز • ${snap.debtsCount} قيد مديونية - توقيت: ${dateStr})`,
          timestamp: getArabicTimestamp(),
        });
      } else {
        setSaveToast({
          id: Date.now(),
          message: 'بيانات جهازك محدثة بالفعل، لم يتم العثور على سجلات جديدة على الخادم السحابي.',
          timestamp: getArabicTimestamp(),
        });
      }
    } catch (err) {
      console.error('Cloud pull error:', err);
      setSaveToast({
        id: Date.now(),
        message: 'تعذر الاتصال بالخادم السحابي لجلب أحدث البيانات. تحقق من اتصال الإنترنت.',
        timestamp: getArabicTimestamp(),
      });
    } finally {
      setIsSyncingWithCloud(false);
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
        if (appStateRef.current) {
          try {
            await persistFullState(appStateRef.current);
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

  // Helper to perform non-destructive Gmail / Google Drive JSON merge on user login or registration
  const performGmailDriveAdditiveMerge = (baseState: AppState, user: AppUser): AppState => {
    const gmail =
      user.gmailEmail ||
      localStorage.getItem('TAMWEEN_GMAIL_DRIVE_EMAIL') ||
      baseState.systemConfig.gmailEmail ||
      '';
    if (!gmail.trim()) {
      return { ...baseState, currentUser: user };
    }
    const gmailKey = gmail.trim().toLowerCase();
    let workingState = { ...baseState, currentUser: user };

    const sources = [
      localStorage.getItem(`TAMWEEN_GMAIL_DRIVE_SYNC_${gmailKey}`),
      localStorage.getItem('TAMWEEN_CUSTOM_BACKUP_PAYLOAD'),
    ].filter(Boolean) as string[];

    sources.forEach((rawStr) => {
      try {
        const parsed = JSON.parse(rawStr);
        const sourceData = parsed.data || parsed.state || parsed;
        if (sourceData && (Array.isArray(sourceData.bakeries) || Array.isArray(sourceData.debts))) {
          const merged = mergeStates(workingState, sourceData as Partial<AppState>);
          workingState = {
            ...merged,
            currentUser: user,
            systemConfig: {
              ...merged.systemConfig,
              gmailEmail: gmail.trim(),
              googleDriveAutoSync: true,
              logoBase64: DEFAULT_OFFICIAL_LOGO,
            },
          };
        }
      } catch {
        // ignore invalid JSON cache
      }
    });

    return workingState;
  };

  // If not logged in, show Animated Login
  if (!appState.currentUser) {
    return (
      <LoginModal
        systemConfig={appState.systemConfig}
        users={appState.users}
        logoutReason={logoutReason}
        onLoginSuccess={(user) => {
          setLogoutReason(null);
          saveSessionUser(user);
          const mergedState = performGmailDriveAdditiveMerge(appState, user);
          const updatedUsers = mergedState.users.map((u) => (u.id === user.id ? { ...u, ...user } : u));
          const finalState: AppState = { ...mergedState, users: updatedUsers, currentUser: user };
          triggerSave(
            finalState,
            user.gmailEmail
              ? `تم الدخول ودمج ملفات JSON المرتبطة بجيميل (${user.gmailEmail}) تلقائياً بدون حذف أي بيانات`
              : 'تم تسجيل الدخول وفتح شاشة التنبيه اليومي بنجاح'
          );
          setIsDailyBriefingModalOpen(true);
        }}
        onRegisterUser={(newUser) => {
          const baseWithUser: AppState = {
            ...appState,
            users: [...appState.users, newUser],
          };
          const mergedState = performGmailDriveAdditiveMerge(baseWithUser, newUser);
          triggerSave(
            { ...mergedState, currentUser: null },
            newUser.gmailEmail
              ? `تم تسجيل الحساب وربطه بجيميل (${newUser.gmailEmail}) ودمج ملفات JSON بدون حذف أي بيانات`
              : 'تم تسجيل وحفظ المستخدم الجديد بنجاح'
          );
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
    triggerSave(
      { ...appState, inboxMessages: updatedMessages },
      'تم إرسال الرسالة / التعليمات الإدارية إلى صندوق الوارد لجميع الأطراف بنجاح'
    );
  };

  const handleDeleteInboxMessage = (msgId: string) => {
    const updatedMessages = inboxMessages.filter((m) => m.id !== msgId);
    triggerSave({ ...appState, inboxMessages: updatedMessages }, 'تم حذف الرسالة من صندوق الوارد');
  };

  const handleMarkAllInboxRead = () => {
    const username = appState.currentUser?.username || 'admin';
    const hasUnread = inboxMessages.some((m) => !m.readBy || !m.readBy.includes(username));
    if (!hasUnread) return;
    const updatedMessages = inboxMessages.map((m) => ({
      ...m,
      readBy: Array.from(new Set([...(m.readBy || []), username])),
    }));
    setAppState((prev) => (prev ? { ...prev, inboxMessages: updatedMessages } : null));
    persistFullState({ ...appState, inboxMessages: updatedMessages });
  };

  // Handlers for Bakery
  const handleSaveBakery = (bakery: Bakery) => {
    const existingIndex = appState.bakeries.findIndex((b) => b.id === bakery.id);
    let updated: Bakery[];
    if (existingIndex >= 0) {
      updated = [...appState.bakeries];
      updated[existingIndex] = bakery;
    } else {
      updated = [bakery, ...appState.bakeries];
    }
    const synced = synchronizeBakeryAndDebts(updated, appState.debts);
    triggerSave(
      { ...appState, bakeries: synced.bakeries, debts: synced.debts },
      existingIndex >= 0
        ? `تم حفظ وتعديل بيانات مخبز (${bakery.bakeryOwnerName}) وإعادة احتساب المعادلات ومزامنة السجلات بنجاح`
        : `تم إضافة وحفظ بيانات مخبز (${bakery.bakeryOwnerName}) وإعادة احتساب المعادلات بنجاح`
    );
  };

  const handleRecalculateAllDatabaseEquations = () => {
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
    triggerSave(
      {
        ...appState,
        bakeries: result.bakeries,
        debts: result.debts,
      },
      `تم تنفيذ احتساب المعادلات لجميع سجلات قاعدة البيانات (${result.bakeries.length} مخبز و ${result.debts.length} مديونية) بنجاح!`
    );
    setIsAuditModalOpen(true);
  };

  const handleDeleteBakery = (bakeryId: string, ownerName: string) => {
    if (!hasPermission(appState.currentUser, 'DELETE_BAKERY', appState.systemConfig)) {
      alert('عفواً، حذف المخبز يتطلب صلاحيات مدير النظام الصريحة.');
      return;
    }
    if (confirm(`هل أنت متأكد من حذف المخبز الخاص بـ "${ownerName}" نهائياً من المنظومة؟`)) {
      const updated = appState.bakeries.filter((b) => b.id !== bakeryId);
      triggerSave({ ...appState, bakeries: updated }, `تم حذف مخبز (${ownerName}) وتحديث قاعدة البيانات بنجاح`);
    }
  };

  // Handlers for Debts
  const handleSaveDebt = (debt: DebtRecord) => {
    const existingIndex = appState.debts.findIndex((d) => d.id === debt.id);
    let updated: DebtRecord[];
    if (existingIndex >= 0) {
      updated = [...appState.debts];
      updated[existingIndex] = debt;
    } else {
      updated = [debt, ...appState.debts];
    }

    const synced = synchronizeBakeryAndDebts(appState.bakeries, updated);
    const savedDebt = synced.debts.find((d) => d.id === debt.id) || debt;

    if (savedDebt.netRemainingDebt >= 50000) {
      addHighDebtNotification(
        savedDebt.bakeryId,
        savedDebt.bakeryOwnerName,
        savedDebt.machineNumber,
        savedDebt.village,
        savedDebt.netRemainingDebt,
        existingIndex >= 0 ? 'EDIT_DEBT' : 'ADD_DEBT'
      );
    }

    triggerSave(
      { ...appState, bakeries: synced.bakeries, debts: synced.debts },
      existingIndex >= 0 ? 'تم تعديل وحفظ قيد المديونية وإعادة احتساب الأرصدة بنجاح' : 'تم إضافة وتسجيل قيد المديونية وإعادة احتساب الأرصدة بنجاح'
    );
  };

  const handleDeleteDebt = (debtId: string) => {
    if (!hasPermission(appState.currentUser, 'DELETE_DEBT', appState.systemConfig)) {
      alert('عفواً، حذف قيد المديونية يتطلب صلاحيات مدير النظام الصريحة.');
      return;
    }
    const updated = appState.debts.filter((d) => d.id !== debtId);
    triggerSave({ ...appState, debts: updated }, 'تم حذف قيد المديونية وتحديث قاعدة البيانات بنجاح');
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
    alert(res.message);
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
      ct.commercialRegDate,
      ct.bakeryLicenseDate,
      ct.leaseAgreementDate,
      ct.taxCardDate,
    ];

    const rows = filteredBakeries.map((b, idx) => [
      idx + 1,
      `"${b.bakeryOwnerName.replace(/"/g, '""')}"`,
      `"${b.machineNumber}"`,
      `"${b.village}"`,
      `"${b.localUnit}"`,
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
      `"${b.commercialRegDate}"`,
      `"${b.bakeryLicenseDate}"`,
      `"${b.leaseAgreementDate}"`,
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
      case 'debts-alerts-key':
        setActiveTab('debts');
        setShowDebtsAlertsKeyModal(true);
        break;
      case 'debts-installments':
        setSelectedInstallmentBakeryId(undefined);
        setIsWeeklyInstallmentsModalOpen(true);
        break;

      // 4. قسم الحفظ والنسخ
      case 'ops-save-data':
        triggerSave(appState, 'تم حفظ وتثبيت كافة التغييرات في قاعدة البيانات بنجاح');
        break;
      case 'data-import':
      case 'data-backup':
        setIsBackupModalOpen(true);
        break;
      case 'data-export':
        handleExportBakeryCSV();
        break;
      case 'workspace-calendar':
        setGoogleWorkspaceInitialTab('calendar');
        setIsGoogleWorkspaceModalOpen(true);
        break;
      case 'workspace-tasks':
        setGoogleWorkspaceInitialTab('tasks');
        setIsGoogleWorkspaceModalOpen(true);
        break;
      case 'workspace-forms':
        setGoogleWorkspaceInitialTab('forms');
        setIsGoogleWorkspaceModalOpen(true);
        break;

      // Additional legacy routes
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
        handleLogout();
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

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col bg-[#F4F6F9] text-slate-800 font-sans selection:bg-[#1E3A8A] selection:text-white"
    >
      {/* 1. Streamlined Official Governmental Top Header (ترويسة علوية بسيطة وأنيقة) */}
      <header className="bg-white border-b border-slate-200 text-slate-800 shadow-2xs sticky top-0 z-30 no-print">
        <div className="max-w-[1920px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* Right Zone: Emblem, Directorate & Administration Name, System Name */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsHeaderModalOpen(true)}
              title="تخصيص بيانات الترويسة والشعار"
              className="w-11 h-11 rounded-full bg-slate-50 p-1 border border-slate-300 hover:border-[#1E3A8A] flex items-center justify-center shrink-0 cursor-pointer transition"
            >
              <img
                src={appState.systemConfig.logoBase64}
                alt="شعار المنظومة"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1E3A8A]">
                <span>{appState.systemConfig.directorateTitle}</span>
                <span aria-hidden="true">·</span>
                <span>{appState.systemConfig.administrationTitle}</span>
              </div>
              <h1 className="text-sm sm:text-base font-extrabold text-[#0F2342] truncate">
                منظومة إدارة بيانات المخابز والتموين والمديونيات
              </h1>
            </div>
          </div>

          {/* Left Zone: Date & Time, Notifications, Current User, Account Settings */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Date & Time + Autosave */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/80">
              <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>{currentDateTimeStr}</span>
              {saveTimestamp && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 font-bold">حُفظ {saveTimestamp}</span>
                </>
              )}
            </div>

            {/* Notifications Button */}
            <button
              type="button"
              onClick={() => setIsDailyBriefingModalOpen(true)}
              className="relative px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="الإشعارات والتنبيهات اليومية للمديونيات والتراخيص"
            >
              <Bell className="w-4 h-4 text-[#1E3A8A]" />
              <span>الإشعارات</span>
              {totalNotificationsCount > 0 && (
                <span className="px-1.5 py-0.2 bg-red-600 text-white rounded-full text-[10px] font-mono font-bold tabular-nums">
                  {totalNotificationsCount}
                </span>
              )}
            </button>

            {/* Current User Profile */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#EFF6FF] border border-blue-200 rounded-lg text-xs">
              <span className="font-extrabold text-[#0F2342]">{appState.currentUser.fullName}</span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-[#1E40AF] font-semibold">
                {getRoleNameArabic(appState.currentUser.role, appState.systemConfig)}
              </span>
            </div>

            {/* Account Settings Button */}
            <button
              type="button"
              onClick={() => setIsUsersModalOpen(true)}
              className="px-3 py-1.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
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
              className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
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
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-2xs border border-amber-300"
              title="تنزيل البرنامج التنفيذي لنظام ويندوز (منظومة_وزارة_التموين.exe)"
            >
              <Download className="w-3.5 h-3.5 text-slate-950" />
              <span>تنزيل البرنامج EXE</span>
            </button>

            {/* Supabase & Cloud Backup Button */}
            <button
              type="button"
              onClick={() => setIsBackupModalOpen(true)}
              className="px-3 py-1.5 bg-teal-800 hover:bg-teal-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-2xs border border-teal-500/40"
              title="إعدادات Supabase ونسخ كود إنشاء الجداول على SQL والتخزين السحابي"
            >
              <HardDrive className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">Supabase والنسخ السحابي</span>
            </button>

            {/* Google Workspace (Calendar, Tasks, Forms) Button */}
            <button
              type="button"
              onClick={() => {
                setGoogleWorkspaceInitialTab('calendar');
                setIsGoogleWorkspaceModalOpen(true);
              }}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="مركز خدمات Google Workspace (Calendar • Tasks • Forms)"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Google Workspace</span>
            </button>

            {/* Multi-Device Cloud Sync Button */}
            <button
              type="button"
              onClick={handleManualCloudPull}
              disabled={isSyncingWithCloud}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-emerald-400/40"
              title="مزامنة سحابية فورية وجلب أحدث السجلات المسجلة من الأجهزة الأخرى"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncingWithCloud ? 'animate-spin text-amber-300' : 'text-emerald-300'}`} />
              <span className="hidden md:inline">{isSyncingWithCloud ? 'جاري المزامنة...' : 'مزامنة الأجهزة 🔄'}</span>
            </button>

            {/* Publish & Cloud Hosting Button */}
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-blue-400/30"
              title="نشر واستضافة المنظومة سحابياً (Cloudflare Pages • Vercel • Google Cloud)"
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
        />

        {/* Main Workspace Canvas (Matte Off-White) */}
        <main className="flex-1 min-w-0 p-4 sm:p-5 space-y-4">
          {/* 3.1 Breadcrumbs & Quick View Switcher Bar */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs no-print">
            {/* Breadcrumb Path */}
            <nav aria-label="مسار التنقل" className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('dashboard-home', 'لوحة التحكم', 'الصفحة الرئيسية')}
                className="text-slate-500 hover:text-[#1E3A8A] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>الرئيسية</span>
              </button>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-600 font-semibold">{breadcrumbGroup}</span>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#0F2342] font-extrabold">{breadcrumbItem}</span>
            </nav>

            {/* Primary View Mode Segmented Switcher */}
            <div className="flex items-center gap-1 bg-[#E2E8F0] p-1 rounded-lg border border-slate-300">
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('dashboard-home', 'لوحة التحكم', 'الصفحة الرئيسية')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-[#0F2342] text-amber-300 shadow-2xs'
                    : 'text-[#0F2342] hover:bg-[#1E3A8A] hover:text-amber-300'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>الصفحة الرئيسية</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('bakeries-all', 'إدارة المخابز', 'قاعدة بيانات المخابز')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'bakeries'
                    ? 'bg-[#0F2342] text-amber-300 shadow-2xs'
                    : 'text-[#0F2342] hover:bg-[#1E3A8A] hover:text-amber-300'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>قاعدة بيانات المخابز ({appState.bakeries.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('debts-records', 'إدارة المخابز', 'سجل مديونيات المخابز')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'debts'
                    ? 'bg-[#0F2342] text-amber-300 shadow-2xs'
                    : 'text-[#0F2342] hover:bg-[#1E3A8A] hover:text-amber-300'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>سجل المديونيات ({appState.debts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSidebarNav('reports-center', 'مركز التقارير والطباعة', 'شاشة التقارير والطباعة المتقدمة')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'reports'
                    ? 'bg-[#0F2342] text-amber-300 shadow-2xs'
                    : 'text-[#0F2342] hover:bg-[#1E3A8A] hover:text-amber-300'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>مركز التقارير والطباعة</span>
              </button>
            </div>
          </div>

          {/* 3.2 Unified Command Toolbar (شريط الأدوات الموحد للأوامر الرئيسية - البند 7) */}
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex items-center flex-wrap gap-1.5">
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
                  className="px-3 py-1.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
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
                    if (confirm('هل ترغب في إعادة احتساب وتدقيق جميع المعادلات الحسابية لكافة المخابز والمديونيات الآن؟')) {
                      handleRecalculateAllDatabaseEquations();
                    }
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

              {/* 7. Export Excel */}
              <button
                type="button"
                onClick={() => runGuardedAction(handleExportBakeryCSV)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-emerald-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>تصدير Excel</span>
              </button>

              {/* 8. Import Excel / Backup */}
              <button
                type="button"
                onClick={() => runGuardedAction(() => setIsBackupModalOpen(true))}
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
            /* CHARTS & ANALYTICS VIEW */
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#EFF6FF] border border-blue-200 rounded-xl">
                    <BarChart3 className="w-6 h-6 text-[#1E3A8A]" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-[#0F2342]">
                      لوحة الرسوم البيانية والمقارنات الإحصائية للمنظومة
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      تحليل شامل لمديونيات المخابز وحصص الدقيق وتوزيع المخابز والإنتاج على مستوى المركز
                    </p>
                  </div>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLocalUnitsModalOpen(true)}
                    className="px-4 py-2 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-2xs"
                  >
                    <Table className="w-4 h-4" />
                    <span>ملخص الوحدات المحلية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('bakeries')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <span>← جدول المخابز</span>
                  </button>
                </div>
              </div>

              <BakeryDebtsPieChart
                bakeries={appState.bakeries}
                debts={appState.debts}
                onSelectBakeryFilter={(bakeryId) => {
                  setActiveTab('debts');
                  setDebtFilterBakeryId(bakeryId);
                }}
              />

              <BakeryAnalyticsCharts
                bakeries={appState.bakeries}
                debts={appState.debts}
                villages={appState.villages}
                onSelectTierFilter={(_min, _max, tierLabel) => {
                  setActiveTab('bakeries');
                  setSelectedDebtFilter('HAS_DEBT');
                  setSaveToast({
                    id: Date.now(),
                    message: `تم تصفية القائمة لعرض المخابز ضمن شريحة (${tierLabel})`,
                    timestamp: new Date().toLocaleTimeString('ar-EG'),
                  });
                }}
              />
            </div>
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
              onUpdateEntities={(ents) =>
                triggerSave({ ...appState, issuingEntities: ents }, 'تم تحديث قائمة الجهات المحررة بنجاح')
              }
              onUpdateViolations={(viols) =>
                triggerSave({ ...appState, violationTypes: viols }, 'تم تحديث قائمة أنواع المخالفات بنجاح')
              }
              onRenameEntity={(oldName, newName) => {
                if (!oldName.trim() || !newName.trim() || oldName === newName) return;
                const updatedEntities = appState.issuingEntities.map((e) => (e === oldName ? newName : e));
                const updatedDebts = appState.debts.map((d) =>
                  d.issuingEntity === oldName ? { ...d, issuingEntity: newName } : d
                );
                triggerSave(
                  { ...appState, issuingEntities: updatedEntities, debts: updatedDebts },
                  `تم تعديل الجهة المحررة إلى "${newName}" وتحديث القيود المرتبطة بها`
                );
              }}
              onRenameViolation={(oldName, newName) => {
                if (!oldName.trim() || !newName.trim() || oldName === newName) return;
                const updatedViolations = appState.violationTypes.map((v) => (v === oldName ? newName : v));
                const updatedDebts = appState.debts.map((d) =>
                  d.violationType === oldName ? { ...d, violationType: newName } : d
                );
                triggerSave(
                  { ...appState, violationTypes: updatedViolations, debts: updatedDebts },
                  `تم تعديل نوع المخالفة إلى "${newName}" وتحديث القيود المرتبطة بها`
                );
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
            />
          ) : (
            /* BAKERIES DATABASE VIEW (إعادة تصميم قاعدة بيانات المخابز - البند 6) */
            <div className="space-y-4">
              {/* Summary Strip Above Bakeries Table */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 block">إجمالي المخابز</span>
                  <span className="stat-num text-[#0F2342] block">{bakeryStats.count}</span>
                  <span className="text-[10px] text-slate-500">مخبز مسجل</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 block">إجمالي الحصة التأمينية</span>
                  <span className="stat-num text-[#1E3A8A] block">
                    {Number(bakeryStats.totalInsurance.toFixed(2)).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">شيكارة (حساب تلقائي)</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 block">إجمالي الحصة الفعلية</span>
                  <span className="stat-num text-[#0F2342] block">{bakeryStats.totalActual.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500">شيكارة يومياً</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 block">إجمالي الأرغفة اليومية</span>
                  <span className="stat-num text-emerald-700 block">{bakeryStats.totalLoaves.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500">رغيف بلدي مدعم</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 block">متوسط نصيب الفرد (2025)</span>
                  <span className="stat-num text-[#1E40AF] block">
                    {annualWeightedSummary?.weightedGeneralAvg2025 || '0.00'}
                  </span>
                  <span className="text-[10px] text-slate-500">رغيف / مستفيد</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-semibold text-slate-500 block">إجمالي المديونيات المتبقية</span>
                  <span className="stat-num text-red-600 block">{bakeryStats.totalDebts.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500">جنيه مصري</span>
                </div>
              </div>

              {/* Advanced Filters & Column View Selector Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 no-print">
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
                          <th colSpan={4} className="py-2 px-2 bg-[#0F2342] border-l border-[#1E3A5F] text-sky-200">
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
                            <th colSpan={4} className="py-2 px-2 bg-[#152E54] border-l border-[#1E3A5F] text-slate-200">
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
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.commercialRegDate} tooltipKey="commercialRegDate" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.bakeryLicenseDate} tooltipKey="bakeryLicenseDate" />
                            </th>
                            <th className="py-2 px-2 border-l border-[#1E3A5F] min-w-[85px]">
                              <ThHeaderTooltip label={ct.leaseAgreementDate} tooltipKey="leaseAgreementDate" />
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
                          <td colSpan={33} className="py-12 text-center text-slate-500 font-bold bg-white">
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

                          // Helper to render Local Unit Subtotal Row (إجمالي الوحدة المحلية التابعة)
                          const renderVillageTotalRow = (vGroup: any) => (
                            <tr
                              key={`vtotal-${vGroup.village}-${vGroup.localUnit}`}
                              className="village-total-row bg-[#DBEAFE] text-[#0F2342] font-black border-t-2 border-b-2 border-sky-400 shadow-xs text-xs"
                            >
                              <td className="py-2.5 px-2 border-l border-sky-300 text-[#0369A1] font-extrabold">∑</td>
                              {showBasicCols && (
                                <>
                                  <td className="py-2.5 px-2.5 border-l border-sky-300 text-right font-black text-[#0F2342]">
                                    إجمالي وحدة محلية ({vGroup.localUnit}) — قرية {vGroup.village}
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged text-[#1E3A8A]">
                                    {vGroup.bakeryCount} مخبز
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 font-bold">{vGroup.village}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 font-bold">{vGroup.localUnit}</td>
                                </>
                              )}
                              {showDebtCol && (
                                <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-rose-700">
                                  {vGroup.remainingDebt > 0 ? `${vGroup.remainingDebt.toLocaleString()} ج.م` : 'خالص (0)'}
                                </td>
                              )}
                              {showQuotaCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.insuranceValue?.toLocaleString()} ج.م</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-[#0F2342] bg-sky-200/60">
                                    {vGroup.insuranceQuota?.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.actualQuota?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-[#0F2342] bg-sky-200/60">
                                    {vGroup.loavesCount?.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-emerald-800 bg-sky-200/60">
                                    {vGroup.perCapitaAverage}
                                  </td>
                                </>
                              )}
                              {showDemographicsCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.villagePopulation?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.beneficiaries2023?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.beneficiaries2024?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.beneficiaries2025?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged bg-sky-200/60 text-[#1E3A8A]">{vGroup.avg2023}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged bg-sky-200/60 text-[#1E3A8A]">{vGroup.avg2024}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged bg-sky-200/60 text-[#1E3A8A]">{vGroup.avg2025}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged font-black text-amber-900 bg-sky-200/80">{vGroup.avgDiff}</td>
                                </>
                              )}
                              {showOperationsCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-bold">{vGroup.activitySummaryLabel}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px]">{vGroup.bakeryCategorySummaryLabel}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px]">{vGroup.breadTypeSummaryLabel}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.flourBagPriceSum?.toLocaleString()} ج.م</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 num-enlarged">{vGroup.breadTypeCountSum?.toLocaleString()}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px]">{vGroup.lineTypeSummaryLabel}</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px]">{vGroup.fuelTypeSummaryLabel}</td>
                                </>
                              )}
                              {showContactLicenseCols && (
                                <>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-mono">{vGroup.validPhonesCount} رقم</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-mono">{vGroup.validNatIdsCount} هوية</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-mono">{vGroup.validCommRegCount} سجل</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-mono">{vGroup.validLicenseCount} رخصة</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-mono">{vGroup.validLeaseCount} عقد</td>
                                  <td className="py-2.5 px-2 border-l border-sky-300 text-[11px] font-mono">{vGroup.validTaxCardCount} بطاقة</td>
                                </>
                              )}
                              <td className="py-2.5 px-2 no-print font-mono text-[10px]">إجمالي الوحدة</td>
                            </tr>
                          );

                          // Helper to render Mother Village Total Row (إجمالي القرية شاملاً كافة وحداتها المحلية)
                          const renderLocalUnitTotalRow = (uGroup: any) => (
                            <tr
                              key={`utotal-${uGroup.localUnit}`}
                              className="local-unit-total-row bg-[#0F2342] text-amber-300 font-extrabold border-t-2 border-b-2 border-amber-500/80 shadow-md text-xs"
                            >
                              <td className="py-3 px-2 border-l border-[#1E3A5F] text-amber-400 font-black">∑∑</td>
                              {showBasicCols && (
                                <>
                                  <td className="py-3 px-2.5 border-l border-[#1E3A5F] text-right font-black text-amber-300">
                                    إجمالي قرية {uGroup.localUnit} (شامل {uGroup.villages.length} وحدة محلية)
                                  </td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">
                                    {uGroup.bakeryCount} مخبز
                                  </td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-amber-200">
                                    قرية {uGroup.localUnit}
                                  </td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-amber-200">
                                    {uGroup.villages.length} وحدة تابعة
                                  </td>
                                </>
                              )}
                              {showDebtCol && (
                                <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-rose-300">
                                  {uGroup.remainingDebt > 0 ? `${uGroup.remainingDebt.toLocaleString()} ج.م` : 'خالص (0)'}
                                </td>
                              )}
                              {showQuotaCols && (
                                <>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">{uGroup.insuranceValue?.toLocaleString()} ج.م</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-amber-300 bg-[#162F57]">
                                    {uGroup.insuranceQuota?.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">{uGroup.actualQuota?.toLocaleString()}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-amber-300 bg-[#162F57]">
                                    {uGroup.loavesCount?.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-emerald-300 bg-[#162F57]">
                                    {uGroup.perCapitaAverage}
                                  </td>
                                </>
                              )}
                              {showDemographicsCols && (
                                <>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">{uGroup.villagePopulation?.toLocaleString()}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">{uGroup.beneficiaries2023?.toLocaleString()}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">{uGroup.beneficiaries2024?.toLocaleString()}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged text-amber-200">{uGroup.beneficiaries2025?.toLocaleString()}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged bg-[#162F57] text-sky-200">{uGroup.avg2023}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged bg-[#162F57] text-sky-200">{uGroup.avg2024}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged bg-[#162F57] text-sky-200">{uGroup.avg2025}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged font-black text-amber-400 bg-[#1A3868]">{uGroup.avgDiff}</td>
                                </>
                              )}
                              {showOperationsCols && (
                                <>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px]">{uGroup.activitySummaryLabel}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px]">{uGroup.bakeryCategorySummaryLabel}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px]">{uGroup.breadTypeSummaryLabel}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged">{uGroup.flourBagPriceSum?.toLocaleString()} ج.م</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] num-enlarged">{uGroup.breadTypeCountSum?.toLocaleString()}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px]">{uGroup.lineTypeSummaryLabel}</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px]">{uGroup.fuelTypeSummaryLabel}</td>
                                </>
                              )}
                              {showContactLicenseCols && (
                                <>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">{uGroup.validPhonesCount} رقم</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">{uGroup.validNatIdsCount} هوية</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">{uGroup.validCommRegCount} سجل</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">{uGroup.validLicenseCount} رخصة</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">{uGroup.validLeaseCount} عقد</td>
                                  <td className="py-3 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">{uGroup.validTaxCardCount} بطاقة</td>
                                </>
                              )}
                              <td className="py-3 px-2 no-print font-mono text-[10px]">إجمالي القرية</td>
                            </tr>
                          );

                          if (groupingViewMode === 'HIERARCHICAL') {
                            const elements: React.ReactNode[] = [];
                            let pageRunningIndex = (safeCurrentPage - 1) * pageSize;

                            hierarchicalGroups.forEach((uGroup) => {
                              uGroup.villages.forEach((vGroup) => {
                                vGroup.bakeries.forEach((b) => {
                                  pageRunningIndex++;
                                  elements.push(renderBakeryRow(b, pageRunningIndex));
                                });
                                elements.push(renderVillageTotalRow(vGroup));
                              });
                              elements.push(renderLocalUnitTotalRow(uGroup));
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

                    {/* Dedicated Sticky Summary Footer ("صف الإجماليات TOTAL SUMMARY") — Sums ALL Columns Across All Villages & Local Units */}
                    {sortedBakeries.length > 0 && (
                      <tfoot className="sticky bottom-0 z-20 bg-[#051124] text-amber-300 font-extrabold border-t-4 border-amber-500 shadow-xl text-xs">
                        {(() => {
                          return (
                            <tr className="total-summary-row">
                              <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-amber-400 font-black text-sm">🏛️</td>
                              {showBasicCols && (
                                <>
                                  <td className="py-3.5 px-2.5 border-l border-[#1E3A5F] text-right font-black text-amber-300 text-xs sm:text-sm">
                                    صف الإجماليات TOTAL SUMMARY ({grandTotals.bakeryCount} مخبز)
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
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px]">
                                    {grandTotals.bakeryCategorySummaryLabel}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px]">
                                    {grandTotals.breadTypeSummaryLabel}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged">
                                    {grandTotals.flourBagPriceSum.toLocaleString()} ج.م
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] num-enlarged">
                                    {grandTotals.breadTypeCountSum.toLocaleString()}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px]">
                                    {grandTotals.lineTypeSummaryLabel}
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px]">
                                    {grandTotals.fuelTypeSummaryLabel}
                                  </td>
                                </>
                              )}
                              {showContactLicenseCols && (
                                <>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">
                                    {grandTotals.validPhonesCount} رقم مسجل
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">
                                    {grandTotals.validNatIdsCount} رقم قومي
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">
                                    {grandTotals.validCommRegCount} سجل مسجل
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">
                                    {grandTotals.validLicenseCount} رخصة مسجلة
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">
                                    {grandTotals.validLeaseCount} عقد مسجل
                                  </td>
                                  <td className="py-3.5 px-2 border-l border-[#1E3A5F] text-[11px] font-mono">
                                    {grandTotals.validTaxCardCount} بطاقة مسجلة
                                  </td>
                                </>
                              )}
                              <td className="py-3.5 px-2 no-print font-mono text-[11px]">
                                إجمالي ({grandTotals.bakeryCount})
                              </td>
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
          currentUser={appState.currentUser}
          onAddActivityStatus={(newStatus) => {
            if (!appState.activityStatuses.includes(newStatus)) {
              triggerSave({
                ...appState,
                activityStatuses: [...appState.activityStatuses, newStatus],
              });
            }
          }}
          onAddLocalUnit={(villageName, newUnit) => {
            const updatedVillages = appState.villages.map((v) => {
              if (v.village === villageName && !v.localUnits.includes(newUnit)) {
                return { ...v, localUnits: [...v.localUnits, newUnit] };
              }
              return v;
            });
            triggerSave({ ...appState, villages: updatedVillages });
          }}
          onUpdateDropdownList={(listKey, updatedList) => {
            triggerSave(
              {
                ...appState,
                [listKey]: updatedList,
              },
              'تم تحديث وحفظ القائمة المنسدلة بنجاح'
            );
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
          onSaveTasks={(updatedTasks, toastMessage) =>
            triggerSave({ ...appState, dailyTasks: updatedTasks }, toastMessage)
          }
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
          onSaveTitles={(updatedTitles) =>
            triggerSave({ ...appState, columnTitles: updatedTitles }, 'تم حفظ وتحديث مسميات رؤوس الخانات بنجاح')
          }
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
          onSaveStatuses={(updatedStatuses) =>
            triggerSave({ ...appState, activityStatuses: updatedStatuses }, 'تم حفظ وتحديث حالات نشاط المخابز بنجاح')
          }
        />
      )}

      {/* 4. Header & System Settings Customizer Modal (includes 'إعدادات التذكير') */}
      {isHeaderModalOpen && (
        <HeaderCustomizerModal
          isOpen={isHeaderModalOpen}
          onClose={() => setIsHeaderModalOpen(false)}
          config={appState.systemConfig}
          onSaveConfig={(updatedConfig) =>
            triggerSave({ ...appState, systemConfig: updatedConfig }, 'تم حفظ وتحديث إعدادات النظام والترويسة وإعدادات التذكير بنجاح')
          }
          onOpenDailyAlertSettings={() => setIsDailySettingsModalOpen(true)}
        />
      )}

      {/* 5. Village Hierarchy Manager Modal */}
      {isVillageModalOpen && (
        <VillageManagerModal
          isOpen={isVillageModalOpen}
          onClose={() => setIsVillageModalOpen(false)}
          villages={appState.villages}
          onSaveVillages={(updatedVillages) =>
            triggerSave({ ...appState, villages: updatedVillages }, 'تم حفظ وتحديث القرى والوحدات المحلية بنجاح')
          }
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
            await factoryReset();
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

      {/* 8. Users & Inspectors Manager Modal */}
      {isUsersModalOpen && (
        <UsersManagerModal
          isOpen={isUsersModalOpen}
          onClose={() => setIsUsersModalOpen(false)}
          users={appState.users}
          currentUser={appState.currentUser}
          onAddUser={(newUser) =>
            triggerSave({ ...appState, users: [...appState.users, newUser] }, 'تم إضافة وحفظ المستخدم الجديد بنجاح')
          }
          onUpdateUser={(updatedUser) => {
            const updatedUsers = appState.users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
            const isCurrent = appState.currentUser?.id === updatedUser.id;
            if (isCurrent) {
              saveSessionUser(updatedUser);
            }
            triggerSave(
              {
                ...appState,
                users: updatedUsers,
                currentUser: isCurrent ? updatedUser : appState.currentUser,
              },
              `تم حفظ تعديل بيانات الحساب والاسم بالكامل (${updatedUser.fullName}) والصلاحيات بنجاح`
            );
          }}
          onDeleteUser={(userId) => {
            const updatedUsers = appState.users.filter((u) => u.id !== userId);
            triggerSave({ ...appState, users: updatedUsers }, 'تم حذف المستخدم وتحديث القائمة بنجاح');
          }}
        />
      )}

      {/* 8.1 Advanced Role Permissions & Users Management Modal (إعدادات الصلاحيات المتقدمة في SystemConfig) */}
      {isAdvancedPermissionsModalOpen && (
        <AdvancedPermissionsModal
          isOpen={isAdvancedPermissionsModalOpen}
          onClose={() => setIsAdvancedPermissionsModalOpen(false)}
          systemConfig={appState.systemConfig}
          onSaveSystemConfig={(updatedConfig: SystemConfig) =>
            triggerSave(
              { ...appState, systemConfig: updatedConfig },
              'تم حفظ إعدادات الصلاحيات المتقدمة والأدوار الوظيفية في SystemConfig بنجاح'
            )
          }
          users={appState.users}
          currentUser={appState.currentUser}
          onAddUser={(newUser) =>
            triggerSave({ ...appState, users: [...appState.users, newUser] }, `تم إضافة وحفظ المستخدم الجديد (${newUser.fullName}) بنجاح`)
          }
          onUpdateUser={(updatedUser) => {
            const updatedUsers = appState.users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
            const isCurrent = appState.currentUser?.id === updatedUser.id;
            if (isCurrent) {
              saveSessionUser(updatedUser);
            }
            triggerSave(
              {
                ...appState,
                users: updatedUsers,
                currentUser: isCurrent ? updatedUser : appState.currentUser,
              },
              `تم حفظ تعديل بيانات الحساب والاسم بالكامل (${updatedUser.fullName}) واليوزر والباسورد والدور الوظيفي بنجاح`
            );
          }}
          onDeleteUser={(userId) => {
            const updatedUsers = appState.users.filter((u) => u.id !== userId);
            triggerSave({ ...appState, users: updatedUsers }, 'تم حذف المستخدم وتحديث القائمة بنجاح');
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
                    <div>تجميع هرمي شامل (القرية ← الوحدة المحلية ← الإجمالي)</div>
                    <div className="text-[10px] font-bold opacity-80 mt-0.5">
                      يعرض صفوف الإجماليات الفرعية وسط الجدول + صف الإجماليات TOTAL SUMMARY
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

      {/* Real-time Floating Save Success Toast Notification */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-md animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 text-white border-2 border-emerald-400 rounded-2xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md ring-4 ring-emerald-500/20">
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/50 text-emerald-300 shrink-0">
              <CheckCircle2 className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-emerald-300">تم الحفظ بنجاح وتأمين البيانات</h4>
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
        onMarkAsRead={(id) => {
          setHighDebtNotifications((prev) => {
            const updated = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
            localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
            return updated;
          });
        }}
        onMarkAllAsRead={() => {
          setHighDebtNotifications((prev) => {
            const updated = prev.map((n) => ({ ...n, isRead: true }));
            localStorage.setItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS', JSON.stringify(updated));
            return updated;
          });
        }}
        onClearAll={() => {
          setHighDebtNotifications([]);
          localStorage.removeItem('TAMWEEN_HIGH_DEBT_NOTIFICATIONS');
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
    </div>
  );
}
