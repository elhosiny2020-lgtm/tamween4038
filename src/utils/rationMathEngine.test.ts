import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCommodityCurrentBalance,
  computeCommodityStockValue,
  computeRemainingMonthlyQuota,
  computeMonthlyQuotaExecutionPct,
  computeDisbursedQuantityValue,
  generateSmartRationAlerts,
} from './rationMathEngine';
import { createInitialRationState } from '../services/modulesStorage';
import { DEFAULT_VILLAGES_HIERARCHY } from '../defaultData';

test('computeCommodityCurrentBalance: calculates opening + inbound - outbound + returnsIn - returnsOut accurately', () => {
  // 10000 + 8000 - 5500 + 200 - 50 = 12650
  assert.equal(
    computeCommodityCurrentBalance({
      openingBalance: 10000,
      inboundQty: 8000,
      outboundQty: 5500,
      inboundReturns: 200,
      outboundReturns: 50,
    }),
    12650
  );
  // Supports approved adjustments as well
  assert.equal(
    computeCommodityCurrentBalance({
      openingBalance: 500,
      inboundQty: 200,
      outboundQty: 100,
      approvedAdjustments: -50,
    }),
    550
  );
});

test('computeCommodityStockValue: calculates currentBalance * unitPrice rounded to 2 decimals', () => {
  assert.equal(computeCommodityStockValue(12500, 12.6), 157500);
  assert.equal(computeCommodityStockValue(333, 15.25), 5078.25);
});

test('computeRemainingMonthlyQuota: calculates prescribedQty - receivedQty', () => {
  assert.equal(computeRemainingMonthlyQuota(3200, 3100), 100);
  assert.equal(computeRemainingMonthlyQuota(1500, 1500), 0);
});

test('computeMonthlyQuotaExecutionPct: calculates (distributedQty / prescribedQty) * 100 with zero-division guard', () => {
  assert.equal(computeMonthlyQuotaExecutionPct(2850, 3200), 89.06);
  assert.equal(computeMonthlyQuotaExecutionPct(1500, 1500), 100);
  assert.equal(computeMonthlyQuotaExecutionPct(500, 0), 0);
});

test('computeDisbursedQuantityValue: calculates disbursedQty * unitPrice', () => {
  assert.equal(computeDisbursedQuantityValue(5500, 12.6), 69300);
  assert.equal(computeDisbursedQuantityValue(4100, 30), 123000);
});

test('generateSmartRationAlerts: detects all 7 categories including low stock, incomplete quotas, and expiring items/licenses', () => {
  const state = createInitialRationState('branch-main', 'إدارة تموين مركز المحلة الكبرى', DEFAULT_VILLAGES_HIERARCHY);
  // Force one warehouse item below reorderLevel
  state.warehouses[0].openingBalance = 100;
  state.warehouses[0].totalIn = 0;
  state.warehouses[0].totalOut = 50;
  state.warehouses[0].reorderLevel = 500;
  // Force one commodity near expiry
  state.commodities[0].expiryDate = '2026-01-01';
  state.warehouses[0].expiryDate = '2026-01-01';
  // Force one merchant license near expiry
  state.merchants[0].licenseExpiryDate = '2026-01-01';
  state.merchants[0].activityEndDate = '2026-01-01';
  // Force one requisition with low distributed quantity (< 85%)
  state.requisitions[0].lines[0].deliveredQty = 10;

  const alerts = generateSmartRationAlerts({
    commodities: state.commodities,
    warehouses: state.warehouses,
    merchants: state.merchants,
    requisitions: state.requisitions,
    todayIso: '2026-04-01',
  });
  assert.ok(alerts.length > 0, 'Should generate smart alerts');
  assert.ok(alerts.some((a) => a.category === 'LOW_STOCK'), 'Should include LOW_STOCK alert');
  assert.ok(alerts.some((a) => a.category === 'NEAR_EXPIRY'), 'Should include NEAR_EXPIRY alert');
  assert.ok(
    alerts.some((a) => a.category === 'EXPIRED_MERCHANT_LICENSE'),
    'Should include EXPIRED_MERCHANT_LICENSE alert'
  );
  assert.ok(
    alerts.some((a) => a.category === 'INCOMPLETE_DISBURSEMENT' || a.category === 'DELAYED_QUOTA'),
    'Should include quota execution alerts'
  );
});
