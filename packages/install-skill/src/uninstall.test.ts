// Tests for uninstallSkill function

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { uninstallSkill } from "./uninstall.js";
import { writeManifest } from "./manifest.js";

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

describe("uninstallSkill", () => {
  it("reads manifest, deletes tracked files, restores backups, and deletes manifest file", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");

      // Create target files and backup files
      const targetDir = join(dir, "targets");
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, "SKILL.md"), "# Installed skill\n");

      const backupDir = join(synapseDir, "install-backups");
      mkdirSync(backupDir, { recursive: true });
      const backupPath = join(backupDir, "backup-123-SKILL.md");
      writeFileSync(backupPath, "# Original backup\n");

      // Create manifest
      await writeManifest(synapseDir, {
        version: "1",
        createdAt: "2026-05-19T12:00:00.000Z",
        packageVersion: "0.1.0",
        platform: "claude-code",
        files: [
          {
            source: "claude-code/skill.md",
            target: join(targetDir, "SKILL.md"),
            backup: backupPath,
          },
        ],
      });

      // Verify files exist before uninstall
      assert.equal(existsSync(join(targetDir, "SKILL.md")), true, "Target file should exist before uninstall");
      assert.equal(existsSync(join(synapseDir, "install-manifest.json")), true, "Manifest should exist before uninstall");

      const result = await uninstallSkill(synapseDir);
      assert.equal(result, true, "uninstallSkill should return true on success");

      // Verify target file was deleted (and then backup was restored)
      // The backup should have restored the original content
      const restoredTarget = join(targetDir, "SKILL.md");
      assert.equal(existsSync(restoredTarget), true, "Target file should be restored from backup");
      const restoredContent = await import("node:fs").then((fs) =>
        fs.readFileSync(restoredTarget, "utf8")
      );
      assert.equal(restoredContent, "# Original backup\n", "Restored content should match backup");

      // Verify manifest is removed
      assert.equal(existsSync(join(synapseDir, "install-manifest.json")), false, "Manifest should be deleted");
    } finally {
      cleanup();
    }
  });

  it("returns false and prints message when no manifest exists", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.join(" "));
      };

      try {
        const result = await uninstallSkill(synapseDir);
        assert.equal(result, false, "Should return false when no manifest");
      } finally {
        console.log = originalLog;
      }

      const allOutput = logs.join("\n");
      assert.ok(allOutput.includes("Nothing to uninstall"), "Should print 'Nothing to uninstall'");
    } finally {
      cleanup();
    }
  });

  it("handles missing target files gracefully (ENOENT silently caught)", async () => {
    const { dir, cleanup } = createTempDir();
    try {
      const synapseDir = join(dir, ".synapse");
      const backupDir = join(synapseDir, "install-backups");
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(join(backupDir, "backup-123-SKILL.md"), "# Original\n");

      // Create manifest pointing to a non-existent target file
      await writeManifest(synapseDir, {
        version: "1",
        createdAt: "2026-05-19T12:00:00.000Z",
        packageVersion: "0.1.0",
        platform: "cursor",
        files: [
          {
            source: "cursor/.cursorrules",
            target: join(dir, "nonexistent", "file.mdc"),
            backup: join(backupDir, "backup-123-SKILL.md"),
          },
        ],
      });

      const result = await uninstallSkill(synapseDir);
      assert.equal(result, true, "Should succeed even if target file was already removed");
    } finally {
      cleanup();
    }
  });
});
