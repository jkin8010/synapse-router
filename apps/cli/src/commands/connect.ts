// @synapse-router/cli — `synapse connect` command
// Connect to a provider and execute a feature call.
// Supports both imperative (full args) and interactive (auto-degraded) modes.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createVault } from "@synapse-router/vault";
import { getOrCreateLock, type SchemaLock } from "@synapse-router/lock";
import type { ConnectParams, ConnectResult, ConnectLock } from "@synapse-router/connector";
import type { ProviderCard as CoreProviderCard } from "@synapse-router/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectOptions {
  provider?: string;
  intent?: string;
  input?: string;         // JSON string
  inputFile?: string;     // path to JSON file
  baseUrl?: string;
  apiKey?: string;
  lock?: string;          // path to lock file
  raw?: boolean;
  format?: "json" | "table" | "compact";
}

interface ProviderConfig {
  base_url?: string;
  pack?: string;
  auth_type?: "Bearer" | "APIKey" | "OAuth2";
}

interface SynapseConfig {
  providers?: Record<string, ProviderConfig>;
  defaults?: {
    format?: string;
  };
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const CONFIG_PATH = join(homedir(), ".synapse", "config.json");

async function loadConfig(): Promise<SynapseConfig> {
  try {
    const content = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Packs directory
// ---------------------------------------------------------------------------

async function findPacksDir(): Promise<string> {
  // Same logic as the main index.ts findPacksDir — resolve relative to script location
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    return join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");  // 5 levels up from dist/commands/connect.js
  } else {
    return join(dirname(dirname(dirname(dirname(dir)))), "packs");  // 4 levels up from src/commands/connect.ts
  }
}

// ---------------------------------------------------------------------------
// Provider card loading
// ---------------------------------------------------------------------------

interface ProviderCard {
  provider: { id: string; name: string; docs_url: string };
  features: Array<{
    id: string;
    intent: string;
    name: string;
    description: string;
    input: { name: string; fields: Array<{ name: string; type: string; required: boolean }> };
    output: { name: string; fields: Array<{ name: string; type: string }> };
    field_mappings: Array<{
      canonical_field: string;
      provider_field: string;
      required?: boolean;
      transform?: string;
      fallback?: unknown;
    }>;
  }>;
  service: {
    id: string;
    name: string;
    version: string;
    api_version: string;
    base_url: string;
    auth_type: "Bearer" | "APIKey" | "OAuth2";
  };
}

async function loadProviderCard(packsDir: string, providerId: string): Promise<ProviderCard | null> {
  const cardPath = join(packsDir, providerId, "provider-card.json");
  try {
    const content = await readFile(cardPath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function listAvailableProviders(packsDir: string): Promise<Array<{ id: string; name: string }>> {
  const { readdir } = await import("node:fs/promises");
  const providers: Array<{ id: string; name: string }> = [];
  try {
    const entries = await readdir(packsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const card = await loadProviderCard(packsDir, entry.name);
      if (card) {
        providers.push({ id: card.provider.id, name: card.provider.name });
      }
    }
  } catch {
    // packs dir not found
  }
  return providers;
}

// ---------------------------------------------------------------------------
// Interactive prompts (using readline)
// ---------------------------------------------------------------------------

async function promptSelect(label: string, options: string[]): Promise<string> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    console.log(`\n${label}`);
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });

    rl.question("\n  Enter number: ", (answer) => {
      rl.close();
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx]);
      } else {
        console.error("  Invalid selection, using first option.");
        resolve(options[0]);
      }
    });
  });
}

async function promptSelectProvider(packsDir: string): Promise<string> {
  const providers = await listAvailableProviders(packsDir);
  if (providers.length === 0) {
    // Fallback to common providers
    const common = ["deepseek", "openai", "moonshot", "replicate", "stability"];
    const selected = await promptSelect("Choose a provider:", common);
    return selected;
  }
  const labels = providers.map((p) => `${p.name} (${p.id})`);
  const selected = await promptSelect("Choose a provider:", labels);
  const idx = labels.indexOf(selected);
  return providers[idx]?.id ?? providers[0].id;
}

async function promptSelectIntent(packsDir: string, providerId: string): Promise<string> {
  const card = await loadProviderCard(packsDir, providerId);
  if (card && card.features.length > 0) {
    const intents = [...new Set(card.features.map((f) => f.intent))];
    if (intents.length > 0) {
      const selected = await promptSelect("Choose feature intent:", intents);
      return selected;
    }
  }
  // Fallback to common intents
  const commonIntents = ["chat", "embeddings", "text-to-image", "speech-to-text", "translation"];
  const selected = await promptSelect("Choose feature intent:", commonIntents);
  return selected;
}

async function promptJson(label: string): Promise<Record<string, unknown>> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`\n${label} (JSON): `, (answer) => {
      rl.close();
      try {
        resolve(JSON.parse(answer.trim()));
      } catch {
        console.error("  Invalid JSON. Using empty object.");
        resolve({});
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Connect help
// ---------------------------------------------------------------------------

export function printConnectHelp(): void {
  console.log(`
synapse connect — Connect to a provider and execute a feature call

Usage:
  synapse connect <provider> <intent> [options]
  synapse connect                         (interactive mode)

Arguments:
  <provider>    Provider ID (e.g. deepseek, openai, moonshot)
  <intent>      Feature intent (e.g. chat, text-to-image, embeddings)

Options:
  --input <json>        Input as JSON string (canonical fields)
  --input-file <path>   Read input from JSON file
  --base-url <url>      Override provider base URL
  --api-key <key>       Override API key (prefer vault)
  --lock <path>         Use existing schema lock file
  --raw                 Output raw provider response
  --format <fmt>        Output format: json | table | compact (default: json)

Modes:
  Imperative    Full parameters provided — no interaction
                $ synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}]}'

  Interactive   Missing parameters — guided prompts
                $ synapse connect deepseek chat
                $ synapse connect              (all parameters prompted)

Examples:
  # Chat with DeepSeek
  synapse connect deepseek chat --input '{"messages":[{"role":"user","content":"Hello"}],"model":"deepseek-chat"}'

  # Generate image with stability
  synapse connect stability text-to-image --input '{"prompt":"A sunset over mountains"}'

  # Read input from file
  synapse connect openai chat --input-file ./my-request.json

  # Interactive mode (auto-degraded when parameters missing)
  synapse connect deepseek chat

  # Full interactive
  synapse connect

  # Override base URL
  synapse connect deepseek chat --base-url https://custom-api.example.com/v1 --raw

See also:
  synapse setup   — Interactive first-time setup
  synapse vault   — Manage API keys
  synapse config  — Manage provider configuration
`);
}

// ---------------------------------------------------------------------------
// Parse connect command arguments
// ---------------------------------------------------------------------------

export function parseConnectArgs(argv: string[]): ConnectOptions {
  // First check if we should show help
  if (argv.includes("--help") || argv.includes("-h")) {
    printConnectHelp();
    process.exit(0);
  }

  const options: ConnectOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      options.input = argv[++i];
    } else if (arg === "--input-file" && argv[i + 1]) {
      options.inputFile = argv[++i];
    } else if (arg === "--base-url" && argv[i + 1]) {
      options.baseUrl = argv[++i];
    } else if (arg === "--api-key" && argv[i + 1]) {
      options.apiKey = argv[++i];
    } else if (arg === "--lock" && argv[i + 1]) {
      options.lock = argv[++i];
    } else if (arg === "--raw") {
      options.raw = true;
    } else if (arg === "--format" && argv[i + 1]) {
      options.format = argv[++i] as "json" | "table" | "compact";
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  options.provider = positional[0];
  options.intent = positional[1];
  return options;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatOutput(result: ConnectResult | Record<string, unknown>, format: "json" | "table" | "compact", raw?: boolean): string {
  if (format === "compact") {
    if ("data" in result && result.data && typeof result.data === "object") {
      const data = result.data as Record<string, unknown>;
      // Try to extract the most relevant field
      if ("choices" in data) {
        const choices = data.choices as Array<{ message?: { content?: string } }>;
        return choices.map((c) => c.message?.content ?? "").join("\n");
      }
      if ("data" in data) {
        return JSON.stringify(data.data);
      }
    }
    return JSON.stringify(result);
  }

  if (format === "table") {
    // Simple table output
    const lines: string[] = [];
    if ("ok" in result) {
      lines.push(`Status:  ${result.ok ? "✓ OK" : "✗ Error"}`);
      if ("status" in result) lines.push(`HTTP:    ${result.status}`);
      if ("error" in result && result.error) lines.push(`Error:   ${result.error}`);
      if (raw && "raw" in result) {
        lines.push(`Raw:     ${JSON.stringify(result.raw, null, 2)}`);
      } else if ("data" in result && result.data) {
        lines.push(`Data:    ${JSON.stringify(result.data, null, 2)}`);
      }
    } else {
      lines.push(JSON.stringify(result, null, 2));
    }
    return lines.join("\n");
  }

  // Default: json
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Main connect handler
// ---------------------------------------------------------------------------

export async function handleConnectCommand(argv: string[]): Promise<void> {
  const options = parseConnectArgs(argv);

  // Resolve packs directory — same logic as index.ts but adjusted for commands/ subdirectory
  const { fileURLToPath } = await import("node:url");
  let packsDir: string;
  try {
    const dir = fileURLToPath(import.meta.url);
    if (dir.includes("/dist/")) {
      // From dist/commands/connect.js → 5 levels up = project root
      packsDir = join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");
    } else {
      // From src/commands/connect.ts → 4 levels up = project root
      packsDir = join(dirname(dirname(dirname(dirname(dir)))), "packs");
    }
  } catch {
    packsDir = join(process.cwd(), "packs");
  }

  // Load config
  const config = await loadConfig();

  // ---- Interactive degradation: fill in missing parameters ----
  let { provider, intent } = options;

  if (!provider) {
    provider = await promptSelectProvider(packsDir);
  }

  if (!intent) {
    intent = await promptSelectIntent(packsDir, provider);
  }

  // Resolve input
  let input: Record<string, unknown>;
  if (options.input) {
    try {
      input = JSON.parse(options.input);
    } catch {
      console.error("Error: --input is not valid JSON");
      process.exit(1);
    }
  } else if (options.inputFile) {
    try {
      const content = await readFile(options.inputFile, "utf8");
      input = JSON.parse(content);
    } catch (err) {
      console.error(`Error reading input file: ${err}`);
      process.exit(1);
    }
  } else {
    // Interactive: prompt for input
    input = await promptJson(`Enter input for ${provider}/${intent}`);
  }

  // Resolve base URL: --base-url > config > provider-card (using pack)
  const providerConfig = config.providers?.[provider];
  const packName = providerConfig?.pack;  // e.g. "openai" for deepseek using openai pack

  // Determine which pack dir to load provider-card from
  const cardDir = packName ?? provider;  // "openai" if configured, else the provider itself

  let baseUrl = options.baseUrl;
  if (!baseUrl) {
    if (providerConfig?.base_url) {
      baseUrl = providerConfig.base_url;
    } else {
      const card = await loadProviderCard(packsDir, cardDir);
      if (card?.service?.base_url) {
        baseUrl = card.service.base_url;
      } else {
        baseUrl = `https://api.${provider}.com/v1`;
      }
    }
  }

  // Resolve API key: --api-key > vault
  let apiKey = options.apiKey ?? "";
  if (!apiKey) {
    const vault = createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
    apiKey = (await vault.getKey(provider)) ?? "";
  }

  if (!apiKey) {
    console.error(`Error: No API key found for "${provider}". Use "synapse vault set ${provider} <key>" or pass --api-key`);
    process.exit(1);
  }

  // Resolve auth type
  let authType: "Bearer" | "APIKey" | "OAuth2" = "Bearer";
  if (providerConfig?.auth_type) {
    authType = providerConfig.auth_type;
  } else {
    const card = await loadProviderCard(packsDir, cardDir);
    if (card?.service?.auth_type) {
      const raw = card.service.auth_type;
      if (raw === "Bearer" || raw === "APIKey" || raw === "OAuth2") {
        authType = raw;
      }
    }
  }

  // Build lock from provider card (prefer Schema Lock cache)
  let lock: ConnectLock;
  if (options.lock) {
    // Load lock from file
    try {
      const lockContent = await readFile(options.lock, "utf8");
      lock = JSON.parse(lockContent);
    } catch (err) {
      console.error(`Error reading lock file: ${err}`);
      process.exit(1);
    }
  } else {
    // Try Schema Lock cache first
    const configDir = join(homedir(), ".synapse");
    const card = await loadProviderCard(packsDir, cardDir);
    if (!card) {
      console.error(`Error: Provider pack "${cardDir}" not found${packName ? ` (mapped from provider "${provider}")` : ""}.`);
      console.error(`Available packs: run "synapse provider list" to see installed packs.`);
      process.exit(1);
    }
    const feature = card.features.find(
      (f) => f.intent === intent || f.id === intent
    );
    if (!feature) {
      console.error(`Error: No feature found for intent "${intent}" in pack "${cardDir}"${packName ? ` (provider: ${provider})` : ""}`);
      console.error(`Available intents: ${card.features.map((f) => f.intent).join(", ")}`);
      process.exit(1);
    }

    // Check ~/.synapse/schemas/ for cached Schema Lock
    try {
      const { lock: schemaLock, cached } = await getOrCreateLock({
        intent: feature.intent,
        provider: provider,  // Use actual provider name, not pack name
        packDir: packsDir,
        configDir,
        card: card as unknown as CoreProviderCard,
      });

      if (cached) {
        console.log(`Using cached lock: ${schemaLock.lock_id}`);
      } else {
        console.log(`Created new lock: ${schemaLock.lock_id}`);
      }

      // Convert SchemaLock to ConnectLock (compatible structure)
      lock = {
        intent: schemaLock.intent,
        provider: schemaLock.provider,
        feature_id: schemaLock.feature_id,
        input_schema: schemaLock.input_schema as ConnectLock["input_schema"],
        output_schema: schemaLock.output_schema as ConnectLock["output_schema"],
        field_mappings: schemaLock.field_mappings as ConnectLock["field_mappings"],
      };
    } catch (err: any) {
      console.error(`⚠ Schema Lock failed (fallback to no cache): ${err.message}`);
      console.error(err.stack);
      // Fallback: build lock directly from provider card (original behavior)
      lock = {
        intent: feature.intent,
        provider: provider,
        feature_id: feature.id,
        input_schema: feature.input as ConnectLock["input_schema"],
        output_schema: feature.output as ConnectLock["output_schema"],
        field_mappings: (feature.field_mappings ?? []) as ConnectLock["field_mappings"],
      };
    }
  }

  // Build connect params
  const params: ConnectParams = {
    lock,
    input,
    connection: {
      base_url: baseUrl!,
      api_key: apiKey,
      auth_type: authType,
    },
  };

  // Determine output format
  const format = options.format ?? (config.defaults?.format as "json" | "table" | "compact") ?? "json";

  // ---- Execute the connection ----
  try {
    // Try dynamic import of connector
    const { connect } = await import("@synapse-router/connector");
    const result = await connect(params);
    console.log(formatOutput(result, format, options.raw));
  } catch (err: any) {
    // Connector not available — output debug info
    if (err?.code === "MODULE_NOT_FOUND" || err?.message?.includes("not yet implemented")) {
      console.log("⚠️  @synapse-router/connector not yet available — showing debug info:\n");
      const debugInfo = {
        ok: false,
        status: 0,
        error: "connector_not_available",
        debug: {
          message: "Connector package is not yet implemented. This is the request that would be sent:",
          params: {
            lock: {
              intent: params.lock.intent,
              provider: params.lock.provider,
              feature_id: params.lock.feature_id,
            },
            input: params.input,
            connection: {
              base_url: params.connection.base_url,
              auth_type: params.connection.auth_type,
            },
          },
          hint: "Once @synapse-router/connector is implemented, this command will make the actual API call.",
        },
      };
      console.log(JSON.stringify(debugInfo, null, 2));
    } else {
      console.error(`Error: ${err?.message ?? err}`);
      process.exit(1);
    }
  }
}
