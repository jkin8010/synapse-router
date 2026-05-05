import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  parseUnit,
  getFeaturePricing,
  getFeatureLimits,
  autoQuotasFromLimits,
} from './utils.js';
import type { PricingRule, Quota } from './types.js';

describe('parseUnit', () => {
  it('parses "1k tokens" as 1000', () => {
    assert.strictEqual(parseUnit('1k tokens'), 1000);
  });

  it('parses "1M tokens" as 1000000', () => {
    assert.strictEqual(parseUnit('1M tokens'), 1000000);
  });

  it('parses "1 token" as 1', () => {
    assert.strictEqual(parseUnit('1 token'), 1);
  });

  it('parses "1000 tokens" as 1000', () => {
    assert.strictEqual(parseUnit('1000 tokens'), 1000);
  });

  it('parses "per image" as 1', () => {
    assert.strictEqual(parseUnit('per image'), 1);
  });

  it('parses "per request" as 1', () => {
    assert.strictEqual(parseUnit('per request'), 1);
  });

  it('parses "per call" as 1', () => {
    assert.strictEqual(parseUnit('per call'), 1);
  });

  it('parses plain number as itself', () => {
    assert.strictEqual(parseUnit('100'), 100);
  });

  it('defaults to 1 for unrecognizable strings', () => {
    assert.strictEqual(parseUnit('unknown'), 1);
  });

  it('handles case insensitivity', () => {
    assert.strictEqual(parseUnit('1K TOKENS'), 1000);
    assert.strictEqual(parseUnit('1k Tokens'), 1000);
  });
});

describe('getFeaturePricing', () => {
  it('returns null when pack is undefined', () => {
    assert.strictEqual(getFeaturePricing(undefined, 'test'), null);
  });

  it('returns null when feature not found', () => {
    const pack: Record<string, PricingRule> = {
      'text-gen': { strategy: 'perToken', inputPrice: 0.001 },
    };
    assert.strictEqual(getFeaturePricing(pack, 'missing'), null);
  });

  it('returns pricing rule when found', () => {
    const rule: PricingRule = { strategy: 'perToken', inputPrice: 0.001 };
    const pack: Record<string, PricingRule> = { 'text-gen': rule };
    assert.deepStrictEqual(getFeaturePricing(pack, 'text-gen'), rule);
  });
});

describe('getFeatureLimits', () => {
  it('returns empty object when rule has no limits', () => {
    const pack: Record<string, PricingRule> = {
      'text-gen': { strategy: 'perToken', inputPrice: 0.001 },
    };
    assert.deepStrictEqual(getFeatureLimits(pack, 'text-gen'), {});
  });

  it('extracts rpm and tpm from rule', () => {
    const rule: PricingRule = {
      strategy: 'perToken',
      inputPrice: 0.001,
    } as unknown as PricingRule;
    (rule as any).rpm = 60;
    (rule as any).tpm = 4000;

    const pack: Record<string, PricingRule> = { 'text-gen': rule };
    assert.deepStrictEqual(getFeatureLimits(pack, 'text-gen'), { rpm: 60, tpm: 4000 });
  });

  it('returns empty when feature not found', () => {
    const pack: Record<string, PricingRule> = {};
    assert.deepStrictEqual(getFeatureLimits(pack, 'missing'), {});
  });
});

describe('autoQuotasFromLimits', () => {
  it('generates request quota from rpm', () => {
    const quotas = autoQuotasFromLimits({ rpm: 60 });
    assert.strictEqual(quotas.length, 1);
    assert.strictEqual(quotas[0].type, 'requests');
    assert.strictEqual(quotas[0].limit, 60);
    assert.strictEqual(quotas[0].period, 'minute');
    assert.strictEqual(quotas[0].threshold, 0.8);
  });

  it('generates token quota from tpm', () => {
    const quotas = autoQuotasFromLimits({ tpm: 4000 });
    assert.strictEqual(quotas.length, 1);
    assert.strictEqual(quotas[0].type, 'tokens');
    assert.strictEqual(quotas[0].limit, 4000);
    assert.strictEqual(quotas[0].period, 'minute');
  });

  it('generates both quotas from rpm and tpm', () => {
    const quotas = autoQuotasFromLimits({ rpm: 60, tpm: 4000 });
    assert.strictEqual(quotas.length, 2);
  });

  it('returns empty array when no limits', () => {
    const quotas = autoQuotasFromLimits({});
    assert.strictEqual(quotas.length, 0);
  });

  it('uses custom period when specified', () => {
    const quotas = autoQuotasFromLimits({ rpm: 100 }, 'hour');
    assert.strictEqual(quotas[0].period, 'hour');
  });
});
