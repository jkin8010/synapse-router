/**
 * @synapse-router/connector 测试
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import { mapInput, mapOutput } from "./mapper.js";
import { deriveApiPath } from "./path.js";
import { connect } from "./index.js";
import type { ConnectLock } from "./types.js";
import { ConnectorHttpError } from "./http.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const chatFieldMappings: ConnectLock["field_mappings"] = [
  { canonical_field: "prompt", provider_field: "messages", required: true },
  { canonical_field: "model", provider_field: "model", required: true },
  { canonical_field: "temperature", provider_field: "temperature", required: false, fallback: 0.7 },
  { canonical_field: "max_tokens", provider_field: "max_tokens", required: false, fallback: 1024 },
  { canonical_field: "top_p", provider_field: "top_p", required: false },
];

const chatLock: ConnectLock = {
  intent: "chat",
  provider: "openai",
  feature_id: "chat_post_v1_chat_completions",
  input_schema: { fields: [] },
  output_schema: { fields: [] },
  field_mappings: chatFieldMappings,
};

// ─── Mapper Tests ───────────────────────────────────────────────────────────

describe("mapInput", () => {
  it("maps canonical fields to provider fields", () => {
    const result = mapInput(
      { prompt: "Hello", model: "gpt-4" },
      chatFieldMappings,
    );
    assert.deepEqual(result, {
      messages: "Hello",
      model: "gpt-4",
      temperature: 0.7,
      max_tokens: 1024,
    });
  });

  it("skips optional fields without value or fallback", () => {
    const result = mapInput(
      { prompt: "Hello", model: "gpt-4" },
      chatFieldMappings,
    );
    assert.equal(result.top_p, undefined);
    assert.equal("top_p" in result, false);
  });

  it("applies fallback for missing optional fields", () => {
    const result = mapInput(
      { prompt: "Hello", model: "gpt-4" },
      chatFieldMappings,
    );
    assert.equal(result.temperature, 0.7);
    assert.equal(result.max_tokens, 1024);
  });

  it("uses provided value over fallback", () => {
    const result = mapInput(
      { prompt: "Hello", model: "gpt-4", temperature: 0.3 },
      chatFieldMappings,
    );
    assert.equal(result.temperature, 0.3);
  });

  it("skips required fields when missing (lets provider error)", () => {
    const result = mapInput(
      { prompt: "Hello" },
      chatFieldMappings,
    );
    // model is required but missing — not included in result
    assert.equal("model" in result, false);
  });

  it("handles passthrough transform", () => {
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "data", provider_field: "data", required: true, transform: "passthrough" },
    ];
    const result = mapInput({ data: "hello" }, mappings);
    assert.equal(result.data, "hello");
  });

  it("handles cast_number transform", () => {
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "count", provider_field: "count", required: true, transform: "cast_number" },
    ];
    const result = mapInput({ count: "42" }, mappings);
    assert.equal(result.count, 42);
  });

  it("handles json_parse transform", () => {
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "config", provider_field: "config", required: true, transform: "json_parse" },
    ];
    const result = mapInput({ config: '{"key":"val"}' }, mappings);
    assert.deepEqual(result.config, { key: "val" });
  });

  it("handles base64_decode transform", () => {
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "data", provider_field: "data", required: true, transform: "base64_decode" },
    ];
    const result = mapInput({ data: Buffer.from("hello").toString("base64") }, mappings);
    assert.equal(result.data, "hello");
  });
});

describe("mapOutput", () => {
  it("maps provider fields to canonical fields", () => {
    const providerOutput = {
      choices: [{ message: { content: "Hi there" } }],
      model: "gpt-4",
    };
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "response", provider_field: "choices", required: true },
      { canonical_field: "model", provider_field: "model", required: true },
    ];
    const result = mapOutput(providerOutput, mappings);
    assert.deepEqual(result.response, [{ message: { content: "Hi there" } }]);
    assert.equal(result.model, "gpt-4");
  });

  it("preserves unmapped provider fields", () => {
    const providerOutput = {
      choices: [],
      model: "gpt-4",
      id: "chatcmpl-123",
      created: 1234567890,
    };
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "response", provider_field: "choices", required: true },
    ];
    const result = mapOutput(providerOutput, mappings);
    assert.equal(result.id, "chatcmpl-123");
    assert.equal(result.created, 1234567890);
  });

  it("handles extract_url transform", () => {
    const providerOutput = {
      data: [
        { url: "https://example.com/image1.png" },
        { url: "https://example.com/image2.png" },
      ],
    };
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "images", provider_field: "data", required: true, transform: "extract_url" },
    ];
    const result = mapOutput(providerOutput, mappings);
    assert.deepEqual(result.images, [
      "https://example.com/image1.png",
      "https://example.com/image2.png",
    ]);
  });

  it("skips fields not in provider output", () => {
    const providerOutput = { model: "gpt-4" };
    const mappings: ConnectLock["field_mappings"] = [
      { canonical_field: "response", provider_field: "choices", required: true },
      { canonical_field: "model", provider_field: "model", required: true },
    ];
    const result = mapOutput(providerOutput, mappings);
    assert.equal("response" in result, false);
    assert.equal(result.model, "gpt-4");
  });
});

// ─── Path Derivation Tests ──────────────────────────────────────────────────

describe("deriveApiPath", () => {
  it("derives chat completions path", () => {
    const result = deriveApiPath("chat_post_v1_chat_completions");
    assert.equal(result.method, "POST");
    assert.equal(result.path, "/v1/chat/completions");
  });

  it("derives embeddings path", () => {
    const result = deriveApiPath("embeddings_post_v1_embeddings");
    assert.equal(result.method, "POST");
    assert.equal(result.path, "/v1/embeddings");
  });

  it("derives images generations path", () => {
    const result = deriveApiPath("images_generations_post_v1_images_generations");
    assert.equal(result.method, "POST");
    assert.equal(result.path, "/v1/images/generations");
  });

  it("derives audio transcriptions path", () => {
    const result = deriveApiPath("audio_transcriptions_post_v1_audio_transcriptions");
    assert.equal(result.method, "POST");
    assert.equal(result.path, "/v1/audio/transcriptions");
  });

  it("handles GET method", () => {
    const result = deriveApiPath("models_get_v1_models");
    assert.equal(result.method, "GET");
    assert.equal(result.path, "/v1/models");
  });

  it("falls back for feature_id without method marker", () => {
    const result = deriveApiPath("some_feature");
    assert.equal(result.method, "POST");
    assert.equal(result.path, "/some/feature");
  });
});

// ─── connect() Integration Tests (mocked fetch) ─────────────────────────────

describe("connect", () => {
  const originalFetch = globalThis.fetch;

  function mockFetch(response: unknown, status = 200): typeof globalThis.fetch {
    return (async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => response,
      text: async () => JSON.stringify(response),
    })) as unknown as typeof globalThis.fetch;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps input, calls provider, maps output", async () => {
    const mockResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1234567890,
      model: "deepseek-chat",
      choices: [{ message: { role: "assistant", content: "Hello!" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    globalThis.fetch = mockFetch(mockResponse);

    const result = await connect({
      lock: chatLock,
      input: {
        prompt: [{ role: "user", content: "Hello" }],
        model: "deepseek-chat",
      },
      connection: {
        base_url: "https://api.deepseek.com/v1",
        api_key: "sk-deepseek-xxx",
        auth_type: "Bearer",
      },
    });

    // 输出包含 canonical 字段
    assert.equal(result.output.model, "deepseek-chat");
    // 输出保留未映射字段
    assert.equal(result.output.id, "chatcmpl-123");
    assert.equal(result.output.created, 1234567890);
    // raw 是原始响应
    assert.equal((result.raw as Record<string, unknown>).model, "deepseek-chat");
    // meta
    assert.equal(result.meta.provider, "openai");
    assert.equal(result.meta.feature_id, "chat_post_v1_chat_completions");
    assert.equal(result.meta.model, "deepseek-chat");
    assert.deepEqual(result.meta.usage, { input_tokens: 10, output_tokens: 5 });
    assert.ok(result.meta.latency_ms >= 0);
  });

  it("uses connection.base_url instead of provider-card base_url", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ model: "test" }),
        text: async () => "{}",
      };
    }) as unknown as typeof globalThis.fetch;

    await connect({
      lock: chatLock,
      input: { prompt: "hi", model: "test" },
      connection: {
        base_url: "https://api.deepseek.com/v1",  // DeepSeek URL
        api_key: "sk-xxx",
        auth_type: "Bearer",
      },
    });

    assert.ok(capturedUrl.startsWith("https://api.deepseek.com/v1/"));
    assert.ok(capturedUrl.includes("/chat/completions"));
  });

  it("sends Bearer auth header", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
        text: async () => "{}",
      };
    }) as unknown as typeof globalThis.fetch;

    await connect({
      lock: chatLock,
      input: { prompt: "hi", model: "test" },
      connection: {
        base_url: "https://api.example.com/v1",
        api_key: "sk-my-key",
        auth_type: "Bearer",
      },
    });

    assert.equal(capturedHeaders["Authorization"], "Bearer sk-my-key");
  });

  it("sends APIKey header for APIKey auth", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
        text: async () => "{}",
      };
    }) as unknown as typeof globalThis.fetch;

    await connect({
      lock: chatLock,
      input: { prompt: "hi", model: "test" },
      connection: {
        base_url: "https://api.example.com/v1",
        api_key: "my-api-key",
        auth_type: "APIKey",
      },
    });

    assert.equal(capturedHeaders["X-API-Key"], "my-api-key");
  });

  it("throws ConnectorHttpError on non-2xx response", async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: "invalid api key" }),
      text: async () => '{"error":"invalid api key"}',
    })) as unknown as typeof globalThis.fetch;

    await assert.rejects(
      () => connect({
        lock: chatLock,
        input: { prompt: "hi", model: "test" },
        connection: {
          base_url: "https://api.example.com/v1",
          api_key: "bad-key",
          auth_type: "Bearer",
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof ConnectorHttpError);
        assert.equal(err.status, 401);
        return true;
      },
    );
  });

  it("strips trailing slash from base_url", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
        text: async () => "{}",
      };
    }) as unknown as typeof globalThis.fetch;

    await connect({
      lock: chatLock,
      input: { prompt: "hi", model: "test" },
      connection: {
        base_url: "https://api.example.com/v1/",  // trailing slash
        api_key: "sk-xxx",
        auth_type: "Bearer",
      },
    });

    // Should not have duplicate slashes (trailing slash from base + leading slash from path)
    assert.ok(!capturedUrl.includes("//v1//"));
    assert.equal(capturedUrl, "https://api.example.com/v1/chat/completions");
  });
});

// ─── DeepSeek 兼容验证 (mock) ──────────────────────────────────────────────

describe("DeepSeek compatibility", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses OpenAI Pack field_mappings with DeepSeek base_url", async () => {
    const mockResponse = {
      id: "chatcmpl-deepseek",
      object: "chat.completion",
      created: 1234567890,
      model: "deepseek-chat",
      choices: [{ message: { role: "assistant", content: "Ni hao!" } }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    };

    let capturedUrl = "";
    let capturedBody: unknown;

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      };
    }) as unknown as typeof globalThis.fetch;

    const result = await connect({
      lock: chatLock,  // OpenAI Pack Lock
      input: {
        prompt: [{ role: "user", content: "Hello" }],
        model: "deepseek-chat",
      },
      connection: {
        base_url: "https://api.deepseek.com/v1",  // DeepSeek override
        api_key: "sk-deepseek-xxx",
        auth_type: "Bearer",
      },
    });

    // URL 指向 DeepSeek
    assert.ok(capturedUrl.startsWith("https://api.deepseek.com/v1/"));

    // 请求体使用 provider 字段名（OpenAI 格式）
    assert.ok(capturedBody && typeof capturedBody === "object");
    const body = capturedBody as Record<string, unknown>;
    assert.ok(Array.isArray(body.messages));
    assert.equal(body.model, "deepseek-chat");

    // 输出映射回 canonical 字段
    assert.equal(result.output.model, "deepseek-chat");
    assert.equal(result.meta.model, "deepseek-chat");
  });
});

// ─── Integration Test (real API, optional) ──────────────────────────────────

describe("Integration: real DeepSeek API", { skip: !process.env.DEEPSEEK_API_KEY }, () => {
  it("calls DeepSeek API with OpenAI pack mappings", async () => {
    const result = await connect({
      lock: chatLock,
      input: {
        prompt: [{ role: "user", content: "Say hello in one word." }],
        model: "deepseek-chat",
      },
      connection: {
        base_url: "https://api.deepseek.com/v1",
        api_key: process.env.DEEPSEEK_API_KEY!,
        auth_type: "Bearer",
      },
    });

    assert.ok(result.output.model);
    assert.ok(result.meta.latency_ms >= 0);
    assert.equal(result.meta.provider, "openai"); // lock says openai
    console.log("DeepSeek response:", JSON.stringify(result.output, null, 2));
  });
});
