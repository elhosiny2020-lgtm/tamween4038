import type { LoafWeightFineRecord, LoafWeightSettings } from '../types/modules';
import { round2 } from './rationMathEngine';

export const DEFAULT_LOAF_WEIGHT_SETTINGS: LoafWeightSettings = {
  defaultPrescribedWeightGrams: 90,
  tier1MaxExclusive: 10,
  tier1Multiplier: 1,
  tier2MaxExclusive: 20,
  tier2Multiplier: 2,
  tier3MaxExclusive: 30,
  tier3Multiplier: 3,
  tier4Multiplier: 4,
  decisionReference: 'لائحة الوقائع المصرية بتاريخ 5 نوفمبر 2024 (قابلة للتحديث من الإعدادات)',
};

export interface LoafWeightFineCalculationInput {
  prescribedWeightGrams: number; // الوزن المقرر للرغيف (افتراضياً 90 جم، قابل للتعديل حسب نوع الرغيف)
  actualWeightGrams: number; // الوزن الفعلي للرغيف
  bagPriceAtViolation: number; // سعر الشيكارة وقت المخالفة
  insuranceQuotaAtViolation: number; // الحصة التأمينية اليومية وقت المخالفة
  repeatFactor?: number; // معامل تكرار اختياري معتمد
  breadType?: string;
  reportNumber?: string;
  closureDays?: number;
  calculatedBy?: string;
  settings?: LoafWeightSettings;
}

export interface LoafWeightFineCalculationOutput {
  valid: boolean;
  isViolation: boolean;
  error?: string;
  record?: LoafWeightFineRecord;
}

/**
 * المعادلة الحسابية لغرامة نقص وزن الرغيف:
 * قيمة الغرامة الأساسية = (مقدار النقص بالجرام ÷ الوزن المقرر للرغيف) × سعر الشيكارة الحالية × الحصة التأمينية اليومية
 * شرائح نقص الوزن:
 * - أقل من 10 جم: معامل 1
 * - من 10 إلى أقل من 20 جم: معامل 2
 * - من 20 إلى أقل من 30 جم: معامل 3
 * - 30 جم فأكثر: معامل 4
 */
export function calculateLoafWeightShortageFine(
  input: LoafWeightFineCalculationInput
): LoafWeightFineCalculationOutput {
  const cfg = input.settings || DEFAULT_LOAF_WEIGHT_SETTINGS;
  const prescribed = Number(input.prescribedWeightGrams);
  const actual = Number(input.actualWeightGrams);
  const bagPrice = Number(input.bagPriceAtViolation);
  const quota = Number(input.insuranceQuotaAtViolation);
  const repeatFactor = input.repeatFactor && input.repeatFactor > 1 ? Number(input.repeatFactor) : 1;

  if (!Number.isFinite(prescribed) || prescribed <= 0) {
    return { valid: false, isViolation: false, error: 'الوزن المقرر للرغيف يجب أن يكون أكبر من صفر.' };
  }
  if (!Number.isFinite(actual) || actual < 0) {
    return { valid: false, isViolation: false, error: 'الوزن الفعلي للرغيف لا يمكن أن يكون سالباً.' };
  }
  if (!Number.isFinite(bagPrice) || bagPrice < 0 || !Number.isFinite(quota) || quota < 0) {
    return {
      valid: false,
      isViolation: false,
      error: 'سعر الشيكارة والحصة التأمينية يجب أن يكونا قيمتين موجبتين.',
    };
  }

  // منع احتساب غرامة إذا كان الوزن الفعلي أكبر من أو يساوي الوزن المقرر
  if (actual >= prescribed) {
    return {
      valid: true,
      isViolation: false,
      error: 'الوزن الفعلي مطابق أو أكبر من الوزن المقرر — لا توجد مخالفة نقص وزن.',
    };
  }

  const shortageGrams = round2(prescribed - actual);

  let tierLabel = '';
  let tierMultiplier = cfg.tier1Multiplier;

  if (shortageGrams < cfg.tier1MaxExclusive) {
    tierLabel = `أقل من ${cfg.tier1MaxExclusive} جرامات`;
    tierMultiplier = cfg.tier1Multiplier;
  } else if (shortageGrams < cfg.tier2MaxExclusive) {
    tierLabel = `من ${cfg.tier1MaxExclusive} إلى أقل من ${cfg.tier2MaxExclusive} جراماً`;
    tierMultiplier = cfg.tier2Multiplier;
  } else if (shortageGrams < cfg.tier3MaxExclusive) {
    tierLabel = `من ${cfg.tier2MaxExclusive} إلى أقل من ${cfg.tier3MaxExclusive} جراماً`;
    tierMultiplier = cfg.tier3Multiplier;
  } else {
    tierLabel = `${cfg.tier3MaxExclusive} جراماً فأكثر`;
    tierMultiplier = cfg.tier4Multiplier;
  }

  const baseFineAmount = round2((shortageGrams / prescribed) * bagPrice * quota);
  const finalFineAmount = round2(baseFineAmount * tierMultiplier * repeatFactor);

  return {
    valid: true,
    isViolation: true,
    record: {
      violationType: 'نقص وزن الرغيف',
      reportNumber: input.reportNumber?.trim() || undefined,
      breadType: input.breadType,
      prescribedWeightGrams: prescribed,
      actualWeightGrams: actual,
      shortageGrams,
      tierLabel,
      tierMultiplier,
      repeatFactor,
      bagPriceAtViolation: bagPrice,
      insuranceQuotaAtViolation: quota,
      baseFineAmount,
      finalFineAmount,
      closureDays: input.closureDays ? Math.max(0, Math.floor(input.closureDays)) : 0,
      decisionReference: cfg.decisionReference,
      calculatedAt: new Date().toISOString(),
      calculatedBy: input.calculatedBy,
    },
  };
}
