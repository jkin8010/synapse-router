/**
 * Per-token billing strategy
 *
 * cost = (inputTokens × inputPrice + outputTokens × outputPrice) / unitFactor
 */
import { BillingStrategy } from './base.js';
import { PricingRule } from '../types.js';
import { parseUnit } from '../utils.js';

export class PerTokenStrategy extends BillingStrategy {
  readonly name = 'perToken';

  calculate(params: Record<string, unknown>, rule: PricingRule, usage?: { input_tokens: number; output_tokens: number }): number {
    if (!usage) {
      return 0;
    }
    const inputPrice = rule.inputPrice ?? 0;
    const outputPrice = rule.outputPrice ?? 0;
    const unitFactor = parseUnit(rule.unit ?? '1k tokens');

    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;

    return (inputTokens * inputPrice + outputTokens * outputPrice) / unitFactor;
  }

  estimate(params: { estimatedInputTokens?: number; estimatedQuantity?: number }, rule: PricingRule): number {
    const inputPrice = rule.inputPrice ?? 0;
    const outputPrice = rule.outputPrice ?? 0;
    const unitFactor = parseUnit(rule.unit ?? '1k tokens');

    const estimatedInput = params.estimatedInputTokens ?? 0;
    // For per-token, assume output ~ input unless specified
    const estimatedOutput = estimatedInput;

    return (estimatedInput * inputPrice + estimatedOutput * outputPrice) / unitFactor;
  }
}
