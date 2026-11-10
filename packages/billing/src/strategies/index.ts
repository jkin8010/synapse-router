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

/**
 * Create an independent registry — use this in tests or whenever the caller
 * needs its own strategy set instead of the process-wide default.
 */
export function createStrategyRegistry(): StrategyRegistry {
  return new StrategyRegistry();
}

// Singleton for convenience
let _defaultRegistry: StrategyRegistry | undefined;

/**
 * Process-wide default registry.
 *
 * It contains only the built-in strategies and is frozen: callers must not
 * register into shared global state (that would make results depend on
 * initialization order and leak across tests). Use `StrategyRegistry` directly
 * when custom strategies are needed.
 */
export function getDefaultRegistry(): Readonly<StrategyRegistry> {
  if (!_defaultRegistry) {
    _defaultRegistry = createStrategyRegistry();
    Object.freeze(_defaultRegistry);
  }
  return _defaultRegistry;
}
