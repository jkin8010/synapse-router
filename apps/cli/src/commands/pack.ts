/**
 * Pack management commands — install, search, list, update, remove, show
 *
 * Uses @synapse-router/registry-client for API calls and filesystem operations.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  createRegistryClient,
  installPack,
  removePack,
  listInstalledPacks,
  updatePack,
} from "@synapse-router/registry-client";
import type {
  RegistryClient,
  SearchResult,
  ManifestEntry,
} from "@synapse-router/registry-client";
import { loadMergedConfig } from "../utils/config.js";

// ---------------------------------------------------------------------------
// Paths (for display only — installer manages filesystem paths internally)
// ---------------------------------------------------------------------------

const PACKS_DIR = join(homedir(), ".synapse", "packs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createClient(): Promise<RegistryClient> {
  // Priority: env var > configured registry.url > hardcoded default
  if (process.env["SYNAPSE_REGISTRY_URL"]) {
    return createRegistryClient({ registryUrl: process.env["SYNAPSE_REGISTRY_URL"] });
  }
  const config = await loadMergedConfig();
  const registry = config.registry as { url?: string } | undefined;
  if (registry?.url) {
    return createRegistryClient({ registryUrl: registry.url });
  }
  return createRegistryClient();
}

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
    // ns/name format (e.g. "aliyun/qwen-image")
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
// Config helpers
// ---------------------------------------------------------------------------

async function loadSynapseConfig(): Promise<Record<string, unknown>> {
  return loadMergedConfig();
}

function getRegistryUrlFromConfig(config: Record<string, unknown>): string | undefined {
  if (process.env["SYNAPSE_REGISTRY_URL"]) return process.env["SYNAPSE_REGISTRY_URL"];
  const registry = config.registry as { url?: string } | undefined;
  return registry?.url;
}

function parseSemver(v: string): number[] {
  return v.split(".").map(Number);
}

function computeVersionDiff(installed: string, latest: string): string {
  const a = parseSemver(installed);
  const b = parseSemver(latest);
  if (a.length < 2 || b.length < 2) return "version changed";
  if (b[0] > a[0]) return "breaking (major)";
  if (b[1] > a[1]) return "compatible (minor)";
  if (b.length >= 3 && a.length >= 3 && b[2] > a[2]) return "compatible (patch)";
  return "version changed";
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

export async function handlePackCommand(
  args: string[],
  flags?: Set<string>,
): Promise<void> {
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
      await handlePackUpdate(args.slice(1), flags);
      break;
    case "remove":
      await handlePackRemove(args.slice(1));
      break;
    case "show":
      await handlePackShow(args.slice(1));
      break;
    case "check":
      await handlePackCheck();
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
    console.log(`Searching for "${parsed.name}" in registry...`);
    const client = await createClient();
    const result = await installPack(client, packRef);

    if (!result.success) {
      console.error(`Error: ${result.error ?? "Installation failed"}`);
      process.exit(1);
    }

    console.log(`Found: ${result.ns}/${result.name}@${result.version}`);
    console.log(`Downloading pack...`);
    console.log(
      `\n${result.ns}/${result.name}@${result.version} installed successfully!`,
    );
    console.log(`   Location: ${join(PACKS_DIR, result.name)}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error: ${message}`);
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

  console.log(`Searching for "${query}"...\n`);

  try {
    const client = await createClient();
    const result: SearchResult = await client.searchPacks(query);

    if (result.results.length === 0) {
      console.log("No packs found.");
      return;
    }

    console.log(`Found ${result.total} result(s):\n`);
    for (const pack of result.results) {
      console.log(
        `  ${pack.id.padEnd(30)} ${pack.version.padEnd(10)} ${pack.description}`,
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

async function handlePackList(): Promise<void> {
  const entries: ManifestEntry[] = await listInstalledPacks();

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
    console.log(
      `  ${entry.name.padEnd(25)} ${entry.version.padEnd(12)} ${date}`,
    );
  }
}

async function handlePackCheck(): Promise<void> {
  const config = await loadSynapseConfig();
  const registryUrl = getRegistryUrlFromConfig(config);

  if (!registryUrl) {
    console.error("Error: Registry not configured.");
    console.error("Set a registry URL with: synapse config set registry.url <url>");
    console.error("Or set the SYNAPSE_REGISTRY_URL environment variable.");
    process.exit(1);
  }

  const entries = await listInstalledPacks();

  if (entries.length === 0) {
    console.log("No packs installed.\n");
    console.log("Install a pack: synapse pack add openai");
    return;
  }

  const client = createRegistryClient({ registryUrl });

  console.log(`Checking packs against ${registryUrl}...\n`);

  const rows: Array<{
    name: string;
    installed: string;
    latest: string;
    change: string;
  }> = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const detail = await client.getPack(entry.ns, entry.name);
      const latest = detail.version;

      if (latest !== entry.version) {
        const change = computeVersionDiff(entry.version, latest);
        rows.push({
          name: `@${entry.ns}/${entry.name}`,
          installed: entry.version,
          latest,
          change,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      rows.push({
        name: `@${entry.ns}/${entry.name}`,
        installed: entry.version,
        latest: "ERROR",
        change: message,
      });
    }
  }

  if (rows.length === 0) {
    console.log("All packs are up to date.\n");
    return;
  }

  // Output table
  const outdated = rows.filter((r) => r.latest !== "ERROR");
  const errors = rows.filter((r) => r.latest === "ERROR");

  console.log(`Outdated packs (${outdated.length}):\n`);
  console.log(`  ${"NAME".padEnd(30)} ${"INSTALLED".padEnd(12)} ${"LATEST".padEnd(12)} CHANGE`);
  console.log(`  ${"─".repeat(30)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(34)}`);

  for (const row of outdated) {
    const arrow = `${row.installed} → ${row.latest}`;
    console.log(
      `  ${row.name.padEnd(30)} ${row.installed.padEnd(12)} ${row.latest.padEnd(12)} ${row.change}`,
    );
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const err of errors) {
      console.log(`  ${err.name.padEnd(30)} ${err.change}`);
    }
  }
}

async function handlePackUpdate(
  args: string[],
  flags?: Set<string>,
): Promise<void> {
  const targetName = args[0];
  const yesFlag = flags?.has("yes") ?? false;

  const config = await loadSynapseConfig();
  const registryUrl = getRegistryUrlFromConfig(config);

  if (!registryUrl) {
    console.error("Error: Registry not configured.");
    console.error("Set a registry URL with: synapse config set registry.url <url>");
    console.error("Or set the SYNAPSE_REGISTRY_URL environment variable.");
    process.exit(1);
  }

  const client = createRegistryClient({ registryUrl });

  // Show changelog for specific pack targets before updating
  if (targetName) {
    const entries = await listInstalledPacks();
    const entry = entries.find((e) => e.name === targetName);

    if (entry) {
      try {
        const detail = await client.getPack(entry.ns, entry.name);
        if (detail.version !== entry.version) {
          const change = computeVersionDiff(entry.version, detail.version);
          console.log(
            `Update available: ${entry.version} → ${detail.version} (${change})\n`,
          );

          const latestVersion = detail.versions.find(
            (v) => v.version === detail.version,
          );
          if (latestVersion?.changelog) {
            console.log("Changelog:");
            console.log(latestVersion.changelog);
            console.log();
          }

          if (!yesFlag) {
            console.log("Use --yes to skip confirmation in the future.\n");
          }
        }
      } catch {
        // If we can't fetch details, proceed with update anyway
      }
    }
  }

  console.log("Checking for updates...\n");

  try {
    const { updated, upToDate, failed } = await updatePack(client, targetName);

    for (const name of upToDate) {
      console.log(`  ${name.padEnd(20)} up to date`);
    }

    for (const result of updated) {
      console.log(`  ${result.name.padEnd(20)} ${result.version}`);
    }

    for (const f of failed) {
      console.log(`  ${f.name.padEnd(20)} check failed: ${f.error}`);
    }

    console.log(
      `\nSummary: ${updated.length} updated, ${upToDate.length} up to date`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

async function handlePackRemove(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("Error: pack name required");
    console.error("Usage: synapse pack remove <name>");
    process.exit(1);
  }

  try {
    const removed = await removePack(name);
    if (!removed) {
      console.error(`Error: pack "${name}" is not installed`);
      process.exit(1);
    }
    console.log(`Removed ${name}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error removing pack: ${message}`);
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
    const entries = await listInstalledPacks();
    const localEntry = entries.find((e) => e.name === parsed.name);

    if (localEntry) {
      console.log(`${parsed.ns}/${parsed.name}`);
      console.log(`   Installed: ${localEntry.version}`);
      console.log(`   Location: ${join(PACKS_DIR, parsed.name)}`);
    }

    // Fetch from registry
    const client = await createClient();
    const detail = await client.getPack(parsed.ns, parsed.name);
    console.log(`\nRegistry info:`);
    console.log(`   Name: ${detail.displayName ?? parsed.name}`);
    console.log(`   Version: ${detail.version}`);
    console.log(`   Description: ${detail.description || "N/A"}`);
    console.log(`   Category: ${detail.category ?? "N/A"}`);

    if (detail.readme) {
      console.log(`\nREADME:`);
      console.log(
        detail.readme.substring(0, 500) +
          (detail.readme.length > 500 ? "..." : ""),
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error: ${message}`);
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
  synapse pack check                         Check for registry updates
  synapse pack update [name]                 Update a pack (or all)
  synapse pack remove <name>                 Remove an installed pack
  synapse pack show <name>                   Show pack details

Arguments:
  <pack>                   Pack name (e.g. openai, @official/openai)
  <version>                Semver version (e.g. 2.0.0)
  <query>                  Search term

Options:
  --yes                    Skip confirmation prompts (non-interactive)

Examples:
  synapse pack add openai
  synapse pack add @official/openai@2.0.0
  synapse pack search "chat completions"
  synapse pack list
  synapse pack check
  synapse pack update openai
  synapse pack update          # update all
  synapse pack remove openai
  synapse pack show openai

Environment:
  SYNAPSE_REGISTRY_URL       Override registry URL (default: https://registry.synapse-router.com)
`);
}
