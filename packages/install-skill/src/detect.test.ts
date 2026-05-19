// Tests for platform detection and install manifest

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectPlatform, resolveInstallInfo } from "./detect.js";
import type { Platform } from "./detect.js";
import { writeManifest, readManifest } from "./manifest.js";

/**
 * Helper: create a temp directory for each test and return cleanup function.
 */
function createTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "install-skill-test-"));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("detectPlatform", () => {
  it("detects claude-code when .claude/ directory exists in CWD", () => {
    const { dir, cleanup } = createTempDir();
    try {
      mkdirSync(join(dir, ".claude"));
      const result = detectPlatform(dir, "/fake-home");
      assert.equal(result, "claude-code");
    } finally {
      cleanup();
    }
  });

  it("detects claude-code when CLAUDE.md file exists in CWD", () => {
    const { dir, cleanup } = createTempDir();
    try {
      writeFileSync(join(dir, "CLAUDE.md"), "");
      const result = detectPlatform(dir, "/fake-home");
      assert.equal(result, "claude-code");
    } finally {
      cleanup();
    }
  });

  it("detects cursor when .cursor/ directory exists in CWD", () => {
    const { dir, cleanup } = createTempDir();
    try {
      mkdirSync(join(dir, ".cursor"));
      const result = detectPlatform(dir, "/fake-home");
      assert.equal(result, "cursor");
    } finally {
      cleanup();
    }
  });

  it("detects cursor when .cursorrules file exists in CWD", () => {
    const { dir, cleanup } = createTempDir();
    try {
      writeFileSync(join(dir, ".cursorrules"), "");
      const result = detectPlatform(dir, "/fake-home");
      assert.equal(result, "cursor");
    } finally {
      cleanup();
    }
  });

  it("detects codex when ~/.codex/ directory exists", () => {
    const { dir, cleanup } = createTempDir();
    try {
      mkdirSync(join(dir, ".codex"));
      const result = detectPlatform("/fake-cwd", dir);
      assert.equal(result, "codex");
    } finally {
      cleanup();
    }
  });

  it("detects openclaw when ~/.openclaw/ directory exists", () => {
    const { dir, cleanup } = createTempDir();
    try {
      mkdirSync(join(dir, ".openclaw"));
      const result = detectPlatform("/fake-cwd", dir);
      assert.equal(result, "openclaw");
    } finally {
      cleanup();
    }
  });

  it("detects hermes when ~/.hermes/ directory exists", () => {
    const { dir, cleanup } = createTempDir();
    try {
      mkdirSync(join(dir, ".hermes"));
      const result = detectPlatform("/fake-cwd", dir);
      assert.equal(result, "hermes");
    } finally {
      cleanup();
    }
  });

  it("returns claude-code (first priority) when both .claude/ and .cursor/ exist", () => {
    const { dir, cleanup } = createTempDir();
    try {
      mkdirSync(join(dir, ".claude"));
      mkdirSync(join(dir, ".cursor"));
      const result = detectPlatform(dir, "/fake-home");
      // claude-code has priority 1, cursor has priority 2
      assert.equal(result, "claude-code");
    } finally {
      cleanup();
    }
  });

  it("returns null when no platform markers exist", () => {
    const { dir, cleanup } = createTempDir();
    try {
      const result = detectPlatform(dir, dir);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });
});

describe("resolveInstallInfo", () => {
  it("returns correct install info for claude-code platform", () => {
    const info = resolveInstallInfo("claude-code", "/project", "/home/user");
    assert.equal(info.targetPath, "/project/.claude/skills/synapse-router");
    assert.equal(info.sourceFile, "claude-code/skill.md");
    assert.equal(info.targetName, "SKILL.md");
    assert.equal(info.isDirectoryTarget, true);
  });

  it("returns correct install info for cursor platform", () => {
    const info = resolveInstallInfo("cursor", "/project", "/home/user");
    assert.equal(info.targetPath, "/project/.cursor/rules/synapse-router.mdc");
    assert.equal(info.sourceFile, "cursor/.cursorrules");
    assert.equal(info.targetName, "synapse-router.mdc");
    assert.equal(info.isDirectoryTarget, false);
  });

  it("returns correct install info for codex platform (home dir)", () => {
    const info = resolveInstallInfo("codex", "/project", "/home/user");
    assert.equal(info.targetPath, "/home/user/.codex/agents/synapse-router.yaml");
    assert.equal(info.sourceFile, "codex/agent.yaml");
    assert.equal(info.targetName, "synapse-router.yaml");
    assert.equal(info.isDirectoryTarget, false);
  });

  it("returns correct install info for openclaw platform (home dir)", () => {
    const info = resolveInstallInfo("openclaw", "/project", "/home/user");
    assert.equal(info.targetPath, "/home/user/.openclaw/agents/synapse-router.md");
    assert.equal(info.sourceFile, "openclaw/agent.md");
    assert.equal(info.targetName, "synapse-router.md");
    assert.equal(info.isDirectoryTarget, false);
  });

  it("returns correct install info for hermes platform (home dir)", () => {
    const info = resolveInstallInfo("hermes", "/project", "/home/user");
    assert.equal(info.targetPath, "/home/user/.hermes/agents/synapse-router.md");
    assert.equal(info.sourceFile, "hermes/agent.md");
    assert.equal(info.targetName, "synapse-router.md");
    assert.equal(info.isDirectoryTarget, false);
  });

  it("uses customDir when provided for claude-code (directory target)", () => {
    const info = resolveInstallInfo("claude-code", "/project", "/home/user", "/custom/path");
    assert.equal(info.targetPath, "/custom/path");
    assert.equal(info.sourceFile, "claude-code/skill.md");
    assert.equal(info.targetName, "SKILL.md");
    assert.equal(info.isDirectoryTarget, true);
  });

  it("uses customDir when provided for cursor (file target)", () => {
    const info = resolveInstallInfo("cursor", "/project", "/home/user", "/custom/path/file.mdc");
    assert.equal(info.targetPath, "/custom/path/file.mdc");
    assert.equal(info.sourceFile, "cursor/.cursorrules");
    assert.equal(info.targetName, "synapse-router.mdc");
    assert.equal(info.isDirectoryTarget, false);
  });
});

describe("install manifest", () => {
  it("writeManifest and readManifest roundtrip correctly", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");
      const manifest = {
        version: "1" as const,
        createdAt: "2026-05-19T12:00:00.000Z",
        packageVersion: "0.1.0",
        platform: "claude-code",
        files: [
          { source: "claude-code/skill.md", target: "/target/SKILL.md", backup: null },
        ],
      };

      await writeManifest(synapseDir, manifest);
      const result = await readManifest(synapseDir);

      assert.notEqual(result, null);
      assert.equal(result!.version, "1");
      assert.equal(result!.platform, "claude-code");
      assert.equal(result!.files.length, 1);
      assert.equal(result!.files[0].source, "claude-code/skill.md");
    } finally {
      cleanup();
    }
  });

  it("readManifest returns null when no manifest file exists", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");
      const result = await readManifest(synapseDir);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });

  it("readManifest returns null for unparseable JSON", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");
      mkdirSync(synapseDir, { recursive: true });
      writeFileSync(join(synapseDir, "install-manifest.json"), "not valid json");
      const result = await readManifest(synapseDir);
      assert.equal(result, null);
    } finally {
      cleanup();
    }
  });

  it("writeManifest uses atomic .tmp + rename pattern", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");
      const manifest = {
        version: "1" as const,
        createdAt: "2026-05-19T12:00:00.000Z",
        packageVersion: "0.1.0",
        platform: "cursor",
        files: [{ source: "cursor/.cursorrules", target: "/target/rules.mdc", backup: null }],
      };

      await writeManifest(synapseDir, manifest);

      // Verify no .tmp file remains
      assert.equal(existsSync(join(synapseDir, "install-manifest.json.tmp")), false);
      // Verify the actual file exists
      assert.equal(existsSync(join(synapseDir, "install-manifest.json")), true);
    } finally {
      cleanup();
    }
  });
});
