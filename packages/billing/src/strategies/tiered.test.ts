import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TieredStrategy } from './tiered.js';
import type { PricingRule } from '../types.js';

describe('TieredStrategy', () => {
  const strategy = new TieredStrategy();

  it('has correct name', () => {
    assert.strictEqual(strategy.name, 'tiered');
  });

  it('calculates cost in first tier', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
      tiers: [
        { from: 0, to: 100000, inputPrice: 0.01, outputPrice: 0.02 },
        { from: 100000, to: 500000, inputPrice: 0.005, outputPrice: 0.01 },
      ],
    };
    // 50k total tokens → first tier (0-100k)
    const usage = { input_tokens: 30000, output_tokens: 20000 };
    const cost = strategy.calculate({}, rule, usage);
    // (50000 - 0) * 0.01 / 1000 = 50000 * 0.01 / 1000 = 0.5
    assert.strictEqual(cost, 0.5);
  });

  it('calculates cost in second tier', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
      tiers: [
        { from: 0, to: 100000, inputPrice: 0.01, outputPrice: 0.02 },
        { from: 100000, to: 500000, inputPrice: 0.005, outputPrice: 0.01 },
      ],
    };
    // 200k total tokens → second tier (100k-500k)
    const usage = { input_tokens: 120000, output_tokens: 80000 };
    const cost = strategy.calculate({}, rule, usage);
    // tierStart=100000, usageInTier=200000-100000=100000
    // 100000 * 0.005 / 1000 = 0.5
    assert.strictEqual(cost, 0.5);
  });

  it('uses last tier when usage exceeds all tiers', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
      tiers: [
        { from: 0, to: 100000, inputPrice: 0.01, outputPrice: 0.02 },
        { from: 100000, to: 500000, inputPrice: 0.005, outputPrice: 0.01 },
      ],
    };
    // 600k total tokens → exceeds all tiers, use last tier
    const usage = { input_tokens: 400000, output_tokens: 200000 };
    const cost = strategy.calculate({}, rule, usage);
    // tierStart=100000, usageInTier=500000-100000=400000
    // 400000 * 0.005 / 1000 = 2.0
    assert.strictEqual(cost, 2.0);
  });

  it('returns 0 for empty tiers', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
      tiers: [],
    };
    const usage = { input_tokens: 1000, output_tokens: 500 };
    const cost = strategy.calculate({}, rule, usage);
    assert.strictEqual(cost, 0);
  });

  it('returns 0 for missing tiers', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
    };
    const usage = { input_tokens: 1000, output_tokens: 500 };
    const cost = strategy.calculate({}, rule, usage);
    assert.strictEqual(cost, 0);
  });

  it('estimates cost from estimatedInputTokens', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
      tiers: [
        { from: 0, to: 100000, inputPrice: 0.01, outputPrice: 0.02 },
      ],
    };
    // 2000 estimated input → total = 4000 → first tier
    const estimate = strategy.estimate({ estimatedInputTokens: 2000 }, rule);
    // tierStart=0, usageInTier=4000-0=4000
    // 4000 * 0.01 / 1000 = 0.04
    assert.strictEqual(estimate, 0.04);
  });

  it('handles open-ended tiers (no "to")', () => {
    const rule: PricingRule = {
      strategy: 'tiered',
      tiers: [
        { from: 0, to: 100000, inputPrice: 0.01, outputPrice: 0.02 },
        { from: 100000, inputPrice: 0.005, outputPrice: 0.01 },
      ],
    };
    const usage = { input_tokens: 150000, output_tokens: 0 };
    const cost = strategy.calculate({}, rule, usage);
    // tierStart=100000, tierEnd=150000 (usage), usageInTier=50000
    // 50000 * 0.005 / 1000 = 0.25
    assert.strictEqual(cost, 0.25);
  });
});
