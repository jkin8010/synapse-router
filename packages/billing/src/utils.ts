/**
 * Utility functions
 */

import { PricingRule, Quota, QuotaPeriod } from './types.js';

/**
 * Parse unit string to numeric factor.
 * Examples:
 *   "1k tokens" -> 1000
 *   "1M tokens" -> 1000000
 *   "per image" -> 1
 *   "per request" -> 1
 *   "1 token" -> 1
 */
export function parseUnit(unit: string): number {
  const normalized = unit.toLowerCase().trim();

  // Match patterns like "1k tokens", "1M tokens", "1000 tokens"
  const tokenMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*[kmg]?\s*tokens?$/);
  if (tokenMatch) {
    const value = parseFloat(tokenMatch[1]);
    const multiplier = getMultiplier(normalized);
    return value * multiplier;
  }

  // Match patterns like "per image", "per request", "per call"
  if (normalized.startsWith('per ')) {
    return 1;
  }

  // Fallback: try to parse as a number
  const num = parseFloat(normalized);
  if (!isNaN(num) && num > 0) {
    return num;
  }

  return 1;
}

function getMultiplier(unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized.includes('m ') || normalized.startsWith('1m')) return 1000000;
  if (normalized.includes('k ') || normalized.startsWith('1k')) return 1000;
  return 1;
}

/**
 * Get pricing rule for a feature from pack configuration.
 */
export function getFeaturePricing(
  pack: Record<string, PricingRule> | undefined,
  featureId: string,
): PricingRule | null {
  if (!pack) return null;
  return pack[featureId] ?? null;
}

/**
 * Extract limits (rpm, tpm) from a pack configuration.
 */
export function getFeatureLimits(
  pack: Record<string, PricingRule> | undefined,
  featureId: string,
): { rpm?: number; tpm?: number } {
  const rule = getFeaturePricing(pack, featureId);
  if (!rule) return {};

  // Limits may be embedded in the rule context or as custom fields
  const ruleAny = rule as unknown as Record<string, unknown>;
  const result: { rpm?: number; tpm?: number } = {};
  const rpm = ruleAny.rpm as number | undefined;
  const tpm = ruleAny.tpm as number | undefined;
  if (rpm !== undefined) result.rpm = rpm;
  if (tpm !== undefined) result.tpm = tpm;
  return result;
}

/**
 * Auto-generate quotas from rate limits.
 */
export function autoQuotasFromLimits(
  limits: { rpm?: number; tpm?: number },
  period: QuotaPeriod = 'minute',
): Quota[] {
  const quotas: Quota[] = [];

  if (limits.rpm !== undefined) {
    quotas.push({
      id: `auto-rpm-${period}`,
      type: 'requests',
      limit: limits.rpm,
      used: 0,
      period,
      threshold: 0.8,
    });
  }

  if (limits.tpm !== undefined) {
    quotas.push({
      id: `auto-tpm-${period}`,
      type: 'tokens',
      limit: limits.tpm,
      used: 0,
      period,
      threshold: 0.8,
    });
  }

  return quotas;
}
