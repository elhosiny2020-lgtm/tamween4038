import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  ColumnTitles,
  SystemConfig,
  AppUser
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
  getActiveDiskBackupInfo
} from './storage';
import {
  DEFAULT_SYSTEM_CONFIG,
  DEFAULT_VILLAGES_HIERARCHY,
  DEFAULT_ISSUING_ENTITIES,
  DEFAULT_VIOLATION_TYPES,
  DEFAULT_ACTIVITY_STATUSES,
  DEFAULT_COLUMN_TITLES,
  INITIAL_BAKERIES,
  INITIAL_DEBTS,
  INITIAL_USERS
} from './defaultData';
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
import { UsersManagerModal } from './components/UsersManagerModal';
import { ActivityStatusModal } from './components/ActivityStatusModal';
import { WeeklyInstallmentsModal } from './components/WeeklyInstallmentsModal';
import { AuditModal } from './components/AuditModal';
import { BakeryAnalyticsCharts } from './components/BakeryAnalyticsCharts';
import {
  downloadUpdatedAppHtml,
  downloadAppLauncherHtml,
  downloadMinistryDesktopShortcut,
  downloadWindowsDesktopInstallerBat,
  downloadWindowsExeLauncher,
  openStandaloneAppInNewTab
} from './utils/htmlExporter';
import { usePWAInstall } from './hooks/usePWAInstall';

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
  Calculator,
  Building2,
  Database,
  Upload,
  Globe
} from 'lucide-react';

export default function App() {
  const { isInstallable, install } = usePWAInstall();
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<'bakeries' | 'debts'>('bakeries');
  const [saveTimestamp, setSaveTimestamp] = useState<string>('');
  const [isSavingPulse, setIsSavingPulse] = useState(false);

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
  // License Expiry Timeline Filter (الكل، منتهية بالفعل، تنتهي خلال 30 يوماً، تنتهي خلال 60 يوماً، تنتهي خلال 90 يوماً، سارية لأكثر من 90 يوماً)
  const [selectedLicenseExpiryFilter, setSelectedLicenseExpiryFilter] = useState<
    'ALL' | 'EXPIRED' | 'WITHIN_30' | 'WITHIN_60' | 'WITHIN_90' | 'VALID'
  >('ALL');

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
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isWeeklyInstallmentsModalOpen, setIsWeeklyInstallmentsModalOpen] = useState(false);
  const [selectedInstallmentBakeryId, setSelectedInstallmentBakeryId] = useState<string | undefined>(undefined);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

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

    // Failsafe timer: if storage loading takes longer than 350ms, open app immediately with preloaded or defaults!
    const failsafe = setTimeout(() => {
      if (!hasLoaded) {
        hasLoaded = true;
        const preloaded = typeof window !== 'undefined'
          ? (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> }).PRELOADED_TAMWEEN_STATE
          : undefined;
        setAppState({
          bakeries: preloaded?.bakeries ?? INITIAL_BAKERIES,
          debts: preloaded?.debts ?? INITIAL_DEBTS,
          villages: preloaded?.villages ?? DEFAULT_VILLAGES_HIERARCHY,
          issuingEntities: preloaded?.issuingEntities ?? DEFAULT_ISSUING_ENTITIES,
          violationTypes: preloaded?.violationTypes ?? DEFAULT_VIOLATION_TYPES,
          activityStatuses: preloaded?.activityStatuses ?? DEFAULT_ACTIVITY_STATUSES,
          columnTitles: preloaded?.columnTitles ?? DEFAULT_COLUMN_TITLES,
          systemConfig: preloaded?.systemConfig ?? DEFAULT_SYSTEM_CONFIG,
          users: preloaded?.users ?? INITIAL_USERS,
          currentUser: null,
        });
        setSaveTimestamp(getArabicTimestamp());
      }
    }, 350);

    loadInitialState()
      .then((state) => {
        if (!hasLoaded) {
          hasLoaded = true;
          clearTimeout(failsafe);
          setAppState(state);
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
            columnTitles: DEFAULT_COLUMN_TITLES,
            systemConfig: DEFAULT_SYSTEM_CONFIG,
            users: INITIAL_USERS,
            currentUser: null,
          });
          setSaveTimestamp(getArabicTimestamp());
        }
      });

    return () => clearTimeout(failsafe);
  }, []);

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

  // Periodic 15-second heartbeat saving check
  useEffect(() => {
    const interval = setInterval(() => {
      if (appState) {
        persistFullState(appState);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [appState]);

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

  // Dynamic units for selected village filter (all units or village-specific)
  const availableUnitsFilter = useMemo(() => {
    if (!appState) return [];
    if (selectedVillage !== 'ALL') {
      const v = appState.villages.find((x) => x.village === selectedVillage);
      return v ? v.localUnits : [];
    }
    const set = new Set<string>();
    appState.villages.forEach((v) => v.localUnits.forEach((u) => set.add(u)));
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

  // Filtered bakeries for main table
  const filteredBakeries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return appState.bakeries.filter((b) => {
      if (selectedVillage !== 'ALL' && b.village !== selectedVillage) return false;
      if (selectedUnit !== 'ALL' && b.localUnit !== selectedUnit) return false;
      if (selectedActivity !== 'ALL' && b.activityStatus !== selectedActivity) return false;

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

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          b.bakeryOwnerName.toLowerCase().includes(q) ||
          b.machineNumber.includes(q) ||
          b.village.toLowerCase().includes(q) ||
          b.localUnit.toLowerCase().includes(q) ||
          b.phone.includes(q) ||
          b.nationalId.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    appState,
    selectedVillage,
    selectedUnit,
    selectedActivity,
    selectedDebtFilter,
    selectedLicenseExpiryFilter,
    searchTerm,
    bakeryRemainingDebtsMap,
  ]);

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

  // Handle Logout (Terminates session safely without resetting data)
  const handleLogout = useCallback((reason?: string) => {
    saveSessionUser(null);
    setLogoutReason(reason || null);
    setAppState((prev) => (prev ? { ...prev, currentUser: null } : null));
  }, []);

  // Auto-logout when user leaves the computer / idle for 15 minutes or closes browser
  useEffect(() => {
    if (!appState?.currentUser) return;

    let idleTimeout: ReturnType<typeof setTimeout>;
    const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes of inactivity

    const resetIdleTimer = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        handleLogout('تم قفل الشاشة وتسجيل الخروج التلقائي لحماية سرية البيانات لعدم وجود نشاط على الكمبيوتر.');
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
          setAppState((prev) => (prev ? { ...prev, currentUser: user } : null));
        }}
        onRegisterUser={(newUser) => {
          const updatedUsers = [...appState.users, newUser];
          triggerSave({ ...appState, users: updatedUsers }, 'تم تسجيل وحفظ المستخدم الجديد بنجاح');
        }}
      />
    );
  }

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
    triggerSave(
      { ...appState, bakeries: updated },
      existingIndex >= 0 ? `تم حفظ وتعديل بيانات مخبز (${bakery.bakeryOwnerName}) بنجاح` : `تم إضافة وحفظ بيانات مخبز (${bakery.bakeryOwnerName}) بنجاح`
    );
  };

  const handleDeleteBakery = (bakeryId: string, ownerName: string) => {
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
    triggerSave(
      { ...appState, debts: updated },
      existingIndex >= 0 ? 'تم تعديل وحفظ قيد المديونية بنجاح' : 'تم إضافة وتسجيل قيد المديونية بنجاح'
    );
  };

  const handleDeleteDebt = (debtId: string) => {
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
      ct.insuranceQuota,
      ct.actualQuota,
      ct.insuranceValue,
      ct.loavesCount,
      ct.villagePopulation,
      ct.perCapitaAverage,
      ct.beneficiaries2023,
      ct.avg2023,
      ct.beneficiaries2024,
      ct.avg2024,
      ct.beneficiaries2025,
      ct.avg2025,
      ct.avgDiff,
      ct.activityStatus,
      ct.breadType,
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
      b.insuranceQuota,
      b.actualQuota,
      b.insuranceValue,
      b.loavesCount,
      b.villagePopulation,
      b.perCapitaAverage,
      b.beneficiaries2023,
      b.avg2023,
      b.beneficiaries2024,
      b.avg2024,
      b.beneficiaries2025,
      b.avg2025,
      b.avgDiff,
      `"${b.activityStatus}"`,
      `"${b.breadType}"`,
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

  return (
    <div className="min-h-screen flex flex-col bg-black text-slate-100 font-sans selection:bg-amber-400 selection:text-black">
      {/* 1. Official Governmental Header Bar */}
      <header className="bg-gradient-to-r from-black via-slate-950 to-black text-white shadow-2xl border-b-2 border-amber-500/40 relative z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Right: Emblem and Titles */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsHeaderModalOpen(true)}
              title="انقر لتخصيص الهوية والترويسة والشعار"
              className="w-14 h-14 rounded-full bg-white p-1 border-2 border-amber-400 hover:border-amber-300 shadow-md flex items-center justify-center shrink-0 cursor-pointer transition hover:scale-105"
            >
              <img
                src={appState.systemConfig.logoBase64}
                alt="شعار وزارة التموين"
                className="w-full h-full object-contain"
              />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-black bg-amber-400 px-2.5 py-0.5 rounded shadow-sm tracking-wider border border-amber-300">
                  جمهورية مصر العربية
                </span>
                <span className="text-[11px] font-bold text-slate-300">
                  - وزارة التموين والتجارة الداخلية
                </span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.2 rounded-full font-bold">
                  {appState.systemConfig.governorateTitle}
                </span>
              </div>
              <h1 className="text-base font-black text-white leading-snug">
                {appState.systemConfig.directorateTitle}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-black text-black bg-amber-400 px-2.5 py-0.5 rounded shadow-sm border border-amber-300">
                  {appState.systemConfig.administrationTitle}
                </span>
                <span className="text-[10px] text-slate-300 font-mono">
                  {appState.systemConfig.englishSubtitle}
                </span>
              </div>
            </div>
          </div>

          {/* Left: Live Saving Indicator & User / Logout */}
          <div className="flex items-center gap-3">
            {/* Live Autosave Indicator */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black border transition-all ${
                isSavingPulse
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 scale-105'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isSavingPulse ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500'
                }`}
              />
              <span>تم الحفظ تلقائياً بنجاح ({saveTimestamp})</span>
            </div>

            {/* User Badge with Lock on Computer Exit */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-bold text-amber-100 shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{appState.currentUser.fullName}</span>
                <span className="text-[10px] text-amber-300 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-600/30">
                  {appState.currentUser.role === 'admin' ? 'مدير' : appState.currentUser.role === 'auditor' ? 'مراجع' : 'مفتش'}
                </span>
              </div>

              {/* Lock & Logout on leaving computer */}
              <button
                onClick={() => handleLogout()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-700 to-rose-800 hover:from-red-800 hover:to-rose-900 text-white rounded-lg text-xs font-black shadow-sm transition active:scale-95 cursor-pointer border border-red-500/50"
                title="قفل الشاشة وتسجيل الخروج الآمن عند مغادرة الكمبيوتر"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300 icon-animated" />
                <span>قفل وخروج</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Top Urgent Expiration Notification Banner (if any) */}
      {alertsList.length > 0 && (
        <div className="bg-gradient-to-r from-red-600 via-rose-700 to-red-600 text-white px-4 py-2 text-xs font-black flex items-center justify-between no-print shadow-inner">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 animate-bounce text-amber-300" />
              <span>
                تنبيه هام: يوجد ({alertsList.length}) وثيقة أو ترخيص أو عقد منتهية أو قاربت على الانتهاء خلال فترة 15 يوماً القادمة.
              </span>
            </div>
            <button
              onClick={() => setIsAlertsModalOpen(true)}
              className="px-3 py-1 bg-white text-red-900 rounded-md text-[11px] font-black hover:bg-amber-100 transition cursor-pointer"
            >
              عرض التفاصيل والإجراءات
            </button>
          </div>
        </div>
      )}

      {/* 2.1 Large Debts Alert Banner (> 20,000 EGP) */}
      {largeDebtsList.length > 0 && (
        <div className="bg-gradient-to-r from-amber-800 via-red-900 to-amber-900 text-white px-4 py-2 text-xs font-black flex items-center justify-between no-print shadow-md border-b-2 border-amber-400">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping inline-block" />
              <span>
                إشعار مديونيات كبرى (&gt; 20,000 ج.م): يوجد ({largeDebtsList.length}) مخبز بلدي تجاوزت مديونيتها 20,000 ج.م، ويلزم إلزامياً طلب دفعات أسبوعية محددة القيم والتواريخ!
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedInstallmentBakeryId(undefined);
                setIsWeeklyInstallmentsModalOpen(true);
              }}
              className="px-3.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-md text-[11px] font-black shadow transition cursor-pointer"
            >
              عرض جدول وقيم الدفعات الأسبوعية ({largeDebtsList.length})
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Workspace with Permanent Right-Side Navigation & Control Column */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto p-3 sm:p-4 flex flex-col lg:flex-row gap-4 items-start">
        {/* Right-Side Command & Controls Column (جميع الأزرار على اليمين تحت بعضها بشكل مرتب مع مؤثرات حركية) */}
        <aside
          aria-label="لوحة الأزرار والتحكم الرئيسية"
          className="w-full lg:w-72 xl:w-80 shrink-0 space-y-3.5 no-print"
        >
          {/* Permanent Official Directorate & Administration Emblem on the Base (شعار مديرية التموين بالغربية وإدارة تموين مركز المحلة بشكل ثابت وأساسي) */}
          <div className="bg-slate-900/95 border-2 border-amber-500/50 rounded-2xl p-4 shadow-xl text-center space-y-3 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-white p-1.5 border-2 border-amber-400 shadow-lg flex items-center justify-center transform hover:scale-105 transition-all duration-300">
                <img
                  src={appState.systemConfig.logoBase64}
                  alt="شعار وزارة التموين والتجارة الداخلية بالغربية"
                  className="w-full h-full object-contain"
                />
              </div>

              <span className="mt-2 text-[11px] font-black text-black bg-amber-400 px-3 py-0.5 rounded shadow-sm border border-amber-300">
                جمهورية مصر العربية
              </span>

              <h3 className="mt-1.5 text-xs font-black text-slate-100 leading-snug">
                {appState.systemConfig.directorateTitle}
              </h3>

              <div className="mt-1">
                <span className="text-[11px] font-black text-black bg-amber-400 px-3 py-0.5 rounded shadow-sm border border-amber-300 inline-block">
                  {appState.systemConfig.administrationTitle}
                </span>
              </div>

              <span className="mt-1 text-[9px] text-amber-300/80 font-mono tracking-wider">
                {appState.systemConfig.englishSubtitle}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                القاعدة متصلة ومؤمنة
              </span>
              <span className="font-mono text-slate-300">v3.0</span>
            </div>
          </div>

          {/* Primary View & System Actions Navigation Buttons (تحت بعضها بشكل مرتب على اليمين) */}
          <div className="bg-slate-900/90 border-2 border-slate-800 rounded-2xl p-3 shadow-xl space-y-2">
            <div className="px-2 py-1 text-[11px] font-black text-amber-400 flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>الأقسام الرئيسية والمديونيات</span>
            </div>

            {/* 1. Bakeries Database Button */}
            <button
              type="button"
              onClick={() => setActiveTab('bakeries')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                activeTab === 'bakeries'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-900/40 border border-amber-300'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 icon-animated" />
                <span>قاعدة بيانات المخابز</span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-black ${
                activeTab === 'bakeries' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
              }`}>
                {appState.bakeries.length}
              </span>
            </button>

            {/* 2. Debts and Penalties Button */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('debts');
                setDebtFilterBakeryId(undefined);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                activeTab === 'debts'
                  ? 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg shadow-red-950/50 border border-red-400'
                  : 'bg-slate-950 hover:bg-slate-800 text-rose-300 border border-red-900/40 hover:border-red-700/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 icon-animated" />
                <span>المديونيات على المخابز</span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-black ${
                activeTab === 'debts' ? 'bg-red-950 text-rose-200' : 'bg-slate-800 text-rose-300'
              }`}>
                {appState.debts.length}
              </span>
            </button>

            {/* 3. Alerts Button */}
            <button
              type="button"
              onClick={() => setIsAlertsModalOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 icon-animated" />
                <span>التنبيهات والمستندات</span>
              </div>
              {alertsList.length > 0 && (
                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                  {alertsList.length}
                </span>
              )}
            </button>

            {/* 4. Weekly Installments Button */}
            <button
              type="button"
              onClick={() => {
                setSelectedInstallmentBakeryId(undefined);
                setIsWeeklyInstallmentsModalOpen(true);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400 icon-animated" />
                <span>الدفعات الأسبوعية</span>
              </div>
              {largeDebtsList.length > 0 && (
                <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                  {largeDebtsList.length}
                </span>
              )}
            </button>

            {/* 5. Printable Reports & A4 Export Button */}
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-cyan-400 icon-animated" />
                <span>التقارير وكشوف الطباعة A4</span>
              </div>
              <ChevronLeft className="w-3.5 h-3.5 text-cyan-400" />
            </button>
          </div>

          {/* System Tools & Management Stack (أدوات النظام والنسخ الاحتياطي تحت بعضها على اليمين) */}
          <div className="bg-slate-900/90 border-2 border-slate-800 rounded-2xl p-3 shadow-xl space-y-2">
            <div className="px-2 py-1 text-[11px] font-black text-slate-300 flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span>إدارة النظام والبيانات</span>
            </div>

            {/* Quick Add Bakery */}
            <button
              type="button"
              onClick={() => {
                setBakeryToEdit(null);
                setIsBakeryModalOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-black shadow-md border border-amber-300 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>إضافة مخبز جديد للقاعدة</span>
            </button>

            {/* Math Audit */}
            <button
              type="button"
              onClick={() => setIsAuditModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-purple-300 border border-purple-500/30 hover:border-purple-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5 text-purple-400" />
              <span>تدقيق واختبار المعادلات</span>
            </button>

            {/* Villages & Local Units */}
            <button
              type="button"
              onClick={() => setIsVillageModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>القرى والوحدات المحلية ({appState.villages.length})</span>
            </button>

            {/* Hard Drive Auto Backup */}
            <button
              type="button"
              onClick={() => setIsBackupModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>النسخ التلقائي على القرص الصلب</span>
            </button>

            {/* Quick 1-Click Partition Save */}
            <button
              type="button"
              onClick={handleQuickPartitionSave}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>حفظ فوري في بارتشن D: / E:</span>
            </button>

            {/* Activity Status Management */}
            <button
              type="button"
              onClick={() => setIsActivityModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-emerald-400" />
              <span>أنشطة المخابز ({appState.activityStatuses.length})</span>
            </button>

            {/* Column Titles Customizer */}
            <button
              type="button"
              onClick={() => setIsColumnModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Columns3 className="w-3.5 h-3.5 text-amber-400" />
              <span>تعديل رؤوس الخانات</span>
            </button>

            {/* Download Standalone HTML App */}
            <button
              type="button"
              onClick={async () => {
                await downloadUpdatedAppHtml(appState);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>تحميل التطبيق المستقل (HTML)</span>
            </button>

            {/* Download Windows EXE Launcher */}
            <button
              type="button"
              onClick={async () => {
                await downloadWindowsExeLauncher();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white rounded-xl text-xs font-black shadow-md border border-red-400/50 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-white" />
              <span>تحميل مشغل الويندوز (EXE)</span>
            </button>

            {/* Open Standalone App in New Tab */}
            <button
              type="button"
              onClick={() => openStandaloneAppInNewTab()}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-blue-300 border border-blue-500/30 hover:border-blue-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>فتح صفحة البرنامج مستقلة</span>
            </button>

            {/* Customize Identity & Header */}
            <button
              type="button"
              onClick={() => setIsHeaderModalOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-amber-200 border border-amber-500/30 hover:border-amber-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>تخصيص الهوية والترويسة</span>
            </button>

            {/* Users & Inspectors Management (Admin Only) */}
            {appState.currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => setIsUsersModalOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-950 hover:bg-slate-800 text-purple-300 border border-purple-500/30 hover:border-purple-400 rounded-xl text-xs font-black transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span>إدارة المستخدمين والمفتشين</span>
              </button>
            )}
          </div>
        </aside>

        {/* Left-Side Main Data Workspace */}
        <main className="flex-1 min-w-0 w-full space-y-4">
          {/* Permanent Base Header Banner with Official Emblem & Supply Directorate Info */}
          <div className="bg-slate-900/95 border-2 border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white p-1 border-2 border-amber-400 shadow-md flex items-center justify-center shrink-0">
                <img
                  src={appState.systemConfig.logoBase64}
                  alt="شعار وزارة التموين"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black text-black bg-amber-400 px-2.5 py-0.5 rounded shadow-sm border border-amber-300">
                    جمهورية مصر العربية
                  </span>
                  <span className="text-xs font-bold text-slate-300">
                    - وزارة التموين والتجارة الداخلية
                  </span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.2 rounded-full font-bold">
                    {appState.systemConfig.governorateTitle}
                  </span>
                </div>
                <h2 className="text-sm sm:text-base font-black text-white mt-1">
                  {appState.systemConfig.directorateTitle}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-black text-black bg-amber-400 px-2.5 py-0.5 rounded shadow-sm border border-amber-300">
                    {appState.systemConfig.administrationTitle}
                  </span>
                  <span className="text-[11px] text-slate-400 font-bold">
                    - المنظومة الرقمية الشاملة لإدارة ومتابعة المخابز البلدية والمديونيات
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-black text-amber-300">
                إجمالي المخابز: {appState.bakeries.length}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-black text-rose-300">
                سجلات المديونيات: {appState.debts.length}
              </span>
            </div>
          </div>
        {activeTab === 'debts' ? (
          /* DEBTS VIEW */
          <DebtsView
            bakeries={appState.bakeries}
            debts={appState.debts}
            villages={appState.villages}
            issuingEntities={appState.issuingEntities}
            violationTypes={appState.violationTypes}
            systemConfig={appState.systemConfig}
            onSaveDebt={handleSaveDebt}
            onDeleteDebt={handleDeleteDebt}
            onUpdateEntities={(ents) => triggerSave({ ...appState, issuingEntities: ents })}
            onUpdateViolations={(viols) => triggerSave({ ...appState, violationTypes: viols })}
            filterBakeryId={debtFilterBakeryId}
            onClearBakeryFilter={() => setDebtFilterBakeryId(undefined)}
          />
        ) : (
          /* BAKERIES MAIN VIEW */
          <div className="space-y-4">
            {/* Quick Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-900 border-2 border-slate-800 rounded-xl p-3 text-center shadow-lg hover:border-slate-700 transition">
                <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
                  إجمالي المخابز المسجلة
                </span>
                <span className="stat-num text-white block">{bakeryStats.count}</span>
                <span className="text-[10px] text-slate-400 font-bold">مخبز بلدي</span>
              </div>

              <div className="bg-slate-900 border-2 border-amber-900/50 rounded-xl p-3 text-center shadow-lg hover:border-amber-600/50 transition">
                <span className="text-[11px] font-bold text-amber-400 block mb-0.5">
                  إجمالي الحصة التأمينية
                </span>
                <span className="stat-num text-amber-300 block">
                  {bakeryStats.totalInsurance.toLocaleString()}
                </span>
                <span className="text-[10px] text-amber-500 font-bold">شيكارة يومياً</span>
              </div>

              <div className="bg-slate-900 border-2 border-blue-900/50 rounded-xl p-3 text-center shadow-lg hover:border-blue-600/50 transition">
                <span className="text-[11px] font-bold text-blue-400 block mb-0.5">
                  إجمالي الحصة الفعلية
                </span>
                <span className="stat-num text-blue-300 block">
                  {bakeryStats.totalActual.toLocaleString()}
                </span>
                <span className="text-[10px] text-blue-500 font-bold">شيكارة يومياً</span>
              </div>

              <div className="bg-slate-900 border-2 border-emerald-900/50 rounded-xl p-3 text-center shadow-lg hover:border-emerald-600/50 transition">
                <span className="text-[11px] font-bold text-emerald-400 block mb-0.5">
                  إجمالي الأرغفة اليومية
                </span>
                <span className="stat-num text-emerald-300 block">
                  {bakeryStats.totalLoaves.toLocaleString()}
                </span>
                <span className="text-[10px] text-emerald-500 font-bold">رغيف (× 1350)</span>
              </div>

              <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-red-950 via-red-900 to-black text-white rounded-xl p-3 text-center shadow-xl border-2 border-red-700">
                <span className="text-[11px] font-black text-rose-200 block mb-0.5">
                  إجمالي المديونيات المتبقية
                </span>
                <span className="stat-num text-white block">
                  {bakeryStats.totalDebts.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Interactive Recharts Analytics Section */}
            <BakeryAnalyticsCharts bakeries={appState.bakeries} debts={appState.debts} villages={appState.villages} />

            {/* Toolbar: Action Buttons on the RIGHT side, Search on the left, Filters */}
            <div className="bg-slate-900 border-2 border-slate-800 rounded-xl p-3.5 shadow-xl space-y-3 no-print">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Primary Action Buttons - Placed FIRST on the RIGHT side with smooth animations */}
                <div className="flex items-center flex-wrap gap-2.5 justify-start">
                  {/* 1. Add Bakery Button (Glowing Golden with animated icon & pulse) */}
                  <button
                    onClick={() => {
                      setBakeryToEdit(null);
                      setIsBakeryModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-900/30 border border-amber-300 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer pulse-glow"
                    title="إضافة مخبز جديد إلى المنظومة"
                  >
                    <Plus className="w-4 h-4 text-slate-950 icon-animated" />
                    <span>إضافة مخبز جديد</span>
                  </button>

                  {/* 2. Golden Modify Column Headers Button */}
                  <button
                    onClick={() => setIsColumnModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-amber-300 font-black rounded-xl text-xs shadow-md border border-amber-500/40 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                    title="تخصيص وتعديل أسماء رؤوس أعمدة وخانات المخبز"
                  >
                    <Columns3 className="w-4 h-4 text-amber-400 icon-animated" />
                    <span>تعديل رؤوس الخانات</span>
                  </button>

                  {/* 3. Activity Status Management Button */}
                  <button
                    onClick={() => setIsActivityModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-950 to-slate-900 hover:from-emerald-900 hover:to-slate-800 text-emerald-300 font-black rounded-xl text-xs border border-emerald-500/40 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                    title="تعديل وإضافة وتخصيص حالات نشاط المخابز"
                  >
                    <Settings className="w-4 h-4 text-emerald-400 icon-spin-hover" />
                    <span>أنشطة المخابز ({appState.activityStatuses.length})</span>
                  </button>

                  {/* 4. Export CSV */}
                  <button
                    onClick={handleExportBakeryCSV}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-xs font-black shadow-md border border-emerald-400/50 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                    title="تصدير كشف إكسل معتمد بترميز UTF-8 عربي"
                  >
                    <FileSpreadsheet className="w-4 h-4 icon-animated text-emerald-200" />
                    <span>تصدير Excel</span>
                  </button>

                  {/* 5. Open Printable Report Center */}
                  <button
                    onClick={() => setIsReportModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-slate-800 via-amber-950 to-slate-900 hover:from-slate-700 hover:to-amber-900 text-amber-200 rounded-xl text-xs font-black shadow-md border border-amber-500/50 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                    title="فتح مركز التقارير وكشوف الطباعة A4 بالعرض ونسب السداد"
                  >
                    <Printer className="w-4 h-4 text-amber-400 icon-animated" />
                    <span>كشف الطباعة A4</span>
                  </button>
                </div>

                {/* Search Bar placed on the other side */}
                <div className="relative min-w-[260px] flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 icon-animated" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="بحث باسم صاحب المخبز، رقم الماكينة، القرية، التليفون، الرقم القومي..."
                    className="w-full pr-9 pl-3 py-2 bg-black border border-slate-700 rounded-xl text-xs font-black text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-right transition"
                  />
                </div>
              </div>

              {/* Dynamic Filtering Dropdowns */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">القرية</label>
                  <select
                    value={selectedVillage}
                    onChange={(e) => {
                      setSelectedVillage(e.target.value);
                      setSelectedUnit('ALL');
                    }}
                    className="w-full px-2.5 py-1.5 bg-black border border-slate-700 rounded-lg font-black text-slate-100 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">كافة القرى ({appState.villages.length})</option>
                    {appState.villages.map((v) => (
                      <option key={v.village} value={v.village}>
                        {v.village}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">
                    الوحدة المحلية التابعة
                  </label>
                  <select
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-black border border-slate-700 rounded-lg font-black text-slate-100 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">
                      {selectedVillage === 'ALL'
                        ? 'كافة الوحدات المحلية بالمركز'
                        : `كافة الوحدات التابعة لـ (${selectedVillage})`}
                    </option>
                    {selectedVillage === 'ALL' ? (
                      appState.villages.map((v) => (
                        <optgroup key={v.village} label={`قرية ${v.village}`}>
                          {v.localUnits.map((u) => (
                            <option key={`${v.village}-${u}`} value={u}>
                              {u}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    ) : (
                      availableUnitsFilter.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-black text-slate-300">نشاط المخبز</label>
                    <button
                      type="button"
                      onClick={() => setIsActivityModalOpen(true)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-black flex items-center gap-0.5 cursor-pointer"
                      title="تعديل قائمة أنشطة المخابز"
                    >
                      <Settings className="w-3 h-3" />
                      <span>تعديل</span>
                    </button>
                  </div>
                  <select
                    value={selectedActivity}
                    onChange={(e) => setSelectedActivity(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-black border border-slate-700 rounded-lg font-black text-slate-100 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">كافة حالات النشاط ({appState.bakeries.length} مخبز)</option>
                    {appState.activityStatuses.map((st) => {
                      const count = appState.bakeries.filter((b) => b.activityStatus === st).length;
                      return (
                        <option key={st} value={st}>
                          {st} ({count} مخبز)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-300 mb-1">موقف المديونية</label>
                  <select
                    value={selectedDebtFilter}
                    onChange={(e) => setSelectedDebtFilter(e.target.value as 'ALL' | 'HAS_DEBT' | 'NO_DEBT')}
                    className="w-full px-2.5 py-1.5 bg-black border border-slate-700 rounded-lg font-black text-slate-100 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">الكل (مديونيات وخالص)</option>
                    <option value="HAS_DEBT">عليه مديونية متبقية فقط</option>
                    <option value="NO_DEBT">خالص المديونية (0 ج.م)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Main Bakery Table with Grouped Headers and Row Highlight */}
            <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto max-h-[700px] relative">
                <table className="w-full text-center border-collapse text-xs">
                  {/* Super Grouped Headers */}
                  <thead className="sticky top-0 z-20 bg-black text-white font-black">
                    <tr className="border-b border-slate-800">
                      {/* Index Column Header */}
                      <th
                        rowSpan={2}
                        className="py-2.5 px-1 bg-black border-l border-slate-800 text-slate-300 w-10 text-center"
                      >
                        {ct.index}
                      </th>

                      {/* Actions Column Header moved to the RIGHT side as requested */}
                      <th
                        rowSpan={2}
                        className="py-2.5 px-2 bg-gradient-to-r from-amber-950 to-slate-900 border-l border-slate-800 text-amber-300 min-w-[105px] no-print text-center"
                      >
                        {ct.actions}
                      </th>

                      {/* 1. Basic Info (Owner Name, Machine, Village, Local Unit) */}
                      <th
                        colSpan={4}
                        className="py-2.5 px-2 bg-black border-l border-slate-800 text-amber-300"
                      >
                        البيانات الأساسية وموقع المخبز
                      </th>

                      {/* 2. Remaining Debt */}
                      <th
                        rowSpan={2}
                        className="py-2.5 px-2 bg-red-950 border-l border-slate-800 text-rose-200 min-w-[110px]"
                      >
                        {ct.remainingDebt}
                      </th>

                      {/* 3. Quotas */}
                      <th
                        colSpan={4}
                        className="py-2.5 px-2 bg-amber-950 border-l border-slate-800 text-amber-200"
                      >
                        الحصص والبيانات التموينية والتأمينية
                      </th>

                      {/* 4. Demographics & Averages */}
                      <th
                        colSpan={9}
                        className="py-2.5 px-2 bg-slate-900 border-l border-slate-800 text-blue-200"
                      >
                        إحصائيات السكان والمستفيدين والمتوسطات (2023 - 2025)
                      </th>

                      {/* 5. Classification & Operations */}
                      <th
                        colSpan={5}
                        className="py-2.5 px-2 bg-emerald-950 border-l border-slate-800 text-emerald-200"
                      >
                        التصنيف والتشغيل
                      </th>

                      {/* 6. Contact and Identity */}
                      <th
                        colSpan={2}
                        className="py-2.5 px-2 bg-indigo-950 border-l border-slate-800 text-indigo-200"
                      >
                        بيانات الاتصال والهوية
                      </th>

                      {/* 7. Licenses & Dates */}
                      <th
                        colSpan={4}
                        className="py-2.5 px-2 bg-slate-950 border-l border-slate-800 text-amber-300"
                      >
                        التراخيص والعقود وتواريخ السريان
                      </th>
                    </tr>

                    {/* Sub Columns Headers */}
                    <tr className="bg-slate-950 text-[11px] text-slate-300 font-black border-b border-slate-800">
                      {/* Basic Info sub-headers (Index and Actions are rowSpan 2 above) */}
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[160px]">{ct.bakeryOwnerName}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[95px]">{ct.machineNumber}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[80px]">{ct.village}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[95px]">{ct.localUnit}</th>

                      {/* 3. Quotas */}
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[95px]">{ct.insuranceQuota}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[95px]">{ct.actualQuota}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[100px]">{ct.insuranceValue}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[95px] bg-amber-950/80 text-amber-300">
                        {ct.loavesCount}
                      </th>

                      {/* 4. Demographics & Averages */}
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.villagePopulation}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[90px] bg-amber-950/50 text-amber-300">
                        {ct.perCapitaAverage}
                      </th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[80px]">{ct.beneficiaries2023}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[75px]">{ct.avg2023}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[80px]">{ct.beneficiaries2024}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[75px]">{ct.avg2024}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[80px]">{ct.beneficiaries2025}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[75px]">{ct.avg2025}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[80px] bg-slate-900 text-amber-300">
                        {ct.avgDiff}
                      </th>

                      {/* 5. Classification & Operations */}
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[80px]">{ct.activityStatus}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[95px]">{ct.breadType}</th>
                      <th className="py-2 px-1 border-l border-slate-800 min-w-[75px] text-amber-300">
                        {ct.breadTypeCount}
                      </th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.lineType}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.fuelType}</th>

                      {/* 6. Contact and Identity */}
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[100px]">{ct.phone}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[120px]">{ct.nationalId}</th>

                      {/* 7. Licenses & Dates */}
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.commercialRegDate}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.bakeryLicenseDate}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.leaseAgreementDate}</th>
                      <th className="py-2 px-2 border-l border-slate-800 min-w-[85px]">{ct.taxCardDate}</th>
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-slate-800 font-bold">
                    {filteredBakeries.length === 0 ? (
                      <tr>
                        <td colSpan={32} className="py-12 text-center text-slate-400 font-black">
                          لا توجد أي مخابز مطابقة لمعايير البحث الحالية
                        </td>
                      </tr>
                    ) : (
                      filteredBakeries.map((b, index) => {
                        const isSelected = selectedBakeryRowId === b.id;
                        const remainingDebt = bakeryRemainingDebtsMap[b.id] || 0;

                        // Check document expiry
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

                        return (
                          <tr
                            key={b.id}
                            onClick={() => setSelectedBakeryRowId(b.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'row-selected'
                                : index % 2 === 0
                                ? 'bg-slate-900/90 hover:bg-slate-800/90'
                                : 'bg-slate-950 hover:bg-slate-800/90'
                            }`}
                          >
                            {/* 1. Index & Actions on the RIGHT Side */}
                            <td className="py-2.5 px-1 border-l border-slate-800 text-slate-400 num-enlarged">{index + 1}</td>

                            {/* Actions Buttons - Now positioned on the RIGHT side of the table */}
                            <td className="py-2.5 px-2 border-l border-slate-800 no-print">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBakeryToEdit(b);
                                    setIsBakeryModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-amber-950/80 text-amber-400 hover:text-amber-300 border border-transparent hover:border-amber-700/60 rounded-xl transition-all duration-200 transform hover:scale-120 active:scale-95 shadow-sm cursor-pointer"
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
                                  className="p-1.5 hover:bg-red-950/80 text-red-400 hover:text-red-300 border border-transparent hover:border-red-700/60 rounded-xl transition-all duration-200 transform hover:scale-120 active:scale-95 shadow-sm cursor-pointer"
                                  title="حذف المخبز"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>

                            <td className="py-2.5 px-2 border-l border-slate-800 font-black text-slate-100 text-right">
                              {b.bakeryOwnerName}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged font-black text-amber-300">
                              {b.machineNumber}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 text-slate-200">{b.village}</td>
                            <td className="py-2.5 px-2 border-l border-slate-800 text-slate-400">{b.localUnit}</td>

                            {/* 2. Remaining Debt (Smart Badge) */}
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged">
                              {remainingDebt > 0 ? (
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDebtFilterBakeryId(b.id);
                                      setActiveTab('debts');
                                    }}
                                    className={`px-2 py-1 rounded-lg text-xs font-black transition-all transform hover:scale-105 active:scale-95 cursor-pointer border ${
                                      remainingDebt > 20000
                                        ? 'bg-red-600 text-white border-red-500 shadow-md animate-pulse'
                                        : 'bg-red-950/80 hover:bg-red-900 text-red-200 border-red-700/80'
                                    }`}
                                    title="انقر للانتقال لمديونيات هذا المخبز وتصفيتها"
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
                                      className="px-1.5 py-0.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-600/60 rounded text-[10px] font-black tracking-tight cursor-pointer shadow-2xs whitespace-nowrap transition-transform hover:scale-105"
                                      title="مطلوب دفعات أسبوعية - انقر لعرض جدول وقيم الدفعات"
                                    >
                                      دفعات أسبوعية (&gt; 20 ألف)
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-700/70 rounded-lg text-[11px] font-black shadow-inner">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  خالص (0)
                                </span>
                              )}
                            </td>

                            {/* 3. Quotas */}
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged font-black text-amber-400">
                              {b.insuranceQuota}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged font-black text-cyan-300">
                              {b.actualQuota}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-300">
                              {b.insuranceValue?.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged font-black bg-amber-950/30 text-amber-200">
                              {b.loavesCount?.toLocaleString()}
                            </td>

                            {/* 4. Demographics & Averages */}
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-300">
                              {b.villagePopulation?.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged font-black bg-amber-950/40 text-amber-300">
                              {b.perCapitaAverage}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-400">
                              {b.beneficiaries2023?.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-300">{b.avg2023}</td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-400">
                              {b.beneficiaries2024?.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-300">{b.avg2024}</td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-400">
                              {b.beneficiaries2025?.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-slate-300">{b.avg2025}</td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged font-black bg-slate-800 text-amber-300">
                              {b.avgDiff}
                            </td>

                            {/* 5. Classification & Operations */}
                            <td className="py-2.5 px-2 border-l border-slate-800">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  b.activityStatus === 'شغال'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                    : 'bg-red-950 text-red-300 border border-red-700/60'
                                }`}
                              >
                                {b.activityStatus}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 text-slate-200">{b.breadType}</td>
                            <td className="py-2.5 px-1 border-l border-slate-800 num-enlarged font-black text-amber-400 bg-amber-950/20">
                              {b.breadTypeCount || 1}
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 text-slate-300">{b.lineType}</td>
                            <td className="py-2.5 px-2 border-l border-slate-800 text-slate-300">{b.fuelType}</td>

                            {/* 6. Contact and Identity */}
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-left tracking-wide font-mono">
                              <a
                                href={`tel:${b.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-amber-400 hover:text-amber-300 hover:underline"
                              >
                                {b.phone}
                              </a>
                            </td>
                            <td className="py-2.5 px-2 border-l border-slate-800 num-enlarged text-left font-mono text-slate-300">
                              {b.nationalId}
                            </td>

                            {/* 7. Licenses & Dates */}
                            <td
                              className={`py-2.5 px-2 border-l border-slate-800 num-enlarged ${
                                hasCommWarning ? 'bg-red-950/80 text-red-300 font-black border border-red-700' : 'text-slate-300'
                              }`}
                            >
                              {b.commercialRegDate || '-'}
                            </td>
                            <td
                              className={`py-2.5 px-2 border-l border-slate-800 num-enlarged ${
                                hasLicenseWarning ? 'bg-red-950/80 text-red-300 font-black border border-red-700' : 'text-slate-300'
                              }`}
                            >
                              {b.bakeryLicenseDate || '-'}
                            </td>
                            <td
                              className={`py-2.5 px-2 border-l border-slate-800 num-enlarged ${
                                hasLeaseWarning ? 'bg-red-950/80 text-red-300 font-black border border-red-700' : 'text-slate-300'
                              }`}
                            >
                              {b.leaseAgreementDate || '-'}
                            </td>
                            <td
                              className={`py-2.5 px-2 border-l border-slate-800 num-enlarged ${
                                hasTaxWarning ? 'bg-red-950/80 text-red-300 font-black border border-red-700' : 'text-slate-300'
                              }`}
                            >
                              {b.taxCardDate || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Floating Animated Base Quick Actions Dock on the Right Side (شريط الإجراءات السريعة في القاعدة على اليمين) */}
      <aside aria-label="أزرار القاعدة السريعة" className="fixed bottom-6 right-6 z-40 no-print flex flex-col items-end gap-2.5">
        <div className="bg-slate-950/95 backdrop-blur-md p-2 rounded-2xl border-2 border-amber-500/40 shadow-[0_10px_35px_rgba(0,0,0,0.85)] flex flex-row items-center gap-2">
          {/* Quick Add Bakery Button */}
          <button
            type="button"
            onClick={() => {
              setBakeryToEdit(null);
              setIsBakeryModalOpen(true);
            }}
            className="group relative flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg border border-amber-300 transition-all duration-300 transform hover:scale-108 active:scale-95 cursor-pointer"
            title="إضافة مخبز جديد إلى القاعدة"
          >
            <Plus className="w-4 h-4 text-slate-950 stroke-[3] transition-transform duration-300 group-hover:rotate-90" />
            <span className="hidden sm:inline">إضافة مخبز</span>
          </button>

          {/* Quick Print A4 / Reports Center */}
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="group relative flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 font-black text-xs rounded-xl shadow-md transition-all duration-300 transform hover:scale-108 active:scale-95 cursor-pointer"
            title="طباعة كشف المخابز A4 رسمياً وفتح مركز التقارير"
          >
            <Printer className="w-4 h-4 text-cyan-400 transition-transform duration-300 group-hover:-translate-y-0.5" />
            <span className="hidden sm:inline">طباعة الكشف</span>
          </button>

          {/* Quick Backup to Hard Drive */}
          <button
            type="button"
            onClick={() => setIsBackupModalOpen(true)}
            className="group relative flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 font-black text-xs rounded-xl shadow-md transition-all duration-300 transform hover:scale-108 active:scale-95 cursor-pointer"
            title="حفظ تلقائي للنسخة الاحتياطية على القرص الصلب (Hard Disk)"
          >
            <HardDrive className="w-4 h-4 text-emerald-400 transition-transform duration-300 group-hover:scale-110" />
            <span className="hidden md:inline">النسخ التلقائي</span>
          </button>

          {/* Quick Download EXE / HTML App */}
          <button
            type="button"
            onClick={async () => {
              await downloadWindowsExeLauncher();
            }}
            className="group relative flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-xs rounded-xl shadow-lg border border-red-400/60 transition-all duration-300 transform hover:scale-108 active:scale-95 cursor-pointer"
            title="تحميل التطبيق المحدث (تشغيل مباشر مستقل بصيغة EXE / HTML)"
          >
            <Download className="w-4 h-4 text-white stroke-[2.5] transition-transform duration-300 group-hover:translate-y-0.5" />
            <span className="hidden lg:inline">تحميل التطبيق</span>
          </button>
        </div>
      </aside>

      {/* 4. Footer with Official Attribution Watermark */}
      <footer className="bg-black text-slate-300 border-t border-slate-900 py-4 px-4 text-center text-xs font-bold no-print mt-auto">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <p className="text-slate-400">
            {appState.systemConfig.governorateTitle} - {appState.systemConfig.directorateTitle} - {appState.systemConfig.administrationTitle}
          </p>

          <p className="text-amber-400 bg-amber-950/70 border border-amber-600/40 rounded-lg px-4 py-1.5 font-black text-xs shadow-sm">
            تنفيذ وتصميم م/ أحمد الحسيني - تليفون: 01004414038
          </p>

          <p className="text-[11px] text-slate-500 font-mono">
            نظام قاعدة بيانات المخابز والمديونيات v3.0
          </p>
        </div>
      </footer>

      {/* MODALS */}
      {/* 1. Add / Edit Bakery Modal */}
      {isBakeryModalOpen && (
        <BakeryModal
          isOpen={isBakeryModalOpen}
          onClose={() => setIsBakeryModalOpen(false)}
          bakeryToEdit={bakeryToEdit}
          villages={appState.villages}
          activityStatuses={appState.activityStatuses}
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
          onSave={handleSaveBakery}
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

      {/* 4. Header Customizer Modal */}
      {isHeaderModalOpen && (
        <HeaderCustomizerModal
          isOpen={isHeaderModalOpen}
          onClose={() => setIsHeaderModalOpen(false)}
          config={appState.systemConfig}
          onSaveConfig={(updatedConfig) =>
            triggerSave({ ...appState, systemConfig: updatedConfig }, 'تم حفظ وتحديث ترويسة وهوية المنظومة بنجاح')
          }
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
        />
      )}

      {/* 7. Backup & Partition & Factory Reset Modal */}
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
    </div>
  );
}
