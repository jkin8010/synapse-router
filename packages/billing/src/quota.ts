import { Quota, QuotaStatus, QuotaStorage } from './types.js';

/**
 * In-memory quota storage
 */
class MemoryStorage implements QuotaStorage {
  private store: Map<string, Quota> = new Map();

  getQuota(quotaId: string): Quota | undefined {
    return this.store.get(quotaId);
  }

  saveQuota(quota: Quota): void {
    this.store.set(quota.id, quota);
  }

  getAll(): Quota[] {
    return Array.from(this.store.values());
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * QuotaManager handles quota checking, consumption, and status tracking
 */
export class QuotaManager {
  private storage: QuotaStorage & { getAll?: () => Quota[] };

  constructor(quotas: Quota[], storage?: QuotaStorage) {
    if (storage) {
      this.storage = storage as QuotaStorage & { getAll?: () => Quota[] };
    } else {
      const mem = new MemoryStorage();
      for (const q of quotas) {
        mem.saveQuota(q);
      }
      this.storage = mem;
    }

    // Initialize quotas if not in storage
    for (const q of quotas) {
      if (!this.storage.getQuota(q.id)) {
        this.storage.saveQuota(q);
      }
    }
  }

  /**
   * Check if consuming `amount` would exceed the quota
   */
  check(type: Quota['type'], amount: number): { ok: boolean; quota?: Quota } {
    const quota = this.findQuotaByType(type);
    if (!quota) return { ok: true }; // no quota defined for this type

    this.maybeReset(quota);
    return { ok: quota.used + amount <= quota.limit, quota };
  }

  /**
   * Consume `amount` from the quota
   */
  consume(type: Quota['type'], amount: number): QuotaStatus | null {
    const quota = this.findQuotaByType(type);
    if (!quota) return null;

    this.maybeReset(quota);
    quota.used += amount;
    this.storage.saveQuota(quota);
    return this.getStatus(quota);
  }

  /**
   * Get status of a specific quota
   */
  getStatus(quota: Quota): QuotaStatus {
    this.maybeReset(quota);
    const remaining = Math.max(0, quota.limit - quota.used);
    const percentage = quota.limit > 0 ? quota.used / quota.limit : 0;
    const threshold = quota.threshold ?? 1.0;

    return {
      quota,
      remaining,
      percentage,
      isExceeded: quota.used >= quota.limit,
      isNearThreshold: percentage >= threshold && quota.used < quota.limit,
    };
  }

  getStatusById(quotaId: string): QuotaStatus | undefined {
    const quota = this.storage.getQuota(quotaId);
    if (!quota) return undefined;
    return this.getStatus(quota);
  }

  getAllStatuses(): QuotaStatus[] {
    const quotas = (this.storage as any).getAll?.() ?? [];
    return quotas.map((q: Quota) => this.getStatus(q));
  }

  /**
   * Reset a specific quota
   */
  reset(quotaId: string): boolean {
    const quota = this.storage.getQuota(quotaId);
    if (!quota) return false;

    quota.used = 0;
    quota.resetAt = undefined;
    this.storage.saveQuota(quota);
    return true;
  }

  /**
   * Check if quota needs period-based reset
   */
  private maybeReset(quota: Quota): void {
    if (quota.period === 'oneTime') return;

    // If resetAt is set and has passed, reset
    if (quota.resetAt) {
      const resetTime = new Date(quota.resetAt).getTime();
      if (Date.now() >= resetTime) {
        quota.used = 0;
        quota.resetAt = this.nextResetAt(quota.period);
        this.storage.saveQuota(quota);
      }
    }
  }

  private nextResetAt(period: Quota['period']): string {
    const now = new Date();
    switch (period) {
      case 'minute':
        return new Date(now.getTime() + 60 * 1000).toISOString();
      case 'hour':
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      case 'day':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.toISOString();
      case 'month':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth.toISOString();
      default:
        return now.toISOString();
    }
  }

  private findQuotaByType(type: Quota['type']): Quota | undefined {
    const quotas = (this.storage as any).getAll?.() ?? [];
    return quotas.find((q: Quota) => q.type === type);
  }
}
