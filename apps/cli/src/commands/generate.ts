// @synapse-router/cli — `synapse generate` command
// Generate a Provider Pack from an OpenAPI spec (URL or local file)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, extname, resolve, isAbsolute } from "node:path";
// Use global fetch (Node 18+)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateCommandOptions {
  providerId?: string;
  providerName?: string;
  outputDir?: string;
  validate: boolean;
  tarball: boolean;
}

interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info: {
    title?: string;
    version?: string;
    description?: string;
    "x-provider-id"?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        summary?: string;
        description?: string;
        tags?: string[];
        requestBody?: {
          content?: Record<
            string,
            { schema?: { $ref?: string; type?: string; properties?: Record<string, any>; required?: string[] } }
          >;
        };
        responses?: Record<
          string,
          { content?: Record<string, { schema?: { $ref?: string; type?: string; properties?: Record<string, any> } }> }
        >;
      }
    >
  >;
  components?: {
    schemas?: Record<string, any>;
  };
}

interface ProviderCard {
  provider: {
    id: string;
    name: string;
    docs_url: string;
  };
  features: Array<{
    id: string;
    intent: string;
    name: string;
    description: string;
    input: {
      name: string;
      fields: Array<{
        name: string;
        type: string;
        required: boolean;
        description?: string;
        enum?: string[];
      }>;
    };
    output: {
      name: string;
      fields: Array<{ name: string; type: string }>;
    };
    field_mappings: Array<{
      canonical_field: string;
      provider_field: string;
      required: boolean;
      fallback?: any;
      transform?: string;
    }>;
  }>;
  service: {
    id: string;
    name: string;
    version: string;
    api_version: string;
    base_url: string;
    auth_type: string;
  };
}

interface DslDocument {
  agent_id: string;
  agent_name: string;
  version: string;
  access_protocol: {
    kind: string;
    auth_type: string;
  };
  features: Array<{
    feature_id: string;
    feature_name: string;
    intent: string;
    input_schema: {
      name: string;
      fields: Array<{
        name: string;
        type: string;
        required: boolean;
        description?: string;
        enum?: string[];
      }>;
    };
    output_schema: {
      name: string;
      fields: Array<{ name: string; type: string }>;
    };
    field_mappings: Array<{
      canonical_field: string;
      provider_field: string;
      required: boolean;
      fallback?: any;
      transform?: string;
    }>;
    capabilities: Array<{ kind: string; modalities: string[] }>;
  }>;
}

// ---------------------------------------------------------------------------
// Intent inference
// ---------------------------------------------------------------------------

const INTENT_KEYWORDS: Array<{ keywords: string[]; intent: string; capability: { kind: string; modalities: string[] } }> = [
  { keywords: ["chat", "completion", "message"], intent: "chat", capability: { kind: "text-generation", modalities: ["text"] } },
  { keywords: ["embed", "embedding"], intent: "embeddings", capability: { kind: "embedding", modalities: ["text"] } },
  { keywords: ["image", "generat", "dall-e", "dalle"], intent: "text-to-image", capability: { kind: "image-generation", modalities: ["image"] } },
  { keywords: ["transcri", "speech", "whisper", "audio"], intent: "speech-to-text", capability: { kind: "audio-understanding", modalities: ["audio"] } },
  { keywords: ["translate", "translation"], intent: "translation", capability: { kind: "translation", modalities: ["text"] } },
  { keywords: ["moderat"], intent: "moderation", capability: { kind: "content-moderation", modalities: ["text"] } },
  { keywords: ["fine-tun", "finetun"], intent: "fine-tuning", capability: { kind: "model-training", modalities: [] } },
];

function inferIntent(operationId: string, summary: string, path: string): { intent: string; capability: { kind: string; modalities: string[] } } {
  const text = `${operationId} ${summary} ${path}`.toLowerCase();
  for (const { keywords, intent, capability } of INTENT_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) {
      return { intent, capability };
    }
  }
  return { intent: "custom", capability: { kind: "custom", modalities: [] } };
}

// ---------------------------------------------------------------------------
// OpenAPI type → Synapse type mapping
// ---------------------------------------------------------------------------

function openApiTypeToSynapse(schema: any): string {
  if (!schema) return "object";
  if (schema.type === "string") return "string";
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "array") return "array";
  if (schema.type === "object") return "object";
  if (schema.$ref) return "object"; // resolved references would need deeper walking
  return "object";
}

// ---------------------------------------------------------------------------
// Resolve $ref
// ---------------------------------------------------------------------------

function resolveRef(spec: OpenApiSpec, ref: string): any {
  if (!ref.startsWith("#/")) return {};
  const parts = ref.slice(2).split("/");
  let current: any = spec;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return {};
    current = current[part];
  }
  return current ?? {};
}

// ---------------------------------------------------------------------------
// Extract fields from a schema (inline or ref)
// ---------------------------------------------------------------------------

function extractFields(
  spec: OpenApiSpec,
  schema: { $ref?: string; type?: string; properties?: Record<string, any>; required?: string[] }
): Array<{ name: string; type: string; required: boolean; description?: string; enum?: string[] }> {
  const resolved = schema.$ref ? resolveRef(spec, schema.$ref) : schema;
  const properties = resolved.properties ?? {};
  const requiredSet = new Set(resolved.required ?? []);

  return Object.entries(properties).map(([name, propSchema]: [string, any]) => ({
    name,
    type: openApiTypeToSynapse(propSchema),
    required: requiredSet.has(name),
    description: propSchema?.description,
    enum: propSchema?.enum,
  }));
}

// ---------------------------------------------------------------------------
// PascalCase helper
// ---------------------------------------------------------------------------

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Generate feature ID from method + path
// ---------------------------------------------------------------------------

function makeFeatureId(method: string, path: string, operationId?: string): string {
  if (operationId) {
    // Sanitize operationId to a valid ID
    return operationId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
  }
  // Derive from method + path: POST /v1/chat/completions → chat_post_v1_chat_completions
  const pathPart = path.replace(/^\//, "").replace(/\//g, "_").replace(/[{}]/g, "");
  return `${pathPart}_${method}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// Core: generate from OpenAPI spec
// ---------------------------------------------------------------------------

async function generateFromOpenApiSpec(spec: OpenApiSpec, options: GenerateCommandOptions): Promise<void> {
  if (!spec.openapi && !spec.swagger) {
    throw new Error("Input is not a valid OpenAPI spec (missing openapi or swagger field)");
  }

  const rawProviderId =
    options.providerId ??
    spec.info?.["x-provider-id"] ??
    (spec.info?.title ?? "unknown").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const providerName = options.providerName ?? spec.info?.title ?? rawProviderId;
  const baseUrl = spec.servers?.[0]?.url ?? `https://api.${rawProviderId}.com`;

  console.log(`\n📦 Generating pack for: ${providerName} (${rawProviderId})`);
  console.log(`   Base URL: ${baseUrl}`);

  const features: ProviderCard["features"] = [];
  const dslDocuments: Array<{ featureId: string; doc: DslDocument }> = [];

  const paths = spec.paths ?? {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      // Only process HTTP methods
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const featureId = makeFeatureId(method, path, operation.operationId);
      const name = operation.summary ?? toPascalCase(featureId.replace(/_/g, " "));
      const description = operation.description ?? operation.summary ?? "";
      const { intent, capability } = inferIntent(operation.operationId ?? "", operation.summary ?? "", path);

      // Extract input fields from requestBody
      const requestBodySchema = operation.requestBody?.content?.["application/json"]?.schema;
      const inputFields = requestBodySchema ? extractFields(spec, requestBodySchema) : [];

      // Extract output fields from 200 response
      const responseSchema = operation.responses?.["200"]?.content?.["application/json"]?.schema ??
        operation.responses?.["201"]?.content?.["application/json"]?.schema;
      const outputFields = responseSchema
        ? extractFields(spec, responseSchema).map((f) => ({ name: f.name, type: f.type }))
        : [];

      // Generate field_mappings from input fields
      const fieldMappings = inputFields.map((f) => ({
        canonical_field: f.name,
        provider_field: f.name,
        required: f.required,
      }));

      const feature = {
        id: featureId,
        intent,
        name,
        description,
        input: {
          name: `${toPascalCase(featureId)}Input`,
          fields: inputFields,
        },
        output: {
          name: `${toPascalCase(featureId)}Output`,
          fields: outputFields,
        },
        field_mappings: fieldMappings,
      };

      features.push(feature);

      // Build corresponding DSL document
      const dslDoc: DslDocument = {
        agent_id: `${rawProviderId}-${featureId}`,
        agent_name: `${providerName} ${name}`,
        version: "1.0.0",
        access_protocol: {
          kind: "api",
          auth_type: "Bearer",
        },
        features: [
          {
            feature_id: featureId,
            feature_name: name,
            intent,
            input_schema: feature.input,
            output_schema: feature.output,
            field_mappings: fieldMappings,
            capabilities: [capability],
          },
        ],
      };

      dslDocuments.push({ featureId, doc: dslDoc });

      console.log(`   ✓ ${method.toUpperCase().padEnd(7)} ${path.padEnd(40)} → ${featureId} [${intent}]`);
    }
  }

  if (features.length === 0) {
    console.log("\n⚠️  No endpoints found in the spec. Nothing to generate.");
    return;
  }

  // Build provider-card.json
  const providerCard: ProviderCard = {
    provider: {
      id: rawProviderId,
      name: providerName,
      docs_url: "",
    },
    features,
    service: {
      id: rawProviderId,
      name: providerName,
      version: spec.info?.version ?? "1.0.0",
      api_version: spec.info?.version ?? "1.0.0",
      base_url: baseUrl,
      auth_type: "Bearer",
    },
  };

  // Determine output directory
  const outputDir = options.outputDir
    ? isAbsolute(options.outputDir)
      ? options.outputDir
      : resolve(process.cwd(), options.outputDir)
    : resolve(process.cwd(), "generated-packs", rawProviderId);

  // Write files
  await writePack(outputDir, providerCard, dslDocuments);

  console.log(`\n✅ Generated ${features.length} feature(s) in: ${outputDir}/`);
  console.log(`   provider-card.json`);
  console.log(`   dsl/ (${dslDocuments.length} files)`);
}

// ---------------------------------------------------------------------------
// Write pack to disk
// ---------------------------------------------------------------------------

async function writePack(
  outputDir: string,
  providerCard: ProviderCard,
  dslDocuments: Array<{ featureId: string; doc: DslDocument }>
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, "dsl"), { recursive: true });

  // Write provider-card.json
  await writeFile(join(outputDir, "provider-card.json"), JSON.stringify(providerCard, null, 2) + "\n", "utf8");

  // Write DSL files
  for (const { featureId, doc } of dslDocuments) {
    await writeFile(join(outputDir, "dsl", `${featureId}.json`), JSON.stringify(doc, null, 2) + "\n", "utf8");
  }
}

// ---------------------------------------------------------------------------
// Fetch URL
// ---------------------------------------------------------------------------

async function generateFromUrl(url: string, options: GenerateCommandOptions): Promise<void> {
  console.log(`🌐 Fetching: ${url}`);

  const response = await fetch(url, {
    headers: { Accept: "application/json, application/yaml, text/yaml, */*" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  let spec: any;
  try {
    spec = JSON.parse(text);
  } catch {
    // Not JSON — check if it looks like YAML (which we won't parse) or HTML/Markdown
    if (contentType.includes("html") || text.trimStart().startsWith("<") || text.trimStart().startsWith("#")) {
      console.log(`\n⚠️  非 OpenAPI 格式的文档需要 LLM 解析。`);
      console.log(`请使用 Synapse Registry 的 Web 界面或 API 进行生成：`);
      console.log(`  POST https://registry.synapse.dev/api/v1/generation/jobs`);
      return;
    }
    // Try simple YAML detection (we don't have a YAML parser, so give a helpful message)
    console.log(`\n⚠️  收到非 JSON 响应。如果这是 YAML 格式的 OpenAPI spec，请先转换为 JSON。`);
    console.log(`提示：可以用在线工具如 https://editor.swagger.io 将 YAML 转为 JSON。`);
    return;
  }

  // Check if it's an OpenAPI spec
  if (!spec.openapi && !spec.swagger) {
    console.log(`\n⚠️  非 OpenAPI 格式的文档需要 LLM 解析。`);
    console.log(`请使用 Synapse Registry 的 Web 界面或 API 进行生成：`);
    console.log(`  POST https://registry.synapse.dev/api/v1/generation/jobs`);
    return;
  }

  await generateFromOpenApiSpec(spec as OpenApiSpec, options);
}

// ---------------------------------------------------------------------------
// Read local file
// ---------------------------------------------------------------------------

async function generateFromFile(filePath: string, options: GenerateCommandOptions): Promise<void> {
  const absPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  console.log(`📂 Reading: ${absPath}`);

  const content = await readFile(absPath, "utf8");
  const ext = extname(absPath).toLowerCase();

  if (ext === ".yaml" || ext === ".yml") {
    console.log(`\n⚠️  YAML 格式的 OpenAPI spec 暂不支持。请先转换为 JSON。`);
    console.log(`提示：可以用在线工具如 https://editor.swagger.io 将 YAML 转为 JSON。`);
    return;
  }

  let spec: any;
  try {
    spec = JSON.parse(content);
  } catch (err) {
    // Not JSON — check if it's HTML/Markdown
    if (content.trimStart().startsWith("<") || content.trimStart().startsWith("#")) {
      console.log(`\n⚠️  非 OpenAPI 格式的文档需要 LLM 解析。`);
      console.log(`请使用 Synapse Registry 的 Web 界面或 API 进行生成：`);
      console.log(`  POST https://registry.synapse.dev/api/v1/generation/jobs`);
      return;
    }
    throw new Error(`Failed to parse file as JSON: ${err}`);
  }

  // Check if it's an OpenAPI spec
  if (!spec.openapi && !spec.swagger) {
    console.log(`\n⚠️  非 OpenAPI 格式的文档需要 LLM 解析。`);
    console.log(`请使用 Synapse Registry 的 Web 界面或 API 进行生成：`);
    console.log(`  POST https://registry.synapse.dev/api/v1/generation/jobs`);
    return;
  }

  await generateFromOpenApiSpec(spec as OpenApiSpec, options);
}

// ---------------------------------------------------------------------------
// Parse generate command options from argv
// ---------------------------------------------------------------------------

function parseGenerateArgs(argv: string[]): { source: string; options: GenerateCommandOptions } {
  const positional: string[] = [];
  const options: GenerateCommandOptions = {
    validate: true,
    tarball: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider" && argv[i + 1]) {
      options.providerId = argv[++i];
    } else if (arg === "--name" && argv[i + 1]) {
      options.providerName = argv[++i];
    } else if (arg === "--output" && argv[i + 1]) {
      options.outputDir = argv[++i];
    } else if (arg === "--no-validate") {
      options.validate = false;
    } else if (arg === "--no-tarball") {
      options.tarball = false;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const source = positional[0];
  if (!source) {
    throw new Error("Missing required argument: <source> (URL or file path)");
  }

  return { source, options };
}

// ---------------------------------------------------------------------------
// Handle `synapse generate` command — main entry
// ---------------------------------------------------------------------------

export async function handleGenerateCommand(argv: string[]): Promise<void> {
  const { source, options } = parseGenerateArgs(argv);

  console.log(`\n🚀 Synapse Pack Generator\n`);

  const isUrl = source.startsWith("http://") || source.startsWith("https://");

  if (isUrl) {
    await generateFromUrl(source, options);
  } else {
    await generateFromFile(source, options);
  }
}
