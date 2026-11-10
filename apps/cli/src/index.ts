#!/usr/bin/env node
// @synapse-router/cli — CLI tool

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { findPacksDir, loadProviderCard, USER_PACKS_DIR, LOCAL_PACKS_DIR } from "./utils/packs.js";
import { createVault } from "@synapse-router/vault";
import { loadMergedConfig, saveGlobalConfig, getVaultDir } from "./utils/config.js";
import type { SynapseConfig } from "./utils/config.js";
import {
  HELP_BANNER, GROUP_CORE, GROUP_CONFIG, GROUP_ADVANCED,
  CORE_COMMANDS, CONFIG_COMMANDS, ADVANCED_COMMANDS,
  HELP_SETUP, HELP_CONNECT, HELP_NEGOTIATE,
  HELP_VAULT, HELP_CONFIG, HELP_PACK, HELP_BILLING,
  HELP_LOCK, HELP_ROUTE, HELP_SDK,
  HELP_SMOKE, HELP_WATCHDOG, HELP_PROVIDER,
} from "./utils/help.js";
import { handleConnectCommand, printConnectHelp } from "./commands/connect.js";
import { printSmokeHelp } from "./commands/smoke.js";
import { handleWatchdogCommand, printWatchdogHelp } from "./commands/watchdog.js";
import { handleSetupCommand, printSetupHelp } from "./commands/setup.js";
import { handleConfigCommand, printConfigHelp } from "./commands/config.js";
import { handleBillingCommand, printBillingHelp } from "./commands/billing.js";
import { handleLockCommand, printLockHelp } from "./commands/lock.js";
import { handleSdkCommand, printSdkHelp } from "./commands/sdk.js";
import { handlePackCommand, printPackHelp } from "./commands/pack.js";
import { handleRouteCommand, printRouteHelp } from "./commands/route.js";
import { handleNegotiateCommand, printNegotiateHelp } from "./commands/negotiate.js";
import { createRegistryClient } from "@synapse-router/registry-client";
import { readFileSync, existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Load .env files
// ---------------------------------------------------------------------------

/**
 * Load `.env` / `.env.local` from `cwd` into the given env object.
 *
 * Exported (not run at import time) so tests and other entry points can decide
 * when — and for which directory — environment loading happens.
 */
export function loadDotEnv(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const files = [".env.local", ".env"]; // .env.local overrides .env
  for (const name of files) {
    const envPath = join(cwd, name);
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, "utf8");
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
        if (key && !(key in env)) {
          env[key] = value;
        }
      }
    } catch {
      // ignore unreadable .env files
    }
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string;
  args: string[];
  flags: Set<string>;
  /** Values passed as `--key value`, `--key=value`, `-k value` or `-k=value` */
  options: Map<string, string>;
}

/**
 * Options that take a value. Keeping this explicit avoids guessing from argv:
 * `--base-url https://x` must not leak "https://x" into positional args.
 */
const VALUE_OPTIONS = new Set([
  "input",
  "input-file",
  "provider",
  "intent",
  "schema",
  "format",
  "base-url",
  "api-key",
  "lock",
  "strategy",
  "exclude",
  "region",
  "min-version",
  "output",
  "pack",
  "lang",
  "billing",
  "timeout",
  "limit",
  "name",
  "url",
  "port",
  "queries",
  "provider-id",
]);

/** Single-dash aliases for value options (`-p openai`). */
const SHORT_VALUE_OPTIONS: Record<string, string> = {
  o: "output",
  p: "provider",
  f: "format",
  i: "input",
  t: "timeout",
  l: "lang",
};

/** Single-dash aliases for boolean flags (`-h`, `-v`). */
const SHORT_BOOLEAN_FLAGS: Record<string, string> = {
  h: "help",
  v: "version",
  r: "remote",
};

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eqIdx = body.indexOf("=");
      const name = eqIdx === -1 ? body : body.slice(0, eqIdx);

      if (eqIdx !== -1) {
        // --key=value
        flags.add(name);
        options.set(name, body.slice(eqIdx + 1));
      } else if (VALUE_OPTIONS.has(name) && args[i + 1] !== undefined && !args[i + 1].startsWith("-")) {
        // --key value
        flags.add(name);
        options.set(name, args[++i]);
      } else {
        flags.add(name);
      }
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      const body = arg.slice(1);
      const eqIdx = body.indexOf("=");
      const name = eqIdx === -1 ? body : body.slice(0, eqIdx);
      const longName = SHORT_VALUE_OPTIONS[name];

      if (longName !== undefined) {
        if (eqIdx !== -1) {
          flags.add(longName);
          options.set(longName, body.slice(eqIdx + 1));
        } else if (args[i + 1] !== undefined && !args[i + 1].startsWith("-")) {
          flags.add(longName);
          options.set(longName, args[++i]);
        } else {
          flags.add(longName);
        }
        continue;
      }

      // Short boolean flags: -h, -v, -r
      if (SHORT_BOOLEAN_FLAGS[name] !== undefined && eqIdx === -1) {
        flags.add(SHORT_BOOLEAN_FLAGS[name]);
        continue;
      }

      // Combined short flags, e.g. -hv
      for (const ch of name) {
        flags.add(SHORT_BOOLEAN_FLAGS[ch] ?? ch);
      }
      continue;
    }

    positional.push(arg);
  }

  return {
    command: positional[0] ?? "help",
    args: positional.slice(1),
    flags,
    options,
  };
}

// ---------------------------------------------------------------------------
// Help system — layered
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
${HELP_BANNER}

Usage:
  synapse <command> [subcommand] [options]

${GROUP_CORE}
  ${CORE_COMMANDS.map(c => `${c.usage.padEnd(32)} ${c.desc}`).join("\n  ")}

${GROUP_CONFIG}
  ${CONFIG_COMMANDS.map(c => `${c.usage.padEnd(32)} ${c.desc}`).join("\n  ")}

${GROUP_ADVANCED}
  ${ADVANCED_COMMANDS.map(c => `${c.usage.padEnd(32)} ${c.desc}`).join("\n  ")}

Getting started:
  synapse setup                 Configure your first provider
  synapse connect deepseek chat --input '{"messages":[...]}'

Options:
  --help, -h                    Show help
  --version, -v                 Show version

Detailed help:
  synapse setup --help          Setup wizard
  synapse negotiate --help      Negotiate command
  synapse connect --help        Connect command options & examples
  synapse sdk --help           SDK generation
  synapse vault --help          Vault subcommands
  synapse config --help         Config management
  synapse pack --help           Pack management
  synapse billing --help        Billing management
  synapse lock --help           Schema Lock management
  synapse route --help          Route to best provider
  synapse sdk --help            SDK generation
  synapse provider --help       Provider packs
`);
}

function printProviderHelp(): void {
  console.log(HELP_PROVIDER);
}

function printVaultHelp(): void {
  console.log(HELP_VAULT);
}

// ---------------------------------------------------------------------------
// Multi-source provider loading
// ---------------------------------------------------------------------------

type ProviderSource = "builtin" | "registry" | "local";

interface ProviderEntry {
  card: Record<string, any>;
  source: ProviderSource;
}

/**
 * Load provider cards from one directory and tag them with their source.
 *
 * The source is a parameter (not hardcoded) so every caller gets a truthful
 * `source` without having to overwrite it afterwards.
 */
async function loadProvidersFromDir(
  dir: string,
  source: ProviderSource,
): Promise<ProviderEntry[]> {
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
        results.push({ card, source });
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
  const localDir = join(process.cwd(), ".synapse", "packs");

  // Priority low to high: builtin < registry < local
  for (const entry of await loadProvidersFromDir(builtinDir, "builtin")) {
    providers.set(entry.card.provider.id as string, entry);
  }
  for (const entry of await loadProvidersFromDir(registryDir, "registry")) {
    providers.set(entry.card.provider.id as string, entry);
  }
  for (const entry of await loadProvidersFromDir(localDir, "local")) {
    providers.set(entry.card.provider.id as string, entry);
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
  return createVault({ vaultDir: getVaultDir() });
}

// Config helpers for vault set --base-url / --pack — the config model itself
// lives in utils/config so the CLI never keeps a second copy of it.
async function loadConfig(): Promise<SynapseConfig> {
  return loadMergedConfig();
}

async function saveConfig(config: SynapseConfig): Promise<void> {
  await saveGlobalConfig(config);
}

async function vaultSet(
  provider: string,
  key: string,
  options: { baseUrl?: string; pack?: string },
): Promise<void> {
  if (!provider || !key) {
    console.error("Error: both provider and key are required");
    console.error("Usage: synapse vault set <provider> <key> [--base-url <url>] [--pack <id>]");
    process.exit(1);
  }
  const vault = makeVault();
  const packsDir = await findPacksDir();
  let authType: "Bearer" | "APIKey" | "OAuth2" = "APIKey";

  try {
    const dirName = provider.includes("/") ? provider.replace("/", "__") : provider;
    const cardPath = join(packsDir, dirName, "provider-card.json");
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    const raw = card.provider?.auth_type ?? card.provider?.authType ?? "APIKey";
    if (raw === "Bearer" || raw === "APIKey" || raw === "OAuth2") {
      authType = raw;
    }
  } catch {
    // provider card not found — use default
  }

  // Options are already parsed centrally (--base-url <url> / --pack <id>)
  const { baseUrl, pack } = options;

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
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Environment loading is an explicit entry-point concern (not an import
  // side effect), so tests and embedded use stay isolated.
  loadDotEnv();

  const { command, args, flags, options } = parseArgs(process.argv);

  // Raw args after the command name — for sub-commands that do their own flag parsing
  // e.g. "synapse connect deepseek chat --input '{...}'" → rawArgs = ["deepseek", "chat", "--input", "{...}"]
  const rawArgs = process.argv.slice(3);  // skip [node, script, command]

  // Handle --version / -v / version command first
  if (flags.has("version") || flags.has("v") || command === "version") {
    console.log("synapse-router CLI v0.2.0");
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
      const helpMap: Record<string, string> = {
        setup: HELP_SETUP,
        negotiate: HELP_NEGOTIATE,
        connect: HELP_CONNECT,
        vault: HELP_VAULT,
        config: HELP_CONFIG,
        pack: HELP_PACK,
        billing: HELP_BILLING,
        lock: HELP_LOCK,
        route: HELP_ROUTE,
        sdk: HELP_SDK,
        smoke: HELP_SMOKE,
        watchdog: HELP_WATCHDOG,
        provider: HELP_PROVIDER,
      };
      if (helpMap[args[0]]) {
        console.log(helpMap[args[0]]);
        return;
      }
    }
    printHelp();
    return;
  }

  // Commands that were merged into another entry point. They are handled in one
  // place so no legacy top-level alias carries its own copy of the logic.
  const DEPRECATED_COMMANDS: Record<
    string,
    { hint: string; run: (argv: string[]) => Promise<void> }
  > = {
    smoke: {
      hint: "`synapse smoke` has been merged into `synapse connect --smoke`.",
      run: (argv) => handleConnectCommand(["--smoke", ...argv]),
    },
    init: {
      hint: "`synapse init` has been merged into `synapse setup` (SDK scaffolding: `synapse setup --sdk`).",
      run: (argv) => handleSetupCommand(argv),
    },
    profile: {
      hint: "`synapse profile` has been merged into `synapse config profile`.",
      run: (argv) => handleConfigCommand(["profile", ...argv]),
    },
    export: {
      hint: "`synapse export` has been merged into `synapse config export`.",
      run: (argv) => handleConfigCommand(["export", ...argv]),
    },
    import: {
      hint: "`synapse import` has been merged into `synapse config import`.",
      run: (argv) => handleConfigCommand(["import", ...argv]),
    },
  };

  try {
    const deprecated = DEPRECATED_COMMANDS[command];
    if (deprecated !== undefined) {
      console.error(`Note: ${deprecated.hint} Use that instead.`);
      await deprecated.run(rawArgs);
      return;
    }

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
          await vaultSet(args[1], args[2], {
            baseUrl: options.get("base-url"),
            pack: options.get("pack"),
          });
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
      case "evolve":
        console.error("The 'evolve' and 'generate' commands have been removed. Use 'synapse sdk generate' for SDK generation instead.");
        console.error("Run 'synapse sdk --help' for more information.");
        process.exit(1);
        break;
      case "negotiate":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printNegotiateHelp();
        } else {
          await handleNegotiateCommand(rawArgs);
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
      case "watchdog":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printWatchdogHelp();
        } else {
          await handleWatchdogCommand(rawArgs);
        }
        break;
      case "route":
        if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
          printRouteHelp();
        } else {
          await handleRouteCommand(rawArgs);
        }
        break;
      case "execute":
        console.error("The 'execute' command has been renamed to 'connect'.");
        console.error("Use: synapse connect <provider> <intent> [options]");
        console.error("Run 'synapse connect --help' for more information.");
        process.exit(1);
        break;
      case "version":
        console.log("synapse-router CLI v0.2.0");
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
