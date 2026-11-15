import type { AppState } from '../storage';
import type {
  AppUser,
  Bakery,
  DailyBakeryTask,
  DebtRecord,
  HighDebtAlertNotification,
  InboxChatMessage,
  SupplyBranch,
  VillageHierarchy,
} from '../types';
import { synchronizeBakeryAndDebts } from '../utils/auditHelper';
import {
  clearRowMutationQueue,
  enqueueRowMutation,
  getRowMutationQueueCount,
  loadRowMutationQueue,
  markRowMutationAttemptFailed,
  removeRowMutationById,
  type RowMutationEntry,
  type RowMutationOp,
  type RowMutationTable,
} from './offlineMutationQueue';
import {
  getPendingOfflineQueueCount,
  getSecurityShieldHeaders,
  getSupabaseClient,
  mapSqlRowToBakery,
  mapSqlRowToBranch,
  mapSqlRowToDebt,
  mapSqlRowToTask,
  mapSqlRowToUser,
  mapSqlRowToVillage,
  markTableRealtimeEvent,
  recordRealtimeDiagnosticEvent,
  registerRowQueueFlusher,
  SESSION_CLIENT_ID,
  setCloudConnectionStatus,
} from '../lib/supabase';

export interface GranularRowChangeEvent {
  table: RowMutationTable | 'backup_snapshots';
  eventType: RowMutationOp;
  branchId?: string;
  newRow?: any;
  oldRow?: any;
  timestamp: string;
}

export interface DbMutationResult<T = any> {
  success: boolean;
  queuedOffline?: boolean;
  conflict?: boolean;
  latestRow?: T;
  row?: T;
  revision?: number;
  error?: string;
}

function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function getDbApiBaseUrl(suffix = ''): string {
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.host}/api/db${suffix}`;
  }
  return `/api/db${suffix}`;
}

function upsertById<T extends { id: string }>(list: T[], item: T, prepend = false): T[] {
  const safe = Array.isArray(list) ? [...list] : [];
  const idx = safe.findIndex((x) => String(x.id) === String(item.id));
  if (idx >= 0) {
    safe[idx] = { ...safe[idx], ...item };
    return safe;
  }
  return prepend ? [item, ...safe] : [...safe, item];
}

function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return (Array.isArray(list) ? list : []).filter((x) => String(x.id) !== String(id));
}

function normalizeIncomingBakery(raw: any): Bakery | null {
  if (!raw) return null;
  if ('bakeryOwnerName' in raw && !raw.data_json) return raw as Bakery;
  return mapSqlRowToBakery(raw);
}

function normalizeIncomingDebt(raw: any): DebtRecord | null {
  if (!raw) return null;
  if ('bakeryId' in raw && !raw.data_json) return raw as DebtRecord;
  return mapSqlRowToDebt(raw);
}

function normalizeIncomingTask(raw: any): DailyBakeryTask | null {
  if (!raw) return null;
  if ('dueDate' in raw || ('title' in raw && !raw.data_json && !('due_date' in raw))) {
    return raw as DailyBakeryTask;
  }
  return mapSqlRowToTask(raw);
}

function normalizeIncomingBranch(raw: any): SupplyBranch | null {
  if (!raw) return null;
  if ('governorateTitle' in raw && !raw.data_json) return raw as SupplyBranch;
  return mapSqlRowToBranch(raw);
}

function normalizeIncomingUser(raw: any): AppUser | null {
  if (!raw) return null;
  if ('fullName' in raw && !raw.data_json) return raw as AppUser;
  return mapSqlRowToUser(raw);
}

function normalizeIncomingInboxMessage(raw: any): InboxChatMessage | null {
  if (!raw) return null;
  if ('senderId' in raw && !raw.data_json) return raw as InboxChatMessage;
  const payload = raw.data_json || {};
  return {
    id: String(raw.id || payload.id || ''),
    senderId: String(raw.sender_id || payload.senderId || ''),
    senderName: String(raw.sender_name || payload.senderName || ''),
    senderRole: String(raw.sender_role || payload.senderRole || 'inspector'),
    recipientTarget: String(raw.recipient_target || payload.recipientTarget || 'ALL'),
    recipientLabel: String(raw.recipient_label || payload.recipientLabel || 'الجميع'),
    messageType: (raw.message_type || payload.messageType || 'instruction') as InboxChatMessage['messageType'],
    content: String(raw.content || payload.content || ''),
    relatedBakeryId: raw.related_bakery_id || payload.relatedBakeryId || undefined,
    relatedBakeryName: raw.related_bakery_name || payload.relatedBakeryName || undefined,
    readBy: Array.isArray(raw.read_by) ? raw.read_by : Array.isArray(payload.readBy) ? payload.readBy : [],
    timestamp: String(raw.timestamp || payload.timestamp || new Date().toISOString()),
  };
}

/**
 * Pure deterministic reducer that applies an incoming single-row Realtime/WebSocket change
 * onto AppState without full-page reload, immediately recalculating bakery/debt links and totals.
 */
export function applyGranularRowChangeToState(
  prev: AppState,
  change: GranularRowChangeEvent
): AppState {
  const { table, eventType, newRow, oldRow } = change;
  const activeBranchId = prev.activeBranchId || 'branch-mahalla';
  const rowBranchId =
    change.branchId || newRow?.branchId || newRow?.branch_id || oldRow?.branchId || oldRow?.branch_id;

  // Branches are global across the tenant selector
  if (table === 'branches') {
    const branches = Array.isArray(prev.branches) ? [...prev.branches] : [];
    const targetId = String(newRow?.id || oldRow?.id || '');
    if (!targetId) return prev;
    if (eventType === 'DELETE') {
      return { ...prev, branches: removeById(branches, targetId) };
    }
    const mapped = normalizeIncomingBranch(newRow);
    if (!mapped) return prev;
    return { ...prev, branches: upsertById(branches, mapped) };
  }

  // Ignore changes belonging to a different branch on branch-scoped tables
  if (rowBranchId && rowBranchId !== activeBranchId) {
    return prev;
  }

  const nowIso = change.timestamp || new Date().toISOString();

  if (table === 'bakeries') {
    const targetId = String(newRow?.id || oldRow?.id || '');
    if (!targetId) return prev;
    const normalized = eventType === 'DELETE' ? null : normalizeIncomingBakery(newRow);
    const nextBakeries =
      eventType === 'DELETE'
        ? removeById(prev.bakeries || [], targetId)
        : normalized
        ? upsertById(prev.bakeries || [], normalized)
        : prev.bakeries || [];
    const nextDebts =
      eventType === 'DELETE'
        ? (prev.debts || []).filter((d) => String(d.bakeryId) !== targetId)
        : prev.debts || [];
    const synced = synchronizeBakeryAndDebts(nextBakeries, nextDebts);
    return {
      ...prev,
      bakeries: synced.bakeries,
      debts: synced.debts,
      lastUpdatedAt: nowIso,
    };
  }

  if (table === 'debts') {
    const targetId = String(newRow?.id || oldRow?.id || '');
    if (!targetId) return prev;
    const normalized = eventType === 'DELETE' ? null : normalizeIncomingDebt(newRow);
    const nextDebts =
      eventType === 'DELETE'
        ? removeById(prev.debts || [], targetId)
        : normalized
        ? upsertById(prev.debts || [], normalized, true)
        : prev.debts || [];
    const synced = synchronizeBakeryAndDebts(prev.bakeries || [], nextDebts);
    return {
      ...prev,
      bakeries: synced.bakeries,
      debts: synced.debts,
      lastUpdatedAt: nowIso,
    };
  }

  if (table === 'villages') {
    const targetName = String(
      newRow?.village ||
        newRow?.village_name ||
        newRow?.data_json?.village ||
        oldRow?.village ||
        oldRow?.village_name ||
        oldRow?.data_json?.village ||
        ''
    );
    if (!targetName) return prev;
    const current = Array.isArray(prev.villages) ? [...prev.villages] : [];
    if (eventType === 'DELETE') {
      return {
        ...prev,
        villages: current.filter((v) => v.village !== targetName),
        lastUpdatedAt: nowIso,
      };
    }
    const mapped: VillageHierarchy =
      mapSqlRowToVillage(newRow) || {
        village: targetName,
        localUnits: Array.isArray(newRow?.localUnits || newRow?.local_units)
          ? newRow.localUnits || newRow.local_units
          : [],
      };
    const idx = current.findIndex((v) => v.village === mapped.village);
    if (idx >= 0) current[idx] = mapped;
    else current.push(mapped);
    return { ...prev, villages: current, lastUpdatedAt: nowIso };
  }

  if (table === 'app_users') {
    const targetId = String(newRow?.id || oldRow?.id || '');
    if (!targetId) return prev;
    const normalized = eventType === 'DELETE' ? null : normalizeIncomingUser(newRow);
    const users =
      eventType === 'DELETE'
        ? removeById(prev.users || [], targetId)
        : normalized
        ? upsertById(prev.users || [], normalized)
        : prev.users || [];
    return { ...prev, users, lastUpdatedAt: nowIso };
  }

  if (table === 'daily_tasks') {
    const targetId = String(newRow?.id || oldRow?.id || '');
    if (!targetId) return prev;
    const normalized = eventType === 'DELETE' ? null : normalizeIncomingTask(newRow);
    const dailyTasks =
      eventType === 'DELETE'
        ? removeById(prev.dailyTasks || [], targetId)
        : normalized
        ? upsertById(prev.dailyTasks || [], normalized, true)
        : prev.dailyTasks || [];
    return { ...prev, dailyTasks, lastUpdatedAt: nowIso };
  }

  if (table === 'inbox_messages') {
    const targetId = String(newRow?.id || oldRow?.id || '');
    if (!targetId) return prev;
    const normalized = eventType === 'DELETE' ? null : normalizeIncomingInboxMessage(newRow);
    const inboxMessages =
      eventType === 'DELETE'
        ? removeById(prev.inboxMessages || [], targetId)
        : normalized
        ? upsertById(prev.inboxMessages || [], normalized)
        : prev.inboxMessages || [];
    return { ...prev, inboxMessages, lastUpdatedAt: nowIso };
  }

  if (table === 'system_config' && newRow) {
    const cfgPayload = newRow.systemConfig || newRow.payload;
    const colPayload = newRow.columnTitles || newRow.column_titles;
    const actPayload = newRow.activityStatuses || newRow.activity_statuses;
    return {
      ...prev,
      ...(cfgPayload
        ? { systemConfig: { ...(prev.systemConfig || {}), ...cfgPayload } }
        : {}),
      ...(colPayload && Object.keys(colPayload).length > 0
        ? { columnTitles: { ...(prev.columnTitles || {}), ...colPayload } }
        : {}),
      ...(Array.isArray(actPayload) && actPayload.length > 0
        ? { activityStatuses: actPayload }
        : {}),
      lastUpdatedAt: nowIso,
    };
  }

  if (table === 'dropdown_lists' && (newRow?.listKey || newRow?.list_key)) {
    const key = String(newRow.listKey || newRow.list_key);
    const opts = Array.isArray(newRow.options) ? newRow.options : [];
    const next: AppState = { ...prev, lastUpdatedAt: nowIso };
    if (key === 'issuingEntities') next.issuingEntities = opts;
    else if (key === 'violationTypes') next.violationTypes = opts;
    else if (key === 'bakeryCategories') next.bakeryCategories = opts;
    else if (key === 'breadTypes') next.breadTypes = opts;
    else if (key === 'breadTypeCounts') next.breadTypeCounts = opts;
    else if (key === 'lineTypes') next.lineTypes = opts;
    else if (key === 'fuelTypes') next.fuelTypes = opts;
    else if (key === 'leaseContractTypes') next.leaseContractTypes = opts;
    else if (key === 'responsibleManagerOptions') next.responsibleManagerOptions = opts;
    else if (key === 'paymentMethods') next.paymentMethods = opts;
    else if (key === 'activityStatuses') next.activityStatuses = opts;
    else if (key === 'customRoles') {
      next.systemConfig = {
        ...next.systemConfig,
        customRoles: opts,
      };
    }
    return next;
  }

  return prev;
}

/**
 * Pure conflict resolution helper when an optimistic mutation receives a 409 VERSION_CONFLICT.
 */
export function resolveConflictWithServerRow(
  prev: AppState,
  table: RowMutationTable,
  branchId: string,
  latestRow: any
): AppState {
  if (!latestRow) return prev;
  return applyGranularRowChangeToState(prev, {
    table,
    eventType: 'UPDATE',
    branchId,
    newRow: latestRow,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Pure guard ensuring incoming full-state cloud/WebSocket snapshots are only
 * applied to AppState when they actually target the currently active branch.
 */
export function shouldApplyIncomingCloudStateForBranch(
  currentBranchId: string,
  incomingData: (Partial<AppState> & { branchPartitions?: Record<string, any> }) | null | undefined
): boolean {
  if (!incomingData || !currentBranchId) return false;
  const directPartitions = incomingData.branchPartitions;
  if (directPartitions && typeof directPartitions === 'object' && Object.keys(directPartitions).length > 0) {
    return Boolean(directPartitions[currentBranchId]);
  }
  const incomingBranchId = incomingData.activeBranchId || 'branch-mahalla';
  return incomingBranchId === currentBranchId;
}

function updateQueueStatusBadge() {
  const totalPending = getRowMutationQueueCount() + getPendingOfflineQueueCount();
  if (isOfflineNow()) {
    setCloudConnectionStatus(
      'offline',
      totalPending > 0
        ? `غير متصل — تم حفظ (${totalPending}) عملية في قائمة الانتظار الآمنة`
        : 'الجهاز غير متصل بالإنترنت',
      { hasPendingSync: totalPending > 0, pendingQueueCount: totalPending }
    );
  } else {
    const nowAr = new Date().toLocaleTimeString('ar-EG');
    setCloudConnectionStatus('connected', `متصل بالخادم (${nowAr})`, {
      lastSyncAt: nowAr,
      hasPendingSync: totalPending > 0,
      pendingQueueCount: totalPending,
    });
  }
}

export async function saveRowToDb<T = any>(params: {
  table: RowMutationTable;
  branchId: string;
  row: T & { id?: string; version?: number };
  operation?: 'INSERT' | 'UPDATE';
  expectedVersion?: number;
  skipOfflineQueue?: boolean;
}): Promise<DbMutationResult<T>> {
  const { table, branchId, row, expectedVersion, skipOfflineQueue } = params;
  const recordId =
    table === 'system_config'
      ? branchId
      : table === 'villages'
      ? String((row as any)?.id || `${branchId}__${(row as any)?.village || ''}`)
      : table === 'dropdown_lists'
      ? String((row as any)?.id || `${branchId}__${(row as any)?.listKey || ''}`)
      : String((row as any)?.id || '');

  const op: RowMutationOp = params.operation || 'UPDATE';

  if (isOfflineNow()) {
    if (!skipOfflineQueue) {
      enqueueRowMutation({
        table,
        operation: op,
        recordId,
        branchId,
        payload: row,
        expectedVersion,
      });
    }
    updateQueueStatusBadge();
    return {
      success: false,
      queuedOffline: true,
      error: 'الجهاز غير متصل بالإنترنت — تم حفظ العملية في قائمة الانتظار.',
    };
  }

  const sentAt = Date.now();
  try {
    const resp = await fetch(getDbApiBaseUrl(`/${table}`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getSecurityShieldHeaders(true),
      body: JSON.stringify({
        branchId,
        clientId: SESSION_CLIENT_ID,
        expectedVersion,
        sentAt,
        row,
      }),
    });

    const json = await resp.json().catch(() => null);

    if (resp.status === 409 || json?.conflict) {
      return {
        success: false,
        conflict: true,
        latestRow: json?.latestRow,
        error: json?.error || 'تعارض تعديل متزامن: تم تحديث السجل من جهاز آخر.',
      };
    }

    if (!resp.ok || !json?.success) {
      return {
        success: false,
        error: json?.error || `فشل الحفظ في قاعدة البيانات (HTTP ${resp.status}).`,
      };
    }

    // Mirror to external Supabase if configured
    const client = getSupabaseClient();
    if (client && table !== 'dropdown_lists') {
      try {
        await client.from(table).upsert(json.row || row, { onConflict: 'id' });
      } catch {}
    }

    markTableRealtimeEvent(table as any, json.operation || op, json.timestamp || new Date().toISOString());
    recordRealtimeDiagnosticEvent({
      direction: 'OUTGOING',
      channel: 'WEBSOCKET',
      eventType: `postgres_changes:${json.operation || op}`,
      sqlOperation: (json.operation || op) as RowMutationOp,
      table,
      affectedTable: table as any,
      senderClientId: SESSION_CLIENT_ID,
      isSelf: true,
      revision: json.revision,
      responseLatencyMs: Math.max(1, Date.now() - sentAt),
      summary: `حفظ سجل في جدول (${table}) على الخادم المركزي بنجاح`,
    });

    updateQueueStatusBadge();
    return {
      success: true,
      row: json.row,
      revision: json.revision,
    };
  } catch (err: any) {
    if (!skipOfflineQueue) {
      enqueueRowMutation({
        table,
        operation: op,
        recordId,
        branchId,
        payload: row,
        expectedVersion,
      });
    }
    updateQueueStatusBadge();
    return {
      success: false,
      queuedOffline: true,
      error: err?.message || 'تعذر الاتصال بالخادم — تم حفظ العملية في قائمة الانتظار.',
    };
  }
}

export async function deleteRowFromDb(params: {
  table: RowMutationTable;
  id: string;
  branchId: string;
  skipOfflineQueue?: boolean;
}): Promise<DbMutationResult> {
  const { table, id, branchId, skipOfflineQueue } = params;

  if (isOfflineNow()) {
    if (!skipOfflineQueue) {
      enqueueRowMutation({
        table,
        operation: 'DELETE',
        recordId: id,
        branchId,
        payload: { id, branchId },
      });
    }
    updateQueueStatusBadge();
    return {
      success: false,
      queuedOffline: true,
      error: 'الجهاز غير متصل بالإنترنت — تم حفظ الحذف في قائمة الانتظار.',
    };
  }

  const sentAt = Date.now();
  try {
    const url = `${getDbApiBaseUrl(`/${table}/${encodeURIComponent(id)}`)}?branchId=${encodeURIComponent(
      branchId
    )}&clientId=${encodeURIComponent(SESSION_CLIENT_ID)}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: getSecurityShieldHeaders(false),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.success) {
      return {
        success: false,
        error: json?.error || `فشل حذف السجل من قاعدة البيانات (HTTP ${resp.status}).`,
      };
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from(table).delete().eq('id', id);
      } catch {}
    }

    markTableRealtimeEvent(table as any, 'DELETE', json.timestamp || new Date().toISOString());
    recordRealtimeDiagnosticEvent({
      direction: 'OUTGOING',
      channel: 'WEBSOCKET',
      eventType: 'postgres_changes:DELETE',
      sqlOperation: 'DELETE',
      table,
      affectedTable: table as any,
      senderClientId: SESSION_CLIENT_ID,
      isSelf: true,
      revision: json.revision,
      responseLatencyMs: Math.max(1, Date.now() - sentAt),
      summary: `حذف سجل (${id}) من جدول (${table}) على الخادم المركزي`,
    });

    updateQueueStatusBadge();
    return { success: true, revision: json.revision };
  } catch (err: any) {
    if (!skipOfflineQueue) {
      enqueueRowMutation({
        table,
        operation: 'DELETE',
        recordId: id,
        branchId,
        payload: { id, branchId },
      });
    }
    updateQueueStatusBadge();
    return {
      success: false,
      queuedOffline: true,
      error: err?.message || 'تعذر الاتصال بالخادم — تم حفظ الحذف في قائمة الانتظار.',
    };
  }
}

export async function batchSyncToDb(params: {
  branchId: string;
  data: Partial<AppState>;
  pruneRemoved?: boolean;
  sqlOperation?: RowMutationOp;
  affectedTable?: string;
}): Promise<DbMutationResult> {
  if (isOfflineNow()) {
    return {
      success: false,
      queuedOffline: true,
      error: 'الجهاز غير متصل بالإنترنت.',
    };
  }

  try {
    const sentAt = Date.now();
    const resp = await fetch(getDbApiBaseUrl('/batch'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getSecurityShieldHeaders(true),
      body: JSON.stringify({
        branchId: params.branchId,
        clientId: SESSION_CLIENT_ID,
        pruneRemoved: Boolean(params.pruneRemoved),
        sqlOperation: params.sqlOperation || 'UPDATE',
        affectedTable: params.affectedTable || 'bakeries',
        sentAt,
        data: params.data,
      }),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.success) {
      return {
        success: false,
        error: json?.error || `فشل المزامنة الجماعية (HTTP ${resp.status})`,
      };
    }
    updateQueueStatusBadge();
    return { success: true, row: json.data, revision: json.revision };
  } catch (err: any) {
    updateQueueStatusBadge();
    return { success: false, queuedOffline: true, error: err?.message };
  }
}

export async function fetchBranchBootstrapFromDb(branchId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  if (typeof window === 'undefined' || isOfflineNow()) {
    return { success: false, error: 'غير متصل بالخادم' };
  }
  try {
    const resp = await fetch(`${getDbApiBaseUrl('/bootstrap')}?branchId=${encodeURIComponent(branchId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: getSecurityShieldHeaders(false),
    });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    const json = await resp.json();
    if (!json?.success) return { success: false, error: json?.error };
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function queryPaginatedRowsFromDb<T = any>(
  table: RowMutationTable,
  options: {
    branchId: string;
    search?: string;
    village?: string;
    localUnit?: string;
    activityStatus?: string;
    bakeryId?: string;
    status?: string;
    priority?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{
  success: boolean;
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const qs = new URLSearchParams();
  qs.set('branchId', options.branchId);
  if (options.search) qs.set('search', options.search);
  if (options.village) qs.set('village', options.village);
  if (options.localUnit) qs.set('localUnit', options.localUnit);
  if (options.activityStatus) qs.set('activityStatus', options.activityStatus);
  if (options.bakeryId) qs.set('bakeryId', options.bakeryId);
  if (options.status) qs.set('status', options.status);
  if (options.priority) qs.set('priority', options.priority);
  if (options.page) qs.set('page', String(options.page));
  if (options.pageSize) qs.set('pageSize', String(options.pageSize));

  const resp = await fetch(`${getDbApiBaseUrl(`/${table}`)}?${qs.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: getSecurityShieldHeaders(false),
  });
  const json = await resp.json();
  return {
    success: Boolean(json?.success),
    rows: Array.isArray(json?.rows) ? json.rows : [],
    total: Number(json?.total || 0),
    page: Number(json?.page || 1),
    pageSize: Number(json?.pageSize || 100),
    totalPages: Number(json?.totalPages || 1),
  };
}

let isFlushingRows = false;

export async function flushRowMutationQueue(
  onConflict?: (entry: RowMutationEntry, latestRow: any) => void
): Promise<{ flushedCount: number; conflictCount: number; remainingCount: number }> {
  if (isOfflineNow() || isFlushingRows) {
    return { flushedCount: 0, conflictCount: 0, remainingCount: getRowMutationQueueCount() };
  }
  const queue = loadRowMutationQueue();
  if (queue.length === 0) {
    return { flushedCount: 0, conflictCount: 0, remainingCount: 0 };
  }

  isFlushingRows = true;
  let flushedCount = 0;
  let conflictCount = 0;
  try {
    for (const item of queue) {
      if (isOfflineNow()) break;
      if (item.operation === 'DELETE') {
        const res = await deleteRowFromDb({
          table: item.table,
          id: item.recordId,
          branchId: item.branchId,
          skipOfflineQueue: true,
        });
        if (res.success) {
          removeRowMutationById(item.id);
          flushedCount += 1;
        } else if (res.queuedOffline) {
          markRowMutationAttemptFailed(item.id, res.error || 'offline');
          break;
        } else {
          markRowMutationAttemptFailed(item.id, res.error || 'error');
        }
      } else {
        const res = await saveRowToDb({
          table: item.table,
          branchId: item.branchId,
          row: item.payload,
          operation: item.operation,
          expectedVersion: item.expectedVersion,
          skipOfflineQueue: true,
        });
        if (res.success) {
          removeRowMutationById(item.id);
          flushedCount += 1;
        } else if (res.conflict) {
          conflictCount += 1;
          removeRowMutationById(item.id);
          onConflict?.(item, res.latestRow);
        } else if (res.queuedOffline) {
          markRowMutationAttemptFailed(item.id, res.error || 'offline');
          break;
        } else {
          markRowMutationAttemptFailed(item.id, res.error || 'error');
        }
      }
    }
    const remainingCount = getRowMutationQueueCount();
    updateQueueStatusBadge();
    return { flushedCount, conflictCount, remainingCount };
  } finally {
    isFlushingRows = false;
  }
}

export function resetAllPendingSyncQueues(): void {
  clearRowMutationQueue();
}

registerRowQueueFlusher(() => flushRowMutationQueue());

export type { HighDebtAlertNotification };
