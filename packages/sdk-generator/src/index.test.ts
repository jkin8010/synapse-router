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

    // Check per-feature files
    const chatFile = files.find((f) => f.path === "chatCompletions.ts")!;
    assert.ok(chatFile, "chatCompletions.ts should exist");
    assert.match(chatFile.content, /export interface ChatCompletionsInput/);
    assert.match(chatFile.content, /export interface ChatCompletionsOutput/);

    const embedFile = files.find((f) => f.path === "embeddings.ts")!;
    assert.ok(embedFile, "embeddings.ts should exist");
    assert.match(embedFile.content, /export interface EmbeddingsInput/);
    assert.match(embedFile.content, /export interface EmbeddingsOutput/);

    const imgFile = files.find((f) => f.path === "imagesGenerations.ts")!;
    assert.ok(imgFile, "imagesGenerations.ts should exist");
    assert.match(imgFile.content, /export interface ImagesGenerationsInput/);
    assert.match(imgFile.content, /export interface ImagesGenerationsOutput/);

    const audioFile = files.find((f) => f.path === "audioTranscriptions.ts")!;
    assert.ok(audioFile, "audioTranscriptions.ts should exist");
    assert.match(audioFile.content, /export interface AudioTranscriptionsInput/);
    assert.match(audioFile.content, /export interface AudioTranscriptionsOutput/);

    // types.ts should be a barrel re-export
    const typesFile = files.find((f) => f.path === "types.ts")!;
    assert.ok(typesFile, "types.ts should exist");
    assert.match(typesFile.content, /chatCompletions\.js/);
    assert.match(typesFile.content, /embeddings\.js/);
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

    // encoding_format has enum: ["float", "base64"] — in embeddings feature
    const embedFile = files.find((f) => f.path === "embeddings.ts")!;
    assert.match(embedFile.content, /'float' \| 'base64'/);
  });

  it("marks optional fields with ?", async () => {
    const packData = await loadPackData(OPENAI_PACK);
    const files = generateTypeScript(packData);

    // temperature is optional — in chatCompletions feature
    const chatFile = files.find((f) => f.path === "chatCompletions.ts")!;
    assert.match(chatFile.content, /temperature\?: number/);
    // messages is required
    assert.match(chatFile.content, /messages: unknown\[\]/);
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
// generateSdk with --with-billing
// ---------------------------------------------------------------------------

describe("generateSdk with --with-billing", () => {
  const testOutputDir = join(projectRoot, ".test-sdk-billing-output");

  it("withBilling: true includes billing files in result.files", async () => {
    await rm(testOutputDir, { recursive: true, force: true });
    const result = await generateSdk({
      packDir: OPENAI_PACK, lang: "typescript", outputDir: testOutputDir,
      withBilling: true,
    });
    const paths = result.files.map(f => f.path);
    assert.ok(paths.includes(".synapse/billing/tracker.ts"), "should include tracker.ts");
    assert.ok(paths.includes(".synapse/billing/pricing.json"), "should include pricing.json");
    assert.ok(result.billingFile, "result.billingFile should be defined");
    assert.equal(result.billingFile!.path, ".synapse/billing/tracker.ts");
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it("generated billing tracker has zero @synapse-router imports", async () => {
    await rm(testOutputDir, { recursive: true, force: true });
    const result = await generateSdk({
      packDir: OPENAI_PACK, lang: "typescript", outputDir: testOutputDir,
      withBilling: true,
    });
    const tracker = result.files.find(f => f.path === ".synapse/billing/tracker.ts")!;
    assert.ok(tracker, "tracker.ts should exist");
    assert.doesNotMatch(tracker.content, /import.*@synapse-router/);
    assert.match(tracker.content, /class BillingTracker/);
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it("default (no withBilling) does not generate billing files", async () => {
    await rm(testOutputDir, { recursive: true, force: true });
    const result = await generateSdk({
      packDir: OPENAI_PACK, lang: "typescript", outputDir: testOutputDir,
    });
    const billingFiles = result.files.filter(f => f.path.includes("billing/"));
    assert.equal(billingFiles.length, 0, "no billing files when withBilling is not set");
    assert.equal(result.billingFile, undefined, "billingFile should be undefined");
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it("writes billing files to disk", async () => {
    await rm(testOutputDir, { recursive: true, force: true });
    await generateSdk({
      packDir: OPENAI_PACK, lang: "typescript", outputDir: testOutputDir,
      withBilling: true,
    });
    const entries = await readdir(join(testOutputDir, ".synapse", "billing"));
    assert.ok(entries.includes("tracker.ts"), "tracker.ts should exist on disk");
    assert.ok(entries.includes("pricing.json"), "pricing.json should exist on disk");
    const pricingContent = await readFile(join(testOutputDir, ".synapse", "billing", "pricing.json"), "utf8");
    const pricing = JSON.parse(pricingContent);
    assert.ok(pricing.provider, "pricing snapshot has provider");
    assert.ok(pricing.pricing, "pricing snapshot has pricing map");
    assert.ok(pricing.generatedAt, "pricing snapshot has generatedAt");
    await rm(testOutputDir, { recursive: true, force: true });
  });

  it("withBilling has no effect on Python generation (D4)", async () => {
    await rm(testOutputDir, { recursive: true, force: true });
    const result = await generateSdk({
      packDir: OPENAI_PACK, lang: "python", outputDir: testOutputDir,
      withBilling: true,
    });
    const billingFiles = result.files.filter(f => f.path.includes("billing/"));
    assert.equal(billingFiles.length, 0, "no billing files for python even when withBilling is true");
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
  const providerUrl = providerCard.provider?.base_url;
  const serviceUrl = providerCard.service.base_url;
  const defaultEndpoint = providerUrl && serviceUrl && providerUrl.startsWith(serviceUrl)
    ? providerUrl.slice(serviceUrl.length)
    : "";

  return {
    providerCard,
    dslDocuments,
    providerId,
    providerName,
    baseUrl,
    authType: providerCard.service.auth_type,
    defaultEndpoint,
  };
}
