/**
 * Field Negotiator Tests
 *
 * Tests the field-level negotiation engine:
 * - compareFieldMappings: Agent fields vs Provider field_mappings
 * - resolveFieldNegotiation: Comparison → accepted | adapted | rejected
 * - negotiateFeature: Full feature-level negotiation
 *
 * @module tests/field-negotiator.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Schema, Field } from "@synapse-router/core";
import type { FieldMapping } from "@synapse-router/core";
import {
  compareFieldMappings,
  resolveFieldNegotiation,
  negotiateFeature,
  type FieldComparison,
  type AgentFieldRequest,
} from "./field-negotiator.js";

// ─── Test Helpers ─────────────────────────────────────────────────────────

function makeField(name: string, type: string, required: boolean = false, overrides: Partial<Field> = {}): Field {
  return { name, type: type as any, required, ...overrides };
}

function makeSchema(fields: Field[], overrides: Partial<Schema> = {}): Schema {
  return { name: "agent-schema", fields, ...overrides };
}

function makeMapping(canonical_field: string, provider_field: string, required: boolean = false, overrides: Partial<FieldMapping> = {}): FieldMapping {
  return { canonical_field, provider_field, required, transform: "passthrough" as const, ...overrides };
}

function makeFeature(feature_id: string, intent: string, inputFields: Field[], mappings: FieldMapping[]) {
  return {
    feature_id,
    intent,
    name: `Feature: ${feature_id}`,
    description: `Test feature for ${intent}`,
    input: {
      name: `${feature_id}_input`,
      fields: inputFields,
    },
    output: {
      name: `${feature_id}_output`,
      fields: [{ name: "result", type: "string" as const }],
    },
    field_mappings: mappings,
    capabilities: [],
  };
}

// ─── compareFieldMappings Tests ───────────────────────────────────────────

describe("compareFieldMappings", () => {
  it("should return matched and renamed when agent fields exactly match mappings", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
      { name: "model", type: "string", required: true },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("prompt", "messages", true),
      makeMapping("model", "model", true),
    ];

    const result = compareFieldMappings(agentFields, mappings);

    // prompt→messages is a rename; model stays same
    assert.equal(result.matched.length, 1);
    assert.equal(result.matched[0]!.canonicalField, "model");
    assert.equal(result.renamed.length, 1);
    assert.equal(result.renamed[0]!.canonicalField, "prompt");
    assert.equal(result.renamed[0]!.providerField, "messages");
    assert.equal(result.missing.length, 0);
  });

  it("should detect field renames via canonical_field mapping", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("prompt", "messages", true),
    ];

    const result = compareFieldMappings(agentFields, mappings);

    assert.equal(result.matched.length, 0);
    assert.equal(result.renamed.length, 1);
    assert.equal(result.renamed[0]!.canonicalField, "prompt");
    assert.equal(result.renamed[0]!.providerField, "messages");
  });

  it("should report missing when agent required field has no mapping", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "style", type: "string", required: true },
      { name: "prompt", type: "string", required: true },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("prompt", "messages", true),
    ];

    const result = compareFieldMappings(agentFields, mappings);

    assert.equal(result.matched.length, 0);
    assert.equal(result.renamed.length, 1);
    assert.deepStrictEqual(
      result.missing.map((m) => m.name),
      ["style"]
    );
  });

  it("should treat optional fields without mapping as missing-but-not-fatal", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
      { name: "user", type: "string", required: false },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("prompt", "messages", true),
    ];

    const result = compareFieldMappings(agentFields, mappings);

    assert.equal(result.renamed.length, 1);
    assert.deepStrictEqual(
      result.missing.map((m) => m.name),
      ["user"]
    );
  });

  it("should detect type downgrades when field type differs from mapping", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "image", type: "image", required: true },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("image", "image_url", true),
    ];

    // The field_mapping doesn't carry type info, so we detect type
    // via the schema field type vs the provider's declared field type
    // For now, this is a placeholder that gets resolved in Phase 2
    const result = compareFieldMappings(agentFields, mappings);

    // When mapping exists and field name matches canonical, it's a rename
    assert.equal(result.renamed.length, 1);
  });

  it("should handle empty agent fields gracefully", () => {
    const result = compareFieldMappings([], []);

    assert.equal(result.matched.length, 0);
    assert.equal(result.renamed.length, 0);
    assert.equal(result.missing.length, 0);
    assert.equal(result.typeDowngrades.length, 0);
  });

  it("should handle agent fields with no provider mappings", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
    ];

    const result = compareFieldMappings(agentFields, []);

    assert.deepStrictEqual(
      result.missing.map((m) => m.name),
      ["prompt"]
    );
  });

  it("should report all required missing fields together", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "a", type: "string", required: true },
      { name: "b", type: "number", required: true },
      { name: "c", type: "boolean", required: false },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("a", "field_a", true),
    ];

    const result = compareFieldMappings(agentFields, mappings);

    assert.equal(result.renamed.length, 1);
    assert.deepStrictEqual(
      result.missing.map((m) => m.name),
      ["b", "c"]
    );
  });

  it("should handle canonical_field matching provider_field directly", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "model", type: "string", required: true },
    ];
    const mappings: FieldMapping[] = [
      makeMapping("model", "model", true),
    ];

    const result = compareFieldMappings(agentFields, mappings);

    assert.equal(result.matched.length, 1);
    assert.equal(result.matched[0]!.canonicalField, "model");
    assert.equal(result.matched[0]!.providerField, "model");
  });
});

// ─── resolveFieldNegotiation Tests ────────────────────────────────────────

describe("resolveFieldNegotiation", () => {
  it("should return accepted when all fields match with no changes", () => {
    const comparison: FieldComparison = {
      matched: [
        { canonicalField: "model", providerField: "model", type: "string", required: true },
        { canonicalField: "prompt", providerField: "messages", type: "string", required: true, transform: "passthrough" },
      ],
      renamed: [],
      missing: [],
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison);

    assert.equal(result.status, "accepted");
  });

  it("should return adapted when fields need renaming", () => {
    const comparison: FieldComparison = {
      matched: [],
      renamed: [
        { canonicalField: "prompt", providerField: "messages", type: "string" },
      ],
      missing: [],
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison);

    assert.equal(result.status, "adapted");
    assert.ok(result.changes);
    assert.ok(result.changes!.length > 0);
    assert.ok(result.changes![0]!.includes("prompt"));
    assert.ok(result.changes![0]!.includes("messages"));
  });

  it("should return adapted with multiple changes for mixed scenario", () => {
    const comparison: FieldComparison = {
      matched: [
        { canonicalField: "model", providerField: "model", type: "string", required: true },
      ],
      renamed: [
        { canonicalField: "prompt", providerField: "messages", type: "string" },
      ],
      missing: [{ name: "user", required: false }], // optional field dropped
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison, {
      allowDroppingOptional: true,
    });

    assert.equal(result.status, "adapted");
    assert.ok(result.changes);
    // Should mention the rename and the dropped field
    assert.ok(result.changes!.some((c: string) => c.includes("prompt") && c.includes("messages")));
    assert.ok(result.changes!.some((c: string) => c.includes("user")));
  });

  it("should return rejected when required field is missing and no fallback", () => {
    const comparison: FieldComparison = {
      matched: [],
      renamed: [],
      missing: [{ name: "style", required: true }],
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison, {
      allowDroppingOptional: false,
    });

    assert.equal(result.status, "rejected");
    assert.ok(result.reasons);
    assert.ok(result.reasons!.some((r: string) => r.includes("style")));
  });

  it("should return adapted when missing field is optional", () => {
    const comparison: FieldComparison = {
      matched: [{ canonicalField: "prompt", providerField: "messages", type: "string", required: true }],
      renamed: [],
      missing: [{ name: "user", required: false }], // optional
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison, {
      allowDroppingOptional: true,
    });

    assert.equal(result.status, "adapted");
  });

  it("should reject when allowDroppingOptional is false and optional fields missing", () => {
    const comparison: FieldComparison = {
      matched: [{ canonicalField: "prompt", providerField: "messages", type: "string", required: true }],
      renamed: [],
      missing: [{ name: "user", required: false }],
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison, {
      allowDroppingOptional: false,
    });

    assert.equal(result.status, "rejected");
  });

  it("should return adapted when type downgrades present", () => {
    const comparison: FieldComparison = {
      matched: [],
      renamed: [],
      missing: [],
      extra: [],
      typeDowngrades: [
        { field: "image", fromType: "image", toType: "string" },
      ],
    };

    const result = resolveFieldNegotiation(comparison, {
      allowTypeDowngrade: true,
    });

    assert.equal(result.status, "adapted");
    assert.ok(result.changes);
    assert.ok(result.changes!.some((c: string) => c.includes("image")));
  });

  it("should reject when type downgrade not allowed", () => {
    const comparison: FieldComparison = {
      matched: [],
      renamed: [],
      missing: [],
      extra: [],
      typeDowngrades: [
        { field: "image", fromType: "image", toType: "string" },
      ],
    };

    const result = resolveFieldNegotiation(comparison, {
      allowTypeDowngrade: false,
    });

    assert.equal(result.status, "rejected");
  });

  it("should use default options (all allowed) when no options provided", () => {
    const comparison: FieldComparison = {
      matched: [{ canonicalField: "prompt", providerField: "messages", type: "string", required: true }],
      renamed: [],
      missing: [{ name: "user", required: false }],
      extra: [],
      typeDowngrades: [],
    };

    const result = resolveFieldNegotiation(comparison);

    assert.equal(result.status, "adapted"); // optional dropped by default
  });
});

// ─── negotiateFeature Tests ────────────────────────────────────────────────

describe("negotiateFeature", () => {
  const chatFeature = makeFeature(
    "chat_post_v1_chat_completions",
    "chat",
    [
      { name: "messages", type: "string", required: true },
      { name: "model", type: "string", required: true },
      { name: "temperature", type: "number", required: false },
    ],
    [
      makeMapping("prompt", "messages", true),
      makeMapping("model", "model", true),
      makeMapping("temperature", "temperature", false),
    ]
  );

  const imageFeature = makeFeature(
    "text_to_image_post_v1_generation_text2img",
    "text-to-image",
    [
      { name: "text_prompts", type: "string", required: true },
      { name: "cfg_scale", type: "number", required: false },
    ],
    [
      makeMapping("prompt", "text_prompts", true),
      makeMapping("cfg_scale", "cfg_scale", false),
    ]
  );

  const features = [chatFeature, imageFeature];

  it("should accept when chat intent matches with renames only (adapted)", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
      { name: "model", type: "string", required: true },
    ];

    const result = negotiateFeature("chat", agentFields, features);

    // prompt→messages rename = adapted, not accepted
    assert.equal(result.status, "adapted");
    assert.ok(result.changes);
    assert.ok(result.changes!.some((c: string) => c.includes("prompt")));
  });

  it("should adapted when text-to-image intent matches with rename", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
    ];

    const result = negotiateFeature("text-to-image", agentFields, features);

    // prompt→text_prompts rename
    assert.equal(result.status, "adapted");
  });

  it("should return rejected when unknown intent has no matching provider", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "query", type: "string", required: true },
    ];

    const result = negotiateFeature("embeddings", agentFields, features);

    assert.equal(result.status, "rejected");
    assert.ok(result.reasons);
    assert.ok(result.reasons!.length > 0);
  });

  it("should return adapted when field renames needed for chat", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "prompt", type: "string", required: true },
    ];

    // Match against image feature which has prompt→text_prompts rename
    const result = negotiateFeature("text-to-image", agentFields, [imageFeature]);

    assert.equal(result.status, "adapted");
    assert.ok(result.changes);
    assert.ok(result.changes!.some((c: string) => c.includes("prompt")));
  });

  it("should return rejected when required field has no mapping", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "style", type: "string", required: true },
      { name: "prompt", type: "string", required: true },
    ];

    const result = negotiateFeature("text-to-image", agentFields, [imageFeature]);

    assert.equal(result.status, "rejected");
    assert.ok(result.reasons);
    assert.ok(result.reasons!.some((r: string) => r.includes("style")));
  });

  it("should return adapted with type downgrade when allowed", () => {
    // Agent expects image type, but provider only has string type for image_url
    const imageWithType = makeFeature(
      "image_gen",
      "image-generation",
      [{ name: "image_url", type: "string", required: true }],
      [makeMapping("image", "image_url", true)]
    );

    const agentFields: AgentFieldRequest[] = [
      { name: "image", type: "image", required: true },
    ];

    const result = negotiateFeature("image-generation", agentFields, [imageWithType]);

    assert.equal(result.status, "adapted");
    assert.ok(result.changes);
  });

  it("should use first matching feature when multiple providers exist", () => {
    const agentFields: AgentFieldRequest[] = [
      { name: "model", type: "string", required: true },
    ];

    const result = negotiateFeature("chat", agentFields, features);

    // model→model is a direct match with no rename
    assert.equal(result.status, "accepted");
  });
});
