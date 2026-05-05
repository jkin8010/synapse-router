/**
 * Strategy Registry
 */
import { BillingStrategy } from './base.js';
import { PricingRule, PricingStrategy } from '../types.js';
import { PerTokenStrategy } from './per-token.js';
import { PerUnitStrategy } from './per-unit.js';
import { TieredStrategy } from './tiered.js';
import { FlatStrategy } from './flat.js';

export class StrategyRegistry {
  private strategies: Map<string, BillingStrategy> = new Map();

  constructor() {
    // Register built-in strategies
    this.register('perToken', new PerTokenStrategy());
    this.register('perUnit', new PerUnitStrategy());
    this.register('tiered', new TieredStrategy());
    this.register('flat', new FlatStrategy());
  }

  register(name: string, strategy: BillingStrategy): void {
    this.strategies.set(name, strategy);
  }

  get(name: string): BillingStrategy | undefined {
    return this.strategies.get(name);
  }

  getByRule(rule: PricingRule): BillingStrategy | undefined {
    return this.get(rule.strategy);
  }
}

// Singleton for convenience
let _defaultRegistry: StrategyRegistry | undefined;

export function getDefaultRegistry(): StrategyRegistry {
  if (!_defaultRegistry) {
    _defaultRegistry = new StrategyRegistry();
  }
  return _defaultRegistry;
}
