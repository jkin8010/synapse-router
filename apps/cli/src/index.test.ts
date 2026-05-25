import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function runCli(args: string[]): { stdout: string; stderr: string; code: number } {
  // Use __dirname so the path is stable regardless of cwd when tests run
  const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
  console.log("=== runCli ===");
  console.log("args:", args);
  console.log("bin:", bin);
  const result = spawnSync("node", [bin, ...args], { encoding: "utf8", cwd: process.cwd() });
  console.log("stdout:", JSON.stringify(result.stdout));
  console.log("stderr:", JSON.stringify(result.stderr));
  console.log("code:", result.status);
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

describe("help", () => {
  it("synapse help prints help text", () => {
    const result = runCli(["help"]);
    assert.ok(result.stdout.includes("Synapse Router CLI"), `got: ${result.stdout}`);
    assert.ok(result.stdout.includes("provider"), "should list provider command");
    assert.ok(result.stdout.includes("vault"), "should list vault command");
    assert.ok(result.stdout.includes("negotiate"), "should list negotiate command");
    assert.strictEqual(result.code, 0);
  });

  it("--help flag prints help text", () => {
    const result = runCli(["--help"]);
    assert.ok(result.stdout.includes("Synapse Router CLI"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("-h flag prints help text", () => {
    const result = runCli(["-h"]);
    assert.ok(result.stdout.includes("Synapse Router CLI"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("prints 3-group section headers: Core Workflow, Configuration, Advanced", () => {
    // Task 2 TDD: these will fail until printHelp() is updated to 3-group format
    const result = runCli(["--help"]);
    assert.ok(result.stdout.includes("Core Workflow"), `should have Core Workflow section, got: ${result.stdout}`);
    assert.ok(result.stdout.includes("Configuration"), `should have Configuration section, got: ${result.stdout}`);
    assert.ok(result.stdout.includes("Advanced"), `should have Advanced section, got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("still shows Getting started and Detailed help sections", () => {
    const result = runCli(["--help"]);
    assert.ok(result.stdout.includes("Getting started"), `got: ${result.stdout}`);
    assert.ok(result.stdout.includes("Detailed help"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  // Task 3: help <subcommand> tests
  it("synapse help vault prints vault help text", () => {
    const result = runCli(["help", "vault"]);
    assert.ok(result.stdout.includes("Manage encrypted API keys"), `got: ${result.stdout}`);
    assert.ok(result.stdout.includes("synapse vault set"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("synapse help connect prints connect help text", () => {
    const result = runCli(["help", "connect"]);
    assert.ok(result.stdout.includes("Connect to a provider"), `got: ${result.stdout}`);
    assert.ok(result.stdout.includes("synapse connect"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("synapse help provider prints provider help text", () => {
    const result = runCli(["help", "provider"]);
    assert.ok(result.stdout.includes("List and inspect provider packs"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("synapse help generate prints generate help text", () => {
    const result = runCli(["help", "generate"]);
    assert.ok(result.stdout.includes("Generate a Provider Pack from OpenAPI spec"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("synapse vault --help still prints vault help text", () => {
    const result = runCli(["vault", "--help"]);
    assert.ok(result.stdout.includes("Manage encrypted API keys"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });
});

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

describe("version", () => {
  it("--version prints version", () => {
    const result = runCli(["--version"]);
    assert.ok(result.stdout.includes("synapse-router CLI v0.1.0"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("-v prints version", () => {
    const result = runCli(["-v"]);
    assert.ok(result.stdout.includes("synapse-router CLI v0.1.0"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });
});

// ---------------------------------------------------------------------------
// Unknown command
// ---------------------------------------------------------------------------

describe("unknown command", () => {
  it("prints help for unknown top-level command", () => {
    const result = runCli(["foobar"]);
    assert.ok(result.stdout.includes("Synapse Router CLI"), `got: ${result.stdout}`);
    assert.strictEqual(result.code, 0);
  });

  it("prints help for unknown provider subcommand", () => {
    const result = runCli(["provider", "foobar"]);
    assert.ok(
      result.stdout.includes("provider") || result.stderr.includes("provider"),
      `got stdout: ${result.stdout}, stderr: ${result.stderr}`
    );
    assert.strictEqual(result.code, 0);
  });

  it("prints help for unknown vault subcommand", () => {
    const result = runCli(["vault", "foobar"]);
    assert.ok(
      result.stdout.includes("vault") || result.stderr.includes("vault"),
      `got stdout: ${result.stdout}, stderr: ${result.stderr}`
    );
    assert.strictEqual(result.code, 0);
  });
});

// ---------------------------------------------------------------------------
// Provider commands
// ---------------------------------------------------------------------------

describe("provider list", () => {
  it("lists providers from real packs directory", () => {
    const result = runCli(["provider", "list"]);
    console.log("=== DEBUG provider list ===");
    console.log("=== stdout ===");
    console.log(result.stdout);
    console.log("=== stderr ===");
    console.log(result.stderr);
    assert.ok(result.stdout.includes("Providers:"), `got: ${result.stdout}`);
    assert.ok(
      result.stdout.includes("openai") || result.stdout.includes("replicate"),
      `expected a provider, got: ${result.stdout}`
    );
    assert.strictEqual(result.code, 0);
  });
});

describe("provider show", () => {
  it("shows a specific provider", () => {
    const result = runCli(["provider", "show", "openai"]);
    console.log("=== DEBUG provider show ===");
    console.log("=== stdout ===");
    console.log(result.stdout);
    console.log("=== stderr ===");
    console.log(result.stderr);

    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.provider.id, "openai");
    assert.strictEqual(result.code, 0);
  });

  it("exits with error for unknown provider", () => {
    const result = runCli(["provider", "show", "nonexistent-provider"]);
    assert.notStrictEqual(result.code, 0);
  });

  it("exits with error when no provider id given", () => {
    const result = runCli(["provider", "show"]);
    assert.notStrictEqual(result.code, 0);
  });
});

// ---------------------------------------------------------------------------
// Vault commands
// ---------------------------------------------------------------------------

describe("vault list", () => {
  it("does not crash regardless of vault state", () => {
    const result = runCli(["vault", "list"]);
    assert.ok(
      result.stdout.includes("No keys stored") || result.stdout.includes("Stored providers:"),
      `got stdout: ${result.stdout}, stderr: ${result.stderr}`
    );
    assert.strictEqual(result.code, 0);
  });
});

describe("vault get", () => {
  it("exits with error when no key stored for provider", () => {
    const result = runCli(["vault", "get", "nonexistent-provider"]);
    assert.notStrictEqual(result.code, 0);
    assert.ok(
      result.stderr.includes("No key found") || result.stderr.includes("Error"),
      `got: ${result.stderr}`
    );
  });

  it("exits with error when no provider specified", () => {
    const result = runCli(["vault", "get"]);
    assert.notStrictEqual(result.code, 0);
  });
});

describe("vault remove", () => {
  it("exits cleanly (no error) when provider has no key", () => {
    const result = runCli(["vault", "remove", "nonexistent-provider"]);
    assert.strictEqual(result.code, 0);
    assert.ok(
      result.stdout.includes("No key for nonexistent-provider") ||
        result.stdout.includes("removed") ||
        result.stdout.includes("nonexistent-provider"),
      `got: ${result.stdout}`
    );
  });
});

describe("vault verify", () => {
  it("exits with error when no key stored for provider", () => {
    const result = runCli(["vault", "verify", "nonexistent-provider"]);
    assert.notStrictEqual(result.code, 0);
  });
});

describe("vault set", () => {
  it("reports missing arguments when provider or key not provided", () => {
    const result1 = runCli(["vault", "set"]);
    assert.notStrictEqual(result1.code, 0);

    const result2 = runCli(["vault", "set", "openai"]);
    assert.notStrictEqual(result2.code, 0);
  });
});

// ---------------------------------------------------------------------------
// Negotiate command
// ---------------------------------------------------------------------------

describe("negotiate", () => {
  it("exits with error when no schema file given", () => {
    const result = runCli(["negotiate"]);
    assert.notStrictEqual(result.code, 0);
    assert.ok(
      result.stderr.includes("schema file required") ||
        result.stderr.includes("Error") ||
        result.stdout.includes("schema file required"),
      `got stdout: ${result.stdout}, stderr: ${result.stderr}`
    );
  });

  it("exits with error for nonexistent schema file", () => {
    const result = runCli(["negotiate", "/tmp/doesnotexist-xyz.json"]);
    assert.notStrictEqual(result.code, 0);
  });

  it("exits with error when provider pack not found", () => {
    const result = runCli(["negotiate", "--intent", "chat", "--provider", "nonexistent-provider-xyz"]);
    assert.notStrictEqual(result.code, 0);
    assert.ok(
      result.stderr.includes("Provider pack not found") || result.stderr.includes("Error"),
      `got stdout: ${result.stdout}, stderr: ${result.stderr}`
    );
  });

  it("help output documents --format flag", () => {
    const result = runCli(["negotiate", "--help"]);
    assert.ok(result.stdout.includes("--format"), `help should include --format flag, got: ${result.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// Execute command (stub)
// ---------------------------------------------------------------------------

describe("execute", () => {
  it("reports renamed to connect", () => {
    const result = runCli(["execute", "openai", "chat", "{}"]);
    assert.notStrictEqual(result.code, 0);
    assert.ok(result.stderr.includes("renamed to"), `got: ${result.stderr}`);
  });
});
