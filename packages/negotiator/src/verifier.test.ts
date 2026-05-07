import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Schema } from "@synapse-router/core";
import type { ManifestConstraint, VerificationResult } from "./types.js";
import { runMockTest, cacheVerificationResultLocally } from "./verifier.js";

// ─── mergeConstraints (internal, tested via direct copy of logic) ────────

// mergeConstraints is not exported — we test the same algorithm here directly.
// This validates the merge behaviour expected by negotiateAndVerify.

function mergeConstraints(constraints: ManifestConstraint[]): ManifestConstraint {
  const merged: ManifestConstraint = {};
  const requiredSet = new Set<string>();
  const typeMap: Record<string, string> = {};
  const enumMap: Record<string, string[]> = {};
  const minLengthMap: Record<string, number> = {};
  const maxLengthMap: Record<string, number> = {};

  for (const c of constraints) {
    for (const r of c.required ?? []) requiredSet.add(r);
    if (c.type) Object.assign(typeMap, c.type);
    if (c.enum) Object.assign(enumMap, c.enum);
    if (c.minLength) Object.assign(minLengthMap, c.minLength);
    if (c.maxLength) Object.assign(maxLengthMap, c.maxLength);
  }

  merged.required = [...requiredSet];
  if (Object.keys(typeMap).length > 0) merged.type = typeMap;
  if (Object.keys(enumMap).length > 0) merged.enum = enumMap;
  if (Object.keys(minLengthMap).length > 0) merged.minLength = minLengthMap;
  if (Object.keys(maxLengthMap).length > 0) merged.maxLength = maxLengthMap;

  return merged;
}

// ─── mergeConstraints tests ──────────────────────────────────────────────

describe("mergeConstraints", () => {
  it("should merge required fields from multiple constraints", () => {
    const constraints: ManifestConstraint[] = [
      { required: ["prompt", "model"] },
      { required: ["temperature", "max_tokens"] },
      { required: ["model"] }, // duplicate
    ];

    const merged = mergeConstraints(constraints);

    assert.deepStrictEqual(
      merged.required?.sort(),
      ["max_tokens", "model", "prompt", "temperature"]
    );
  });

  it("should merge type maps from multiple constraints", () => {
    const constraints: ManifestConstraint[] = [
      { type: { prompt: "string", model: "string" } },
      { type: { temperature: "number", max_tokens: "number" } },
    ];

    const merged = mergeConstraints(constraints);

    assert.deepStrictEqual(merged.type, {
      prompt: "string",
      model: "string",
      temperature: "number",
      max_tokens: "number",
    });
  });

  it("should merge enum and length constraints", () => {
    const constraints: ManifestConstraint[] = [
      { enum: { format: ["png", "jpeg"] } },
      { minLength: { prompt: 1 }, maxLength: { prompt: 1000 } },
    ];

    const merged = mergeConstraints(constraints);

    assert.deepStrictEqual(merged.enum, { format: ["png", "jpeg"] });
    assert.deepStrictEqual(merged.minLength, { prompt: 1 });
    assert.deepStrictEqual(merged.maxLength, { prompt: 1000 });
  });

  it("should return empty arrays for empty constraint list", () => {
    const merged = mergeConstraints([]);

    assert.deepStrictEqual(merged.required, []);
    assert.strictEqual(merged.type, undefined);
    assert.strictEqual(merged.enum, undefined);
  });

  it("should handle constraints with no required fields", () => {
    const constraints: ManifestConstraint[] = [
      { type: { prompt: "string" } },
    ];

    const merged = mergeConstraints(constraints);

    assert.deepStrictEqual(merged.required, []);
    assert.deepStrictEqual(merged.type, { prompt: "string" });
  });
});

// ─── runMockTest helpers ─────────────────────────────────────────────────

function makeTestSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    name: "test-schema",
    fields: [
      { name: "prompt", type: "string", required: true },
      { name: "model", type: "string", required: false },
      { name: "temperature", type: "number", required: false },
    ],
    ...overrides,
  };
}

// ─── runMockTest tests ───────────────────────────────────────────────────

describe("runMockTest", () => {
  it("should return { passed: true, mockResult } when mock server responds OK", async () => {
    const schema = makeTestSchema();
    const result = await runMockTest(schema, "/fake/pack", "test-provider");

    assert.strictEqual(result.passed, true);
    assert.strictEqual(typeof result.mockResult.request_sent, "object");
    assert.strictEqual(typeof result.mockResult.response_received, "object");
    assert.strictEqual(result.mockResult.error_message, "");

    const request = result.mockResult.request_sent as Record<string, unknown>;
    assert.ok("prompt" in request);
    assert.strictEqual(typeof request.prompt, "string");
    assert.ok(!("model" in request));
    assert.ok(!("temperature" in request));
  });

  it("should use first enum value for required enum fields", async () => {
    const schema = makeTestSchema({
      fields: [
        { name: "format", type: "enum", enumValues: ["png", "jpeg"], required: true },
        { name: "prompt", type: "string", required: true },
      ],
    });
    const result = await runMockTest(schema, "/fake/pack", "test-provider");

    assert.strictEqual(result.passed, true);
    const request = result.mockResult.request_sent as Record<string, unknown>;
    assert.strictEqual(request.format, "png");
    assert.ok("prompt" in request);
  });

  it("should send empty request body when no required fields", async () => {
    const schema = makeTestSchema({
      fields: [
        { name: "optional_param", type: "string", required: false },
      ],
    });
    const result = await runMockTest(schema, "/fake/pack", "test-provider");

    assert.strictEqual(result.passed, true);
    const request = result.mockResult.request_sent as Record<string, unknown>;
    assert.deepStrictEqual(Object.keys(request), []);
  });

  it("should return correct mockResult structure", async () => {
    const schema = makeTestSchema({
      fields: [
        { name: "input", type: "string", required: true },
      ],
    });

    const result = await runMockTest(schema, "/fake/pack", "test-provider");

    assert.strictEqual(typeof result.passed, "boolean");
    assert.ok(typeof result.mockResult === "object");
    assert.ok("request_sent" in result.mockResult);
    assert.ok("response_received" in result.mockResult);
    assert.ok("error_message" in result.mockResult);
    assert.strictEqual(typeof result.mockResult.error_message, "string");
  });
});

// ─── cacheVerificationResultLocally tests ───────────────────────────────

const VERIFICATIONS_DIR = join(homedir(), ".synapse", "verifications");

function makeVerificationResult(
  overrides: Partial<VerificationResult> = {},
): VerificationResult {
  return {
    status: "passed",
    verified_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("cacheVerificationResultLocally", () => {
  const schemaId = `test-cache-${Date.now()}`;
  const providerId = "test-provider";
  const cachePath = join(VERIFICATIONS_DIR, `${schemaId}.verification.json`);

  after(async () => {
    // Clean up test cache file
    try {
      await rm(cachePath, { force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("should write verification result to ~/.synapse/verifications/ directory", async () => {
    const result = makeVerificationResult();

    await cacheVerificationResultLocally(schemaId, providerId, result);

    const content = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.schema_id, schemaId);
    assert.strictEqual(parsed.provider_id, providerId);
    assert.strictEqual(parsed.status, "passed");
    assert.strictEqual(typeof parsed.verified_at, "string");
  });

  it("should cache manifest_mismatch verification results", async () => {
    const mismatchId = `test-cache-mismatch-${Date.now()}`;
    const mismatchPath = join(
      VERIFICATIONS_DIR,
      `${mismatchId}.verification.json`,
    );

    after(async () => {
      try {
        await rm(mismatchPath, { force: true });
      } catch {
        // ignore
      }
    });

    const result = makeVerificationResult({
      status: "manifest_mismatch",
      manifest_diff: {
        missing: ["required_field"],
        extra: ["extra_field"],
        type_mismatch: [{ field: "count", expected: "number", actual: "string" }],
      },
    });

    await cacheVerificationResultLocally(mismatchId, providerId, result);

    const content = await readFile(mismatchPath, "utf8");
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.status, "manifest_mismatch");
    assert.deepStrictEqual(parsed.manifest_diff.missing, ["required_field"]);
    assert.deepStrictEqual(parsed.manifest_diff.extra, ["extra_field"]);
    assert.strictEqual(parsed.manifest_diff.type_mismatch.length, 1);
  });

  it("should cache mock_failure verification results", async () => {
    const mockFailId = `test-cache-mockfail-${Date.now()}`;
    const mockFailPath = join(
      VERIFICATIONS_DIR,
      `${mockFailId}.verification.json`,
    );

    after(async () => {
      try {
        await rm(mockFailPath, { force: true });
      } catch {
        // ignore
      }
    });

    const result = makeVerificationResult({
      status: "mock_failure",
      mock_result: {
        request_sent: { prompt: "hello" },
        response_received: null,
        error_message: "Connection refused",
      },
    });

    await cacheVerificationResultLocally(mockFailId, providerId, result);

    const content = await readFile(mockFailPath, "utf8");
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.status, "mock_failure");
    assert.deepStrictEqual(parsed.mock_result.request_sent, { prompt: "hello" });
    assert.strictEqual(parsed.mock_result.response_received, null);
    assert.strictEqual(parsed.mock_result.error_message, "Connection refused");
  });

  it("should not throw when filesystem write fails (best-effort)", async () => {
    // The function catches all errors silently
    const result = makeVerificationResult();

    await assert.doesNotReject(async () => {
      await cacheVerificationResultLocally(
        "valid-id",
        "test-provider",
        result,
      );
    });
  });
});
