// @synapse-router/sdk-generator — Core generation logic

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderCard } from "@synapse-router/core";
import { generateTypeScript } from "./typescript.js";
import { generatePython } from "./python.js";
import { generateBillingTracker, generatePricingSnapshot } from "./billing.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GeneratedFile {
  path: string;      // relative path within output dir
  content: string;
}

export interface SdkGenerateOptions {
  packDir: string;             // Pack directory path (e.g. packs/openai/)
  lang: "typescript" | "python";
  outputDir: string;           // Output directory
  providerOverride?: string;   // Override provider name (e.g. "deepseek" using openai pack)
  baseUrlOverride?: string;    // Override default base_url
  withBilling?: boolean;       // When true, emit BillingTracker companion files alongside SDK
}

export interface SdkGenerateResult {
  files: GeneratedFile[];
  lang: string;
  provider: string;
  features: number;
  billingFile?: GeneratedFile;  // Billing tracker file when withBilling is true
}

// ---------------------------------------------------------------------------
// Pack loading helpers
// ---------------------------------------------------------------------------

interface DslFeature {
  feature_id: string;
  feature_name: string;
  intent: string;
  input_schema: {
    name: string;
    fields: Array<{
      name: string;
      type: string;
      required?: boolean;
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
    fallback?: unknown;
    transform?: string;
  }>;
  capabilities: Array<{ kind: string; modalities: string[] }>;
}

interface DslDocument {
  agent_id: string;
  agent_name: string;
  version: string;
  access_protocol: {
    kind: string;
    auth_type: string;
  };
  features: DslFeature[];
}

export interface PackData {
  providerCard: ProviderCard;
  dslDocuments: DslDocument[];
  providerId: string;
  providerName: string;
  baseUrl: string;
  authType: string;
}

async function loadProviderCard(packDir: string): Promise<ProviderCard> {
  const cardPath = join(packDir, "provider-card.json");
  const content = await readFile(cardPath, "utf8");
  return JSON.parse(content) as ProviderCard;
}

async function loadDslDocuments(packDir: string): Promise<DslDocument[]> {
  const dslDir = join(packDir, "dsl");
  const documents: DslDocument[] = [];

  try {
    const entries = await readdir(dslDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const content = await readFile(join(dslDir, entry), "utf8");
      documents.push(JSON.parse(content) as DslDocument);
    }
  } catch {
    // No DSL directory — that's fine, we'll use provider-card data
  }

  return documents;
}

// ---------------------------------------------------------------------------
// Method name generation: feature_id → camelCase method name
// ---------------------------------------------------------------------------

export function featureIdToMethodName(featureId: string): string {
  // Feature IDs follow the pattern: {intent}_{method}_v{version}_{path_segments}
  // chat_post_v1_chat_completions        → chatCompletions
  // embeddings_post_v1_embeddings         → embeddings
  // images_generations_post_v1_images_generations → imagesGenerations
  // audio_transcriptions_post_v1_audio_transcriptions → audioTranscriptions

  // Remove the intent prefix + HTTP method + version segment, keep only path
  const withoutPrefix = featureId.replace(/^.*?_(?:post|get|put|patch|delete)_v\d+_/, '');

  // Split remaining path segments on underscores and camelCase
  const parts = withoutPrefix.split('_');
  return parts.map((part, i) => {
    if (i === 0) return part.toLowerCase();
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
}

// ---------------------------------------------------------------------------
// DSL type → TypeScript type mapping
// ---------------------------------------------------------------------------

export function dslTypeToTsType(type: string): string {
  switch (type) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "array": return "unknown[]";
    case "object": return "Record<string, unknown>";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export async function generateSdk(options: SdkGenerateOptions): Promise<SdkGenerateResult> {
  const { packDir, lang, outputDir, providerOverride, baseUrlOverride } = options;

  // Load pack data
  const providerCard = await loadProviderCard(packDir);
  const dslDocuments = await loadDslDocuments(packDir);

  // Resolve provider identity
  const providerId = providerOverride ?? providerCard.provider.id;
  const providerName = providerOverride
    ? providerOverride.charAt(0).toUpperCase() + providerOverride.slice(1)
    : providerCard.provider.name;
  const baseUrl = baseUrlOverride ?? providerCard.service.base_url;
  const authType = providerCard.service.auth_type;

  const packData: PackData = {
    providerCard,
    dslDocuments,
    providerId,
    providerName,
    baseUrl,
    authType,
  };

  // Generate code files
  let files: GeneratedFile[];
  switch (lang) {
    case "typescript":
      files = generateTypeScript(packData);
      break;
    case "python":
      files = generatePython(packData);
      break;
    default:
      throw new Error(`Unsupported language: ${lang}`);
  }

  // Billing emission (TS-only for Phase 9 per D4)
  let billingFile: GeneratedFile | undefined;
  if (options.withBilling && lang === "typescript") {
    billingFile = generateBillingTracker(packData);
    const pricingSnapshot = generatePricingSnapshot(packData);
    files = [...files, billingFile, pricingSnapshot];
  }

  // Write to disk
  await mkdir(outputDir, { recursive: true });
  for (const file of files) {
    const filePath = join(outputDir, file.path);
    // Create parent directories
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir) await mkdir(dir, { recursive: true });
    await writeFile(filePath, file.content, "utf8");
  }

  return {
    files,
    lang,
    provider: providerId,
    features: providerCard.features.length,
    ...(billingFile ? { billingFile } : {}),
  };
}
