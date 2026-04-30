/**
 * Synapse Router — End-to-End Integration Tests
 *
 * Run: node --import tsx --test tests/e2e.test.ts
 *
 * Tests cover:
 *   1. Pack loading & validation (provider-card.json + DSL files)
 *   2. Vault encrypted storage lifecycle
 *   3. Schema normalization & hashing consistency
 *   4. Negotiation flow simulation (AgentFeature ↔ ProviderFeature)
 *   5. Pack Generator — generatePack from minimal OpenAPI spec
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

// ─── Source imports (tsx resolves these) ───────────────────────────────────
import {
  validateSchema,
  normalizeSchema,
  hashSchema,
  type Field,
  type Schema,
  type AgentFeature,
  type ProviderFeature,
  type ProviderCard,
  type ProviderBinding,
  type LockedFeatureSummary,
  type NegotiationResult,
  type AgentFieldMapping,
  type CapabilityRequirement,
} from "../packages/core/src/index.ts";

import { createVault } from "../packages/vault/src/index.ts";

import { generatePack, type GeneratedPack } from "../packages/pack-generator/src/index.ts";

// ─── Paths ─────────────────────────────────────────────────────────────────
const PACKS_DIR = path.resolve(import.meta.dirname || __dirname, "../packs");

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadJSON<T = unknown>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function getAllProviderDirs(): string[] {
  return fs.readdirSync(PACKS_DIR).filter((d) => {
    const full = path.join(PACKS_DIR, d);
    return fs.statSync(full).isDirectory();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Test 1: Pack Loading & Validation
// ────────────────────────────────────────────────────────────────────────────

describe("Test 1: Pack Loading & Validation", () => {
  const providerDirs = getAllProviderDirs();
  assert.ok(providerDirs.length > 0, "Should find at least one provider directory");

  it("finds all provider directories", () => {
    console.log(`  Found providers: ${providerDirs.join(", ")}`);
    assert.ok(providerDirs.length >= 4, "Should have at least 4 providers");
  });

  for (const providerDir of providerDirs) {
    describe(`Provider: ${providerDir}`, () => {
      let card: ProviderCard;

      it("provider-card.json is valid JSON", () => {
        const cardPath = path.join(PACKS_DIR, providerDir, "provider-card.json");
        assert.ok(fs.existsSync(cardPath), `provider-card.json should exist at ${cardPath}`);
        card = loadJSON<ProviderCard>(cardPath);
      });

      it("provider-card has provider.id (string)", () => {
        assert.ok(card.provider, "card.provider should exist");
        assert.ok(typeof card.provider.id === "string", "card.provider.id should be a string");
        assert.ok(card.provider.id.length > 0, "card.provider.id should not be empty");
        assert.strictEqual(card.provider.id, providerDir, `provider.id should match directory name`);
      });

      it("provider-card has provider.name (string)", () => {
        assert.ok(typeof card.provider.name === "string", "card.provider.name should be a string");
        assert.ok(card.provider.name.length > 0, "card.provider.name should not be empty");
      });

      it("provider-card has service.id (string) — new card.service.* structure", () => {
        assert.ok(card.service, `card.service should exist for ${providerDir}`);
        assert.ok(typeof card.service.id === "string", "card.service.id should be a string");
        assert.ok(card.service.id.length > 0, "card.service.id should not be empty");
      });

      it("provider-card has service.base_url (string)", () => {
        assert.ok(typeof card.service.base_url === "string", "card.service.base_url should be a string");
      });

      it("provider-card has service.auth_type (valid enum)", () => {
        const validAuthTypes = ["APIKey", "Bearer", "OAuth2"];
        assert.ok(
          validAuthTypes.includes(card.service.auth_type),
          `service.auth_type should be one of ${validAuthTypes.join(", ")}, got "${card.service.auth_type}"`
        );
      });

      it("provider-card has service.version (string)", () => {
        assert.ok(typeof card.service.version === "string", "card.service.version should be a string");
      });

      it("provider-card has features array (non-empty)", () => {
        assert.ok(Array.isArray(card.features), "card.features should be an array");
        assert.ok(card.features.length > 0, "card.features should not be empty");
      });

      it("each feature has required fields (id, intent, name, input.fields, output.fields, field_mappings)", () => {
        for (const feature of card.features) {
          const feat = feature as ProviderFeature;
          assert.ok(typeof feat.id === "string" && feat.id.length > 0, `feature.id required for ${providerDir}`);
          assert.ok(typeof feat.intent === "string", `feature.intent required for ${feat.id}`);
          assert.ok(typeof feat.name === "string", `feature.name required for ${feat.id}`);
          assert.ok(Array.isArray(feat.input?.fields), `feature.input.fields required for ${feat.id}`);
          assert.ok(Array.isArray(feat.output?.fields), `feature.output.fields required for ${feat.id}`);
          assert.ok(Array.isArray(feat.field_mappings), `feature.field_mappings required for ${feat.id}`);
        }
      });

      it("each feature's input/output schemas are valid via validateSchema", () => {
        // Core DSLType = "string" | "number" | "boolean" | "enum" | "image"
        // Provider cards may contain "object" / "array" types from OpenAPI
        // which are opaque blobs at the DSL level — filter them out for validation
        const coreTypes: Set<string> = new Set(["string", "number", "boolean", "enum", "image"]);
        for (const feature of card.features as ProviderFeature[]) {
          const primInputFields = feature.input.fields.filter((f) => coreTypes.has(f.type));
          if (primInputFields.length > 0) {
            const inputSchema: Schema = { name: `${feature.id}_input`, fields: primInputFields };
            const inputResult = validateSchema(inputSchema);
            assert.ok(
              inputResult.valid,
              `Feature "${feature.id}" input schema invalid: ${inputResult.errors.join("; ")}`
            );
          }

          const primOutputFields = feature.output.fields.filter((f) => coreTypes.has(f.type));
          if (primOutputFields.length > 0) {
            const outputSchema: Schema = { name: `${feature.id}_output`, fields: primOutputFields };
            const outputResult = validateSchema(outputSchema);
            assert.ok(
              outputResult.valid,
              `Feature "${feature.id}" output schema invalid: ${outputResult.errors.join("; ")}`
            );
          }

          // Log complex fields for documentation
          const complexIn = feature.input.fields.filter((f) => !coreTypes.has(f.type));
          const complexOut = feature.output.fields.filter((f) => !coreTypes.has(f.type));
          if (complexIn.length > 0 || complexOut.length > 0) {
            console.log(
              `    Feature "${feature.id}" complex fields: input=[${complexIn.map((f) => `${f.name}:${f.type}`).join(", ")}] output=[${complexOut.map((f) => `${f.name}:${f.type}`).join(", ")}]`
            );
          }
        }
      });

      it("all DSL files parse as valid JSON", () => {
        const dslDir = path.join(PACKS_DIR, providerDir, "dsl");
        assert.ok(fs.existsSync(dslDir), `dsl directory should exist for ${providerDir}`);

        const dslFiles = fs.readdirSync(dslDir).filter((f) => f.endsWith(".json"));
        assert.ok(dslFiles.length > 0, `Should have at least one DSL file for ${providerDir}`);

        for (const dslFile of dslFiles) {
          const dslPath = path.join(dslDir, dslFile);
          const content = fs.readFileSync(dslPath, "utf-8");
          let parsed: unknown;
          try {
            parsed = JSON.parse(content);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            assert.fail(`DSL file "${dslFile}" failed to parse: ${msg}`);
          }
          // Basic DSL structure check
          const dsl = parsed as Record<string, unknown>;
          assert.ok(typeof dsl.agent_id === "string", `DSL "${dslFile}" should have agent_id`);
          assert.ok(Array.isArray(dsl.features), `DSL "${dslFile}" should have features array`);
        }
      });

      it("DSL features have required AgentFeature fields", () => {
        const dslDir = path.join(PACKS_DIR, providerDir, "dsl");
        const dslFiles = fs.readdirSync(dslDir).filter((f) => f.endsWith(".json"));

        for (const dslFile of dslFiles) {
          const dslPath = path.join(dslDir, dslFile);
          const dsl = loadJSON(dslPath);
          const dslObj = dsl as Record<string, unknown>;
          const features = (dslObj.features ?? []) as Array<Record<string, unknown>>;

          for (const feat of features) {
            assert.ok(typeof feat.feature_id === "string", `DSL "${dslFile}": feature_id required`);
            assert.ok(typeof feat.feature_name === "string", `DSL "${dslFile}": feature_name required`);
            assert.ok(typeof feat.intent === "string", `DSL "${dslFile}": intent required`);
            assert.ok(typeof feat.input_schema === "object", `DSL "${dslFile}": input_schema required`);
            assert.ok(typeof feat.output_schema === "object", `DSL "${dslFile}": output_schema required`);

            // Validate schemas via core
            const inputSchema: Schema = {
              name: String((feat.input_schema as Schema).name),
              fields: (feat.input_schema as Schema).fields,
            };
            const outputSchema: Schema = {
              name: String((feat.output_schema as Schema).name),
              fields: (feat.output_schema as Schema).fields,
            };
            const coreTypes2: Set<string> = new Set(["string", "number", "boolean", "enum", "image"]);
            const primIn = inputSchema.fields.filter((f: Field) => coreTypes2.has(f.type));
            const primOut = outputSchema.fields.filter((f: Field) => coreTypes2.has(f.type));
            if (primIn.length > 0) {
              const piSchema: Schema = { name: inputSchema.name, fields: primIn };
              assert.ok(validateSchema(piSchema).valid, `DSL "${dslFile}" feature "${feat.feature_id}" input invalid`);
            }
            if (primOut.length > 0) {
              const poSchema: Schema = { name: outputSchema.name, fields: primOut };
              assert.ok(validateSchema(poSchema).valid, `DSL "${dslFile}" feature "${feat.feature_id}" output invalid`);
            }
          }
        }
      });
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Test 2: Vault Encrypted Storage Lifecycle
// ────────────────────────────────────────────────────────────────────────────

describe("Test 2: Vault Encrypted Storage Lifecycle", () => {
  let vaultDir: string;

  before(() => {
    vaultDir = fs.mkdtempSync(path.join(tmpdir(), "vault-e2e-"));
  });

  after(() => {
    // Clean up temp directory
    try {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it("creates a Vault instance with temp directory", () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });
    assert.ok(vault, "Vault instance should be created");
    assert.ok(typeof vault.setKey === "function", "Vault should have setKey method");
    assert.ok(typeof vault.getKey === "function", "Vault should have getKey method");
    assert.ok(typeof vault.listKeys === "function", "Vault should have listKeys method");
    assert.ok(typeof vault.removeKey === "function", "Vault should have removeKey method");
    assert.ok(typeof vault.hasKey === "function", "Vault should have hasKey method");
  });

  it("setKey → getKey roundtrip returns the same value", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    const testKey = "sk-test-key-1234567890abcdef";
    await vault.setKey("test-provider", testKey, "APIKey");

    const retrieved = await vault.getKey("test-provider");
    assert.strictEqual(retrieved, testKey, "Retrieved key should match the original");
  });

  it("listKeys returns all stored providers", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    await vault.setKey("provider-a", "key-a-1234567890abcdef", "Bearer");
    await vault.setKey("provider-b", "sk-ant-key-1234567890abcdef", "APIKey");

    const keys = await vault.listKeys();
    assert.ok(keys.includes("provider-a"), "listKeys should include provider-a");
    assert.ok(keys.includes("provider-b"), "listKeys should include provider-b");
    assert.ok(keys.length >= 2, "Should have at least 2 keys");
  });

  it("removeKey deletes the entry and listKeys no longer includes it", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    await vault.setKey("to-delete", "sk-delete-key-1234567890abc", "Bearer");
    const beforeKeys = await vault.listKeys();
    assert.ok(beforeKeys.includes("to-delete"), "Key should exist before deletion");

    const removed = await vault.removeKey("to-delete");
    assert.strictEqual(removed, true, "removeKey should return true for existing key");

    const afterKeys = await vault.listKeys();
    assert.ok(!afterKeys.includes("to-delete"), "Key should not exist after deletion");
  });

  it("removeKey on non-existent key returns false", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    const removed = await vault.removeKey("non-existent-provider-xyz");
    assert.strictEqual(removed, false, "removeKey should return false for non-existent key");
  });

  it("hasKey returns true for existing key and false for non-existent", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    await vault.setKey("check-provider", "sk-check-key-1234567890abc", "APIKey");
    const exists = await vault.hasKey("check-provider");
    assert.strictEqual(exists, true, "hasKey should return true for existing key");

    const notExists = await vault.hasKey("no-such-provider-xyz");
    assert.strictEqual(notExists, false, "hasKey should return false for non-existent key");
  });

  it("getKey on non-existent provider returns null", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    const result = await vault.getKey("non-existent-xyz");
    assert.strictEqual(result, null, "getKey should return null for non-existent provider");
  });

  it("two consecutive getKey calls return the same value (consistency)", async () => {
    const vault = createVault({
      vaultDir,
      encryptionKey: "test-encryption-key-not-for-production",
      preferKeychain: false,
      audit: false,
    });

    await vault.setKey("consistency-check", "sk-consistent-key-123456789", "Bearer");
    const first = await vault.getKey("consistency-check");
    const second = await vault.getKey("consistency-check");
    assert.strictEqual(first, second, "Two getKey calls should return identical values");
    assert.strictEqual(first, "sk-consistent-key-123456789", "Value should match original");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Test 3: Schema Normalization & Hashing
// ────────────────────────────────────────────────────────────────────────────

describe("Test 3: Schema Normalization & Hashing", () => {
  it("normalizeSchema produces identical output for different field orders", () => {
    const schemaA: Schema = {
      name: "TestSchema",
      version: "1.0",
      fields: [
        { name: "zebra", type: "string", required: true },
        { name: "alpha", type: "number", required: false },
        { name: "middle", type: "boolean" },
      ],
    };

    const schemaB: Schema = {
      name: "TestSchema",
      version: "1.0",
      fields: [
        { name: "middle", type: "boolean" },
        { name: "zebra", type: "string", required: true },
        { name: "alpha", type: "number", required: false },
      ],
    };

    const normalizedA = normalizeSchema(schemaA);
    const normalizedB = normalizeSchema(schemaB);

    assert.deepStrictEqual(
      normalizedA.fields.map((f) => f.name),
      ["alpha", "middle", "zebra"],
      "Normalized fields should be sorted alphabetically"
    );

    assert.deepStrictEqual(normalizedA, normalizedB, "Schemas with different field orders should normalize to the same result");
  });

  it("hashSchema produces identical hash for equivalent schemas", () => {
    const schemaA: Schema = {
      name: "HashTest",
      fields: [
        { name: "y", type: "string" },
        { name: "x", type: "number" },
      ],
    };

    const schemaB: Schema = {
      name: "HashTest",
      fields: [
        { name: "x", type: "number" },
        { name: "y", type: "string" },
      ],
    };

    const hashA = hashSchema(schemaA);
    const hashB = hashSchema(schemaB);

    assert.strictEqual(hashA, hashB, "Equivalent schemas should produce identical hashes");
    assert.ok(typeof hashA === "string" && hashA.length === 64, "Hash should be a 64-char hex string (SHA-256)");
  });

  it("different schemas produce different hashes", () => {
    const schemaA: Schema = {
      name: "DifferentA",
      fields: [{ name: "field1", type: "string" }],
    };

    const schemaB: Schema = {
      name: "DifferentB",
      fields: [{ name: "field1", type: "string" }],
    };

    const hashA = hashSchema(schemaA);
    const hashB = hashSchema(schemaB);

    assert.notStrictEqual(hashA, hashB, "Schemas with different names should produce different hashes");
  });

  it("nested fields are also normalized recursively", () => {
    const schemaA: Schema = {
      name: "Nested",
      fields: [
        {
          name: "outer",
          type: "string",
          fields: [
            { name: "z", type: "string" },
            { name: "a", type: "number" },
          ],
        },
      ],
    };

    const schemaB: Schema = {
      name: "Nested",
      fields: [
        {
          name: "outer",
          type: "string",
          fields: [
            { name: "a", type: "number" },
            { name: "z", type: "string" },
          ],
        },
      ],
    };

    const hashA = hashSchema(schemaA);
    const hashB = hashSchema(schemaB);

    assert.strictEqual(hashA, hashB, "Nested fields should be normalized recursively");
  });

  it("validateSchema catches invalid schemas", () => {
    const emptyName: Schema = {
      name: "",
      fields: [{ name: "field", type: "string" }],
    };
    const result = validateSchema(emptyName);
    assert.strictEqual(result.valid, false, "Empty schema name should be invalid");
    assert.ok(result.errors.length > 0, "Should have error messages");

    const deepSchema: Schema = {
      name: "Deep",
      fields: [
        {
          name: "l1",
          type: "string",
          fields: [
            {
              name: "l2",
              type: "string",
              fields: [{ name: "l3", type: "string" }],
            },
          ],
        },
      ],
    };
    const deepResult = validateSchema(deepSchema);
    assert.strictEqual(deepResult.valid, false, "Schema exceeding max depth should be invalid");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Test 4: Negotiation Flow Simulation
// ────────────────────────────────────────────────────────────────────────────

describe("Test 4: Negotiation Flow Simulation", () => {
  it("constructs valid AgentFeature and ProviderFeature declarations", () => {
    const agentFeature: AgentFeature = {
      feature_id: "test-image-gen",
      feature_name: "Image Generation",
      intent: "text-to-image",
      input_schema: {
        name: "ImageGenInput",
        fields: [
          { name: "prompt", type: "string", required: true },
          { name: "width", type: "number", required: false },
          { name: "height", type: "number", required: false },
        ],
      },
      output_schema: {
        name: "ImageGenOutput",
        fields: [
          { name: "image_url", type: "string", required: true },
          { name: "width", type: "number" },
          { name: "height", type: "number" },
        ],
      },
      field_mappings: [
        {
          provider_field: "text",
          canonical_field: "prompt",
          agent_field: "prompt",
          required: true,
        },
        {
          provider_field: "size.width",
          canonical_field: "width",
          agent_field: "width",
          required: false,
        },
      ],
      capabilities: [
        { kind: "image-generation", modalities: ["image/png", "image/jpeg"] },
      ],
      policy: {
        preferred_provider: "stability",
        allow_fallback: true,
      },
    };

    const providerFeature: ProviderFeature = {
      id: "text_to_image_v1",
      intent: "text-to-image",
      name: "Stable Diffusion Text-to-Image",
      description: "Generate images from text prompts",
      input: {
        fields: [
          { name: "text", type: "string", required: true },
          { name: "size", type: "number", required: false },
        ],
      },
      output: {
        fields: [
          { name: "artifacts", type: "array", required: true },
        ],
      },
      field_mappings: [
        {
          provider_field: "text",
          canonical_field: "prompt",
          required: true,
        },
        {
          provider_field: "size",
          canonical_field: "width",
          required: false,
        },
      ],
    };

    // Validate both schemas
    const agentInputResult = validateSchema(agentFeature.input_schema);
    assert.ok(agentInputResult.valid, `AgentFeature input should be valid: ${agentInputResult.errors.join("; ")}`);

    const agentOutputResult = validateSchema(agentFeature.output_schema);
    assert.ok(agentOutputResult.valid, `AgentFeature output should be valid: ${agentOutputResult.errors.join("; ")}`);

    // ProviderFeature uses "array" type (not in core DSLType)
    // Validate field structure instead
    assert.ok(providerFeature.input.fields.length > 0, "ProviderFeature should have input fields");
    assert.ok(providerFeature.output.fields.length > 0, "ProviderFeature should have output fields");
    for (const f of [...providerFeature.input.fields, ...providerFeature.output.fields]) {
      assert.ok(typeof f.name === "string" && f.name.length > 0, `Field should have a name`);
      assert.ok(typeof f.type === "string" && f.type.length > 0, `Field should have a type`);
    }

    // Verify intent matching
    assert.strictEqual(agentFeature.intent, providerFeature.intent, "Intents should match for negotiation");
  });

  it("schema validation works for basic negotiation flow", () => {
    // Simulate: Agent declares what it needs, Provider declares what it offers
    const agentNeeds: AgentFeature = {
      feature_id: "chat-v1",
      feature_name: "Chat",
      intent: "chat",
      input_schema: {
        name: "ChatInput",
        fields: [
          { name: "messages", type: "string", required: true },
          { name: "model", type: "string", required: true },
        ],
      },
      output_schema: {
        name: "ChatOutput",
        fields: [
          { name: "response", type: "string", required: true },
        ],
      },
      field_mappings: [
        { provider_field: "prompt", canonical_field: "messages", agent_field: "messages", required: true },
        { provider_field: "model_name", canonical_field: "model", agent_field: "model", required: true },
      ],
      capabilities: [{ kind: "tool-calling", tools: ["chat"] }],
    };

    const providerOffers: ProviderFeature = {
      id: "chat_completions",
      intent: "chat",
      name: "Chat Completions",
      input: {
        fields: [
          { name: "prompt", type: "string", required: true },
          { name: "model_name", type: "string", required: true },
        ],
      },
      output: {
        fields: [{ name: "response", type: "string", required: true }],
      },
      field_mappings: [
        { provider_field: "prompt", canonical_field: "messages", required: true },
        { provider_field: "model_name", canonical_field: "model", required: true },
      ],
    };

    // Both schemas valid?
    assert.ok(validateSchema(agentNeeds.input_schema).valid, "Agent input schema must be valid");
    assert.ok(validateSchema(agentNeeds.output_schema).valid, "Agent output schema must be valid");
    assert.ok(validateSchema({ name: "p_in", fields: providerOffers.input.fields }).valid, "Provider input must be valid");
    assert.ok(validateSchema({ name: "p_out", fields: providerOffers.output.fields }).valid, "Provider output must be valid");

    // Field mappings are compatible (same canonical fields)
    const agentCanonicalFields = new Set(
      agentNeeds.field_mappings.map((m) => m.canonical_field)
    );
    const providerCanonicalFields = new Set(
      providerOffers.field_mappings.map((m) => m.canonical_field)
    );

    for (const field of agentCanonicalFields) {
      assert.ok(
        providerCanonicalFields.has(field),
        `Provider should map canonical field "${field}" that Agent requires`
      );
    }
  });

  it("negotiation result types are well-formed", () => {
    // Simulate accepted negotiation
    const accepted: NegotiationResult = {
      status: "accepted",
      contract: {
        feature_id: "test-feature",
        feature_name: "Test Feature",
        primary_provider: {
          provider_name: "openai",
          provider_adapter_version: "1.0.0",
          provider_api_version: "2024-01-01",
        },
        locked_input_schema: {
          name: "LockedInput",
          fields: [{ name: "prompt", type: "string", required: true }],
        },
        locked_output_schema: {
          name: "LockedOutput",
          fields: [{ name: "result", type: "string" }],
        },
        locked_field_mappings: [
          {
            provider_field: "prompt",
            canonical_field: "prompt",
            transform: "passthrough",
            required: true,
            verified_at: "2026-01-01T00:00:00Z",
          },
        ],
        locked_capabilities: [{ kind: "text-generation", modalities: ["text"] }],
        negotiated_at: "2026-01-01T00:00:00Z",
      },
    };

    assert.strictEqual(accepted.status, "accepted");
    assert.ok(accepted.contract.primary_provider.provider_name === "openai");
    assert.ok(validateSchema(accepted.contract.locked_input_schema).valid);
    assert.ok(validateSchema(accepted.contract.locked_output_schema).valid);

    // Simulate rejected negotiation
    const rejected: NegotiationResult = {
      status: "rejected",
      reasons: ["Provider does not support required modality", "Schema incompatibility on output fields"],
    };

    assert.strictEqual(rejected.status, "rejected");
    assert.ok(Array.isArray(rejected.reasons));
    assert.ok(rejected.reasons.length >= 2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Test 5: Pack Generator — generatePack
// ────────────────────────────────────────────────────────────────────────────

describe("Test 5: Pack Generator — generatePack", () => {
  it("generates a Pack from a minimal OpenAPI spec", () => {
    // Minimal OpenAPI 3.0 spec
    const minimalSpec = {
      info: {
        title: "Test API",
        version: "1.0.0",
        description: "A minimal test API",
      },
      servers: [{ url: "https://api.test.com/v1" }],
      paths: {
        "/generate": {
          post: {
            operationId: "generate_image",
            summary: "Generate an image",
            description: "Generate an image from a text prompt",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      prompt: { type: "string" },
                      width: { type: "number" },
                      height: { type: "number" },
                    },
                    required: ["prompt"],
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "Generated image URL",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        url: { type: "string" },
                        width: { type: "number" },
                        height: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result: GeneratedPack = generatePack(minimalSpec);

    // Verify structure
    assert.ok(result.providerCard, "Should have providerCard");
    assert.ok(Array.isArray(result.dslFiles), "Should have dslFiles array");
    assert.ok(result.dslFiles.length > 0, "Should have at least one DSL file");
  });

  it("ProviderCard has provider.id and service.id (new card.service.* structure)", () => {
    const minimalSpec = {
      info: { title: "My API", version: "2.0.0" },
      servers: [{ url: "https://myapi.com/v2" }],
      paths: {
        "/hello": {
          get: {
            operationId: "hello_get",
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { message: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = generatePack(minimalSpec);
    const card = result.providerCard;

    // provider.*
    assert.ok(typeof card.provider.id === "string", "provider.id should be a string");
    assert.ok(card.provider.id.length > 0, "provider.id should not be empty");

    // service.* (new structure)
    assert.ok(typeof card.service.id === "string", "service.id should be a string");
    assert.ok(card.service.id.length > 0, "service.id should not be empty");
    assert.ok(typeof card.service.name === "string", "service.name should be a string");
    assert.ok(typeof card.service.version === "string", "service.version should be a string");
    assert.ok(typeof card.service.api_version === "string", "service.api_version should be a string");
    assert.ok(typeof card.service.base_url === "string", "service.base_url should be a string");
    assert.ok(
      ["APIKey", "Bearer", "OAuth2"].includes(card.service.auth_type),
      "service.auth_type should be valid"
    );
  });

  it("DSL files are valid AgentSchema documents", () => {
    const spec = {
      info: { title: "DSL Test API", version: "1.0.0" },
      servers: [{ url: "https://test.com" }],
      paths: {
        "/create": {
          post: {
            operationId: "create_resource",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string" },
                    },
                    required: ["name"],
                  },
                },
              },
            },
            responses: {
              "201": {
                description: "Created",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        created_at: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = generatePack(spec);

    for (const dslFile of result.dslFiles) {
      // Verify path pattern
      assert.ok(dslFile.path.startsWith("dsl/"), `DSL path should start with "dsl/", got: ${dslFile.path}`);
      assert.ok(dslFile.path.endsWith(".json"), `DSL path should end with ".json", got: ${dslFile.path}`);

      // Verify content is valid AgentSchema
      const content = dslFile.content as Record<string, unknown>;
      assert.ok(typeof content.agent_id === "string", "DSL should have agent_id");
      assert.ok(typeof content.agent_name === "string", "DSL should have agent_name");
      assert.ok(typeof content.version === "string", "DSL should have version");
      assert.ok(typeof content.access_protocol === "object", "DSL should have access_protocol");

      const features = content.features as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(features), "DSL should have features array");
      assert.ok(features.length > 0, "DSL should have at least one feature");

      for (const feat of features) {
        assert.ok(typeof feat.feature_id === "string", `DSL feature should have feature_id`);
        assert.ok(typeof feat.intent === "string", `DSL feature should have intent`);
        assert.ok(typeof feat.input_schema === "object", `DSL feature should have input_schema`);
        assert.ok(typeof feat.output_schema === "object", `DSL feature should have output_schema`);

        const inputSchema: Schema = {
          name: String((feat.input_schema as Schema).name),
          fields: (feat.input_schema as Schema).fields,
        };
        const outputSchema: Schema = {
          name: String((feat.output_schema as Schema).name),
          fields: (feat.output_schema as Schema).fields,
        };
        assert.ok(
          validateSchema(inputSchema).valid,
          `DSL input_schema should be valid for feature ${feat.feature_id}`
        );
        assert.ok(
          validateSchema(outputSchema).valid,
          `DSL output_schema should be valid for feature ${feat.feature_id}`
        );
      }
    }
  });

  it("generates correct number of features from OpenAPI paths", () => {
    const spec = {
      info: { title: "Multi-Endpoint API", version: "1.0.0" },
      servers: [{ url: "https://multi.com" }],
      paths: {
        "/images": {
          post: {
            operationId: "create_image",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { prompt: { type: "string" } },
                    required: ["prompt"],
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { url: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
        "/chat": {
          post: {
            operationId: "send_chat",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { message: { type: "string" } },
                    required: ["message"],
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { reply: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = generatePack(spec);
    assert.strictEqual(
      result.providerCard.features.length,
      2,
      "Should generate 2 features from 2 endpoints"
    );
    assert.strictEqual(result.dslFiles.length, 2, "Should generate 2 DSL files");
  });

  it("DSL content serializes to valid JSON", () => {
    const spec = {
      info: { title: "JSON Test API", version: "1.0.0" },
      servers: [{ url: "https://jsontest.com" }],
      paths: {
        "/echo": {
          post: {
            operationId: "echo",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { data: { type: "string" } },
                    required: ["data"],
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { echo: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = generatePack(spec);
    for (const dslFile of result.dslFiles) {
      // Verify content serializes without error
      const json = JSON.stringify(dslFile.content, null, 2);
      assert.ok(json.length > 0, "DSL content should serialize to non-empty JSON");

      // Round-trip parse should succeed
      const reparsed = JSON.parse(json);
      assert.ok(reparsed, "Round-trip parse should succeed");
    }
  });

  it("uses providerId and providerName from options when provided", () => {
    const spec = {
      info: { title: "Original Title", version: "1.0.0" },
      servers: [{ url: "https://example.com" }],
      paths: {
        "/test": {
          get: {
            operationId: "get_test",
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { ok: { type: "boolean" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = generatePack(spec, {
      providerId: "custom-provider",
      providerName: "Custom Provider Name",
      apiVersion: "2025-01-01",
    });

    assert.strictEqual(result.providerCard.provider.id, "custom-provider");
    assert.strictEqual(result.providerCard.provider.name, "Custom Provider Name");
    assert.strictEqual(result.providerCard.service.api_version, "2025-01-01");
  });
});