import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError } from "./api";

describe("createApiClient", () => {
  it("should return object with getProviders, negotiate, execute", () => {
    const api = createApiClient({ baseUrl: "http://localhost:3011" });
    assert.equal(typeof api.getProviders, "function");
    assert.equal(typeof api.negotiate, "function");
    assert.equal(typeof api.execute, "function");
  });
});

describe("getProviders", () => {
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("should make GET request to /providers", async () => {
    const mockData = [
      {
        provider: { id: "openai", name: "OpenAI" },
        features: [{ feature_id: "chat", intent: "chat" }],
      },
    ];

    globalThis.fetch = async (url: string | URL | Request) => {
      assert.ok(url.toString().endsWith("/providers"));
      return {
        ok: true,
        json: async () => mockData,
      } as Response;
    };

    const api = createApiClient({ baseUrl: "http://localhost:3011" });
    const result = await api.getProviders();
    assert.equal(result[0].provider.id, "openai");
    assert.equal(result[0].provider.name, "OpenAI");
  });
});

describe("negotiate", () => {
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("should make POST request with correct body", async () => {
    const sampleSchema = {
      agent_id: "test-agent",
      features: [{ feature_id: "chat", intent: "chat" }],
    };

    const mockNegotiateResult = {
      accepted: [{ feature_id: "chat", provider_feature_id: "chat_post_v1_chat_completions" }],
      rejected: [],
    };

    globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      assert.ok(url.toString().endsWith("/negotiate"));
      assert.equal(options?.method, "POST");

      const body = JSON.parse(options?.body as string);
      assert.deepEqual(body.agent_schema, sampleSchema);
      assert.equal(body.provider_id, "openai");

      return {
        ok: true,
        json: async () => mockNegotiateResult,
      } as Response;
    };

    const api = createApiClient({ baseUrl: "http://localhost:3011" });
    const result = await api.negotiate(sampleSchema, "openai");
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].feature_id, "chat");
  });

  it("should throw ApiError on HTTP 400", async () => {
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "bad request" }),
      } as Response;
    };

    const api = createApiClient({ baseUrl: "http://localhost:3011" });

    await assert.rejects(
      async () => {
        await api.negotiate({}, "test");
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal((err as ApiError).status, 400);
        return true;
      },
    );
  });
});
