import type {
  MerchantFinancialEntry,
  RationBeneficiaryMember,
  RationCardRecord,
  RationCommodity,
  RationDecisionSettings,
  RationDisbursementRecord,
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
