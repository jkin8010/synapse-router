import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createServer, type ServerOptions } from "./index.js";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_VAULT_DIR = path.join(process.cwd(), ".test-vault");
const TEST_PACKS_DIR = path.join(process.cwd(), "..", "..", "packs");

function getTestOptions(): ServerOptions {
  return {
    vaultDir: TEST_VAULT_DIR,
    packsDir: TEST_PACKS_DIR,
    noRegistry: true,
    port: 0, // random available port
  };
}

async function withServer(
  options: ServerOptions,
  fn: (baseUrl: string, server: http.Server) => Promise<void>
): Promise<void> {
  const server = createServer(options) as http.Server;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const baseUrl = `http://localhost:${(addr as any).port}`;

  // Wait for providers to load before running tests
  if ((server as any)._readyPromise) {
    await (server as any)._readyPromise;
  }

  try {
    await fn(baseUrl, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function httpRequest(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: data ? JSON.parse(data) : null,
              headers: res.headers,
            });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers });
          }
        });
      }
    );
    req.on("error", reject);
    if (options.body !== undefined) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function rmrf(dir: string): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) rmrf(full);
      else fs.unlinkSync(full);
    }
    fs.rmdirSync(dir);
  } catch {
    // ignore
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HTTP API Server", () => {
  before(() => {
    rmrf(TEST_VAULT_DIR);
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  });

  after(() => {
    rmrf(TEST_VAULT_DIR);
  });

  // 1. Health check
  it("GET /health returns 200 with ok status", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      assert.equal((res.body as Record<string, unknown>).status, "ok");
      assert.ok("version" in (res.body as Record<string, unknown>), "should include version");
      assert.ok("providers" in (res.body as Record<string, unknown>), "should include providers");
    });
  });

  // 2. Provider list
  it("GET /providers returns 200 with an array of providers", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/providers`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body), "body should be an array");
      const body = res.body as Array<Record<string, unknown>>;
      assert.ok(body.length > 0, "should have at least one provider");
      // Should contain openai
      const openai = body.find((p) => (p.provider as Record<string, unknown>)?.id === "openai");
      assert.ok(openai, "should contain openai provider");
      // Should have feature summaries
      assert.ok(
        "features" in openai,
        "provider should have features field"
      );
    });
  });

  // 3. Provider detail
  it("GET /providers/:id returns 200 with provider card for known provider", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/providers/openai`);
      assert.equal(res.status, 200);
      const card = res.body as Record<string, unknown>;
      // card is the full ProviderCard
      assert.ok(card.provider && typeof card.provider === "object", "should have provider object");
      const providerObj = card.provider as Record<string, unknown>;
      assert.equal(providerObj.id, "openai", "provider id should be openai");
      assert.ok(Array.isArray(card.features), "card should have features array");
    });
  });

  // 4. Provider not found
  it("GET /providers/:id returns 404 for unknown provider", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/providers/unknown`);
      assert.equal(res.status, 404);
      const err = res.body as Record<string, unknown>;
      assert.equal((err as any).error?.code, "PROVIDER_NOT_FOUND");
    });
  });

  // 5 & 6. Vault setKey + listKeys (no plaintext)
  it("POST /vault/keys stores a key and GET /vault/keys lists it without plaintext value", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      // Store a key
      const storeRes = await httpRequest(`${baseUrl}/vault/keys`, {
        method: "POST",
        body: {
          provider: "test-provider",
          key: "sk-test-123456789012345678901234567890ab",
          auth_type: "APIKey",
        },
      });
      assert.equal(storeRes.status, 201, `Expected 201, got ${storeRes.status}: ${JSON.stringify(storeRes.body)}`);
      assert.equal((storeRes.body as any).stored, true);

      // List keys — should not contain plaintext value
      const listRes = await httpRequest(`${baseUrl}/vault/keys`);
      assert.equal(listRes.status, 200);
      const listBody = listRes.body as { keys?: string[] };
      assert.ok(Array.isArray(listBody?.keys), "keys should be an array");
      assert.ok(listBody.keys?.includes("test-provider"), "test-provider should be listed");

      // Verify key is NOT in the response body (no plaintext)
      const bodyStr = JSON.stringify(listRes.body);
      assert.ok(
        !bodyStr.includes("sk-test-"),
        "response should NOT contain plaintext key value"
      );
    });
  });

  // 7. Vault removeKey
  it("DELETE /vault/keys/:provider removes the key", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      // Store a key first
      await httpRequest(`${baseUrl}/vault/keys`, {
        method: "POST",
        body: {
          provider: "to-delete",
          key: "sk-delete-12345678901234567890123456",
          auth_type: "APIKey",
        },
      });

      // Delete it
      const delRes = await httpRequest(`${baseUrl}/vault/keys/to-delete`, {
        method: "DELETE",
      });
      assert.equal(delRes.status, 200);
      assert.equal((delRes.body as any).removed, true);

      // Confirm it's gone
      const listRes = await httpRequest(`${baseUrl}/vault/keys`);
      const listBody = listRes.body as { keys?: string[] };
      assert.ok(!listBody?.keys?.includes("to-delete"));
    });
  });

  // 8. Vault verify
  it("POST /vault/verify/:provider validates key format", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      // Store a valid-format key
      await httpRequest(`${baseUrl}/vault/keys`, {
        method: "POST",
        body: {
          provider: "openai",
          key: "sk-ValidFormatKey12345678901234567890",
          auth_type: "APIKey",
        },
      });

      const verifyRes = await httpRequest(`${baseUrl}/vault/verify/openai`, {
        method: "POST",
      });
      assert.equal(verifyRes.status, 200);
      const verifyBody = verifyRes.body as { valid?: boolean };
      assert.equal(typeof verifyBody.valid, "boolean");
    });
  });

  // 9. Negotiate
  it("POST /negotiate returns negotiation result with accepted/rejected arrays", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/negotiate`, {
        method: "POST",
        body: {
          agent_schema: {
            agent_id: "test-agent",
            agent_name: "Test Agent",
            version: "1.0.0",
            access_protocol: { kind: "api", auth_type: "APIKey" },
            features: [
              {
                feature_id: "chat-1",
                feature_name: "Chat",
                intent: "chat",
                input_schema: { name: "chat-input", fields: [] },
                output_schema: { name: "chat-output", fields: [] },
                capabilities: [],
              },
            ],
          },
        },
      });
      assert.equal(res.status, 200);
      const body = res.body as Record<string, unknown>;
      assert.ok(body.negotiation_id, "should have negotiation_id");
      assert.ok(Array.isArray(body.accepted), "should have accepted array");
      assert.ok(Array.isArray(body.rejected), "should have rejected array");
    });
  });

  // 10. Negotiate with specific provider
  it("POST /negotiate with provider_id filters to that provider", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/negotiate`, {
        method: "POST",
        body: {
          agent_schema: {
            agent_id: "test-agent",
            agent_name: "Test Agent",
            version: "1.0.0",
            access_protocol: { kind: "api", auth_type: "APIKey" },
            features: [
              {
                feature_id: "chat-1",
                feature_name: "Chat",
                intent: "chat",
                input_schema: { name: "chat-input", fields: [] },
                output_schema: { name: "chat-output", fields: [] },
                capabilities: [],
              },
            ],
          },
          provider_id: "openai",
        },
      });
      assert.equal(res.status, 200);
      const body = res.body as { accepted?: Array<{ provider_id?: string }> };
      assert.ok(body.accepted && body.accepted.length > 0, "should have at least one accepted provider");
      assert.equal(body.accepted?.[0].provider_id, "openai", "first accepted should be openai");
    });
  });

  // 11. Execute with negotiation_id
  it("POST /execute with negotiation_id returns output and latency_ms", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      // First negotiate
      const negRes = await httpRequest(`${baseUrl}/negotiate`, {
        method: "POST",
        body: {
          agent_schema: {
            agent_id: "test-agent",
            agent_name: "Test Agent",
            version: "1.0.0",
            access_protocol: { kind: "api", auth_type: "APIKey" },
            features: [
              {
                feature_id: "chat-1",
                feature_name: "Chat",
                intent: "chat",
                input_schema: { name: "chat-input", fields: [] },
                output_schema: { name: "chat-output", fields: [] },
                capabilities: [],
              },
            ],
          },
          provider_id: "openai",
        },
      });
      assert.equal(negRes.status, 200);
      const negBody = negRes.body as { negotiation_id?: string };
      assert.ok(negBody.negotiation_id);

      // Execute
      const execRes = await httpRequest(`${baseUrl}/execute`, {
        method: "POST",
        body: {
          negotiation_id: negBody.negotiation_id,
          input: { messages: [{ role: "user", content: "Hello" }], model: "gpt-4" },
        },
      });
      assert.equal(execRes.status, 200);
      const execBody = execRes.body as { output?: unknown; latency_ms?: number; provider_id?: string };
      assert.ok("output" in (execRes.body as Record<string, unknown>), "should have output field");
      assert.ok(typeof (execBody.latency_ms) === "number", "should have latency_ms");
      assert.equal(execBody.provider_id, "openai");
    });
  });

  // 12. Execute with provider_id directly
  it("POST /execute with provider_id (no negotiation_id) works", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const execRes = await httpRequest(`${baseUrl}/execute`, {
        method: "POST",
        body: {
          provider_id: "openai",
          feature_id: "chat_post_v1_chat_completions",
          input: { messages: [{ role: "user", content: "Hi" }], model: "gpt-4o" },
        },
      });
      assert.equal(execRes.status, 200);
      const execBody = execRes.body as { output?: unknown; latency_ms?: number };
      assert.ok("output" in (execRes.body as Record<string, unknown>));
      assert.ok(typeof execBody.latency_ms === "number");
    });
  });

  // 13. Execute with invalid negotiation_id
  it("POST /execute with unknown negotiation_id returns 404", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const execRes = await httpRequest(`${baseUrl}/execute`, {
        method: "POST",
        body: {
          negotiation_id: "this-does-not-exist",
        },
      });
      assert.equal(execRes.status, 404);
      assert.equal((execRes.body as any).error?.code, "NEGOTIATION_NOT_FOUND");
    });
  });

  // 14. Execute with unknown provider
  it("POST /execute with unknown provider_id returns 404", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const execRes = await httpRequest(`${baseUrl}/execute`, {
        method: "POST",
        body: {
          provider_id: "unknown-provider",
        },
      });
      assert.equal(execRes.status, 404);
      assert.equal((execRes.body as any).error?.code, "PROVIDER_NOT_FOUND");
    });
  });

  // 15. Execute without negotiation_id or provider_id
  it("POST /execute without negotiation_id or provider_id returns 400", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const execRes = await httpRequest(`${baseUrl}/execute`, {
        method: "POST",
        body: { input: {} },
      });
      assert.equal(execRes.status, 400);
      assert.equal((execRes.body as any).error?.code, "INVALID_REQUEST");
    });
  });

  // 16. Negotiate without agent_schema
  it("POST /negotiate without agent_schema returns 400", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/negotiate`, {
        method: "POST",
        body: {},
      });
      assert.equal(res.status, 400);
      assert.equal((res.body as any).error?.code, "INVALID_REQUEST");
    });
  });

  // 17. CORS headers
  it("sets CORS headers on all responses", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/health`);
      assert.equal(res.headers["access-control-allow-origin"], "*");
      assert.equal(res.headers["access-control-allow-methods"], "GET, POST, DELETE, OPTIONS");
    });
  });

  // 18. OPTIONS preflight
  it("OPTIONS request returns 204", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/providers`, { method: "OPTIONS" });
      assert.equal(res.status, 204);
    });
  });

  // 19. 404 for unknown routes
  it("unknown route returns 404 with NOT_FOUND error", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/this-does-not-exist`);
      assert.equal(res.status, 404);
      assert.equal((res.body as any).error?.code, "NOT_FOUND");
    });
  });

  // 20. Invalid JSON body
  it("POST with invalid JSON returns 400", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      return new Promise<void>((resolve, reject) => {
        const urlObj = new URL(`${baseUrl}/health`);
        const req = http.request(
          {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
              assert.equal(res.statusCode, 400);
              const body = JSON.parse(data);
              assert.equal(body.error?.code, "INVALID_REQUEST");
              resolve();
            });
          }
        );
        req.on("error", reject);
        req.write("not valid json {{{");
        req.end();
      });
    });
  });

  // ─── SDK Preview Tests ────────────────────────────────────────────────────────

  it("POST /sdk-preview without provider_id returns 400", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/sdk-preview`, {
        method: "POST",
        body: {
          agent_schema: { features: [{ intent: "chat" }] },
        },
      });
      assert.equal(res.status, 400);
      assert.equal((res.body as any).error?.code, "INVALID_REQUEST");
    });
  });

  it("POST /sdk-preview without agent_schema returns 400", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/sdk-preview`, {
        method: "POST",
        body: { provider_id: "openai" },
      });
      assert.equal(res.status, 400);
      assert.equal((res.body as any).error?.code, "INVALID_REQUEST");
    });
  });

  it("POST /sdk-preview with unknown provider returns 404", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/sdk-preview`, {
        method: "POST",
        body: {
          provider_id: "unknown-provider",
          agent_schema: { features: [{ intent: "chat" }] },
        },
      });
      assert.equal(res.status, 404);
      assert.equal((res.body as any).error?.code, "PACK_NOT_FOUND");
    });
  });

  it("POST /sdk-preview with valid request returns 200 and code", async () => {
    await withServer(getTestOptions(), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/sdk-preview`, {
        method: "POST",
        body: {
          provider_id: "openai",
          agent_schema: { features: [{ intent: "chat" }] },
          lang: "typescript",
        },
      });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const body = res.body as { code?: string; lang?: string; provider?: string; features?: number };
      assert.ok(typeof body.code === "string" && body.code.length > 0, "should have non-empty code");
      assert.equal(body.lang, "typescript");
      assert.equal(body.provider, "openai");
      assert.ok(typeof body.features === "number" && body.features > 0, "should have positive feature count");
    });
  });
});
