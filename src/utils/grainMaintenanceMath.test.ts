import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCostPerTon,
  computeEquipmentKpis,
  computeGrainStockAndLossSummary,
  computeMaintenanceOrderCost,
  computeMoistureCorrectedWeight,
  computeSparePartStatus,
} from './grainMaintenanceMath.ts';
import type { GrainAsset, GrainMovementRecord, MaintenanceOrder, SparePartItem } from '../types/modules.ts';

test('computeMaintenanceOrderCost computes labor, parts, direct, indirect, and total accurately', () => {
  const res = computeMaintenanceOrderCost({
    technicianCount: 2,
    laborHours: 5,
    hourlyRate: 100,
    partsUsed: [{ quantity: 3, unitCost: 250 }],
    consumablesCost: 150,
    transportAndOpCost: 100,
    indirectOverheadPercent: 10,
    taxPercent: 14,
  });
  assert.equal(res.laborCost, 1000);
  assert.equal(res.partsCost, 750);
  assert.equal(res.directCost, 2000);
  assert.equal(res.indirectCost, 200);
  assert.equal(res.taxAmount, 308);
  assert.equal(res.totalRepairCost, 2508);
});

test('computeEquipmentKpis computes OEE, MTBF, MTTR and prevents division by zero', () => {
  const asset: GrainAsset = {
    id: 'a1',
    branchId: 'b1',
    assetCode: 'SILO-01',
    name: 'سير ناقل رئيسي',
    assetType: 'سير ناقل',
    locationSite: 'الموقع 1',
    siloOrWarehouseName: 'صومعة المحلة',
    manufacturer: 'Buhler',
    model: 'X1',
    serialNumber: 'SN1',
    supplyDate: '2024-01-01',
    installDate: '2024-02-01',
    purchaseValue: 500000,
    ratedCapacityTonPerHour: 50,
    operationalStatus: 'عاملة',
    lastMaintenanceDate: '2026-10-01',
    nextMaintenanceDate: '2026-12-01',
    operatingLifeYears: 2,
    warrantyEndDate: '2027-01-01',
    plannedHoursPerPeriod: 200,
    downtimeHours: 20, // Availability = 180/200 = 90%
    actualProductionTons: 900,
    designProductionTons: 1000, // Performance = 90%
    conformingTons: 891, // Quality = 891/900 = 99%
    energyConsumptionKwh: 1800,
    fuelConsumptionLiters: 450,
  };
  const orders: MaintenanceOrder[] = [
    {
      id: 'o1',
      branchId: 'b1',
      orderNumber: 'MO-1',
      requestDate: '2026-11-01',
      siteName: 'صومعة المحلة',
      assetId: 'a1',
      maintenanceType: 'علاجية طارئة',
      faultDescription: 'عطل',
      severity: 'عالية',
      stopStartDate: '2026-11-01',
      technicianCount: 1,
      technicianNames: 'فني 1',
      laborHours: 10,
      hourlyRate: 100,
      consumablesCost: 0,
      transportAndOpCost: 0,
      indirectOverheadPercent: 0,
      taxPercent: 0,
      partsUsed: [],
      laborCost: 1000,
      partsCost: 0,
      directCost: 1000,
      indirectCost: 0,
      totalRepairCost: 1000,
      status: 'مكتمل',
      createdAt: '2026-11-01',
    },
    {
      id: 'o2',
      branchId: 'b1',
      orderNumber: 'MO-2',
      requestDate: '2026-11-05',
      siteName: 'صومعة المحلة',
      assetId: 'a1',
      maintenanceType: 'علاجية طارئة',
      faultDescription: 'عطل 2',
      severity: 'متوسطة',
      stopStartDate: '2026-11-05',
      technicianCount: 1,
      technicianNames: 'فني 1',
      laborHours: 10,
      hourlyRate: 100,
      consumablesCost: 0,
      transportAndOpCost: 0,
      indirectOverheadPercent: 0,
      taxPercent: 0,
      partsUsed: [],
      laborCost: 1000,
      partsCost: 0,
      directCost: 1000,
      indirectCost: 0,
      totalRepairCost: 1000,
      status: 'مكتمل',
      createdAt: '2026-11-05',
    },
  ];
  const kpis = computeEquipmentKpis(asset, orders);
  assert.equal(kpis.availabilityPct, 90);
  assert.equal(kpis.performancePct, 90);
  assert.equal(kpis.qualityPct, 99);
  assert.equal(kpis.oeePct, 80.19);
  assert.equal(kpis.mtbfHours, 90); // 180 operating / 2 faults
  assert.equal(kpis.mttrHours, 10); // 20 repair hrs / 2 faults

  const zeroAsset = { ...asset, plannedHoursPerPeriod: 0, actualProductionTons: 0, designProductionTons: 0 };
  const safeZero = computeEquipmentKpis(zeroAsset, []);
  assert.equal(safeZero.oeePct, null);
  assert.equal(safeZero.mtbfHours, null);
});

test('computeMoistureCorrectedWeight, grain loss summary, and spare parts reorder work accurately', () => {
  // 100 tons at 14% moisture corrected to 12% reference: 100 * (86 / 88) = 97.73
  const corrected = computeMoistureCorrectedWeight(100, 14, 12);
  assert.equal(corrected, 97.73);

  const movements: GrainMovementRecord[] = [
    { id: 'g1', branchId: 'b1', documentNumber: 'G1', date: '2026-11-01', siloName: 'صومعة 1', grainType: 'قمح محلي', movementType: 'رصيد أول المدة', originalWeightTons: 500, actualMoisturePct: 12, referenceMoisturePct: 12, correctedWeightTons: 500 },
    { id: 'g2', branchId: 'b1', documentNumber: 'G2', date: '2026-11-02', siloName: 'صومعة 1', grainType: 'قمح محلي', movementType: 'وارد', originalWeightTons: 500, actualMoisturePct: 12, referenceMoisturePct: 12, correctedWeightTons: 500, recordedLossTons: 10 },
    { id: 'g3', branchId: 'b1', documentNumber: 'G3', date: '2026-11-03', siloName: 'صومعة 1', grainType: 'قمح محلي', movementType: 'منصرف', originalWeightTons: 400, actualMoisturePct: 12, referenceMoisturePct: 12, correctedWeightTons: 400 },
    { id: 'g4', branchId: 'b1', documentNumber: 'G4', date: '2026-11-04', siloName: 'صومعة 1', grainType: 'قمح محلي', movementType: 'جرد فعلي', originalWeightTons: 0, actualMoisturePct: 12, referenceMoisturePct: 12, correctedWeightTons: 0, actualPhysicalCountTons: 590 },
  ];
  const grainSummary = computeGrainStockAndLossSummary(movements);
  assert.equal(grainSummary.bookBalanceTons, 600);
  assert.equal(grainSummary.inventoryVarianceTons, 10);
  assert.equal(grainSummary.lossPercentage, 2); // 10 / 500 * 100
  assert.equal(computeCostPerTon(5000, 1000), 5);
  assert.equal(computeCostPerTon(5000, 0), null);

  const part: SparePartItem = {
    id: 'p1',
    branchId: 'b1',
    partCode: 'BELT-01',
    partName: 'سير كاوتش',
    unit: 'متر',
    unitCost: 200,
    openingStock: 20,
    inboundQty: 10,
    outboundQty: 22,
    damagedQty: 2,
    avgDailyConsumption: 1,
    supplyLeadDays: 5,
    safetyStock: 5,
    targetStockLevel: 25,
  };
  const ps = computeSparePartStatus(part);
  assert.equal(ps.availableBalance, 6);
  assert.equal(ps.reorderPoint, 10);
  assert.equal(ps.needsReorder, true);
  assert.equal(ps.neededQty, 19);
});
