/**
 * Pack Generator — generates Provider Pack from OpenAPI Schema
 *
 * Output:
 *   provider-card.json  → ProviderCard
 *   dsl/*.json          → AgentSchema per path+method
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  type AccessProtocol,
  type AgentFeature,
  type AgentSchema,
  type CapabilityRequirement,
  type FieldMapping,
  type ProviderCard,
  type ProviderFeature,
  type Field,
  type Schema,
  type ProviderPricing,
} from "@synapse-router/core";

// ─── OpenAPI Types ─────────────────────────────────────────────────────────

interface OpenAPISpec {
  openapi?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string }>;
  security?: Record<string, unknown>[];
  securitySchemes?: Record<string, SecurityScheme>;
  paths: Record<string, PathItem>;
}

interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, OAuthFlow>;
}

interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: Record<string, string>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
  options?: Operation;
  head?: Operation;
  trace?: Operation;
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  security?: Record<string, unknown>[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
}

interface RequestBody {
  required?: boolean;
  content: Record<string, MediaType>;
}

interface MediaType {
  schema?: JSONSchema;
}

interface Response {
  description?: string;
  content?: Record<string, MediaType>;
}

interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  $ref?: string;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
}

// ─── Intent Patterns ────────────────────────────────────────────────────────

interface IntentPattern {
  pattern: RegExp;
  intent: string;
  capability: CapabilityRequirement;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    pattern: /\/images?\/generations?/i,
    intent: "text-to-image",
    capability: { kind: "image-generation", modalities: ["png", "jpeg", "webp"] },
  },
  {
    pattern: /\/chat\/completions?/i,
    intent: "chat",
    capability: { kind: "structured-output", strict: false },
  },
  {
    pattern: /\/embeddings?/i,
    intent: "embeddings",
    capability: { kind: "tool-calling", tools: [] },
  },
  {
    pattern: /\/completions?/i,
    intent: "text-generation",
    capability: { kind: "structured-output", strict: false },
  },
  {
    pattern: /\/audio\/speech/i,
    intent: "text-to-speech",
    capability: { kind: "streaming", required: false },
  },
  {
    pattern: /\/audio\/transcriptions?/i,
    intent: "speech-to-text",
    capability: { kind: "vision-input" },
  },
  {
    pattern: /\/vision/i,
    intent: "vision",
    capability: { kind: "vision-input" },
  },
];

// ─── Field Aliases ─────────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  prompt: ["prompt", "input", "text", "message", "content"],
  model: ["model", "engine", "model_id", "modelName"],
  temperature: ["temperature", "temp"],
  max_tokens: [
    "max_tokens",
    "maxToken",
    "maxOutputTokens",
    "max_completion_tokens",
    "max_tokens_to_sample",
  ],
  top_p: ["top_p", "topP", "nucleus_sampling"],
  image_url: ["image_url", "imageUrl", "image", "url", "input_image"],
  n: ["n", "num_images", "number_of_images", "batch_size", "num_outputs"],
  seed: ["seed", "random_seed"],
  guidance_scale: ["guidance_scale", "guidanceScale", "cfg_scale"],
  steps: ["steps", "num_steps", "sampling_steps"],
  width: ["width", "image_width"],
  height: ["height", "image_height"],
  prompt_embedding: ["prompt_embedding", "prompt_embeddings", "input_ids"],
};

// ─── Options ───────────────────────────────────────────────────────────────

export interface PackGeneratorOptions {
  providerId?: string;
  providerName?: string;
  apiVersion?: string;
  docsUrl?: string;
  authType?: "APIKey" | "Bearer" | "OAuth2";
  agentId?: string;
  agentName?: string;
  agentVersion?: string;
}

// ─── Schema Conversion ──────────────────────────────────────────────────────

function openApiSchemaToFields(
  name: string,
  schema?: JSONSchema,
  requiredFields?: string[]
): Field[] {
  if (!schema) return [];

  // Handle $ref — treat as opaque value
  if (schema.$ref) {
    return [{ name: "value", type: "string" }];
  }

  // Handle allOf/anyOf/oneOf — flatten subschemas
  if (schema.allOf || schema.anyOf || schema.oneOf) {
    const subschemas = schema.allOf || schema.anyOf || schema.oneOf || [];
    const merged: Field[] = [];
    for (const sub of subschemas) {
      merged.push(...openApiSchemaToFields("child", sub, requiredFields));
    }
    return merged;
  }

  if (schema.type === "array" && schema.items) {
    const itemFields = openApiSchemaToFields("item", schema.items, requiredFields);
    return [{ name: "items", type: "string", fields: itemFields.length > 0 ? itemFields : undefined }];
  }

  if (schema.type === "object" || schema.properties) {
    const fields: Field[] = [];
    const props = schema.properties || {};
    const required = requiredFields || schema.required || [];

    for (const [propName, propSchema] of Object.entries(props)) {
      const fieldType = jsonSchemaTypeToFieldType(propSchema);
      const field: Field = {
        name: propName,
        type: fieldType,
        required: required.includes(propName),
      };
      if (propSchema.type === "object" || propSchema.properties) {
        field.fields = openApiSchemaToFields(propName, propSchema, propSchema.required);
      }
      if (propSchema.enum) {
        field.enumValues = propSchema.enum as string[];
      }
      fields.push(field);
    }
    return fields;
  }

  // Scalar
  return [
    {
      name: "value",
      type: jsonSchemaTypeToFieldType(schema),
      required: false,
    },
  ];
}

function jsonSchemaTypeToFieldType(schema?: JSONSchema): Field["type"] {
  if (!schema) return "string";
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "string"; // arrays serialized as JSON string in this schema format
    case "object":
      return "string";
    default:
      return "string";
  }
}

// ─── Intent Inference ───────────────────────────────────────────────────────

function inferIntent(
  operationId: string | undefined,
  apiPath: string
): { intent: string; capability: CapabilityRequirement } {
  const searchText = `${operationId || ""} ${apiPath}`;

  for (const { pattern, intent, capability } of INTENT_PATTERNS) {
    if (pattern.test(searchText)) {
      return { intent, capability };
    }
  }

  // Fallback: derive from operationId
  if (operationId) {
    const lower = operationId.toLowerCase();
    if (lower.includes("image") || lower.includes("generate")) {
      return {
        intent: "image-generation",
        capability: { kind: "image-generation", modalities: ["png"] },
      };
    }
    if (lower.includes("chat") || lower.includes("completion")) {
      return { intent: "text-generation", capability: { kind: "structured-output", strict: false } };
    }
    if (lower.includes("embed")) {
      return { intent: "embeddings", capability: { kind: "tool-calling", tools: [] } };
    }
  }

  return { intent: "text-generation", capability: { kind: "structured-output", strict: false } };
}

// ─── Field Mapping Generation ────────────────────────────────────────────────

function generateFieldMappings(fields: Field[]): FieldMapping[] {
  return fields.map((field) => ({
    provider_field: field.name,
    canonical_field: findCanonicalField(field.name),
    required: field.required ?? false,
  }));
}

function findCanonicalField(providerField: string): string {
  const normalized = providerField.toLowerCase().replace(/[_-]/g, "");
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (alias.toLowerCase().replace(/[_-]/g, "") === normalized) {
        return canonical;
      }
    }
  }
  return providerField;
}

// ─── Auth Type Detection ────────────────────────────────────────────────────

function detectAuthType(
  securitySchemes?: Record<string, SecurityScheme>
): "APIKey" | "Bearer" | "OAuth2" {
  if (!securitySchemes) return "APIKey";
  for (const [, scheme] of Object.entries(securitySchemes)) {
    if (scheme.type === "oauth2") return "OAuth2";
    if (scheme.type === "http" && scheme.scheme === "bearer") return "Bearer";
    if (scheme.type === "apiKey") return "APIKey";
  }
  return "APIKey";
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export interface DSLFile {
  path: string;
  content: AgentSchema;
}

export interface GeneratedPack {
  providerCard: ProviderCard;
  dslFiles: DSLFile[];
}

/**
 * Generate a Provider Pack from an OpenAPI 3.0 spec object
 */
export function generatePack(
  openApiSpec: OpenAPISpec,
  options: PackGeneratorOptions = {}
): GeneratedPack {
  const {
    providerId = slugify(openApiSpec.info.title),
    providerName = openApiSpec.info.title,
    apiVersion = openApiSpec.info.version,
    docsUrl,
    authType = detectAuthType(openApiSpec.securitySchemes),
    agentId = `${slugify(openApiSpec.info.title)}-agent`,
    agentName = `${openApiSpec.info.title} Agent`,
    agentVersion = "1.0.0",
  } = options;

  const baseUrl = openApiSpec.servers?.[0]?.url ?? "";
  const providerFeatures: ProviderFeature[] = [];
  const agentFeatures: AgentFeature[] = [];

  for (const [apiPath, pathItem] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!isHttpMethod(method) || !operation) continue;

      const operationId = operation.operationId || `${method}_${apiPath.replace(/\//g, "_")}`;
      const featureName = operation.summary || operation.operationId || `${method} ${apiPath}`;
      const featureDescription = operation.description || operation.summary || "";

      // Input: requestBody JSON schema → Field[]
      const requestBody = operation.requestBody?.content?.["application/json"]?.schema;
      const inputFields = openApiSchemaToFields(
        `${operationId}_input`,
        requestBody,
        requestBody?.required
      );

      // Output: 200/201 response JSON schema → Field[]
      let outputFields: Field[] = [];
      for (const statusCode of ["200", "201"]) {
        const response = operation.responses[statusCode];
        if (response?.content?.["application/json"]?.schema) {
          const responseSchema = response.content["application/json"].schema;
          outputFields = openApiSchemaToFields(`${operationId}_output`, responseSchema);
          break;
        }
      }

      const fieldMappings = generateFieldMappings(inputFields);
      const { intent, capability } = inferIntent(operationId, apiPath);

      // Provider feature
      const providerFeature: ProviderFeature = {
        id: operationId,
        intent,
        name: featureName,
        description: featureDescription,
        input: { fields: inputFields },
        output: { fields: outputFields },
        field_mappings: fieldMappings,
      };
      providerFeatures.push(providerFeature);

      // Agent feature
      const agentFeature: AgentFeature = {
        feature_id: operationId,
        feature_name: featureName,
        intent,
        input_schema: { name: `${operationId}_input`, fields: inputFields },
        output_schema: { name: `${operationId}_output`, fields: outputFields },
        field_mappings: fieldMappings.map((fm) => ({
          ...fm,
          agent_field: fm.canonical_field,
        })),
        capabilities: [capability],
      };
      agentFeatures.push(agentFeature);
    }
  }

  const providerCard: ProviderCard = {
    provider: {
      id: providerId,
      name: providerName,
      version: openApiSpec.info.version,
      api_version: apiVersion,
      base_url: baseUrl,
      auth_type: authType,
    },
    features: providerFeatures,
  };

  const accessProtocol: AccessProtocol = {
    kind: "api",
    auth_type: authType,
  };

  const dslFiles: DSLFile[] = agentFeatures.map((feat) => ({
    path: `dsl/${slugify(feat.feature_id)}.json`,
    content: {
      agent_id: agentId,
      agent_name: agentName,
      version: agentVersion,
      access_protocol: accessProtocol,
      features: [feat],
    },
  }));

  return { providerCard, dslFiles };
}

/**
 * Fetch OpenAPI spec from URL and generate Pack
 */
export async function generatePackFromURL(
  specUrl: string,
  options: PackGeneratorOptions = {}
): Promise<GeneratedPack> {
  const res = await fetch(specUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${specUrl}: ${res.status} ${res.statusText}`
    );
  }
  const openApiSpec = (await res.json()) as OpenAPISpec;
  return generatePack(openApiSpec, options);
}

/**
 * Write a generated Pack to disk
 */
export async function writePack(
  outputDir: string,
  providerCard: ProviderCard,
  dslFiles: DSLFile[]
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
  const dslDir = path.join(outputDir, "dsl");
  await fs.mkdir(dslDir, { recursive: true });

  const cardPath = path.join(outputDir, "provider-card.json");
  await fs.writeFile(cardPath, JSON.stringify(providerCard, null, 2), "utf-8");

  for (const { path: filePath, content } of dslFiles) {
    const fullPath = path.join(outputDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(content, null, 2), "utf-8");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
]);

function isHttpMethod(key: string): boolean {
  return HTTP_METHODS.has(key);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
