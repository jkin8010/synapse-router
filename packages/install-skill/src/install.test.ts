// Tests for installSkill function

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installSkill } from "./install.js";
import { readManifest } from "./manifest.js";
import type { InstallOptions } from "./install.js";

/**
 * Helper: create a temp directory for each test.
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

/**
 * Helper: create a mock skills directory with platform files.
 */
function createMockSkills(baseDir: string): string {
  const skillsDir = join(baseDir, "skills");
  // claude-code
  const claudeCodeDir = join(skillsDir, "claude-code");
  mkdirSync(claudeCodeDir, { recursive: true });
  writeFileSync(join(claudeCodeDir, "skill.md"), "# Claude Code Skill\n");
  // cursor
  const cursorDir = join(skillsDir, "cursor");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(join(cursorDir, ".cursorrules"), "# Cursor Rules\n");
  // codex
  const codexDir = join(skillsDir, "codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(join(codexDir, "agent.yaml"), "name: synapse-router\n");
  // openclaw
  const openclawDir = join(skillsDir, "openclaw");
  mkdirSync(openclawDir, { recursive: true });
  writeFileSync(join(openclawDir, "agent.md"), "# OpenClaw Agent\n");
  // hermes
  const hermesDir = join(skillsDir, "hermes");
  mkdirSync(hermesDir, { recursive: true });
  writeFileSync(join(hermesDir, "agent.md"), "# Hermes Agent\n");
  return skillsDir;
}

describe("installSkill", () => {
  it("copies claude-code skill.md to target directory as SKILL.md", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");

      await installSkill({
        platform: "claude-code",
        skillsDir,
        synapseDir,
        dryRun: false,
        cwd,
        home,
      });

      const targetFile = join(cwd, ".claude", "skills", "synapse-router", "SKILL.md");
      assert.equal(existsSync(targetFile), true, "SKILL.md should exist after install");
      const content = readFileSync(targetFile, "utf8");
      assert.equal(content, "# Claude Code Skill\n");
    } finally {
      cleanup();
    }
  });

  it("copies cursor .cursorrules to .cursor/rules/synapse-router.mdc", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");

      await installSkill({
        platform: "cursor",
        skillsDir,
        synapseDir,
        dryRun: false,
        cwd,
        home,
      });

      const targetFile = join(cwd, ".cursor", "rules", "synapse-router.mdc");
      assert.equal(existsSync(targetFile), true, "synapse-router.mdc should exist after install");
      const content = readFileSync(targetFile, "utf8");
      assert.equal(content, "# Cursor Rules\n");
    } finally {
      cleanup();
    }
  });

  it("copies codex agent.yaml to home/.codex/agents/synapse-router.yaml", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = join(dir, "project");
      const home = dir;
      mkdirSync(cwd, { recursive: true });

      await installSkill({
        platform: "codex",
        skillsDir,
        synapseDir,
        dryRun: false,
        cwd,
        home,
      });

      const targetFile = join(home, ".codex", "agents", "synapse-router.yaml");
      assert.equal(existsSync(targetFile), true, "synapse-router.yaml should exist after install");
      const content = readFileSync(targetFile, "utf8");
      assert.equal(content, "name: synapse-router\n");
    } finally {
      cleanup();
    }
  });

  it("writes install-manifest.json after all copies succeed", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");

      await installSkill({
        platform: "claude-code",
        skillsDir,
        synapseDir,
        dryRun: false,
        cwd,
        home,
      });

      const manifest = await readManifest(synapseDir);
      assert.notEqual(manifest, null, "Manifest should exist after install");
      assert.equal(manifest!.version, "1");
      assert.equal(manifest!.platform, "claude-code");
      assert.equal(manifest!.files.length, 1);
      assert.ok(manifest!.files[0].target.endsWith("SKILL.md"), "Manifest should track SKILL.md");
      assert.equal(manifest!.files[0].backup, null, "Fresh install should have null backup");
    } finally {
      cleanup();
    }
  });

  it("dryRun prints plan but creates no files", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");

      // Capture console.log output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.join(" "));
      };

      try {
        await installSkill({
          platform: "claude-code",
          skillsDir,
          synapseDir,
          dryRun: true,
          cwd,
          home,
        });
      } finally {
        console.log = originalLog;
      }

      const allOutput = logs.join("\n");
      assert.ok(allOutput.includes("DRY RUN"), "Output should contain [DRY RUN]");
      assert.ok(allOutput.includes("claude-code"), "Output should mention platform");

      // Verify no files were created
      const targetDir = join(cwd, ".claude", "skills", "synapse-router");
      assert.equal(existsSync(targetDir), false, "No files should be created during dry run");

      // Verify no manifest was written
      const manifest = await readManifest(synapseDir);
      assert.equal(manifest, null, "No manifest should be written during dry run");
    } finally {
      cleanup();
    }
  });

  it("backs up existing file before overwriting", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");

      // Pre-create target file with existing content
      const targetDir = join(cwd, ".claude", "skills", "synapse-router");
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, "SKILL.md"), "# Existing skill\n");

      await installSkill({
        platform: "claude-code",
        skillsDir,
        synapseDir,
        dryRun: false,
        cwd,
        home,
      });

      // Verify backup directory exists
      const backupDir = join(synapseDir, "install-backups");
      assert.equal(existsSync(backupDir), true, "Backup directory should exist");

      // Verify new content is the installed version
      const targetFile = join(targetDir, "SKILL.md");
      const content = readFileSync(targetFile, "utf8");
      assert.equal(content, "# Claude Code Skill\n", "Installed file should have new content");

      // Verify manifest has backup path recorded
      const manifest = await readManifest(synapseDir);
      assert.notEqual(manifest, null);
      assert.notEqual(manifest!.files[0].backup, null, "Backup path should be recorded in manifest");
      assert.ok(
        manifest!.files[0].backup!.includes("install-backups"),
        "Backup should be in install-backups dir",
      );
    } finally {
      cleanup();
    }
  });

  it("creates parent directories via mkdir recursive before copyFile", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");
      // Do NOT pre-create .claude/skills/synapse-router - it doesn't exist

      await installSkill({
        platform: "claude-code",
        skillsDir,
        synapseDir,
        dryRun: false,
        cwd,
        home,
      });

      const targetFile = join(cwd, ".claude", "skills", "synapse-router", "SKILL.md");
      assert.equal(existsSync(targetFile), true, "File should be created even when parent dir doesn't exist");
    } finally {
      cleanup();
    }
  });

  it("uses customDir to override default install path", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = createMockSkills(dir);
      const synapseDir = join(dir, ".synapse");
      const customDir = join(dir, "my-custom-location");
      const cwd = dir;
      const home = join(dir, "home");

      await installSkill({
        platform: "claude-code",
        skillsDir,
        synapseDir,
        customDir,
        dryRun: false,
        cwd,
        home,
      });

      // File should be in customDir, not default location
      const targetFile = join(customDir, "SKILL.md");
      assert.equal(existsSync(targetFile), true, "File should be in customDir");
      const content = readFileSync(targetFile, "utf8");
      assert.equal(content, "# Claude Code Skill\n");

      // Default location should NOT have the file
      const defaultFile = join(cwd, ".claude", "skills", "synapse-router", "SKILL.md");
      assert.equal(existsSync(defaultFile), false, "Default location should NOT have the file");
    } finally {
      cleanup();
    }
  });

  it("throws if source file does not exist and does NOT write manifest", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const skillsDir = join(dir, "skills-nonexistent");
      const synapseDir = join(dir, ".synapse");
      const cwd = dir;
      const home = join(dir, "home");
      // Do NOT create skillsDir -- source files don't exist

      await assert.rejects(
        async () => {
          await installSkill({
            platform: "claude-code",
            skillsDir,
            synapseDir,
            dryRun: false,
            cwd,
            home,
          });
        },
        { name: "Error" },
        "Should throw when source file doesn't exist",
      );

      // Verify manifest was NOT written (all-or-nothing)
      const manifest = await readManifest(synapseDir);
      assert.equal(manifest, null, "Manifest should NOT be written when install fails");
    } finally {
      cleanup();
    }
  });
});
