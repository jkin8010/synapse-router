import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PerTokenStrategy } from './per-token.js';
import type { PricingRule } from '../types.js';

describe('PerTokenStrategy', () => {
  const strategy = new PerTokenStrategy();

  it('has correct name', () => {
    assert.strictEqual(strategy.name, 'perToken');
  });

  it('calculates cost with input and output tokens', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      unit: '1k tokens',
      inputPrice: 0.001,
      outputPrice: 0.002,
    };
    const usage = { input_tokens: 1000, output_tokens: 500 };
    const cost = strategy.calculate({}, rule, usage);
    // (1000 * 0.001 + 500 * 0.002) / 1000 = (1 + 1) / 1000 = 0.002
    assert.strictEqual(cost, 0.002);
  });

  it('calculates cost with only input tokens', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      unit: '1k tokens',
      inputPrice: 0.01,
    };
    const usage = { input_tokens: 5000, output_tokens: 0 };
    const cost = strategy.calculate({}, rule, usage);
    // (5000 * 0.01) / 1000 = 50 / 1000 = 0.05
    assert.strictEqual(cost, 0.05);
  });

  it('handles missing usage gracefully', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      unit: '1k tokens',
      inputPrice: 0.001,
    };
    const cost = strategy.calculate({}, rule, undefined);
    assert.strictEqual(cost, 0);
  });

  it('handles M tokens unit', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      unit: '1M tokens',
      inputPrice: 10,
      outputPrice: 30,
    };
    const usage = { input_tokens: 1000000, output_tokens: 500000 };
    const cost = strategy.calculate({}, rule, usage);
    // (1000000 * 10 + 500000 * 30) / 1000000 = (10M + 15M) / 1M = 25
    assert.strictEqual(cost, 25);
  });

  it('estimates cost from estimatedInputTokens', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      unit: '1k tokens',
      inputPrice: 0.001,
      outputPrice: 0.002,
    };
    const estimate = strategy.estimate({ estimatedInputTokens: 2000 }, rule);
    // Assumes output ~ input: (2000 * 0.001 + 2000 * 0.002) / 1000 = 0.006
    assert.strictEqual(estimate, 0.006);
  });

  it('returns 0 for estimate with no estimated tokens', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      unit: '1k tokens',
      inputPrice: 0.001,
    };
    const estimate = strategy.estimate({}, rule);
    assert.strictEqual(estimate, 0);
  });

  it('defaults unitFactor to 1000 when unit is missing', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      inputPrice: 0.01,
    };
    const usage = { input_tokens: 100, output_tokens: 0 };
    const cost = strategy.calculate({}, rule, usage);
    // 100 * 0.01 / 1000 = 0.001
    assert.strictEqual(cost, 0.001);
  });
});
