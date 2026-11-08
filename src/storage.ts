import {
  Bakery,
  DebtRecord,
  VillageHierarchy,
  ColumnTitles,
  SystemConfig,
  AppUser
} from './types';
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

export interface AppState {
  bakeries: Bakery[];
  debts: DebtRecord[];
  villages: VillageHierarchy[];
  issuingEntities: string[];
  violationTypes: string[];
  activityStatuses: string[];
  columnTitles: ColumnTitles;
  systemConfig: SystemConfig;
  users: AppUser[];
  currentUser: AppUser | null;
}

const DB_NAME = 'TamweenGharbiaDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

const KEYS = {
  INITIALIZED: 'TAMWEEN_INITIALIZED_V3',
  SESSION: 'TAMWEEN_SESSION_V3',
  BAKERIES: 'TAMWEEN_BAKERIES_V3',
  DEBTS: 'TAMWEEN_DEBTS_V3',
  VILLAGES: 'TAMWEEN_VILLAGES_V3',
  ENTITIES: 'TAMWEEN_ENTITIES_V3',
  VIOLATIONS: 'TAMWEEN_VIOLATIONS_V3',
  ACTIVITY_STATUSES: 'TAMWEEN_ACTIVITY_STATUSES_V3',
  COLUMNS: 'TAMWEEN_COLUMNS_V3',
  CONFIG: 'TAMWEEN_CONFIG_V3',
  USERS: 'TAMWEEN_USERS_V3',
  AUTOSAVE_BACKUP: 'TAMWEEN_AUTOSAVE_BACKUP_V3',
  AUTOSAVE_TIMESTAMP: 'TAMWEEN_AUTOSAVE_TIMESTAMP_V3',
};

// IndexedDB Helper with safety timeout for file:/// and offline environments
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error('IndexedDB connection timeout'));
      }, 250);

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('IndexedDB blocked'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, val: unknown): Promise<void> {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // fallback gracefully
  }
}

// Merge two application states (merges bakeries without losing existing ones on original device)
export function mergeStates(base: AppState, incoming: Partial<AppState>): AppState {
  const bakeryMap = new Map<string, Bakery>();
  base.bakeries.forEach((b) => bakeryMap.set(b.id, b));
  (incoming.bakeries || []).forEach((b) => {
    let matchedId: string | null = bakeryMap.has(b.id) ? b.id : null;
    if (!matchedId) {
      for (const [id, ex] of bakeryMap.entries()) {
        if (ex.machineNumber && b.machineNumber && ex.machineNumber === b.machineNumber) {
          matchedId = id;
          break;
        }
      }
    }
    if (matchedId) {
      bakeryMap.set(matchedId, { ...bakeryMap.get(matchedId)!, ...b });
    } else {
      bakeryMap.set(b.id, b);
    }
  });

  const debtMap = new Map<string, DebtRecord>();
  base.debts.forEach((d) => debtMap.set(d.id, d));
  (incoming.debts || []).forEach((d) => {
    debtMap.set(d.id, { ...(debtMap.get(d.id) || {}), ...d });
  });

  const villageMap = new Map<string, Set<string>>();
  base.villages.forEach((v) => villageMap.set(v.village, new Set(v.localUnits)));
  (incoming.villages || []).forEach((v) => {
    if (villageMap.has(v.village)) {
      v.localUnits.forEach((u) => villageMap.get(v.village)!.add(u));
    } else {
      villageMap.set(v.village, new Set(v.localUnits));
    }
  });
  const mergedVillages: VillageHierarchy[] = Array.from(villageMap.entries()).map(([village, units]) => ({
    village,
    localUnits: Array.from(units),
  }));

  const userMap = new Map<string, AppUser>();
  base.users.forEach((u) => userMap.set(u.id, u));
  (incoming.users || []).forEach((u) => userMap.set(u.id, u));

  return {
    ...base,
    bakeries: Array.from(bakeryMap.values()),
    debts: Array.from(debtMap.values()),
    villages: mergedVillages.length > 0 ? mergedVillages : base.villages,
    users: Array.from(userMap.values()),
    issuingEntities: Array.from(new Set([...base.issuingEntities, ...(incoming.issuingEntities || [])])),
    violationTypes: Array.from(new Set([...base.violationTypes, ...(incoming.violationTypes || [])])),
    activityStatuses: Array.from(new Set([...base.activityStatuses, ...(incoming.activityStatuses || [])])),
    systemConfig: incoming.systemConfig || base.systemConfig,
    columnTitles: incoming.columnTitles || base.columnTitles,
  };
}

export async function loadInitialState(): Promise<AppState> {
  try {
    // 1. FAST PATH: Check if state is preloaded directly in the standalone HTML file
    interface PreloadedStatePayload extends Partial<AppState> {
      exportTimestamp?: string;
    }
    const preloaded = typeof window !== 'undefined'
      ? (window as unknown as { PRELOADED_TAMWEEN_STATE?: PreloadedStatePayload }).PRELOADED_TAMWEEN_STATE
      : undefined;

    let bakeries: Bakery[] | null = null;
    let debts: DebtRecord[] | null = null;
    let villages: VillageHierarchy[] | null = null;
    let issuingEntities: string[] | null = null;
    let violationTypes: string[] | null = null;
    let activityStatuses: string[] | null = null;
    let columnTitles: ColumnTitles | null = null;
    let systemConfig: SystemConfig | null = null;
    let users: AppUser[] | null = null;

    // Fast synchronous read from localStorage
    let isInitialized = false;
    try {
      isInitialized = localStorage.getItem(KEYS.INITIALIZED) === 'true';
      if (localStorage.getItem(KEYS.BAKERIES)) {
        bakeries = JSON.parse(localStorage.getItem(KEYS.BAKERIES)!);
      }
      if (localStorage.getItem(KEYS.DEBTS)) {
        debts = JSON.parse(localStorage.getItem(KEYS.DEBTS)!);
      }
      if (localStorage.getItem(KEYS.VILLAGES)) {
        villages = JSON.parse(localStorage.getItem(KEYS.VILLAGES)!);
      }
      if (localStorage.getItem(KEYS.ENTITIES)) {
        issuingEntities = JSON.parse(localStorage.getItem(KEYS.ENTITIES)!);
      }
      if (localStorage.getItem(KEYS.VIOLATIONS)) {
        violationTypes = JSON.parse(localStorage.getItem(KEYS.VIOLATIONS)!);
      }
      if (localStorage.getItem(KEYS.ACTIVITY_STATUSES)) {
        activityStatuses = JSON.parse(localStorage.getItem(KEYS.ACTIVITY_STATUSES)!);
      }
      if (localStorage.getItem(KEYS.COLUMNS)) {
        columnTitles = JSON.parse(localStorage.getItem(KEYS.COLUMNS)!);
      }
      if (localStorage.getItem(KEYS.CONFIG)) {
        systemConfig = JSON.parse(localStorage.getItem(KEYS.CONFIG)!);
      }
      if (localStorage.getItem(KEYS.USERS)) {
        users = JSON.parse(localStorage.getItem(KEYS.USERS)!);
      }
    } catch (lsErr) {
      console.warn('LocalStorage read error or restricted:', lsErr);
    }

    // 2. If standalone preloaded file is opened, merge or adopt it immediately
    if (preloaded && preloaded.bakeries && preloaded.bakeries.length > 0) {
      const lastFileTimestamp = typeof localStorage !== 'undefined' ? localStorage.getItem('TAMWEEN_LAST_FILE_TIMESTAMP') : null;
      const isNewFileImport = Boolean(preloaded.exportTimestamp && preloaded.exportTimestamp !== lastFileTimestamp);

      if (isNewFileImport || !bakeries || bakeries.length === 0) {
        const existingBase: AppState = {
          bakeries: bakeries ?? INITIAL_BAKERIES,
          debts: debts ?? INITIAL_DEBTS,
          villages: villages ?? DEFAULT_VILLAGES_HIERARCHY,
          issuingEntities: issuingEntities ?? DEFAULT_ISSUING_ENTITIES,
          violationTypes: violationTypes ?? DEFAULT_VIOLATION_TYPES,
          activityStatuses: activityStatuses ?? DEFAULT_ACTIVITY_STATUSES,
          columnTitles: columnTitles ?? DEFAULT_COLUMN_TITLES,
          systemConfig: systemConfig ?? DEFAULT_SYSTEM_CONFIG,
          users: users ?? INITIAL_USERS,
          currentUser: null,
        };
        const merged = mergeStates(existingBase, preloaded);
        bakeries = merged.bakeries;
        debts = merged.debts;
        villages = merged.villages;
        issuingEntities = merged.issuingEntities;
        violationTypes = merged.violationTypes;
        activityStatuses = merged.activityStatuses;
        columnTitles = merged.columnTitles;
        systemConfig = merged.systemConfig;
        users = merged.users;

        try {
          if (preloaded.exportTimestamp) {
            localStorage.setItem('TAMWEEN_LAST_FILE_TIMESTAMP', preloaded.exportTimestamp);
          }
          localStorage.setItem(KEYS.INITIALIZED, 'true');
        } catch {}

        // Non-blocking background persistence
        persistFullState({
          bakeries,
          debts,
          villages,
          issuingEntities,
          violationTypes,
          activityStatuses,
          columnTitles,
          systemConfig,
          users,
          currentUser: null,
        }).catch(() => {});
      }
    } else if (!isInitialized && (!bakeries || bakeries.length === 0)) {
      // First run default seed
      bakeries = INITIAL_BAKERIES;
      debts = INITIAL_DEBTS;
      villages = DEFAULT_VILLAGES_HIERARCHY;
      issuingEntities = DEFAULT_ISSUING_ENTITIES;
      violationTypes = DEFAULT_VIOLATION_TYPES;
      activityStatuses = DEFAULT_ACTIVITY_STATUSES;
      columnTitles = DEFAULT_COLUMN_TITLES;
      systemConfig = DEFAULT_SYSTEM_CONFIG;
      users = INITIAL_USERS;

      try {
        localStorage.setItem(KEYS.INITIALIZED, 'true');
      } catch {}

      persistFullState({
        bakeries,
        debts,
        villages,
        issuingEntities,
        violationTypes,
        activityStatuses,
        columnTitles,
        systemConfig,
        users,
        currentUser: null,
      }).catch(() => {});
    }

    // 3. Fallback defaults if any section is empty
    bakeries = bakeries ?? INITIAL_BAKERIES;
    debts = debts ?? INITIAL_DEBTS;
    villages = villages ?? DEFAULT_VILLAGES_HIERARCHY;
    issuingEntities = issuingEntities ?? DEFAULT_ISSUING_ENTITIES;
    violationTypes = violationTypes ?? DEFAULT_VIOLATION_TYPES;
    activityStatuses = activityStatuses ?? DEFAULT_ACTIVITY_STATUSES;
    columnTitles = columnTitles ?? DEFAULT_COLUMN_TITLES;
    systemConfig = systemConfig ?? DEFAULT_SYSTEM_CONFIG;
    users = users ?? INITIAL_USERS;

    // Sanitize 'شوال' to 'شيكارة'
    if (columnTitles) {
      if (columnTitles.insuranceQuota && columnTitles.insuranceQuota.includes('شوال')) {
        columnTitles.insuranceQuota = columnTitles.insuranceQuota.replace(/شوال/g, 'شيكارة');
      }
      if (columnTitles.actualQuota && columnTitles.actualQuota.includes('شوال')) {
        columnTitles.actualQuota = columnTitles.actualQuota.replace(/شوال/g, 'شيكارة');
      }
    }

    // Session check
    let currentUser: AppUser | null = null;
    let savedSessionStr: string | null = null;
    try {
      savedSessionStr = sessionStorage.getItem(KEYS.SESSION);
    } catch {}
    const activeUsers = users ?? INITIAL_USERS;
    if (savedSessionStr) {
      try {
        const parsedSession: AppUser = JSON.parse(savedSessionStr);
        const match = activeUsers.find(u => u.id === parsedSession.id || u.username === parsedSession.username);
        if (match) {
          currentUser = match;
        }
      } catch {}
    }

    return {
      bakeries,
      debts,
      villages,
      issuingEntities,
      violationTypes,
      activityStatuses,
      columnTitles,
      systemConfig,
      users: activeUsers,
      currentUser
    };
  } catch (criticalErr) {
    console.error('Critical fallback in loadInitialState:', criticalErr);
    return {
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
    };
  }
}

// Persist both to IndexedDB and LocalStorage synchronously & asynchronously
export async function persistFullState(state: Omit<AppState, 'currentUser'> & { currentUser?: AppUser | null }): Promise<void> {
  const {
    bakeries,
    debts,
    villages,
    issuingEntities,
    violationTypes,
    activityStatuses,
    columnTitles,
    systemConfig,
    users
  } = state;

  // LocalStorage
  try {
    localStorage.setItem(KEYS.BAKERIES, JSON.stringify(bakeries));
    localStorage.setItem(KEYS.DEBTS, JSON.stringify(debts));
    localStorage.setItem(KEYS.VILLAGES, JSON.stringify(villages));
    localStorage.setItem(KEYS.ENTITIES, JSON.stringify(issuingEntities));
    localStorage.setItem(KEYS.VIOLATIONS, JSON.stringify(violationTypes));
    localStorage.setItem(KEYS.ACTIVITY_STATUSES, JSON.stringify(activityStatuses));
    localStorage.setItem(KEYS.COLUMNS, JSON.stringify(columnTitles));
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(systemConfig));
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  } catch (err) {
    console.warn('LocalStorage quota limit reached, relying primarily on IndexedDB', err);
  }

  // IndexedDB (No 5MB limit, stores large logos and thousands of entries safely)
  await Promise.all([
    idbSet(KEYS.BAKERIES, bakeries),
    idbSet(KEYS.DEBTS, debts),
    idbSet(KEYS.VILLAGES, villages),
    idbSet(KEYS.ENTITIES, issuingEntities),
    idbSet(KEYS.VIOLATIONS, violationTypes),
    idbSet(KEYS.ACTIVITY_STATUSES, activityStatuses),
    idbSet(KEYS.COLUMNS, columnTitles),
    idbSet(KEYS.CONFIG, systemConfig),
    idbSet(KEYS.USERS, users)
  ]);

  // Automated snapshot backup for instant merging across sessions
  try {
    const backupSnapshot = {
      timestamp: new Date().toISOString(),
      state: {
        bakeries,
        debts,
        villages,
        issuingEntities,
        violationTypes,
        activityStatuses,
        columnTitles,
        systemConfig,
        users,
      }
    };
    localStorage.setItem(KEYS.AUTOSAVE_BACKUP, JSON.stringify(backupSnapshot));
    localStorage.setItem(KEYS.AUTOSAVE_TIMESTAMP, backupSnapshot.timestamp);
    await idbSet(KEYS.AUTOSAVE_BACKUP, backupSnapshot);
  } catch {
    // Graceful fallback
  }
}

export function getLatestAutoSaveInfo(): { timestamp: string | null; bakeryCount?: number; debtCount?: number } | null {
  try {
    const raw = localStorage.getItem(KEYS.AUTOSAVE_BACKUP);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        timestamp: parsed.timestamp || localStorage.getItem(KEYS.AUTOSAVE_TIMESTAMP) || null,
        bakeryCount: parsed.state?.bakeries?.length,
        debtCount: parsed.state?.debts?.length,
      };
    }
  } catch {}

  const ts = localStorage.getItem(KEYS.AUTOSAVE_TIMESTAMP);
  if (ts) {
    return { timestamp: ts };
  }
  return null;
}

export async function getLatestAutoSaveBackup(): Promise<{ timestamp: string; state: Partial<AppState> } | null> {
  // 1. Try LocalStorage
  try {
    const raw = localStorage.getItem(KEYS.AUTOSAVE_BACKUP);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.state) return parsed;
    }
  } catch {}

  // 2. Try IndexedDB
  try {
    const idbVal = await idbGet<{ timestamp: string; state: Partial<AppState> }>(KEYS.AUTOSAVE_BACKUP);
    if (idbVal && idbVal.state) {
      return idbVal;
    }
  } catch {}

  // 3. Try Preloaded data in HTML window if available
  if (typeof window !== 'undefined') {
    const preloaded = (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> & { exportTimestamp?: string } }).PRELOADED_TAMWEEN_STATE;
    if (preloaded && (preloaded.bakeries || preloaded.debts)) {
      return {
        timestamp: preloaded.exportTimestamp || new Date().toISOString(),
        state: preloaded,
      };
    }
  }

  return null;
}

export async function mergeAutoSaveOntoCurrent(currentState: AppState): Promise<{ success: boolean; message: string; newState?: AppState }> {
  try {
    const autoSave = await getLatestAutoSaveBackup();
    if (!autoSave || !autoSave.state) {
      return { success: false, message: 'لا توجد نسخة محفوظة تلقائياً سابقة للدمج في ذاكرة هذا الجهاز.' };
    }
    const mergedState = mergeStates(currentState, autoSave.state);
    await persistFullState(mergedState);
    const dateFormatted = autoSave.timestamp ? new Date(autoSave.timestamp).toLocaleString('ar-EG') : 'الحالية';
    return {
      success: true,
      message: `تم بنجاح دمج آخر قاعدة بيانات محفوظة تلقائياً (${dateFormatted}) مع قاعدة بيانات هذا الجهاز! الإجمالي الحالي: (${mergedState.bakeries.length}) مخبز و (${mergedState.debts.length}) مديونية.`,
      newState: mergedState,
    };
  } catch (err: unknown) {
    return { success: false, message: `فشل الدمج: ${(err as Error).message}` };
  }
}

export function saveSessionUser(user: AppUser | null): void {
  try {
    if (user) {
      sessionStorage.setItem(KEYS.SESSION, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(KEYS.SESSION);
      localStorage.removeItem(KEYS.SESSION);
    }
  } catch {}
}

// Native Partition Picker Save (window.showSaveFilePicker) with Fallback
export async function saveBackupToPartition(data: object): Promise<{ success: boolean; method: string; message: string }> {
  const jsonStr = JSON.stringify(data, null, 2);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `نسخة_احتياطية_تموين_مركز_المحلة_${dateStr}.json`;

  // Check if showSaveFilePicker is available
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as {
        showSaveFilePicker: (opts: {
          suggestedName: string;
          types: Array<{ description: string; accept: Record<string, string[]> }>;
        }) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'ملف قاعدة بيانات تموين المحلة الكبرى JSON',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      return {
        success: true,
        method: 'partition_picker',
        message: `تم حفظ النسخة الاحتياطية بنجاح في المكان المحدد باسم: ${handle.name}`
      };
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        return { success: false, method: 'aborted', message: 'تم إلغاء عملية حفظ الملف من قبل المستخدم' };
      }
      console.warn('showSaveFilePicker failed or was blocked, falling back to browser download', err);
    }
  }

  // Standard safe download fallback
  try {
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return {
      success: true,
      method: 'download_fallback',
      message: `تم تنزيل النسخة الاحتياطية بنجاح إلى مجلد التنزيلات بجهازك باسم: ${filename}`
    };
  } catch (err) {
    return {
      success: false,
      method: 'error',
      message: `حدث خطأ أثناء تنزيل الملف: ${(err as Error).message}`
    };
  }
}

// Reset everything to factory defaults
export async function factoryReset(): Promise<void> {
  localStorage.clear();
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise((res) => { tx.oncomplete = res; });
  } catch {}
}

export interface MergeResult {
  success: boolean;
  message: string;
  updatedBakeriesCount: number;
  newBakeriesCount: number;
  updatedDebtsCount: number;
  newDebtsCount: number;
  totalBakeries: number;
  totalDebts: number;
  newState?: AppState;
}

/**
 * Discovers and merges ANY saved database (LocalStorage, IndexedDB, preloaded state, or backups)
 * into the original base state: updates existing bakeries by ID/machineNumber and adds missing ones only.
 */
export async function autoDiscoverAndMergeAllDatabases(currentState: AppState): Promise<MergeResult> {
  try {
    const discoveredDatasets: Array<Partial<AppState>> = [];

    // 1. Check auto-save in localStorage
    try {
      const rawAuto = localStorage.getItem(KEYS.AUTOSAVE_BACKUP);
      if (rawAuto) {
        const parsed = JSON.parse(rawAuto);
        if (parsed.state) discoveredDatasets.push(parsed.state);
        else if (parsed.bakeries) discoveredDatasets.push(parsed);
      }
    } catch {}

    // 2. Check IndexedDB auto-save
    try {
      const idbVal = await idbGet<{ timestamp?: string; state?: Partial<AppState> }>(KEYS.AUTOSAVE_BACKUP);
      if (idbVal?.state) discoveredDatasets.push(idbVal.state);
    } catch {}

    // 3. Check window.PRELOADED_TAMWEEN_STATE
    if (typeof window !== 'undefined') {
      const preloaded = (window as unknown as { PRELOADED_TAMWEEN_STATE?: Partial<AppState> }).PRELOADED_TAMWEEN_STATE;
      if (preloaded && (preloaded.bakeries || preloaded.debts)) {
        discoveredDatasets.push(preloaded);
      }
    }

    // 4. Check any backup or snapshot keys in localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('backup') || key.includes('BACKUP') || key.includes('snapshot'))) {
          const val = localStorage.getItem(key);
          if (val && val.startsWith('{')) {
            const parsed = JSON.parse(val);
            if (parsed.data) discoveredDatasets.push(parsed.data);
            else if (parsed.state) discoveredDatasets.push(parsed.state);
            else if (parsed.bakeries) discoveredDatasets.push(parsed);
          }
        }
      }
    } catch {}

    if (discoveredDatasets.length === 0) {
      return {
        success: false,
        message: 'لم يتم العثور على أي قواعد بيانات أو نسخ محفوظة سابقة للدمج.',
        updatedBakeriesCount: 0,
        newBakeriesCount: 0,
        updatedDebtsCount: 0,
        newDebtsCount: 0,
        totalBakeries: currentState.bakeries.length,
        totalDebts: currentState.debts.length,
      };
    }

    // Track baseline for accurate stats reporting
    const prevBakeries = new Map<string, Bakery>();
    currentState.bakeries.forEach((b) => prevBakeries.set(b.id, b));
    const prevDebts = new Map<string, DebtRecord>();
    currentState.debts.forEach((d) => prevDebts.set(d.id, d));

    let mergedState = currentState;
    let updatedBakeriesCount = 0;
    let newBakeriesCount = 0;
    let updatedDebtsCount = 0;
    let newDebtsCount = 0;

    for (const dataset of discoveredDatasets) {
      (dataset.bakeries || []).forEach((b) => {
        let match = prevBakeries.get(b.id);
        if (!match && b.machineNumber) {
          for (const ex of prevBakeries.values()) {
            if (ex.machineNumber === b.machineNumber) {
              match = ex;
              break;
            }
          }
        }
        if (match) {
          updatedBakeriesCount++;
        } else {
          newBakeriesCount++;
          prevBakeries.set(b.id, b);
        }
      });

      (dataset.debts || []).forEach((d) => {
        if (prevDebts.has(d.id)) {
          updatedDebtsCount++;
        } else {
          newDebtsCount++;
          prevDebts.set(d.id, d);
        }
      });

      mergedState = mergeStates(mergedState, dataset);
    }

    // Persist unified state
    await persistFullState(mergedState);

    return {
      success: true,
      message: `تم دمج وتحديث قاعدة البيانات بنجاح! تم تحديث بيانات (${updatedBakeriesCount}) مخبز قائم، وإضافة (${newBakeriesCount}) مخبز جديد غير متوفر سابقاً، وضبط المديونيات. الإجمالي: (${mergedState.bakeries.length}) مخبز و (${mergedState.debts.length}) مديونية.`,
      updatedBakeriesCount,
      newBakeriesCount,
      updatedDebtsCount,
      newDebtsCount,
      totalBakeries: mergedState.bakeries.length,
      totalDebts: mergedState.debts.length,
      newState: mergedState,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `حدث خطأ أثناء فحص ودمج قواعد البيانات: ${(err as Error).message}`,
      updatedBakeriesCount: 0,
      newBakeriesCount: 0,
      updatedDebtsCount: 0,
      newDebtsCount: 0,
      totalBakeries: currentState.bakeries.length,
      totalDebts: currentState.debts.length,
    };
  }
}
