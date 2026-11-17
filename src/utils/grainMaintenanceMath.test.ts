import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWheatReceiptNetAndValue,
  computeShunaBookBalanceAndValuation,
  computeShunaReconciliationVariance,
  computeRefrigeratorRoomMetrics,
  computeRefrigeratorAssetValuation,
  computeRefrigeratorFinancialSummary,
  computeMillExtractionAndLoss,
  computeMillAssetValuation,
  computeFlourQuotaMetrics,
  computeMillFlourStockBalanceSummary,
} from './grainMaintenanceMath';
import type {
  DailyWheatReceiptRecord,
  ShunaRecord,
  ShunaWheatIssueRecord,
} from '../types/modules';

describe('Grain Maintenance Department Math Engine (قسم صيانة الحبوب)', () => {
  it('computes Daily Wheat Receipt net weight in Kg & Tons and total value without unapproved auto-deductions', () => {
    const res = computeWheatReceiptNetAndValue({
      grossWeightKg: 42500,
      tareWeightKg: 14500,
      excludedWeightTons: 0.5, // approved exclusion
      tonPrice: 13333.33,
    });
    assert.equal(res.isValidWeight, true);
    assert.equal(res.netWeightKg, 28000);
    assert.equal(res.netWeightTons, 28);
    assert.equal(res.acceptedNetWeightTons, 27.5);
    assert.equal(res.totalSupplyValue, 366666.58);

    // Rejects invalid weight where tare >= gross
    const invalidRes = computeWheatReceiptNetAndValue({
      grossWeightKg: 12000,
      tareWeightKg: 15000,
      excludedWeightTons: 0,
      tonPrice: 13000,
    });
    assert.equal(invalidRes.isValidWeight, false);
    assert.equal(invalidRes.netWeightKg, 0);
  });

  it('computes Shuna Book Balance strictly from APPROVED receipts and issues (ignoring drafts/rejected/cancelled)', () => {
    const shuna: ShunaRecord = {
      id: 'sh-1',
      serialNo: 1,
      shunaCode: 'SH-MHL-01',
      shunaName: 'شونة المحلة المركزية المطورة',
      village: 'المحلة الكبرى',
      localUnit: 'المركز',
      affiliatedEntity: 'البنك الزراعي المصري / الشركة العامة للصوامع',
      managerName: 'م/ علاء الدين الشرقاوي',
      phone: '01012345678',
      totalAreaSqm: 5000,
      usedAreaSqm: 3800,
      storageCapacityTons: 6000,
      openingBalanceTons: 1200,
      netTransfersInTons: 100,
      netTransfersOutTons: 50,
      approvedAdjustmentTons: -10,
      tonPrice: 13500,
      assetsAndFixturesValue: 2500000,
      internalEquipmentValue: 1200000,
      scaleValue: 650000,
      handlingEquipmentValue: 850000,
      scaleStatus: 'يعمل ومعاير',
      storageEquipmentStatus: 'ممتازة',
      operationalStatus: 'تعمل',
      lastMaintenanceDate: '2026-04-10',
      nextMaintenanceDate: '2026-10-10',
      valuationDate: '2026-05-01',
      evaluatorName: 'لجنة التقييم الفني والمالي',
      notes: '',
    };

    const receipts: DailyWheatReceiptRecord[] = [
      {
        id: 'r-1',
        serialNo: 1,
        receiptOrderNumber: 'WR-2026-001',
        receiptDate: '2026-05-10',
        receiptTime: '09:30',
        shunaCode: 'SH-MHL-01',
        shunaName: shuna.shunaName,
        supplierName: 'الجمعية الزراعية ببشبيش',
        supplierNationalIdOrCode: 'SUP-101',
        wheatType: 'محلي',
        agriculturalSeason: '2026',
        vehicleNumber: 'غ ر ب 4512',
        driverName: 'حسن عبد الفتاح',
        scaleNumber: 'SCALE-01',
        grossWeightKg: 35000,
        tareWeightKg: 15000,
        netWeightKg: 20000,
        netWeightTons: 20,
        moisturePct: 11.8,
        impuritiesPct: 0.8,
        cleanlinessGrade: '23.5 قيراط',
        qualityGrade: 'درجة أولى',
        excludedWeightTons: 0,
        deductionsLog: [],
        acceptedNetWeightTons: 20,
        tonPrice: 13500,
        totalSupplyValue: 270000,
        inspectionReportNumber: 'INSP-01',
        shunaKeeperName: 'أحمد فؤاد',
        committeeMemberName: 'م/ سامي المتولي',
        approvalStatus: 'معتمد',
        createdBy: 'مدخل البيانات',
        approvedBy: 'رئيس اللجنة',
        notes: '',
      },
      {
        id: 'r-2',
        serialNo: 2,
        receiptOrderNumber: 'WR-2026-002',
        receiptDate: '2026-05-10',
        receiptTime: '11:00',
        shunaCode: 'SH-MHL-01',
        shunaName: shuna.shunaName,
        supplierName: 'مورد تحت المراجعة',
        supplierNationalIdOrCode: 'SUP-102',
        wheatType: 'محلي',
        agriculturalSeason: '2026',
        vehicleNumber: 'غ ر ب 9981',
        driverName: 'محمود السيد',
        scaleNumber: 'SCALE-01',
        grossWeightKg: 45000,
        tareWeightKg: 15000,
        netWeightKg: 30000,
        netWeightTons: 30,
        moisturePct: 12.1,
        impuritiesPct: 1.0,
        cleanlinessGrade: '23 قيراط',
        qualityGrade: 'درجة أولى',
        excludedWeightTons: 0,
        deductionsLog: [],
        acceptedNetWeightTons: 30,
        tonPrice: 13500,
        totalSupplyValue: 405000,
        inspectionReportNumber: 'INSP-02',
        shunaKeeperName: 'أحمد فؤاد',
        committeeMemberName: 'م/ سامي المتولي',
        approvalStatus: 'مسودة', // Draft - MUST NOT affect balance!
        createdBy: 'مدخل البيانات',
        notes: '',
      },
    ];

    const issues: ShunaWheatIssueRecord[] = [
      {
        id: 'iss-1',
        serialNo: 1,
        issueOrderNumber: 'WI-2026-001',
        issueDate: '2026-05-10',
        issueTime: '13:00',
        shunaCode: 'SH-MHL-01',
        shunaName: shuna.shunaName,
        beneficiaryMillCode: 'MILL-01',
        beneficiaryMillName: 'مطحن المحلة الكبرى الحديث',
        wheatType: 'محلي',
        balanceBeforeIssueTons: 1260,
        issuedWeightTons: 15,
        balanceAfterIssueTons: 1245,
        tonPrice: 13500,
        totalIssuedValue: 202500,
        vehicleNumber: 'غ ر ب 7711',
        driverName: 'سعيد كامل',
        receiverName: 'أمين المطحن',
        approvalStatus: 'معتمد',
        createdBy: 'أمين الشونة',
        notes: '',
      },
    ];

    const calc = computeShunaBookBalanceAndValuation({
      shuna,
      wheatReceipts: receipts,
      wheatIssues: issues,
    });

    // Opening (1200) + Approved In (20) - Approved Out (15) + Transfers In (100) - Transfers Out (50) + Adj (-10) = 1245
    assert.equal(calc.approvedInboundTons, 20);
    assert.equal(calc.approvedOutboundTons, 15);
    assert.equal(calc.currentBookBalanceTons, 1245);
    assert.equal(calc.remainingAreaSqm, 1200);
    assert.equal(calc.fixedAssetsValuationAmount, 5200000);
    assert.equal(calc.stockValuationAmount, 1245 * 13500);
    assert.equal(calc.totalEstimatedShunaValue, 5200000 + 1245 * 13500);
    assert.equal(calc.approvedReceiptsCount, 1);
    assert.equal(calc.pendingReceiptsCount, 1);
  });

  it('computes Shuna reconciliation variance and status accurately', () => {
    const shortage = computeShunaReconciliationVariance(1245, 1240);
    assert.equal(shortage.varianceTons, -5);
    assert.equal(shortage.reconciliationStatus, 'عجز');

    const surplus = computeShunaReconciliationVariance(1245, 1248.5);
    assert.equal(surplus.varianceTons, 3.5);
    assert.equal(surplus.reconciliationStatus, 'زيادة');

    const match = computeShunaReconciliationVariance(1245, 1245);
    assert.equal(match.varianceTons, 0);
    assert.equal(match.reconciliationStatus, 'مطابق');
  });

  it('computes Refrigerator room metrics, asset valuation separation, and financial summary', () => {
    const room = computeRefrigeratorRoomMetrics({
      roomCapacityTons: 250,
      openingBalanceTons: 100,
      approvedInboundTons: 120,
      approvedOutboundTons: 45,
    });
    assert.equal(room.currentBalanceTons, 175);
    assert.equal(room.availableCapacityTons, 75);
    assert.equal(room.occupancyPct, 70);
    assert.equal(room.exceedsCapacity, false);

    const valuation = computeRefrigeratorAssetValuation({
      landValue: 3000000,
      buildingsValue: 2500000,
      coolingRoomsValue: 1800000,
      coolingUnitsCompressorsValue: 1200000,
      generatorsValue: 650000,
      equipmentAndForkliftsValue: 450000,
      scaleValue: 250000,
      furnitureAndFixturesValue: 150000,
      currentStoredInventoryValue: 4200000,
    });
    assert.equal(valuation.totalFixedAssetsValue, 10000000);
    assert.equal(valuation.currentStoredInventoryValue, 4200000);
    assert.equal(valuation.totalEstimatedValue, 14200000);

    const fin = computeRefrigeratorFinancialSummary({
      pricingMode: 'شهري',
      ratePerTon: 450,
      storedTonsBilled: 175,
      durationUnits: 1,
      electricityExpense: 18000,
      maintenanceExpense: 4500,
      laborExpense: 12000,
      operatingExpense: 3500,
      rentOrFeesExpense: 2000,
      storageOrOperatingRevenue: 0,
      totalReceivables: 78750,
      paidAmount: 60000,
    });
    assert.equal(fin.totalExpenses, 40000);
    assert.equal(fin.calculatedStorageRevenue, 78750);
    assert.equal(fin.netFinancialMovement, 38750);
    assert.equal(fin.remainingReceivables, 18750);
  });

  it('computes Mill extraction %, bran %, loss %, and abnormal extraction variance alert', () => {
    const millOp = computeMillExtractionAndLoss({
      openingWheatBalanceTons: 300,
      inboundWheatTodayTons: 150,
      actualMilledWheatTons: 200,
      producedFlourTons: 164, // 82%
      producedBranTons: 34, // 17%
      secondaryOutputsTons: 1, // 0.5%
      standardExtractionPct: 82,
      maxAllowedVariancePct: 1.5,
    });
    assert.equal(millOp.totalAvailableWheatTons, 450);
    assert.equal(millOp.closingWheatBalanceTons, 250);
    assert.equal(millOp.actualExtractionPct, 82);
    assert.equal(millOp.branPct, 17);
    assert.equal(millOp.lossOrWasteTons, 1);
    assert.equal(millOp.lossPct, 0.5);
    assert.equal(millOp.isExtractionAbnormal, false);

    const abnormalOp = computeMillExtractionAndLoss({
      openingWheatBalanceTons: 200,
      inboundWheatTodayTons: 0,
      actualMilledWheatTons: 100,
      producedFlourTons: 78, // 78% vs 82% standard -> 4% variance
      producedBranTons: 19,
      secondaryOutputsTons: 0,
      standardExtractionPct: 82,
      maxAllowedVariancePct: 1.5,
    });
    assert.equal(abnormalOp.isExtractionAbnormal, true);
  });

  it('computes Flour Quota metrics and Mill Flour Stock Balance accurately', () => {
    const quota = computeFlourQuotaMetrics({
      dailyQuotaTons: 1.5, // 30 sacks of 50kg
      sackWeightKg: 50,
      eligibleWorkingDays: 30,
      actualApprovedDisbursedTons: 1.5,
    });
    assert.equal(quota.dailyQuotaSacks, 30);
    assert.equal(quota.weeklyQuotaTons, 10.5);
    assert.equal(quota.monthlyQuotaTons, 45);
    assert.equal(quota.annualQuotaTons, 547.5);
    assert.equal(quota.remainingDailyTons, 0);
    assert.equal(quota.executionPct, 100);
    assert.equal(quota.disbursementStatus, 'تم الصرف بالكامل');

    const stock = computeMillFlourStockBalanceSummary({
      openingBalanceTons: 80,
      approvedProducedTons: 164,
      inboundTons: 0,
      transfersInTons: 10,
      allocatedQuotaTotalTons: 150,
      actualDisbursedToBakeriesTons: 142,
      transfersOutTons: 4,
      approvedAdjustmentsTons: 0,
    });
    assert.equal(stock.totalAvailableTons, 254);
    assert.equal(stock.currentStockBalanceTons, 108);
    assert.equal(stock.unissuedAllocatedQuotaTons, 8);
  });
});
