import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCardCommodityQuota,
  computeCardEntitlementSummary,
  computeMerchantFinancialStatement,
  computeRequisitionTotals,
  computeWarehouseStockStatus,
  countEligibleBeneficiaries,
  validateAndComputeDisbursement,
} from './rationMathEngine.ts';
import type {
  MerchantFinancialEntry,
  RationCardRecord,
  RationCommodity,
  RationDecisionSettings,
  RationDisbursementRecord,
  RationRequisition,
  RationWarehouseBalance,
} from '../types/modules.ts';

const baseSettings: RationDecisionSettings = {
  activeMonth: '2026-11',
  supportPerBeneficiary: 50,
  additionalGrantPerCard2026: 125,
  additionalGrantEnabled: true,
  decisionNumber: 'قرار 152 لسنة 2025 / توجيهات 2026',
  decisionIssueDate: '2025-09-01',
  decisionEffectiveDate: '2025-10-01',
  allowNegativeStockWithApproval: false,
  updatedBy: 'admin',
  updatedAt: '2026-11-01T00:00:00Z',
};

const sugar: RationCommodity = {
  id: 'com-sugar',
  code: 'SUG-01',
  name: 'سكر تمويني معبأ 1 كجم',
  category: 'سلع أساسية',
  unit: 'كيلو',
  packWeightGramsOrMl: 1000,
  officialPrice: 12.6,
  freeMarketRefPrice: 30,
  supplyCostPrice: 11.8,
  profitMargin: 0.8,
  commissionType: 'per_unit',
  commissionValue: 0.5,
  maxPerBeneficiary: 1,
  maxPerCard: 6,
  monthlyQuotaPerBeneficiary: 1,
  quotaRuleType: 'sugar_rule',
  priceStartDate: '2025-01-01',
  isActive: true,
  supplierCompany: 'الشركة العامة لتجارة الجملة',
  reorderLevel: 50,
  decisionNumber: '152/2025',
};

const oil: RationCommodity = {
  id: 'com-oil',
  code: 'OIL-01',
  name: 'زيت خليط 800 مل',
  category: 'زيوت',
  unit: 'عبوة',
  packWeightGramsOrMl: 800,
  officialPrice: 30,
  freeMarketRefPrice: 55,
  supplyCostPrice: 28.5,
  profitMargin: 1.5,
  commissionType: 'per_unit',
  commissionValue: 1,
  maxPerBeneficiary: 1,
  maxPerCard: 4,
  monthlyQuotaPerBeneficiary: 1,
  quotaRuleType: 'oil_rule',
  priceStartDate: '2025-01-01',
  isActive: true,
  supplierCompany: 'الشركة العامة لتجارة الجملة',
  reorderLevel: 40,
  decisionNumber: '152/2025',
};

// Cases 1, 2, 3, 4, 5: Single member, multi-member, suspended members, individual cap, card cap
test('Ration Cases 1-5: beneficiary filtering, individual limits, and card cap enforcement', () => {
  const singleCard: RationCardRecord = {
    id: 'c1',
    branchId: 'b1',
    cardNumber: '1001',
    headOfFamilyName: 'أحمد',
    headNationalId: '28001011600001',
    merchantId: 'm1',
    village: 'بشبيش',
    localUnit: 'بشبيش',
    status: 'سارية',
    members: [{ id: 'm1', fullName: 'أحمد', nationalId: '280', relation: 'رب أسرة', status: 'مستحق' }],
  };
  assert.equal(countEligibleBeneficiaries(singleCard.members), 1);
  assert.equal(computeCardCommodityQuota(1, sugar).effectiveQuota, 1);

  const eightMembersWithTwoSuspended: RationCardRecord = {
    id: 'c2',
    branchId: 'b1',
    cardNumber: '1002',
    headOfFamilyName: 'محمود',
    headNationalId: '28001011600002',
    merchantId: 'm1',
    village: 'بشبيش',
    localUnit: 'بشبيش',
    status: 'سارية',
    hasAdditionalGrant: true,
    members: [
      { id: '1', fullName: '1', nationalId: '1', relation: 'رب', status: 'مستحق' },
      { id: '2', fullName: '2', nationalId: '2', relation: 'زوجة', status: 'مستحق' },
      { id: '3', fullName: '3', nationalId: '3', relation: 'ابن', status: 'مستحق' },
      { id: '4', fullName: '4', nationalId: '4', relation: 'ابن', status: 'مستحق' },
      { id: '5', fullName: '5', nationalId: '5', relation: 'ابن', status: 'مستحق' },
      { id: '6', fullName: '6', nationalId: '6', relation: 'ابن', status: 'مستحق' },
      { id: '7', fullName: '7', nationalId: '7', relation: 'موقوف1', status: 'موقوف' },
      { id: '8', fullName: '8', nationalId: '8', relation: 'غير مستحق', status: 'غير مستحق' },
    ],
  };
  // 6 eligible, 2 excluded => oil capped at 4 per card (not 6!), sugar capped at 6
  const eligible = countEligibleBeneficiaries(eightMembersWithTwoSuspended.members);
  assert.equal(eligible, 6);
  assert.equal(computeCardCommodityQuota(eligible, oil).effectiveQuota, 4);
  assert.equal(computeCardCommodityQuota(eligible, sugar).effectiveQuota, 6);

  const summary = computeCardEntitlementSummary(
    eightMembersWithTwoSuspended,
    [sugar, oil],
    baseSettings,
    []
  );
  assert.equal(summary.availableSupportBudget, 300); // 6 * 50
  assert.equal(summary.additionalGrantAmount, 125); // Separated grant 2026
});

// Cases 6, 7, 8: Full support consumed, remaining support, partial disbursement & duplicate guard
test('Ration Cases 6-8: support consumption, partial disbursement, zero division, and duplicate prevention', () => {
  const card: RationCardRecord = {
    id: 'c3',
    branchId: 'b1',
    cardNumber: '1003',
    headOfFamilyName: 'خالد',
    headNationalId: '280',
    merchantId: 'm1',
    village: 'بشبيش',
    localUnit: 'بشبيش',
    status: 'سارية',
    members: [
      { id: 'a', fullName: 'أ', nationalId: '1', relation: 'رب', status: 'مستحق' },
      { id: 'b', fullName: 'ب', nationalId: '2', relation: 'زوجة', status: 'مستحق' },
    ],
  };

  // Budget = 2 * 50 = 100 EGP; partial disbursement of 1 oil (30 EGP) + 2 sugar (25.20 EGP) = 55.20 EGP
  const disb: RationDisbursementRecord[] = [
    {
      id: 'd1',
      branchId: 'b1',
      operationNumber: 'OP-001',
      monthKey: '2026-11',
      date: '2026-11-02',
      cardId: 'c3',
      merchantId: 'm1',
      commodityId: 'com-oil',
      quantity: 1,
      officialUnitPriceAtSale: 30,
      totalSaleValue: 30,
      supportDeducted: 30,
      citizenPaidAmount: 0,
      commissionEarned: 1,
      collectionMethod: 'بطاقة تموينية',
      employeeName: 'تاجر',
    },
    {
      id: 'd2',
      branchId: 'b1',
      operationNumber: 'OP-002',
      monthKey: '2026-11',
      date: '2026-11-02',
      cardId: 'c3',
      merchantId: 'm1',
      commodityId: 'com-sugar',
      quantity: 2,
      officialUnitPriceAtSale: 12.6,
      totalSaleValue: 25.2,
      supportDeducted: 25.2,
      citizenPaidAmount: 0,
      commissionEarned: 1,
      collectionMethod: 'بطاقة تموينية',
      employeeName: 'تاجر',
    },
  ];
  const summary = computeCardEntitlementSummary(card, [sugar, oil], baseSettings, disb);
  assert.equal(summary.remainingSupportBudget, 44.8);
  assert.equal(summary.supportConsumptionPct, 55.2);
  const oilLine = summary.commoditiesBreakdown.find((x) => x.commodityId === 'com-oil')!;
  assert.equal(oilLine.disbursedQty, 1);
  assert.equal(oilLine.remainingQty, 1);
  assert.equal(oilLine.disbursedPct, 50);

  // Duplicate operation number rejected
  const dupCheck = validateAndComputeDisbursement({
    operationNumber: 'OP-001',
    card,
    commodity: oil,
    requestedQty: 1,
    warehouseBalance: 100,
    existingDisbursements: disb,
    settings: baseSettings,
    supportUsedInOperation: 30,
  });
  assert.equal(dupCheck.valid, false);
});

// Cases 9, 10, 11: Partial requisition delivery, return, shortage/surplus adjustment, financial ledger
test('Ration Cases 9-11: partial requisition, inventory returns, shortage/surplus variance, and settlement separation', () => {
  const req: RationRequisition = {
    id: 'r1',
    branchId: 'b1',
    requestNumber: 'REQ-1',
    invoiceNumber: 'INV-1',
    monthKey: '2026-11',
    merchantId: 'm1',
    wholesaleBranch: 'فرع المحلة',
    linkedCardsCount: 100,
    linkedBeneficiariesCount: 400,
    insuranceAmount: 50000,
    committedInsuranceBefore: 12000,
    previousStockTotalQty: 50,
    requestDate: '2026-11-01',
    status: 'تسليم جزئي',
    totalValue: 0,
    lines: [
      { commodityId: 'com-sugar', commodityName: 'سكر', requestedQty: 200, approvedQty: 180, deliveredQty: 120, supplyPrice: 11.8 },
    ],
  };
  const reqTotals = computeRequisitionTotals(req);
  assert.equal(reqTotals.remainingApprovedQty, 60);
  assert.equal(reqTotals.availableInsurance, 38000);
  assert.equal(reqTotals.totalRequisitionValue, 2360);

  const wh: RationWarehouseBalance = {
    id: 'w1',
    branchId: 'b1',
    merchantId: 'm1',
    warehouseName: 'مخزن 1',
    commodityId: 'com-sugar',
    openingBalance: 100,
    totalIn: 200,
    totalOut: 150,
    inboundReturns: 10,
    outboundReturns: 5,
    approvedAdjustments: -5,
    physicalCount: 145, // Book = 100+200+10-150-5-5 = 150 -> shortage of -5
    reorderLevel: 40,
  };
  const whStatus = computeWarehouseStockStatus(wh, 11.8, '2026-11-16');
  assert.equal(whStatus.bookBalance, 150);
  assert.equal(whStatus.inventoryVariance, -5);
  assert.equal(whStatus.varianceType, 'عجز');

  // Merchant ledger deduplicates duplicate docNumber and separates commissions from debt
  const entries: MerchantFinancialEntry[] = [
    { id: 'e1', branchId: 'b1', documentNumber: 'DOC-1', date: '2026-11-01', merchantId: 'm1', entryType: 'SUPPLY_INVOICE', debitAmount: 10000, creditAmount: 0, description: 'توريد', isApproved: true, createdBy: 'admin' },
    { id: 'e1-dup', branchId: 'b1', documentNumber: 'DOC-1', date: '2026-11-01', merchantId: 'm1', entryType: 'SUPPLY_INVOICE', debitAmount: 10000, creditAmount: 0, description: 'مكرر', isApproved: true, createdBy: 'admin' },
    { id: 'e2', branchId: 'b1', documentNumber: 'DOC-2', date: '2026-11-05', merchantId: 'm1', entryType: 'PAYMENT_CREDIT', debitAmount: 0, creditAmount: 6000, description: 'سداد', isApproved: true, createdBy: 'admin' },
    { id: 'e3', branchId: 'b1', documentNumber: 'DOC-3', date: '2026-11-06', merchantId: 'm1', entryType: 'COMMISSION_EARNED', debitAmount: 0, creditAmount: 450, description: 'عمولة', isApproved: true, createdBy: 'admin' },
  ];
  const stmt = computeMerchantFinancialStatement(1000, entries, 'm1');
  assert.equal(stmt.totalSupplyDebits, 10000); // Deduped!
  assert.equal(stmt.netDebtBalance, 5000); // 1000 + 10000 - 6000
  assert.equal(stmt.netCommissionDue, 450); // Separated!
});

// Case 12: Price change in a new month does not alter old invoices
test('Ration Case 12: historical invoice officialUnitPriceAtSale remains immutable after price update', () => {
  const oldInvoice: RationDisbursementRecord = {
    id: 'old-inv',
    branchId: 'b1',
    operationNumber: 'OP-OLD-1',
    monthKey: '2026-10',
    date: '2026-10-15',
    cardId: 'c1',
    merchantId: 'm1',
    commodityId: 'com-sugar',
    quantity: 3,
    officialUnitPriceAtSale: 12.6,
    totalSaleValue: 37.8,
    supportDeducted: 37.8,
    citizenPaidAmount: 0,
    commissionEarned: 1.5,
    collectionMethod: 'بطاقة تموينية',
    employeeName: 'تاجر',
  };
  const updatedSugar: RationCommodity = { ...sugar, officialPrice: 15.0, priceStartDate: '2026-11-01' };
  assert.equal(oldInvoice.totalSaleValue, 37.8);
  assert.notEqual(updatedSugar.officialPrice, oldInvoice.officialUnitPriceAtSale);
});
