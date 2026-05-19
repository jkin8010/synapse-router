// Skill installation logic: backup -> copy -> manifest

import { copyFile, mkdir, access } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { writeManifest } from "./manifest.js";
import { resolveInstallInfo, VALID_PLATFORMS } from "./detect.js";
import type { Platform, InstallInfo } from "./detect.js";
import type { ManifestEntry, InstallManifest } from "./manifest.js";

/** Options for installSkill */
export interface InstallOptions {
  /** Target platform identifier */
  platform: string;
  /** Directory containing skills/ subdirectory with source files */
  skillsDir: string;
  /** Directory for .synapse/ (install manifest and backups) */
  synapseDir: string;
  /** Custom install directory override */
  customDir?: string;
  /** If true, print plan without writing files */
  dryRun: boolean;
  /** Current working directory */
  cwd: string;
  /** User home directory */
  home: string;
}

/**
 * Install Synapse Router Skill for the specified platform.
 *
 * Flow: validate -> resolve paths -> dry-run check -> backup existing -> copy files -> write manifest
 * All-or-nothing: manifest is written ONLY after all copies succeed.
 *
 * @throws {Error} If platform is invalid, source files missing, or copy fails
 */
export async function installSkill(options: InstallOptions): Promise<void> {
  const { platform, skillsDir, synapseDir, customDir, dryRun, cwd, home } = options;

  // Phase 0: Validate platform
  if (!VALID_PLATFORMS.includes(platform as Platform)) {
    throw new Error("Unknown platform: " + platform + ". Valid: claude-code, cursor, codex, openclaw, hermes");
  }

  // Phase 1: Resolve paths
  const info: InstallInfo = resolveInstallInfo(platform as Platform, cwd, home, customDir);

  // Determine actual target file path
  let targetFile: string;
  if (info.isDirectoryTarget) {
    targetFile = join(info.targetPath, info.targetName);
  } else {
    targetFile = info.targetPath;
  }
  const sourceFile = join(skillsDir, info.sourceFile);

  // Build manifest entry
  const manifestEntries: ManifestEntry[] = [];

  // Phase 2: Build manifest entries
  const entry: ManifestEntry = {
    source: info.sourceFile,
    target: targetFile,
    backup: null,
  };
  manifestEntries.push(entry);

  // Phase 3: Dry run
  if (dryRun) {
    console.log("[DRY RUN] Installing Synapse Router Skill for platform: " + platform);
    console.log("Would copy " + manifestEntries.length + " file(s):");
    console.log("  " + info.sourceFile + " -> " + targetFile);
    console.log("Would write install manifest: " + join(synapseDir, "install-manifest.json"));
    return;
  }

  // Phase 4: Backup existing file
  try {
    await access(targetFile);
    // File exists -- back it up
    const backupDir = join(synapseDir, "install-backups");
    const backupName = "backup-" + Date.now() + "-" + basename(targetFile);
    const backupPath = join(backupDir, backupName);
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(targetFile, backupPath);
    entry.backup = backupPath;
  } catch {
    // File does not exist or access check failed -- no backup needed
  }

  // Phase 5: Copy files (all-or-nothing)
  await mkdir(dirname(targetFile), { recursive: true });
  try {
    await copyFile(sourceFile, targetFile);
  } catch (err) {
    // Copy failed -- throw without writing manifest
    const message = err instanceof Error ? err.message : String(err);
    throw new Error("Failed to copy skill file: " + message);
  }

  // Phase 6: Write manifest (only after all copies succeed)
  const manifest: InstallManifest = {
    version: "1",
    createdAt: new Date().toISOString(),
    packageVersion: "0.1.0",
    platform,
    files: manifestEntries,
  };
  await writeManifest(synapseDir, manifest);

  // Phase 7: Success output
  console.log("Synapse Router Skill installed for " + platform + "!");
  console.log("  Installed " + manifestEntries.length + " file(s)");
  console.log("  Manifest: " + join(synapseDir, "install-manifest.json"));
}
