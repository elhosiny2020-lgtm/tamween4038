import type {
  GrainAsset,
  GrainMovementRecord,
  MaintenanceOrder,
  SparePartItem,
} from '../types/modules';
import { round2 } from './rationMathEngine';

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
    Math.max(0, params.technicianCount) *
      Math.max(0, params.laborHours) *
      Math.max(0, params.hourlyRate)
  );
  const partsCost = round2(
    (params.partsUsed || []).reduce(
      (sum, p) => sum + Math.max(0, p.quantity) * Math.max(0, p.unitCost),
      0
    )
  );
  const directCost = round2(
    laborCost +
      partsCost +
      Math.max(0, params.consumablesCost) +
      Math.max(0, params.transportAndOpCost)
  );
  const indirectCost = round2((directCost * Math.max(0, params.indirectOverheadPercent || 0)) / 100);
  const taxAmount = round2(
    ((directCost + indirectCost) * Math.max(0, params.taxPercent || 0)) / 100
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
  const planned = Math.max(0, asset.plannedHoursPerPeriod || 0);
  const downtime = Math.max(0, asset.downtimeHours || 0);
  const operatingHours = Math.max(0, planned - downtime);

  const availabilityPct = planned > 0 ? round2((operatingHours / planned) * 100) : null;
  const performancePct =
    asset.designProductionTons > 0
      ? round2((asset.actualProductionTons / asset.designProductionTons) * 100)
      : null;
  const qualityPct =
    asset.actualProductionTons > 0
      ? round2((asset.conformingTons / asset.actualProductionTons) * 100)
      : null;

  // OEE uses decimal proportions multiplied then displayed as percentage
  const oeePct =
    availabilityPct !== null && performancePct !== null && qualityPct !== null
      ? round2((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100)
      : null;

  const breakdownOrders = assetOrders.filter(
    (o) => o.assetId === asset.id && o.maintenanceType === 'علاجية طارئة'
  );
  const faultCount = breakdownOrders.length;
  const totalRepairHours = breakdownOrders.reduce((s, o) => s + Math.max(0, o.laborHours || 0), 0);

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
      (part.openingStock || 0) +
        (part.inboundQty || 0) -
        (part.outboundQty || 0) -
        (part.damagedQty || 0)
    )
  );
  const stockValue = round2(availableBalance * Math.max(0, part.unitCost || 0));
  const reorderPoint = round2(
    Math.max(0, part.avgDailyConsumption || 0) * Math.max(0, part.supplyLeadDays || 0) +
      Math.max(0, part.safetyStock || 0)
  );
  const neededQty = round2(Math.max(0, (part.targetStockLevel || 0) - availableBalance));
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
  if (!(originalWeightTons >= 0)) return 0;
  const denom = 100 - referenceMoisturePct;
  if (denom <= 0) return round2(originalWeightTons);
  return round2((originalWeightTons * (100 - actualMoisturePct)) / denom);
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

  for (const m of movements) {
    const qty = m.correctedWeightTons || m.originalWeightTons || 0;
    if (m.movementType === 'رصيد أول المدة') openingTons += qty;
    else if (m.movementType === 'وارد') inboundTons += qty;
    else if (m.movementType === 'منصرف') outboundTons += qty;
    else if (m.movementType === 'جرد فعلي' && typeof m.actualPhysicalCountTons === 'number') {
      latestPhysicalCountTons = m.actualPhysicalCountTons;
    }
    if (typeof m.recordedLossTons === 'number' && m.recordedLossTons > 0) {
      recordedLossTons += m.recordedLossTons;
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
  if (!(handledTons > 0)) return null;
  return round2(totalValue / handledTons);
}
