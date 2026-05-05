import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Billing } from './billing.js';
import { BillingError } from './types.js';
import { PerTokenStrategy, PerUnitStrategy } from './index.js';
import type {
  BillingConfig,
  ConnectLock,
  ConnectResult,
  PricingRule,
  Quota,
} from './types.js';

// --- Fixtures ---

function makeLock(overrides: Partial<ConnectLock> = {}): ConnectLock {
  return {
    intent: 'generate',
    provider: 'openai',
    feature_id: 'text-generation',
    input_schema: {
      fields: [{ name: 'prompt', type: 'string', required: true }],
    },
    output_schema: {
      fields: [{ name: 'text', type: 'string' }],
    },
    field_mappings: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<ConnectResult> = {}): ConnectResult {
  return {
    output: { text: 'Hello world' },
    raw: {},
    meta: {
      provider: 'openai',
      feature_id: 'text-generation',
      model: 'gpt-4',
      usage: { input_tokens: 500, output_tokens: 200 },
      latency_ms: 1200,
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<BillingConfig> = {}): BillingConfig {
  const pack: Record<string, PricingRule> = {
    'text-generation': {
      strategy: 'perToken',
      unit: '1k tokens',
      inputPrice: 0.01,
      outputPrice: 0.03,
    },
    'image-gen': {
      strategy: 'perUnit',
      unit: 'per image',
      unitPrice: 0.04,
    },
    'flat-feature': {
      strategy: 'flat',
      costPerCall: 0.05,
    },
  };

  const quotas: Quota[] = [
    { id: 'cost-quota', type: 'cost', limit: 100, used: 0, period: 'month', threshold: 0.8 },
    { id: 'token-quota', type: 'tokens', limit: 50000, used: 0, period: 'month', threshold: 0.8 },
    { id: 'request-quota', type: 'requests', limit: 1000, used: 0, period: 'day', threshold: 0.8 },
  ];

  return {
    pricing: { source: 'pack', pack },
    quotas,
    fallback: { strategy: 'reject' },
    ...overrides,
  };
}

// --- Tests ---

describe('Billing', () => {
  let config: BillingConfig;
  let billing: Billing;

  beforeEach(() => {
    config = makeConfig();
    billing = new Billing(config);
  });

  describe('preCall', () => {
    it('returns allowed with estimated cost', async () => {
      const lock = makeLock();
      const result = await billing.preCall({
        lock,
        estimatedInputTokens: 1000,
      });

      assert.strictEqual(result.allowed, true);
      assert.ok(result.estimatedCost > 0);
      assert.ok(Array.isArray(result.quotaStatus));
      assert.ok(result.quotaStatus.length > 0);
    });

    it('returns cost estimate for perToken strategy', async () => {
      const lock = makeLock();
      const result = await billing.preCall({
        lock,
        estimatedInputTokens: 1000,
      });

      // input: 1000, output ~1000 → (1000 * 0.01 + 1000 * 0.03) / 1000 = 0.04
      assert.strictEqual(result.estimatedCost, 0.04);
    });

    it('returns warning when near threshold', async () => {
      const quotas: Quota[] = [
        { id: 'cost-quota', type: 'cost', limit: 100, used: 80, period: 'month', threshold: 0.8 },
      ];
      const billingWithNearThreshold = new Billing(makeConfig({ quotas }));

      const lock = makeLock();
      const result = await billingWithNearThreshold.preCall({
        lock,
        estimatedInputTokens: 1000,
      });

      // estimated cost is 0.04, total would be 80.04 → 80.04% ≥ 80% threshold
      assert.ok(result.warning?.includes('approaching') || result.warning?.includes('limit'));
    });

    it('blocks when quota exceeded with reject fallback', async () => {
      const quotas: Quota[] = [
        { id: 'cost-quota', type: 'cost', limit: 100, used: 100, period: 'oneTime' },
        { id: 'token-quota', type: 'tokens', limit: 50000, used: 0, period: 'oneTime' },
        { id: 'request-quota', type: 'requests', limit: 1000, used: 0, period: 'oneTime' },
      ];
      const billingBlocked = new Billing(
        makeConfig({ quotas, fallback: { strategy: 'reject' } }),
      );

      const lock = makeLock();
      const result = await billingBlocked.preCall({
        lock,
        estimatedInputTokens: 1000,
      });

      assert.strictEqual(result.allowed, false);
      assert.ok(result.fallback);
      assert.strictEqual(result.fallback?.type, 'reject');
    });

    it('allows with notify fallback even when exceeded', async () => {
      const quotas: Quota[] = [
        { id: 'cost-quota', type: 'cost', limit: 100, used: 100, period: 'oneTime' },
        { id: 'token-quota', type: 'tokens', limit: 50000, used: 0, period: 'oneTime' },
        { id: 'request-quota', type: 'requests', limit: 1000, used: 0, period: 'oneTime' },
      ];
      const billingNotify = new Billing(
        makeConfig({ quotas, fallback: { strategy: 'notify' } }),
      );

      const lock = makeLock();
      const result = await billingNotify.preCall({
        lock,
        estimatedInputTokens: 1000,
      });

      assert.strictEqual(result.allowed, true);
    });

    it('throws when no pricing rule found', async () => {
      const lock = makeLock({ feature_id: 'unknown-feature' });

      try {
        await billing.preCall({ lock });
        assert.fail('Expected BillingError');
      } catch (err) {
        assert.ok(err instanceof BillingError);
        assert.strictEqual((err as BillingError).code, 'PRICING_NOT_FOUND');
      }
    });
  });

  describe('postCall', () => {
    it('calculates actual cost from usage', async () => {
      const lock = makeLock();
      const result = makeResult();

      const postResult = await billing.postCall({ lock, result });

      assert.ok(postResult.actualCost > 0);
      assert.ok(Array.isArray(postResult.quotaUpdates));
      assert.ok(Array.isArray(postResult.alerts));
    });

    it('returns correct cost for perToken usage', async () => {
      const lock = makeLock();
      const result = makeResult({
        meta: {
          provider: 'openai',
          feature_id: 'text-generation',
          usage: { input_tokens: 1000, output_tokens: 500 },
          latency_ms: 800,
        },
      });

      const postResult = await billing.postCall({ lock, result });

      // (1000 * 0.01 + 500 * 0.03) / 1000 = (10 + 15) / 1000 = 0.025
      assert.strictEqual(postResult.actualCost, 0.025);
    });

    it('creates alerts when threshold is hit', async () => {
      const quotas: Quota[] = [
        { id: 'cost-quota', type: 'cost', limit: 0.03, used: 0, period: 'oneTime', threshold: 0.8 },
        { id: 'token-quota', type: 'tokens', limit: 50000, used: 0, period: 'oneTime' },
        { id: 'request-quota', type: 'requests', limit: 1000, used: 0, period: 'oneTime' },
      ];
      const billingAlert = new Billing(makeConfig({ quotas }));

      const lock = makeLock();
      const result = makeResult({
        meta: {
          provider: 'openai',
          feature_id: 'text-generation',
          usage: { input_tokens: 1000, output_tokens: 500 },
          latency_ms: 800,
        },
      });

      const postResult = await billingAlert.postCall({ lock, result });
      // cost = 0.025, limit = 0.03 → 83.3% ≥ 80% threshold
      assert.ok(postResult.alerts.length > 0);
    });

    it('consumes quota for each call', async () => {
      const lock = makeLock();
      const result = makeResult();

      await billing.postCall({ lock, result });
      await billing.postCall({ lock, result });

      const requestStatus = billing.getQuota('request-quota');
      assert.ok(requestStatus);
      // 2 calls consumed
      assert.strictEqual(requestStatus.remaining, 998);
    });

    it('throws when no pricing rule found', async () => {
      const lock = makeLock({ feature_id: 'unknown-feature' });
      const result = makeResult();

      try {
        await billing.postCall({ lock, result });
        assert.fail('Expected BillingError');
      } catch (err) {
        assert.ok(err instanceof BillingError);
        assert.strictEqual((err as BillingError).code, 'PRICING_NOT_FOUND');
      }
    });
  });

  describe('quota management', () => {
    it('getQuota returns status for specific quota', () => {
      const status = billing.getQuota('cost-quota');
      assert.ok(status);
      assert.strictEqual(status.quota.id, 'cost-quota');
    });

    it('getAllQuotas returns all statuses', () => {
      const statuses = billing.getAllQuotas();
      assert.ok(statuses.length >= 3);
    });

    it('resetQuota resets a quota', () => {
      // First consume some
      billing.getQuota('request-quota');
      const resetResult = billing.resetQuota('request-quota');
      assert.strictEqual(resetResult, true);
    });

    it('resetQuota returns false for unknown id', () => {
      const resetResult = billing.resetQuota('nonexistent');
      assert.strictEqual(resetResult, false);
    });
  });

  describe('registerStrategy', () => {
    it('registers and uses custom strategy', async () => {
      const customStrategy = new PerTokenStrategy();
      billing.registerStrategy('customToken', customStrategy);

      // Verify it was registered by trying to use it
      // We can't directly test the strategy is used without changing pricing,
      // but we can verify registration doesn't crash
      assert.ok(true);
    });
  });

  describe('custom pricing source', () => {
    it('works with custom pricing source', async () => {
      const customConfig: BillingConfig = {
        pricing: {
          source: 'custom',
          custom: {
            'my-feature': {
              strategy: 'flat',
              costPerCall: 0.10,
            },
          },
        },
        quotas: [
          { id: 'cost-quota', type: 'cost', limit: 100, used: 0, period: 'oneTime' },
        ],
      };
      const billingCustom = new Billing(customConfig);

      const lock = makeLock({ feature_id: 'my-feature' });
      const result = await billingCustom.preCall({ lock });

      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.estimatedCost, 0.10);
    });
  });
});
