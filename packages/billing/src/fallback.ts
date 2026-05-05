/**
 * Fallback strategy evaluation
 */
import { Quota, QuotaStatus, FallbackConfig, FallbackAction, BillingAlert } from './types.js';

/**
 * Evaluate fallback strategy based on quota statuses and config
 */
export function evaluateFallback(
  quotaStatuses: QuotaStatus[],
  config?: FallbackConfig,
): FallbackAction | null {
  if (!config) return null;

  const exceeded = quotaStatuses.find((s) => s.isExceeded);
  if (!exceeded) return null;

  switch (config.strategy) {
    case 'reject':
      return {
        type: 'reject',
        message: `Quota exceeded: ${exceeded.quota.id} (${exceeded.quota.type})`,
      };

    case 'downgrade':
      return {
        type: 'downgrade',
        message: `Quota exceeded. Downgrading to ${config.downgradeTo ?? 'default provider'}`,
        downgradeTo: config.downgradeTo,
      };

    case 'queue':
      return {
        type: 'queue',
        message: 'Quota exceeded. Request queued for retry.',
        retryAfterMs: config.queueRetryAfterMs ?? 60_000,
      };

    case 'notify':
      // Notify but don't block
      if (config.notifyCallback) {
        const alert: BillingAlert = {
          type: 'quota_exceeded',
          message: `Quota exceeded: ${exceeded.quota.id}`,
          quotaId: exceeded.quota.id,
          timestamp: new Date().toISOString(),
        };
        config.notifyCallback(alert);
      }
      return null; // Don't block

    default:
      return null;
  }
}

/**
 * Check if any quota status triggers a threshold warning
 */
export function getThresholdWarning(
  quotaStatuses: QuotaStatus[],
): { message: string; quotaId: string } | null {
  const nearThreshold = quotaStatuses.find((s) => s.isNearThreshold);
  if (!nearThreshold) return null;

  return {
    message: `Quota approaching limit: ${nearThreshold.quota.id} (${Math.round(nearThreshold.percentage * 100)}%)`,
    quotaId: nearThreshold.quota.id,
  };
}
