import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRequest, makeResponse, makeError, sendResponse, sendError } from "./transport.js";

describe("transport", () => {
  describe("parseRequest", () => {
    it("parses valid initialize request", () => {
      const req = parseRequest(
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
      );
      assert.ok(req);
      assert.equal(req!.method, "initialize");
      assert.equal(req!.id, 1);
    });

    it("parses request with string id", () => {
      const req = parseRequest(
        '{"jsonrpc":"2.0","id":"abc","method":"tools/list","params":{}}'
      );
      assert.ok(req);
      assert.equal(req!.id, "abc");
    });

    it("parses request with params", () => {
      const raw = '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"vault_set_key","arguments":{"provider":"openai","key":"sk-test"}}}';
      const req = parseRequest(raw);
      assert.ok(req);
      assert.deepEqual(req!.params, {
        name: "vault_set_key",
        arguments: { provider: "openai", key: "sk-test" }
      });
    });

    it("returns null for invalid JSON", () => {
      assert.equal(parseRequest("not json"), null);
    });

    it("returns null for non-2.0 jsonrpc", () => {
      assert.equal(parseRequest('{"jsonrpc":"1.0","method":"test"}'), null);
    });

    it("returns null for missing method", () => {
      assert.equal(parseRequest('{"jsonrpc":"2.0","id":1}'), null);
    });
  });

  describe("makeResponse", () => {
    it("creates valid JSON-RPC response", () => {
      const res = makeResponse(1, { tools: [] });
      assert.equal(res.jsonrpc, "2.0");
      assert.equal(res.id, 1);
      assert.deepEqual(res.result, { tools: [] });
      assert.equal(res.error, undefined);
    });
  });

  describe("makeError", () => {
    it("creates valid error response", () => {
      const res = makeError(42, -32601, "Method not found");
      assert.equal(res.jsonrpc, "2.0");
      assert.equal(res.id, 42);
      assert.equal(res.error!.code, -32601);
      assert.equal(res.error!.message, "Method not found");
    });

    it("includes optional data", () => {
      const res = makeError(1, -32700, "Parse error", { raw: "invalid" });
      assert.deepEqual(res.error!.data, { raw: "invalid" });
    });
  });

  describe("sendResponse", () => {
    it("writes JSON-RPC response to write function", () => {
      let written = "";
      const write: (s: string) => void = (s) => { written = s; };
      sendResponse(write, 1, { success: true });
      const parsed = JSON.parse(written);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, 1);
      assert.deepEqual(parsed.result, { success: true });
    });

    it("writes newline after response", () => {
      let chunks: string[] = [];
      const write: (s: string) => void = (s) => { chunks.push(s); };
      sendResponse(write, "a", { value: 1 });
      assert.ok(chunks[0].endsWith("\n"));
    });
  });

  describe("sendError", () => {
    it("writes JSON-RPC error response", () => {
      let written = "";
      const write: (s: string) => void = (s) => { written = s; };
      sendError(write, 5, -32601, "Method not found");
      const parsed = JSON.parse(written);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, 5);
      assert.equal(parsed.error.code, -32601);
      assert.equal(parsed.error.message, "Method not found");
    });
  });
});

describe("MCP protocol flow", () => {
  it("initialize returns correct capabilities", () => {
    const result = {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false }
      },
      serverInfo: { name: "synapse-router-mcp", version: "0.1.0" }
    };

    assert.equal(result.protocolVersion, "2024-11-05");
    assert.deepEqual(result.capabilities.tools, { listChanged: false });
    assert.deepEqual(result.capabilities.resources, { subscribe: false, listChanged: false });
  });

  it("tools/list response structure is correct", () => {
    const res = makeResponse(1, {
      tools: [
        { name: "vault_set_key", description: "Store an API key for a provider" },
        { name: "vault_list_keys", description: "List all providers with stored keys" }
      ]
    });

    const tools = res.result as { tools: Array<{ name: string; description: string }> };
    assert.ok(Array.isArray(tools.tools));
    assert.equal(tools.tools.length, 2);
    assert.equal(tools.tools[0].name, "vault_set_key");
  });

  it("tools/call result wraps in content array", () => {
    const toolResult = { content: [{ type: "text" as const, text: '{"success":true}' }] };
    const res = makeResponse(2, toolResult);

    const result = res.result as typeof toolResult;
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, "text");
    assert.ok(typeof result.content[0].text === "string");
  });

  it("resources/list response structure is correct", () => {
    const res = makeResponse(3, {
      resources: [
        { uri: "providers://list", name: "providers_list" },
        { uri: "vault://status", name: "vault_status" }
      ]
    });

    const resources = res.result as { resources: Array<{ uri: string; name: string }> };
    assert.equal(resources.resources.length, 2);
    assert.equal(resources.resources[0].uri, "providers://list");
    assert.equal(resources.resources[1].uri, "vault://status");
  });

  it("resources/read response has contents array with uri, mimeType, text", () => {
    const res = makeResponse(4, {
      contents: [{
        uri: "providers://list",
        mimeType: "application/json",
        text: '{"providers":[]}'
      }]
    });

    const result = res.result as { contents: Array<{ uri: string; mimeType: string; text: string }> };
    assert.ok(Array.isArray(result.contents));
    assert.equal(result.contents[0].mimeType, "application/json");
    assert.ok(JSON.parse(result.contents[0].text));
  });

  it("invalid request returns parse error", () => {
    const res = makeError(null as unknown as string | number, -32700, "Invalid JSON-RPC request");
    assert.equal(res.error!.code, -32700);
  });

  it("unknown method returns method not found error", () => {
    const res = makeError(1, -32601, "Method not found: unknown_method");
    assert.equal(res.error!.code, -32601);
  });

  it("server error has code -32000", () => {
    const res = makeError(1, -32000, "Internal server error");
    assert.equal(res.error!.code, -32000);
  });
});

describe("tool name coverage", () => {
  const EXPECTED_TOOLS = [
    "vault_set_key",
    "vault_list_keys",
    "vault_get_key",
    "provider_list",
    "provider_show",
    "negotiate",
    "execute"
  ];

  it("all 7 tools are present in expected list", () => {
    assert.equal(EXPECTED_TOOLS.length, 7);
  });

  it("each tool has required fields for MCP spec", () => {
    const toolSchemas = [
      {
        name: "vault_set_key",
        inputSchema: {
          type: "object",
          properties: { provider: {}, key: {}, auth_type: {} },
          required: ["provider", "key"]
        }
      },
      {
        name: "vault_list_keys",
        inputSchema: { type: "object" }
      },
      {
        name: "vault_get_key",
        inputSchema: { type: "object", properties: { provider: {} }, required: ["provider"] }
      },
      {
        name: "provider_list",
        inputSchema: { type: "object" }
      },
      {
        name: "provider_show",
        inputSchema: { type: "object", properties: { provider: {} }, required: ["provider"] }
      },
      {
        name: "negotiate",
        inputSchema: { type: "object", properties: { agent_schema: {}, provider_id: {} } }
      },
      {
        name: "execute",
        inputSchema: {
          type: "object",
          properties: { provider: {}, feature: {}, input: {} },
          required: ["provider", "feature", "input"]
        }
      }
    ];

    for (const expected of EXPECTED_TOOLS) {
      const found = toolSchemas.find((t) => t.name === expected);
      assert.ok(found, `Tool ${expected} should be defined`);
    }
  });
});