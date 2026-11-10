/**
 * Billing type definitions
 */

// --- Pricing ---

export type PricingStrategy = 'perToken' | 'perUnit' | 'tiered' | 'flat';

export interface PricingRule {
  strategy: PricingStrategy;
  unit?: string; // e.g. "1k tokens", "per image"
  inputPrice?: number;
  outputPrice?: number;
  unitPrice?: number;
  costPerCall?: number;
  tiers?: Tier[];
}

export interface Tier {
  from: number;
  to?: number;
  inputPrice: number;
  outputPrice: number;
}

// --- Quota ---

export type QuotaType = 'tokens' | 'requests' | 'cost';
export type QuotaPeriod = 'minute' | 'hour' | 'day' | 'month' | 'oneTime';

export interface Quota {
  id: string;
  type: QuotaType;
  limit: number;
  used: number;
  period: QuotaPeriod;
  threshold?: number; // e.g. 0.8 → warn at 80%
  resetAt?: string; // ISO date
}

export interface QuotaStatus {
  quota: Quota;
  remaining: number;
  percentage: number;
  isExceeded: boolean;
  isNearThreshold: boolean;
}

// --- Pre/Post Call ---

export interface ConnectLock {
  intent: string;
  provider: string;
  feature_id: string;
  input_schema: {
    fields: Array<{ name: string; type: string; required: boolean }>;
  };
  output_schema: {
    fields: Array<{ name: string; type: string }>;
  };
  field_mappings: Array<{
    canonical_field: string;
    provider_field: string;
    required?: boolean;
    transform?: 'passthrough' | 'extract_url' | 'base64_decode' | 'json_parse' | 'cast_number';
    fallback?: unknown;
  }>;
}

export interface ConnectResult {
  output: Record<string, unknown>;
  /** Provider raw response — diagnostic only, mirrors @synapse-router/connector */
  raw?: unknown;
  meta: {
    provider: string;
    feature_id: string;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
    latency_ms: number;
  };
}

export interface PreCallParams {
  lock: ConnectLock;
  estimatedInputTokens?: number;
  estimatedQuantity?: number;
  context?: Record<string, unknown>;
}

export interface PreCallResult {
  allowed: boolean;
  estimatedCost: number;
  quotaStatus: QuotaStatus[];
  warning?: string;
  fallback?: FallbackAction;
}

export interface PostCallParams {
  lock: ConnectLock;
  result: ConnectResult;
  estimatedCost?: number;
}

export interface PostCallResult {
  actualCost: number;
  quotaUpdates: QuotaStatus[];
  alerts: BillingAlert[];
}

// --- Fallback ---

export type FallbackStrategy = 'reject' | 'downgrade' | 'queue' | 'notify';

export interface FallbackConfig {
  strategy: FallbackStrategy;
  downgradeTo?: string; // provider id
  notifyCallback?: (alert: BillingAlert) => void;
  queueRetryAfterMs?: number;
}

export interface FallbackAction {
  type: FallbackStrategy;
  message?: string;
  downgradeTo?: string;
  retryAfterMs?: number;
}

// --- Warnings & Alerts ---

export type WarningType = 'threshold' | 'quota_exceeded' | 'near_limit';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface BillingWarning {
  type: WarningType;
  message: string;
  quotaId: string;
  severity: AlertSeverity;
}

export interface BillingAlert {
  type: WarningType;
  message: string;
  quotaId: string;
  timestamp: string;
}

// --- BillingConfig ---

export interface PricingConfig {
  source: 'pack' | 'registry' | 'custom';
  pack?: Record<string, PricingRule>;
  registryUrl?: string;
  custom?: Record<string, PricingRule>;
}

export interface BillingConfig {
  pricing: PricingConfig;
  quotas: Quota[];
  fallback?: FallbackConfig;
  storage?: QuotaStorage;
}

// --- Quota Storage Interface ---

export interface QuotaStorage {
  getQuota(quotaId: string): Quota | undefined;
  saveQuota(quota: Quota): void;
}

// --- BillingError ---

export class BillingError extends Error {
  public readonly code: 'QUOTA_EXCEEDED' | 'PRICING_NOT_FOUND' | 'INVALID_CONFIG';

  constructor(code: 'QUOTA_EXCEEDED' | 'PRICING_NOT_FOUND' | 'INVALID_CONFIG', message: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

// --- Billing Connector Wrapper Types ---

/**
 * Billing metadata attached to every connector response.
 * Addresses WRAPPER-05: Billing metadata envelope.
 */
export interface BillingResult {
  /** Total number of API calls made in this session */
  callCount: number;
  /** Remaining quota per quotaId (e.g., {"cost-quota": 87.5, "request-quota": 958}) */
  remainingQuota: Record<string, number>;
  /** Pre-call estimated cost in USD */
  estimatedCost: number;
  /** Post-call actual cost in USD from usage */
  actualCost: number;
  /** Status of all quotas after the call */
  quotaStatuses: Array<{
    quotaId: string;
    remaining: number;
    limit: number;
    isExceeded: boolean;
    isNearThreshold: boolean;
  }>;
  /** Warning message if near threshold */
  warning?: string;
}

/**
 * Error handling strategy for billing failures.
 * Addresses WRAPPER-04: Graceful degradation.
 */
export type BillingOnError = 'warn' | 'reject' | 'downgrade' | 'notify';

/**
 * Configuration for createBillingConnector().
 * Addresses WRAPPER-01: Wrapper factory config.
 */
export interface BillingConnectorConfig {
  /** Pricing rules keyed by feature_id */
  pricing: Record<string, PricingRule>;
  /** Quota definitions */
  quotas: Quota[];
  /** Error handling strategy (default: 'warn') */
  onError?: BillingOnError;
  /** Provider ID used for FileQuotaStorage file path */
  providerId: string;
}
