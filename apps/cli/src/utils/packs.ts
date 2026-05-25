// @synapse-router/cli — Shared pack discovery utilities

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ProviderCard } from "@synapse-router/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** User-level packs directory (~/.synapse/packs/), for registry-installed packs */
export const USER_PACKS_DIR = join(homedir(), ".synapse", "packs");

/** Local project-level packs directory (.synapse/packs/), for project-local packs */
export const LOCAL_PACKS_DIR = () => join(process.cwd(), ".synapse", "packs");

// ---------------------------------------------------------------------------
// findPacksDir — resolve built-in packs/ directory relative to CLI package
// ---------------------------------------------------------------------------

export async function findPacksDir(): Promise<string> {
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    // From dist/utils/packs.js: 5 levels up = project root
    return join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");
  } else {
    // From src/utils/packs.ts: 4 levels up = project root
    return join(dirname(dirname(dirname(dirname(dir)))), "packs");
  }
}

// ---------------------------------------------------------------------------
// loadProviderCard — load a provider card from all pack sources
// ---------------------------------------------------------------------------

export async function loadProviderCard(
  packsDir: string, providerId: string
): Promise<{ card: ProviderCard; dir: string } | null> {
  // Search priority: built-in packs/ > local .synapse/packs/ > ~/.synapse/packs/
  for (const dir of [packsDir, LOCAL_PACKS_DIR(), USER_PACKS_DIR]) {
    // Try namespaced format: "aliyun/qwen-image" → dir/aliyun__qwen-image/
    if (providerId.includes("/")) {
      const nsDirName = providerId.replace("/", "__");
      const cardPath = join(dir, nsDirName, "provider-card.json");
      try {
        const content = await readFile(cardPath, "utf8");
        return { card: JSON.parse(content) as ProviderCard, dir };
      } catch { /* try flat fallback */ }
    }
    // Fallback: flat format (built-in packs or pre-namespaced installs)
    const flatName = providerId.includes("/") ? providerId.split("/")[1] : providerId;
    const cardPath = join(dir, flatName, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      return { card: JSON.parse(content) as ProviderCard, dir };
    } catch {
      // Flat name not found, try scanning all subdirectories by provider.id
      // (handles registry-installed packs with compound dir names like aliyun__qwen-image-edit)
    }

    // Scan all subdirectories for a provider-card.json with matching provider.id
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        try {
          const cardContent = await readFile(join(dir, entry.name, "provider-card.json"), "utf8");
          const parsed = JSON.parse(cardContent) as ProviderCard;
          if (parsed.provider?.id === providerId) {
            return { card: parsed, dir: join(dir, entry.name) };
          }
        } catch { /* not a valid pack directory */ }
      }
    } catch { /* directory doesn't exist, try next source */ }
  }
  return null;
}
