import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PerUnitStrategy } from './per-unit.js';
import type { PricingRule } from '../types.js';

describe('PerUnitStrategy', () => {
  const strategy = new PerUnitStrategy();

  it('has correct name', () => {
    assert.strictEqual(strategy.name, 'perUnit');
  });

  it('calculates cost from n field (image count)', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per image',
      unitPrice: 0.04,
    };
    const params = { n: 4, prompt: 'a cat' };
    const cost = strategy.calculate(params, rule);
    // 4 * 0.04 / 1 = 0.16
    assert.strictEqual(cost, 0.16);
  });

  it('calculates cost from count field', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per request',
      unitPrice: 0.02,
    };
    const params = { count: 3 };
    const cost = strategy.calculate(params, rule);
    assert.strictEqual(cost, 0.06);
  });

  it('calculates cost from quantity field', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per unit',
      unitPrice: 0.5,
    };
    const params = { quantity: 2 };
    const cost = strategy.calculate(params, rule);
    assert.strictEqual(cost, 1.0);
  });

  it('calculates cost from duration_minutes field', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per minute',
      unitPrice: 0.002,
    };
    const params = { duration_minutes: 30 };
    const cost = strategy.calculate(params, rule);
    assert.strictEqual(cost, 0.06);
  });

  it('defaults to 1 unit when no quantity fields present', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per call',
      unitPrice: 1.0,
    };
    const params = { text: 'hello' };
    const cost = strategy.calculate(params, rule);
    assert.strictEqual(cost, 1.0);
  });

  it('estimates cost from estimatedQuantity', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per image',
      unitPrice: 0.04,
    };
    const estimate = strategy.estimate({ estimatedQuantity: 5 }, rule);
    assert.strictEqual(estimate, 0.2);
  });

  it('defaults to 1 when no quantity estimate provided', () => {
    const rule: PricingRule = {
      strategy: 'perUnit',
      unit: 'per unit',
      unitPrice: 0.5,
    };
    const estimate = strategy.estimate({}, rule);
    assert.strictEqual(estimate, 0.5);
  });
});
