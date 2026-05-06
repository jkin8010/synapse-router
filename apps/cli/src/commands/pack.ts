/**
 * Pack management commands — install, search, list, update, remove, show
 *
 * Uses @synapse-router/registry-client for API calls and filesystem operations.
 */

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

// ---------------------------------------------------------------------------
// Paths (for display only — installer manages filesystem paths internally)
// ---------------------------------------------------------------------------

const PACKS_DIR = join(homedir(), ".synapse", "packs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(): RegistryClient {
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
    console.log(`Searching for "${parsed.name}" in registry...`);
    const client = createClient();
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
    const client = createClient();
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

async function handlePackUpdate(args: string[]): Promise<void> {
  const targetName = args[0];

  console.log("Checking for updates...\n");

  try {
    const client = createClient();
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
    const client = createClient();
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
