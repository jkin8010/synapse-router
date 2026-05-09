import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer, type ServerOptions } from "../../apps/api/src/index.js";
import { ROOT, createTempVault } from "./helpers.js";
import { CHAT_AGENT_SCHEMA } from "./fixtures.js";

async function withServer(options: ServerOptions, fn: (baseUrl: string, server: http.Server) => Promise<void>): Promise<void> {
  const server = createServer(options) as http.Server;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const baseUrl = `http://localhost:${(addr as any).port}`;
  if ((server as any)._readyPromise) await (server as any)._readyPromise;
  try { await fn(baseUrl, server); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function httpRequest(url: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      { hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname, method: options.method ?? "GET",
        headers: { "Content-Type": "application/json", ...options.headers } },
      (res) => { let data = ""; res.on("data", (chunk) => data += chunk); res.on("end", () => { try { resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }); } catch { resolve({ status: res.statusCode ?? 0, body: data }); } }); }
    );
    req.on("error", reject);
    if (options.body !== undefined) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function getTestOptions(vaultDir: string): ServerOptions {
  return { vaultDir, packsDir: join(ROOT, "packs"), noRegistry: true, port: 0 };
}

describe("API /negotiate E2E", () => {
  let vault: ReturnType<typeof createTempVault>;
  before(() => { vault = createTempVault(); });
  after(() => { vault.cleanup(); });

  it("POST /negotiate with agent_schema returns 200 with negotiation results", async () => {
    await withServer(getTestOptions(vault.vaultDir), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/negotiate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: { agent_schema: CHAT_AGENT_SCHEMA } });
      assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
      const body = res.body as Record<string, unknown>;
      assert.ok(body.negotiation_id, "should have negotiation_id");
      assert.ok(Array.isArray(body.accepted), "should have accepted array");
      assert.ok(Array.isArray(body.rejected), "should have rejected array");
    });
  });

  it("POST /negotiate with provider_id filters to that provider", async () => {
    await withServer(getTestOptions(vault.vaultDir), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/negotiate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: { agent_schema: CHAT_AGENT_SCHEMA, provider_id: "openai" } });
      assert.equal(res.status, 200);
      const body = res.body as { accepted?: Array<{ provider_id?: string }> };
      assert.ok(body.accepted && body.accepted.length > 0);
      if (body.accepted && body.accepted.length > 0) assert.equal(body.accepted[0].provider_id, "openai");
    });
  });

  it("POST /negotiate without agent_schema returns 400", async () => {
    await withServer(getTestOptions(vault.vaultDir), async (baseUrl) => {
      const res = await httpRequest(`${baseUrl}/negotiate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: {} });
      assert.equal(res.status, 400);
      assert.equal((res.body as any).error?.code, "INVALID_REQUEST");
    });
  });
});
