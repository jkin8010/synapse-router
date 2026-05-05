/**
 * Per-unit billing strategy
 *
 * cost = quantity × unitPrice
 * quantity 从 input 参数推导（如 n 字段表示图片张数）
 */
import { BillingStrategy } from './base.js';
import { PricingRule } from '../types.js';
import { parseUnit } from '../utils.js';

export class PerUnitStrategy extends BillingStrategy {
  readonly name = 'perUnit';

  calculate(params: Record<string, unknown>, rule: PricingRule): number {
    const unitPrice = rule.unitPrice ?? 0;
    const unitFactor = parseUnit(rule.unit ?? 'per unit');

    // Try to derive quantity from common fields: n, count, quantity, duration_minutes
    const quantity = deriveQuantity(params);

    return (quantity * unitPrice) / unitFactor;
  }

  estimate(params: { estimatedInputTokens?: number; estimatedQuantity?: number }, rule: PricingRule): number {
    const unitPrice = rule.unitPrice ?? 0;
    const unitFactor = parseUnit(rule.unit ?? 'per unit');
    const quantity = params.estimatedQuantity ?? 1;

    return (quantity * unitPrice) / unitFactor;
  }
}

function deriveQuantity(params: Record<string, unknown>): number {
  // Common quantity fields
  if (typeof params.n === 'number') return Math.max(1, params.n);
  if (typeof params.count === 'number') return Math.max(1, params.count);
  if (typeof params.quantity === 'number') return Math.max(1, params.quantity);
  if (typeof params.duration_minutes === 'number') return Math.max(1, params.duration_minutes);
  if (typeof params.duration === 'number') return Math.max(1, params.duration);
  // Default: 1 unit
  return 1;
}
