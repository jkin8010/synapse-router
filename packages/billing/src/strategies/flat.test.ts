import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FlatStrategy } from './flat.js';
import type { PricingRule } from '../types.js';

describe('FlatStrategy', () => {
  const strategy = new FlatStrategy();

  it('has correct name', () => {
    assert.strictEqual(strategy.name, 'flat');
  });

  it('returns costPerCall regardless of params', () => {
    const rule: PricingRule = {
      strategy: 'flat',
      costPerCall: 0.05,
    };
    const cost = strategy.calculate({ text: 'hello' }, rule);
    assert.strictEqual(cost, 0.05);
  });

  it('returns costPerCall for estimate', () => {
    const rule: PricingRule = {
      strategy: 'flat',
      costPerCall: 0.10,
    };
    const estimate = strategy.estimate({ estimatedInputTokens: 999999 }, rule);
    assert.strictEqual(estimate, 0.10);
  });

  it('returns 0 when costPerCall is missing', () => {
    const rule: PricingRule = {
      strategy: 'flat',
    };
    const cost = strategy.calculate({}, rule);
    assert.strictEqual(cost, 0);
  });

  it('ignores usage data', () => {
    const rule: PricingRule = {
      strategy: 'flat',
      costPerCall: 1.0,
    };
    const usage = { input_tokens: 1000000, output_tokens: 500000 };
    const cost = strategy.calculate({}, rule, usage);
    assert.strictEqual(cost, 1.0);
  });
});
