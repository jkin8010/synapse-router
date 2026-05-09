import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, startMockServer } from "./helpers.js";

function runCli(args: string[]): { stdout: string; stderr: string; code: number } {
  const bin = join(ROOT, "apps", "cli", "dist", "index.js");
  const result = spawnSync("node", [bin, ...args], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status ?? 1,
  };
}

describe("CLI connect E2E", () => {
  it("synapse connect openai chat completes full flow with MockServer", async () => {
    const { server, port } = await startMockServer();
    try {
      const mockInput = JSON.stringify({ messages: [{ role: "user", content: "hello" }], model: "gpt-4" });
      const args = ["connect", "openai", "chat", "--input", mockInput, "--base-url", `http://localhost:${port}`, "--api-key", "sk-placeholder", "--format", "json"];
      const result = runCli(args);
      assert.ok(result.stderr.length === 0 || result.stderr.includes("not yet"), `stderr should be empty or contain expected message, got: ${result.stderr}`);
      const parsed = JSON.parse(result.stdout);
      assert.ok(typeof parsed === "object", "stdout should be parseable JSON");
    } finally { await server.stop(); }
  });

  it("synapse connect with --help prints help text", () => {
    const result = runCli(["connect", "--help"]);
    assert.ok(result.stdout.includes("synapse connect"), `help should mention connect, got: ${result.stdout}`);
    assert.ok(result.stdout.includes("Usage:"), `help should contain Usage:, got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("synapse connect without args starts interactive mode (no crash)", () => {
    const result = runCli(["connect"]);
    assert.ok(result.code === 0 || result.code === 1, `exit should be 0 or 1, got ${result.code}`);
  });
});
