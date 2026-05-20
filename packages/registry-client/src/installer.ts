// ─── Pack Installer ────────────────────────────────────────────────────────────
// Filesystem operations for installing/removing/listing/updating packs.
// Uses ~/.synapse/packs/ as the install directory and
// ~/.synapse/packs/registry-manifest.json as the manifest.

import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

import type { RegistryClient } from "./client.js";
import type {
  Manifest,
  ManifestEntry,
  InstallOptions,
  InstallResult,
} from "./types.js";

const SYNAPSE_DIR = join(homedir(), ".synapse");
const PACKS_DIR = join(SYNAPSE_DIR, "packs");
const MANIFEST_PATH = join(PACKS_DIR, "registry-manifest.json");

// ---------------------------------------------------------------------------
// Manifest management
// ---------------------------------------------------------------------------

async function loadManifest(): Promise<Manifest> {
  try {
    const content = await readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(content);
  } catch {
    return { packs: {} };
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await mkdir(PACKS_DIR, { recursive: true });
  await writeFile(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePackRef(
  input: string,
): { ns: string; name: string; version?: string } {
  let ns = "official";
  let name = input;
  let version: string | undefined;

  if (input.startsWith("@")) {
    const slashIndex = input.indexOf("/");
    if (slashIndex > 0) {
      ns = input.substring(1, slashIndex);
      name = input.substring(slashIndex + 1);
    } else {
      throw new Error(
        `Invalid pack reference: "${input}". Expected format: @namespace/name or name`,
      );
    }
  } else if (input.includes("/")) {
    const slashIndex = input.indexOf("/");
    ns = input.substring(0, slashIndex);
    name = input.substring(slashIndex + 1);
  }

  const atIndex = name.indexOf("@");
  if (atIndex > 0) {
    version = name.substring(atIndex + 1);
    name = name.substring(0, atIndex);
  }

  return { ns, name, version };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function installPack(
  client: RegistryClient,
  packRef: string,
  _opts?: InstallOptions,
): Promise<InstallResult> {
  const { ns, name, version } = parsePackRef(packRef);

  // Confirm pack exists in registry
  const searchResult = await client.searchPacks(name);
  if (searchResult.results.length === 0) {
    return {
      success: false,
      ns,
      name,
      version: version ?? "unknown",
      source: "registry",
      error: `No pack found matching "${name}"`,
    };
  }

  const match =
    searchResult.results.find((r) => r.name === name && r.ns === ns) ??
    searchResult.results[0];
  const resolvedVersion = version ?? match.version;

  // Download and extract
  const { buffer, checksum } = await client.downloadPack(
    match.ns,
    name,
    version,
  );

  // Namespaced directory: aliyun/qwen-image → packs/aliyun__qwen-image/
  const packDirName = `${match.ns}__${name}`;
  const packDir = join(PACKS_DIR, packDirName);
  await mkdir(packDir, { recursive: true });

  try {
    const tmpFile = join(
      SYNAPSE_DIR,
      `pack-${name}-${resolvedVersion}.tgz`,
    );
    await writeFile(tmpFile, buffer);

    execSync(
      `tar -xzf "${tmpFile}" -C "${packDir}" --strip-components=1 2>/dev/null || true`,
      { stdio: "pipe" },
    );

    try {
      await rm(tmpFile);
    } catch {
      // ignore
    }
  } catch {
    const packFile = join(packDir, "pack.tgz");
    await writeFile(packFile, buffer);
  }

  // Create minimal pack.json if it doesn't exist
  const packJsonPath = join(packDir, "pack.json");
  try {
    await stat(packJsonPath);
  } catch {
    const packJson = {
      name,
      namespace: `@${match.ns}`,
      version: resolvedVersion,
      description: `Pack: ${name}`,
      core_version: ">=0.1.0",
      checksum,
    };
    await writeFile(
      packJsonPath,
      JSON.stringify(packJson, null, 2) + "\n",
      "utf8",
    );
  }

  // Record in manifest (namespaced key: "aliyun/qwen-image")
  const manifest = await loadManifest();
  const manifestKey = `${match.ns}/${name}`;
  manifest.packs[manifestKey] = {
    id: `${match.ns}/${name}`,
    ns: match.ns,
    name,
    version: resolvedVersion,
    installed_at: new Date().toISOString(),
    source: "registry",
    checksum,
  };
  await saveManifest(manifest);

  return {
    success: true,
    ns: match.ns,
    name,
    version: resolvedVersion,
    source: "registry",
  };
}

export async function removePack(name: string): Promise<boolean> {
  const manifest = await loadManifest();

  // Try namespaced key first (e.g. "aliyun/qwen-image"), then flat name (backward compat)
  let entry = manifest.packs[name];
  let manifestKey = name;
  if (!entry) {
    // Fallback: try flat name (pre-namespaced installs)
    const flatKey = name.includes("/") ? name.split("/")[1] : name;
    entry = manifest.packs[flatKey];
    manifestKey = flatKey;
  }
  if (!entry && name.includes("__")) {
    // Double-underscore format: "aliyun__qwen-image" → "aliyun/qwen-image"
    const nsKey = name.replace("__", "/");
    entry = manifest.packs[nsKey];
    manifestKey = nsKey;
  }

  if (!entry) {
    return false;
  }

  // Determine pack directory: try nested (ns/name), then flat (name) for backward compat
  const nestedDir = join(PACKS_DIR, ...manifestKey.split("/"));
  const flatDir = join(PACKS_DIR, name.includes("/") ? name.split("/")[1] : name);

  try {
    await rm(nestedDir, { recursive: true, force: true });
  } catch {
    try {
      await rm(flatDir, { recursive: true, force: true });
    } catch {
      // neither format existed on disk — still clean up manifest
    }
  }

  delete manifest.packs[manifestKey];
  // Also clean up any old-format key
  if (manifestKey.includes("/")) {
    delete manifest.packs[manifestKey.split("/")[1]];
  }
  await saveManifest(manifest);
  return true;
}

export async function listInstalledPacks(): Promise<ManifestEntry[]> {
  const manifest = await loadManifest();
  return Object.values(manifest.packs);
}

export async function updatePack(
  client: RegistryClient,
  name?: string,
): Promise<{
  updated: InstallResult[];
  upToDate: string[];
  failed: Array<{ name: string; error: string }>;
}> {
  const manifest = await loadManifest();
  const entries = Object.values(manifest.packs);

  if (entries.length === 0) {
    return { updated: [], upToDate: [], failed: [] };
  }

  const toUpdate = name
    ? entries.filter((e) => e.name === name)
    : entries;

  const updated: InstallResult[] = [];
  const upToDate: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const entry of toUpdate) {
    try {
      const detail = await client.getPack(entry.ns, entry.name);
      const latestVersion = detail.version;

      if (latestVersion === entry.version) {
        upToDate.push(entry.name);
      } else {
        const result = await installPack(
          client,
          `@${entry.ns}/${entry.name}@${latestVersion}`,
        );
        if (result.success) {
          updated.push(result);
        } else {
          failed.push({ name: entry.name, error: result.error ?? "unknown" });
        }
      }
    } catch (err: unknown) {
      failed.push({
        name: entry.name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { updated, upToDate, failed };
}
