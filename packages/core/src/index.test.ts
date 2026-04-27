import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  hashSchema,
  normalizeSchema,
  validateSchema,
  type Schema,
  type AccessProtocol,
  type AgentSchema,
  type AgentFeature,
  type FieldMapping,
  type AgentFieldMapping,
  type CapabilityRequirement,
  type FeaturePolicy,
  type AgentGlobalPolicy,
  type ProviderBinding,
  type LockedFieldMapping,
  type LockedFeatureSummary,
  type NegotiationResult,
  type LockedFeature,
  type BreakingChange,
  type LockedProvider,
  type ApiKeyWebhookEvent,
  type LockedApiKey,
  type ServerSchema,
  type ProviderPricing,
  type ProviderFeature,
  type SchemaMappingField,
  type ProviderCard,
  type SchemaMapping
} from "./index.js";

describe("core DSL schema", () => {
  test("validates a simple schema", () => {
    const schema: Schema = {
      name: "route-input",
      fields: [
        { name: "prompt", type: "string", required: true },
        { name: "seed", type: "number" },
        { name: "mode", type: "enum", enumValues: ["fast", "quality"] }
      ]
    };

    assert.deepEqual(validateSchema(schema), { valid: true, errors: [] });
  });

  test("rejects schemas that exceed field, depth, and enum limits", () => {
    const schema: Schema = {
      name: "invalid",
      fields: [
        { name: "field-01", type: "string" },
        { name: "field-02", type: "string" },
        { name: "field-03", type: "string" },
        { name: "field-04", type: "string" },
        { name: "field-05", type: "string" },
        { name: "field-06", type: "string" },
        { name: "field-07", type: "string" },
        { name: "field-08", type: "string" },
        { name: "field-09", type: "string" },
        { name: "field-10", type: "string" },
        { name: "field-11", type: "string" },
        {
          name: "nested",
          type: "string",
          fields: [{ name: "child", type: "string", fields: [{ name: "too-deep", type: "string" }] }]
        },
        {
          name: "choice",
          type: "enum",
          enumValues: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
        }
      ]
    };

    const result = validateSchema(schema);

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /at most 10 fields/);
    assert.match(result.errors.join("\n"), /depth cannot exceed 2/);
    assert.match(result.errors.join("\n"), /enum field "choice" cannot have more than 10 values/);
  });

  test("reports unsupported runtime field types without throwing", () => {
    const schema = {
      name: "invalid-type",
      fields: [{ name: "payload", type: "object" }]
    } as unknown as Schema;

    const result = validateSchema(schema);

    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /unsupported type "object"/);
  });

  test("normalizes schemas into stable sorted order", () => {
    const schema: Schema = {
      fields: [
        { type: "enum", enumValues: ["beta", "alpha"], name: "mode" },
        { required: true, type: "string", name: "prompt" }
      ],
      name: "route-input"
    };

    assert.deepEqual(normalizeSchema(schema), {
      fields: [
        { name: "mode", type: "enum", enumValues: ["alpha", "beta"] },
        { name: "prompt", type: "string", required: true }
      ],
      name: "route-input"
    });
  });

  test("hashes equivalent schemas to the same sha256 value", () => {
    const first: Schema = {
      name: "route-input",
      fields: [
        { name: "prompt", type: "string", required: true },
        { name: "mode", type: "enum", enumValues: ["quality", "fast"] }
      ]
    };
    const second: Schema = {
      fields: [
        { enumValues: ["fast", "quality"], type: "enum", name: "mode" },
        { required: true, type: "string", name: "prompt" }
      ],
      name: "route-input"
    };

    assert.equal(hashSchema(first), hashSchema(second));
    assert.match(hashSchema(first), /^[a-f0-9]{64}$/);
  });
});

// ─── New Type Tests ────────────────────────────────────────────────────────

describe("AccessProtocol", () => {
  test("creates api access protocol", () => {
    const ap: AccessProtocol = { kind: "api", auth_type: "Bearer" };
    assert.equal(ap.kind, "api");
    assert.equal(ap.auth_type, "Bearer");
  });

  test("creates api access protocol with endpoint", () => {
    const ap: AccessProtocol = { kind: "api", endpoint: "https://api.example.com", auth_type: "OAuth2" };
    assert.equal(ap.kind, "api");
    assert.equal(ap.endpoint, "https://api.example.com");
    assert.equal(ap.auth_type, "OAuth2");
  });

  test("creates api access protocol with APIKey auth", () => {
    const ap: AccessProtocol = { kind: "api", auth_type: "APIKey" };
    assert.equal(ap.auth_type, "APIKey");
  });

  test("creates mcp access protocol", () => {
    const ap: AccessProtocol = { kind: "mcp", server_url: "https://mcp.example.com/sse" };
    assert.equal(ap.kind, "mcp");
    assert.equal(ap.server_url, "https://mcp.example.com/sse");
  });

  test("creates mcp access protocol with tools", () => {
    const ap: AccessProtocol = { kind: "mcp", server_url: "https://mcp.example.com/sse", tools: ["search", "generate"] };
    assert.deepEqual(ap.tools, ["search", "generate"]);
  });

  test("creates cli access protocol", () => {
    const ap: AccessProtocol = { kind: "cli", command: "python" };
    assert.equal(ap.kind, "cli");
    assert.equal(ap.command, "python");
  });

  test("creates cli access protocol with args", () => {
    const ap: AccessProtocol = { kind: "cli", command: "python", args: ["-m", "agent"] };
    assert.deepEqual(ap.args, ["-m", "agent"]);
  });

  test("creates a2a access protocol", () => {
    const ap: AccessProtocol = { kind: "a2a", agent_url: "https://agent.example.com" };
    assert.equal(ap.kind, "a2a");
    assert.equal(ap.agent_url, "https://agent.example.com");
  });

  test("creates a2a access protocol with skill", () => {
    const ap: AccessProtocol = { kind: "a2a", agent_url: "https://agent.example.com", skill: "translate" };
    assert.equal(ap.skill, "translate");
  });
});

describe("AgentSchema", () => {
  test("creates a minimal agent schema", () => {
    const schema: AgentSchema = {
      agent_id: "test-agent",
      agent_name: "Test Agent",
      version: "1.0.0",
      access_protocol: { kind: "api", auth_type: "Bearer" },
      features: []
    };
    assert.equal(schema.agent_id, "test-agent");
    assert.equal(schema.version, "1.0.0");
    assert.equal(schema.access_protocol.kind, "api");
    assert.equal(schema.features.length, 0);
    assert.equal(schema.global_policy, undefined);
  });

  test("creates an agent schema with global_policy", () => {
    const policy: AgentGlobalPolicy = {
      preferred_strategy: "cheap",
      max_cost_per_request: 0.05,
      max_latency_ms: 3000,
      allowed_providers: ["openai"],
      blocked_providers: ["legacy-provider"]
    };
    const schema: AgentSchema = {
      agent_id: "agent-with-policy",
      agent_name: "Policy Agent",
      version: "2.0.0",
      access_protocol: { kind: "api", auth_type: "OAuth2" },
      features: [],
      global_policy: policy
    };
    assert.equal(schema.global_policy?.preferred_strategy, "cheap");
    assert.equal(schema.global_policy?.max_cost_per_request, 0.05);
    assert.deepEqual(schema.global_policy?.allowed_providers, ["openai"]);
  });

  test("creates with mcp access protocol", () => {
    const schema: AgentSchema = {
      agent_id: "mcp-agent",
      agent_name: "MCP Agent",
      version: "1.0.0",
      access_protocol: { kind: "mcp", server_url: "https://mcp.example.com/sse" },
      features: []
    };
    assert.equal(schema.access_protocol.kind, "mcp");
    if (schema.access_protocol.kind === "mcp") {
      assert.equal(schema.access_protocol.server_url, "https://mcp.example.com/sse");
    }
  });

  test("creates with cli access protocol", () => {
    const schema: AgentSchema = {
      agent_id: "cli-agent",
      agent_name: "CLI Agent",
      version: "1.0.0",
      access_protocol: { kind: "cli", command: "node", args: ["agent.js"] },
      features: []
    };
    assert.equal(schema.access_protocol.kind, "cli");
    if (schema.access_protocol.kind === "cli") {
      assert.equal(schema.access_protocol.command, "node");
      assert.deepEqual(schema.access_protocol.args, ["agent.js"]);
    }
  });

  test("creates with a2a access protocol", () => {
    const schema: AgentSchema = {
      agent_id: "a2a-agent",
      agent_name: "A2A Agent",
      version: "1.0.0",
      access_protocol: { kind: "a2a", agent_url: "https://peer.example.com", skill: "search" },
      features: []
    };
    assert.equal(schema.access_protocol.kind, "a2a");
    if (schema.access_protocol.kind === "a2a") {
      assert.equal(schema.access_protocol.agent_url, "https://peer.example.com");
      assert.equal(schema.access_protocol.skill, "search");
    }
  });

  test("creates a full agent schema with features", () => {
    const feature: AgentFeature = {
      feature_id: "img-gen",
      feature_name: "Image Generation",
      intent: "generate images from text prompts",
      input_schema: { name: "img-input", fields: [{ name: "prompt", type: "string", required: true }] },
      output_schema: { name: "img-output", fields: [{ name: "image_url", type: "string" }] },
      capabilities: [{ kind: "image-generation", modalities: ["text", "image"] }]
    };
    const schema: AgentSchema = {
      agent_id: "full-agent",
      agent_name: "Full Agent",
      version: "1.0.0",
      access_protocol: { kind: "api", endpoint: "https://api.example.com", auth_type: "Bearer" },
      features: [feature],
      global_policy: { preferred_strategy: "quality" }
    };
    assert.equal(schema.features.length, 1);
    assert.equal(schema.features[0].feature_id, "img-gen");
    assert.equal(schema.global_policy?.preferred_strategy, "quality");
  });
});

describe("AgentFeature", () => {
  test("creates a feature with input_schema and output_schema", () => {
    const feature: AgentFeature = {
      feature_id: "text-gen",
      feature_name: "Text Generation",
      intent: "generate text from prompts",
      input_schema: { name: "text-input", fields: [{ name: "prompt", type: "string", required: true }] },
      output_schema: { name: "text-output", fields: [{ name: "text", type: "string" }] },
      capabilities: []
    };
    assert.equal(feature.feature_id, "text-gen");
    assert.equal(feature.input_schema.name, "text-input");
    assert.equal(feature.output_schema.name, "text-output");
    assert.equal(feature.input_schema.fields[0].name, "prompt");
  });

  test("creates a feature with field_mappings", () => {
    const mapping: AgentFieldMapping = {
      provider_field: "model_prompt",
      canonical_field: "prompt",
      agent_field: "user_prompt",
      required: true
    };
    const feature: AgentFeature = {
      feature_id: "mapped-feature",
      feature_name: "Mapped Feature",
      intent: "test field mappings",
      input_schema: { name: "input", fields: [] },
      output_schema: { name: "output", fields: [] },
      field_mappings: [mapping],
      capabilities: []
    };
    assert.equal(feature.field_mappings?.length, 1);
    assert.equal(feature.field_mappings?.[0].agent_field, "user_prompt");
    assert.equal(feature.field_mappings?.[0].canonical_field, "prompt");
  });

  test("creates a feature with policy", () => {
    const policy: FeaturePolicy = {
      preferred_provider: "openai",
      allow_fallback: true,
      allow_schema_adaptation: false,
      version_lock: true
    };
    const feature: AgentFeature = {
      feature_id: "policy-feature",
      feature_name: "Policy Feature",
      intent: "test policy",
      input_schema: { name: "input", fields: [] },
      output_schema: { name: "output", fields: [] },
      capabilities: [],
      policy
    };
    assert.equal(feature.policy?.preferred_provider, "openai");
    assert.equal(feature.policy?.version_lock, true);
  });

  test("creates a feature with capabilities", () => {
    const feature: AgentFeature = {
      feature_id: "cap-feature",
      feature_name: "Capability Feature",
      intent: "test capabilities",
      input_schema: { name: "input", fields: [] },
      output_schema: { name: "output", fields: [] },
      capabilities: [
        { kind: "structured-output", strict: true },
        { kind: "tool-calling", tools: ["web_search"] },
        { kind: "streaming", required: true }
      ]
    };
    assert.equal(feature.capabilities.length, 3);
    assert.equal(feature.capabilities[0].kind, "structured-output");
    assert.equal(feature.capabilities[1].kind, "tool-calling");
  });
});

describe("FieldMapping", () => {
  test("creates a required field mapping", () => {
    const fm: FieldMapping = {
      provider_field: "model_prompt",
      canonical_field: "prompt",
      required: true
    };
    assert.equal(fm.provider_field, "model_prompt");
    assert.equal(fm.canonical_field, "prompt");
    assert.equal(fm.required, true);
    assert.equal(fm.transform, undefined);
  });

  test("creates an optional field mapping", () => {
    const fm: FieldMapping = {
      provider_field: "seed_value",
      canonical_field: "seed",
      required: false
    };
    assert.equal(fm.required, false);
  });

  test("creates with passthrough transform", () => {
    const fm: FieldMapping = {
      provider_field: "prompt",
      canonical_field: "prompt",
      transform: "passthrough",
      required: true
    };
    assert.equal(fm.transform, "passthrough");
  });

  test("creates with extract_url transform", () => {
    const fm: FieldMapping = {
      provider_field: "image_data",
      canonical_field: "image_url",
      transform: "extract_url",
      required: true
    };
    assert.equal(fm.transform, "extract_url");
  });

  test("creates with base64_decode transform", () => {
    const fm: FieldMapping = {
      provider_field: "encoded_data",
      canonical_field: "data",
      transform: "base64_decode",
      required: false
    };
    assert.equal(fm.transform, "base64_decode");
  });

  test("creates with json_parse transform", () => {
    const fm: FieldMapping = {
      provider_field: "json_string",
      canonical_field: "config",
      transform: "json_parse",
      required: true
    };
    assert.equal(fm.transform, "json_parse");
  });

  test("creates with cast_number transform", () => {
    const fm: FieldMapping = {
      provider_field: "count_str",
      canonical_field: "count",
      transform: "cast_number",
      required: false
    };
    assert.equal(fm.transform, "cast_number");
  });

  test("creates with fallback value", () => {
    const fm: FieldMapping = {
      provider_field: "temperature",
      canonical_field: "temperature",
      required: false,
      fallback: 0.7
    };
    assert.equal(fm.fallback, 0.7);
  });
});

describe("AgentFieldMapping", () => {
  test("extends FieldMapping with agent_field", () => {
    const afm: AgentFieldMapping = {
      provider_field: "model_prompt",
      canonical_field: "prompt",
      agent_field: "user_prompt",
      required: true
    };
    assert.equal(afm.agent_field, "user_prompt");
    assert.equal(afm.canonical_field, "prompt");
    assert.equal(afm.provider_field, "model_prompt");
  });

  test("inherits transform and fallback from FieldMapping", () => {
    const afm: AgentFieldMapping = {
      provider_field: "model_temp",
      canonical_field: "temperature",
      agent_field: "temp",
      transform: "cast_number",
      required: false,
      fallback: 1.0
    };
    assert.equal(afm.transform, "cast_number");
    assert.equal(afm.fallback, 1.0);
  });
});

describe("CapabilityRequirement", () => {
  test("creates structured-output capability", () => {
    const cap: CapabilityRequirement = { kind: "structured-output", strict: true };
    assert.equal(cap.kind, "structured-output");
    if (cap.kind === "structured-output") assert.equal(cap.strict, true);
  });

  test("creates structured-output with strict false", () => {
    const cap: CapabilityRequirement = { kind: "structured-output", strict: false };
    if (cap.kind === "structured-output") assert.equal(cap.strict, false);
  });

  test("creates tool-calling capability", () => {
    const cap: CapabilityRequirement = { kind: "tool-calling", tools: ["web_search", "calculator"] };
    assert.equal(cap.kind, "tool-calling");
    if (cap.kind === "tool-calling") assert.deepEqual(cap.tools, ["web_search", "calculator"]);
  });

  test("creates vision-input capability", () => {
    const cap: CapabilityRequirement = { kind: "vision-input" };
    assert.equal(cap.kind, "vision-input");
  });

  test("creates streaming capability", () => {
    const cap: CapabilityRequirement = { kind: "streaming", required: true };
    assert.equal(cap.kind, "streaming");
    if (cap.kind === "streaming") assert.equal(cap.required, true);
  });

  test("creates image-generation capability", () => {
    const cap: CapabilityRequirement = { kind: "image-generation", modalities: ["text", "image"] };
    assert.equal(cap.kind, "image-generation");
    if (cap.kind === "image-generation") assert.deepEqual(cap.modalities, ["text", "image"]);
  });

  test("creates controlnet capability", () => {
    const cap: CapabilityRequirement = { kind: "controlnet", types: ["canny", "depth"] };
    assert.equal(cap.kind, "controlnet");
    if (cap.kind === "controlnet") assert.deepEqual(cap.types, ["canny", "depth"]);
  });
});

describe("ProviderBinding", () => {
  test("creates a provider binding", () => {
    const binding: ProviderBinding = {
      provider_name: "openai",
      provider_adapter_version: "1.0.0",
      provider_api_version: "v1"
    };
    assert.equal(binding.provider_name, "openai");
    assert.equal(binding.provider_adapter_version, "1.0.0");
    assert.equal(binding.provider_api_version, "v1");
  });
});

describe("LockedFieldMapping", () => {
  test("creates a locked field mapping with verified_at", () => {
    const lfm: LockedFieldMapping = {
      provider_field: "model_prompt",
      canonical_field: "prompt",
      transform: "passthrough",
      required: true,
      verified_at: "2026-01-01T00:00:00Z"
    };
    assert.equal(lfm.canonical_field, "prompt");
    assert.equal(lfm.transform, "passthrough");
    assert.equal(lfm.verified_at, "2026-01-01T00:00:00Z");
  });

  test("creates with fallback", () => {
    const lfm: LockedFieldMapping = {
      provider_field: "temp",
      canonical_field: "temperature",
      transform: "cast_number",
      required: false,
      fallback: 0.7,
      verified_at: "2026-01-01T00:00:00Z"
    };
    assert.equal(lfm.fallback, 0.7);
  });
});

describe("LockedFeatureSummary", () => {
  const binding: ProviderBinding = {
    provider_name: "openai",
    provider_adapter_version: "1.0.0",
    provider_api_version: "v1"
  };

  test("creates a locked feature summary", () => {
    const summary: LockedFeatureSummary = {
      feature_id: "text-gen",
      feature_name: "Text Generation",
      primary_provider: binding,
      locked_input_schema: { name: "input", fields: [{ name: "prompt", type: "string", required: true }] },
      locked_output_schema: { name: "output", fields: [{ name: "text", type: "string" }] },
      locked_field_mappings: [],
      locked_capabilities: [{ kind: "structured-output", strict: true }],
      negotiated_at: "2026-01-01T00:00:00Z"
    };
    assert.equal(summary.feature_id, "text-gen");
    assert.equal(summary.primary_provider.provider_name, "openai");
    assert.equal(summary.locked_capabilities.length, 1);
  });

  test("creates with fallback_provider", () => {
    const fallback: ProviderBinding = {
      provider_name: "anthropic",
      provider_adapter_version: "1.0.0",
      provider_api_version: "v1"
    };
    const summary: LockedFeatureSummary = {
      feature_id: "text-gen",
      feature_name: "Text Generation",
      primary_provider: binding,
      fallback_provider: fallback,
      locked_input_schema: { name: "input", fields: [] },
      locked_output_schema: { name: "output", fields: [] },
      locked_field_mappings: [],
      locked_capabilities: [],
      negotiated_at: "2026-01-01T00:00:00Z"
    };
    assert.equal(summary.fallback_provider?.provider_name, "anthropic");
  });
});

describe("NegotiationResult", () => {
  const makeSummary = (): LockedFeatureSummary => ({
    feature_id: "text-gen",
    feature_name: "Text Generation",
    primary_provider: { provider_name: "openai", provider_adapter_version: "1.0.0", provider_api_version: "v1" },
    locked_input_schema: { name: "input", fields: [] },
    locked_output_schema: { name: "output", fields: [] },
    locked_field_mappings: [],
    locked_capabilities: [],
    negotiated_at: "2026-01-01T00:00:00Z"
  });

  test("creates accepted negotiation result", () => {
    const result: NegotiationResult = { status: "accepted", contract: makeSummary() };
    assert.equal(result.status, "accepted");
    if (result.status === "accepted") {
      assert.equal(result.contract.feature_id, "text-gen");
    }
  });

  test("creates adapted negotiation result with changes", () => {
    const result: NegotiationResult = {
      status: "adapted",
      contract: makeSummary(),
      changes: ["field 'seed' mapped as optional", "provider fallback enabled"]
    };
    assert.equal(result.status, "adapted");
    if (result.status === "adapted") {
      assert.equal(result.changes.length, 2);
      assert.match(result.changes[0], /seed/);
    }
  });

  test("creates rejected negotiation result with reasons", () => {
    const result: NegotiationResult = {
      status: "rejected",
      reasons: ["no provider supports required capability", "cost exceeds budget"]
    };
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.reasons.length, 2);
      assert.match(result.reasons[0], /capability/);
    }
  });
});

describe("LockedFeature", () => {
  test("creates a locked feature with negotiation result", () => {
    const binding: ProviderBinding = {
      provider_name: "openai",
      provider_adapter_version: "1.0.0",
      provider_api_version: "v1"
    };
    const summary: LockedFeatureSummary = {
      feature_id: "text-gen",
      feature_name: "Text Generation",
      primary_provider: binding,
      locked_input_schema: { name: "input", fields: [{ name: "prompt", type: "string", required: true }] },
      locked_output_schema: { name: "output", fields: [{ name: "text", type: "string" }] },
      locked_field_mappings: [{
        provider_field: "model_prompt",
        canonical_field: "prompt",
        transform: "passthrough",
        required: true,
        verified_at: "2026-01-01T00:00:00Z"
      }],
      locked_capabilities: [{ kind: "structured-output", strict: true }],
      negotiated_at: "2026-01-01T00:00:00Z"
    };
    const locked: LockedFeature = {
      ...summary,
      negotiation_result: { status: "accepted", contract: summary }
    };
    assert.equal(locked.feature_id, "text-gen");
    assert.equal(locked.negotiation_result.status, "accepted");
    assert.equal(locked.locked_field_mappings.length, 1);
  });

  test("creates with adapted negotiation result", () => {
    const binding: ProviderBinding = {
      provider_name: "anthropic",
      provider_adapter_version: "2.0.0",
      provider_api_version: "v1"
    };
    const summary: LockedFeatureSummary = {
      feature_id: "vision",
      feature_name: "Vision",
      primary_provider: binding,
      locked_input_schema: { name: "input", fields: [] },
      locked_output_schema: { name: "output", fields: [] },
      locked_field_mappings: [],
      locked_capabilities: [{ kind: "vision-input" }],
      negotiated_at: "2026-01-01T00:00:00Z"
    };
    const locked: LockedFeature = {
      ...summary,
      negotiation_result: {
        status: "adapted",
        contract: summary,
        changes: ["image_url converted to base64"]
      }
    };
    assert.equal(locked.negotiation_result.status, "adapted");
    if (locked.negotiation_result.status === "adapted") {
      assert.deepEqual(locked.negotiation_result.changes, ["image_url converted to base64"]);
    }
  });
});

describe("BreakingChange", () => {
  test("creates a compatible change", () => {
    const change: BreakingChange = {
      change_id: "bc-001",
      description: "Added optional field 'seed'",
      affected_features: ["text-gen"],
      planned_at: "2026-06-01T00:00:00Z",
      severity: "compatible"
    };
    assert.equal(change.severity, "compatible");
    assert.equal(change.migration_guide, undefined);
  });

  test("creates a deprecated change with migration guide", () => {
    const change: BreakingChange = {
      change_id: "bc-002",
      description: "Field 'model' is deprecated, use 'model_id'",
      affected_features: ["text-gen", "code-gen"],
      planned_at: "2026-06-01T00:00:00Z",
      severity: "deprecated",
      migration_guide: "Replace 'model' with 'model_id' in all feature calls"
    };
    assert.equal(change.severity, "deprecated");
    assert.equal(change.migration_guide, "Replace 'model' with 'model_id' in all feature calls");
  });

  test("creates a breaking change", () => {
    const change: BreakingChange = {
      change_id: "bc-003",
      description: "Removed field 'legacy_mode'",
      affected_features: ["text-gen"],
      planned_at: "2026-06-01T00:00:00Z",
      severity: "breaking",
      migration_guide: "Remove all references to 'legacy_mode'"
    };
    assert.equal(change.severity, "breaking");
    assert.equal(change.affected_features.length, 1);
  });
});

describe("LockedProvider", () => {
  test("creates a locked provider", () => {
    const lp: LockedProvider = {
      provider_name: "openai",
      provider_adapter_version: "1.0.0",
      provider_api_version: "v1",
      dependent_features: ["text-gen", "code-gen"]
    };
    assert.equal(lp.provider_name, "openai");
    assert.deepEqual(lp.dependent_features, ["text-gen", "code-gen"]);
  });

  test("creates with health check and breaking changes", () => {
    const lp: LockedProvider = {
      provider_name: "openai",
      provider_adapter_version: "1.0.0",
      provider_api_version: "v1",
      dependent_features: ["text-gen"],
      last_health_check: "2026-01-01T00:00:00Z",
      breaking_changes_pending: [{
        change_id: "bc-001",
        description: "API v2 migration",
        affected_features: ["text-gen"],
        planned_at: "2026-06-01T00:00:00Z",
        severity: "deprecated"
      }]
    };
    assert.equal(lp.last_health_check, "2026-01-01T00:00:00Z");
    assert.equal(lp.breaking_changes_pending?.length, 1);
  });
});

describe("ApiKeyWebhookEvent", () => {
  test("creates key.expiring_soon event", () => {
    const event: ApiKeyWebhookEvent = { type: "key.expiring_soon", data: { days_remaining: 7 } };
    assert.equal(event.type, "key.expiring_soon");
    if (event.type === "key.expiring_soon") assert.equal(event.data.days_remaining, 7);
  });

  test("creates key.grace_period_started event", () => {
    const event: ApiKeyWebhookEvent = { type: "key.grace_period_started", data: { grace_ends_at: "2026-02-01T00:00:00Z" } };
    assert.equal(event.type, "key.grace_period_started");
  });

  test("creates key.expired event", () => {
    const event: ApiKeyWebhookEvent = { type: "key.expired", data: { schema_retention_days: 30 } };
    assert.equal(event.type, "key.expired");
  });

  test("creates schema.breaking_change event", () => {
    const event: ApiKeyWebhookEvent = {
      type: "schema.breaking_change",
      data: {
        change_id: "bc-001",
        description: "API migration",
        affected_features: ["text-gen"],
        planned_at: "2026-06-01T00:00:00Z",
        severity: "breaking"
      }
    };
    assert.equal(event.type, "schema.breaking_change");
  });

  test("creates schema.deprecated event", () => {
    const event: ApiKeyWebhookEvent = {
      type: "schema.deprecated",
      data: { feature_id: "legacy-gen", sunset_date: "2026-12-01T00:00:00Z" }
    };
    assert.equal(event.type, "schema.deprecated");
  });
});

describe("LockedApiKey", () => {
  test("creates an active API key", () => {
    const key: LockedApiKey = {
      key_id: "key-001",
      tier: "standard",
      issued_at: "2026-01-01T00:00:00Z",
      expires_at: "2027-01-01T00:00:00Z",
      grace_period_ends_at: null,
      status: "active",
      webhook_events: []
    };
    assert.equal(key.key_id, "key-001");
    assert.equal(key.tier, "standard");
    assert.equal(key.status, "active");
    assert.equal(key.grace_period_ends_at, null);
  });

  test("creates a perpetual API key with no expiry", () => {
    const key: LockedApiKey = {
      key_id: "key-perp",
      tier: "perpetual",
      issued_at: "2026-01-01T00:00:00Z",
      expires_at: null,
      grace_period_ends_at: null,
      status: "active",
      webhook_events: []
    };
    assert.equal(key.tier, "perpetual");
    assert.equal(key.expires_at, null);
  });

  test("creates an expiring key with webhook", () => {
    const key: LockedApiKey = {
      key_id: "key-exp",
      tier: "short",
      issued_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-02-01T00:00:00Z",
      grace_period_ends_at: "2026-02-15T00:00:00Z",
      status: "expiring_soon",
      webhook_url: "https://example.com/webhook",
      webhook_events: [{ type: "key.expiring_soon", data: { days_remaining: 3 } }]
    };
    assert.equal(key.status, "expiring_soon");
    assert.equal(key.webhook_events.length, 1);
  });
});

describe("ServerSchema", () => {
  test("creates a complete server schema", () => {
    const binding: ProviderBinding = {
      provider_name: "openai",
      provider_adapter_version: "1.0.0",
      provider_api_version: "v1"
    };
    const summary: LockedFeatureSummary = {
      feature_id: "text-gen",
      feature_name: "Text Generation",
      primary_provider: binding,
      locked_input_schema: { name: "input", fields: [{ name: "prompt", type: "string", required: true }] },
      locked_output_schema: { name: "output", fields: [{ name: "text", type: "string" }] },
      locked_field_mappings: [],
      locked_capabilities: [],
      negotiated_at: "2026-01-01T00:00:00Z"
    };
    const server: ServerSchema = {
      agent_id: "my-agent",
      schema_version: "1.0.0",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      locked_features: [{
        ...summary,
        negotiation_result: { status: "accepted", contract: summary }
      }],
      locked_providers: [{
        provider_name: "openai",
        provider_adapter_version: "1.0.0",
        provider_api_version: "v1",
        dependent_features: ["text-gen"]
      }],
      api_key: {
        key_id: "key-001",
        tier: "standard",
        issued_at: "2026-01-01T00:00:00Z",
        expires_at: "2027-01-01T00:00:00Z",
        grace_period_ends_at: null,
        status: "active",
        webhook_events: []
      }
    };
    assert.equal(server.agent_id, "my-agent");
    assert.equal(server.locked_features.length, 1);
    assert.equal(server.locked_providers.length, 1);
    assert.equal(server.api_key.key_id, "key-001");
  });
});

describe("ProviderFeature", () => {
  test("creates a provider feature with field_mappings", () => {
    const pf: ProviderFeature = {
      id: "text-generation",
      intent: "generate text from prompts",
      name: "Text Generation",
      input: { fields: [{ name: "prompt", type: "string", required: true }] },
      output: { fields: [{ name: "text", type: "string" }] },
      field_mappings: [{
        provider_field: "model_prompt",
        canonical_field: "prompt",
        required: true
      }]
    };
    assert.equal(pf.id, "text-generation");
    assert.equal(pf.field_mappings.length, 1);
    assert.equal(pf.field_mappings[0].canonical_field, "prompt");
  });

  test("creates with pricing and limits", () => {
    const pricing: ProviderPricing = {
      model: "gpt-4",
      cost_per_request: { "text-generation": 0.03 },
      currency: "USD"
    };
    const pf: ProviderFeature = {
      id: "text-gen",
      intent: "generate text",
      name: "Text Gen",
      input: { fields: [] },
      output: { fields: [] },
      field_mappings: [],
      pricing,
      limits: { max_tokens: 4096, rpm: 60 }
    };
    assert.equal(pf.pricing?.model, "gpt-4");
    assert.equal(pf.pricing?.cost_per_request?.["text-generation"], 0.03);
    assert.equal(pf.limits?.max_tokens, 4096);
  });

  test("creates with description", () => {
    const pf: ProviderFeature = {
      id: "text-gen",
      intent: "generate text",
      name: "Text Gen",
      description: "High-quality text generation",
      input: { fields: [] },
      output: { fields: [] },
      field_mappings: []
    };
    assert.equal(pf.description, "High-quality text generation");
  });

  test("creates field_mappings with transform", () => {
    const pf: ProviderFeature = {
      id: "image-gen",
      intent: "generate images",
      name: "Image Gen",
      input: { fields: [{ name: "prompt", type: "string", required: true }] },
      output: { fields: [{ name: "image_url", type: "string" }] },
      field_mappings: [{
        provider_field: "encoded_image",
        canonical_field: "image_url",
        transform: "base64_decode",
        required: true,
        fallback: "https://placeholder.com/image.png"
      }]
    };
    assert.equal(pf.field_mappings[0].transform, "base64_decode");
    assert.equal(pf.field_mappings[0].fallback, "https://placeholder.com/image.png");
  });
});

describe("ProviderCard", () => {
  test("creates a provider card", () => {
    const card: ProviderCard = {
      provider: {
        id: "openai",
        name: "OpenAI",
        version: "1.0.0",
        api_version: "v1",
        base_url: "https://api.openai.com",
        auth_type: "Bearer"
      },
      features: []
    };
    assert.equal(card.provider.id, "openai");
    assert.equal(card.provider.name, "OpenAI");
    assert.equal(card.provider.auth_type, "Bearer");
    assert.equal(card.features.length, 0);
  });

  test("creates a provider card with features", () => {
    const card: ProviderCard = {
      provider: {
        id: "anthropic",
        name: "Anthropic",
        version: "1.0.0",
        api_version: "v1",
        base_url: "https://api.anthropic.com",
        auth_type: "APIKey"
      },
      features: [{
        id: "text-gen",
        intent: "generate text",
        name: "Text Gen",
        input: { fields: [{ name: "prompt", type: "string" }] },
        output: { fields: [{ name: "text", type: "string" }] },
        field_mappings: []
      }]
    };
    assert.equal(card.features.length, 1);
    assert.equal(card.features[0].id, "text-gen");
  });

  test("creates with OAuth2 auth type", () => {
    const card: ProviderCard = {
      provider: {
        id: "google",
        name: "Google AI",
        version: "1.0.0",
        api_version: "v1",
        base_url: "https://generativelanguage.googleapis.com",
        auth_type: "OAuth2"
      },
      features: []
    };
    assert.equal(card.provider.auth_type, "OAuth2");
  });
});

describe("SchemaMapping", () => {
  test("creates a schema mapping with fields and reverse_fields", () => {
    const mapping: SchemaMapping = {
      id: "mapping-001",
      capability_id: "text-generation",
      provider_id: "openai",
      version: "1.0.0",
      fields: [{
        provider_field: "model_prompt",
        canonical_field: "prompt",
        required: true
      }],
      reverse_fields: [{
        provider_field: "prompt",
        canonical_field: "model_prompt",
        required: true
      }]
    };
    assert.equal(mapping.id, "mapping-001");
    assert.equal(mapping.capability_id, "text-generation");
    assert.equal(mapping.provider_id, "openai");
    assert.equal(mapping.fields.length, 1);
    assert.equal(mapping.reverse_fields.length, 1);
  });

  test("creates with transform on fields", () => {
    const mapping: SchemaMapping = {
      id: "mapping-002",
      capability_id: "image-gen",
      provider_id: "stability",
      version: "1.0.0",
      fields: [{
        provider_field: "encoded_image",
        canonical_field: "image_url",
        transform: "base64_decode",
        required: true
      }],
      reverse_fields: [{
        provider_field: "image_url",
        canonical_field: "encoded_image",
        transform: "base64_decode",
        required: true
      }]
    };
    assert.equal(mapping.fields[0].transform, "base64_decode");
    assert.equal(mapping.reverse_fields[0].transform, "base64_decode");
  });

  test("creates with fallback on fields", () => {
    const mapping: SchemaMapping = {
      id: "mapping-003",
      capability_id: "text-gen",
      provider_id: "openai",
      version: "1.0.0",
      fields: [{
        provider_field: "temp",
        canonical_field: "temperature",
        required: false,
        fallback: 0.7
      }],
      reverse_fields: [{
        provider_field: "temperature",
        canonical_field: "temp",
        required: false
      }]
    };
    assert.equal(mapping.fields[0].fallback, 0.7);
  });
});
