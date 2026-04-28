/**
 * Pack Generator Tests
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { generatePack, generatePackFromURL, writePack } from "./index.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ─── Mini OpenAPI Spec ──────────────────────────────────────────────────────

const miniSpec = {
  openapi: "3.0.0",
  info: {
    title: "MiniAI Test Provider",
    version: "1.0.0",
    description: "A minimal AI provider for testing",
  },
  servers: [{ url: "https://api.miniai.test/v1" }],
  paths: {
    "/chat/completions": {
      post: {
        operationId: "chat_completions",
        summary: "Chat completion",
        description: "Generate chat completions",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prompt", "model"],
                properties: {
                  prompt: { type: "string", description: "The prompt" },
                  model: { type: "string", description: "Model ID" },
                  temperature: { type: "number", description: "Sampling temperature" },
                  max_tokens: { type: "integer", description: "Max tokens" },
                },
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
                  properties: {
                    text: { type: "string" },
                    usage: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/images/generations": {
      post: {
        operationId: "images_generations",
        summary: "Image generation",
        description: "Generate images from text",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: { type: "string", description: "Image prompt" },
                  model: { type: "string" },
                  n: { type: "integer", description: "Number of images" },
                  width: { type: "integer" },
                  height: { type: "integer" },
                },
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
                    data: { type: "array" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/embeddings": {
      post: {
        operationId: "create_embeddings",
        summary: "Create embeddings",
        description: "Get embeddings for text",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["input"],
                properties: {
                  input: { type: "string", description: "Input text" },
                  model: { type: "string" },
                },
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
                  properties: {
                    embedding: { type: "array" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/audio/speech": {
      post: {
        operationId: "text_to_speech",
        summary: "Text to speech",
        description: "Convert text to audio",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["input"],
                properties: {
                  input: { type: "string" },
                  model: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
          },
        },
      },
    },
    "/users": {
      get: {
        operationId: "get_users",
        summary: "List users",
        description: "Get list of users",
        responses: {
          "200": {
            description: "OK",
          },
        },
      },
    },
  },
};

// Shared tmp dir — created lazily
let _tmpDir: string | undefined;
async function tmpDir(): Promise<string> {
  if (!_tmpDir) {
    _tmpDir = path.join(os.tmpdir(), `pack-gen-test-${Date.now()}`);
    await fs.mkdir(_tmpDir, { recursive: true });
  }
  return _tmpDir;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("generatePack", () => {
  it("generates a ProviderCard with correct provider fields", () => {
    const { providerCard } = generatePack(miniSpec);

    assert.strictEqual(providerCard.provider.id, "miniai_test_provider");
    assert.strictEqual(providerCard.provider.name, "MiniAI Test Provider");
    assert.strictEqual(providerCard.provider.version, "1.0.0");
    assert.strictEqual(providerCard.provider.api_version, "1.0.0");
    assert.strictEqual(providerCard.provider.base_url, "https://api.miniai.test/v1");
    assert.strictEqual(providerCard.provider.auth_type, "APIKey");
  });

  it("generates features for each path+method", () => {
    const { providerCard } = generatePack(miniSpec);
    // 4 POST + 1 GET = 5
    assert.strictEqual(providerCard.features.length, 5);
  });

  it("uses operationId as feature id", () => {
    const { providerCard } = generatePack(miniSpec);
    const ids = providerCard.features.map((f) => f.id);
    assert(ids.includes("chat_completions"));
    assert(ids.includes("images_generations"));
    assert(ids.includes("create_embeddings"));
  });

  it("infers intent for /chat/completions", () => {
    const { providerCard } = generatePack(miniSpec);
    const chatFeature = providerCard.features.find((f) => f.id === "chat_completions");
    assert.strictEqual(chatFeature?.intent, "chat");
  });

  it("infers intent for /images/generations", () => {
    const { providerCard } = generatePack(miniSpec);
    const imgFeature = providerCard.features.find((f) => f.id === "images_generations");
    assert.strictEqual(imgFeature?.intent, "text-to-image");
  });

  it("infers intent for /embeddings", () => {
    const { providerCard } = generatePack(miniSpec);
    const embFeature = providerCard.features.find((f) => f.id === "create_embeddings");
    assert.strictEqual(embFeature?.intent, "embeddings");
  });

  it("infers intent for /audio/speech", () => {
    const { providerCard } = generatePack(miniSpec);
    const ttsFeature = providerCard.features.find((f) => f.id === "text_to_speech");
    assert.strictEqual(ttsFeature?.intent, "text-to-speech");
  });

  it("uses summary as feature name", () => {
    const { providerCard } = generatePack(miniSpec);
    const chatFeature = providerCard.features.find((f) => f.id === "chat_completions");
    assert.strictEqual(chatFeature?.name, "Chat completion");
  });

  it("maps request body fields correctly", () => {
    const { providerCard } = generatePack(miniSpec);
    const chatFeature = providerCard.features.find((f) => f.id === "chat_completions");
    assert.ok(chatFeature?.input.fields.length > 0);

    const fieldNames = chatFeature!.input.fields.map((f) => f.name);
    assert(fieldNames.includes("prompt"));
    assert(fieldNames.includes("model"));
    assert(fieldNames.includes("temperature"));
    assert(fieldNames.includes("max_tokens"));
  });

  it("marks required fields correctly", () => {
    const { providerCard } = generatePack(miniSpec);
    const chatFeature = providerCard.features.find((f) => f.id === "chat_completions");
    const promptField = chatFeature?.input.fields.find((f) => f.name === "prompt");
    assert.strictEqual(promptField?.required, true);
    const modelField = chatFeature?.input.fields.find((f) => f.name === "model");
    assert.strictEqual(modelField?.required, true);
    const tempField = chatFeature?.input.fields.find((f) => f.name === "temperature");
    assert.strictEqual(tempField?.required, false);
  });

  it("generates field mappings with canonical names", () => {
    const { providerCard } = generatePack(miniSpec);
    const chatFeature = providerCard.features.find((f) => f.id === "chat_completions");
    const mappings = chatFeature!.field_mappings;

    const promptMap = mappings.find((m) => m.canonical_field === "prompt");
    assert.ok(promptMap);

    const modelMap = mappings.find((m) => m.canonical_field === "model");
    assert.ok(modelMap);

    const mtMap = mappings.find((m) => m.canonical_field === "max_tokens");
    assert.ok(mtMap);
  });

  it("generates dslFiles for each feature", () => {
    const { dslFiles } = generatePack(miniSpec);
    assert.strictEqual(dslFiles.length, 5);

    for (const file of dslFiles) {
      assert.match(file.path, /^dsl\/.+\.json$/);
      assert.ok(file.content.agent_id);
      assert.ok(file.content.agent_name);
      assert.strictEqual(file.content.features.length, 1);
      assert.ok(file.content.access_protocol);
    }
  });

  it("sets correct DSL file path names", () => {
    const { dslFiles } = generatePack(miniSpec);
    const paths = dslFiles.map((f) => f.path);
    assert(paths.includes("dsl/chat_completions.json"));
    assert(paths.includes("dsl/images_generations.json"));
    assert(paths.includes("dsl/create_embeddings.json"));
    assert(paths.includes("dsl/text_to_speech.json"));
    assert(paths.includes("dsl/get_users.json"));
  });

  it("includes capability in agent feature", () => {
    const { dslFiles } = generatePack(miniSpec);

    const chatDsl = dslFiles.find((f) => f.path === "dsl/chat_completions.json");
    assert.strictEqual(chatDsl?.content.features[0].capabilities[0].kind, "structured-output");

    const imgDsl = dslFiles.find((f) => f.path === "dsl/images_generations.json");
    assert.strictEqual(imgDsl?.content.features[0].capabilities[0].kind, "image-generation");
  });

  it("accepts custom options", () => {
    const { providerCard, dslFiles } = generatePack(miniSpec, {
      providerId: "custom-id",
      providerName: "Custom Provider",
      agentId: "custom-agent",
      agentName: "Custom Agent",
    });

    assert.strictEqual(providerCard.provider.id, "custom-id");
    assert.strictEqual(providerCard.provider.name, "Custom Provider");
    assert.strictEqual(dslFiles[0].content.agent_id, "custom-agent");
    assert.strictEqual(dslFiles[0].content.agent_name, "Custom Agent");
  });

  it("handles GET operation without request body", () => {
    const { providerCard } = generatePack(miniSpec);
    const getUsersFeature = providerCard.features.find((f) => f.id === "get_users");
    assert.ok(getUsersFeature);
    assert.ok(Array.isArray(getUsersFeature!.input.fields));
    assert.strictEqual(getUsersFeature!.input.fields.length, 0);
  });

  it("handles empty servers array", () => {
    const specWithoutServers = { ...miniSpec, servers: [] };
    const { providerCard } = generatePack(specWithoutServers);
    assert.strictEqual(providerCard.provider.base_url, "");
  });

  it("infers fallback intent from operationId containing 'generate'", () => {
    const spec = {
      ...miniSpec,
      paths: {
        "/custom/endpoint": {
          post: {
            operationId: "generate_story",
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { prompt: { type: "string" } } },
                },
              },
            },
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };
    const { providerCard } = generatePack(spec);
    const feature = providerCard.features.find((f) => f.id === "generate_story");
    assert.strictEqual(feature?.intent, "image-generation");
  });
});

describe("writePack", () => {
  it("writes provider-card.json", async () => {
    const { providerCard, dslFiles } = generatePack(miniSpec);
    const dir = await tmpDir();
    await writePack(dir, providerCard, dslFiles);

    const cardPath = path.join(dir, "provider-card.json");
    const stat = await fs.stat(cardPath);
    assert.strictEqual(stat.isFile(), true);

    const content = JSON.parse(await fs.readFile(cardPath, "utf-8"));
    assert.strictEqual(content.provider.id, "miniai_test_provider");
  });

  it("writes dsl directory with files", async () => {
    const { providerCard, dslFiles } = generatePack(miniSpec);
    const dir = await tmpDir();
    await writePack(dir, providerCard, dslFiles);

    const dslDir = path.join(dir, "dsl");
    const stat = await fs.stat(dslDir);
    assert.strictEqual(stat.isDirectory(), true);

    const files = await fs.readdir(dslDir);
    assert.strictEqual(files.length, 5);
    assert(files.includes("chat_completions.json"));
    assert(files.includes("images_generations.json"));
  });

  it("writes valid JSON for each DSL file", async () => {
    const { providerCard, dslFiles } = generatePack(miniSpec);
    const dir = await tmpDir();
    await writePack(dir, providerCard, dslFiles);

    const dslDir = path.join(dir, "dsl");
    const files = await fs.readdir(dslDir);
    for (const file of files) {
      const content = await fs.readFile(path.join(dslDir, file), "utf-8");
      assert.doesNotThrow(() => JSON.parse(content));
      const parsed = JSON.parse(content);
      assert.ok(parsed.agent_id);
      assert.ok(Array.isArray(parsed.features));
    }
  });

  it("overwrites existing pack", async () => {
    const { providerCard, dslFiles } = generatePack(miniSpec);
    const dir = await tmpDir();
    await writePack(dir, providerCard, dslFiles);

    const { providerCard: card2, dslFiles: files2 } = generatePack(miniSpec, {
      providerId: "new-id",
    });
    await writePack(dir, card2, files2);

    const content = JSON.parse(
      await fs.readFile(path.join(dir, "provider-card.json"), "utf-8")
    );
    assert.strictEqual(content.provider.id, "new-id");
  });
});

describe("generatePackFromURL", () => {
  it("fetches and parses petstore swagger", async () => {
    const { providerCard, dslFiles } = await generatePackFromURL(
      "https://petstore.swagger.io/v2/swagger.json",
      { providerId: "petstore" }
    );

    assert.strictEqual(providerCard.provider.id, "petstore");
    assert.ok(providerCard.features.length > 0);
    assert.ok(dslFiles.length > 0);
  }, 30_000);
});
