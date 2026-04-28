import { createVault } from "@synapse-router/vault";
import {
  MCP_PROTOCOL_VERSION,
  type ServerCapabilities,
  type ServerInfo,
} from "./types.js";
import { MCP_TOOLS } from "./tools.js";
import { MCP_RESOURCES } from "./resources.js";
import { handleToolCall } from "./tools.js";
import { handleResourceRead } from "./resources.js";
import {
  parseRequest,
  sendResponse,
  sendError,
} from "./transport.js";

const serverCapabilities: ServerCapabilities = {
  tools: { listChanged: false },
  resources: { subscribe: false, listChanged: false },
  prompts: { listChanged: false },
};

const serverInfo: ServerInfo = {
  name: "synapse-router-mcp",
  version: "0.1.0",
};

// Error codes for JSON-RPC
const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INVALID_REQUEST = -32600;

// Track initialization state
let initialized = false;

async function main(): Promise<void> {
  const vault = createVault();

  // Read lines from stdin
  const lines = readLines(process.stdin);

  for await (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    const req = parseRequest(line);
    if (!req) {
      // Invalid JSON-RPC - write error to stdout
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: PARSE_ERROR, message: "Invalid JSON-RPC request" }
        }) + "\n"
      );
      continue;
    }

    const { id, method } = req;

    try {
      if (method === "initialize") {
        const result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: serverCapabilities,
          serverInfo,
        };
        sendResponse(process.stdout.write.bind(process.stdout), id, result);
      } else if (method === "notifications/initialized") {
        // Client has finished initialization; no response needed
        initialized = true;
      } else if (method === "tools/list") {
        sendResponse(process.stdout.write.bind(process.stdout), id, { tools: MCP_TOOLS });
      } else if (method === "tools/call") {
        const result = await handleToolCall(req.params ?? {}, vault);
        sendResponse(process.stdout.write.bind(process.stdout), id, result);
      } else if (method === "resources/list") {
        sendResponse(process.stdout.write.bind(process.stdout), id, { resources: MCP_RESOURCES });
      } else if (method === "resources/read") {
        const result = await handleResourceRead((req.params ?? {}) as Record<string, unknown>, vault);
        sendResponse(process.stdout.write.bind(process.stdout), id, result);
      } else if (method === "ping") {
        sendResponse(process.stdout.write.bind(process.stdout), id, { pong: true });
      } else {
        // Method not found - error response
        sendError(
          process.stdout.write.bind(process.stdout),
          id ?? 0,
          METHOD_NOT_FOUND,
          `Method not found: ${method}`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(
        process.stdout.write.bind(process.stdout),
        id ?? 0,
        -32000, // Server error
        message
      );
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function* readLines(
  stream: NodeJS.ReadableStream
): AsyncGenerator<string, void, undefined> {
  const reader = stream[Symbol.asyncIterator]();
  let remainder = "";

  while (true) {
    const { value, done } = await reader.next();
    if (done) {
      if (remainder) yield remainder;
      return;
    }

    const chunk = remainder + value;
    const lines = chunk.split("\n");
    remainder = lines.pop() ?? "";

    for (const line of lines) {
      yield line;
    }
  }
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("[mcp-server] Fatal error:", err);
  process.exit(1);
});