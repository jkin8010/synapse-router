// @synapse-router/cli — `synapse config` command
// Manage ~/.synapse/config.json

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SynapseConfig {
  providers?: Record<string, {
    base_url?: string;
    pack?: string;
    auth_type?: string;
    [key: string]: string | undefined;
  }>;
  defaults?: Record<string, string>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config file helpers
// ---------------------------------------------------------------------------

const SYNAPSE_DIR = join(homedir(), ".synapse");
const CONFIG_PATH = join(SYNAPSE_DIR, "config.json");

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

/**
 * Get a nested value from config using dot notation.
 * e.g. "deepseek.base_url" → config.providers.deepseek.base_url
 */
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  // Handle provider shortcuts: "deepseek.base_url" → providers.deepseek.base_url
  const parts = key.split(".");
  
  // Try direct path first
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (current !== undefined) return current;

  // Try providers path: "deepseek.base_url" → providers.deepseek.base_url
  if (parts.length >= 2) {
    current = obj.providers;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    if (current !== undefined) return current;
  }

  // Try defaults path: "format" → defaults.format
  current = obj.defaults;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested value in config using dot notation.
 */
function setNestedValue(obj: Record<string, unknown>, key: string, value: string): void {
  const parts = key.split(".");

  // Detect if this is a provider config (e.g. "deepseek.base_url")
  // Provider IDs typically don't match top-level config keys
  const topLevelKeys = new Set(["providers", "defaults"]);

  if (parts.length >= 2 && !topLevelKeys.has(parts[0])) {
    // Treat as provider config: "deepseek.base_url" → providers.deepseek.base_url
    if (!obj.providers) obj.providers = {};
    const providers = obj.providers as Record<string, Record<string, string>>;
    const providerId = parts[0];
    if (!providers[providerId]) providers[providerId] = {};
    if (parts.length === 2) {
      providers[providerId][parts[1]] = value;
    } else {
      // Deeper nesting for provider
      let current: Record<string, unknown> = providers[providerId];
      for (let i = 1; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }
    return;
  }

  // Direct path: "providers.deepseek.base_url" or "defaults.format"
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Config help
// ---------------------------------------------------------------------------

export function printConfigHelp(): void {
  console.log(`
synapse config — Manage Synapse Router configuration

Usage:
  synapse config set <key> <value>
  synapse config get <key>
  synapse config list

Subcommands:
  set <key> <value>   Set a configuration value (dot notation)
  get <key>           Get a configuration value
  list                List all configuration

Configuration keys use dot notation:
  Provider config:    deepseek.base_url, deepseek.pack, deepseek.auth_type
  Defaults:           format, defaults.format
  Full path:          providers.deepseek.base_url, defaults.format

Examples:
  # Set DeepSeek base URL
  synapse config set deepseek.base_url https://api.deepseek.com/v1

  # Set DeepSeek pack
  synapse config set deepseek.pack openai

  # Set default output format
  synapse config set format json

  # Get a provider's base URL
  synapse config get deepseek.base_url

  # List all configuration
  synapse config list

See also:
  synapse setup    — Interactive provider setup
  synapse vault    — Manage API keys
  synapse connect  — Connect to a provider
`);
}

// ---------------------------------------------------------------------------
// Config command handlers
// ---------------------------------------------------------------------------

async function configSet(key: string, value: string): Promise<void> {
  if (!key || value === undefined) {
    console.error("Error: both key and value are required");
    console.error("Usage: synapse config set <key> <value>");
    process.exit(1);
  }

  const config = await loadConfig();
  setNestedValue(config, key, value);
  await saveConfig(config);
  console.log(`✓ ${key} = ${value}`);
}

async function configGet(key: string): Promise<void> {
  if (!key) {
    console.error("Error: key is required");
    console.error("Usage: synapse config get <key>");
    process.exit(1);
  }

  const config = await loadConfig();
  const value = getNestedValue(config as Record<string, unknown>, key);
  if (value === undefined) {
    console.log(`(not set)`);
  } else {
    console.log(`${key} = ${typeof value === "object" ? JSON.stringify(value, null, 2) : value}`);
  }
}

async function configList(): Promise<void> {
  const config = await loadConfig();

  if (Object.keys(config).length === 0) {
    console.log("No configuration found.");
    console.log(`Config file: ${CONFIG_PATH}`);
    console.log("Run 'synapse setup' to get started.");
    return;
  }

  console.log(`Configuration (${CONFIG_PATH}):\n`);

  // List providers
  if (config.providers && Object.keys(config.providers).length > 0) {
    console.log("Providers:");
    for (const [id, settings] of Object.entries(config.providers)) {
      console.log(`  ${id}:`);
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) {
          console.log(`    ${key}: ${value}`);
        }
      }
    }
  }

  // List defaults
  if (config.defaults && Object.keys(config.defaults).length > 0) {
    console.log("Defaults:");
    for (const [key, value] of Object.entries(config.defaults)) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main config handler
// ---------------------------------------------------------------------------

export async function handleConfigCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printConfigHelp();
    return;
  }

  const subcommand = argv[0];

  switch (subcommand) {
    case "set":
      await configSet(argv[1], argv[2]);
      break;
    case "get":
      await configGet(argv[1]);
      break;
    case "list":
      await configList();
      break;
    default:
      if (!subcommand) {
        configList();
      } else {
        console.error(`Unknown config subcommand: "${subcommand}"`);
        printConfigHelp();
        process.exit(1);
      }
  }
}
