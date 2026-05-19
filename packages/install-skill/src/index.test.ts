// Integration tests for the install-skill CLI entry point

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "./index.js";

/**
 * Helper: create a temp directory for each test.
 */
function createTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "install-skill-cli-test-"));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

interface TestContext {
  dir: string;
  cleanup: () => void;
  logs: string[];
  errors: string[];
  exitCode: number | null;
  originalCwd: string;
  originalLog: typeof console.log;
  originalError: typeof console.error;
  originalExit: typeof process.exit;
  originalArgv: string[];
  originalHome: string | undefined;
}

/**
 * Set up a test context: temp dir, capture console, override process.exit.
 */
function setupTest(): TestContext {
  const { dir, cleanup } = createTempDir();
  const logs: string[] = [];
  const errors: string[] = [];

  const originalCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const originalArgv = process.argv;
  const originalHome = process.env.HOME;

  // Override HOME to temp dir to avoid real platform markers in home directory
  process.env.HOME = dir;

  // Override process.exit to throw instead of terminating
  process.exit = ((code?: number) => {
    throw new Error("process.exit(" + code + ")");
  }) as (code?: number) => never;

  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.join(" "));
  };

  return {
    dir, cleanup,
    logs, errors, exitCode: null,
    originalCwd, originalLog, originalError, originalExit, originalArgv,
    originalHome,
  };
}

/**
 * Tear down test context.
 */
function teardownTest(ctx: TestContext): void {
  process.chdir(ctx.originalCwd);
  console.log = ctx.originalLog;
  console.error = ctx.originalError;
  process.exit = ctx.originalExit;
  process.argv = ctx.originalArgv;
  process.env.HOME = ctx.originalHome;
  ctx.cleanup();
}

describe("install-skill CLI", () => {
  it("installs for claude-code when .claude/ exists in CWD with no flags", async () => {
    const ctx = setupTest();
    try {
      // Set up: .claude/ dir in CWD, create mock skills
      mkdirSync(join(ctx.dir, ".claude"), { recursive: true });
      const skillsDir = join(ctx.dir, "skills");
      const claudeDir = join(skillsDir, "claude-code");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "skill.md"), "# Skill\n");

      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill"];

      await main();

      const targetFile = join(ctx.dir, ".claude", "skills", "synapse-router", "SKILL.md");
      assert.equal(existsSync(targetFile), true, "SKILL.md should be installed");
    } finally {
      teardownTest(ctx);
    }
  });

  it("uses --platform cursor to skip detection", async () => {
    const ctx = setupTest();
    try {
      const skillsDir = join(ctx.dir, "skills");
      const cursorDir = join(skillsDir, "cursor");
      mkdirSync(cursorDir, { recursive: true });
      writeFileSync(join(cursorDir, ".cursorrules"), "# Cursor rules\n");

      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill", "--platform", "cursor"];

      await main();

      const targetFile = join(ctx.dir, ".cursor", "rules", "synapse-router.mdc");
      assert.equal(existsSync(targetFile), true, "synapse-router.mdc should be installed");
    } finally {
      teardownTest(ctx);
    }
  });

  it("prints error and exits 1 for invalid --platform", async () => {
    const ctx = setupTest();
    try {
      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill", "--platform", "invalid-platform"];

      await assert.rejects(
        async () => {
          await main();
        },
        (err: unknown) => {
          if (err instanceof Error && err.message.startsWith("process.exit(")) {
            return true;
          }
          return false;
        },
        "Should throw process.exit error",
      );

      const allErrors = ctx.errors.join("\n");
      assert.ok(allErrors.includes("Invalid platform"), "Should print invalid platform error");
      assert.ok(allErrors.includes("Valid"), "Should list valid platforms");
    } finally {
      teardownTest(ctx);
    }
  });

  it("--dry-run prints plan but creates no files", async () => {
    const ctx = setupTest();
    try {
      mkdirSync(join(ctx.dir, ".claude"), { recursive: true });
      const skillsDir = join(ctx.dir, "skills");
      const claudeDir = join(skillsDir, "claude-code");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "skill.md"), "# Skill\n");

      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill", "--dry-run"];

      await main();

      const allLogs = ctx.logs.join("\n");
      assert.ok(allLogs.includes("DRY RUN"), "Output should contain DRY RUN");

      const targetFile = join(ctx.dir, ".claude", "skills", "synapse-router", "SKILL.md");
      assert.equal(existsSync(targetFile), false, "No files created during dry run");
    } finally {
      teardownTest(ctx);
    }
  });

  it("--uninstall with existing manifest deletes tracked files and exits 0", async () => {
    const ctx = setupTest();
    try {
      // Set up: create a .synapse dir with manifest and a tracked file
      const synapseDir = join(ctx.dir, ".synapse");
      mkdirSync(synapseDir, { recursive: true });

      const targetDir = join(ctx.dir, "targets");
      mkdirSync(targetDir, { recursive: true });
      const targetFile = join(targetDir, "test.md");
      writeFileSync(targetFile, "# Installed\n");

      // Write manifest
      const manifestJson = JSON.stringify({
        version: "1",
        createdAt: "2026-05-19T12:00:00.000Z",
        packageVersion: "0.1.0",
        platform: "claude-code",
        files: [{ source: "test.md", target: targetFile, backup: null }],
      });
      writeFileSync(join(synapseDir, "install-manifest.json"), manifestJson);

      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill", "--uninstall"];

      await main();

      // Target file should be deleted
      assert.equal(existsSync(targetFile), false, "Target file should be deleted");
      assert.equal(existsSync(join(synapseDir, "install-manifest.json")), false, "Manifest should be deleted");
    } finally {
      teardownTest(ctx);
    }
  });

  it("--uninstall without manifest prints appropriate message", async () => {
    const ctx = setupTest();
    try {
      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill", "--uninstall"];

      await main();

      const allLogs = ctx.logs.join("\n");
      assert.ok(allLogs.includes("Nothing to uninstall"), "Should print nothing to uninstall");
    } finally {
      teardownTest(ctx);
    }
  });

  it("--dir overrides default install path for claude-code", async () => {
    const ctx = setupTest();
    try {
      const skillsDir = join(ctx.dir, "skills");
      const claudeDir = join(skillsDir, "claude-code");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "skill.md"), "# Skill\n");

      const customDir = join(ctx.dir, "my-custom-dir");

      process.chdir(ctx.dir);
      // For claude-code, --dir sets the target directory
      process.argv = ["node", "install-skill", "--platform", "claude-code", "--dir", customDir];

      await main();

      const targetFile = join(customDir, "SKILL.md");
      assert.equal(existsSync(targetFile), true, "File should be in custom dir");
    } finally {
      teardownTest(ctx);
    }
  });

  it("prints error and exits 1 when no platform detectable", async () => {
    const ctx = setupTest();
    try {
      // Empty dir with no platform markers
      process.chdir(ctx.dir);
      process.argv = ["node", "install-skill"];

      await assert.rejects(
        async () => {
          await main();
        },
        (err: unknown) => {
          if (err instanceof Error && err.message.startsWith("process.exit(")) {
            return true;
          }
          return false;
        },
        "Should throw process.exit error",
      );

      const allErrors = ctx.errors.join("\n");
      assert.ok(allErrors.includes("Could not detect"), "Should print detection error");
      assert.ok(allErrors.includes("--platform"), "Should suggest --platform flag");
    } finally {
      teardownTest(ctx);
    }
  });
});
