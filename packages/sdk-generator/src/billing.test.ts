// @synapse-router/sdk-generator — BillingTracker generation tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateBillingTracker, generatePricingSnapshot } from "./billing.js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderCard } from "@synapse-router/core";
import type { PackData } from "./generator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const projectRoot = new URL(import.meta.url).pathname
  .replace(/\/packages\/sdk-generator\/.*/, "");

const OPENAI_PACK = join(projectRoot, "packs", "openai");

async function loadPackData(
  packDir: string,
  providerOverride?: string,
  baseUrlOverride?: string
): Promise<PackData> {
  const cardPath = join(packDir, "provider-card.json");
  const content = await readFile(cardPath, "utf8");
  const providerCard = JSON.parse(content) as ProviderCard;

  const dslDir = join(packDir, "dsl");
  let dslDocuments: any[] = [];
  try {
    const entries = await readdir(dslDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const dslContent = await readFile(join(dslDir, entry), "utf8");
      dslDocuments.push(JSON.parse(dslContent));
    }
  } catch {
    // No DSL dir
  }

  const providerId = providerOverride ?? providerCard.provider.id;
  const providerName = providerOverride
    ? providerOverride.charAt(0).toUpperCase() + providerOverride.slice(1)
    : providerCard.provider.name;
  const baseUrl = baseUrlOverride ?? providerCard.service.base_url;
  const providerUrl = providerCard.provider?.base_url;
  const serviceUrl = providerCard.service.base_url;
  const defaultEndpoint = providerUrl && serviceUrl && providerUrl.startsWith(serviceUrl)
    ? providerUrl.slice(serviceUrl.length)
    : "";

  return {
    providerCard,
    dslDocuments,
    providerId,
    providerName,
    baseUrl,
    authType: providerCard.service.auth_type,
    defaultEndpoint,
  };
}

// ---------------------------------------------------------------------------
// generateBillingTracker tests
// ---------------------------------------------------------------------------

describe("generateBillingTracker", () => {
  it("returns GeneratedFile with correct path", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.equal(file.path, ".synapse/billing/tracker.ts");
  });

  it("generated content contains BillingTracker class", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.match(file.content, /class BillingTracker/);
  });

  it("generated content contains record method with correct signature", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.match(file.content, /record\(featureId/);
  });

  it("generated content contains getUsage method", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.match(file.content, /getUsage\(\)/);
  });

  it("generated content contains reset method", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.match(file.content, /reset\(\)/);
  });

  it("generated content has zero @synapse-router imports", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.doesNotMatch(file.content, /import.*@synapse-router/);
  });

  it("generated content has zero require() calls", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.doesNotMatch(file.content, /require\(/);
  });

  it("inlines openai chat pricing constants", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const file = generateBillingTracker(packData);
    assert.match(file.content, /0\.0015/);
    assert.match(file.content, /0\.002/);
  });
});

// ---------------------------------------------------------------------------
// generatePricingSnapshot tests
// ---------------------------------------------------------------------------

describe("generatePricingSnapshot", () => {
  it("returns valid JSON file with correct path", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const snapshot = generatePricingSnapshot(packData);
    assert.equal(snapshot.path, ".synapse/billing/pricing.json");
    assert.doesNotThrow(() => JSON.parse(snapshot.content));
  });

  it("pricing snapshot contains provider and pricing keys", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const snapshot = generatePricingSnapshot(packData);
    const parsed = JSON.parse(snapshot.content);
    assert.ok(parsed.provider, "should have provider key");
    assert.ok(parsed.pricing, "should have pricing key");
    assert.ok(parsed.generatedAt, "should have generatedAt");
  });
});
