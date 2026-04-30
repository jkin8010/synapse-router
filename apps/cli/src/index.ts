#!/usr/bin/env node
// @synapse-router/cli — CLI tool

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createVault } from "@synapse-router/vault";
import { handleGenerateCommand } from "./commands/generate.js";
import { handleConnectCommand, printConnectHelp } from "./commands/connect.js";
import { handleSetupCommand, printSetupHelp } from "./commands/setup.js";
import { handleConfigCommand, printConfigHelp } from "./commands/config.js";
import { handleLockCommand, printLockHelp } from "./commands/lock.js";
import { handleSdkCommand, printSdkHelp } from "./commands/sdk.js";
import { getOrCreateLock, detectOutdatedLocks, type SchemaLock } from "@synapse-router/lock";

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
  setup                         Interactive first-time setup wizard
  config set|get|list           Manage configuration (~/.synapse/config.json)
  provider list                 List all provider packs
  provider show <id>            Show provider details
  generate <source>             Generate a Provider Pack from OpenAPI spec
  vault set|list|get|remove|verify  Manage API keys
  negotiate <schema-file>       Run schema negotiation
  lock list|show|remove|migrate|outdated  Manage Schema Locks
  sdk generate                  Generate SDK from Provider Pack

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
  synapse setup --help          Setup wizard
  synapse generate --help       Pack generation
  synapse sdk --help            SDK generation
`);
}

function printProviderHelp(): void {
  console.log(`
synapse provider — List and inspect provider packs

Usage:
  synapse provider list                  List all available provider packs
  synapse provider show <id>             Show provider card details

Arguments:
  <id>                   Provider ID (e.g. openai, deepseek, replicate)

Examples:
  synapse provider list
  synapse provider show openai

See also:
  synapse connect   — Connect to a provider
  synapse generate  — Generate new provider packs
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
// Provider commands
// ---------------------------------------------------------------------------

async function providerList(): Promise<void> {
  const packsDir = await findPacksDir();
  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch {
    console.error(`Error: packs directory not found at ${packsDir}`);
    process.exit(1);
  }

  console.log("Providers:");
  let found = false;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const cardPath = join(packsDir, entry.name, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      const card = JSON.parse(content);
      console.log(
        `  ${card.provider.id.padEnd(12)} ${card.provider.name.padEnd(20)} ${card.service.base_url}`
      );
      found = true;
    } catch {
      // skip malformed packs
    }
  }
  if (!found) {
    console.log("  (no providers found)");
  }
}

async function providerShow(id: string): Promise<void> {
  if (!id) {
    console.error("Error: provider id required");
    printProviderHelp();
    process.exit(1);
  }
  const packsDir = await findPacksDir();
  const cardPath = join(packsDir, id, "provider-card.json");
  try {
    const content = await readFile(cardPath, "utf8");
    console.log(JSON.stringify(JSON.parse(content), null, 2));
  } catch {
    console.error(`Error: provider "${id}" not found`);
    process.exit(1);
  }
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
        } else if (args[0] === "list") await providerList();
        else if (args[0] === "show") await providerShow(args[1]);
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
