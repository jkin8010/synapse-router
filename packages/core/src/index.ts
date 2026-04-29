import { createHash } from "node:crypto";

// ─── Existing Types (preserved) ────────────────────────────────────────────

export type DSLType = "string" | "number" | "boolean" | "enum" | "image";

export interface Field {
  name: string;
  type: DSLType;
  required?: boolean;
  enumValues?: string[];
  fields?: Field[];
}

export interface Schema {
  name: string;
  version?: string;
  fields: Field[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Existing Functions (preserved) ────────────────────────────────────────

const MAX_FIELDS = 10;
const MAX_DEPTH = 2;
const MAX_ENUM_VALUES = 10;

export function validateSchema(schema: Schema): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(schema.name)) {
    errors.push("schema name is required");
  }

  validateFields(schema.fields, "fields", 1, errors);

  return {
    valid: errors.length === 0,
    errors
  };
}

export function normalizeSchema(schema: Schema): Schema {
  return sortObjectKeys({
    ...schema,
    fields: normalizeFields(schema.fields)
  }) as Schema;
}

export function hashSchema(schema: Schema): string {
  const normalized = normalizeSchema(schema);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

// ─── New Types: Dual Schema Design ─────────────────────────────────────────

/**
 * 4种接入方式：API / MCP / CLI / A2A
 */
export type AccessProtocol =
  | { kind: "api"; endpoint?: string; auth_type: "APIKey" | "Bearer" | "OAuth2" }
  | { kind: "mcp"; server_url: string; tools?: string[] }
  | { kind: "cli"; command: string; args?: string[] }
  | { kind: "a2a"; agent_url: string; skill?: string };

/**
 * 字段映射：Provider 原始字段 → Agent 语义字段
 */
export interface FieldMapping {
  provider_field: string;
  canonical_field: string;
  transform?: "passthrough" | "extract_url" | "base64_decode" | "json_parse" | "cast_number";
  required: boolean;
  fallback?: unknown;
}

/**
 * Agent 视角的字段映射：保留 agent_field 作为 Agent 侧字段名
 */
export interface AgentFieldMapping extends FieldMapping {
  agent_field: string;
}

/**
 * 5种能力类型（+ controlnet 扩展）
 */
export type CapabilityRequirement =
  | { kind: "structured-output"; strict: boolean }
  | { kind: "tool-calling"; tools: string[] }
  | { kind: "vision-input" }
  | { kind: "streaming"; required: boolean }
  | { kind: "image-generation"; modalities: string[] }
  | { kind: "controlnet"; types: string[] };

/**
 * 功能策略偏好
 */
export interface FeaturePolicy {
  preferred_provider?: string;
  allow_fallback?: boolean;
  allow_schema_adaptation?: boolean;
  version_lock?: boolean;
}

/**
 * Agent 功能声明
 */
export interface AgentFeature {
  feature_id: string;
  feature_name: string;
  intent: string;

  input_schema: Schema;
  output_schema: Schema;

  field_mappings?: AgentFieldMapping[];
  capabilities: CapabilityRequirement[];
  policy?: FeaturePolicy;
}

/**
 * Agent 全局策略
 */
export interface AgentGlobalPolicy {
  preferred_strategy?: "cheap" | "fast" | "quality";
  max_cost_per_request?: number;
  max_latency_ms?: number;
  allowed_providers?: string[];
  blocked_providers?: string[];
}

/**
 * Agent Schema — Agent 持有的需求声明
 * "我需要什么"
 */
export interface AgentSchema {
  agent_id: string;
  agent_name: string;
  version: string;

  access_protocol: AccessProtocol;
  features: AgentFeature[];
  global_policy?: AgentGlobalPolicy;
}

/**
 * Provider 绑定
 */
export interface ProviderBinding {
  provider_name: string;
  provider_adapter_version: string;
  provider_api_version: string;
}

/**
 * 锁定的字段映射
 */
export interface LockedFieldMapping {
  provider_field: string;
  canonical_field: string;
  transform: "passthrough" | "extract_url" | "base64_decode" | "json_parse" | "cast_number";
  required: boolean;
  fallback?: unknown;
  verified_at: string;
}

/**
 * 锁定功能摘要（不含协商结果，用于打破循环引用）
 */
export interface LockedFeatureSummary {
  feature_id: string;
  feature_name: string;
  primary_provider: ProviderBinding;
  fallback_provider?: ProviderBinding;
  locked_input_schema: Schema;
  locked_output_schema: Schema;
  locked_field_mappings: LockedFieldMapping[];
  locked_capabilities: CapabilityRequirement[];
  negotiated_at: string;
}

/**
 * 协商结果（引用 Summary 而非完整 LockedFeature，打破循环引用）
 */
export type NegotiationResult =
  | { status: "accepted"; contract: LockedFeatureSummary }
  | { status: "adapted"; contract: LockedFeatureSummary; changes: string[] }
  | { status: "rejected"; reasons: string[] };

/**
 * 锁定的功能（扩展摘要，增加协商结果）
 */
export interface LockedFeature extends LockedFeatureSummary {
  negotiation_result: NegotiationResult;
}

/**
 * 破坏变更
 */
export interface BreakingChange {
  change_id: string;
  description: string;
  affected_features: string[];
  planned_at: string;
  severity: "compatible" | "deprecated" | "breaking";
  migration_guide?: string;
}

/**
 * 锁定的 Provider
 */
export interface LockedProvider {
  provider_name: string;
  provider_adapter_version: string;
  provider_api_version: string;
  dependent_features: string[];
  last_health_check?: string;
  breaking_changes_pending?: BreakingChange[];
}

/**
 * API Key Webhook 事件
 */
export type ApiKeyWebhookEvent =
  | { type: "key.expiring_soon"; data: { days_remaining: number } }
  | { type: "key.grace_period_started"; data: { grace_ends_at: string } }
  | { type: "key.expired"; data: { schema_retention_days: number } }
  | { type: "schema.breaking_change"; data: BreakingChange }
  | { type: "schema.deprecated"; data: { feature_id: string; sunset_date: string } };

/**
 * 锁定的 API Key
 */
export interface LockedApiKey {
  key_id: string;
  tier: "trial" | "short" | "standard" | "long" | "perpetual";
  issued_at: string;
  expires_at: string | null;
  grace_period_ends_at: string | null;
  status: "active" | "expiring_soon" | "grace_period" | "expired";
  webhook_url?: string;
  webhook_events: ApiKeyWebhookEvent[];
}

/**
 * Server Schema — 服务端锁定文件
 * "我承诺提供什么" — 类似 package-lock.json
 */
export interface ServerSchema {
  agent_id: string;
  schema_version: string;
  created_at: string;
  updated_at: string;

  locked_features: LockedFeature[];
  locked_providers: LockedProvider[];
  api_key: LockedApiKey;
}

/**
 * Provider 功能定价
 */
export interface ProviderPricing {
  model: string;
  cost_per_request?: Record<string, number>;
  currency?: string;
}

/**
 * Provider 功能（含字段映射和定价）
 */
export interface ProviderFeature {
  id: string;
  intent: string;
  name: string;
  description?: string;

  input: {
    fields: Field[];
  };
  output: {
    fields: Field[];
  };

  field_mappings: FieldMapping[];
  pricing?: ProviderPricing;
  limits?: Record<string, number | string>;
}

/**
 * SchemaMapping 字段（与 v0.4 规范对齐）
 */
export interface SchemaMappingField {
  provider_field: string;
  canonical_field: string;
  transform?: "passthrough" | "extract_url" | "base64_decode" | "json_parse" | "cast_number";
  required: boolean;
  fallback?: unknown;
}

/**
 * Provider Pack 核心卡片
 */
export interface ProviderCard {
  provider: {
    id: string;
    name: string;
    docs_url?: string;
  };
  service: {
    id: string;
    name: string;
    version: string;
    api_version: string;
    base_url: string;
    auth_type: "APIKey" | "Bearer" | "OAuth2";
  };
  features: ProviderFeature[];
}

/**
 * 独立的字段映射文档
 */
export interface SchemaMapping {
  id: string;
  capability_id: string;
  provider_id: string;
  service_id: string;
  version: string;
  fields: SchemaMappingField[];
  reverse_fields: SchemaMappingField[];
}

// ─── Existing Internal Helpers (preserved) ─────────────────────────────────

function validateFields(fields: Field[], path: string, depth: number, errors: string[]): void {
  if (depth > MAX_DEPTH) {
    errors.push(`${path} depth cannot exceed ${MAX_DEPTH}`);
    return;
  }

  if (!Array.isArray(fields)) {
    errors.push(`${path} must be an array`);
    return;
  }

  if (fields.length > MAX_FIELDS) {
    errors.push(`${path} can contain at most ${MAX_FIELDS} fields`);
  }

  const names = new Set<string>();

  for (const field of fields) {
    const fieldPath = `${path}.${field.name || "<unnamed>"}`;

    if (!isNonEmptyString(field.name)) {
      errors.push(`${fieldPath} name is required`);
    } else if (names.has(field.name)) {
      errors.push(`${fieldPath} name must be unique`);
    } else {
      names.add(field.name);
    }

    validateFieldType(field, fieldPath, errors);

    if (field.fields !== undefined) {
      validateFields(field.fields, `${fieldPath}.fields`, depth + 1, errors);
    }
  }
}

function validateFieldType(field: Field, fieldPath: string, errors: string[]): void {
  switch (field.type) {
    case "string":
    case "number":
    case "boolean":
    case "image":
      if (field.enumValues !== undefined) {
        errors.push(`${fieldPath} enumValues are only allowed for enum fields`);
      }
      return;
    case "enum":
      validateEnumField(field, fieldPath, errors);
      return;
    default: {
      const unsupportedType: never = field.type;
      errors.push(`${fieldPath} has unsupported type "${String(unsupportedType)}"`);
      return;
    }
  }
}

function validateEnumField(field: Field, fieldPath: string, errors: string[]): void {
  if (!Array.isArray(field.enumValues) || field.enumValues.length === 0) {
    errors.push(`enum field "${field.name}" must define enumValues`);
    return;
  }

  if (field.enumValues.length > MAX_ENUM_VALUES) {
    errors.push(`enum field "${field.name}" cannot have more than ${MAX_ENUM_VALUES} values`);
  }

  for (const value of field.enumValues) {
    if (!isNonEmptyString(value)) {
      errors.push(`${fieldPath} enumValues must be non-empty strings`);
    }
  }
}

function normalizeFields(fields: Field[]): Field[] {
  return [...fields]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((field) => {
      const normalized: Field = { ...field };

      if (normalized.enumValues !== undefined) {
        normalized.enumValues = [...normalized.enumValues].sort();
      }

      if (normalized.fields !== undefined) {
        normalized.fields = normalizeFields(normalized.fields);
      }

      return sortObjectKeys(normalized) as Field;
    });
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
