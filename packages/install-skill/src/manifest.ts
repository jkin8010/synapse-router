// Install manifest types and atomic CRUD operations

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";

/**
 * Entry in the install manifest tracking one installed file.
 */
export interface ManifestEntry {
  /** Package-relative source path (e.g., "skills/claude-code/skill.md") */
  source: string;
  /** Absolute target path after install */
  target: string;
  /** Backup path if file existed before overwrite, null if fresh install */
  backup: string | null;
}

/**
 * Install manifest tracking all files installed by install-skill.
 */
export interface InstallManifest {
  /** Manifest schema version */
  version: "1";
  /** ISO 8601 timestamp of install */
  createdAt: string;
  /** Version of @synapse-router/install-skill that created this */
  packageVersion: string;
  /** Platform identifier (e.g., "claude-code") */
  platform: string;
  /** Array of installed file entries */
  files: ManifestEntry[];
}

/** Filename for the install manifest */
const MANIFEST_FILE = "install-manifest.json";

/**
 * Read install manifest from synapseDir.
 * Returns null if file is missing or unparseable.
 */
export async function readManifest(synapseDir: string): Promise<InstallManifest | null> {
  try {
    const content = await readFile(join(synapseDir, MANIFEST_FILE), "utf8");
    return JSON.parse(content) as InstallManifest;
  } catch {
    return null;
  }
}

/**
 * Write install manifest atomically.
 * Uses .tmp + rename pattern to prevent concurrent corruption.
 */
export async function writeManifest(synapseDir: string, manifest: InstallManifest): Promise<void> {
  const dest = join(synapseDir, MANIFEST_FILE);
  await mkdir(dirname(dest), { recursive: true });
  // Atomic write: write to .tmp then rename
  const tmp = dest + ".tmp";
  await writeFile(tmp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await rename(tmp, dest);
}
