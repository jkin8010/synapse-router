import type { ConnectParams, ConnectResult } from "@synapse-router/connector";
import { Billing } from "./billing.js";
import { FileQuotaStorage } from "./file-storage.js";
import { BillingError, type BillingResult, type BillingOnError, type BillingConnectorConfig } from "./types.js";

export type BillingAwareConnectResult = ConnectResult & { billing: BillingResult };

function handleBillingError(
  onError: BillingOnError | undefined,
  error: unknown,
): boolean {
  const strategy = onError ?? "warn";
  const message = error instanceof Error ? error.message : String(error);

  switch (strategy) {
    case "reject":
      return true; // re-throw, blocks the connector call
    case "notify":
      // notify callback would be wired via config in future; for now fall through to warn
    case "downgrade":
    case "warn":
    default:
      console.warn(`[synapse-billing] ${strategy}: ${message}`);
      return false; // suppress error, continue with connector call
  }
}

export function createBillingConnector(
  connector: (params: ConnectParams) => Promise<ConnectResult>,
  config: BillingConnectorConfig,
): (params: ConnectParams) => Promise<BillingAwareConnectResult> {
  const billing = new Billing({
    pricing: { source: "custom", custom: config.pricing },
    quotas: config.quotas,
    storage: new FileQuotaStorage(config.providerId),
    fallback: config.onError === "reject"
      ? { strategy: "reject" }
      : undefined,
  });

  let callCount = 0;

  return async (params: ConnectParams): Promise<BillingAwareConnectResult> => {
    // Initialize billing result with defaults
    const billingResult: BillingResult = {
      callCount: 0,
      remainingQuota: {},
      estimatedCost: 0,
      actualCost: 0,
      quotaStatuses: [],
    };

    // STEP 1: PRE-CALL (quota check + cost estimation)
    try {
      const pre = await billing.preCall({
        lock: params.lock,
        estimatedInputTokens: 1000,
      });
      billingResult.estimatedCost = pre.estimatedCost;
      billingResult.warning = pre.warning;

      if (!pre.allowed && config.onError === "reject") {
        throw new BillingError(
          "QUOTA_EXCEEDED",
          `Quota exceeded for ${params.lock.feature_id}`,
        );
      }
    } catch (err) {
      if (handleBillingError(config.onError, err)) {
        throw err; // re-throw for "reject" strategy
      }
      // for warn/downgrade/notify: continue to connector call
    }

    // STEP 2: EXECUTE CONNECTOR (unmodified, always runs)
    const result = await connector(params);

    // STEP 3: POST-CALL (usage recording + quota consumption)
    try {
      const post = await billing.postCall({
        lock: params.lock,
        result: result,
      });
      billingResult.actualCost = post.actualCost;
      billingResult.quotaStatuses = post.quotaUpdates.map((s) => ({
        quotaId: s.quota.id,
        remaining: s.remaining,
        limit: s.quota.limit,
        isExceeded: s.isExceeded,
        isNearThreshold: s.isNearThreshold,
      }));
      callCount++;
      billingResult.callCount = callCount;

      // Derive remainingQuota from all quotas
      billing.getAllQuotas().forEach((s) => {
        billingResult.remainingQuota[s.quota.id] = s.remaining;
      });

      // Surface new alerts as warning if no prior warning
      if (!billingResult.warning && post.alerts.length > 0) {
        billingResult.warning = post.alerts[0].message;
      }
    } catch (err) {
      if (handleBillingError(config.onError, err)) {
        throw err;
      }
      // for warn/downgrade/notify: result already returned, just without billing metadata
    }

    // STEP 4: RETURN enriched result
    return { ...result, billing: billingResult };
  };
}
