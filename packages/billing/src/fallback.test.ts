import { describe, it } from 'node:test';
import assert from 'node:assert';
import { evaluateFallback, getThresholdWarning } from './fallback.js';
import type { QuotaStatus, FallbackConfig, BillingAlert } from './types.js';

function makeStatus(isExceeded: boolean, isNearThreshold: boolean): QuotaStatus {
  return {
    quota: { id: 'test-quota', type: 'requests', limit: 100, used: isExceeded ? 100 : 80, period: 'oneTime' },
    remaining: isExceeded ? 0 : 20,
    percentage: isExceeded ? 1.0 : 0.8,
    isExceeded,
    isNearThreshold,
  };
}

describe('evaluateFallback', () => {
  it('returns null when config is not provided', () => {
    const result = evaluateFallback([makeStatus(false, false)]);
    assert.strictEqual(result, null);
  });

  it('returns null when no quota is exceeded', () => {
    const config: FallbackConfig = { strategy: 'reject' };
    const result = evaluateFallback([makeStatus(false, false)], config);
    assert.strictEqual(result, null);
  });

  it('rejects when quota exceeded', () => {
    const config: FallbackConfig = { strategy: 'reject' };
    const result = evaluateFallback([makeStatus(true, false)], config);
    assert.ok(result);
    assert.strictEqual(result?.type, 'reject');
    assert.ok(result?.message?.includes('Quota exceeded'));
  });

  it('returns downgrade with suggested provider', () => {
    const config: FallbackConfig = { strategy: 'downgrade', downgradeTo: 'fallback-provider' };
    const result = evaluateFallback([makeStatus(true, false)], config);
    assert.ok(result);
    assert.strictEqual(result?.type, 'downgrade');
    assert.strictEqual(result?.downgradeTo, 'fallback-provider');
  });

  it('returns queue with retry time', () => {
    const config: FallbackConfig = { strategy: 'queue', queueRetryAfterMs: 30000 };
    const result = evaluateFallback([makeStatus(true, false)], config);
    assert.ok(result);
    assert.strictEqual(result?.type, 'queue');
    assert.strictEqual(result?.retryAfterMs, 30000);
  });

  it('uses default retry time for queue', () => {
    const config: FallbackConfig = { strategy: 'queue' };
    const result = evaluateFallback([makeStatus(true, false)], config);
    assert.ok(result);
    assert.strictEqual(result?.retryAfterMs, 60000);
  });

  it('notifies but does not block', () => {
    let capturedAlert: BillingAlert | undefined;
    const config: FallbackConfig = {
      strategy: 'notify',
      notifyCallback: (alert) => {
        capturedAlert = alert;
      },
    };
    const result = evaluateFallback([makeStatus(true, false)], config);
    assert.strictEqual(result, null); // Don't block
    assert.ok(capturedAlert);
    assert.strictEqual(capturedAlert?.type, 'quota_exceeded');
    assert.ok(capturedAlert?.message?.includes('Quota exceeded'));
  });

  it('notifies without callback (no crash)', () => {
    const config: FallbackConfig = { strategy: 'notify' };
    const result = evaluateFallback([makeStatus(true, false)], config);
    assert.strictEqual(result, null);
  });
});

describe('getThresholdWarning', () => {
  it('returns null when no quotas near threshold', () => {
    const result = getThresholdWarning([makeStatus(false, false)]);
    assert.strictEqual(result, null);
  });

  it('returns warning for quota near threshold', () => {
    const result = getThresholdWarning([makeStatus(false, true)]);
    assert.ok(result);
    assert.strictEqual(result?.quotaId, 'test-quota');
    assert.ok(result?.message?.includes('approaching limit'));
  });

  it('returns first matching quota', () => {
    const statuses: QuotaStatus[] = [
      makeStatus(false, false),
      makeStatus(false, true),
    ];
    const result = getThresholdWarning(statuses);
    assert.ok(result);
    assert.strictEqual(result?.quotaId, 'test-quota');
  });
});
