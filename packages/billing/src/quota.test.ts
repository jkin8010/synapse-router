import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { QuotaManager } from './quota.js';
import type { Quota } from './types.js';

describe('QuotaManager', () => {
  const quotas: Quota[] = [
    { id: 'cost-quota', type: 'cost', limit: 100, used: 0, period: 'month', threshold: 0.8 },
    { id: 'token-quota', type: 'tokens', limit: 100000, used: 0, period: 'month', threshold: 0.9 },
    { id: 'request-quota', type: 'requests', limit: 1000, used: 0, period: 'day', threshold: 0.8 },
  ];

  let manager: QuotaManager;

  beforeEach(() => {
    // Create fresh quotas for each test
    manager = new QuotaManager(
      quotas.map((q) => ({ ...q })),
    );
  });

  describe('check', () => {
    it('returns ok when within limits', () => {
      const result = manager.check('requests', 1);
      assert.strictEqual(result.ok, true);
    });

    it('returns not ok when would exceed', () => {
      const mgr = new QuotaManager([
        { id: 'r', type: 'requests', limit: 5, used: 4, period: 'oneTime' },
      ]);
      const result = mgr.check('requests', 2);
      assert.strictEqual(result.ok, false);
    });

    it('returns ok when no quota defined for type', () => {
      const result = manager.check('tokens', 9999999);
      // Token quota exists, but limit is 100k
      assert.strictEqual(result.ok, false);
    });

    it('returns ok when no quota defined for a custom type', () => {
      // 'custom' type is not defined in the default quotas
      const mgr = new QuotaManager([]);
      const result = mgr.check('custom' as any, 999);
      assert.strictEqual(result.ok, true);
    });
  });

  describe('consume', () => {
    it('returns status after consuming', () => {
      const mgr = new QuotaManager([
        { id: 'r', type: 'requests', limit: 100, used: 0, period: 'oneTime' },
      ]);
      const status = mgr.consume('requests', 10);
      assert.ok(status);
      assert.strictEqual(status.remaining, 90);
      assert.strictEqual(status.percentage, 0.1);
      assert.strictEqual(status.isExceeded, false);
    });

    it('returns null for untracked type', () => {
      const mgr = new QuotaManager([]);
      const status = mgr.consume('requests', 1);
      assert.strictEqual(status, null);
    });

    it('accumulates consumption', () => {
      const mgr = new QuotaManager([
        { id: 'r', type: 'requests', limit: 100, used: 0, period: 'oneTime' },
      ]);
      mgr.consume('requests', 30);
      mgr.consume('requests', 20);
      const status = mgr.getStatusById('r')!;
      assert.strictEqual(status.remaining, 50);
      assert.strictEqual(status.percentage, 0.5);
    });
  });

  describe('getStatus', () => {
    it('returns correct status', () => {
      const quota: Quota = { id: 'q', type: 'cost', limit: 100, used: 75, period: 'oneTime', threshold: 0.8 };
      const status = manager.getStatus(quota);
      assert.strictEqual(status.remaining, 25);
      assert.strictEqual(status.percentage, 0.75);
      assert.strictEqual(status.isExceeded, false);
      assert.strictEqual(status.isNearThreshold, false);
    });

    it('detects exceeded quota', () => {
      const quota: Quota = { id: 'q', type: 'cost', limit: 100, used: 100, period: 'oneTime' };
      const status = manager.getStatus(quota);
      assert.strictEqual(status.isExceeded, true);
      assert.strictEqual(status.remaining, 0);
    });

    it('detects threshold warning', () => {
      const quota: Quota = { id: 'q', type: 'cost', limit: 100, used: 85, period: 'oneTime', threshold: 0.8 };
      const status = manager.getStatus(quota);
      assert.strictEqual(status.isNearThreshold, true);
      assert.strictEqual(status.isExceeded, false);
    });

    it('isNearThreshold is false when already exceeded', () => {
      const quota: Quota = { id: 'q', type: 'cost', limit: 100, used: 100, period: 'oneTime', threshold: 0.8 };
      const status = manager.getStatus(quota);
      assert.strictEqual(status.isExceeded, true);
      assert.strictEqual(status.isNearThreshold, false);
    });
  });

  describe('getAllStatuses', () => {
    it('returns all quota statuses', () => {
      const statuses = manager.getAllStatuses();
      assert.strictEqual(statuses.length, 3);
    });
  });

  describe('reset', () => {
    it('resets a quota to 0', () => {
      const mgr = new QuotaManager([
        { id: 'r', type: 'requests', limit: 100, used: 50, period: 'oneTime' },
      ]);
      mgr.consume('requests', 10);
      const success = mgr.reset('r');
      assert.strictEqual(success, true);
      const status = mgr.getStatusById('r')!;
      assert.strictEqual(status.remaining, 100);
      assert.strictEqual(status.percentage, 0);
    });

    it('returns false for unknown quota id', () => {
      const success = manager.reset('nonexistent');
      assert.strictEqual(success, false);
    });
  });
});
