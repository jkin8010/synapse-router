/**
 * Base billing strategy
 */
import { PricingRule } from '../types.js';

export abstract class BillingStrategy {
  abstract readonly name: string;

  abstract calculate(params: Record<string, unknown>, rule: PricingRule, usage?: { input_tokens: number; output_tokens: number }): number;

  abstract estimate(params: { estimatedInputTokens?: number; estimatedQuantity?: number }, rule: PricingRule): number;
}
