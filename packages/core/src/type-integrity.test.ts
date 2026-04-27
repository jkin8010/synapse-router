/**
 * Core Type Integrity Tests
 * Verifies all major types from @synapse-router/core can be correctly instantiated
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  AgentSchema,
  ServerSchema,
  ProviderCard,
  SchemaMapping,
  SchemaMappingField,
  AccessProtocol,
  CapabilityRequirement,
  FieldMapping,
  AgentFieldMapping,
  AgentFeature,
  LockedFeature,
  LockedFeatureSummary,
  NegotiationResult,
  LockedApiKey,
  BreakingChange,
  ApiKeyWebhookEvent,
} from "./index.js";

// ─── AgentSchema ────────────────────────────────────────────────────────

describe("AgentSchema type integrity", () => {
  it("creates a complete AgentSchema instance", () => {
    const agent: AgentSchema = {
      agent_id: "test-agent",
      agent_name: "Test Agent",
      version: "1.0.0",
      access_protocol: { kind: "api", auth_type: "Bearer" },
      features: [
        {
          feature_id: "text-to-image",
          feature_name: "Text to Image",
          intent: "text-to-image",
          input_schema: {
            name: "input",
            fields: [{ name: "prompt", type: "string", required: true }],
          },
          output_schema: {
            name: "output",
            fields: [{ name: "url", type: "string", required: true }],
          },
          capabilities: [
            { kind: "image-generation", modalities: ["image"] },
          ],
        },
      ],
    };
    assert.equal(agent.agent_id, "test-agent");
    assert.equal(agent.features.length, 1);
    assert.equal(agent.access_protocol.kind, "api");
  });

  it("creates AgentSchema with all 4 access protocol kinds", () => {
    const apiProto: AccessProtocol = { kind: "api", auth_type: "APIKey" };
    const mcpProto: AccessProtocol = { kind: "mcp", server_url: "http://localhost:3000" };
    const cliProto: AccessProtocol = { kind: "cli", command: "my-cli" };
    const a2aProto: AccessProtocol = { kind: "a2a", agent_url: "http://agent.example.com" };

    const agent: AgentSchema = {
      agent_id: "multi-proto-agent",
      agent_name: "Multi Proto Agent",
      version: "2.0.0",
      access_protocol: apiProto,
      features: [],
      global_policy: {
        preferred_strategy: "fast",
        max_cost_per_request: 0.05,
        max_latency_ms: 5000,
      },
    };
    assert.equal(agent.global_policy?.preferred_strategy, "fast");
  });

  it("creates AgentSchema with all capability kinds", () => {
    const caps: CapabilityRequirement[] = [
      { kind: "structured-output", strict: true },
      { kind: "tool-calling", tools: ["search", "calc"] },
      { kind: "vision-input" },
      { kind: "streaming", required: true },
      { kind: "image-generation", modalities: ["image"] },
      { kind: "controlnet", types: ["canny"] },
    ];

    const feature: AgentFeature = {
      feature_id: "multi-cap",
      feature_name: "Multi Capability",
      intent: "multi-cap",
      input_schema: { name: "input", fields: [] },
      output_schema: { name: "output", fields: [] },
      capabilities: caps,
      policy: {
        preferred_provider: "openai",
        allow_fallback: true,
        allow_schema_adaptation: false,
        version_lock: true,
      },
    };
    assert.equal(feature.capabilities.length, 6);
    assert.equal(feature.policy?.preferred_provider, "openai");
  });
});

// ─── ServerSchema ───────────────────────────────────────────────────────

describe("ServerSchema type integrity", () => {
  it("creates a complete ServerSchema instance", () => {
    const server: ServerSchema = {
      agent_id: "test-agent",
      schema_version: "1.0.0",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      locked_features: [],
      locked_providers: [],
      api_key: {
        key_id: "key-001",
        tier: "standard",
        issued_at: "2026-01-01T00:00:00Z",
        expires_at: "2027-01-01T00:00:00Z",
        grace_period_ends_at: null,
        status: "active",
        webhook_events: [],
      },
    };
    assert.equal(server.agent_id, "test-agent");
    assert.equal(server.api_key.tier, "standard");
  });

  it("creates ServerSchema with locked features", () => {
    const contractSummary: LockedFeatureSummary = {
      feature_id: "text-to-image",
      feature_name: "Text to Image",
      primary_provider: {
        provider_name: "openai",
        provider_adapter_version: "1.0.0",
        provider_api_version: "v1",
      },
      locked_input_schema: { name: "input", fields: [{ name: "prompt", type: "string", required: true }] },
      locked_output_schema: { name: "output", fields: [{ name: "url", type: "string", required: true }] },
      locked_field_mappings: [
        {
          provider_field: "prompt",
          canonical_field: "user_prompt",
          transform: "passthrough",
          required: true,
          verified_at: "2026-01-01T00:00:00Z",
        },
      ],
      locked_capabilities: [{ kind: "image-generation", modalities: ["image"] }],
      negotiated_at: "2026-01-01T00:00:00Z",
    };

    const lockedFeature: LockedFeature = {
      ...contractSummary,
      negotiation_result: { status: "accepted", contract: contractSummary },
    };

    const server: ServerSchema = {
      agent_id: "agent-1",
      schema_version: "1.0.0",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      locked_features: [lockedFeature],
      locked_providers: [
        {
          provider_name: "openai",
          provider_adapter_version: "1.0.0",
          provider_api_version: "v1",
          dependent_features: ["text-to-image"],
        },
      ],
      api_key: {
        key_id: "key-001",
        tier: "standard",
        issued_at: "2026-01-01T00:00:00Z",
        expires_at: null,
        grace_period_ends_at: null,
        status: "active",
        webhook_events: [],
      },
    };
    assert.equal(server.locked_features.length, 1);
    assert.equal(server.locked_providers[0].provider_name, "openai");
  });
});

// ─── ProviderCard ───────────────────────────────────────────────────────

describe("ProviderCard type integrity", () => {
  it("creates a complete ProviderCard instance", () => {
    const card: ProviderCard = {
      provider: {
        id: "openai",
        name: "OpenAI",
        version: "1.0.0",
        api_version: "v1",
        base_url: "https://api.openai.com",
        auth_type: "Bearer",
      },
      features: [
        {
          id: "dall-e-3",
          intent: "text-to-image",
          name: "DALL-E 3",
          description: "Generate images from text",
          input: {
            fields: [{ name: "prompt", type: "string", required: true }],
          },
          output: {
            fields: [{ name: "url", type: "string", required: true }],
          },
          field_mappings: [
            {
              provider_field: "prompt",
              canonical_field: "prompt",
              transform: "passthrough",
              required: true,
            },
          ],
          pricing: {
            model: "dall-e-3",
            cost_per_request: { "1024x1024": 0.04 },
            currency: "USD",
          },
        },
      ],
    };
    assert.equal(card.provider.id, "openai");
    assert.equal(card.features.length, 1);
  });
});

// ─── SchemaMapping ──────────────────────────────────────────────────────

describe("SchemaMapping type integrity", () => {
  it("creates a complete SchemaMapping instance", () => {
    const mapping: SchemaMapping = {
      id: "map-001",
      capability_id: "text-to-image",
      provider_id: "openai",
      version: "1.0.0",
      fields: [
        {
          provider_field: "prompt",
          canonical_field: "user_prompt",
          transform: "passthrough",
          required: true,
        },
        {
          provider_field: "image_url",
          canonical_field: "result_url",
          transform: "extract_url",
          required: true,
          fallback: "https://fallback.example.com/placeholder.png",
        },
      ],
      reverse_fields: [],
    };
    assert.equal(mapping.id, "map-001");
    assert.equal(mapping.fields.length, 2);
    assert.equal(mapping.fields[1].transform, "extract_url");
  });
});

// ─── Cross-reference: all types work together ──────────────────────────

describe("Type cross-reference", () => {
  it("AgentSchema + ServerSchema + ProviderCard + SchemaMapping compose", () => {
    const agent: AgentSchema = {
      agent_id: "xref-agent",
      agent_name: "Cross Ref Agent",
      version: "1.0.0",
      access_protocol: { kind: "api", auth_type: "Bearer" },
      features: [
        {
          feature_id: "gen-image",
          feature_name: "Generate Image",
          intent: "text-to-image",
          input_schema: { name: "input", fields: [{ name: "prompt", type: "string", required: true }] },
          output_schema: { name: "output", fields: [{ name: "url", type: "string", required: true }] },
          capabilities: [{ kind: "image-generation", modalities: ["image"] }],
        },
      ],
    };

    const provider: ProviderCard = {
      provider: {
        id: "openai",
        name: "OpenAI",
        version: "1.0.0",
        api_version: "v1",
        base_url: "https://api.openai.com",
        auth_type: "Bearer",
      },
      features: [
        {
          id: "dall-e",
          intent: "text-to-image",
          name: "DALL-E",
          input: { fields: [{ name: "prompt", type: "string", required: true }] },
          output: { fields: [{ name: "url", type: "string", required: true }] },
          field_mappings: [
            { provider_field: "prompt", canonical_field: "prompt", transform: "passthrough", required: true },
          ],
        },
      ],
    };

    const mapping: SchemaMapping = {
      id: "map-xref",
      capability_id: "text-to-image",
      provider_id: "openai",
      version: "1.0.0",
      fields: [
        { provider_field: "prompt", canonical_field: "prompt", transform: "passthrough", required: true },
      ],
      reverse_fields: [],
    };

    // Verify references line up
    assert.equal(agent.features[0].intent, provider.features[0].intent);
    assert.equal(provider.features[0].intent, mapping.capability_id);
    assert.equal(mapping.provider_id, provider.provider.id);
  });

  it("ApiKeyWebhookEvent discriminated union types work", () => {
    const events: ApiKeyWebhookEvent[] = [
      { type: "key.expiring_soon", data: { days_remaining: 7 } },
      { type: "key.grace_period_started", data: { grace_ends_at: "2026-02-01T00:00:00Z" } },
      { type: "key.expired", data: { schema_retention_days: 30 } },
      { type: "schema.breaking_change", data: {
        change_id: "bc-1",
        description: "API v2",
        affected_features: ["text-to-image"],
        planned_at: "2026-03-01T00:00:00Z",
        severity: "breaking",
      }},
      { type: "schema.deprecated", data: { feature_id: "old-feature", sunset_date: "2026-06-01" } },
    ];
    assert.equal(events.length, 5);
    assert.equal(events[0].type, "key.expiring_soon");
  });
});
