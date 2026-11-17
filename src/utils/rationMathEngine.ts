import type {
  MerchantFinancialEntry,
  RationBeneficiaryMember,
  RationCardRecord,
  RationCommodity,
  RationDecisionSettings,
  RationDisbursementRecord,
  RationMerchant,
  RationRequisition,
  RationWarehouseBalance,
} from '../types/modules';

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function round4(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
}

export function countEligibleBeneficiaries(members: RationBeneficiaryMember[]): number {
  if (!Array.isArray(members)) return 0;
  return members.filter((m) => m.status === 'مستحق').length;
}

export function countTotalEligibleForMerchant(
  cards: RationCardRecord[],
  merchantId?: string
): { eligibleBeneficiaries: number; activeCards: number } {
  const validCards = cards.filter(
    (c) => c.status === 'سارية' && (!merchantId || c.merchantId === merchantId)
  );
  const eligibleBeneficiaries = validCards.reduce(
    (sum, card) => sum + countEligibleBeneficiaries(card.members),
    0
  );
  return { eligibleBeneficiaries, activeCards: validCards.length };
}

export interface CardCommodityQuotaResult {
  commodityId: string;
  commodityName: string;
  eligibleBeneficiaries: number;
  baseQuota: number;
  cappedByIndividualLimit: number;
  effectiveQuota: number;
  officialUnitPrice: number;
  quotaValue: number;
}

/**
 * حساب المقرر الفعلي لكل سلعة على مستوى البطاقة مع مراعاة قواعد كل سلعة (سكر / زيت / أرز / مكرونة / مخصص)
 * والأقل بين: الناتج عن عدد الأفراد، الحد الأقصى للفرد × الأفراد، الحد الأقصى للبطاقة، وأي سقف إضافي معتمد.
 */
export function computeCardCommodityQuota(
  eligibleBeneficiaries: number,
  commodity: RationCommodity
): CardCommodityQuotaResult {
  const safeBeneficiaries = Math.max(0, Math.floor(eligibleBeneficiaries || 0));
  if (!commodity.isActive || safeBeneficiaries === 0) {
    return {
      commodityId: commodity.id,
      commodityName: commodity.name,
      eligibleBeneficiaries: safeBeneficiaries,
      baseQuota: 0,
      cappedByIndividualLimit: 0,
      effectiveQuota: 0,
      officialUnitPrice: commodity.officialPrice,
      quotaValue: 0,
    };
  }

  const baseQuota = round4(safeBeneficiaries * Math.max(0, commodity.monthlyQuotaPerBeneficiary));
  const individualCapTotal =
    commodity.maxPerBeneficiary > 0
      ? round4(safeBeneficiaries * commodity.maxPerBeneficiary)
      : baseQuota;

  const candidateLimits = [baseQuota, individualCapTotal];
  if (commodity.maxPerCard > 0) {
    candidateLimits.push(commodity.maxPerCard);
  }
  if (commodity.extraCapPerCard && commodity.extraCapPerCard > 0) {
    candidateLimits.push(commodity.extraCapPerCard);
  }

  const effectiveQuota = round4(Math.max(0, Math.min(...candidateLimits)));
  const quotaValue = round2(effectiveQuota * Math.max(0, commodity.officialPrice));

  return {
    commodityId: commodity.id,
    commodityName: commodity.name,
    eligibleBeneficiaries: safeBeneficiaries,
    baseQuota,
    cappedByIndividualLimit: individualCapTotal,
    effectiveQuota,
    officialUnitPrice: commodity.officialPrice,
    quotaValue,
  };
}

export interface CardMonthlyEntitlementSummary {
  cardId: string;
  eligibleBeneficiaries: number;
  availableSupportBudget: number;
  additionalGrantAmount: number;
  disbursedSupportValue: number;
  remainingSupportBudget: number;
  supportConsumptionPct: number;
  exceededSupportBudget: boolean;
  totalOfficialQuotaValue: number;
  commoditiesBreakdown: (CardCommodityQuotaResult & {
    disbursedQty: number;
    remainingQty: number;
    disbursedPct: number;
    remainingPct: number;
  })[];
}

export function computeCardEntitlementSummary(
  card: RationCardRecord,
  commodities: RationCommodity[],
  settings: RationDecisionSettings,
  monthDisbursements: RationDisbursementRecord[]
): CardMonthlyEntitlementSummary {
  const eligibleBeneficiaries =
    card.status === 'سارية' ? countEligibleBeneficiaries(card.members) : 0;

  const availableSupportBudget = round2(
    eligibleBeneficiaries * Math.max(0, settings.supportPerBeneficiary || 0)
  );
  const additionalGrantAmount =
    settings.additionalGrantEnabled && card.hasAdditionalGrant && card.status === 'سارية'
      ? round2(card.additionalGrantAmount ?? settings.additionalGrantPerCard2026 ?? 0)
      : 0;

  const activeCardDisbursements = monthDisbursements.filter(
    (d) => d.cardId === card.id && !d.isReversed
  );
  const disbursedSupportValue = round2(
    activeCardDisbursements.reduce((sum, d) => sum + Math.max(0, d.supportDeducted || 0), 0)
  );
  const remainingSupportBudget = round2(availableSupportBudget - disbursedSupportValue);
  const supportConsumptionPct =
    availableSupportBudget > 0
      ? round2((disbursedSupportValue / availableSupportBudget) * 100)
      : 0;
  const exceededSupportBudget = remainingSupportBudget < 0;

  const commoditiesBreakdown = commodities.map((commodity) => {
    const quota = computeCardCommodityQuota(eligibleBeneficiaries, commodity);
    const disbursedQty = round4(
      activeCardDisbursements
        .filter((d) => d.commodityId === commodity.id)
        .reduce((sum, d) => sum + Math.max(0, d.quantity || 0), 0)
    );
    const remainingQty = round4(Math.max(0, quota.effectiveQuota - disbursedQty));
    const disbursedPct =
      quota.effectiveQuota > 0 ? round2((disbursedQty / quota.effectiveQuota) * 100) : 0;
    const remainingPct =
      quota.effectiveQuota > 0 ? round2((remainingQty / quota.effectiveQuota) * 100) : 0;
    return {
      ...quota,
      disbursedQty,
      remainingQty,
      disbursedPct,
      remainingPct,
    };
  });

  const totalOfficialQuotaValue = round2(
    commoditiesBreakdown.reduce((sum, item) => sum + item.quotaValue, 0)
  );

  return {
    cardId: card.id,
    eligibleBeneficiaries,
    availableSupportBudget,
    additionalGrantAmount,
    disbursedSupportValue,
    remainingSupportBudget,
    supportConsumptionPct,
    exceededSupportBudget,
    totalOfficialQuotaValue,
    commoditiesBreakdown,
  };
}

/**
 * التحقق الصارم قبل تسجيل عملية صرف مواطن (منع التكرار، منع تجاوز المقرر، منع الصرف لسلعة موقوفة، منع السالب في المخزون)
 */
export function validateAndComputeDisbursement(params: {
  operationNumber: string;
  card: RationCardRecord;
  commodity: RationCommodity;
  requestedQty: number;
  warehouseBalance: number;
  existingDisbursements: RationDisbursementRecord[];
  settings: RationDecisionSettings;
  supportUsedInOperation: number;
}): {
  valid: boolean;
  error?: string;
  totalSaleValue: number;
  citizenPaidAmount: number;
  commissionEarned: number;
} {
  const {
    operationNumber,
    card,
    commodity,
    requestedQty,
    warehouseBalance,
    existingDisbursements,
    settings,
    supportUsedInOperation,
  } = params;

  if (!operationNumber.trim()) {
    return {
      valid: false,
      error: 'رقم عملية الصرف إلزامي لمنع التكرار.',
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }
  if (
    existingDisbursements.some(
      (d) => d.operationNumber.trim() === operationNumber.trim() && !d.isReversed
    )
  ) {
    return {
      valid: false,
      error: `تم تسجيل عملية الصرف رقم (${operationNumber}) مسبقاً — يُمنع التكرار.`,
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }
  if (card.status !== 'سارية') {
    return {
      valid: false,
      error: 'البطاقة التموينية غير سارية ولا يمكن الصرف عليها.',
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }
  if (!commodity.isActive) {
    return {
      valid: false,
      error: `السلعة (${commodity.name}) موقوفة أو غير مدرجة بالصرف حالياً.`,
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }
  if (!(requestedQty > 0)) {
    return {
      valid: false,
      error: 'الكمية المصروفة يجب أن تكون أكبر من صفر.',
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }

  const cardDisb = existingDisbursements.filter(
    (d) => d.cardId === card.id && !d.isReversed
  );
  const summary = computeCardEntitlementSummary(card, [commodity], settings, cardDisb);
  const itemQuota = summary.commoditiesBreakdown[0];
  if (requestedQty > itemQuota.remainingQty + 1e-6) {
    return {
      valid: false,
      error: `الكمية المطلوبة (${requestedQty}) تتجاوز المتبقي من المقرر المعتمد (${itemQuota.remainingQty}).`,
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }
  if (!settings.allowNegativeStockWithApproval && requestedQty > warehouseBalance + 1e-6) {
    return {
      valid: false,
      error: `رصيد المخزن المتاح (${warehouseBalance}) لا يكفي لصرف (${requestedQty}).`,
      totalSaleValue: 0,
      citizenPaidAmount: 0,
      commissionEarned: 0,
    };
  }

  const totalSaleValue = round2(requestedQty * commodity.officialPrice);
  const safeSupportUsed = round2(Math.max(0, Math.min(totalSaleValue, supportUsedInOperation)));
  const citizenPaidAmount = round2(Math.max(0, totalSaleValue - safeSupportUsed));
  const commissionEarned =
    commodity.commissionType === 'per_unit'
      ? round2(requestedQty * commodity.commissionValue)
      : round2((totalSaleValue * commodity.commissionValue) / 100);

  return {
    valid: true,
    totalSaleValue,
    citizenPaidAmount,
    commissionEarned,
  };
}

/**
 * معادلة رصيد المخزن الدقيقة:
 * الرصيد المتاح = رصيد أول المدة + الوارد + المرتجعات الداخلة - المنصرف - المرتجعات الخارجة ± التسويات المعتمدة
 */
export function computeWarehouseStockStatus(
  item: RationWarehouseBalance,
  unitSupplyCost: number,
  todayIso: string = new Date().toISOString().slice(0, 10)
): {
  bookBalance: number;
  stockValue: number;
  inventoryVariance: number;
  varianceType: 'عجز' | 'زيادة' | 'مطابق';
  alerts: string[];
} {
  const bookBalance = round4(
    (item.openingBalance || 0) +
      (item.totalIn || 0) +
      (item.inboundReturns || 0) -
      (item.totalOut || 0) -
      (item.outboundReturns || 0) +
      (item.approvedAdjustments || 0)
  );
  const stockValue = round2(bookBalance * Math.max(0, unitSupplyCost));
  const physical =
    typeof item.physicalCount === 'number' && Number.isFinite(item.physicalCount)
      ? item.physicalCount
      : bookBalance;
  const inventoryVariance = round4(physical - bookBalance);
  const varianceType: 'عجز' | 'زيادة' | 'مطابق' =
    inventoryVariance < -1e-4 ? 'عجز' : inventoryVariance > 1e-4 ? 'زيادة' : 'مطابق';

  const alerts: string[] = [];
  if (bookBalance < 0) alerts.push('رصيد سالب غير مبرر بالمخزن');
  if (bookBalance <= (item.reorderLevel || 0)) alerts.push('انخفاض الرصيد عن حد إعادة الطلب');
  if (varianceType === 'عجز') alerts.push(`عجز مخزني (${Math.abs(inventoryVariance)})`);
  if (varianceType === 'زيادة') alerts.push(`زيادة غير مبررة (${inventoryVariance})`);
  if ((item.stagnantDays || 0) >= 60 && bookBalance > 0) alerts.push('صنف راكد (> 60 يوم)');
  if (item.expiryDate && item.expiryDate < todayIso && bookBalance > 0) {
    alerts.push('انتهاء صلاحية السلعة');
  }

  return { bookBalance, stockValue, inventoryVariance, varianceType, alerts };
}

/**
 * معادلات الاستعاضة التموينية
 */
export function computeRequisitionTotals(req: RationRequisition): {
  totalRequestedQty: number;
  totalApprovedQty: number;
  totalDeliveredQty: number;
  remainingApprovedQty: number;
  totalRequisitionValue: number;
  availableInsurance: number;
} {
  const totalRequestedQty = round4(req.lines.reduce((s, l) => s + (l.requestedQty || 0), 0));
  const totalApprovedQty = round4(req.lines.reduce((s, l) => s + (l.approvedQty || 0), 0));
  const totalDeliveredQty = round4(req.lines.reduce((s, l) => s + (l.deliveredQty || 0), 0));
  const remainingApprovedQty = round4(Math.max(0, totalApprovedQty - totalDeliveredQty));
  const totalRequisitionValue = round2(
    req.lines.reduce((s, l) => s + (l.requestedQty || 0) * (l.supplyPrice || 0), 0)
  );
  const availableInsurance = round2(
    (req.insuranceAmount || 0) - (req.committedInsuranceBefore || 0)
  );
  return {
    totalRequestedQty,
    totalApprovedQty,
    totalDeliveredQty,
    remainingApprovedQty,
    totalRequisitionValue,
    availableInsurance,
  };
}

/**
 * الحساب المالي المستقل للتاجر — يمنع تكرار رقم المستند ويفصل المديونية عن مستحقات العمولات
 */
export function computeMerchantFinancialStatement(
  openingBalance: number,
  entries: MerchantFinancialEntry[],
  merchantId: string
): {
  totalSupplyDebits: number;
  totalReturnsCredits: number;
  totalPaymentsCredits: number;
  totalApprovedSettlementCredits: number;
  totalCommissionsEarned: number;
  totalIncentivesCredits: number;
  totalDiscountsPenaltiesDebits: number;
  netDebtBalance: number; // صافي المديونية
  netCommissionDue: number; // صافي مستحقات العمولات منفصلة عن المديونية
  closingBalance: number;
} {
  const seenDocs = new Set<string>();
  const validEntries = entries.filter((e) => {
    if (e.merchantId !== merchantId || !e.isApproved || e.isReversed) return false;
    const docKey = e.documentNumber.trim();
    if (!docKey || seenDocs.has(docKey)) return false;
    seenDocs.add(docKey);
    return true;
  });

  let totalSupplyDebits = 0;
  let totalReturnsCredits = 0;
  let totalPaymentsCredits = 0;
  let totalApprovedSettlementCredits = 0;
  let totalApprovedSettlementDebits = 0;
  let totalCommissionsEarned = 0;
  let totalIncentivesCredits = 0;
  let totalDiscountsPenaltiesDebits = 0;

  for (const e of validEntries) {
    switch (e.entryType) {
      case 'REQUISITION_DEBIT':
      case 'SUPPLY_INVOICE':
        totalSupplyDebits += e.debitAmount;
        break;
      case 'RETURN_CREDIT':
        totalReturnsCredits += e.creditAmount;
        break;
      case 'PAYMENT_CREDIT':
        totalPaymentsCredits += e.creditAmount;
        break;
      case 'SETTLEMENT_CREDIT':
        totalApprovedSettlementCredits += e.creditAmount;
        break;
      case 'SETTLEMENT_DEBIT':
        totalApprovedSettlementDebits += e.debitAmount;
        break;
      case 'COMMISSION_EARNED':
        totalCommissionsEarned += e.creditAmount;
        break;
      case 'INCENTIVE_CREDIT':
        totalIncentivesCredits += e.creditAmount;
        break;
      case 'DISCOUNT_PENALTY_DEBIT':
        totalDiscountsPenaltiesDebits += e.debitAmount;
        break;
    }
  }

  const netGoodsObligation = round2(totalSupplyDebits - totalReturnsCredits);
  const totalObligations = round2(openingBalance + netGoodsObligation + totalApprovedSettlementDebits);
  const netDebtBalance = round2(
    totalObligations - totalPaymentsCredits - totalApprovedSettlementCredits
  );
  const netCommissionDue = round2(
    totalCommissionsEarned + totalIncentivesCredits - totalDiscountsPenaltiesDebits
  );
  const closingBalance = round2(netDebtBalance - netCommissionDue);

  return {
    totalSupplyDebits: round2(totalSupplyDebits),
    totalReturnsCredits: round2(totalReturnsCredits),
    totalPaymentsCredits: round2(totalPaymentsCredits),
    totalApprovedSettlementCredits: round2(totalApprovedSettlementCredits),
    totalCommissionsEarned: round2(totalCommissionsEarned),
    totalIncentivesCredits: round2(totalIncentivesCredits),
    totalDiscountsPenaltiesDebits: round2(totalDiscountsPenaltiesDebits),
    netDebtBalance,
    netCommissionDue,
    closingBalance,
  };
}

export interface WarehouseControlAnalysisResult {
  warehouseId: string;
  warehouseName: string;
  systemStock: number;
  physicalStock: number;
  inventoryDifference: number; // فرق الجرد = الرصيد الفعلي − الرصيد في النظام
  inventoryDifferencePct: number; // نسبة الفرق %
  totalHandled: number;
  damagedQty: number;
  damagePercentage: number; // نسبة التلف = (عدد الأسطوانات التالفة ÷ إجمالي الأسطوانات) × 100
  assignedQuota: number;
  coveragePercentage: number; // نسبة التغطية = (الرصيد الفعلي ÷ الحصة) × 100
  alerts: {
    type: 'DIFF_EXCEEDED' | 'DAMAGE_EXCEEDED' | 'COVERAGE_LOW' | 'COVERAGE_HIGH';
    severity: 'بسيطة' | 'متوسطة' | 'جسيمة';
    message: string;
  }[];
}

/**
 * محرك معادلات الرقابة التموينية:
 * يحسب فرق الجرد، نسبة التلف، ونسبة التغطية لكل مستودع/منفذ، ويولد تنبيهات فورية عند تجاوز الحدود.
 */
export function computeWarehouseControlEngine(params: {
  warehouseId: string;
  warehouseName: string;
  systemStock: number;
  physicalStock: number;
  damagedQty: number;
  totalHandled: number;
  assignedQuota: number;
  maxDiffTolerancePct?: number; // default 5%
  maxDamageTolerancePct?: number; // default 2%
  minCoveragePct?: number; // default 50%
}): WarehouseControlAnalysisResult {
  const systemStock = round2(params.systemStock);
  const physicalStock = round2(params.physicalStock);
  const damagedQty = round2(params.damagedQty);
  const totalHandled = Math.max(1, round2(params.totalHandled));
  const assignedQuota = Math.max(1, round2(params.assignedQuota));

  // 1. فرق الجرد = الرصيد الفعلي − الرصيد في النظام
  const inventoryDifference = round2(physicalStock - systemStock);
  const inventoryDifferencePct = round2((inventoryDifference / Math.max(1, systemStock)) * 100);

  // 2. نسبة التلف = (عدد الأسطوانات التالفة ÷ إجمالي الأسطوانات المتداولة) × 100
  const damagePercentage = round2((damagedQty / totalHandled) * 100);

  // 3. نسبة التغطية = (الرصيد الفعلي ÷ الحصة) × 100
  const coveragePercentage = round2((physicalStock / assignedQuota) * 100);

  const alerts: WarehouseControlAnalysisResult['alerts'] = [];
  const maxDiffPct = params.maxDiffTolerancePct ?? 5.0;
  const maxDmgPct = params.maxDamageTolerancePct ?? 2.0;
  const minCovPct = params.minCoveragePct ?? 50.0;

  if (Math.abs(inventoryDifferencePct) > maxDiffPct) {
    alerts.push({
      type: 'DIFF_EXCEEDED',
      severity: Math.abs(inventoryDifferencePct) > 15 ? 'جسيمة' : 'متوسطة',
      message: `تنبيه رقابي: فرق الجرد في (${params.warehouseName}) بلغ ${inventoryDifference} (${inventoryDifferencePct}%) متجاوزاً الحد المسموح (${maxDiffPct}%).`,
    });
  }

  if (damagePercentage > maxDmgPct) {
    alerts.push({
      type: 'DAMAGE_EXCEEDED',
      severity: damagePercentage > 5 ? 'جسيمة' : 'متوسطة',
      message: `تنبيه رقابي: نسبة التلف في (${params.warehouseName}) بلغت ${damagePercentage}% متجاوزة الحد الأقصى المسموح (${maxDmgPct}%).`,
    });
  }

  if (coveragePercentage < minCovPct) {
    alerts.push({
      type: 'COVERAGE_LOW',
      severity: 'جسيمة',
      message: `تنبيه رقابي: انخفاض نسبة التغطية في (${params.warehouseName}) إلى ${coveragePercentage}% (أقل من الحد الأدنى ${minCovPct}%).`,
    });
  }

  return {
    warehouseId: params.warehouseId,
    warehouseName: params.warehouseName,
    systemStock,
    physicalStock,
    inventoryDifference,
    inventoryDifferencePct,
    totalHandled,
    damagedQty,
    damagePercentage,
    assignedQuota,
    coveragePercentage,
    alerts,
  };
}

// =========================================================================
// 7. المعادلات الخمس التلقائية المعتمدة لقسم السلع التموينية
// =========================================================================

/**
 * المعادلة (1): الرصيد الحالي = الرصيد الافتتاحي + الوارد - المنصرف + المرتجعات الداخلة - المرتجعات الخارجة
 */
export function computeCommodityCurrentBalance(params: {
  openingBalance: number;
  inboundQty: number;
  outboundQty: number;
  inboundReturns?: number;
  outboundReturns?: number;
  approvedAdjustments?: number;
}): number {
  const opening = Math.max(0, Number(params.openingBalance) || 0);
  const inbound = Math.max(0, Number(params.inboundQty) || 0);
  const outbound = Math.max(0, Number(params.outboundQty) || 0);
  const inRet = Math.max(0, Number(params.inboundReturns) || 0);
  const outRet = Math.max(0, Number(params.outboundReturns) || 0);
  const adj = Number(params.approvedAdjustments) || 0;
  return round2(opening + inbound - outbound + inRet - outRet + adj);
}

/**
 * المعادلة (2): قيمة المخزون = الرصيد الحالي × سعر الصنف
 */
export function computeCommodityStockValue(currentBalance: number, unitPrice: number): number {
  const bal = Number(currentBalance) || 0;
  const price = Math.max(0, Number(unitPrice) || 0);
  return round2(Math.max(0, bal) * price);
}

/**
 * المعادلة (3): الكمية المتبقية من الحصة = الكمية المقررة - الكمية المستلمة
 */
export function computeRemainingMonthlyQuota(prescribedQty: number, receivedQty: number): number {
  const prescribed = Math.max(0, Number(prescribedQty) || 0);
  const received = Math.max(0, Number(receivedQty) || 0);
  return round2(Math.max(0, prescribed - received));
}

/**
 * المعادلة (4): نسبة تنفيذ الحصة = (الكمية الموزعة ÷ الكمية المقررة) × 100
 * مع الحماية الكاملة من القسمة على صفر.
 */
export function computeMonthlyQuotaExecutionPct(distributedQty: number, prescribedQty: number): number {
  const prescribed = Number(prescribedQty) || 0;
  const distributed = Math.max(0, Number(distributedQty) || 0);
  if (prescribed <= 0) return 0;
  return round2((distributed / prescribed) * 100);
}

/**
 * المعادلة (5): قيمة الكميات المنصرفة = الكمية المنصرفة × سعر الصنف
 */
export function computeDisbursedQuantityValue(outboundQty: number, unitPrice: number): number {
  const qty = Math.max(0, Number(outboundQty) || 0);
  const price = Math.max(0, Number(unitPrice) || 0);
  return round2(qty * price);
}

export interface SmartRationAlertItem {
  id: string;
  category:
    | 'LOW_STOCK'
    | 'NEAR_EXPIRY'
    | 'DELAYED_QUOTA'
    | 'INVENTORY_SHORTAGE'
    | 'INCOMPLETE_DISBURSEMENT'
    | 'IN_OUT_VARIANCE'
    | 'EXPIRED_MERCHANT_LICENSE';
  categoryLabel: string;
  severity: 'حرجة' | 'متوسطة' | 'تنبيه';
  entityName: string;
  message: string;
  metricValue: string;
}

/**
 * نظام التنبيهات الذكي (7 فئات تنبيه تلقائية لقسم السلع التموينية)
 */
export function generateSmartRationAlerts(params: {
  commodities: RationCommodity[];
  warehouses: RationWarehouseBalance[];
  merchants: RationMerchant[];
  requisitions: RationRequisition[];
  todayIso?: string;
}): SmartRationAlertItem[] {
  const alerts: SmartRationAlertItem[] = [];
  const todayMs = params.todayIso ? new Date(params.todayIso).getTime() : Date.now();

  // 1 & 2 & 4 & 6: فحص المخازن والسلع (انخفاض المخزون، قرب الصلاحية، عجز الجرد، فروق الوارد والمنصرف)
  for (const w of params.warehouses) {
    const comm = params.commodities.find((c) => c.id === w.commodityId);
    const commName = comm?.name || w.commodityId;
    const minLevel = w.reorderLevel || comm?.minStockLevel || comm?.reorderLevel || 0;
    const bookBal = computeCommodityCurrentBalance({
      openingBalance: w.openingBalance,
      inboundQty: w.totalIn,
      outboundQty: w.totalOut,
      inboundReturns: w.inboundReturns,
      outboundReturns: w.outboundReturns,
      approvedAdjustments: w.approvedAdjustments,
    });

    if (bookBal <= minLevel) {
      alerts.push({
        id: `low-${w.id}`,
        category: 'LOW_STOCK',
        categoryLabel: 'انخفاض المخزون عن الحد الأدنى',
        severity: bookBal <= minLevel * 0.5 ? 'حرجة' : 'متوسطة',
        entityName: `${w.warehouseName} — ${commName}`,
        message: `الرصيد الحالي (${bookBal}) أقل من أو يساوي الحد الأدنى المسموح (${minLevel}).`,
        metricValue: `${bookBal} / حد ${minLevel}`,
      });
    }

    const expDateStr = w.expiryDate || comm?.expiryDate;
    if (expDateStr) {
      const expMs = new Date(expDateStr).getTime();
      if (!Number.isNaN(expMs)) {
        const daysLeft = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 60) {
          alerts.push({
            id: `exp-${w.id}`,
            category: 'NEAR_EXPIRY',
            categoryLabel: daysLeft < 0 ? 'سلعة منتهية الصلاحية' : 'قرب انتهاء صلاحية السلع',
            severity: daysLeft <= 15 ? 'حرجة' : 'متوسطة',
            entityName: `${commName} (${w.warehouseName})`,
            message:
              daysLeft < 0
                ? `انتهت صلاحية التشغيلة بتاريخ ${expDateStr}.`
                : `يتبقى ${daysLeft} يوماً على انتهاء الصلاحية (${expDateStr}).`,
            metricValue: `${expDateStr}`,
          });
        }
      }
    }

    if (typeof w.physicalCount === 'number') {
      const diff = round2(w.physicalCount - bookBal);
      if (diff < 0) {
        alerts.push({
          id: `shortage-${w.id}`,
          category: 'INVENTORY_SHORTAGE',
          categoryLabel: 'وجود عجز مخزني فعلي',
          severity: 'حرجة',
          entityName: `${w.warehouseName} — ${commName}`,
          message: `الجرد الفعلي (${w.physicalCount}) يقل عن الرصيد الدفتري (${bookBal}) بمقدار ${Math.abs(diff)}.`,
          metricValue: `عجز ${Math.abs(diff)}`,
        });
      }
    }

    if (w.totalOut > w.openingBalance + w.totalIn + w.inboundReturns) {
      alerts.push({
        id: `var-${w.id}`,
        category: 'IN_OUT_VARIANCE',
        categoryLabel: 'فروق بين الوارد والمنصرف',
        severity: 'حرجة',
        entityName: `${w.warehouseName} — ${commName}`,
        message: `إجمالي المنصرف (${w.totalOut}) يتجاوز إجمالي المتاح (أول المدة + الوارد).`,
        metricValue: `منصرف ${w.totalOut}`,
      });
    }
  }

  // 3 & 5: تأخر استلام الحصة الشهرية أو عدم صرف الحصة المقررة بالكامل
  for (const r of params.requisitions) {
    const m = params.merchants.find((x) => x.id === r.merchantId);
    const mName = m?.merchantName || r.merchantId;
    const prescribed = r.lines.reduce((s, l) => s + (Number(l.requestedQty) || 0), 0);
    const received = r.lines.reduce((s, l) => s + (Number(l.approvedQty) || 0), 0);
    const distributed = r.lines.reduce((s, l) => s + (Number(l.deliveredQty) || 0), 0);
    const remQuota = computeRemainingMonthlyQuota(prescribed, received);
    const execPct = computeMonthlyQuotaExecutionPct(distributed, prescribed);

    if (r.status === 'جديد' || remQuota > 0) {
      alerts.push({
        id: `delay-${r.id}`,
        category: 'DELAYED_QUOTA',
        categoryLabel: 'تأخر استلام الحصة الشهرية',
        severity: r.status === 'جديد' ? 'متوسطة' : 'تنبيه',
        entityName: `${mName} (${r.requestNumber})`,
        message: `لم يتم استلام كامل الحصة المقررة لشهر ${r.monthKey} (المتبقي غير المستلم: ${remQuota}).`,
        metricValue: `متبقي ${remQuota}`,
      });
    }

    if (prescribed > 0 && execPct < 85) {
      alerts.push({
        id: `incomp-${r.id}`,
        category: 'INCOMPLETE_DISBURSEMENT',
        categoryLabel: 'عدم صرف الحصة المقررة بالكامل',
        severity: execPct < 50 ? 'حرجة' : 'متوسطة',
        entityName: `${mName} (${r.requestNumber})`,
        message: `نسبة تنفيذ وتوزيع الحصة بلغت ${execPct}% (${distributed} من ${prescribed}).`,
        metricValue: `${execPct}%`,
      });
    }
  }

  // 7: انتهاء صلاحية تراخيص أو بيانات التاجر
  for (const m of params.merchants) {
    const expStr = m.activityEndDate || m.licenseExpiryDate;
    if (expStr) {
      const expMs = new Date(expStr).getTime();
      if (!Number.isNaN(expMs)) {
        const daysLeft = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 45) {
          alerts.push({
            id: `lic-${m.id}`,
            category: 'EXPIRED_MERCHANT_LICENSE',
            categoryLabel: 'انتهاء صلاحية تراخيص أو بيانات التاجر',
            severity: daysLeft <= 0 ? 'حرجة' : 'متوسطة',
            entityName: `${m.merchantName} (${m.ownerName})`,
            message:
              daysLeft <= 0
                ? `انتهت صلاحية ترخيص المنفذ رقم (${m.licenseNumber}) بتاريخ ${expStr}.`
                : `ينتهي ترخيص المنفذ رقم (${m.licenseNumber}) خلال ${daysLeft} يوماً (${expStr}).`,
            metricValue: expStr,
          });
        }
      }
    }
  }

  return alerts;
}

