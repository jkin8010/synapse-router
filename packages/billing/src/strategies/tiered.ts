/**
 * Tiered billing strategy
 *
 * 阶梯定价：用量落在不同区间，单价不同
 */
import { BillingStrategy } from './base.js';
import { PricingRule, Tier } from '../types.js';
import { parseUnit } from '../utils.js';

export class TieredStrategy extends BillingStrategy {
  readonly name = 'tiered';

  calculate(params: Record<string, unknown>, rule: PricingRule, usage?: { input_tokens: number; output_tokens: number }): number {
    const tiers = rule.tiers;
    if (!tiers || tiers.length === 0) {
      return 0;
    }

    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    return calculateTiered(totalTokens, tiers);
  }

  estimate(params: { estimatedInputTokens?: number; estimatedQuantity?: number }, rule: PricingRule): number {
    const tiers = rule.tiers;
    if (!tiers || tiers.length === 0) {
      return 0;
    }

    const estimatedInput = params.estimatedInputTokens ?? 0;
    const estimatedOutput = estimatedInput; // assume symmetric
    const totalTokens = estimatedInput + estimatedOutput;

    return calculateTiered(totalTokens, tiers);
  }
}

function calculateTiered(totalUsage: number, tiers: Tier[]): number {
  // Sort tiers by from
  const sorted = [...tiers].sort((a, b) => a.from - b.from);

  // Find which tier the current usage falls into
  let activeTier: Tier | undefined;
  for (const tier of sorted) {
    if (totalUsage >= tier.from && (tier.to === undefined || totalUsage < tier.to)) {
      activeTier = tier;
      break;
    }
  }

  // If usage exceeds all tiers, use the last tier
  if (!activeTier && sorted.length > 0) {
    activeTier = sorted[sorted.length - 1];
  }

  if (!activeTier) {
    return 0;
  }

  // Calculate cost within the active tier
  const tierStart = activeTier.from;
  const tierEnd = activeTier.to ?? totalUsage;
  const usageInTier = Math.min(totalUsage, tierEnd) - tierStart;

  // Proportional split between input and output pricing
  // For simplicity, apply inputPrice to the full usage in tier
  // In a real implementation, you'd split input/output within the tier
  return usageInTier * activeTier.inputPrice / 1000; // normalized per 1k tokens
}
