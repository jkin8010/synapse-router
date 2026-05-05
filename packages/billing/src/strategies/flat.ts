/**
 * Flat billing strategy
 *
 * 每次调用固定费用
 */
import { BillingStrategy } from './base.js';
import { PricingRule } from '../types.js';

export class FlatStrategy extends BillingStrategy {
  readonly name = 'flat';

  calculate(params: Record<string, unknown>, rule: PricingRule): number {
    return rule.costPerCall ?? 0;
  }

  estimate(params: { estimatedInputTokens?: number; estimatedQuantity?: number }, rule: PricingRule): number {
    return rule.costPerCall ?? 0;
  }
}
