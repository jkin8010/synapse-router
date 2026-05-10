import { describe, it } from "node:test";
import assert from "node:assert";
import { createBillingConnector } from "./wrapper.js";
import type { ConnectParams, ConnectResult } from "@synapse-router/connector";
import type { PricingRule, Quota, BillingConnectorConfig, BillingResult } from "./types.js";

// --- Test Fixtures ---

function makeParams(overrides: Partial<ConnectParams> = {}): ConnectParams {
  return {
    lock: {
      intent: "generate",
      provider: "openai",
      feature_id: "text-generation",
      input_schema: { fields: [{ name: "prompt", type: "string", required: true }] },
      output_schema: { fields: [{ name: "text", type: "string" }] },
      field_mappings: [],
    },
    input: { prompt: "Hello" },
    connection: { base_url: "https://api.openai.com", api_key: "sk-test", auth_type: "Bearer" },
    ...overrides,
  } as ConnectParams;
}

function makeResult(overrides: Partial<ConnectResult> = {}): ConnectResult {
  return {
    output: { text: "Hello world" },
    raw: {},
    meta: {
      provider: "openai",
      feature_id: "text-generation",
      model: "gpt-4",
      usage: { input_tokens: 500, output_tokens: 200 },
      latency_ms: 1200,
    },
    ...overrides,
  } as ConnectResult;
}

function makeConfig(overrides: Partial<BillingConnectorConfig> = {}): BillingConnectorConfig {
  // Use unique providerId per test to avoid file collision between parallel tests
  return {
    providerId: "test-provider-" + Math.random().toString(36).slice(2, 8),
    pricing: {
      "text-generation": {
        strategy: "perToken",
        unit: "1k tokens",
        inputPrice: 0.01,
        outputPrice: 0.03,
      },
    },
    quotas: [
      { id: "cost-quota", type: "cost", limit: 100, used: 0, period: "oneTime", threshold: 0.8 },
    ],
    onError: "warn",
    ...overrides,
  };
}

// --- Tests ---

describe("createBillingConnector", () => {
  describe("happy path", () => {
    it("returns connector result with billing field attached", async () => {
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());
      const result = await wrapper(makeParams());

      assert.strictEqual(result.output.text, "Hello world");
      assert.ok(result.billing);
      assert.strictEqual(typeof result.billing, "object");
      assert.strictEqual(result.billing.callCount, 1);
      assert.strictEqual(typeof result.billing.estimatedCost, "number");
      assert.strictEqual(typeof result.billing.actualCost, "number");
      assert.ok(result.billing.remainingQuota !== null && typeof result.billing.remainingQuota === "object");
      assert.ok(Array.isArray(result.billing.quotaStatuses));
    });

    it("increments callCount across multiple calls", async () => {
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());

      await wrapper(makeParams());
      await wrapper(makeParams());
      const result = await wrapper(makeParams());

      assert.strictEqual(result.billing.callCount, 3);
    });

    it("calls the original connector function", async () => {
      let called = false;
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        called = true;
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());
      await wrapper(makeParams());

      assert.strictEqual(called, true);
    });
  });

  describe("graceful error handling (WRAPPER-04)", () => {
    it("logs warning but does not block connector when pricing is missing (default onError='warn')", async () => {
      // Create config with NO pricing for the feature_id
      const config = makeConfig({ pricing: {} });
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, config);

      // Should NOT throw
      const result = await wrapper(makeParams());

      // Connector was called
      assert.ok(result.output);
      assert.strictEqual(result.output.text, "Hello world");
      // Billing envelope exists (zeroed)
      assert.ok(result.billing);
    });

    it("blocks connector call when onError is 'reject' and pricing is missing", async () => {
      const config = makeConfig({ pricing: {}, onError: "reject" });
      let connectorCalled = false;
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        connectorCalled = true;
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, config);

      await assert.rejects(
        () => wrapper(makeParams()),
        { name: "BillingError" },
      );

      // Connector should never be called (preCall throws before connector)
      assert.strictEqual(connectorCalled, false);
    });

    it("blocks connector call when onError is 'reject' and quota is exceeded", async () => {
      const config = makeConfig({
        quotas: [{ id: "cost-quota", type: "cost", limit: 1, used: 100, period: "oneTime", threshold: 0.8 }],
        onError: "reject",
      });
      let connectorCalled = false;
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        connectorCalled = true;
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, config);

      await assert.rejects(
        () => wrapper(makeParams()),
      );

      assert.strictEqual(connectorCalled, false);
    });

    it("continues connector call when onError is 'downgrade' and quota is exceeded", async () => {
      const config = makeConfig({
        quotas: [{ id: "cost-quota", type: "cost", limit: 1, used: 100, period: "oneTime", threshold: 0.8 }],
        onError: "downgrade",
      });
      let connectorCalled = false;
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        connectorCalled = true;
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, config);

      // Should NOT throw
      const result = await wrapper(makeParams());

      assert.strictEqual(connectorCalled, true);
      assert.ok(result.output);
    });
  });

  describe("BillingResult envelope (WRAPPER-05)", () => {
    it("returns remainingQuota as Record<string, number> with expected keys", async () => {
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());
      const result = await wrapper(makeParams());

      assert.ok(typeof result.billing.remainingQuota === "object");
      assert.ok(result.billing.remainingQuota !== null);
      assert.strictEqual(typeof result.billing.remainingQuota["cost-quota"], "number");
    });

    it("returns quotaStatuses with correct shape", async () => {
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());
      const result = await wrapper(makeParams());

      assert.ok(Array.isArray(result.billing.quotaStatuses));
      assert.ok(result.billing.quotaStatuses.length > 0);

      for (const status of result.billing.quotaStatuses) {
        assert.strictEqual(typeof status.quotaId, "string");
        assert.strictEqual(typeof status.remaining, "number");
        assert.strictEqual(typeof status.limit, "number");
        assert.strictEqual(typeof status.isExceeded, "boolean");
        assert.strictEqual(typeof status.isNearThreshold, "boolean");
      }
    });

    it("returns estimatedCost greater than 0 for per-token pricing with non-zero inputPrice", async () => {
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());
      const result = await wrapper(makeParams());

      assert.ok(result.billing.estimatedCost > 0);
    });

    it("returns actualCost >= 0 after successful call", async () => {
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, makeConfig());
      const result = await wrapper(makeParams());

      assert.ok(result.billing.actualCost >= 0);
      assert.strictEqual(typeof result.billing.actualCost, "number");
    });
  });

  describe("error isolation", () => {
    it("does not lose connector result when postCall has error but onError is 'warn'", async () => {
      // Missing pricing causes both preCall and postCall to throw,
      // but the connector runs and the result is preserved
      const config = makeConfig({ pricing: {} });
      const mockConnector = async (_params: ConnectParams): Promise<ConnectResult> => {
        return makeResult();
      };
      const wrapper = createBillingConnector(mockConnector, config);
      const result = await wrapper(makeParams());

      // Connector output is preserved even when billing has issues
      assert.ok(result.output);
      assert.strictEqual(result.output.text, "Hello world");
    });
  });
});
