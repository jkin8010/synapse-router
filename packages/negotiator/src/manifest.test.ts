import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Schema } from "@synapse-router/core";
import type { ManifestConstraint } from "./types.js";
import {
  matchManifest,
  buildSuggestions,
  loadManifestFromPack,
} from "./manifest.js";

// ─── Test helpers ────────────────────────────────────────────────────────

function makeSchema(overrides: Partial<Schema> = {}): Schema {
  return {
    name: "test-schema",
    fields: [
      { name: "model", type: "string", required: true },
      { name: "prompt", type: "string", required: true },
      { name: "temperature", type: "number", required: false },
      { name: "max_tokens", type: "number", required: false },
    ],
    ...overrides,
  };
}

function makeConstraints(
  overrides: Partial<ManifestConstraint> = {}
): ManifestConstraint {
  return {
    required: ["model", "prompt"],
    type: {
      model: "string",
      prompt: "string",
      temperature: "number",
      max_tokens: "number",
    },
    ...overrides,
  };
}

// ─── matchManifest tests ─────────────────────────────────────────────────

describe("matchManifest", () => {
  it("should return valid=true when schema fully matches constraints", () => {
    const schema = makeSchema();
    const constraints = makeConstraints();
    const result = matchManifest(schema, constraints);

    assert.equal(result.valid, true);
    assert.deepStrictEqual(result.missing, []);
    assert.deepStrictEqual(result.extra, []);
    assert.deepStrictEqual(result.type_mismatch, []);
  });

  it("should return valid=false when required fields are missing or not required", () => {
    const schema = makeSchema({
      fields: [
        { name: "prompt", type: "string", required: true },
        // model is missing entirely
        { name: "temperature", type: "number", required: false },
      ],
    });
    const constraints = makeConstraints({
      required: ["model", "prompt", "max_tokens"],
    });
    const result = matchManifest(schema, constraints);

    assert.equal(result.valid, false);
    assert.deepStrictEqual(result.missing, ["model", "max_tokens"]);
  });

  it("should detect type mismatches", () => {
    const schema = makeSchema({
      fields: [
        { name: "model", type: "string", required: true },
        { name: "prompt", type: "number", required: true }, // wrong type
        { name: "temperature", type: "string", required: false }, // wrong type
      ],
    });
    const constraints = makeConstraints({
      required: ["model", "prompt"],
      type: {
        model: "string",
        prompt: "string",
        temperature: "number",
      },
    });
    const result = matchManifest(schema, constraints);

    assert.equal(result.valid, false);
    assert.equal(result.type_mismatch.length, 2);
    assert.deepStrictEqual(result.type_mismatch[0], {
      field: "prompt",
      expected: "string",
      actual: "number",
    });
    assert.deepStrictEqual(result.type_mismatch[1], {
      field: "temperature",
      expected: "number",
      actual: "string",
    });
  });

  it("should detect extra fields in schema not declared in manifest", () => {
    const schema = makeSchema({
      fields: [
        { name: "model", type: "string", required: true },
        { name: "custom_extra", type: "string", required: false },
        { name: "another_extra", type: "number", required: false },
      ],
    });
    const constraints = makeConstraints({
      required: ["model"],
      type: { model: "string" },
    });
    const result = matchManifest(schema, constraints);

    // extra fields do NOT affect validity
    assert.equal(result.valid, true);
    assert.deepStrictEqual(result.missing, []);
    assert.deepStrictEqual(result.type_mismatch, []);
    assert.deepStrictEqual(result.extra, ["custom_extra", "another_extra"]);
  });

  it("should return valid=true for empty constraints", () => {
    const schema = makeSchema();
    const constraints: ManifestConstraint = {};
    const result = matchManifest(schema, constraints);

    assert.equal(result.valid, true);
    assert.deepStrictEqual(result.missing, []);
    assert.deepStrictEqual(result.extra, [
      "model",
      "prompt",
      "temperature",
      "max_tokens",
    ]);
    assert.deepStrictEqual(result.type_mismatch, []);
  });

  it("should mark field as missing when required field is not marked required in schema", () => {
    const schema = makeSchema({
      fields: [
        { name: "model", type: "string", required: false }, // exists but not required
        { name: "prompt", type: "string", required: true },
      ],
    });
    const constraints = makeConstraints({
      required: ["model", "prompt"],
      type: { model: "string", prompt: "string" },
    });
    const result = matchManifest(schema, constraints);

    assert.equal(result.valid, false);
    assert.deepStrictEqual(result.missing, ["model"]);
    assert.deepStrictEqual(result.type_mismatch, []);
  });
});

// ─── buildSuggestions tests ──────────────────────────────────────────────

describe("buildSuggestions", () => {
  it("should generate suggestions for missing fields", () => {
    const result: Parameters<typeof buildSuggestions>[0] = {
      valid: false,
      missing: ["model", "prompt"],
      extra: [],
      type_mismatch: [],
    };
    const suggestions = buildSuggestions(result);

    assert.equal(suggestions.length, 1);
    assert.ok(suggestions[0].includes("Add required fields:"));
    assert.ok(suggestions[0].includes("model"));
    assert.ok(suggestions[0].includes("prompt"));
  });

  it("should generate suggestions for type mismatches", () => {
    const result: Parameters<typeof buildSuggestions>[0] = {
      valid: false,
      missing: [],
      extra: [],
      type_mismatch: [
        { field: "temperature", expected: "number", actual: "string" },
        { field: "max_tokens", expected: "number", actual: "boolean" },
      ],
    };
    const suggestions = buildSuggestions(result);

    assert.equal(suggestions.length, 2);
    assert.ok(suggestions[0].includes("temperature"));
    assert.ok(suggestions[0].includes("string"));
    assert.ok(suggestions[0].includes("number"));
    assert.ok(suggestions[1].includes("max_tokens"));
    assert.ok(suggestions[1].includes("boolean"));
  });

  it("should generate suggestions for extra fields", () => {
    const result: Parameters<typeof buildSuggestions>[0] = {
      valid: true,
      missing: [],
      extra: ["custom_field", "legacy_param"],
      type_mismatch: [],
    };
    const suggestions = buildSuggestions(result);

    assert.equal(suggestions.length, 1);
    assert.ok(suggestions[0].includes("Remove extra fields:"));
    assert.ok(suggestions[0].includes("custom_field"));
    assert.ok(suggestions[0].includes("legacy_param"));
  });

  it("should combine all suggestion types", () => {
    const result: Parameters<typeof buildSuggestions>[0] = {
      valid: false,
      missing: ["model"],
      extra: ["legacy"],
      type_mismatch: [
        { field: "prompt", expected: "string", actual: "number" },
      ],
    };
    const suggestions = buildSuggestions(result);

    assert.equal(suggestions.length, 3);
    assert.ok(suggestions[0].includes("Add required fields"));
    assert.ok(suggestions[1].includes("Change field"));
    assert.ok(suggestions[2].includes("Remove extra fields"));
  });
});

// ─── loadManifestFromPack tests ──────────────────────────────────────────

describe("loadManifestFromPack", () => {
  it("should extract constraints from pack DSL files", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "synapse-test-"));
    const dslDir = join(tmpDir, "dsl");

    try {
      await mkdir(dslDir, { recursive: true });

      const dslContent = {
        features: [
          {
            feature_id: "test_feature",
            constraints: {
              required: ["input", "output"],
              type: { input: "string", output: "string" },
            },
          },
        ],
      };

      await writeFile(
        join(dslDir, "test_feature.json"),
        JSON.stringify(dslContent),
        "utf8"
      );

      const constraints = await loadManifestFromPack(tmpDir);

      assert.equal(constraints.length, 1);
      assert.deepStrictEqual(constraints[0].required, ["input", "output"]);
      assert.deepStrictEqual(constraints[0].type, {
        input: "string",
        output: "string",
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should return empty array when DSL directory does not exist", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "synapse-test-"));
    try {
      const constraints = await loadManifestFromPack(tmpDir);
      assert.deepStrictEqual(constraints, []);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("should skip features without constraints", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "synapse-test-"));
    const dslDir = join(tmpDir, "dsl");

    try {
      await mkdir(dslDir, { recursive: true });

      const withConstraints = {
        features: [
          {
            feature_id: "has_constraints",
            constraints: { required: ["field_a"] },
          },
        ],
      };
      const withoutConstraints = {
        features: [
          {
            feature_id: "no_constraints",
          },
        ],
      };

      await writeFile(
        join(dslDir, "with.json"),
        JSON.stringify(withConstraints),
        "utf8"
      );
      await writeFile(
        join(dslDir, "without.json"),
        JSON.stringify(withoutConstraints),
        "utf8"
      );

      const constraints = await loadManifestFromPack(tmpDir);

      assert.equal(constraints.length, 1);
      assert.deepStrictEqual(constraints[0].required, ["field_a"]);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
