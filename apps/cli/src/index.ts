#!/usr/bin/env node
// @synapse-router/cli — CLI tool

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createVault } from "@synapse-router/vault";
import { handleGenerateCommand } from "./commands/generate.js";
import { handleConnectCommand, printConnectHelp } from "./commands/connect.js";
import { handleSmokeCommand, printSmokeHelp } from "./commands/smoke.js";
import { handleEvolveCommand, printEvolveHelp } from "./commands/evolve.js";
import { handleInitCommand, printInitHelp } from "./commands/init.js";
import { handleWatchdogCommand, printWatchdogHelp } from "./commands/watchdog.js";
import { handleProfileCommand, printProfileHelp } from "./commands/profile.js";
import { handleExportCommand, printExportHelp, handleImportCommand, printImportHelp } from "./commands/export.js";
import { handleSetupCommand, printSetupHelp } from "./commands/setup.js";
import { handleConfigCommand, printConfigHelp } from "./commands/config.js";
import { handleBillingCommand, printBillingHelp } from "./commands/billing.js";
import { handleLockCommand, printLockHelp } from "./commands/lock.js";
import { handleSdkCommand, printSdkHelp } from "./commands/sdk.js";
import { handlePackCommand, printPackHelp } from "./commands/pack.js";
import { handleRouteCommand, printRouteHelp } from "./commands/route.js";
import { getOrCreateLock, detectOutdatedLocks, type SchemaLock } from "@synapse-router/lock";
import { createRegistryClient } from "@synapse-router/registry-client";
import { readFileSync, existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Load .env files
// ---------------------------------------------------------------------------

function loadDotEnv(): void {
  const cwd = process.cwd();
  const files = [".env.local", ".env"]; // .env.local overrides .env
  for (const name of files) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch {
      // ignore unreadable .env files
    }
  }
}

loadDotEnv();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string;
  args: string[];
  flags: Set<string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags = new Set<string>();
  const positional: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--")) {
      flags.add(arg.slice(2));
    } else if (arg.startsWith("-")) {
      for (const ch of arg.slice(1)) flags.add(ch);
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0] ?? "help",
    args: positional.slice(1),
    flags,
  };
}

// ---------------------------------------------------------------------------
// Help system — layered
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Synapse Router CLI v0.1.0 — Multi-Provider Schema Negotiation Router

Usage:
  synapse <command> [subcommand] [options]

Commands:
  connect <provider> <intent>   Connect to a provider and execute a feature
  smoke --provider <name>       Run provider smoke tests against live APIs
  setup                         Interactive first-time setup wizard
  config set|get|list           Manage configuration (~/.synapse/config.json)
  billing init|config|status       Manage billing configuration and quota status
  provider list [--remote]      List all provider packs
  provider show <id>            Show provider details
  generate <source>             Generate a Provider Pack from OpenAPI spec
  vault set|list|get|remove|verify  Manage API keys
  negotiate <schema-file>       Run schema negotiation
  lock list|show|remove|migrate|outdated  Manage Schema Locks
  sdk generate                  Generate SDK from Provider Pack
  pack add|search|list|update|remove|show  Manage provider packs from Registry
  evolve                        Generate zero-dependency SDK from all provider packs
  route <intent>                Route to best provider using multi-dimensional scoring
  init                          Initialize a synapse-sdk project
  watchdog                      Monitor events and auto-create Git Issues
  profile list|show|reset|stats  View and manage Provider Profiles
  export [--output|--stdout]     Export .synapse/ data (tar.gz)
  import <file> [--stdin]        Import .synapse/ data

Getting started:
  synapse setup                 Configure your first provider
  synapse connect deepseek chat --input '{"messages":[...]}'

Options:
  --help, -h                    Show help
  --version, -v                 Show version

Detailed help:
  synapse connect --help        Connect command options & examples
  synapse vault --help          Vault subcommands
  synapse config --help         Config management
  synapse billing --help          Billing management
  synapse setup --help          Setup wizard
  synapse generate --help       Pack generation
  synapse sdk --help            SDK generation
  synapse evolve --help         Evolve SDK generation
  synapse route --help          Route to best provider
  synapse init --help           Init project setup
  synapse watchdog --help        Watchdog monitoring
  synapse profile --help         Profile management
  synapse export --help          Export data
  synapse import --help          Import data
`);
}

function printProviderHelp(): void {
  console.log(`
synapse provider — List and inspect provider packs

Usage:
  synapse provider list [--remote]        List available provider packs
  synapse provider show <id> [--remote]   Show provider card details

Options:
  --remote               Query remote Registry instead of local

Arguments:
  <id>                   Provider ID (e.g. openai, deepseek, replicate)

Examples:
  synapse provider list
  synapse provider list --remote
  synapse provider show openai

See also:
  synapse connect   — Connect to a provider
  synapse generate  — Generate new provider packs
  synapse pack      — Manage packs from Registry
`);
}

function printVaultHelp(): void {
  console.log(`
synapse vault — Manage encrypted API keys

Usage:
  synapse vault set <provider> <key> [options]    Store an API key
  synapse vault list                              List stored keys (values hidden)
  synapse vault get <provider>                    Get key value for a provider
  synapse vault remove <provider>                 Remove a stored key
  synapse vault verify <provider>                 Verify key format
  synapse vault rotate <provider>                 Rotate key password (interactive)

Arguments:
  <provider>             Provider ID (e.g. deepseek, openai)
  <key>                  API key value

Options (vault set):
  --base-url <url>       Set provider base URL in config
  --pack <id>            Set provider pack in config

Examples:
  # Store a DeepSeek API key
  synapse vault set deepseek sk-xxx

  # Store key with provider configuration
  synapse vault set deepseek sk-xxx --base-url https://api.deepseek.com/v1 --pack openai

  # List all stored keys
  synapse vault list

  # Verify a key
  synapse vault verify deepseek

  # Get key value
  synapse vault get deepseek

  # Remove a key
  synapse vault remove deepseek

See also:
  synapse config    — Manage provider configuration
  synapse setup     — Interactive setup wizard
  synapse connect   — Connect to a provider
`);
}

function printNegotiateHelp(): void {
  console.log(`
synapse negotiate — Run schema negotiation

Usage:
  synapse negotiate <schema-file>                   Negotiate from agent schema file
  synapse negotiate --intent <intent> --provider <provider>  Negotiate specific intent+provider

Arguments:
  <schema-file>          Path to agent schema JSON file

Options:
  --intent <intent>      Feature intent (e.g. chat, text-to-image)
  --provider <provider>  Provider ID (e.g. openai, deepseek)
  --no-cache             Force re-negotiation (ignore cached lock)

Examples:
  synapse negotiate ./my-agent-schema.json
  synapse negotiate --intent chat --provider openai
  synapse negotiate --intent chat --provider openai --no-cache

See also:
  synapse provider list   — List available providers
  synapse connect         — Connect to a provider
  synapse lock list       — Manage cached Schema Locks
`);
}

function printGenerateHelp(): void {
  console.log(`
synapse generate — Generate a Provider Pack from OpenAPI spec

Usage:
  synapse generate <source> [options]

Arguments:
  <source>               URL or local file path to OpenAPI spec (JSON)

Options:
  --provider <id>        Override provider ID
  --name <name>          Override provider display name
  --output <dir>         Output directory (default: ./generated-packs/<id>)
  --no-validate          Skip validation step
  --no-tarball           Skip tarball build

Examples:
  # Generate from URL
  synapse generate https://api.example.com/openapi.json

  # Generate from local file with custom provider ID
  synapse generate ./openapi.json --provider myapi

  # Generate with custom output directory
  synapse generate ./openapi.json --output ./my-packs/custom

See also:
  synapse provider list   — List available providers
  synapse connect         — Connect to a provider
`);
}

// ---------------------------------------------------------------------------
// Packs directory
// ---------------------------------------------------------------------------

async function findPacksDir(): Promise<string> {
  const dir = fileURLToPath(import.meta.url); // file://...
  const absolutePath = dir;
  if (absolutePath.includes("/dist/")) {
    return join(dirname(dirname(dirname(dirname(absolutePath)))), "packs"); // 4 levels up from dist/index.js
  } else {
    return join(dirname(dirname(dirname(absolutePath))), "packs"); // 3 levels up from src/index.ts
  }
}

// ---------------------------------------------------------------------------
// Multi-source provider loading
// ---------------------------------------------------------------------------

type ProviderSource = "builtin" | "registry" | "local";

interface ProviderEntry {
  card: Record<string, any>;
  source: ProviderSource;
}

async function loadProvidersFromDir(dir: string): Promise<ProviderEntry[]> {
  const results: ProviderEntry[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const cardPath = join(dir, entry.name, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      const card = JSON.parse(content);
      if (card.provider?.id) {
        results.push({ card, source: "builtin" as ProviderSource });
      }
    } catch {
      // skip malformed packs
    }
  }
  return results;
}

async function loadAllProviders(): Promise<Map<string, ProviderEntry>> {
  const providers = new Map<string, ProviderEntry>();

  const builtinDir = await findPacksDir().catch(() => join(process.cwd(), "packs"));
  const registryDir = join(homedir(), ".synapse", "packs");
  const localDir = join(process.cwd(), "synapse-packs");

  // Priority low to high: builtin < registry < local
  for (const entry of await loadProvidersFromDir(builtinDir)) {
    providers.set(entry.card.provider.id as string, { ...entry, source: "builtin" });
  }
  for (const entry of await loadProvidersFromDir(registryDir)) {
    providers.set(entry.card.provider.id as string, { ...entry, source: "registry" });
  }
  for (const entry of await loadProvidersFromDir(localDir)) {
    providers.set(entry.card.provider.id as string, { ...entry, source: "local" });
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Provider commands
// ---------------------------------------------------------------------------

async function providerList(remote = false): Promise<void> {
  if (remote) {
    const client = createRegistryClient();
    try {
      const result = await client.listPacks();
      if (result.packs.length === 0) {
        console.log("(no providers found on Registry)");
        return;
      }
      // Group packs by provider, deduplicate provider ids
      const providers = new Map<string, { name: string; packs: Array<{ id: string; version: string; desc: string }> }>();
      for (const pack of result.packs) {
        const pid = pack.provider;
        if (!providers.has(pid)) {
          providers.set(pid, { name: pid, packs: [] });
        }
        const oneline = pack.description.replace(/\s+/g, " ").trim();
        const desc = oneline.length > 60 ? oneline.slice(0, 57) + "..." : oneline;
        providers.get(pid)!.packs.push({ id: pack.id, version: pack.version, desc });
      }

      console.log(`Registry: ${client.registryUrl}\nProviders:`);
      for (const [, entry] of providers) {
        console.log(`  ${entry.name.padEnd(20)} ${entry.packs.length} pack${entry.packs.length > 1 ? "s" : ""}`);
        for (const p of entry.packs) {
          console.log(`    ${p.id.padEnd(28)} v${p.version.padEnd(8)} ${p.desc}`);
        }
      }
      console.log(`\n${providers.size} provider${providers.size !== 1 ? "s" : ""}, ${result.pagination.total} packs total`);
    } catch (err: any) {
      console.error(`Error: Unable to reach Registry (${err.message})`);
      process.exit(1);
    }
    return;
  }

  const providers = await loadAllProviders();

  if (providers.size === 0) {
    console.log("(no providers found)");
    return;
  }

  console.log("Providers:");
  for (const [, entry] of providers) {
    const card = entry.card as Record<string, any>;
    const provider = card.provider;
    const service = card.service;
    const tag = entry.source === "builtin" ? "" : ` (${entry.source})`;
    console.log(
      `  ${(provider.id ?? "").padEnd(16)} ${(provider.name ?? "").padEnd(24)} ${service?.base_url ?? ""}${tag}`
    );
  }

  console.log(`\nSources: ${[...new Set([...providers.values()].map(e => e.source))].join(", ")}`);
}

async function providerShow(id: string, remote = false): Promise<void> {
  if (!id) {
    console.error("Error: provider id required");
    printProviderHelp();
    process.exit(1);
  }

  if (remote) {
    const client = createRegistryClient();
    try {
      // Fetch all packs and filter by provider name
      const result = await client.listPacks();
      const packs = result.packs.filter((p) => p.provider === id);
      if (packs.length === 0) {
        console.error(`Error: provider "${id}" not found on Registry`);
        process.exit(1);
      }
      console.log(`\n  Provider:    ${id}`);
      console.log(`  Registry:    ${client.registryUrl}`);
      console.log(`  Packs:       ${packs.length}`);
      console.log("");
      for (const p of packs) {
        const oneline = p.description.replace(/\s+/g, " ").trim();
        const desc = oneline.length > 80 ? oneline.slice(0, 77) + "..." : oneline;
        console.log(`  ${p.id.padEnd(32)} v${p.version.padEnd(8)} ${desc}`);
        console.log(`  ${"".padEnd(32)}  ${p.downloads} downloads  ${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))}`);
        if (p.tags.length > 0) {
          console.log(`  ${"".padEnd(32)}  tags: ${p.tags.join(", ")}`);
        }
        console.log();
      }
    } catch (err: any) {
      console.error(`Error: Unable to reach Registry (${err.message})`);
      process.exit(1);
    }
    return;
  }

  const providers = await loadAllProviders();
  const entry = providers.get(id);
  if (!entry) {
    console.error(`Error: provider "${id}" not found`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ...entry.card, source: entry.source }, null, 2));
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

function makeVault(): ReturnType<typeof createVault> {
  return createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
}

// Config helpers for vault set --base-url / --pack
const SYNAPSE_DIR = join(homedir(), ".synapse");
const CONFIG_PATH = join(SYNAPSE_DIR, "config.json");

interface SynapseConfig {
  providers?: Record<string, {
    base_url?: string;
    pack?: string;
    auth_type?: string;
  }>;
  defaults?: Record<string, string>;
}

async function loadConfig(): Promise<SynapseConfig> {
  try {
    const content = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveConfig(config: SynapseConfig): Promise<void> {
  await mkdir(SYNAPSE_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

async function vaultSet(provider: string, key: string, extraArgs: string[]): Promise<void> {
  if (!provider || !key) {
    console.error("Error: both provider and key are required");
    console.error("Usage: synapse vault set <provider> <key> [--base-url <url>] [--pack <id>]");
    process.exit(1);
  }
  const vault = makeVault();
  const packsDir = await findPacksDir();
  let authType: "Bearer" | "APIKey" | "OAuth2" = "APIKey";

  try {
    const cardPath = join(packsDir, provider, "provider-card.json");
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    const raw = card.provider?.auth_type ?? card.provider?.authType ?? "APIKey";
    if (raw === "Bearer" || raw === "APIKey" || raw === "OAuth2") {
      authType = raw;
    }
  } catch {
    // provider card not found — use default
  }

  // Parse extra options
  let baseUrl: string | undefined;
  let pack: string | undefined;
  for (let i = 0; i < extraArgs.length; i++) {
    if (extraArgs[i] === "--base-url" && extraArgs[i + 1]) {
      baseUrl = extraArgs[++i];
    } else if (extraArgs[i] === "--pack" && extraArgs[i + 1]) {
      pack = extraArgs[++i];
    }
  }

  try {
    await vault.setKey(provider, key, authType);
    console.log(`✓ ${provider} key stored`);
  } catch (err) {
    console.error(`Error storing key: ${err}`);
    process.exit(1);
  }

  // Update config if --base-url or --pack provided
  if (baseUrl || pack) {
    const config = await loadConfig();
    if (!config.providers) config.providers = {};
    if (!config.providers[provider]) config.providers[provider] = {};
    if (baseUrl) config.providers[provider].base_url = baseUrl;
    if (pack) config.providers[provider].pack = pack;
    if (!config.providers[provider].auth_type) config.providers[provider].auth_type = authType;
    await saveConfig(config);
    console.log(`✓ ${provider} config updated (base_url: ${baseUrl ?? "unchanged"}, pack: ${pack ?? "unchanged"})`);
  }
}

async function vaultList(): Promise<void> {
  const vault = makeVault();
  const keys = await vault.listKeys();
  if (keys.length === 0) {
    console.log("No keys stored");
    return;
  }
  console.log("Stored providers:");
  for (const k of keys.sort()) {
    console.log(`  ${k}`);
  }
}

async function vaultGet(provider: string): Promise<void> {
  if (!provider) {
    console.error("Error: provider required");
    process.exit(1);
  }
  const vault = makeVault();
  const key = await vault.getKey(provider);
  if (!key) {
    console.error(`No key found for ${provider}`);
    process.exit(1);
  }
  console.log(key);
}

async function vaultRemove(provider: string): Promise<void> {
  if (!provider) {
    console.error("Error: provider required");
    process.exit(1);
  }
  const vault = makeVault();
  const removed = await vault.removeKey(provider);
  console.log(removed ? `✓ ${provider} key removed` : `No key for ${provider}`);
}

async function vaultVerify(provider: string): Promise<void> {
  if (!provider) {
    console.error("Error: provider required");
    process.exit(1);
  }
  const vault = makeVault();
  const valid = await vault.verifyKey(provider);
  if (valid) {
    console.log(`✓ ${provider} key format is valid`);
  } else {
    console.log(`✗ ${provider} key format is invalid`);
    process.exit(1);
  }
}

async function vaultRotate(provider: string): Promise<void> {
  console.error("Error: vault rotate is interactive — not yet implemented via CLI flags");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Negotiate
// ---------------------------------------------------------------------------

async function negotiate(rawArgs: string[]): Promise<void> {
  // Parse flags
  let schemaFile: string | undefined;
  let intentFlag: string | undefined;
  let providerFlag: string | undefined;
  let noCache = false;
  const positional: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--intent" && rawArgs[i + 1]) {
      intentFlag = rawArgs[++i];
    } else if (arg === "--provider" && rawArgs[i + 1]) {
      providerFlag = rawArgs[++i];
    } else if (arg === "--no-cache") {
      noCache = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  schemaFile = positional[0];

  const packsDir = await findPacksDir();
  const configDir = join(homedir(), ".synapse");

  // Mode 1: --intent + --provider → use Schema Lock
  if (intentFlag && providerFlag) {
    try {
      if (noCache) {
        // Remove existing lock first
        const { LockStorage } = await import("@synapse-router/lock");
        const storage = new LockStorage(join(configDir, "schemas"));
        const locks = await storage.list();
        for (const l of locks) {
          if (l.intent === intentFlag && l.provider === providerFlag) {
            await storage.remove(l.lock_id);
            console.log(`Removed cached lock: ${l.lock_id}`);
          }
        }
      }

      const { lock, cached } = await getOrCreateLock({
        intent: intentFlag,
        provider: providerFlag,
        packDir: packsDir,
        configDir,
      });

      if (cached) {
        console.log(`Using cached lock: ${lock.lock_id}`);
      } else {
        console.log(`Created new lock: ${lock.lock_id}`);
      }

      console.log(`  Intent:    ${lock.intent}`);
      console.log(`  Provider:  ${lock.provider}`);
      console.log(`  Feature:   ${lock.feature_id}`);
      console.log(`  Pack:      v${lock.pack_version}`);
      console.log(`  Input:     ${lock.input_schema.fields.length} fields`);
      console.log(`  Output:    ${lock.output_schema.fields.length} fields`);
      console.log(`  Mappings:  ${lock.field_mappings.length} fields`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Mode 2: schema file → legacy behavior (match features)
  if (!schemaFile) {
    console.error("Error: schema file or --intent + --provider required");
    printNegotiateHelp();
    process.exit(1);
  }

  let agentSchema: { features?: Array<{ intent?: string }> };
  try {
    const content = await readFile(schemaFile, "utf8");
    agentSchema = JSON.parse(content);
  } catch (err) {
    console.error(`Error reading schema file: ${err}`);
    process.exit(1);
  }

  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch {
    console.error(`Error: packs directory not found at ${packsDir}`);
    process.exit(1);
  }

  console.log("Matched providers:");
  let found = false;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const cardPath = join(packsDir, entry.name, "provider-card.json");
    try {
      const card = JSON.parse(await readFile(cardPath, "utf8"));
      const features: Array<{ id?: string; intent?: string }> = card.features ?? [];
      const matchedFeatures = features.filter((f) =>
        agentSchema.features?.some((af) => af.intent === f.intent)
      );
      if (matchedFeatures.length > 0) {
        console.log(`  ${card.provider.id}: ${matchedFeatures.map((f) => f.id).join(", ")}`);
        found = true;
      }
    } catch {
      // skip
    }
  }
  if (!found) {
    console.log("  (no matching providers found)");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv);

  // Raw args after the command name — for sub-commands that do their own flag parsing
  // e.g. "synapse connect deepseek chat --input '{...}'" → rawArgs = ["deepseek", "chat", "--input", "{...}"]
  const rawArgs = process.argv.slice(3);  // skip [node, script, command]

  // Handle --version / -v / version command first
  if (flags.has("version") || flags.has("v") || command === "version") {
    console.log("synapse-router CLI v0.1.0");
    return;
  }

  // Handle top-level --help / -h / help command
  // Note: per-command --help is handled within each command handler
  if ((flags.has("help") || flags.has("h")) && command === "help") {
    // "synapse --help" or "synapse -h" (command defaults to "help")
    printHelp();
    return;
  }
  if (command === "help") {
    // "synapse help <subcommand>" — show subcommand help
    if (args[0]) {
      switch (args[0]) {
        case "connect":
          printConnectHelp();
          return;
        case "setup":
          printSetupHelp();
          return;
        case "config":
          printConfigHelp();
          return;
        case "billing":
          printBillingHelp();
          return;
        case "vault":
          printVaultHelp();
          return;
        case "provider":
          printProviderHelp();
          return;
        case "generate":
          printGenerateHelp();
          return;
        case "negotiate":
          printNegotiateHelp();
          return;
        case "lock":
          printLockHelp();
          return;
        case "sdk":
          printSdkHelp();
          return;
        case "pack":
          printPackHelp();
          return;
        case "smoke":
          printSmokeHelp();
          return;
        case "evolve":
          printEvolveHelp();
          return;
        case "init":
          printInitHelp();
          return;
        case "watchdog":
          printWatchdogHelp();
          return;
        case "profile":
          printProfileHelp();
          return;
        case "route":
          printRouteHelp();
          return;
        case "export":
          printExportHelp();
          return;
        case "import":
          printImportHelp();
          return;
      }
    }
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "provider": {
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printProviderHelp();
        } else if (args[0] === "list") await providerList(flags.has("remote") || args.includes("--remote"));
        else if (args[0] === "show") await providerShow(args[1], flags.has("remote") || args.includes("--remote"));
        else {
          console.error("Unknown provider command");
          printProviderHelp();
        }
        break;
      }
      case "vault": {
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printVaultHelp();
        } else if (args[0] === "set") {
          // Use rawArgs for vault set to preserve --base-url and --pack flags
          const vaultArgs = process.argv.slice(4);  // skip [node, script, "vault", "set"]
          await vaultSet(args[1], args[2], vaultArgs);
        }
        else if (args[0] === "list") await vaultList();
        else if (args[0] === "get") await vaultGet(args[1]);
        else if (args[0] === "remove") await vaultRemove(args[1]);
        else if (args[0] === "verify") await vaultVerify(args[1]);
        else if (args[0] === "rotate") await vaultRotate(args[1]);
        else {
          console.error("Unknown vault command");
          printVaultHelp();
        }
        break;
      }
      case "connect":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printConnectHelp();
        } else {
          await handleConnectCommand(rawArgs);
        }
        break;
      case "setup":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printSetupHelp();
        } else {
          await handleSetupCommand(rawArgs);
        }
        break;
      case "config":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printConfigHelp();
        } else {
          await handleConfigCommand(rawArgs);
        }
        break;
      case "billing":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printBillingHelp();
        } else {
          await handleBillingCommand(rawArgs);
        }
        break;
      case "generate":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printGenerateHelp();
        } else {
          await handleGenerateCommand(args);
        }
        break;
      case "negotiate":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printNegotiateHelp();
        } else {
          await negotiate(rawArgs);
        }
        break;
      case "lock":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printLockHelp();
        } else {
          await handleLockCommand(rawArgs);
        }
        break;
      case "sdk":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printSdkHelp();
        } else {
          await handleSdkCommand(rawArgs);
        }
        break;
      case "pack":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printPackHelp();
        } else {
          await handlePackCommand(args, flags);
        }
        break;
      case "smoke":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printSmokeHelp();
        } else {
          await handleSmokeCommand(rawArgs);
        }
        break;
      case "evolve":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printEvolveHelp();
        } else {
          await handleEvolveCommand(rawArgs);
        }
        break;
      case "init":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printInitHelp();
        } else {
          await handleInitCommand(rawArgs);
        }
        break;
      case "watchdog":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printWatchdogHelp();
        } else {
          await handleWatchdogCommand(rawArgs);
        }
        break;
      case "profile":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printProfileHelp();
        } else {
          await handleProfileCommand(rawArgs);
        }
        break;
      case "export":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printExportHelp();
        } else {
          await handleExportCommand(rawArgs);
        }
        break;
      case "route":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printRouteHelp();
        } else {
          await handleRouteCommand(rawArgs);
        }
        break;
      case "import":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printImportHelp();
        } else {
          await handleImportCommand(rawArgs);
        }
        break;
      case "execute":
        console.error("The 'execute' command has been renamed to 'connect'.");
        console.error("Use: synapse connect <provider> <intent> [options]");
        console.error("Run 'synapse connect --help' for more information.");
        process.exit(1);
        break;
      case "version":
        console.log("synapse-router CLI v0.1.0");
        break;
      default:
        printHelp();
    }
  } catch (err) {
    console.error(`Error: ${err}`);
    process.exit(1);
  }
}

main();
