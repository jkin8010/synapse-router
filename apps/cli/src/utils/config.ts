// @synapse-router/cli — Shared config utility
// Cascading config: global (~/.synapse/config.json) + project-local (cwd/.synapse/config.json)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { cwd } from "node:process";

export const GLOBAL_SYNAPSE_DIR = join(homedir(), ".synapse");
export const GLOBAL_CONFIG_PATH = join(GLOBAL_SYNAPSE_DIR, "config.json");

export function getLocalConfigDir(): string {
  return join(cwd(), ".synapse");
}

export function getLocalConfigPath(): string {
  return join(getLocalConfigDir(), "config.json");
}

/**
 * Deep-merge two objects. Source values override target values.
 * Only plain objects are merged recursively — arrays and primitives are replaced.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null && typeof value === "object" && !Array.isArray(value) &&
      result[key] !== null && typeof result[key] === "object" && !Array.isArray(result[key] as Record<string, unknown>)
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Load config with cascading: global → project-local.
 * Project-local values override global ones.
 */
export async function loadMergedConfig(): Promise<Record<string, unknown>> {
  // Load global config
  let global: Record<string, unknown> = {};
  try {
    const content = await readFile(GLOBAL_CONFIG_PATH, "utf8");
    global = JSON.parse(content);
  } catch {
    // Global config doesn't exist yet
  }

  // Load project-local config
  const localPath = getLocalConfigPath();
  let local: Record<string, unknown> = {};
  try {
    const content = await readFile(localPath, "utf8");
    local = JSON.parse(content);
  } catch {
    // No local config — no merge needed
  }

  // If no local config, return global as-is
  if (Object.keys(local).length === 0) return global;

  // Deep-merge: local overrides global
  return deepMerge(global, local);
}

/**
 * Save config to global path (~/.synapse/config.json).
 */
export async function saveGlobalConfig(config: Record<string, unknown>): Promise<void> {
  await mkdir(GLOBAL_SYNAPSE_DIR, { recursive: true });
  await writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/**
 * Save config to project-local path (cwd/.synapse/config.json).
 */
export async function saveLocalConfig(config: Record<string, unknown>): Promise<void> {
  const localDir = getLocalConfigDir();
  const localPath = getLocalConfigPath();
  await mkdir(localDir, { recursive: true });
  await writeFile(localPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}
