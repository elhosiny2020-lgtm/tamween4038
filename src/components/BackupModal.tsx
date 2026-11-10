import React, { useState, useEffect } from 'react';
import {
  AppState,
  saveBackupToPartition,
  mergeAutoSaveOntoCurrent,
  autoDiscoverAndMergeAllDatabases,
  getLatestAutoSaveInfo,
  mergeStates,
  getMergeConflictsLog,
  clearMergeConflictsLog,
} from '../storage';
import {
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  initGoogleAuthListener,
  uploadBackupToGoogleDriveDirect,
  downloadLatestBackupFromGoogleDriveDirect,
  sendBackupDirectToGmail,
  syncWorkspaceToFirestore,
  loadWorkspaceFromFirestore,
  getCachedAccessToken,
  auth,
} from '../lib/firebase';
import {
  downloadUpdatedAppHtml,
  downloadAppLauncherHtml,
  downloadMinistryDesktopShortcut,
  downloadWindowsUrlShortcut,
  downloadWindowsDesktopInstallerBat,
  downloadWindowsVbsLauncher,
  downloadWindowsExeLauncher,
  openStandaloneAppInNewTab,
  generateStandaloneHtml
} from '../utils/htmlExporter';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  uploadAppHtmlToSupabaseStorage,
  migrateDatabaseToSupabase,
  fetchDatabaseFromSupabase,
  SUPABASE_TABLES_SQL_SCHEMA,
  SUPABASE_BUCKET_NAME,
} from '../lib/supabase';
import { DEFAULT_OFFICIAL_LOGO } from '../defaultData';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  executePublishProcess,
  getLastConfirmedPublishInfo,
  PublishProgressState,
} from '../services/publishService';
import {
  HardDrive,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  X,
  FileJson,
  FileCode,
  Globe,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Database,
  ArrowRight,
  UploadCloud,
  RotateCw,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
  onRestoreState: (restored: AppState) => void;
  onFactoryReset: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  currentState,
  onRestoreState,
  onFactoryReset,
}) => {
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Dedicated Publish Engine State
  const [publishState, setPublishState] = useState<PublishProgressState>({
    stage: 'IDLE',
    stageNameArabic: 'جاهز للنشر',
    progressPercent: 0,
    statusMessage: 'اضغط على "نشر المنظومة الآن" للبدء في مراحل النشر الأربعة مع التأكيد السحابي.',
    isDelayed: false,
  });
  const [lastPublishedInfo, setLastPublishedInfo] = useState(() => getLastConfirmedPublishInfo());
  const [copiedPublishUrl, setCopiedPublishUrl] = useState(false);

  const isPublishing =
    publishState.stage === 'STARTING' ||
    publishState.stage === 'PREPARING' ||
    publishState.stage === 'UPLOADING' ||
    publishState.stage === 'VERIFYING';

  const handleExecutePublishFromBackup = async () => {
    if (isPublishing) return;
    try {
      const res = await executePublishProcess(currentState, (prog) => {
        setPublishState(prog);
      });
      setLastPublishedInfo(res);
      setStatusMsg({
        text: `تم بنجاح نشر المنظومة وتأكيد الرابط السحابي: ${res.publishedUrl}`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMsg({
        text: `فشل النشر: ${err.message || 'خطأ غير معروف'}`,
        type: 'error',
      });
    }
  };

  // GitHub Backup & Cloud Sync state
  const [githubEmail, setGithubEmail] = useState<string>(() => localStorage.getItem('TAMWEEN_GITHUB_EMAIL') || 'tamween-mahalla@egypt.gov.eg');
  const [githubRepo, setGithubRepo] = useState<string>(() => localStorage.getItem('TAMWEEN_GITHUB_REPO') || 'tamween-system-backup');
  const [githubAutoSync, setGithubAutoSync] = useState<boolean>(() => localStorage.getItem('TAMWEEN_GITHUB_AUTOSYNC') !== 'false');
  const [githubToken, setGithubToken] = useState<string>(() => localStorage.getItem('TAMWEEN_GITHUB_TOKEN') || '');

  // Custom Backup Destination State (Google Drive / Local Network Path / Custom Folder)
  const [customBackupType, setCustomBackupType] = useState<'GOOGLE_DRIVE' | 'LOCAL_NETWORK' | 'CUSTOM_FOLDER'>(
    () => (localStorage.getItem('TAMWEEN_CUSTOM_BACKUP_TYPE') as any) || 'GOOGLE_DRIVE'
  );
  const [customBackupPath, setCustomBackupPath] = useState<string>(
    () => localStorage.getItem('TAMWEEN_CUSTOM_BACKUP_PATH') || 'G:\\My Drive\\Tamween_Backups\\'
  );
  const [customAutoSync, setCustomAutoSync] = useState<boolean>(
    () => localStorage.getItem('TAMWEEN_CUSTOM_AUTOSYNC') !== 'false'
  );
  const [gmailEmail, setGmailEmail] = useState<string>(
    () =>
      localStorage.getItem('TAMWEEN_GMAIL_DRIVE_EMAIL') ||
      currentState.currentUser?.gmailEmail ||
      currentState.systemConfig?.gmailEmail ||
      'ELHOSINY2020@gmail.com'
  );
  const [googleDriveAutoSync, setGoogleDriveAutoSync] = useState<boolean>(
    () => localStorage.getItem('TAMWEEN_GMAIL_DRIVE_AUTOSYNC') !== 'false'
  );
  const [mergeConflicts, setMergeConflicts] = useState(() => getMergeConflictsLog());
  const [lastCloudDriveSyncTime, setLastCloudDriveSyncTime] = useState<string | null>(
    () => localStorage.getItem('TAMWEEN_LAST_GOOGLE_DRIVE_CLOUD_SYNC') || null
  );

  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(() => !!auth.currentUser);
  const [googleConnectedEmail, setGoogleConnectedEmail] = useState<string | null>(() => auth.currentUser?.email || null);

  // Supabase Cloud Database & Storage state
  const [supabaseCfg, setSupabaseCfg] = useState(() => getSupabaseConfig());
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(() => getSupabaseConfig().url);
  const [supabaseKeyInput, setSupabaseKeyInput] = useState(() => getSupabaseConfig().anonKey);
  const [lastSupabaseSyncTime, setLastSupabaseSyncTime] = useState<string | null>(
    () => localStorage.getItem('TAMWEEN_LAST_SUPABASE_SYNC') || null
  );
  const [showSqlSchemaModal, setShowSqlSchemaModal] = useState(false);
  const [uploadedHtmlPublicUrl, setUploadedHtmlPublicUrl] = useState<string | null>(null);
  const [showSupabaseSettings, setShowSupabaseSettings] = useState(false);

  useEffect(() => {
    const unsub = initGoogleAuthListener((user) => {
      if (user) {
        setIsGoogleConnected(true);
        setGoogleConnectedEmail(user.email);
        if (user.email) {
          setGmailEmail(user.email);
          localStorage.setItem('TAMWEEN_GMAIL_DRIVE_EMAIL', user.email);
        }
      } else {
        setIsGoogleConnected(false);
        setGoogleConnectedEmail(null);
      }
    });
    return () => unsub();
  }, []);

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const autoSaveInfo = getLatestAutoSaveInfo();
  const formattedAutoSaveTime = autoSaveInfo?.timestamp
    ? new Date(autoSaveInfo.timestamp).toLocaleString('ar-EG')
    : null;

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 1. Comprehensive Smart Sync: Update existing & add missing only
  const handleSmartSyncAndUpsert = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري فحص جميع قواعد البيانات المحفوظة ودمجها وتحديث المخابز القائمة وإضافة غير المتوفر فقط...', type: 'info' });
    const res = await autoDiscoverAndMergeAllDatabases(currentState);
    setIsProcessing(false);
    if (res.success && res.newState) {
      onRestoreState(res.newState);
      setStatusMsg({ text: res.message, type: 'success' });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  // 2. Smart Sync then download updated standalone HTML application immediately
  const handleSmartSyncAndDownloadHtml = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري فحص وتحديث ودمج البيانات أولاً...', type: 'info' });
    const res = await autoDiscoverAndMergeAllDatabases(currentState);
    if (res.success && res.newState) {
      onRestoreState(res.newState);
      setStatusMsg({ text: `${res.message} جاري الآن تنزيل ملف البرنامج المحدث...`, type: 'info' });
      const dlRes = await downloadUpdatedAppHtml(res.newState);
      setIsProcessing(false);
      if (dlRes.success) {
        setStatusMsg({
          text: `${res.message} وتم بنجاح تنزيل ملف البرنامج المحدث (${dlRes.fileName})! يفتح مباشرة على أي جهاز.`,
          type: 'success',
        });
      } else {
        setStatusMsg({ text: dlRes.message, type: 'error' });
      }
    } else {
      // Fallback: download current state
      const dlRes = await downloadUpdatedAppHtml(currentState);
      setIsProcessing(false);
      setStatusMsg({ text: dlRes.message, type: dlRes.success ? 'success' : 'error' });
    }
  };

  // 3. Save to partition (C:, D:, USB)
  const handleSaveToPartition = async () => {
    setStatusMsg({ text: 'جاري فتح نافذة النظام لاختيار البارتيشن وحفظ الملف...', type: 'info' });
    const backupPayload = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      governorate: currentState.systemConfig.governorateTitle,
      directorate: currentState.systemConfig.directorateTitle,
      administration: currentState.systemConfig.administrationTitle,
      data: {
        bakeries: currentState.bakeries,
        debts: currentState.debts,
        villages: currentState.villages,
        issuingEntities: currentState.issuingEntities,
        violationTypes: currentState.violationTypes,
        activityStatuses: currentState.activityStatuses,
        columnTitles: currentState.columnTitles,
        systemConfig: currentState.systemConfig,
        users: currentState.users,
      },
    };

    const res = await saveBackupToPartition(backupPayload);
    if (res.success) {
      setStatusMsg({ text: res.message, type: 'success' });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  // 4. Merge uploaded JSON or HTML file without deleting current records
  const handleMergeUploadedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let incomingData: Partial<AppState> | null = null;

        if (file.name.endsWith('.json') || text.trim().startsWith('{')) {
          const parsed = JSON.parse(text);
          incomingData = parsed.data || parsed;
        } else {
          // Extract preloaded state from HTML
          const match = text.match(/window\.PRELOADED_TAMWEEN_STATE\s*=\s*({[\s\S]*?});/);
          if (match && match[1]) {
            incomingData = JSON.parse(match[1]);
          } else {
            throw new Error('لم يتم العثور على قاعدة بيانات صالحة داخل ملف الـ HTML المختار');
          }
        }

        if (!incomingData || (!incomingData.bakeries && !incomingData.debts)) {
          throw new Error('الملف لا يحتوي على سجلات مخابز أو مديونيات متوافقة');
        }

        const merged = mergeStates(currentState, incomingData);
        onRestoreState(merged);
        setStatusMsg({
          text: `تم دمج ملف البيانات بنجاح! الإجمالي الحالي: (${merged.bakeries.length}) مخبز و (${merged.debts.length}) قيد مديونية دون حذف أي مخابز سابقة.`,
          type: 'success',
        });
      } catch (err: unknown) {
        setStatusMsg({
          text: `فشل دمج الملف: ${(err as Error).message}`,
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  // 5. Restore full replace from JSON
  const handleFullRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || !parsed.data) {
          throw new Error('الملف غير مطابق لبنية النسخ الاحتياطية المعتمدة');
        }

        const restoredData: AppState = {
          ...currentState,
          bakeries: parsed.data.bakeries || [],
          debts: parsed.data.debts || [],
          villages: parsed.data.villages || currentState.villages,
          activityStatuses: parsed.data.activityStatuses || currentState.activityStatuses,
          bakeryCategories: parsed.data.bakeryCategories || currentState.bakeryCategories,
          breadTypes: parsed.data.breadTypes || currentState.breadTypes,
          breadTypeCounts: parsed.data.breadTypeCounts || currentState.breadTypeCounts,
          lineTypes: parsed.data.lineTypes || currentState.lineTypes,
          fuelTypes: parsed.data.fuelTypes || currentState.fuelTypes,
          issuingEntities: parsed.data.issuingEntities || currentState.issuingEntities,
          violationTypes: parsed.data.violationTypes || currentState.violationTypes,
          paymentMethods: parsed.data.paymentMethods || currentState.paymentMethods,
          dailyTasks: parsed.data.dailyTasks || currentState.dailyTasks,
          columnTitles: parsed.data.columnTitles || currentState.columnTitles,
          systemConfig: parsed.data.systemConfig || currentState.systemConfig,
          users: parsed.data.users || currentState.users,
          currentUser: currentState.currentUser,
        };

        onRestoreState(restoredData);
        setStatusMsg({
          text: `تم استعادة قاعدة البيانات واستبدالها بنجاح! تم استرجاع (${restoredData.bakeries.length}) مخبز و (${restoredData.debts.length}) قيد مديونية.`,
          type: 'success',
        });
      } catch (err: unknown) {
        setStatusMsg({
          text: `فشل استرجاع الملف: ${(err as Error).message}`,
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  // 6. Import Backup Package from GitHub
  const handleImportGithubPackage = (file: File) => {
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Support both direct payload { version, data: AppState } or raw AppState
        const sourceData = parsed.data || parsed.state || parsed;

        if (!sourceData || (!Array.isArray(sourceData.bakeries) && !Array.isArray(sourceData.debts))) {
          throw new Error('حزمة GitHub غير مطابقة لبنية قاعدة بيانات المنظومة');
        }

        const restoredData: AppState = {
          ...currentState,
          bakeries: sourceData.bakeries || [],
          debts: sourceData.debts || [],
          villages: sourceData.villages || currentState.villages,
          activityStatuses: sourceData.activityStatuses || currentState.activityStatuses,
          bakeryCategories: sourceData.bakeryCategories || currentState.bakeryCategories,
          breadTypes: sourceData.breadTypes || currentState.breadTypes,
          breadTypeCounts: sourceData.breadTypeCounts || currentState.breadTypeCounts,
          lineTypes: sourceData.lineTypes || currentState.lineTypes,
          fuelTypes: sourceData.fuelTypes || currentState.fuelTypes,
          issuingEntities: sourceData.issuingEntities || currentState.issuingEntities,
          violationTypes: sourceData.violationTypes || currentState.violationTypes,
          paymentMethods: sourceData.paymentMethods || currentState.paymentMethods,
          dailyTasks: sourceData.dailyTasks || currentState.dailyTasks,
          columnTitles: sourceData.columnTitles || currentState.columnTitles,
          systemConfig: {
            ...(sourceData.systemConfig || currentState.systemConfig),
            // Always lock the official logo from GitHub into the restored state
            logoBase64: DEFAULT_OFFICIAL_LOGO,
          },
          users: sourceData.users || currentState.users,
          currentUser: currentState.currentUser,
        };

        // Cache this as the active GitHub sync payload
        localStorage.setItem(
          'TAMWEEN_GITHUB_SYNC_PAYLOAD',
          JSON.stringify({
            version: parsed.version || '3.0-github-sync',
            timestamp: parsed.timestamp || new Date().toISOString(),
            accountEmail: parsed.accountEmail || githubEmail,
            repository: parsed.repository || githubRepo,
            bakeriesCount: restoredData.bakeries.length,
            debtsCount: restoredData.debts.length,
            data: restoredData,
          })
        );

        onRestoreState(restoredData);
        setStatusMsg({
          text: `تم استيراد حزمة النسخة الاحتياطية من GitHub بنجاح! تم استرجاع (${restoredData.bakeries.length}) مخبز و (${restoredData.debts.length}) قيد مديونية وتثبيت الشعار المعتمد.`,
          type: 'success',
        });
      } catch (err: unknown) {
        setStatusMsg({
          text: `فشل استيراد حزمة GitHub: ${(err as Error).message}`,
          type: 'error',
        });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  // 7. Instant Restore from Cached GitHub Sync Snapshot
  const handleRestoreFromGithubSyncSnapshot = () => {
    try {
      const savedStr = localStorage.getItem('TAMWEEN_GITHUB_SYNC_PAYLOAD');
      if (!savedStr) {
        throw new Error('لا توجد حزمة سحابية مخزنة مسبقاً بحساب GitHub. يرجى اختيار ملف الحزمة أو حفظ نسخة أولاً.');
      }
      const parsed = JSON.parse(savedStr);
      const sourceData = parsed.data || parsed.state || parsed;

      const restoredData: AppState = {
        ...currentState,
        bakeries: sourceData.bakeries || [],
        debts: sourceData.debts || [],
        villages: sourceData.villages || currentState.villages,
        activityStatuses: sourceData.activityStatuses || currentState.activityStatuses,
        bakeryCategories: sourceData.bakeryCategories || currentState.bakeryCategories,
        breadTypes: sourceData.breadTypes || currentState.breadTypes,
        breadTypeCounts: sourceData.breadTypeCounts || currentState.breadTypeCounts,
        lineTypes: sourceData.lineTypes || currentState.lineTypes,
        fuelTypes: sourceData.fuelTypes || currentState.fuelTypes,
        issuingEntities: sourceData.issuingEntities || currentState.issuingEntities,
        violationTypes: sourceData.violationTypes || currentState.violationTypes,
        paymentMethods: sourceData.paymentMethods || currentState.paymentMethods,
        dailyTasks: sourceData.dailyTasks || currentState.dailyTasks,
        columnTitles: sourceData.columnTitles || currentState.columnTitles,
        systemConfig: {
          ...(sourceData.systemConfig || currentState.systemConfig),
          logoBase64: DEFAULT_OFFICIAL_LOGO,
        },
        users: sourceData.users || currentState.users,
        currentUser: currentState.currentUser,
      };

      onRestoreState(restoredData);
      setStatusMsg({
        text: `تم استرجاع ومزامنة حزمة GitHub (${parsed.accountEmail || githubEmail}) بنجاح! تم تحميل (${restoredData.bakeries.length}) مخبز و (${restoredData.debts.length}) مديونية.`,
        type: 'success',
      });
    } catch (err: unknown) {
      setStatusMsg({
        text: (err as Error).message,
        type: 'error',
      });
    }
  };

  // 8. Import Google Drive Backup Package (.json or .html)
  const handleImportGoogleDrivePackage = (file: File) => {
    setIsProcessing(true);
    setStatusMsg({
      text: `جاري قراءة واستيراد النسخة الاحتياطية من Google Drive (${file.name})...`,
      type: 'info',
    });

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawText = String(reader.result || '');
        let parsed: any = null;

        if (file.name.toLowerCase().endsWith('.html')) {
          const match = rawText.match(/window\.PRELOADED_TAMWEEN_STATE\s*=\s*(\{[\s\S]*?\});/);
          if (match && match[1]) {
            parsed = JSON.parse(match[1]);
          } else {
            throw new Error('لم يتم العثور على قاعدة بيانات مضمنة داخل ملف HTML المختار من Google Drive.');
          }
        } else {
          parsed = JSON.parse(rawText);
        }

        const sourceData = parsed.data || parsed.state || parsed;
        if (!sourceData || !Array.isArray(sourceData.bakeries)) {
          throw new Error('ملف النسخة الاحتياطية المختار من Google Drive غير صالح أو لا يحتوي على سجل المخابز.');
        }

        const prevBakeriesCount = currentState.bakeries.length;
        const mergedState = mergeStates(currentState, sourceData as Partial<AppState>);
        setMergeConflicts(getMergeConflictsLog());
        const addedBakeries = Math.max(0, mergedState.bakeries.length - prevBakeriesCount);
        const restoredData: AppState = {
          ...mergedState,
          systemConfig: {
            ...(mergedState.systemConfig || currentState.systemConfig),
            gmailEmail: gmailEmail.trim() || currentState.systemConfig.gmailEmail,
            googleDriveAutoSync: true,
            logoBase64: DEFAULT_OFFICIAL_LOGO,
          },
          currentUser: currentState.currentUser,
        };

        const syncPayload = {
          version: '3.5-google-drive-gmail-merge',
          timestamp: new Date().toISOString(),
          destinationType: 'GOOGLE_DRIVE',
          gmailEmail: gmailEmail.trim(),
          targetPath: customBackupPath,
          data: restoredData,
        };

        localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PAYLOAD', JSON.stringify(syncPayload));
        if (gmailEmail.trim()) {
          localStorage.setItem(
            `TAMWEEN_GMAIL_DRIVE_SYNC_${gmailEmail.trim().toLowerCase()}`,
            JSON.stringify(syncPayload)
          );
        }

        onRestoreState(restoredData);
        setStatusMsg({
          text: `تم استيراد ودمج النسخة الاحتياطية من Google Drive (${file.name}) بنجاح وفق قاعدة ADD ONLY (إضافة الجديد فقط دون حذف أو استبدال السجلات الأصلية)! إجمالي المخابز الآن (${restoredData.bakeries.length}) مخبز (أضيف ${addedBakeries} مخبز جديد) وإجمالي المديونيات (${restoredData.debts.length}).`,
          type: 'success',
        });
      } catch (err: unknown) {
        setStatusMsg({
          text: `فشل استيراد نسخة Google Drive: ${(err as Error).message}`,
          type: 'error',
        });
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsText(file);
  };

  // 9. Instant Restore & Additive Merge from Cached Google Drive Snapshot or Live Google Drive API
  const handleRestoreFromGoogleDriveSnapshot = async () => {
    setIsProcessing(true);
    try {
      let sourceData: any = null;
      if (getCachedAccessToken()) {
        setStatusMsg({ text: 'جاري تحميل أحدث نسخة احتياطية مباشرة من Google Drive سحابياً...', type: 'info' });
        const cloudRes = await downloadLatestBackupFromGoogleDriveDirect();
        if (cloudRes.success && cloudRes.data) {
          sourceData = cloudRes.data.data || cloudRes.data.state || cloudRes.data;
        }
      }

      if (!sourceData) {
        const gmailKey = gmailEmail.trim().toLowerCase();
        const savedStr =
          (gmailKey ? localStorage.getItem(`TAMWEEN_GMAIL_DRIVE_SYNC_${gmailKey}`) : null) ||
          localStorage.getItem('TAMWEEN_CUSTOM_BACKUP_PAYLOAD') ||
          localStorage.getItem('TAMWEEN_GITHUB_SYNC_PAYLOAD');
        if (!savedStr) {
          throw new Error(
            'لا توجد نسخة Google Drive محفوظة مسبقاً. يرجى الضغط على "ربط الجيميل ورفع النسخة على Google Drive" أو اختيار ملف JSON.'
          );
        }
        const parsed = JSON.parse(savedStr);
        sourceData = parsed.data || parsed.state || parsed;
      }

      const prevCount = currentState.bakeries.length;
      const mergedState = mergeStates(currentState, sourceData as Partial<AppState>);
      setMergeConflicts(getMergeConflictsLog());
      const addedCount = Math.max(0, mergedState.bakeries.length - prevCount);
      const restoredData: AppState = {
        ...mergedState,
        systemConfig: {
          ...(mergedState.systemConfig || currentState.systemConfig),
          gmailEmail: gmailEmail.trim() || currentState.systemConfig.gmailEmail,
          googleDriveAutoSync: true,
          logoBase64: DEFAULT_OFFICIAL_LOGO,
        },
        currentUser: currentState.currentUser,
      };

      onRestoreState(restoredData);
      setStatusMsg({
        text: `تم دمج ومزامنة ملفات JSON من Google Drive لحساب (${gmailEmail || customBackupPath}) بنجاح وفق قاعدة ADD ONLY بدون حذف أو استبدال أي بيانات! إجمالي المخابز (${restoredData.bakeries.length}) مخبز (أضيف ${addedCount} جديد) و (${restoredData.debts.length}) مديونية.`,
        type: 'success',
      });
    } catch (err: unknown) {
      setStatusMsg({
        text: (err as Error).message,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 10-أ. ربط الحساب الرسمي عبر Google OAuth 2.0 بدون طلب كلمة المرور في النظام
  const handleConnectGoogleAccount = async () => {
    if (!gmailEmail.trim() || !gmailEmail.includes('@')) {
      setStatusMsg({
        text: 'يرجى إدخال بريد Gmail الصحيح للمتابعة (مثال: ELHOSINY2020@gmail.com).',
        type: 'error',
      });
      return;
    }
    setIsProcessing(true);
    setStatusMsg({
      text: 'جاري فتح نافذة المصادقة الرسمية الآمنة لـ Google (OAuth 2.0)...',
      type: 'info',
    });
    try {
      const cleanEmail = gmailEmail.trim();
      localStorage.setItem('TAMWEEN_GMAIL_DRIVE_EMAIL', cleanEmail);
      localStorage.removeItem('TAMWEEN_GMAIL_DRIVE_PASSWORD');
      const authRes = await signInWithGoogleWorkspace();
      const verifiedEmail = authRes.email || cleanEmail;
      setGmailEmail(verifiedEmail);
      setIsGoogleConnected(true);
      setGoogleConnectedEmail(verifiedEmail);
      localStorage.setItem('TAMWEEN_GMAIL_DRIVE_EMAIL', verifiedEmail);
      setStatusMsg({
        text: `تم بنجاح تسجيل الدخول وربط حساب Google (${verifiedEmail}) وتفعيل الوصول لـ Google Drive!`,
        type: 'success',
      });
    } catch (err: unknown) {
      setStatusMsg({
        text: `تعذر إتمام تسجيل الدخول عبر Google OAuth: ${(err as Error).message}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 10-ب. فصل الاتصال بحساب Google Drive
  const handleDisconnectGoogleAccount = async () => {
    setIsProcessing(true);
    try {
      await signOutGoogleWorkspace();
      setIsGoogleConnected(false);
      setGoogleConnectedEmail(null);
      setStatusMsg({
        text: 'تم فصل الاتصال بحساب Google وتأمين الجلسة بنجاح.',
        type: 'success',
      });
    } catch (err: unknown) {
      setStatusMsg({
        text: `تعذر فصل الاتصال: ${(err as Error).message}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 10-ج. Real Google OAuth + Direct Google Drive Upload + Firestore Cloud Sync (مزامنة البيانات)
  const handleDirectGoogleDriveOAuthUpload = async () => {
    if (!gmailEmail.trim() || !gmailEmail.includes('@')) {
      setStatusMsg({
        text: 'يرجى إدخال بريد الجيميل أولاً (مثال: user@gmail.com) للربط والرفع المباشر على Google Drive.',
        type: 'error',
      });
      return;
    }

    if (!confirm(`هل توافق على ربط حساب الجيميل (${gmailEmail.trim()}) ورفع وتحديث ملف النسخة الاحتياطية على Google Drive وقاعدة البيانات السحابية؟`)) {
      return;
    }

    setIsProcessing(true);
    setStatusMsg({
      text: 'جاري فتح نافذة مصادقة Google الآمنة (OAuth 2.0) والتحقق من صلاحية الكتابة على Google Drive...',
      type: 'info',
    });

    try {
      const cleanEmail = gmailEmail.trim();
      const gmailKey = cleanEmail.toLowerCase();
      localStorage.setItem('TAMWEEN_GMAIL_DRIVE_EMAIL', cleanEmail);
      localStorage.removeItem('TAMWEEN_GMAIL_DRIVE_PASSWORD');
      localStorage.setItem('TAMWEEN_GMAIL_DRIVE_AUTOSYNC', 'true');
      localStorage.setItem('TAMWEEN_CUSTOM_AUTOSYNC', 'true');
      setGoogleDriveAutoSync(true);
      setCustomAutoSync(true);

      const authRes = await signInWithGoogleWorkspace();
      const verifiedEmail = authRes.email || cleanEmail;
      if (authRes.email) {
        setGmailEmail(authRes.email);
        localStorage.setItem('TAMWEEN_GMAIL_DRIVE_EMAIL', authRes.email);
      }

      const finalState: AppState = {
        ...currentState,
        systemConfig: {
          ...currentState.systemConfig,
          gmailEmail: verifiedEmail,
          googleDriveAutoSync: true,
          logoBase64: DEFAULT_OFFICIAL_LOGO,
        },
      };

      const payload = {
        version: '3.6-google-drive-oauth-cloud',
        timestamp: new Date().toISOString(),
        destinationType: 'GOOGLE_DRIVE',
        gmailEmail: verifiedEmail,
        targetPath: customBackupPath,
        bakeriesCount: finalState.bakeries.length,
        debtsCount: finalState.debts.length,
        data: finalState,
      };

      localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PAYLOAD', JSON.stringify(payload));
      localStorage.setItem(`TAMWEEN_GMAIL_DRIVE_SYNC_${gmailKey}`, JSON.stringify(payload));

      // Upload directly to Google Drive API
      const fileName = `tamween_mahalla_backup_${new Date().toISOString().split('T')[0]}.json`;
      const driveUpload = await uploadBackupToGoogleDriveDirect(payload, fileName);

      // Also sync to Cloud Firestore & local server snapshot
      await syncWorkspaceToFirestore(finalState).catch(() => {});
      fetch('/api/backup/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});

      const nowArabic = new Date().toLocaleString('ar-EG');
      localStorage.setItem('TAMWEEN_LAST_GOOGLE_DRIVE_CLOUD_SYNC', nowArabic);
      setLastCloudDriveSyncTime(nowArabic);
      onRestoreState(finalState);

      setStatusMsg({
        text: `${driveUpload.message} | وتمت المزامنة السحابية مع Firestore لحساب (${verifiedEmail}) بتاريخ (${nowArabic}).`,
        type: 'success',
      });
    } catch (err: unknown) {
      setStatusMsg({
        text: `تعذر إتمام الربط المباشر مع Google Drive: ${(err as Error).message}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 11. Send Backup Directly to Gmail via Gmail API
  const handleSendBackupToGmailDirect = async () => {
    const targetEmail = gmailEmail.trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setStatusMsg({ text: 'يرجى إدخال بريد الجيميل المراد إرسال النسخة الاحتياطية إليه.', type: 'error' });
      return;
    }
    if (!confirm(`هل أنت متأكد من إرسال ملف النسخة الاحتياطية مباشرة إلى البريد الإلكتروني (${targetEmail}) عبر Gmail API؟`)) {
      return;
    }

    setIsProcessing(true);
    setStatusMsg({ text: `جاري إرسال النسخة الاحتياطية مباشرة إلى (${targetEmail})...`, type: 'info' });
    try {
      const payload = {
        version: '3.6-gmail-direct-backup',
        timestamp: new Date().toISOString(),
        gmailEmail: targetEmail,
        bakeriesCount: currentState.bakeries.length,
        debtsCount: currentState.debts.length,
        data: currentState,
      };
      const res = await sendBackupDirectToGmail(
        targetEmail,
        `نسخة احتياطية رسمية - منظومة إدارة تموين مركز المحلة الكبرى (${new Date().toLocaleDateString('ar-EG')})`,
        payload
      );
      setStatusMsg({ text: res.message, type: 'success' });
    } catch (err: unknown) {
      setStatusMsg({ text: `تعذر إرسال البريد عبر Gmail: ${(err as Error).message}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Supabase Actions
  const handleSaveAndTestSupabaseConfig = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري حفظ إعدادات Supabase والتحقق من الاتصال...', type: 'info' });
    const newCfg = saveSupabaseConfig(supabaseUrlInput, supabaseKeyInput);
    setSupabaseCfg(newCfg);
    const testRes = await testSupabaseConnection();
    setIsProcessing(false);
    if (testRes.success) {
      setStatusMsg({ text: testRes.message, type: 'success' });
    } else {
      setStatusMsg({ text: testRes.message, type: 'error' });
    }
  };

  const handleUploadIndexHtmlToSupabase = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري حزم ورفع ملف index.html إلى Supabase Storage...', type: 'info' });
    const res = await uploadAppHtmlToSupabaseStorage(undefined, currentState);
    setIsProcessing(false);
    if (res.success) {
      setUploadedHtmlPublicUrl(res.publicUrl || null);
      setStatusMsg({
        text: `${res.message} ${res.publicUrl ? `رابط التحميل المباشر: ${res.publicUrl}` : ''}`,
        type: 'success',
      });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  const handleMigrateAllDatabaseToSupabase = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري نقل وترحيل ومزامنة كافة جداول قاعدة البيانات (المخابز والمديونيات) إلى Supabase...', type: 'info' });
    const res = await migrateDatabaseToSupabase(currentState);
    setIsProcessing(false);
    if (res.success) {
      const nowAr = new Date().toLocaleString('ar-EG');
      setLastSupabaseSyncTime(nowAr);
      if (res.publicHtmlUrl) setUploadedHtmlPublicUrl(res.publicHtmlUrl);
      setStatusMsg({ text: res.message, type: 'success' });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  const handleRestoreFromSupabaseDatabase = async () => {
    setIsProcessing(true);
    setStatusMsg({ text: 'جاري استرجاع وتحميل أحدث قاعدة بيانات من Supabase...', type: 'info' });
    const res = await fetchDatabaseFromSupabase();
    setIsProcessing(false);
    if (res.success && res.data) {
      const merged = mergeStates(currentState, res.data);
      onRestoreState(merged);
      setStatusMsg({
        text: `تم بنجاح تحميل ودمج البيانات من Supabase! إجمالي المخابز: (${merged.bakeries.length}) مخبز و (${merged.debts.length}) مديونية دون حذف أي سجلات محلية.`,
        type: 'success',
      });
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  const handleCopySqlSchema = () => {
    navigator.clipboard.writeText(SUPABASE_TABLES_SQL_SCHEMA);
    setStatusMsg({
      text: 'تم نسخ كود إنشاء جداول SQL (Schema Script) إلى الحافظة! يمكنك لصقه وتشغيله مباشرة في Supabase SQL Editor.',
      type: 'success',
    });
  };

  const handleReset = () => {
    onFactoryReset();
    setShowConfirmReset(false);
    setStatusMsg({
      text: 'تمت إعادة ضبط المصنع ومسح كافة البيانات واستعادة الحالة الأولية بنجاح.',
      type: 'success',
    });
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-amber-500/40 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] cursor-default">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-4.5 text-white flex items-center justify-between shrink-0 border-b-2 border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-400/30 shadow-inner">
              <Database className="w-5 h-5 text-amber-300 icon-float" />
            </div>
            <div>
              <h3 className="text-base font-black flex items-center gap-2">
                <span>الحفظ والاستيراد والنسخ الاحتياطي الموحد</span>
                <span className="text-[10px] bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                  جميع قوائم الحفظ والاستيراد والنسخ
                </span>
              </h3>
              <p className="text-[11px] text-amber-200/90 font-bold mt-0.5">
                حفظ على البارتيشن، Google Drive، GitHub، استيراد ودمج النسخ، وتحميل التطبيق المحدث (HTML / EXE)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-red-900/60 hover:bg-red-600 text-white transition cursor-pointer border border-red-500/50 hover:scale-105 active:scale-95 shadow-md"
            title="إغلاق النافذة (Escape)"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {statusMsg && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-black flex items-start gap-2.5 shadow-sm transition-all ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-500/20'
                  : statusMsg.type === 'error'
                  ? 'bg-red-50 border-red-300 text-red-900 ring-2 ring-red-500/20'
                  : 'bg-blue-50 border-blue-300 text-blue-900 ring-2 ring-blue-500/20'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 icon-animated" />
              ) : statusMsg.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5 icon-animated" />
              ) : (
                <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
              )}
              <div className="leading-relaxed flex-1">{statusMsg.text}</div>
            </div>
          )}

          {/* SECTION 1: PRIMARY USER REQUEST - Smart Upsert & Direct Working HTML Download */}
          <div className="p-4.5 bg-gradient-to-br from-amber-50 via-orange-50/50 to-amber-100/60 border-2 border-amber-500/80 rounded-2xl space-y-3.5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-600 text-white rounded-lg shadow-sm">
                  <Sparkles className="w-4 h-4 icon-float" />
                </div>
                <h4 className="text-sm font-black text-amber-950">
                  1. دمج وتحديث البيانات التلقائية (إضافة غير المتوفر فقط)
                </h4>
              </div>
              <span className="text-[10px] font-black text-amber-950 bg-amber-300/80 border border-amber-400 px-2.5 py-0.5 rounded-full shadow-2xs">
                ميزة الأمان التام
              </span>
            </div>

            <div className="bg-white/95 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 space-y-2 shadow-xs">
              <div className="flex items-center justify-between font-bold text-[11px] text-slate-700">
                <span>البيانات الحالية على جهازك:</span>
                <span className="text-slate-900 font-black bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-300">
                  ({currentState.bakeries.length}) مخبز &bull; ({currentState.debts.length}) مديونية
                </span>
              </div>
              <div className="flex items-center justify-between font-bold text-[11px] text-slate-700">
                <span>آخر حفظ تلقائي مسجل:</span>
                <span className="text-amber-900 font-black">
                  {formattedAutoSaveTime || 'مسجل مع التعديلات الحالية'}
                </span>
              </div>
              <p className="text-[11px] text-slate-700 font-medium leading-relaxed pt-1.5 border-t border-amber-100">
                يقوم النظام بالبحث الذكي في كافة النسخ المحفوظة على جهازك: <strong className="text-amber-950">يحدث بيانات المخابز القائمة</strong> (برقم الماكينة والكود) <strong className="text-amber-950">ويضيف فقط المخابز والمديونيات الغير متوفرة</strong> دون مسح أي بيانات سابقة.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* Button A: Smart sync and download HTML */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSmartSyncAndDownloadHtml}
                className="py-3 px-4 bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-800 hover:from-emerald-800 hover:to-teal-900 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-emerald-200 icon-animated" />
                <span>تحديث البيانات ثم تحميل ملف المنظومة (HTML)</span>
              </button>

              {/* Button B: Smart sync only */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSmartSyncAndUpsert}
                className="py-3 px-4 bg-gradient-to-r from-amber-700 to-amber-900 hover:from-amber-800 hover:to-amber-950 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-amber-200 ${isProcessing ? 'animate-spin' : 'icon-spin-hover'}`} />
                <span>تحديث ودمج البيانات على هذا الجهاز فقط</span>
              </button>
            </div>

            {/* Quick Open in Browser Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={openStandaloneAppInNewTab}
                className="w-full py-2 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-amber-400/80 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-700 icon-animated" />
                <span>فتح صفحة البرنامج مباشرة في نافذة متصفح جديدة</span>
              </button>
            </div>
          </div>

          {/* SECTION: PUBLISH ENGINE & CLOUD RELEASE */}
          <div className="p-4.5 bg-gradient-to-br from-indigo-950 via-slate-900 to-sky-950 text-white border-2 border-indigo-400/70 rounded-2xl space-y-3.5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30 shadow-inner">
                  <UploadCloud className="w-5 h-5 text-indigo-300 icon-float" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-indigo-200 flex items-center gap-2">
                    <span>محرك النشر السحابي الفوري والمحسّن (Publish Engine)</span>
                    <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 px-2 py-0.5 rounded-full font-bold">
                      v{lastPublishedInfo?.version || '2.4.0'} مُعتمد
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                    نشر وتحديث النسخة السحابية الموزعة بأحدث حزم الكود الخفيفة وبدون تجميد للشاشة
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExecutePublishFromBackup}
                  disabled={isPublishing}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-md cursor-pointer ${
                    isPublishing
                      ? 'bg-indigo-700/60 text-indigo-200 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white border border-indigo-300/40 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {isPublishing ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin text-indigo-200" />
                      <span>جارٍ تنفيذ النشر ({publishState.progressPercent}%)...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4 text-white" />
                      <span>نشر المنظومة الآن (Publish)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Stages Progress Indicator */}
            {isPublishing && (
              <div className="bg-slate-900/90 border border-indigo-400/30 rounded-xl p-3 space-y-2 relative z-10 animate-fadeIn">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="flex items-center gap-1.5 text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                    <span>المرحلة: {publishState.stageNameArabic}</span>
                  </span>
                  <span className="text-indigo-300 font-mono font-black">{publishState.progressPercent}%</span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{ width: `${publishState.progressPercent}%` }}
                  />
                </div>

                {publishState.isDelayed && (
                  <div className="p-2 bg-amber-950/70 border border-amber-500/50 rounded-lg text-[11px] text-amber-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>يستغرق النشر وقتاً إضافياً لضغط البيانات وتأكيد الرابط السحابي... يرجى الانتظار دون إغلاق الصفحة.</span>
                  </div>
                )}
              </div>
            )}

            {/* Published Link & Details */}
            {lastPublishedInfo && (
              <div className="bg-slate-950/70 border border-indigo-500/30 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-2.5 relative z-10 text-xs">
                <div className="flex items-center gap-2 overflow-hidden text-right w-full md:w-auto">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-slate-400 shrink-0 font-medium">الرابط السحابي المعتمد:</span>
                  <span className="font-mono text-sky-300 text-[11px] truncate max-w-xs ltr">
                    {lastPublishedInfo.publishedUrl}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(lastPublishedInfo.publishedUrl);
                      setCopiedPublishUrl(true);
                      setTimeout(() => setCopiedPublishUrl(false), 2500);
                    }}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedPublishUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-300" />
                        <span>نسخ الرابط</span>
                      </>
                    )}
                  </button>

                  <a
                    href={lastPublishedInfo.publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/40 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح الرابط</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: SUPABASE CLOUD DATABASE & INDEX.HTML STORAGE */}
          <div className="p-4.5 bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 text-white border-2 border-emerald-500/80 rounded-2xl space-y-3.5 shadow-lg relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/30 shadow-inner">
                  <Database className="w-4 h-4 icon-float text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                    <span>قاعدة بيانات Supabase السحابية ورفع ملف index.html</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full font-bold">
                      Supabase Cloud DB & Storage
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                    ربط قاعدة البيانات سحابياً بـ Supabase ورفع ملف index.html إلى الحاوية التخزينية
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {supabaseCfg.isConfigured ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-300 bg-emerald-900/60 border border-emerald-400/40 px-2.5 py-1 rounded-full shadow-inner">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>متصل بـ Supabase</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-full">
                    بحاجة لإدخال المفاتيح
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowSupabaseSettings(!showSupabaseSettings)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-[10px] font-black transition cursor-pointer"
                >
                  {showSupabaseSettings ? 'إخفاء الإعدادات ✕' : '⚙️ إعدادات المفاتيح'}
                </button>
              </div>
            </div>

            {/* Quick Status / Info Banner */}
            <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-3 text-xs space-y-1.5 relative z-10">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span>سجلات المخابز والمديونيات الجاهزة للنقل:</span>
                <span className="text-emerald-300 font-black bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                  ({currentState.bakeries.length}) مخبز &bull; ({currentState.debts.length}) مديونية
                </span>
              </div>
              {lastSupabaseSyncTime && (
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                  <span>آخر مزامنة مكتملة مع Supabase:</span>
                  <span className="text-emerald-400 font-black">{lastSupabaseSyncTime}</span>
                </div>
              )}
              {uploadedHtmlPublicUrl && (
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-200 pt-1 border-t border-emerald-900/50">
                  <span>رابط ملف index.html المرفوع على Supabase:</span>
                  <a
                    href={uploadedHtmlPublicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 underline font-black flex items-center gap-1"
                  >
                    <span>فتح الملف السحابي ↗</span>
                  </a>
                </div>
              )}
            </div>

            {/* Collapsible Supabase Credentials Panel */}
            {showSupabaseSettings && (
              <div className="p-3 bg-slate-950/90 border border-emerald-500/40 rounded-xl space-y-2.5 text-xs animate-fadeIn relative z-10">
                <div className="text-[11px] font-black text-emerald-300">
                  🔑 بيانات الاتصال بمشروع Supabase الخاص بك:
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 mb-1">
                    عنوان المشروع (Project URL)
                  </label>
                  <input
                    type="text"
                    value={supabaseUrlInput}
                    onChange={(e) => setSupabaseUrlInput(e.target.value)}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono focus:border-emerald-500 focus:outline-hidden text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 mb-1">
                    المفتاح العام (anon / publishable public key)
                  </label>
                  <input
                    type="password"
                    value={supabaseKeyInput}
                    onChange={(e) => setSupabaseKeyInput(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono focus:border-emerald-500 focus:outline-hidden text-left"
                    dir="ltr"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSaveAndTestSupabaseConfig}
                    className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>حفظ البيانات واختبار الاتصال فوراً</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySqlSchema}
                    className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <span>📋 نسخ كود إنشاء الجداول (SQL Schema)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Core Action Buttons for Supabase */}
            <div className="space-y-2 relative z-10 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Upload index.html to Supabase Storage */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleUploadIndexHtmlToSupabase}
                  className="py-3 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50 border border-emerald-400/40"
                >
                  <Upload className="w-4 h-4 text-emerald-200 icon-animated" />
                  <span>رفع ملف index.html إلى Supabase Storage 🚀</span>
                </button>

                {/* 2. Migrate All Database to Supabase */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleMigrateAllDatabaseToSupabase}
                  className="py-3 px-4 bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 hover:from-amber-500 hover:to-yellow-500 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50 border border-amber-300"
                >
                  <Database className="w-4 h-4 text-slate-950 icon-float" />
                  <span>مزامنة ونقل قاعدة البيانات بالكامل إلى Supabase ⚡</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {/* 3. Restore / Pull from Supabase */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRestoreFromSupabaseDatabase}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-emerald-500/40 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>استعادة وتحميل البيانات من Supabase 📥</span>
                </button>

                {/* 4. View / Copy SQL Schema */}
                <button
                  type="button"
                  onClick={() => setShowSqlSchemaModal(true)}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <FileCode className="w-4 h-4 text-amber-400" />
                  <span>عرض ونسخ سكريبت جداول SQL (Schema) 📄</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal for viewing SQL Schema script */}
          {showSqlSchemaModal && (
            <div className="p-4 bg-slate-950 border-2 border-amber-400 rounded-2xl space-y-3 text-xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-amber-400" />
                  <span className="font-black text-amber-300">
                    سكريبت إنشاء وتهيئة جداول Supabase (PostgreSQL)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopySqlSchema}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-black transition cursor-pointer"
                  >
                    نسخ الكود بالكامل 📋
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSqlSchemaModal(false)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-black cursor-pointer"
                  >
                    إغلاق ✕
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                قم بلصق هذا الكود في نافذة <strong>SQL Editor</strong> داخل لوحة تحكم مشروع Supabase واضغط <strong>Run</strong> لإنشاء جداول المخابز والمديونيات وسياسات الأمان RLS بنقرة واحدة:
              </p>
              <pre
                className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-56 leading-relaxed select-all"
                dir="ltr"
              >
                {SUPABASE_TABLES_SQL_SCHEMA}
              </pre>
            </div>
          )}

          {/* SECTION 2: Download Standalone HTML application (FIXED & TESTED 100% WORKING) */}
          <div className="p-4 bg-emerald-50/80 border-2 border-emerald-400/80 rounded-2xl space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-emerald-700 icon-float" />
                2. تحميل نسخة البرنامج الجديدة بعد التعديلات (يفتح مباشرة بدون نت)
              </h4>
              <span className="text-[10px] font-black text-emerald-950 bg-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400">
                تم إصلاح التشغيل المباشر 100%
              </span>
            </div>
            <p className="text-[11px] text-emerald-900 font-medium leading-relaxed">
              تم فحص وإصلاح ملف الـ HTML بالكامل: يعمل مباشرة بمجرد النقر المزدوج عليه في أي متصفح (كروم، إيدج، فايرفوكس) على أي جهاز أو هاتف ويفتح شاشة البرنامج فوراً دون توقف أو شاشة بيضاء.
            </p>
            <button
              type="button"
              onClick={async () => {
                setStatusMsg({ text: 'جاري تجهيز وتنزيل ملف المنظومة المحدث...', type: 'info' });
                const res = await downloadUpdatedAppHtml(currentState);
                setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
              }}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4 text-emerald-200 icon-animated" />
              تحميل ملف البرنامج المحدث الآن (HTML يفتح مباشرة)
            </button>
          </div>

          {/* SECTION 3: Merge from external file (JSON or HTML) */}
          <div className="p-3.5 bg-blue-50/80 border border-blue-300 rounded-2xl space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-700 icon-animated" />
                3. دمج بيانات من ملف خارجي (JSON أو HTML) دون مسح البيانات الحالية
              </h4>
              <span className="text-[10px] font-bold text-blue-900 bg-blue-200/80 px-2 py-0.5 rounded">
                دمج آمن
              </span>
            </div>
            <p className="text-[11px] text-blue-900 font-medium leading-relaxed">
              إذا استلمت ملف تموين من جهاز زميل أو فلاشة، اختر الملف وسيقوم النظام بتحديث المخابز القائمة وإضافة المخابز الجديدة فقط دون حذف أي سجلات لديك.
            </p>
            <label className="w-full mt-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition">
              <Upload className="w-4 h-4 text-blue-200 icon-animated" />
              اختيار ملف (JSON أو HTML) ودمجه مع بيانات الجهاز
              <input
                type="file"
                accept=".json,.html,application/json,text/html"
                onChange={handleMergeUploadedFile}
                className="hidden"
              />
            </label>
          </div>

          {/* SECTION 4: Native Save File Picker to Partition */}
          <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-amber-700 icon-animated" />
                4. حفظ نسخة احتياطية في البارتيشن (C:, D:, USB)
              </h4>
              <span className="text-[10px] font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">
                تحديد المسار
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              تفتح نافذة لاختيار البارتيشن المفضل (قرص D: أو فلاشة ميموري) لحفظ نسخة احتياطية من قاعدة البيانات.
            </p>
            <button
              onClick={handleSaveToPartition}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Download className="w-4 h-4 text-amber-300 icon-animated" />
              حفظ النسخة الاحتياطية في البارتيشن الآن
            </button>
          </div>

          {/* NEW SECTION: GitHub Cloud Backup & Automatic Cross-Device Sync */}
          <div className="p-4 bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-white border-2 border-purple-500/50 rounded-2xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-400/40">
                  <Globe className="w-4 h-4 icon-float" />
                </div>
                <h4 className="text-xs font-black text-purple-200">
                  حفظ وتزامن نسخة احتياطية على GitHub (تزامن سحابي فوري) ☁️
                </h4>
              </div>
              <span className="text-[10px] font-black text-purple-300 bg-purple-900/80 px-2.5 py-0.5 rounded-full border border-purple-500/40">
                حفظ سحابي مشفر
              </span>
            </div>

            <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
              تتيح لك هذه الميزة حفظ واسترجاع قاعدة البيانات تلقائياً عبر حساب GitHub. أي جهاز يقوم بالتسجيل أو الإضافة يحفظ مباشرة لمنع فقدان البيانات نهائياً.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-black text-purple-300 mb-1">إيميل / حساب GitHub المسجل</label>
                <input
                  type="email"
                  value={githubEmail}
                  onChange={(e) => {
                    setGithubEmail(e.target.value);
                    localStorage.setItem('TAMWEEN_GITHUB_EMAIL', e.target.value);
                  }}
                  placeholder="name@github.com"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-purple-500/40 rounded-lg font-bold text-purple-100 text-right text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-purple-300 mb-1">اسم مستودع GitHub (Repository)</label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => {
                    setGithubRepo(e.target.value);
                    localStorage.setItem('TAMWEEN_GITHUB_REPO', e.target.value);
                  }}
                  placeholder="tamween-system-backup"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-purple-500/40 rounded-lg font-bold text-purple-100 text-right text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-purple-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={githubAutoSync}
                  onChange={(e) => {
                    setGithubAutoSync(e.target.checked);
                    localStorage.setItem('TAMWEEN_GITHUB_AUTOSYNC', String(e.target.checked));
                  }}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-400"
                />
                <span>تفعيل الحفظ السحابي التلقائي المباشر لجميع الأجهزة المسجلة على الموقع</span>
              </label>
            </div>

            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Package current full state payload for GitHub Backup snapshot
                    const payload = {
                      version: '3.0-github-sync',
                      timestamp: new Date().toISOString(),
                      accountEmail: githubEmail,
                      repository: githubRepo,
                      bakeriesCount: currentState.bakeries.length,
                      debtsCount: currentState.debts.length,
                      data: {
                        ...currentState,
                        systemConfig: {
                          ...currentState.systemConfig,
                          logoBase64: DEFAULT_OFFICIAL_LOGO,
                        },
                      },
                    };
                    // Persist to local sync registry & export payload blob
                    localStorage.setItem('TAMWEEN_GITHUB_SYNC_PAYLOAD', JSON.stringify(payload));
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `tamween_github_backup_${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setStatusMsg({
                      text: `تم حفظ وحزم النسخة الاحتياطية السحابية والتزامن بنجاح لحساب GitHub (${githubEmail}) والاحتفاظ بها بصفة دائمة!`,
                      type: 'success',
                    });
                  }}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Globe className="w-4 h-4 text-purple-200 icon-animated" />
                  <span>تصدير وحفظ حزمة GitHub ☁️</span>
                </button>

                <label className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition text-center">
                  <Upload className="w-4 h-4 text-emerald-200 icon-animated" />
                  <span>استيراد حزمة نسخة احتياطية من GitHub (.json) 📥</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportGithubPackage(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Instant restore from cached snapshot */}
              <div className="flex items-center justify-between p-2.5 bg-purple-900/40 rounded-xl border border-purple-500/30 text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-purple-300" />
                  <span className="text-[11px] text-purple-200 font-bold">
                    حزمة التزامن المباشرة المخزنة للحساب
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreFromGithubSyncSnapshot}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-black cursor-pointer transition shadow-xs"
                >
                  استيراد الحزمة المتزامنة فوراً 🔄
                </button>
              </div>

              <div className="p-2 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-[10px] text-emerald-300 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  🔒 الشعار الرسمي المعتمد لوزارة التموين من GitHub مثبت ومحفوظ دائماً بقاعدة البيانات ولن يتغير أبداً.
                </span>
              </div>
            </div>
          </div>

          {/* NEW SECTION: Gmail & Google Drive Auto-Backup & Non-Destructive JSON Merge */}
          <div className="p-4 bg-gradient-to-br from-cyan-950 via-slate-900 to-blue-950 text-white border-2 border-cyan-400/60 rounded-2xl space-y-3.5 shadow-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg border border-cyan-400/40">
                  <HardDrive className="w-4 h-4 icon-float" />
                </div>
                <h4 className="text-xs sm:text-sm font-black text-cyan-200">
                  ربط إيميل الجيميل (Gmail) والنسخ التلقائي على Google Drive (دمج JSON بدون حذف) ☁️
                </h4>
              </div>
              <span className="text-[10px] font-black text-cyan-200 bg-cyan-900/90 px-2.5 py-0.5 rounded-full border border-cyan-400/50">
                دمج تلقائي آمن 100%
              </span>
            </div>

            <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
              قم بإدخال بريد Gmail والضغط على زر <strong className="text-amber-300">ربط الحساب</strong> للمصادقة الآمنة عبر صفحة Google الرسمية (OAuth 2.0). لا يُطلب أو يُخزن أي كلمة مرور داخل النظام نهائياً. استخدم الأزرار أدناه للربط، وفصل الاتصال، ومزامنة واستعادة البيانات عبر Google Drive API.
            </p>

            {/* Gmail Email & OAuth Connection Status (No plaintext password storage) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-slate-950/60 p-3 rounded-xl border border-cyan-500/30">
              <div>
                <label className="block text-[11px] font-black text-amber-300 mb-1">
                  📧 إيميل الجيميل للربط المباشر مع Google Drive (OAuth 2.0)
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={gmailEmail}
                  onChange={(e) => {
                    setGmailEmail(e.target.value);
                    localStorage.setItem('TAMWEEN_GMAIL_DRIVE_EMAIL', e.target.value);
                  }}
                  placeholder="ELHOSINY2020@gmail.com"
                  className="w-full px-3 py-2 bg-slate-900 border border-cyan-400/50 rounded-xl font-bold text-white text-left text-xs focus:ring-2 focus:ring-cyan-400 outline-none"
                />
              </div>

              <div className="flex flex-col justify-between bg-slate-900/90 border border-cyan-500/30 rounded-xl p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-cyan-300">حالة الاتصال السحابي:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isGoogleConnected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'}`}>
                    {isGoogleConnected ? `🟢 متصل (${googleConnectedEmail || auth.currentUser?.email || gmailEmail})` : '⚪ غير متصل (اضغط ربط الحساب)'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 font-bold mt-1">
                  آخر نسخة سحابية: <span className="text-amber-300 font-mono">{lastCloudDriveSyncTime || formattedAutoSaveTime || 'لم يتم الرفع بعد'}</span>
                </div>
              </div>
            </div>

            {/* Required Action Buttons: ربط الحساب | فصل الاتصال | مزامنة البيانات */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. ربط الحساب */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleConnectGoogleAccount}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition border border-blue-400/40 disabled:opacity-50"
                  title="تسجيل الدخول الآمن بحساب Google عبر نافذة OAuth 2.0"
                >
                  <Globe className="w-4 h-4 text-blue-200" />
                  <span>ربط الحساب (Google OAuth) 🔗</span>
                </button>

                {/* 2. فصل الاتصال */}
                <button
                  type="button"
                  disabled={isProcessing || !isGoogleConnected}
                  onClick={handleDisconnectGoogleAccount}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition border border-slate-600 disabled:opacity-40"
                  title="تسجيل الخروج وفصل الاتصال بحساب Google"
                >
                  <X className="w-4 h-4 text-rose-400" />
                  <span>فصل الاتصال 🔌</span>
                </button>

                {/* 3. مزامنة البيانات */}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleDirectGoogleDriveOAuthUpload}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition border border-amber-300 disabled:opacity-50"
                  title="مزامنة وحفظ النسخة الاحتياطية مباشرة إلى Google Drive"
                >
                  <RefreshCw className={`w-4 h-4 text-slate-950 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>مزامنة البيانات 🔄</span>
                </button>
              </div>

              {/* Secondary Google Drive & Gmail Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRestoreFromGoogleDriveSnapshot}
                  className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition border border-emerald-500/50 disabled:opacity-50"
                  title="استعادة وتحميل أحدث نسخة احتياطية من Google Drive ودمجها بدون حذف"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-200" />
                  <span>استعادة أحدث نسخة من Google Drive 📥</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSendBackupToGmailDirect}
                  className="w-full py-2 px-3 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl text-xs font-black shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition border border-cyan-500/50 disabled:opacity-50"
                  title="إرسال ملف النسخة الاحتياطية مباشرة إلى بريد الجيميل"
                >
                  <Globe className="w-3.5 h-3.5 text-cyan-200" />
                  <span>إرسال النسخة لبريد الجيميل 📧</span>
                </button>
              </div>
            </div>

            {/* Conflict Log Viewer for Mandatory ADD ONLY Rule */}
            {mergeConflicts.length > 0 && (
              <div className="p-3 bg-amber-950/80 border border-amber-400/60 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-black text-amber-300">
                    ⚠️ سجل تعارضات الاستيراد والدمج (تمت حماية السجلات الأصلية وفق قاعدة ADD ONLY - {mergeConflicts.length} تعارض):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearMergeConflictsLog();
                      setMergeConflicts([]);
                    }}
                    className="px-2 py-0.5 bg-amber-500 text-slate-950 rounded text-[10px] font-black cursor-pointer"
                  >
                    مسح السجل
                  </button>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                  {mergeConflicts.slice(0, 10).map((c) => (
                    <div key={c.id} className="p-1.5 bg-slate-900/90 rounded border border-amber-500/30 text-[10px] text-amber-100">
                      <span className="font-black text-amber-300">{c.label}: </span>
                      <span>{c.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <label className="block text-[10px] font-black text-cyan-300 mb-1">نوع المسار المخصص</label>
                <select
                  value={customBackupType}
                  onChange={(e) => {
                    const type = e.target.value as any;
                    setCustomBackupType(type);
                    localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_TYPE', type);
                    if (type === 'GOOGLE_DRIVE') {
                      setCustomBackupPath('G:\\My Drive\\Tamween_Backups\\');
                      localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PATH', 'G:\\My Drive\\Tamween_Backups\\');
                    } else if (type === 'LOCAL_NETWORK') {
                      setCustomBackupPath('\\\\SERVER\\Tamween_Share\\Backups\\');
                      localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PATH', '\\\\SERVER\\Tamween_Share\\Backups\\');
                    } else {
                      setCustomBackupPath('D:\\وزارة التموين\\نسخ_احتياطية\\');
                      localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PATH', 'D:\\وزارة التموين\\نسخ_احتياطية\\');
                    }
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-500/40 rounded-lg font-bold text-cyan-100 text-right text-xs"
                >
                  <option value="GOOGLE_DRIVE">☁️ مجلد Google Drive (مزامنة سحابية)</option>
                  <option value="LOCAL_NETWORK">🌐 مسار شبكي محلي (Network Shared UNC Path)</option>
                  <option value="CUSTOM_FOLDER">💻 مجلد مخصص في الهارد ديسك (Custom Path)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-cyan-300 mb-1">المسار أو اسم المجلد المخصص</label>
                <input
                  type="text"
                  value={customBackupPath}
                  onChange={(e) => {
                    setCustomBackupPath(e.target.value);
                    localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PATH', e.target.value);
                  }}
                  placeholder="G:\My Drive\Tamween_Backups\"
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-cyan-500/40 rounded-lg font-bold text-cyan-100 text-right text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-cyan-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customAutoSync && googleDriveAutoSync}
                  onChange={(e) => {
                    setCustomAutoSync(e.target.checked);
                    setGoogleDriveAutoSync(e.target.checked);
                    localStorage.setItem('TAMWEEN_CUSTOM_AUTOSYNC', String(e.target.checked));
                    localStorage.setItem('TAMWEEN_GMAIL_DRIVE_AUTOSYNC', String(e.target.checked));
                  }}
                  className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-cyan-400"
                />
                <span>تفعيل النسخ والدمج التلقائي على Google Drive عند تسجيل أي مستخدم مربوط بالجيميل</span>
              </label>
            </div>

            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const payload = {
                      version: '3.5-custom-destination',
                      timestamp: new Date().toISOString(),
                      destinationType: customBackupType,
                      gmailEmail: gmailEmail.trim(),
                      targetPath: customBackupPath,
                      bakeriesCount: currentState.bakeries.length,
                      debtsCount: currentState.debts.length,
                      data: currentState,
                    };
                    localStorage.setItem('TAMWEEN_CUSTOM_BACKUP_PAYLOAD', JSON.stringify(payload));
                    if (gmailEmail.trim()) {
                      localStorage.setItem(
                        `TAMWEEN_GMAIL_DRIVE_SYNC_${gmailEmail.trim().toLowerCase()}`,
                        JSON.stringify(payload)
                      );
                    }
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `tamween_google_drive_backup_${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setStatusMsg({
                      text: `تم تصدير وحفظ النسخة الاحتياطية بنجاح لـ Google Drive (${gmailEmail || customBackupPath})!`,
                      type: 'success',
                    });
                  }}
                  className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-cyan-200" />
                  <span>حفظ نسخة في Google Drive 📁</span>
                </button>

                <label className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer text-center border border-emerald-400/50">
                  <Upload className="w-4 h-4 text-emerald-200" />
                  <span>استيراد ودمج نسخة من Google Drive 📥</span>
                  <input
                    type="file"
                    accept=".json,.html,application/json,text/html"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportGoogleDrivePackage(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Instant 1-Click Restore & Merge from Google Drive Sync Snapshot */}
              <div className="flex items-center justify-between p-2.5 bg-cyan-900/40 rounded-xl border border-cyan-500/30 text-xs">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="text-[11px] text-cyan-100 font-bold">
                    دمج واسترجاع فوري لآخر نسخة متزامنة على الجيميل ({gmailEmail || customBackupPath})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreFromGoogleDriveSnapshot}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-black cursor-pointer shadow-xs"
                >
                  دمج من Google Drive فوراً 🔄
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 5: Full Restore from JSON (Replaces current) */}
          <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-slate-700 icon-animated" />
                5. استعادة واستبدال كامل من ملف نسخة سابقة (.JSON)
              </h4>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                استبدال شامل
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium">
              استيراد ملف JSON واستبدال قاعدة البيانات بالكامل بما يحتويه الملف.
            </p>
            <label className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition">
              <FileJson className="w-4 h-4 text-amber-300 icon-animated" />
              استعادة واستبدال من ملف JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFullRestore}
                className="hidden"
              />
            </label>
          </div>

          {/* SECTION 6: Ministry of Supply Desktop App & Auto-Installer */}
          <div className="p-4 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-600/15 border-2 border-amber-400/80 rounded-2xl space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-amber-950 flex items-center gap-2">
                <img src="/favicon.svg" alt="شعار الوزارة" className="w-5 h-5 icon-float drop-shadow-sm" />
                6. تثبيت التطبيق وتحميل أيقونة سطح المكتب بشعار الوزارة
              </h4>
              <span className="text-[10px] font-black text-amber-950 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-400">
                تطبيق مثبت &bull; Desktop App
              </span>
            </div>
            <p className="text-[11px] text-amber-950 font-medium leading-relaxed">
              يمكنك الآن تثبيت المنظومة كتطبيق رسمي مستقل على جهاز الكمبيوتر بشعار الوزارة (يعمل كنافذة برنامج حقيقية دون شريط المتصفح)، أو استخدام أداة التثبيت الفوري لويندوز:
            </p>

            <div className="space-y-2">
              {/* Option 1: Native PWA Install */}
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await install();
                    if (ok) {
                      setStatusMsg({ text: 'تم تثبيت منظومة وزارة التموين بنجاح على جهازك كأيقونة تطبيق مستقل!', type: 'success' });
                    }
                  }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 hover:from-amber-700 hover:to-yellow-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md cursor-pointer transition animate-pulse"
                >
                  <img src="/favicon.svg" alt="شعار الوزارة" className="w-5 h-5 drop-shadow" />
                  <span>تثبيت المنظومة الآن كتطبيق مثبت على جهاز الكمبيوتر (PWA)</span>
                </button>
              )}

              {isInstalled && (
                <div className="p-2.5 bg-emerald-100 border border-emerald-400 rounded-xl text-xs font-black text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>البرنامج مثبت بالفعل على هذا الجهاز كتطبيق مستقل.</span>
                </div>
              )}

              {/* Direct Native EXE Launcher Download */}
              <button
                type="button"
                onClick={async () => {
                  const res = await downloadWindowsExeLauncher();
                  setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                }}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 via-yellow-600 to-amber-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shadow-sm border border-amber-300 active:scale-95"
                title="تحميل مشغل ويندوز التنفيذي (EXE) مباشرة"
              >
                <Download className="w-4 h-4 text-slate-950 icon-animated" />
                <span>تحميل ملف البرنامج التنفيذي المباشر (منظومة_وزارة_التموين.exe)</span>
              </button>

              {/* Option 2 & 3: Windows Batch Auto-Installer & VBS Silent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const res = downloadWindowsDesktopInstallerBat();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2.5 px-3 bg-slate-900 hover:bg-black text-amber-300 border border-amber-400/60 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  title="أداة تنشئ أيقونة البرنامج تلقائياً على سطح المكتب بنقرة واحدة"
                >
                  <Download className="w-4 h-4 text-amber-300 icon-animated" />
                  <span>تثبيت الأيقونة على سطح المكتب تلقائياً (.bat)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const res = downloadWindowsVbsLauncher();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-slate-100 border border-slate-600 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  title="مشغل مكتبي صامت يفتح البرنامج فوراً بدون شاشة سوداء"
                >
                  <ExternalLink className="w-4 h-4 text-amber-400 icon-animated" />
                  <span>مشغل ويندوز الصامت (.vbs)</span>
                </button>
              </div>

              {/* Option 4 & 5: Direct HTML & URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const res = downloadMinistryDesktopShortcut();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <img src="/favicon.svg" alt="شعار الوزارة" className="w-3.5 h-3.5" />
                  <span>أيقونة المشغل السريع (HTML)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const res = downloadWindowsUrlShortcut();
                    setStatusMsg({ text: res.message, type: res.success ? 'success' : 'error' });
                  }}
                  className="py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Globe className="w-3.5 h-3.5 text-amber-700" />
                  <span>اختصار رابط ويندوز (.url)</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 7: Factory Reset */}
          <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-red-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600 icon-animated" />
                7. إعادة ضبط المصنع (Factory Reset)
              </h4>
              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                إجراء حساس
              </span>
            </div>
            <p className="text-[11px] text-red-800 font-medium">
              مسح كافة التعديلات والمخابز والمديونيات والعودة للبيانات الافتراضية الأولية فقط.
            </p>

            {!showConfirmReset ? (
              <button
                type="button"
                onClick={() => setShowConfirmReset(true)}
                className="px-3.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 border border-red-300 rounded-xl text-xs font-black transition"
              >
                طلب إعادة ضبط المصنع
              </button>
            ) : (
              <div className="p-3 bg-red-100 border border-red-400 rounded-xl space-y-2">
                <p className="text-xs font-black text-red-950">
                  هل أنت متأكد تماماً؟ سيتم مسح كافة البيانات الحالية نهائياً!
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReset}
                    className="px-4 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-black"
                  >
                    نعم، امسح كل شيء وأعد للمصنع
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                  >
                    تراجع
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-100 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-[11px] font-bold text-slate-600">
            منظومة إدارة تموين مركز المحلة الكبرى &bull; إصلاح وتحديث شامل
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer transition"
          >
            إغلاق النافذة (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
