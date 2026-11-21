/**
 * Centralized strict validation & sanitization for Egyptian National ID (exactly 14 digits)
 * and Egyptian Phone Numbers (exactly 11 digits) across all modules and forms.
 */

const ARABIC_INDIC_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export const NATIONAL_ID_EXACT_LENGTH = 14;
export const PHONE_EXACT_LENGTH = 11;

/** Converts Arabic-Indic / Persian numerals to ASCII digits and strips all non-digit characters. */
export function normalizeToAsciiDigits(raw: unknown): string {
  const str = String(raw ?? '');
  let normalized = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch >= '0' && ch <= '9') {
      normalized += ch;
    } else if (ARABIC_INDIC_MAP[ch]) {
      normalized += ARABIC_INDIC_MAP[ch];
    }
  }
  return normalized;
}

/** Sanitizes an input string to digits only and clamps it to maxLen. */
export function sanitizeDigitsInput(raw: unknown, maxLen: number): string {
  const digits = normalizeToAsciiDigits(raw);
  return maxLen > 0 ? digits.slice(0, maxLen) : digits;
}

export function sanitizeNationalIdInput(raw: unknown): string {
  return sanitizeDigitsInput(raw, NATIONAL_ID_EXACT_LENGTH);
}

export function sanitizePhoneInput(raw: unknown): string {
  return sanitizeDigitsInput(raw, PHONE_EXACT_LENGTH);
}

export interface ExactDigitsValidationResult {
  valid: boolean;
  cleaned: string;
  normalized: string;
  error?: string;
}

/**
 * Validates that a National ID has EXACTLY 14 digits (no fewer, no more).
 * If `required` is false and the raw input is empty, returns `{ valid: true, cleaned: '', normalized: '' }`.
 * If any value is entered (or `required` is true), it MUST be strictly 14 digits.
 */
export function validateExactNationalId(
  raw: unknown,
  options: { required?: boolean; fieldLabel?: string } | boolean = {}
): ExactDigitsValidationResult {
  const opts = typeof options === 'boolean' ? { required: options } : options;
  const { required = true, fieldLabel = 'الرقم القومي' } = opts;
  const trimmed = String(raw ?? '').trim();
  const digits = normalizeToAsciiDigits(trimmed);

  if (!trimmed) {
    if (required) {
      return {
        valid: false,
        cleaned: '',
        normalized: '',
        error: `${fieldLabel} مطلوب ويجب أن يتكون من 14 رقماً بالضبط (لا أقل ولا أكثر).`,
      };
    }
    return { valid: true, cleaned: '', normalized: '' };
  }

  // Reject if non-digit symbols/letters were entered besides harmless spaces/dashes
  const strippedNoise = trimmed.replace(/[\s\-]/g, '');
  const onlyValidChars = /^[0-9\u0660-\u0669\u06F0-\u06F9]+$/.test(strippedNoise);
  if (!onlyValidChars) {
    return {
      valid: false,
      cleaned: digits,
      normalized: digits,
      error: `${fieldLabel} يجب أن يحتوي على أرقام فقط ويتكون من 14 رقماً بالضبط.`,
    };
  }

  if (digits.length !== NATIONAL_ID_EXACT_LENGTH) {
    return {
      valid: false,
      cleaned: digits,
      normalized: digits,
      error: `${fieldLabel} يجب أن يتكون من 14 رقماً بالضبط (لا أقل ولا أكثر) — المدخل حالياً ${digits.length} رقماً.`,
    };
  }

  return { valid: true, cleaned: digits, normalized: digits };
}

/**
 * Validates that a Phone Number has EXACTLY 11 digits (no fewer, no more).
 * If `required` is false and the raw input is empty, returns `{ valid: true, cleaned: '', normalized: '' }`.
 * If any value is entered (or `required` is true), it MUST be strictly 11 digits.
 */
export function validateExactPhone(
  raw: unknown,
  options: { required?: boolean; fieldLabel?: string } | boolean = {}
): ExactDigitsValidationResult {
  const opts = typeof options === 'boolean' ? { required: options } : options;
  const { required = true, fieldLabel = 'رقم التليفون' } = opts;
  const trimmed = String(raw ?? '').trim();
  const digits = normalizeToAsciiDigits(trimmed);

  if (!trimmed) {
    if (required) {
      return {
        valid: false,
        cleaned: '',
        normalized: '',
        error: `${fieldLabel} مطلوب ويجب أن يتكون من 11 رقماً بالضبط (لا أقل ولا أكثر).`,
      };
    }
    return { valid: true, cleaned: '', normalized: '' };
  }

  const strippedNoise = trimmed.replace(/[\s\-]/g, '');
  const onlyValidChars = /^[0-9\u0660-\u0669\u06F0-\u06F9]+$/.test(strippedNoise);
  if (!onlyValidChars) {
    return {
      valid: false,
      cleaned: digits,
      normalized: digits,
      error: `${fieldLabel} يجب أن يحتوي على أرقام فقط ويتكون من 11 رقماً بالضبط.`,
    };
  }

  if (digits.length !== PHONE_EXACT_LENGTH) {
    return {
      valid: false,
      cleaned: digits,
      normalized: digits,
      error: `${fieldLabel} يجب أن يتكون من 11 رقماً بالضبط (لا أقل ولا أكثر) — المدخل حالياً ${digits.length} رقماً.`,
    };
  }

  return { valid: true, cleaned: digits, normalized: digits };
}

export type StrictDigitFieldKind = 'nationalId' | 'phone' | null;

/**
 * Automatically identifies whether a form field (by key or Arabic/English label)
 * represents a National ID (14 digits) or Phone Number (11 digits).
 */
export function detectStrictFieldKind(key: string, label?: string): StrictDigitFieldKind {
  const k = String(key || '').toLowerCase();
  const lbl = String(label || '');

  if (
    k === 'nationalid' ||
    k.endsWith('nationalid') ||
    k.includes('national_id') ||
    k === 'nid' ||
    /الرقم\s*القوم[يى]|رقم\s*قوم[يى]/i.test(lbl)
  ) {
    return 'nationalId';
  }

  if (
    k === 'phone' ||
    k.endsWith('phone') ||
    k.includes('mobile') ||
    k.includes('telephone') ||
    /تليفون|الهاتف|رقم\s*هاتف|المحمول|الموبايل|الجوال/i.test(lbl)
  ) {
    return 'phone';
  }

  return null;
}
