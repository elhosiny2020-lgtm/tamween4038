import { Bakery } from '../types';

export type CommercialRegExpiryRange =
  | 'ALL'
  | 'EXPIRED'
  | 'WITHIN_30'
  | 'WITHIN_60'
  | 'WITHIN_90'
  | 'VALID';

export interface CommercialRegExpiryCounts {
  total: number;
  expired: number;
  within30: number;
  within60: number;
  within90: number;
  valid: number;
  missing: number;
}

/**
 * Computes signed day difference between a target YYYY-MM-DD (or parseable) date string
 * and a reference date normalized to local midnight.
 * Returns null if the date string is empty or invalid.
 */
export function getDaysUntilDate(
  dateStr?: string,
  referenceDate: Date = new Date()
): number | null {
  if (!dateStr || !String(dateStr).trim()) return null;
  const trimmed = String(dateStr).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00`)
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const targetMidnight = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const refMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const diffMs = targetMidnight.getTime() - refMidnight.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Checks if a bakery's commercial registration expiration date matches
 * the selected timeframe range filter.
 */
export function matchesCommercialRegFilter(
  commercialRegDate: string | undefined,
  filter: CommercialRegExpiryRange,
  referenceDate: Date = new Date()
): boolean {
  if (filter === 'ALL') return true;

  const daysRemaining = getDaysUntilDate(commercialRegDate, referenceDate);
  if (daysRemaining === null) {
    return false;
  }

  switch (filter) {
    case 'EXPIRED':
      return daysRemaining < 0;
    case 'WITHIN_30':
      return daysRemaining >= 0 && daysRemaining <= 30;
    case 'WITHIN_60':
      return daysRemaining >= 0 && daysRemaining <= 60;
    case 'WITHIN_90':
      return daysRemaining >= 0 && daysRemaining <= 90;
    case 'VALID':
      return daysRemaining > 90;
    default:
      return true;
  }
}

/**
 * Precomputes bakery counts across all Commercial Registration expiry intervals.
 */
export function computeCommercialRegExpiryCounts(
  bakeries: Pick<Bakery, 'commercialRegDate'>[],
  referenceDate: Date = new Date()
): CommercialRegExpiryCounts {
  const counts: CommercialRegExpiryCounts = {
    total: bakeries.length,
    expired: 0,
    within30: 0,
    within60: 0,
    within90: 0,
    valid: 0,
    missing: 0,
  };

  for (const bakery of bakeries) {
    const days = getDaysUntilDate(bakery.commercialRegDate, referenceDate);
    if (days === null) {
      counts.missing += 1;
      continue;
    }
    if (days < 0) counts.expired += 1;
    if (days >= 0 && days <= 30) counts.within30 += 1;
    if (days >= 0 && days <= 60) counts.within60 += 1;
    if (days >= 0 && days <= 90) counts.within90 += 1;
    if (days > 90) counts.valid += 1;
  }

  return counts;
}
