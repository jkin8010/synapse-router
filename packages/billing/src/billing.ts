/**
 * Main Billing class - orchestrates pre-call and post-call billing flows
 */
import {
  BillingConfig,
  PreCallParams,
  PreCallResult,
  PostCallParams,
  PostCallResult,
  QuotaStatus,
  BillingAlert,
  PricingRule,
  BillingError,
  FallbackAction,
} from './types.js';
import { QuotaManager } from './quota.js';
import { StrategyRegistry } from './strategies/index.js';
import { evaluateFallback, getThresholdWarning } from './fallback.js';
import { getFeaturePricing, getFeatureLimits, autoQuotasFromLimits } from './utils.js';

export class Billing {
  private config: BillingConfig;
  private quotaManager: QuotaManager;
  private registry: StrategyRegistry;

  constructor(config: BillingConfig) {
    this.config = config;
    this.registry = new StrategyRegistry();

    // Auto-generate quotas from limits if pack is available
    let quotas = [...config.quotas];
    if (config.pricing.source === 'pack' && config.pricing.pack) {
      for (const [featureId, rule] of Object.entries(config.pricing.pack)) {
        const limits = getFeatureLimits(config.pricing.pack, featureId);
        const autoQuotas = autoQuotasFromLimits(limits, 'minute');
        // Only add quotas that don't already exist
        for (const aq of autoQuotas) {
          if (!quotas.some((q) => q.id === aq.id)) {
            quotas.push(aq);
          }
        }
      }
    }

    this.quotaManager = new QuotaManager(quotas, config.storage);
  }

  /**
   * Pre-call billing check
   * - Lookup pricing rule
   * - Estimate cost
   * - Check quotas
   * - Evaluate fallback if needed
   */
  async preCall(params: PreCallParams): Promise<PreCallResult> {
    const featureId = params.lock.feature_id;
    const rule = this.lookupPricingRule(featureId);

    if (!rule) {
      throw new BillingError(
        'PRICING_NOT_FOUND',
        `No pricing rule found for feature: ${featureId}`,
      );
    }

    // Estimate cost
    const strategy = this.registry.getByRule(rule);
    if (!strategy) {
      throw new BillingError(
        'INVALID_CONFIG',
        `Unknown pricing strategy: ${rule.strategy}`,
      );
    }

    const estimatedCost = strategy.estimate(
      {
        estimatedInputTokens: params.estimatedInputTokens,
        estimatedQuantity: params.estimatedQuantity,
      },
      rule,
    );

    // Check all quotas
    const allStatuses = this.quotaManager.getAllStatuses();

    // Check if estimated cost would exceed cost quota
    const costStatus = this.checkQuotaForType('cost', estimatedCost);

    // Check if estimated tokens would exceed token quota
    const tokenStatus = params.estimatedInputTokens
      ? this.checkQuotaForType('tokens', params.estimatedInputTokens)
      : null;

    // Check request quota
    const requestStatus = this.checkQuotaForType('requests', 1);

    // Collect all relevant statuses
    const relevantStatuses: QuotaStatus[] = [];
    if (costStatus) relevantStatuses.push(costStatus);
    if (tokenStatus) relevantStatuses.push(tokenStatus);
    if (requestStatus) relevantStatuses.push(requestStatus);

    // Merge with all statuses for complete picture
    const quotaStatus = this.mergeStatuses(allStatuses, relevantStatuses);

    // Check for exceeded quotas
    const exceeded = quotaStatus.some((s) => s.isExceeded);
    let warning: string | undefined;
    let fallback: FallbackAction | undefined;

    if (exceeded) {
      const fb = evaluateFallback(quotaStatus, this.config.fallback);
      if (fb) {
        fallback = fb;
      }
    }

    // Check threshold warnings
    const thresholdWarning = getThresholdWarning(quotaStatus);
    if (thresholdWarning && !exceeded) {
      warning = thresholdWarning.message;
    }

    return {
      allowed: !exceeded || this.config.fallback?.strategy === 'notify',
      estimatedCost,
      quotaStatus: quotaStatus,
      warning,
      fallback,
    };
  }

  /**
   * Post-call billing
   * - Calculate actual cost
   * - Consume quotas
   * - Check alerts
   */
  async postCall(params: PostCallParams): Promise<PostCallResult> {
    const featureId = params.lock.feature_id;
    const rule = this.lookupPricingRule(featureId);

    if (!rule) {
      throw new BillingError(
        'PRICING_NOT_FOUND',
        `No pricing rule found for feature: ${featureId}`,
      );
    }

    const strategy = this.registry.getByRule(rule);
    if (!strategy) {
      throw new BillingError(
        'INVALID_CONFIG',
        `Unknown pricing strategy: ${rule.strategy}`,
      );
    }

    // Calculate actual cost
    const usage = params.result.meta.usage;
    const actualCost = strategy.calculate(
      params.result.output,
      rule,
      usage,
    );

    // Consume quotas
    const quotaUpdates: QuotaStatus[] = [];
    const alerts: BillingAlert[] = [];

    // Consume cost quota
    const costUpdate = this.quotaManager.consume('cost', actualCost);
    if (costUpdate) {
      quotaUpdates.push(costUpdate);
      if (costUpdate.isNearThreshold || costUpdate.isExceeded) {
        alerts.push(this.createAlert(costUpdate));
      }
    }

    // Consume token quota
    if (usage) {
      const totalTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      const tokenUpdate = this.quotaManager.consume('tokens', totalTokens);
      if (tokenUpdate) {
        quotaUpdates.push(tokenUpdate);
        if (tokenUpdate.isNearThreshold || tokenUpdate.isExceeded) {
          alerts.push(this.createAlert(tokenUpdate));
        }
      }
    }

    // Consume request quota
    const requestUpdate = this.quotaManager.consume('requests', 1);
    if (requestUpdate) {
      quotaUpdates.push(requestUpdate);
      if (requestUpdate.isNearThreshold || requestUpdate.isExceeded) {
        alerts.push(this.createAlert(requestUpdate));
      }
    }

    return {
      actualCost,
      quotaUpdates,
      alerts,
    };
  }

  /**
   * Get status of a specific quota
   */
  getQuota(quotaId: string): QuotaStatus | undefined {
    return this.quotaManager.getStatusById(quotaId);
  }

  /**
   * Get all quota statuses
   */
  getAllQuotas(): QuotaStatus[] {
    return this.quotaManager.getAllStatuses();
  }

  /**
   * Reset a specific quota
   */
  resetQuota(quotaId: string): boolean {
    return this.quotaManager.reset(quotaId);
  }

  /**
   * Register a custom billing strategy
   */
  registerStrategy(name: string, strategy: import('./strategies/base.js').BillingStrategy): void {
    this.registry.register(name, strategy);
  }

  // --- Private helpers ---

  private lookupPricingRule(featureId: string): PricingRule | null {
    const { pricing } = this.config;

    switch (pricing.source) {
      case 'pack':
        return getFeaturePricing(pricing.pack, featureId);
      case 'custom':
        return getFeaturePricing(pricing.custom, featureId);
      case 'registry':
        // Registry lookup would require network call; for now, treat as custom
        if (pricing.custom) {
          return getFeaturePricing(pricing.custom, featureId);
        }
        return null;
      default:
        return null;
    }
  }

  private checkQuotaForType(
    type: 'cost' | 'tokens' | 'requests',
    amount: number,
  ): QuotaStatus | undefined {
    const allStatuses = this.quotaManager.getAllStatuses();
    const status = allStatuses.find((s) => s.quota.type === type);
    if (!status) return undefined;

    // Simulate check without consuming
    const projectedUsed = status.quota.used + amount;
    const projectedPercentage =
      status.quota.limit > 0 ? projectedUsed / status.quota.limit : 0;
    const threshold = status.quota.threshold ?? 1.0;

    return {
      ...status,
      remaining: Math.max(0, status.quota.limit - projectedUsed),
      percentage: projectedPercentage,
      isExceeded: projectedUsed >= status.quota.limit,
      isNearThreshold: projectedPercentage >= threshold && projectedUsed < status.quota.limit,
    };
  }

  private mergeStatuses(
    all: QuotaStatus[],
    relevant: QuotaStatus[],
  ): QuotaStatus[] {
    // Use relevant statuses where available, fall back to all
    const relevantTypes = new Set(
      relevant.filter((s): s is QuotaStatus => !!(s && s.quota)).map((s) => s.quota.type),
    );
    const merged = [...relevant];

    for (const s of all) {
      if (s && s.quota && !relevantTypes.has(s.quota.type)) {
        merged.push(s);
      }
    }

    return merged;
  }

  private createAlert(status: QuotaStatus): BillingAlert {
    return {
      type: status.isExceeded ? 'quota_exceeded' : 'threshold',
      message: status.isExceeded
        ? `Quota exceeded: ${status.quota.id} (${Math.round(status.percentage * 100)}%)`
        : `Quota approaching limit: ${status.quota.id} (${Math.round(status.percentage * 100)}%)`,
      quotaId: status.quota.id,
      timestamp: new Date().toISOString(),
    };
  }
}
