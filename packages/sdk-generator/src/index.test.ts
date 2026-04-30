// @synapse-router/sdk-generator — Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSdk, featureIdToMethodName, dslTypeToTsType } from "./generator.js";
import { generateTypeScript } from "./typescript.js";
import { generatePython } from "./python.js";
import { readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("featureIdToMethodName", () => {
  it("converts chat feature_id to chat()", () => {
    assert.equal(featureIdToMethodName("chat_post_v1_chat_completions"), "chatCompletions");
  });

  it("converts embeddings feature_id to embeddings()", () => {
    assert.equal(featureIdToMethodName("embeddings_post_v1_embeddings"), "embeddings");
  });

  it("converts images_generations feature_id to imageGenerations()", () => {
    // images_generations_post_v1_images_generations
    // After stripping _post_v1_ → images_generations → imagesGenerations
    assert.equal(featureIdToMethodName("images_generations_post_v1_images_generations"), "imagesGenerations");
  });

  it("converts audio_transcriptions feature_id to audioTranscriptions()", () => {
    assert.equal(featureIdToMethodName("audio_transcriptions_post_v1_audio_transcriptions"), "audioTranscriptions");
  });
});

describe("dslTypeToTsType", () => {
  it("maps string → string", () => {
    assert.equal(dslTypeToTsType("string"), "string");
  });

  it("maps number → number", () => {
    assert.equal(dslTypeToTsType("number"), "number");
  });

  it("maps boolean → boolean", () => {
    assert.equal(dslTypeToTsType("boolean"), "boolean");
  });

  it("maps array → unknown[]", () => {
    assert.equal(dslTypeToTsType("array"), "unknown[]");
  });

  it("maps object → Record<string, unknown>", () => {
    assert.equal(dslTypeToTsType("object"), "Record<string, unknown>");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — use openai pack
// ---------------------------------------------------------------------------

const OPENAI_PACK_DIR = join(
  new URL(import.meta.url).pathname.substring(0, import.meta.url.lastIndexOf("/")),
  "..", "..", "..", "packs", "openai"
);

// Resolve to absolute path
const projectRoot = new URL(import.meta.url).pathname
  .replace(/\/packages\/sdk-generator\/.*/, "");

const OPENAI_PACK = join(projectRoot, "packs", "openai");

describe("TypeScript SDK generation (from openai pack)", () => {
  it("generates the correct file structure", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const paths = files.map((f) => f.path).sort();
    assert.ok(paths.includes("index.ts"), "should include index.ts");
    assert.ok(paths.includes("client.ts"), "should include client.ts");
    assert.ok(paths.includes("types.ts"), "should include types.ts");
    assert.ok(paths.includes("package.json"), "should include package.json");
    assert.ok(paths.includes("tsconfig.json"), "should include tsconfig.json");
    assert.ok(paths.includes("README.md"), "should include README.md");
  });

  it("generates methods for all features", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const clientFile = files.find((f) => f.path === "client.ts")!;
    assert.ok(clientFile, "client.ts should exist");

    // Should have methods for all 4 features
    assert.match(clientFile.content, /async chatCompletions\(/);
    assert.match(clientFile.content, /async embeddings\(/);
    assert.match(clientFile.content, /async imagesGenerations\(/);
    assert.match(clientFile.content, /async audioTranscriptions\(/);
  });

  it("generates type interfaces for all features", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const typesFile = files.find((f) => f.path === "types.ts")!;
    assert.ok(typesFile, "types.ts should exist");

    // Check input types
    assert.match(typesFile.content, /export interface ChatCompletionsInput/);
    assert.match(typesFile.content, /export interface EmbeddingsInput/);
    assert.match(typesFile.content, /export interface ImagesGenerationsInput/);
    assert.match(typesFile.content, /export interface AudioTranscriptionsInput/);

    // Check output types
    assert.match(typesFile.content, /export interface ChatCompletionsOutput/);
    assert.match(typesFile.content, /export interface EmbeddingsOutput/);
    assert.match(typesFile.content, /export interface ImagesGenerationsOutput/);
    assert.match(typesFile.content, /export interface AudioTranscriptionsOutput/);
  });

  it("uses OpenAI as default provider", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const clientFile = files.find((f) => f.path === "client.ts")!;
    assert.match(clientFile.content, /class OpenAIClient/);
    assert.match(clientFile.content, /https:\/\/api\.openai\.com\/v1/);
  });

  it("includes constructor with baseUrl override", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const clientFile = files.find((f) => f.path === "client.ts")!;
    assert.match(clientFile.content, /baseUrl\?: string/);
    assert.match(clientFile.content, /options\.baseUrl \?\?/);
  });

  it("generates enum types as union types", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const typesFile = files.find((f) => f.path === "types.ts")!;
    // encoding_format has enum: ["float", "base64"]
    assert.match(typesFile.content, /'float' \| 'base64'/);
  });

  it("marks optional fields with ?", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    const typesFile = files.find((f) => f.path === "types.ts")!;
    // temperature is optional
    assert.match(typesFile.content, /temperature\?: number/);
    // messages is required
    assert.match(typesFile.content, /messages: unknown\[\]/);
  });
});

describe("TypeScript SDK generation with provider override (deepseek)", () => {
  it("generates DeepSeekClient class name", async () => {
    const packData = await loadPackData(OPENAI_PACK, "deepseek", "https://api.deepseek.com/v1");
    const files = generateTypeScript(packData);

    const clientFile = files.find((f) => f.path === "client.ts")!;
    assert.match(clientFile.content, /class DeepseekClient/);
  });

  it("uses deepseek base URL", async () => {
    const packData = await loadPackData(OPENAI_PACK, "deepseek", "https://api.deepseek.com/v1");
    const files = generateTypeScript(packData);

    const clientFile = files.find((f) => f.path === "client.ts")!;
    assert.match(clientFile.content, /https:\/\/api\.deepseek\.com\/v1/);
  });

  it("uses @synapse-sdk/deepseek package name", async () => {
    const packData = await loadPackData(OPENAI_PACK, "deepseek", "https://api.deepseek.com/v1");
    const files = generateTypeScript(packData);

    const pkgFile = files.find((f) => f.path === "package.json")!;
    const pkg = JSON.parse(pkgFile.content);
    assert.equal(pkg.name, "@synapse-sdk/deepseek");
  });
});

describe("Python SDK generation (skeleton)", () => {
  it("generates the correct file structure", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generatePython(packData);

    const paths = files.map((f) => f.path).sort();
    assert.ok(paths.includes("__init__.py"), "should include __init__.py");
    assert.ok(paths.includes("client.py"), "should include client.py");
    assert.ok(paths.includes("pyproject.toml"), "should include pyproject.toml");
    assert.ok(paths.includes("README.md"), "should include README.md");
  });

  it("generates methods for all features", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generatePython(packData);

    const clientFile = files.find((f) => f.path === "client.py")!;
    assert.match(clientFile.content, /async def chatCompletions/);
    assert.match(clientFile.content, /async def embeddings/);
    assert.match(clientFile.content, /async def imagesGenerations/);
    assert.match(clientFile.content, /async def audioTranscriptions/);
  });
});

// ---------------------------------------------------------------------------
// Full generation with file writing
// ---------------------------------------------------------------------------

describe("generateSdk (full pipeline)", () => {
  const testOutputDir = join(projectRoot, ".test-sdk-output");

  it("writes files to disk", async () => {
    await rm(testOutputDir, { recursive: true, force: true });

    const result = await generateSdk({
      packDir: OPENAI_PACK,
      lang: "typescript",
      outputDir: testOutputDir,
    });

    assert.equal(result.lang, "typescript");
    assert.equal(result.provider, "openai");
    assert.equal(result.features, 4);

    // Verify files exist on disk
    const entries = await readdir(testOutputDir);
    assert.ok(entries.includes("index.ts"));
    assert.ok(entries.includes("client.ts"));
    assert.ok(entries.includes("types.ts"));
    assert.ok(entries.includes("package.json"));

    // Cleanup
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it("supports provider override", async () => {
    await rm(testOutputDir, { recursive: true, force: true });

    const result = await generateSdk({
      packDir: OPENAI_PACK,
      lang: "typescript",
      outputDir: testOutputDir,
      providerOverride: "deepseek",
      baseUrlOverride: "https://api.deepseek.com/v1",
    });

    assert.equal(result.provider, "deepseek");

    const clientContent = await readFile(join(testOutputDir, "client.ts"), "utf8");
    assert.match(clientContent, /DeepseekClient/);
    assert.match(clientContent, /api\.deepseek\.com/);

    // Cleanup
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it("generates Python SDK", async () => {
    await rm(testOutputDir, { recursive: true, force: true });

    const result = await generateSdk({
      packDir: OPENAI_PACK,
      lang: "python",
      outputDir: testOutputDir,
    });

    assert.equal(result.lang, "python");

    const entries = await readdir(testOutputDir);
    assert.ok(entries.includes("__init__.py"));
    assert.ok(entries.includes("client.py"));

    // Cleanup
    await rm(testOutputDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Helper: load pack data
// ---------------------------------------------------------------------------

import type { ProviderCard, PackData } from "./generator.js";

async function loadPackData(
  packDir: string,
  providerOverride?: string,
  baseUrlOverride?: string
): Promise<PackData> {
  const cardPath = join(packDir, "provider-card.json");
  const content = await readFile(cardPath, "utf8");
  const providerCard = JSON.parse(content) as ProviderCard;

  // Load DSL documents
  const dslDir = join(packDir, "dsl");
  let dslDocuments: any[] = [];
  try {
    const entries = await readdir(dslDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const dslContent = await readFile(join(dslDir, entry), "utf8");
      dslDocuments.push(JSON.parse(dslContent));
    }
  } catch {
    // No DSL dir
  }

  const providerId = providerOverride ?? providerCard.provider.id;
  const providerName = providerOverride
    ? providerOverride.charAt(0).toUpperCase() + providerOverride.slice(1)
    : providerCard.provider.name;
  const baseUrl = baseUrlOverride ?? providerCard.service.base_url;

  return {
    providerCard,
    dslDocuments,
    providerId,
    providerName,
    baseUrl,
    authType: providerCard.service.auth_type,
  };
}
