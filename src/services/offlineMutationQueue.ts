export type RowMutationTable =
  | 'branches'
  | 'villages'
  | 'bakeries'
  | 'debts'
  | 'app_users'
  | 'daily_tasks'
  | 'inbox_messages'
  | 'high_debt_alerts'
  | 'system_config'
  | 'dropdown_lists';

export type RowMutationOp = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RowMutationEntry {
  id: string;
  table: RowMutationTable;
  operation: RowMutationOp;
  recordId: string;
  branchId: string;
  payload: any;
  expectedVersion?: number;
  timestamp: string;
  attempts: number;
  lastError?: string;
}

export const ROW_MUTATION_QUEUE_KEY = 'TAMWEEN_ROW_MUTATION_QUEUE_V1';

const memoryFallback: Record<string, string> = {};

function safeRead(key: string): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || '';
    }
  } catch {}
  return memoryFallback[key] || '';
}

function safeWrite(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {}
  memoryFallback[key] = value;
}

function safeDelete(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  delete memoryFallback[key];
}

/**
 * Pure coalescing algorithm for offline row mutations:
 * - INSERT + UPDATE -> single INSERT with latest payload
 * - INSERT + DELETE -> cancels out completely (record never reached server)
 * - UPDATE + UPDATE -> single UPDATE with latest payload & earliest expectedVersion
 * - UPDATE + DELETE -> DELETE
 */
export function coalesceRowMutation(
  queue: RowMutationEntry[],
  incoming: RowMutationEntry
): RowMutationEntry[] {
  const next = [...queue];
  const existingIdx = next.findIndex(
    (item) =>
      item.table === incoming.table &&
      item.recordId === incoming.recordId &&
      item.branchId === incoming.branchId
  );

  if (existingIdx === -1) {
    next.push(incoming);
    return next.slice(-500);
  }

  const existing = next[existingIdx];

  if (existing.operation === 'INSERT') {
    if (incoming.operation === 'DELETE') {
      next.splice(existingIdx, 1);
      return next;
    }
    next[existingIdx] = {
      ...existing,
      payload: incoming.payload,
      timestamp: incoming.timestamp,
      attempts: 0,
      lastError: undefined,
    };
    return next;
  }

  if (existing.operation === 'UPDATE') {
    if (incoming.operation === 'DELETE') {
      next[existingIdx] = {
        ...incoming,
        expectedVersion: existing.expectedVersion ?? incoming.expectedVersion,
      };
      return next;
    }
    next[existingIdx] = {
      ...existing,
      payload: incoming.payload,
      expectedVersion: existing.expectedVersion ?? incoming.expectedVersion,
      timestamp: incoming.timestamp,
      attempts: 0,
      lastError: undefined,
    };
    return next;
  }

  // Existing was DELETE and now user re-inserts/updates with same ID
  if (incoming.operation === 'INSERT' || incoming.operation === 'UPDATE') {
    next[existingIdx] = incoming;
    return next;
  }

  next[existingIdx] = incoming;
  return next;
}

export function loadRowMutationQueue(): RowMutationEntry[] {
  try {
    const raw = safeRead(ROW_MUTATION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRowMutationQueue(queue: RowMutationEntry[]): void {
  if (!queue || queue.length === 0) {
    safeDelete(ROW_MUTATION_QUEUE_KEY);
    return;
  }
  try {
    safeWrite(ROW_MUTATION_QUEUE_KEY, JSON.stringify(queue.slice(-500)));
  } catch {
    // Preserve top critical mutations if storage quota is constrained
    try {
      safeWrite(ROW_MUTATION_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
    } catch {}
  }
}

export function enqueueRowMutation(
  entry: Omit<RowMutationEntry, 'id' | 'timestamp' | 'attempts'> & {
    id?: string;
    timestamp?: string;
  }
): { queue: RowMutationEntry[]; count: number } {
  const full: RowMutationEntry = {
    id: entry.id || `rm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    attempts: 0,
    table: entry.table,
    operation: entry.operation,
    recordId: entry.recordId,
    branchId: entry.branchId,
    payload: entry.payload,
    expectedVersion: entry.expectedVersion,
  };
  const current = loadRowMutationQueue();
  const updated = coalesceRowMutation(current, full);
  saveRowMutationQueue(updated);
  return { queue: updated, count: updated.length };
}

export function getRowMutationQueueCount(): number {
  return loadRowMutationQueue().length;
}

export function removeRowMutationById(id: string): RowMutationEntry[] {
  const updated = loadRowMutationQueue().filter((item) => item.id !== id);
  saveRowMutationQueue(updated);
  return updated;
}

export function markRowMutationAttemptFailed(id: string, error: string): RowMutationEntry[] {
  const updated = loadRowMutationQueue().map((item) =>
    item.id === id ? { ...item, attempts: item.attempts + 1, lastError: error } : item
  );
  saveRowMutationQueue(updated);
  return updated;
}

export function clearRowMutationQueue(): void {
  safeDelete(ROW_MUTATION_QUEUE_KEY);
}
