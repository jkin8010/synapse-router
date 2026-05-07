import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Schema } from "@synapse-router/core";
import type { ManifestConstraint } from "./types.js";
import { runMockTest } from "./verifier.js";

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
