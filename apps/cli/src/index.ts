#!/usr/bin/env node
// @synapse-router/cli — CLI tool

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createVault } from "@synapse-router/vault";

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
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Synapse Router CLI

Usage:
  synapse <command> [options]

Commands:
  provider list                       List all provider packs
  provider show <id>                 Show provider details
  vault set <provider> <key>          Store an API key
  vault list                         List stored keys (values hidden)
  vault get <provider>               Get key value for a provider
  vault remove <provider>            Remove a stored key
  vault verify <provider>            Verify key format
  vault rotate <provider>            Rotate key password (interactive)
  negotiate <schema-file>            Run schema negotiation
  execute <provider> <feature> <input>  Execute a provider feature

Options:
  --help, -h               Show this help
  --version, -v            Show version
`);
}

// ---------------------------------------------------------------------------
// Packs directory
// ---------------------------------------------------------------------------

async function findPacksDir(): Promise<string> {
  const cwd = process.cwd();
  return join(cwd, "packs");
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
        `  ${card.provider.id.padEnd(12)} ${card.provider.name.padEnd(20)} ${card.provider.base_url}`
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
    printHelp();
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

async function vaultSet(provider: string, key: string): Promise<void> {
  if (!provider || !key) {
    console.error("Error: both provider and key are required");
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

  try {
    await vault.setKey(provider, key, authType);
    console.log(`✓ ${provider} key stored`);
  } catch (err) {
    console.error(`Error storing key: ${err}`);
    process.exit(1);
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

async function negotiate(schemaFile: string): Promise<void> {
  if (!schemaFile) {
    console.error("Error: schema file required");
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

  const packsDir = await findPacksDir();
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

  if (flags.has("help") || flags.has("h") || command === "help") {
    printHelp();
    return;
  }

  if (flags.has("version") || flags.has("v")) {
    console.log("synapse-router CLI v0.1.0");
    return;
  }

  try {
    switch (command) {
      case "provider": {
        if (args[0] === "list") await providerList();
        else if (args[0] === "show") await providerShow(args[1]);
        else {
          console.error("Unknown provider command");
          printHelp();
        }
        break;
      }
      case "vault": {
        if (args[0] === "set") await vaultSet(args[1], args[2]);
        else if (args[0] === "list") await vaultList();
        else if (args[0] === "get") await vaultGet(args[1]);
        else if (args[0] === "remove") await vaultRemove(args[1]);
        else if (args[0] === "verify") await vaultVerify(args[1]);
        else if (args[0] === "rotate") await vaultRotate(args[1]);
        else {
          console.error("Unknown vault command");
          printHelp();
        }
        break;
      }
      case "negotiate":
        await negotiate(args[0]);
        break;
      case "execute":
        console.error("Execute not yet implemented");
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
