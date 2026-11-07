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
};

// IndexedDB Helper
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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

export async function loadInitialState(): Promise<AppState> {
  const isInitialized = localStorage.getItem(KEYS.INITIALIZED) === 'true';

  let bakeries: Bakery[] | null = null;
  let debts: DebtRecord[] | null = null;
  let villages: VillageHierarchy[] | null = null;
  let issuingEntities: string[] | null = null;
  let violationTypes: string[] | null = null;
  let activityStatuses: string[] | null = null;
  let columnTitles: ColumnTitles | null = null;
  let systemConfig: SystemConfig | null = null;
  let users: AppUser[] | null = null;

  // Try IndexedDB first
  try {
    bakeries = await idbGet<Bakery[]>(KEYS.BAKERIES);
    debts = await idbGet<DebtRecord[]>(KEYS.DEBTS);
    villages = await idbGet<VillageHierarchy[]>(KEYS.VILLAGES);
    issuingEntities = await idbGet<string[]>(KEYS.ENTITIES);
    violationTypes = await idbGet<string[]>(KEYS.VIOLATIONS);
    activityStatuses = await idbGet<string[]>(KEYS.ACTIVITY_STATUSES);
    columnTitles = await idbGet<ColumnTitles>(KEYS.COLUMNS);
    systemConfig = await idbGet<SystemConfig>(KEYS.CONFIG);
    users = await idbGet<AppUser[]>(KEYS.USERS);
  } catch (err) {
    console.warn('IDB read fallback to LocalStorage', err);
  }

  // Fallback to LocalStorage if not in IDB
  if (!bakeries && localStorage.getItem(KEYS.BAKERIES)) {
    try { bakeries = JSON.parse(localStorage.getItem(KEYS.BAKERIES)!); } catch {}
  }
  if (!debts && localStorage.getItem(KEYS.DEBTS)) {
    try { debts = JSON.parse(localStorage.getItem(KEYS.DEBTS)!); } catch {}
  }
  if (!villages && localStorage.getItem(KEYS.VILLAGES)) {
    try { villages = JSON.parse(localStorage.getItem(KEYS.VILLAGES)!); } catch {}
  }
  if (!issuingEntities && localStorage.getItem(KEYS.ENTITIES)) {
    try { issuingEntities = JSON.parse(localStorage.getItem(KEYS.ENTITIES)!); } catch {}
  }
  if (!violationTypes && localStorage.getItem(KEYS.VIOLATIONS)) {
    try { violationTypes = JSON.parse(localStorage.getItem(KEYS.VIOLATIONS)!); } catch {}
  }
  if (!activityStatuses && localStorage.getItem(KEYS.ACTIVITY_STATUSES)) {
    try { activityStatuses = JSON.parse(localStorage.getItem(KEYS.ACTIVITY_STATUSES)!); } catch {}
  }
  if (!columnTitles && localStorage.getItem(KEYS.COLUMNS)) {
    try { columnTitles = JSON.parse(localStorage.getItem(KEYS.COLUMNS)!); } catch {}
  }
  if (!systemConfig && localStorage.getItem(KEYS.CONFIG)) {
    try { systemConfig = JSON.parse(localStorage.getItem(KEYS.CONFIG)!); } catch {}
  }
  if (!users && localStorage.getItem(KEYS.USERS)) {
    try { users = JSON.parse(localStorage.getItem(KEYS.USERS)!); } catch {}
  }

  // If NEVER initialized, populate defaults and set INITIALIZED flag
  if (!isInitialized) {
    bakeries = INITIAL_BAKERIES;
    debts = INITIAL_DEBTS;
    villages = DEFAULT_VILLAGES_HIERARCHY;
    issuingEntities = DEFAULT_ISSUING_ENTITIES;
    violationTypes = DEFAULT_VIOLATION_TYPES;
    activityStatuses = DEFAULT_ACTIVITY_STATUSES;
    columnTitles = DEFAULT_COLUMN_TITLES;
    systemConfig = DEFAULT_SYSTEM_CONFIG;
    users = INITIAL_USERS;

    localStorage.setItem(KEYS.INITIALIZED, 'true');
    await persistFullState({
      bakeries,
      debts,
      villages,
      issuingEntities,
      violationTypes,
      activityStatuses,
      columnTitles,
      systemConfig,
      users,
      currentUser: null
    });
  } else {
    // If initialized, respect empty arrays if user intentionally deleted all records!
    bakeries = bakeries ?? [];
    debts = debts ?? [];
    villages = villages ?? DEFAULT_VILLAGES_HIERARCHY;
    issuingEntities = issuingEntities ?? DEFAULT_ISSUING_ENTITIES;
    violationTypes = violationTypes ?? DEFAULT_VIOLATION_TYPES;
    activityStatuses = activityStatuses ?? DEFAULT_ACTIVITY_STATUSES;
    columnTitles = columnTitles ?? DEFAULT_COLUMN_TITLES;
    systemConfig = systemConfig ?? DEFAULT_SYSTEM_CONFIG;
    users = users ?? INITIAL_USERS;
  }

  // Sanitize 'شوال' to 'شيكارة' in columnTitles if previously saved with 'شوال'
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
  const savedSessionStr = localStorage.getItem(KEYS.SESSION);
  if (savedSessionStr) {
    try {
      const parsedSession: AppUser = JSON.parse(savedSessionStr);
      // verify user still exists
      const match = users.find(u => u.id === parsedSession.id || u.username === parsedSession.username);
      if (match) {
        currentUser = match;
      } else {
        localStorage.removeItem(KEYS.SESSION);
      }
    } catch {
      localStorage.removeItem(KEYS.SESSION);
    }
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
    users,
    currentUser
  };
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
}

export function saveSessionUser(user: AppUser | null): void {
  if (user) {
    localStorage.setItem(KEYS.SESSION, JSON.stringify(user));
  } else {
    localStorage.removeItem(KEYS.SESSION);
  }
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
