// @synapse-router/cli — `synapse config` command
// Manage config with cascading: global (~/.synapse/config.json) + project-local (cwd/.synapse/config.json)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  loadMergedConfig,
  saveGlobalConfig,
  saveLocalConfig,
  getLocalConfigPath,
} from "../utils/config.js";
import { handleProfileCommand } from "./profile.js";
import { handleExportCommand, handleImportCommand } from "./export.js";

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
const CONFIG_PATH = getLocalConfigPath();

async function loadConfig(): Promise<SynapseConfig> {
  return loadMergedConfig() as Promise<SynapseConfig>;
}

async function saveConfig(config: SynapseConfig): Promise<void> {
  await saveGlobalConfig(config as Record<string, unknown>);
}

async function saveConfigLocal(config: SynapseConfig): Promise<void> {
  await saveLocalConfig(config as Record<string, unknown>);
}

/** Load only the project-local config (for --local writes with merge context). */
async function loadConfigLocalOnly(): Promise<SynapseConfig> {
  try {
    const content = await readFile(getLocalConfigPath(), "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Billing config helpers (billing.* key redirect)
// ---------------------------------------------------------------------------

const BILLING_CONFIG_PATH = join(SYNAPSE_DIR, "billing-config.json");

async function loadBillingConfigFile(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(BILLING_CONFIG_PATH, "utf8");
    return JSON.parse(content);
  } catch {
    return { version: "1", providers: {} };
  }
}

async function saveBillingConfigFile(config: Record<string, unknown>): Promise<void> {
  await mkdir(SYNAPSE_DIR, { recursive: true });
  await writeFile(BILLING_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function validateBillingField(key: string, value: string): void {
  const parts = key.split(".");
  const lastSegment = parts[parts.length - 1];
  const numericFields = new Set(["limit", "used", "threshold", "inputPrice", "outputPrice", "unitPrice", "costPerCall"]);

  switch (lastSegment) {
    case "strategy": {
      const valid = ["perToken", "perUnit", "tiered", "flat"];
      if (!valid.includes(value)) {
        console.error(`Error: Invalid pricing strategy '${value}'. Use: perToken, perUnit, tiered, flat`);
        process.exit(1);
      }
      break;
    }
    case "onError": {
      const valid = ["warn", "reject", "downgrade", "notify"];
      if (!valid.includes(value)) {
        console.error(`Error: Invalid onError value '${value}'. Use: warn, reject, downgrade, notify`);
        process.exit(1);
      }
      break;
    }
    case "period": {
      const valid = ["minute", "hour", "day", "month", "oneTime"];
      if (!valid.includes(value)) {
        console.error(`Error: Invalid quota period '${value}'. Use: minute, hour, day, month, oneTime`);
        process.exit(1);
      }
      break;
    }
    default:
      if (numericFields.has(lastSegment)) {
        const num = Number(value);
        if (isNaN(num) || num < 0) {
          console.error(`Error: '${lastSegment}' must be a non-negative number`);
          process.exit(1);
        }
      } else if (!["unit", "type", "id"].includes(lastSegment)) {
        console.error(`Error: Unknown billing field '${lastSegment}'. Supported fields: strategy, onError, period, limit, used, threshold, inputPrice, outputPrice, unitPrice, costPerCall, unit, type, id`);
        process.exit(1);
      }
  }
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
  synapse config set <key> <value> [--local]
  synapse config get <key>
  synapse config list

Subcommands:
  set <key> <value>   Set a configuration value (dot notation)
    --local             Write to project-local .synapse/config.json instead of global ~/.synapse/config.json
  get <key>           Get a configuration value
  list                List all configuration
  profile list|show|reset|stats|refresh  Manage Provider Profiles
  export [--output|--stdout]              Export .synapse/ data
  import <file> [--stdin]                 Import .synapse/ data

Configuration keys use dot notation:
  Provider config:    deepseek.base_url, deepseek.pack, deepseek.auth_type
  Defaults:           format, defaults.format
  Full path:          providers.deepseek.base_url, defaults.format

Cascading config:
  Global:   ~/.synapse/config.json
  Project:  .synapse/config.json (in current directory — overrides global)
  Use --local flag with 'set' to write to project config.

Examples:
  # Set DeepSeek base URL (global)
  synapse config set deepseek.base_url https://api.deepseek.com/v1

  # Set registry URL for current project only
  synapse config set registry.url http://localhost:3100/api/v1 --local

  # Set DeepSeek pack
  synapse config set deepseek.pack openai

  # Set default output format
  synapse config set format json

  # Get a provider's base URL
  synapse config get deepseek.base_url

  # List all configuration
  synapse config list

Billing configuration:
  Billing settings are stored in ~/.synapse/billing-config.json and accessed
  via the "billing.*" prefix:
    synapse config set billing.openai.onError reject
    synapse config get billing.openai.onError
    synapse config set billing.openai.pricing.chat.strategy perToken

See also:
  synapse setup    — Interactive provider setup
  synapse vault    — Manage API keys
  synapse connect  — Connect to a provider
`);
}

// ---------------------------------------------------------------------------
// Config command handlers
// ---------------------------------------------------------------------------

async function configSet(key: string, value: string, local = false): Promise<void> {
  if (!key || value === undefined) {
    console.error("Error: both key and value are required");
    console.error("Usage: synapse config set <key> <value> [--local]");
    process.exit(1);
  }

  // Redirect billing.* keys to billing-config.json
  if (key.startsWith("billing.")) {
    const billingKey = key.slice(8);
    if (!billingKey) {
      console.error("Error: billing key required after 'billing.'");
      process.exit(1);
    }
    const billingConfig = await loadBillingConfigFile();
    validateBillingField(billingKey, value);
    setNestedValue(billingConfig, billingKey, value);
    await saveBillingConfigFile(billingConfig);
    console.log(`✓ ${key} = ${value}`);
    return;
  }

  if (local) {
    // Use simple key assignment for local config (no provider auto-redirection)
    const config = await loadConfigLocalOnly();
    const parts = key.split(".");
    let current: Record<string, unknown> = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
    await saveConfigLocal(config);
    console.log(`✓ ${key} = ${value} (project-local)`);
    return;
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

  // Redirect billing.* keys to billing-config.json
  if (key.startsWith("billing.")) {
    const billingKey = key.slice(8);
    if (!billingKey) {
      console.error("Error: billing key required after 'billing.'");
      process.exit(1);
    }
    const billingConfig = await loadBillingConfigFile();
    const value = getNestedValue(billingConfig, billingKey);
    if (value === undefined) {
      console.log(`(not set)`);
    } else {
      console.log(`${key} = ${typeof value === "object" ? JSON.stringify(value, null, 2) : value}`);
    }
    return;
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

  const localFlag = argv.includes("--local");

  switch (subcommand) {
    case "set": {
      // Find key and value, skipping flags
      const args = argv.slice(1).filter((a) => a !== "--local");
      await configSet(args[0], args[1], localFlag);
      break;
    }
    case "get":
      await configGet(argv[1]);
      break;
    case "list":
      await configList();
      break;
    case "profile": {
      const profileArgs = argv.slice(1); // skip "profile"
      await handleProfileCommand(profileArgs);
      break;
    }
    case "export": {
      const exportArgs = argv.slice(1); // skip "export"
      await handleExportCommand(exportArgs);
      break;
    }
    case "import": {
      const importArgs = argv.slice(1); // skip "import"
      await handleImportCommand(importArgs);
      break;
    }
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
