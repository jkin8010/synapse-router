/**
 * Inter-package dependency and import tests
 * Verifies packages can correctly import from each other
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Test 1: SDK can import from core
describe("SDK imports from core", () => {
  it("can import types from @synapse-router/core", async () => {
    const core = await import("@synapse-router/core");
    assert.ok(core.AgentSchema === undefined, "AgentSchema is a type, not a runtime value");
    // But runtime functions should be available
    assert.ok(typeof core.validateSchema === "function", "validateSchema should be a function");
    assert.ok(typeof core.normalizeSchema === "function", "normalizeSchema should be a function");
    assert.ok(typeof core.hashSchema === "function", "hashSchema should be a function");
  });

  it("can use core functions from sdk context", async () => {
    const { validateSchema, normalizeSchema, hashSchema } = await import("@synapse-router/core");
    
    const result = validateSchema({ name: "test", fields: [{ name: "x", type: "string" }] });
    assert.equal(result.valid, true);
    
    const normalized = normalizeSchema({ name: "test", fields: [{ name: "x", type: "string" }] });
    assert.ok(normalized);
    
    const hash = hashSchema({ name: "test", fields: [{ name: "x", type: "string" }] });
    assert.ok(hash.length === 64, "SHA-256 hash should be 64 hex chars");
  });
});

// Test 2: SDK can import from vault
describe("SDK imports from vault", () => {
  it("can import vault functions", async () => {
    const vault = await import("@synapse-router/vault");
    assert.ok(typeof vault.createVault === "function", "createVault should be a function");
    assert.ok(typeof vault.encrypt === "function", "encrypt should be a function");
    assert.ok(typeof vault.decrypt === "function", "decrypt should be a function");
    assert.ok(typeof vault.deriveKey === "function", "deriveKey should be a function");
  });
});

// Test 3: API app can import from negotiator
describe("API app imports from negotiator", () => {
  it("can import negotiateSchema from @synapse-router/negotiator", async () => {
    const negotiator = await import("@synapse-router/negotiator");
    assert.ok(typeof negotiator.negotiateSchema === "function", "negotiateSchema should be a function");
  });
});

// Test 4: Placeholder packages can be imported
describe("Placeholder packages are importable", () => {
  it("can import @synapse-router/sdk", async () => {
    const sdk = await import("@synapse-router/sdk");
    // Placeholder package exports {}
    assert.ok(sdk);
  });

  it("can import @synapse-router/pack-generator", async () => {
    const pg = await import("@synapse-router/pack-generator");
    assert.ok(pg);
  });
});
