/**
 * @synapse-router/billing - Public API
 */

// Core
export { Billing } from './billing.js';

// Wrapper
export { createBillingConnector } from "./wrapper.js";

// File Storage
export { FileQuotaStorage } from "./file-storage.js";

// Pricing Bridge
export { pricingFromProviderCard } from "./pricing-bridge.js";

// Types
export type {
  PricingStrategy,
  PricingRule,
  Tier,
  QuotaType,
  QuotaPeriod,
  Quota,
  QuotaStatus,
  ConnectLock,
  ConnectResult,
  PreCallParams,
  PreCallResult,
  PostCallParams,
  PostCallResult,
  FallbackStrategy,
  FallbackConfig,
  FallbackAction,
  WarningType,
  AlertSeverity,
  BillingWarning,
  BillingAlert,
  PricingConfig,
  BillingConfig,
  QuotaStorage,
  BillingResult,
  BillingOnError,
  BillingConnectorConfig,
} from './types.js';

export { BillingError } from './types.js';

// Strategies
export { BillingStrategy } from './strategies/base.js';
export { PerTokenStrategy } from './strategies/per-token.js';
export { PerUnitStrategy } from './strategies/per-unit.js';
export { TieredStrategy } from './strategies/tiered.js';
export { FlatStrategy } from './strategies/flat.js';
export { StrategyRegistry, getDefaultRegistry, createStrategyRegistry } from './strategies/index.js';

// Quota
export { QuotaManager } from './quota.js';

// Fallback
export { evaluateFallback, getThresholdWarning } from './fallback.js';

// Utilities
export { parseUnit, getFeaturePricing, getFeatureLimits, autoQuotasFromLimits } from './utils.js';
