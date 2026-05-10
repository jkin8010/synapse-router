import { describe, it } from "node:test";
import assert from "node:assert";
import { pricingFromProviderCard } from "./pricing-bridge.js";

describe("pricingFromProviderCard", () => {
  it("returns flat zero pricing when pricing is undefined", () => {
    const result = pricingFromProviderCard(undefined);
    assert.strictEqual(result.strategy, "flat");
    assert.strictEqual(result.costPerCall, 0);
  });

  it("converts per-token pricing from OpenAI card format", () => {
    const result = pricingFromProviderCard({
      input: 0.0015,
      output: 0.002,
      unit: "1k tokens",
    });
    assert.strictEqual(result.strategy, "perToken");
    assert.strictEqual(result.inputPrice, 0.0015);
    assert.strictEqual(result.outputPrice, 0.002);
    assert.strictEqual(result.unit, "1k tokens");
  });

  it("converts per-unit pricing from Stability card format", () => {
    const result = pricingFromProviderCard({
      input: 0.0,
      output: 0.04,
      unit: "per image",
    });
    assert.strictEqual(result.strategy, "perUnit");
    assert.strictEqual(result.unitPrice, 0.04);
    assert.strictEqual(result.unit, "per image");
  });

  it("handles per-token pricing with M tokens unit", () => {
    const result = pricingFromProviderCard({
      input: 3.0,
      output: 15.0,
      unit: "1M tokens",
    });
    assert.strictEqual(result.strategy, "perToken");
    assert.strictEqual(result.inputPrice, 3.0);
    assert.strictEqual(result.outputPrice, 15.0);
  });

  it("handles empty object with default flat zero pricing", () => {
    const result = pricingFromProviderCard({});
    assert.strictEqual(result.strategy, "flat");
    assert.strictEqual(result.costPerCall, 0);
  });

  it("returns flat pricing for per call unit", () => {
    const result = pricingFromProviderCard({
      input: 0.05,
      output: 0.0,
      unit: "per call",
    });
    assert.strictEqual(result.strategy, "flat");
    assert.strictEqual(result.costPerCall, 0.05);
  });

  it("returns flat pricing for per request unit", () => {
    const result = pricingFromProviderCard({
      input: 0,
      output: 0.03,
      unit: "per request",
    });
    assert.strictEqual(result.strategy, "flat");
    assert.strictEqual(result.costPerCall, 0.03);
  });

  it("handles missing input field with default 0", () => {
    const result = pricingFromProviderCard({
      output: 0.04,
      unit: "per image",
    });
    assert.strictEqual(result.strategy, "perUnit");
    assert.strictEqual(result.unitPrice, 0.04);
  });

  it("handles unrecognized unit as flat pricing", () => {
    const result = pricingFromProviderCard({
      input: 0.01,
      output: 0.02,
      unit: "per potato",
    });
    assert.strictEqual(result.strategy, "flat");
    assert.strictEqual(result.costPerCall, 0.03);
  });
});
