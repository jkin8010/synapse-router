// Uninstall logic: read manifest -> delete files -> restore backups -> clean up manifest

import { unlink, copyFile, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { readManifest } from "./manifest.js";

/**
 * Uninstall Synapse Router Skill for the current project.
 *
 * Reads the install manifest from .synapse/install-manifest.json,
 * deletes each tracked file, restores backups if available,
 * then removes the manifest file.
 *
 * @param synapseDir - Directory containing .synapse/ with install manifest
 * @returns true if uninstall was performed, false if no manifest found
 */
export async function uninstallSkill(synapseDir: string): Promise<boolean> {
  const manifest = await readManifest(synapseDir);

  if (!manifest) {
    console.log("No install manifest found. Nothing to uninstall.");
    return false;
  }

  let removedCount = 0;
  let restoredCount = 0;

  for (const entry of manifest.files) {
    // Delete target file
    try {
      await unlink(entry.target);
      console.log("  Removed: " + entry.target);
      removedCount++;
    } catch {
      // ENOENT silently caught -- file already gone
    }

    // Restore backup if available
    if (entry.backup) {
      try {
        await access(entry.backup);
        await mkdir(dirname(entry.target), { recursive: true });
        await copyFile(entry.backup, entry.target);
        console.log("  Restored: " + entry.backup + " -> " + entry.target);
        restoredCount++;
      } catch {
        // Backup may be gone, silently skip
      }
    }
  }

  // Delete manifest file
  try {
    await unlink(join(synapseDir, "install-manifest.json"));
  } catch {
    // ENOENT silently caught
  }

  console.log("Uninstall complete. Removed " + removedCount + " file(s), restored " + restoredCount + " backup(s).");
  return true;
}
