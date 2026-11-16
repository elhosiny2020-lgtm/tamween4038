import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLoafWeightShortageFine } from './loafWeightFinesMath.ts';

test('calculateLoafWeightShortageFine matches the official 9g shortage example (235 EGP)', () => {
  const res = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 81, // 9g shortage => Tier 1 (<10g, multiplier 1x)
    bagPriceAtViolation: 235,
    insuranceQuotaAtViolation: 10,
    breadType: 'بلدي مدعم',
  });
  assert.equal(res.valid, true);
  assert.equal(res.isViolation, true);
  assert.equal(res.record?.shortageGrams, 9);
  assert.equal(res.record?.tierMultiplier, 1);
  assert.equal(res.record?.baseFineAmount, 235);
  assert.equal(res.record?.finalFineAmount, 235);
});

test('calculateLoafWeightShortageFine applies multipliers 2x, 3x, 4x and blocks non-violations', () => {
  // Tier 2: 10 to <20g => 2x
  const t2 = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 72, // 18g shortage
    bagPriceAtViolation: 235,
    insuranceQuotaAtViolation: 10,
  });
  assert.equal(t2.record?.tierMultiplier, 2);
  assert.equal(t2.record?.baseFineAmount, 470);
  assert.equal(t2.record?.finalFineAmount, 940);

  // Tier 3: 20 to <30g => 3x
  const t3 = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 65, // 25g shortage
    bagPriceAtViolation: 235,
    insuranceQuotaAtViolation: 10,
  });
  assert.equal(t3.record?.tierMultiplier, 3);

  // Tier 4: >= 30g => 4x
  const t4 = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 60, // 30g shortage
    bagPriceAtViolation: 235,
    insuranceQuotaAtViolation: 10,
  });
  assert.equal(t4.record?.tierMultiplier, 4);

  // Actual >= prescribed => no fine
  const okLoaf = calculateLoafWeightShortageFine({
    prescribedWeightGrams: 90,
    actualWeightGrams: 92,
    bagPriceAtViolation: 235,
    insuranceQuotaAtViolation: 10,
  });
  assert.equal(okLoaf.valid, true);
  assert.equal(okLoaf.isViolation, false);
});
