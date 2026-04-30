/**
 * Pack management commands — install, search, list, update, remove, show
 *
 * Uses inline fetch to call Registry API (no SDK dependency).
 * Default registry: https://registry.synapse-router.com
 * Install directory: ~/.synapse/packs/
 * Manifest: ~/.synapse/packs/registry-manifest.json
 */

import { readdir, readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL = "https://registry.synapse-router.com";
const SYNAPSE_DIR = join(homedir(), ".synapse");
const PACKS_DIR = join(SYNAPSE_DIR, "packs");
const MANIFEST_PATH = join(PACKS_DIR, "registry-manifest.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PackInfo {
  id: string;
  ns: string;
  name: string;
  version: string;
  description: string;
}

interface SearchResult {
  query: string;
  results: PackInfo[];
  total: number;
}

interface PackDownloadInfo {
  url: string;
  version: string;
  size: number;
  hash: string;
}

interface ManifestEntry {
  id: string;
  ns: string;
  name: string;
  version: string;
  installed_at: string;
  source: string;
  checksum: string;
}

interface Manifest {
  packs: Record<string, ManifestEntry>;
}

// ---------------------------------------------------------------------------
// Registry API helpers (inline fetch, no SDK dependency)
// ---------------------------------------------------------------------------

async function registryGet<T>(path: string, registryUrl?: string): Promise<T> {
  const baseUrl = registryUrl ?? process.env.SYNAPSE_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    let errorBody: any = null;
    try {
      errorBody = await response.json();
    } catch {
      // ignore
    }
    const message = errorBody?.error?.message ?? `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Registry API error: ${message}`);
  }

  return response.json() as Promise<T>;
}

async function searchPacks(
  query: string,
  registryUrl?: string
): Promise<SearchResult> {
  const response = await registryGet<any>(
    `/api/v1/search?q=${encodeURIComponent(query)}&type=pack`,
    registryUrl
  );

  const packs = response?.results?.packs ?? [];
  const results: PackInfo[] = packs.map((p: any) => ({
    id: `${p.namespace ?? "unknown"}/${p.name ?? "unknown"}`,
    ns: p.namespace ?? "unknown",
    name: p.name ?? "unknown",
    version: p.version ?? "unknown",
    description: p.description ?? "",
  }));

  return {
    query: response?.query ?? query,
    results,
    total: response?.total ?? results.length,
  };
}

async function getPackDetail(ns: string, name: string, registryUrl?: string): Promise<any> {
  return registryGet<any>(`/api/v1/packs/${ns}/${name}`, registryUrl);
}

async function getPackDownloadInfo(
  ns: string,
  name: string,
  version?: string,
  registryUrl?: string
): Promise<PackDownloadInfo> {
  const versionPath = version ? `/${version}` : "";
  return registryGet<PackDownloadInfo>(
    `/api/v1/packs/${ns}/${name}/download${versionPath}`,
    registryUrl
  );
}

// ---------------------------------------------------------------------------
// Pack parsing
// ---------------------------------------------------------------------------

interface ParsedPackRef {
  ns: string;
  name: string;
  version?: string;
}

function parsePackRef(input: string): ParsedPackRef {
  // Handle @ns/name@version, @ns/name, name@version, name
  let ns = "official";
  let name = input;
  let version: string | undefined;

  // Extract namespace
  if (input.startsWith("@")) {
    const slashIndex = input.indexOf("/");
    if (slashIndex > 0) {
      ns = input.substring(1, slashIndex);
      name = input.substring(slashIndex + 1);
    } else {
      throw new Error(`Invalid pack reference: "${input}". Expected format: @namespace/name or name`);
    }
  }

  // Extract version
  const atIndex = name.indexOf("@");
  if (atIndex > 0) {
    version = name.substring(atIndex + 1);
    name = name.substring(0, atIndex);
  }

  return { ns, name, version };
}

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
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Pack installation
// ---------------------------------------------------------------------------

async function installPack(
  ref: ParsedPackRef,
  registryUrl?: string
): Promise<void> {
  const { ns, name, version } = ref;

  // Step 1: Search to confirm pack exists
  console.log(`🔍 Searching for "${name}" in registry...`);
  const searchResult = await searchPacks(name, registryUrl);

  let packNs = ns;
  if (searchResult.results.length === 0) {
    console.error(`Error: No pack found matching "${name}"`);
    process.exit(1);
  }

  // Find exact match or use first result
  const match =
    searchResult.results.find((r) => r.name === name && r.ns === ns) ?? searchResult.results[0];
  packNs = match.ns;
  const resolvedVersion = version ?? match.version;

  console.log(`📦 Found: ${match.id}@${resolvedVersion}`);

  // Step 2: Get download info
  console.log(`⬇️  Downloading pack...`);
  const downloadInfo = await getPackDownloadInfo(packNs, name, version, registryUrl);
  console.log(`   Version: ${downloadInfo.version}`);
  console.log(`   Size: ${(downloadInfo.size / 1024).toFixed(1)} KB`);
  console.log(`   Hash: ${downloadInfo.hash}`);

  // Step 3: Download tarball
  const tarballResponse = await fetch(downloadInfo.url);
  if (!tarballResponse.ok) {
    console.error(`Error: Failed to download tarball (HTTP ${tarballResponse.status})`);
    process.exit(1);
  }

  const arrayBuffer = await tarballResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Step 4: Extract to local directory
  const packDir = join(PACKS_DIR, name);
  await mkdir(packDir, { recursive: true });

  // Try to extract using tar command
  try {
    const { execSync } = await import("node:child_process");
    const tmpFile = join(SYNAPSE_DIR, `pack-${name}-${downloadInfo.version}.tgz`);
    await writeFile(tmpFile, buffer);

    execSync(`tar -xzf "${tmpFile}" -C "${packDir}" --strip-components=1 2>/dev/null || true`, {
      stdio: "pipe",
    });

    // Clean up temp file
    try {
      await rm(tmpFile);
    } catch {
      // ignore
    }
  } catch {
    // If tar extraction fails, save raw content
    const packFile = join(packDir, "pack.tgz");
    await writeFile(packFile, buffer);
    console.log(`   (Saved as pack.tgz — tar extraction not available)`);
  }

  // Step 5: Create mock pack.json if it doesn't exist (demo mode)
  const packJsonPath = join(packDir, "pack.json");
  try {
    await stat(packJsonPath);
  } catch {
    // Create minimal pack.json for demo purposes
    const packJson = {
      name: name,
      namespace: `@${packNs}`,
      version: downloadInfo.version,
      description: `Pack: ${name}`,
      core_version: ">=0.1.0",
      checksum: downloadInfo.hash,
    };
    await writeFile(packJsonPath, JSON.stringify(packJson, null, 2) + "\n", "utf8");
  }

  // Step 6: Record in manifest
  const manifest = await loadManifest();
  manifest.packs[name] = {
    id: `${packNs}/${name}`,
    ns: packNs,
    name: name,
    version: downloadInfo.version,
    installed_at: new Date().toISOString(),
    source: "registry",
    checksum: downloadInfo.hash,
  };
  await saveManifest(manifest);

  // Step 7: Print success
  console.log(`\n✅ ${packNs}/${name}@${downloadInfo.version} installed successfully!`);
  console.log(`   Location: ${packDir}`);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

export async function handlePackCommand(args: string[]): Promise<void> {
  const subcommand = args[0] ?? "help";

  switch (subcommand) {
    case "add":
      await handlePackAdd(args.slice(1));
      break;
    case "search":
      await handlePackSearch(args.slice(1));
      break;
    case "list":
      await handlePackList();
      break;
    case "update":
      await handlePackUpdate(args.slice(1));
      break;
    case "remove":
      await handlePackRemove(args.slice(1));
      break;
    case "show":
      await handlePackShow(args.slice(1));
      break;
    case "help":
    default:
      printPackHelp();
      break;
  }
}

async function handlePackAdd(args: string[]): Promise<void> {
  const packRef = args[0];
  if (!packRef) {
    console.error("Error: pack name required");
    console.error("Usage: synapse pack add <pack>");
    console.error("Examples:");
    console.error("  synapse pack add openai");
    console.error("  synapse pack add @official/openai");
    console.error("  synapse pack add @official/openai@2.0.0");
    process.exit(1);
  }

  try {
    const parsed = parsePackRef(packRef);
    await installPack(parsed);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function handlePackSearch(args: string[]): Promise<void> {
  const query = args.join(" ");
  if (!query) {
    console.error("Error: search query required");
    console.error("Usage: synapse pack search <query>");
    process.exit(1);
  }

  console.log(`🔍 Searching for "${query}"...\n`);

  try {
    const result = await searchPacks(query);

    if (result.results.length === 0) {
      console.log("No packs found.");
      return;
    }

    console.log(`Found ${result.total} result(s):\n`);
    for (const pack of result.results) {
      console.log(`  ${pack.id.padEnd(30)} ${pack.version.padEnd(10)} ${pack.description}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function handlePackList(): Promise<void> {
  const manifest = await loadManifest();
  const entries = Object.values(manifest.packs);

  if (entries.length === 0) {
    console.log("No packs installed.");
    console.log("\nInstall a pack: synapse pack add openai");
    return;
  }

  console.log(`Installed packs (${entries.length}):\n`);
  console.log(`  ${"NAME".padEnd(25)} ${"VERSION".padEnd(12)} INSTALLED AT`);
  console.log(`  ${"─".repeat(25)} ${"─".repeat(12)} ───────────────────`);

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const date = new Date(entry.installed_at).toLocaleDateString("zh-CN");
    console.log(`  ${entry.name.padEnd(25)} ${entry.version.padEnd(12)} ${date}`);
  }
}

async function handlePackUpdate(args: string[]): Promise<void> {
  const manifest = await loadManifest();
  const entries = Object.values(manifest.packs);

  if (entries.length === 0) {
    console.log("No packs installed. Use 'synapse pack add' to install one.");
    return;
  }

  const targetName = args[0]; // Optional: specific pack to update
  const toUpdate = targetName
    ? entries.filter((e) => e.name === targetName)
    : entries;

  if (targetName && toUpdate.length === 0) {
    console.error(`Error: pack "${targetName}" not found in installed packs`);
    process.exit(1);
  }

  console.log(`🔄 Checking for updates...\n`);

  let updated = 0;
  let upToDate = 0;

  for (const entry of toUpdate) {
    try {
      // Get latest version from registry
      const detail = await getPackDetail(entry.ns, entry.name);
      const latestVersion = detail?.version ?? "unknown";

      if (latestVersion === entry.version) {
        console.log(`  ${entry.name.padEnd(20)} ✅ up to date (${entry.version})`);
        upToDate++;
      } else {
        console.log(`  ${entry.name.padEnd(20)} ⬆️  ${entry.version} → ${latestVersion}`);
        // Reinstall with latest version
        await installPack({ ns: entry.ns, name: entry.name, version: latestVersion });
        updated++;
      }
    } catch (err: any) {
      console.log(`  ${entry.name.padEnd(20)} ❌ check failed: ${err.message}`);
    }
  }

  console.log(`\n📊 Summary: ${updated} updated, ${upToDate} up to date`);
}

async function handlePackRemove(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("Error: pack name required");
    console.error("Usage: synapse pack remove <name>");
    process.exit(1);
  }

  const manifest = await loadManifest();

  if (!manifest.packs[name]) {
    console.error(`Error: pack "${name}" is not installed`);
    process.exit(1);
  }

  const packDir = join(PACKS_DIR, name);

  try {
    await rm(packDir, { recursive: true, force: true });
    delete manifest.packs[name];
    await saveManifest(manifest);
    console.log(`✅ Removed ${name}`);
  } catch (err: any) {
    console.error(`Error removing pack: ${err.message}`);
    process.exit(1);
  }
}

async function handlePackShow(args: string[]): Promise<void> {
  const packRef = args[0];
  if (!packRef) {
    console.error("Error: pack name required");
    console.error("Usage: synapse pack show <name>");
    process.exit(1);
  }

  try {
    const parsed = parsePackRef(packRef);

    // Check locally first
    const manifest = await loadManifest();
    const localEntry = manifest.packs[parsed.name];

    if (localEntry) {
      console.log(`📦 ${parsed.ns}/${parsed.name}`);
      console.log(`   Installed: ${localEntry.version}`);
      console.log(`   Location: ${join(PACKS_DIR, parsed.name)}`);
    }

    // Fetch from registry
    const detail = await getPackDetail(parsed.ns, parsed.name);
    console.log(`\n📋 Registry info:`);
    console.log(`   Name: ${detail?.displayName ?? parsed.name}`);
    console.log(`   Version: ${detail?.version ?? "unknown"}`);
    console.log(`   Description: ${detail?.description ?? "N/A"}`);
    console.log(`   Category: ${detail?.category ?? "N/A"}`);

    if (detail?.readme) {
      console.log(`\n📖 README:`);
      console.log(detail.readme.substring(0, 500) + (detail.readme.length > 500 ? "..." : ""));
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printPackHelp(): void {
  console.log(`
synapse pack — Manage provider packs from the Registry

Usage:
  synapse pack add <pack>                    Install a pack from Registry
  synapse pack add <pack>@<version>          Install specific version
  synapse pack search <query>                Search Registry for packs
  synapse pack list                          List installed packs
  synapse pack update [name]                 Update a pack (or all)
  synapse pack remove <name>                 Remove an installed pack
  synapse pack show <name>                   Show pack details

Arguments:
  <pack>                   Pack name (e.g. openai, @official/openai)
  <version>                Semver version (e.g. 2.0.0)
  <query>                  Search term

Examples:
  synapse pack add openai
  synapse pack add @official/openai@2.0.0
  synapse pack search "chat completions"
  synapse pack list
  synapse pack update openai
  synapse pack update          # update all
  synapse pack remove openai
  synapse pack show openai

Environment:
  SYNAPSE_REGISTRY_URL       Override registry URL (default: https://registry.synapse-router.com)
`);
}
