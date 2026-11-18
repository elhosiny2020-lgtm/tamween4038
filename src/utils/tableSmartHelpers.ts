/**
 * Shared smart table utilities across all 4 departments:
 * 1. Arabic + Arabic/English digit normalization & multi-field search
 * 2. Safe client-side pagination slicing
 * 3. Per-table persisted column visibility helpers + colspan recalculation
 */

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabicAndDigits(input: unknown): string {
  if (input === null || input === undefined) return '';
  let str = String(input);
  // Convert Arabic-Indic and Eastern-Arabic digits to ASCII 0-9
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const idx1 = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (idx1 !== -1) {
      out += String(idx1);
      continue;
    }
    const idx2 = EASTERN_ARABIC_DIGITS.indexOf(ch);
    if (idx2 !== -1) {
      out += String(idx2);
      continue;
    }
    out += ch;
  }
  str = out
    // Strip Arabic diacritics / tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Normalize Alef / Teh Marbuta / Alef Maksura variants
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return str;
}

export function buildSearchBlob(fields: unknown[]): string {
  return fields
    .map((f) => normalizeArabicAndDigits(f))
    .filter(Boolean)
    .join(' ');
}

export function matchesSmartSearch(
  a: unknown[] | string,
  b: string | unknown[]
): boolean {
  const fields: unknown[] = Array.isArray(a) ? a : Array.isArray(b) ? b : [a];
  const rawQuery: string = typeof a === 'string' ? a : typeof b === 'string' ? b : '';
  const normalizedQuery = normalizeArabicAndDigits(rawQuery);
  if (!normalizedQuery) return true;
  const blob = buildSearchBlob(fields);
  if (!blob) return false;
  if (blob.includes(normalizedQuery)) return true;
  // Support multi-word AND matching across arbitrary fields (e.g., village + merchant name)
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length <= 1) return false;
  return tokens.every((tok) => blob.includes(tok));
}

export interface PaginatedSlice<T> {
  items: T[];
  page: number;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

export function paginateRecords<T>(
  records: readonly T[],
  requestedPage: number,
  requestedPageSize: number
): PaginatedSlice<T> {
  const totalCount = records.length;
  const pageSize = requestedPageSize <= 0 ? Math.max(1, totalCount) : Math.max(1, requestedPageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage || 1)), totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const items = records.slice(startIndex, endIndex);
  return {
    items,
    page,
    currentPage: page,
    pageSize,
    totalCount,
    totalItems: totalCount,
    totalPages,
    startIndex,
    endIndex,
  };
}

export const paginateItems = paginateRecords;

export interface TableColumnOption {
  key: string;
  label: string;
  required?: boolean;
  defaultHidden?: boolean;
}

const COLUMN_PREFS_PREFIX = 'tamween_erp_table_cols_v1::';

export function getDefaultHiddenColumnKeys(columns: readonly TableColumnOption[]): string[] {
  return columns.filter((c) => c.defaultHidden && !c.required).map((c) => c.key);
}

export function loadHiddenColumnKeys(
  tableId: string,
  columns: readonly TableColumnOption[]
): string[] {
  const defaults = getDefaultHiddenColumnKeys(columns);
  if (typeof window === 'undefined' || !window.localStorage) return defaults;
  try {
    const raw = window.localStorage.getItem(`${COLUMN_PREFS_PREFIX}${tableId}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const allowedSet = new Set(columns.filter((c) => !c.required).map((c) => c.key));
    const filtered = parsed.filter((k): k is string => typeof k === 'string' && allowedSet.has(k));
    // Never allow hiding ALL columns
    if (filtered.length >= columns.length) {
      return defaults;
    }
    return filtered;
  } catch {
    return defaults;
  }
}

export function saveHiddenColumnKeys(tableId: string, hiddenKeys: readonly string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${COLUMN_PREFS_PREFIX}${tableId}`, JSON.stringify(hiddenKeys));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Generates clean CSS rules scoped to `[data-erp-table="${tableId}"]` that hide
 * unchecked 1-based column indices cleanly without rewriting 50+ manual JSX rows,
 * while helper `computeAdjustedColSpan` keeps subtotal/grand-total spans exact.
 */
export function countHiddenColumnsInRange(
  columns: readonly TableColumnOption[],
  hiddenKeys: readonly string[],
  startIdx: number,
  endIdxExclusive: number
): number {
  const hiddenSet = new Set(hiddenKeys);
  let count = 0;
  const maxEnd = Math.min(columns.length, endIdxExclusive);
  for (let i = Math.max(0, startIdx); i < maxEnd; i++) {
    if (!columns[i].required && hiddenSet.has(columns[i].key)) {
      count++;
    }
  }
  return count;
}
