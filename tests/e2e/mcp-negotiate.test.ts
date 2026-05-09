import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./helpers.js";

async function withMcpServer(
  fn: (send: (msg: object) => Promise<object>) => Promise<void>
): Promise<void> {
  const bin = join(ROOT, "apps", "mcp-server", "dist", "src", "index.js");
  const proc = spawn("node", [bin], { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map<string | number, (data: unknown) => void>();

  let buffer = "";
  const stdout = proc.stdout!;
  stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const resolve = pending.get(parsed.id);
        if (resolve) {
          pending.delete(parsed.id);
          resolve(parsed);
        }
      } catch {
        // skip partial lines
      }
    }
  });

  const send = (msg: object): Promise<object> => {
    return new Promise((resolve) => {
      const id = (msg as any).id;
      pending.set(id, resolve);
      proc.stdin!.write(JSON.stringify(msg) + "\n");
    });
  };

  try {
    await new Promise((r) => setTimeout(r, 200));
    await fn(send);
  } finally {
    proc.kill();
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 500);
  }
}

describe("MCP Server negotiate tool E2E", () => {
  it("initialize -> tools/list -> tools/call negotiate completes", async () => {
    await withMcpServer(async (send) => {
      const initResult = await send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      });
      const init = initResult as any;
      assert.equal(
        init.result?.protocolVersion,
        "2024-11-05",
        `Expected protocolVersion, got: ${JSON.stringify(init.result)}`
      );
      assert.ok(init.result?.capabilities?.tools);

      const listResult = await send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
      const list = listResult as any;
      assert.ok(Array.isArray(list.result?.tools));
      const toolNames = list.result.tools.map((t: any) => t.name);
      assert.ok(toolNames.includes("negotiate"));

      const result = await send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "negotiate",
          arguments: {
            agent_schema: {
              task: "generate chat response",
              goal: "reply to user query",
            },
            provider_id: "openai",
          },
        },
      });
      assert.ok((result as any).result?.content?.[0]?.text !== undefined);
    });
  });

  it("tools/call with missing provider_id returns error", async () => {
    await withMcpServer(async (send) => {
      await send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      });

      const result = await send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "negotiate",
          arguments: {
            agent_schema: { task: "test" },
          },
        },
      });
      const neg = result as any;
      assert.ok(
        neg.error !== undefined || neg.result?.isError === true
      );
    });
  });
});
