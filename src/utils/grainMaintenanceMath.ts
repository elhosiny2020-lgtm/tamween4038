import type {
  DailyWheatReceiptRecord,
  GrainAsset,
  GrainMovementRecord,
  MaintenanceOrder,
  MillAssetValuation,
  MillFlourStockBalance,
  RefrigeratorAssetValuation,
  RefrigeratorFinancialEntry,
  ShunaRecord,
  ShunaWheatIssueRecord,
  SparePartItem,
} from '../types/modules';
import { round2 } from './rationMathEngine';

export function safeNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function round3(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
}

export function computeMaintenanceOrderCost(params: {
  technicianCount: number;
  laborHours: number;
  hourlyRate: number;
  partsUsed: { quantity: number; unitCost: number }[];
  consumablesCost: number;
  transportAndOpCost: number;
  indirectOverheadPercent?: number;
  taxPercent?: number;
}): {
  laborCost: number;
  partsCost: number;
  directCost: number;
  indirectCost: number;
  taxAmount: number;
  totalRepairCost: number;
} {
  const laborCost = round2(
    Math.max(0, safeNum(params.technicianCount)) *
      Math.max(0, safeNum(params.laborHours)) *
      Math.max(0, safeNum(params.hourlyRate))
  );
  const partsCost = round2(
    (params.partsUsed || []).reduce(
      (sum, p) => sum + Math.max(0, safeNum(p?.quantity)) * Math.max(0, safeNum(p?.unitCost)),
      0
    )
  );
  const directCost = round2(
    laborCost +
      partsCost +
      Math.max(0, safeNum(params.consumablesCost)) +
      Math.max(0, safeNum(params.transportAndOpCost))
  );
  const indirectCost = round2(
    (directCost * Math.max(0, safeNum(params.indirectOverheadPercent))) / 100
  );
  const taxAmount = round2(
    ((directCost + indirectCost) * Math.max(0, safeNum(params.taxPercent))) / 100
  );
  const totalRepairCost = round2(directCost + indirectCost + taxAmount);

  return { laborCost, partsCost, directCost, indirectCost, taxAmount, totalRepairCost };
}

export interface EquipmentKpisResult {
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  mtbfHours: number | null;
  mttrHours: number | null;
}

export function computeEquipmentKpis(
  asset: GrainAsset,
  assetOrders: MaintenanceOrder[]
): EquipmentKpisResult {
  const planned = Math.max(0, safeNum(asset.plannedHoursPerPeriod));
  const downtime = Math.max(0, safeNum(asset.downtimeHours));
  const operatingHours = Math.max(0, planned - downtime);
  const designTons = Math.max(0, safeNum(asset.designProductionTons));
  const actualTons = Math.max(0, safeNum(asset.actualProductionTons));
  const conformingTons = Math.max(0, safeNum(asset.conformingTons));

  const availabilityPct = planned > 0 ? round2((operatingHours / planned) * 100) : null;
  const performancePct = designTons > 0 ? round2((actualTons / designTons) * 100) : null;
  const qualityPct = actualTons > 0 ? round2((conformingTons / actualTons) * 100) : null;

  const oeePct =
    availabilityPct !== null && performancePct !== null && qualityPct !== null
      ? round2((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100)
      : null;

  const breakdownOrders = (assetOrders || []).filter(
    (o) => o.assetId === asset.id && o.maintenanceType === 'علاجية طارئة'
  );
  const faultCount = breakdownOrders.length;
  const totalRepairHours = breakdownOrders.reduce(
    (s, o) => s + Math.max(0, safeNum(o.laborHours)),
    0
  );

  const mtbfHours = faultCount > 0 ? round2(operatingHours / faultCount) : null;
  const mttrHours = faultCount > 0 ? round2(totalRepairHours / faultCount) : null;

  return {
    availabilityPct,
    performancePct,
    qualityPct,
    oeePct,
    mtbfHours,
    mttrHours,
  };
}

export function computeSparePartStatus(part: SparePartItem): {
  availableBalance: number;
  stockValue: number;
  reorderPoint: number;
  neededQty: number;
  needsReorder: boolean;
} {
  const availableBalance = Math.max(
    0,
    round2(
      safeNum(part.openingStock) +
        safeNum(part.inboundQty) -
        safeNum(part.outboundQty) -
        safeNum(part.damagedQty)
    )
  );
  const stockValue = round2(availableBalance * Math.max(0, safeNum(part.unitCost)));
  const reorderPoint = round2(
    Math.max(0, safeNum(part.avgDailyConsumption)) * Math.max(0, safeNum(part.supplyLeadDays)) +
      Math.max(0, safeNum(part.safetyStock))
  );
  const neededQty = round2(Math.max(0, safeNum(part.targetStockLevel) - availableBalance));
  const needsReorder = availableBalance <= reorderPoint;

  return { availableBalance, stockValue, reorderPoint, neededQty, needsReorder };
}

/**
 * معادلة تصحيح وزن الحبوب حسب نسبة الرطوبة المرجعية:
 * الوزن المصحح = الوزن الأصلي × (100 - نسبة الرطوبة الفعلية) ÷ (100 - نسبة الرطوبة المرجعية)
 */
export function computeMoistureCorrectedWeight(
  originalWeightTons: number,
  actualMoisturePct: number,
  referenceMoisturePct: number
): number {
  const orig = safeNum(originalWeightTons);
  const actM = Math.min(100, Math.max(0, safeNum(actualMoisturePct)));
  const refM = Math.min(99.9, Math.max(0, safeNum(referenceMoisturePct)));
  if (!(orig >= 0)) return 0;
  const denom = 100 - refM;
  if (denom <= 0) return round2(orig);
  return round2((orig * (100 - actM)) / denom);
}

export function computeGrainStockAndLossSummary(movements: GrainMovementRecord[]): {
  openingTons: number;
  inboundTons: number;
  outboundTons: number;
  bookBalanceTons: number;
  latestPhysicalCountTons: number | null;
  inventoryVarianceTons: number | null;
  recordedLossTons: number;
  lossPercentage: number | null;
  shortagePercentage: number | null;
} {
  let openingTons = 0;
  let inboundTons = 0;
  let outboundTons = 0;
  let recordedLossTons = 0;
  let latestPhysicalCountTons: number | null = null;

  for (const m of movements || []) {
    const qty = Math.max(0, safeNum(m.correctedWeightTons) || safeNum(m.originalWeightTons));
    if (m.movementType === 'رصيد أول المدة') openingTons += qty;
    else if (m.movementType === 'وارد') inboundTons += qty;
    else if (m.movementType === 'منصرف') outboundTons += qty;
    else if (m.movementType === 'جرد فعلي' && Number.isFinite(Number(m.actualPhysicalCountTons))) {
      latestPhysicalCountTons = Number(m.actualPhysicalCountTons);
    }
    const recLoss = safeNum(m.recordedLossTons);
    if (recLoss > 0) {
      recordedLossTons += recLoss;
    }
  }

  const totalAvailable = round2(openingTons + inboundTons);
  const bookBalanceTons = round2(totalAvailable - outboundTons);
  const inventoryVarianceTons =
    latestPhysicalCountTons !== null ? round2(bookBalanceTons - latestPhysicalCountTons) : null;
  const shortagePercentage =
    inventoryVarianceTons !== null && inventoryVarianceTons > 0 && totalAvailable > 0
      ? round2((inventoryVarianceTons / totalAvailable) * 100)
      : null;
  const lossPercentage = inboundTons > 0 ? round2((recordedLossTons / inboundTons) * 100) : null;

  return {
    openingTons: round2(openingTons),
    inboundTons: round2(inboundTons),
    outboundTons: round2(outboundTons),
    bookBalanceTons,
    latestPhysicalCountTons,
    inventoryVarianceTons,
    recordedLossTons: round2(recordedLossTons),
    lossPercentage,
    shortagePercentage,
  };
}

export function computeCostPerTon(totalValue: number, handledTons: number): number | null {
  const val = safeNum(totalValue);
  const tons = safeNum(handledTons);
  if (!(tons > 0) || !Number.isFinite(val)) return null;
  return round2(val / tons);
}

// =========================================================================
// 1. محرك معادلات الشون ودفتر استلام القمح اليومي (Sole Source of Truth)
// =========================================================================

/**
 * حساب صافي الوزن بالكيلوجرام وبالطن والوزن المقبول وإجمالي قيمة التوريد
 * مع عدم تطبيق أي خصم عشوائي للرطوبة أو الشوائب إلا ما هو مسجل ومعتمد صراحة
 */
export function computeWheatReceiptNetAndValue(params: {
  grossWeightKg: number;
  tareWeightKg: number;
  excludedWeightTons?: number;
  tonPrice: number;
}): {
  isValidWeight: boolean;
  netWeightKg: number;
  netWeightTons: number;
  excludedWeightTons: number;
  acceptedNetWeightTons: number;
  totalSupplyValue: number;
} {
  const gross = Number(params.grossWeightKg) || 0;
  const tare = Number(params.tareWeightKg) || 0;
  const isValidWeight = gross > tare && gross > 0 && tare >= 0;
  const netWeightKg = isValidWeight ? round2(gross - tare) : 0;
  const netWeightTons = round3(netWeightKg / 1000);
  const excludedWeightTons = Math.max(0, round3(Number(params.excludedWeightTons) || 0));
  const acceptedNetWeightTons = Math.max(0, round3(netWeightTons - excludedWeightTons));
  const totalSupplyValue = round2(acceptedNetWeightTons * Math.max(0, Number(params.tonPrice) || 0));

  return {
    isValidWeight,
    netWeightKg,
    netWeightTons,
    excludedWeightTons,
    acceptedNetWeightTons,
    totalSupplyValue,
  };
}

/**
 * حساب الرصيد الدفتري للشونة وتقييم الأصول والمخزون
 * قاعدة صارمة: الرصيد يُحسب حصرياً من الحركات المعتمدة (approvalStatus === 'معتمد')
 * ولا تدخل المسودات أو المرفوضات أو الملغاة في رصيد الشونة إطلاقاً.
 */
export function computeShunaBookBalanceAndValuation(params: {
  shuna: ShunaRecord;
  wheatReceipts: DailyWheatReceiptRecord[];
  wheatIssues: ShunaWheatIssueRecord[];
  activeDateFilter?: string;
}): {
  openingBalanceTons: number;
  approvedInboundTons: number;
  approvedInboundTodayTons: number;
  approvedOutboundTons: number;
  approvedOutboundTodayTons: number;
  netTransfersInTons: number;
  netTransfersOutTons: number;
  approvedAdjustmentTons: number;
  currentBookBalanceTons: number;
  availableCapacityTons: number;
  occupancyPct: number;
  remainingAreaSqm: number;
  stockValuationAmount: number;
  fixedAssetsValuationAmount: number;
  totalEstimatedShunaValue: number;
  approvedReceiptsCount: number;
  pendingReceiptsCount: number;
} {
  const { shuna, wheatReceipts, wheatIssues, activeDateFilter } = params;
  const shunaReceipts = (wheatReceipts || []).filter((r) => r.shunaCode === shuna.shunaCode);
  const approvedReceipts = shunaReceipts.filter((r) => r.approvalStatus === 'معتمد');
  const pendingReceipts = shunaReceipts.filter(
    (r) => r.approvalStatus === 'مسودة' || r.approvalStatus === 'في انتظار المراجعة'
  );

  const approvedIssues = (wheatIssues || []).filter(
    (i) => i.shunaCode === shuna.shunaCode && i.approvalStatus === 'معتمد'
  );

  const approvedInboundTons = round3(
    approvedReceipts.reduce((sum, r) => sum + (Number(r.acceptedNetWeightTons) || 0), 0)
  );
  const approvedInboundTodayTons = activeDateFilter
    ? round3(
        approvedReceipts
          .filter((r) => r.receiptDate === activeDateFilter)
          .reduce((sum, r) => sum + (Number(r.acceptedNetWeightTons) || 0), 0)
      )
    : approvedInboundTons;

  const approvedOutboundTons = round3(
    approvedIssues.reduce((sum, i) => sum + (Number(i.issuedWeightTons) || 0), 0)
  );
  const approvedOutboundTodayTons = activeDateFilter
    ? round3(
        approvedIssues
          .filter((i) => i.issueDate === activeDateFilter)
          .reduce((sum, i) => sum + (Number(i.issuedWeightTons) || 0), 0)
      )
    : approvedOutboundTons;

  const openingBalanceTons = round3(Number(shuna.openingBalanceTons) || 0);
  const netTransfersInTons = round3(Number(shuna.netTransfersInTons) || 0);
  const netTransfersOutTons = round3(Number(shuna.netTransfersOutTons) || 0);
  const approvedAdjustmentTons = round3(Number(shuna.approvedAdjustmentTons) || 0);

  const currentBookBalanceTons = round3(
    openingBalanceTons +
      approvedInboundTons -
      approvedOutboundTons +
      netTransfersInTons -
      netTransfersOutTons +
      approvedAdjustmentTons
  );

  const capacity = Math.max(0, Number(shuna.storageCapacityTons) || 0);
  const availableCapacityTons = round3(Math.max(0, capacity - currentBookBalanceTons));
  const occupancyPct = capacity > 0 ? round2((currentBookBalanceTons / capacity) * 100) : 0;

  const totalArea = Math.max(0, Number(shuna.totalAreaSqm) || 0);
  const usedArea = Math.max(0, Number(shuna.usedAreaSqm) || 0);
  const remainingAreaSqm = round2(Math.max(0, totalArea - usedArea));

  const tonPrice = Math.max(0, Number(shuna.tonPrice) || 0);
  const stockValuationAmount = round2(Math.max(0, currentBookBalanceTons) * tonPrice);

  const fixedAssetsValuationAmount = round2(
    (Number(shuna.assetsAndFixturesValue) || 0) +
      (Number(shuna.internalEquipmentValue) || 0) +
      (Number(shuna.scaleValue) || 0) +
      (Number(shuna.handlingEquipmentValue) || 0)
  );

  const totalEstimatedShunaValue = round2(stockValuationAmount + fixedAssetsValuationAmount);

  return {
    openingBalanceTons,
    approvedInboundTons,
    approvedInboundTodayTons,
    approvedOutboundTons,
    approvedOutboundTodayTons,
    netTransfersInTons,
    netTransfersOutTons,
    approvedAdjustmentTons,
    currentBookBalanceTons,
    availableCapacityTons,
    occupancyPct,
    remainingAreaSqm,
    stockValuationAmount,
    fixedAssetsValuationAmount,
    totalEstimatedShunaValue,
    approvedReceiptsCount: approvedReceipts.length,
    pendingReceiptsCount: pendingReceipts.length,
  };
}

/**
 * مطابقة الجرد الفعلي للشونة مع الرصيد الدفتري المحسوب:
 * فرق الجرد = الرصيد الفعلي بالجرد - الرصيد الدفتري
 */
export function computeShunaReconciliationVariance(
  bookBalanceTons: number,
  physicalCountTons: number
): {
  varianceTons: number;
  reconciliationStatus: 'مطابق' | 'عجز' | 'زيادة';
} {
  const varianceTons = round3((Number(physicalCountTons) || 0) - (Number(bookBalanceTons) || 0));
  const reconciliationStatus =
    Math.abs(varianceTons) < 0.001 ? 'مطابق' : varianceTons < 0 ? 'عجز' : 'زيادة';
  return { varianceTons, reconciliationStatus };
}

// =========================================================================
// 2. محرك معادلات الثلاجات ومخازن التبريد
// =========================================================================

export function computeRefrigeratorRoomMetrics(params: {
  roomCapacityTons: number;
  openingBalanceTons: number;
  approvedInboundTons: number;
  approvedOutboundTons: number;
}): {
  currentBalanceTons: number;
  availableCapacityTons: number;
  occupancyPct: number;
  exceedsCapacity: boolean;
} {
  const cap = Math.max(0, Number(params.roomCapacityTons) || 0);
  const currentBalanceTons = round3(
    (Number(params.openingBalanceTons) || 0) +
      (Number(params.approvedInboundTons) || 0) -
      (Number(params.approvedOutboundTons) || 0)
  );
  const availableCapacityTons = round3(Math.max(0, cap - currentBalanceTons));
  const occupancyPct = cap > 0 ? round2((currentBalanceTons / cap) * 100) : 0;
  const exceedsCapacity = currentBalanceTons > cap;

  return { currentBalanceTons, availableCapacityTons, occupancyPct, exceedsCapacity };
}

export function computeRefrigeratorAssetValuation(
  val: Pick<
    RefrigeratorAssetValuation,
    | 'landValue'
    | 'buildingsValue'
    | 'coolingRoomsValue'
    | 'coolingUnitsCompressorsValue'
    | 'generatorsValue'
    | 'equipmentAndForkliftsValue'
    | 'scaleValue'
    | 'furnitureAndFixturesValue'
    | 'currentStoredInventoryValue'
  >
): {
  totalFixedAssetsValue: number;
  currentStoredInventoryValue: number;
  totalEstimatedValue: number;
} {
  const totalFixedAssetsValue = round2(
    (Number(val.landValue) || 0) +
      (Number(val.buildingsValue) || 0) +
      (Number(val.coolingRoomsValue) || 0) +
      (Number(val.coolingUnitsCompressorsValue) || 0) +
      (Number(val.generatorsValue) || 0) +
      (Number(val.equipmentAndForkliftsValue) || 0) +
      (Number(val.scaleValue) || 0) +
      (Number(val.furnitureAndFixturesValue) || 0)
  );
  const currentStoredInventoryValue = round2(Number(val.currentStoredInventoryValue) || 0);
  const totalEstimatedValue = round2(totalFixedAssetsValue + currentStoredInventoryValue);

  return { totalFixedAssetsValue, currentStoredInventoryValue, totalEstimatedValue };
}

export function computeRefrigeratorFinancialSummary(
  entry: Pick<
    RefrigeratorFinancialEntry,
    | 'pricingMode'
    | 'ratePerTon'
    | 'storedTonsBilled'
    | 'durationUnits'
    | 'electricityExpense'
    | 'maintenanceExpense'
    | 'laborExpense'
    | 'operatingExpense'
    | 'rentOrFeesExpense'
    | 'storageOrOperatingRevenue'
    | 'totalReceivables'
    | 'paidAmount'
  >
): {
  totalExpenses: number;
  calculatedStorageRevenue: number;
  effectiveRevenue: number;
  netFinancialMovement: number;
  remainingReceivables: number;
} {
  const totalExpenses = round2(
    (Number(entry.electricityExpense) || 0) +
      (Number(entry.maintenanceExpense) || 0) +
      (Number(entry.laborExpense) || 0) +
      (Number(entry.operatingExpense) || 0) +
      (Number(entry.rentOrFeesExpense) || 0)
  );
  const calculatedStorageRevenue = round2(
    (Number(entry.storedTonsBilled) || 0) *
      (Number(entry.ratePerTon) || 0) *
      Math.max(1, Number(entry.durationUnits) || 1)
  );
  const effectiveRevenue =
    Number(entry.storageOrOperatingRevenue) > 0
      ? round2(Number(entry.storageOrOperatingRevenue))
      : calculatedStorageRevenue;
  const netFinancialMovement = round2(effectiveRevenue - totalExpenses);
  const remainingReceivables = round2(
    Math.max(0, (Number(entry.totalReceivables) || 0) - (Number(entry.paidAmount) || 0))
  );

  return {
    totalExpenses,
    calculatedStorageRevenue,
    effectiveRevenue,
    netFinancialMovement,
    remainingReceivables,
  };
}

// =========================================================================
// 3. محرك معادلات المطاحن (التشغيل اليومي، نسب الاستخراج، الردة، والفاقد)
// =========================================================================

export function computeMillExtractionAndLoss(params: {
  openingWheatBalanceTons: number;
  inboundWheatTodayTons: number;
  actualMilledWheatTons: number;
  producedFlourTons: number;
  producedBranTons: number;
  secondaryOutputsTons?: number;
  standardExtractionPct?: number;
  maxAllowedVariancePct?: number;
}): {
  totalAvailableWheatTons: number;
  closingWheatBalanceTons: number;
  actualExtractionPct: number;
  branPct: number;
  totalOutputsTons: number;
  lossOrWasteTons: number;
  lossPct: number;
  extractionVariancePct: number;
  isExtractionAbnormal: boolean;
} {
  const opening = Number(params.openingWheatBalanceTons) || 0;
  const inbound = Number(params.inboundWheatTodayTons) || 0;
  const milled = Math.max(0, Number(params.actualMilledWheatTons) || 0);
  const flour = Math.max(0, Number(params.producedFlourTons) || 0);
  const bran = Math.max(0, Number(params.producedBranTons) || 0);
  const secondary = Math.max(0, Number(params.secondaryOutputsTons) || 0);
  const stdExtraction = Number(params.standardExtractionPct) || 82;
  const maxVariance = Number(params.maxAllowedVariancePct) || 1.5;

  const totalAvailableWheatTons = round3(opening + inbound);
  const closingWheatBalanceTons = round3(totalAvailableWheatTons - milled);
  const actualExtractionPct = milled > 0 ? round2((flour / milled) * 100) : 0;
  const branPct = milled > 0 ? round2((bran / milled) * 100) : 0;
  const totalOutputsTons = round3(flour + bran + secondary);
  const lossOrWasteTons = round3(milled - totalOutputsTons);
  const lossPct = milled > 0 ? round2((lossOrWasteTons / milled) * 100) : 0;
  const extractionVariancePct = milled > 0 ? round2(actualExtractionPct - stdExtraction) : 0;
  const isExtractionAbnormal = milled > 0 && Math.abs(extractionVariancePct) > maxVariance;

  return {
    totalAvailableWheatTons,
    closingWheatBalanceTons,
    actualExtractionPct,
    branPct,
    totalOutputsTons,
    lossOrWasteTons,
    lossPct,
    extractionVariancePct,
    isExtractionAbnormal,
  };
}

export function computeMillAssetValuation(
  asset: Pick<
    MillAssetValuation,
    | 'landValue'
    | 'buildingsValue'
    | 'millingLinesValue'
    | 'internalSilosValue'
    | 'scalesValue'
    | 'auxiliaryEquipmentValue'
    | 'vehiclesValue'
    | 'sparePartsInventoryValue'
    | 'storedWheatValue'
    | 'storedFlourValue'
  >
): {
  fixedAssetsTotal: number;
  inventoryTotal: number;
  totalEstimatedMillValue: number;
} {
  const fixedAssetsTotal = round2(
    (Number(asset.landValue) || 0) +
      (Number(asset.buildingsValue) || 0) +
      (Number(asset.millingLinesValue) || 0) +
      (Number(asset.internalSilosValue) || 0) +
      (Number(asset.scalesValue) || 0) +
      (Number(asset.auxiliaryEquipmentValue) || 0) +
      (Number(asset.vehiclesValue) || 0) +
      (Number(asset.sparePartsInventoryValue) || 0)
  );
  const inventoryTotal = round2(
    (Number(asset.storedWheatValue) || 0) + (Number(asset.storedFlourValue) || 0)
  );
  const totalEstimatedMillValue = round2(fixedAssetsTotal + inventoryTotal);

  return { fixedAssetsTotal, inventoryTotal, totalEstimatedMillValue };
}

// =========================================================================
// 4. محرك معادلات حصص الدقيق المركزية وتوزيع المخابز
// =========================================================================

export function computeFlourQuotaMetrics(params: {
  dailyQuotaTons: number;
  sackWeightKg?: number;
  eligibleWorkingDays?: number;
  actualApprovedDisbursedTons?: number;
  isSuspended?: boolean;
}): {
  dailyQuotaSacks: number;
  weeklyQuotaTons: number;
  monthlyQuotaTons: number;
  annualQuotaTons: number;
  remainingDailyTons: number;
  executionPct: number;
  disbursementStatus: 'تم الصرف بالكامل' | 'صرف جزئي' | 'لم يتم الصرف' | 'موقوف';
} {
  const daily = Math.max(0, Number(params.dailyQuotaTons) || 0);
  const sackKg = Math.max(1, Number(params.sackWeightKg) || 50);
  const workingDays = Math.max(0, Number(params.eligibleWorkingDays ?? 30));
  const disbursed = Math.max(0, Number(params.actualApprovedDisbursedTons) || 0);

  const dailyQuotaSacks = round2((daily * 1000) / sackKg);
  const weeklyQuotaTons = round3(daily * 7);
  const monthlyQuotaTons = round3(daily * workingDays);
  const annualQuotaTons = round3(daily * 365);
  const remainingDailyTons = round3(Math.max(0, daily - disbursed));
  const executionPct = daily > 0 ? round2((disbursed / daily) * 100) : 0;

  let disbursementStatus: 'تم الصرف بالكامل' | 'صرف جزئي' | 'لم يتم الصرف' | 'موقوف' =
    'لم يتم الصرف';
  if (params.isSuspended) {
    disbursementStatus = 'موقوف';
  } else if (disbursed >= daily && daily > 0) {
    disbursementStatus = 'تم الصرف بالكامل';
  } else if (disbursed > 0 && disbursed < daily) {
    disbursementStatus = 'صرف جزئي';
  }

  return {
    dailyQuotaSacks,
    weeklyQuotaTons,
    monthlyQuotaTons,
    annualQuotaTons,
    remainingDailyTons,
    executionPct,
    disbursementStatus,
  };
}

export function computeMillFlourStockBalanceSummary(
  rec: Pick<
    MillFlourStockBalance,
    | 'openingBalanceTons'
    | 'approvedProducedTons'
    | 'inboundTons'
    | 'transfersInTons'
    | 'allocatedQuotaTotalTons'
    | 'actualDisbursedToBakeriesTons'
    | 'transfersOutTons'
    | 'approvedAdjustmentsTons'
  >
): {
  totalAvailableTons: number;
  currentStockBalanceTons: number;
  unissuedAllocatedQuotaTons: number;
  quotaCoveragePct: number;
} {
  const totalAvailableTons = round3(
    (Number(rec.openingBalanceTons) || 0) +
      (Number(rec.approvedProducedTons) || 0) +
      (Number(rec.inboundTons) || 0) +
      (Number(rec.transfersInTons) || 0)
  );
  const currentStockBalanceTons = round3(
    totalAvailableTons -
      (Number(rec.actualDisbursedToBakeriesTons) || 0) -
      (Number(rec.transfersOutTons) || 0) +
      (Number(rec.approvedAdjustmentsTons) || 0)
  );
  const allocated = Math.max(0, Number(rec.allocatedQuotaTotalTons) || 0);
  const unissuedAllocatedQuotaTons = round3(
    Math.max(0, allocated - (Number(rec.actualDisbursedToBakeriesTons) || 0))
  );
  const quotaCoveragePct = allocated > 0 ? round2((currentStockBalanceTons / allocated) * 100) : 100;

  return {
    totalAvailableTons,
    currentStockBalanceTons,
    unissuedAllocatedQuotaTons,
    quotaCoveragePct,
  };
}
