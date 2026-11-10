// @synapse-router/cli — `synapse smoke` command
// Run provider smoke tests against live production APIs through the connector layer.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createVault } from "@synapse-router/vault";
import type { ConnectParams, ConnectResult, ConnectLock } from "@synapse-router/connector";
import { HELP_SMOKE } from "../utils/help.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmokeOptions {
  provider: string;
  timeout: number;       // seconds, default 30
  format: "json" | "table" | "compact";
  verbose: boolean;
  apiKey?: string;
}

interface SmokeResult {
  provider: string;
  status: "PASS" | "SKIP" | "FAIL";
  latency_ms: number;
  detail: string;
}

interface ProviderCard {
  provider: { id: string; name: string; docs_url?: string; base_url?: string; auth_type?: "Bearer" | "APIKey" | "OAuth2" };
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
  service: { id: string; name: string; version: string; api_version: string; base_url: string; auth_type: "Bearer" | "APIKey" | "OAuth2" };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_PACKS_DIR = join(homedir(), ".synapse", "packs");
const DEFAULT_TIMEOUT_SEC = 30;

// ---------------------------------------------------------------------------
// Internal Helper: maskApiKey
// ---------------------------------------------------------------------------

function maskApiKey(key: string): string {
  if (!key) return "(not set)";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

// ---------------------------------------------------------------------------
// Internal Helper: withTimeout
// ---------------------------------------------------------------------------

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms: ${label}`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// ---------------------------------------------------------------------------
// Pack Resolution Helpers
// ---------------------------------------------------------------------------

async function findPacksDir(): Promise<string> {
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    return join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");  // 5 levels up from dist/commands/smoke.js
  } else {
    return join(dirname(dirname(dirname(dirname(dir)))), "packs");  // 4 levels up from src/commands/smoke.ts
  }
}

async function loadProviderCard(packsDir: string, providerId: string): Promise<ProviderCard | null> {
  for (const dir of [packsDir, USER_PACKS_DIR]) {
    const dirName = providerId.includes("/") ? providerId.replace("/", "__") : providerId;
    const cardPath = join(dir, dirName, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      return JSON.parse(content);
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider Smoke Test: runOpenAiSmoke
// ---------------------------------------------------------------------------

async function runOpenAiSmoke(packsDir: string, apiKey: string, timeoutSec: number, verbose: boolean): Promise<SmokeResult> {
  const provider = "openai";
  const startTime = Date.now();

  // 1. Load provider card
  const card = await loadProviderCard(packsDir, provider);
  if (!card) {
    return { provider, status: "FAIL", latency_ms: 0, detail: `Provider card not found for ${provider}` };
  }

  // 2. Find chat feature
  const feature = card.features.find(f => f.id === "chat_post_v1_chat_completions");
  if (!feature) {
    return { provider, status: "FAIL", latency_ms: 0, detail: "Feature chat_post_v1_chat_completions not found in provider card" };
  }

  // 3. Build ConnectLock inline from provider card (bypass negotiate/getOrCreateLock)
  const lock: ConnectLock = {
    intent: feature.intent,
    provider,
    feature_id: feature.id,
    input_schema: feature.input as ConnectLock["input_schema"],
    output_schema: feature.output as ConnectLock["output_schema"],
    field_mappings: (feature.field_mappings ?? []) as ConnectLock["field_mappings"],
  };

  // 4. Construct ConnectParams
  const baseUrl = card.service.base_url;
  const authType = card.service.auth_type; // "Bearer"
  const input: Record<string, unknown> = {
    prompt: [{ role: "user", content: "Hello" }],
    model: "gpt-4o-mini",
  };

  const params: ConnectParams = {
    lock,
    input,
    connection: { base_url: baseUrl, api_key: apiKey, auth_type: authType },
    // Smoke checks inspect the provider's raw shape — request it explicitly
    includeRaw: true,
  };

  // 5. Execute with timeout
  try {
    const { connect } = await import("@synapse-router/connector");
    const result = await withTimeout(connect(params), timeoutSec * 1000, "openai chat");

    const latencyMs = Date.now() - startTime;

    // 6. Verify response shape (D-08: beyond HTTP 200)
    const raw = result.raw as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: "Response body is not an object" };
    }

    const choices = raw.choices as Array<{ message?: { content?: string } }> | undefined;
    if (!choices || !Array.isArray(choices) || choices.length === 0) {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: "Missing choices array in response" };
    }

    const content = choices[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: "Missing choices[0].message.content in response" };
    }

    const detail = `chat completed: ${content.length} chars`;

    return { provider, status: "PASS", latency_ms: latencyMs, detail };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;

    // Per D-01: errors are ConnectorHttpError from connector layer
    if (err instanceof Error && err.name === "ConnectorHttpError") {
      const httpErr = err as unknown as { status: number; statusText: string; url: string; body: string; message: string };
      // Redact API key from error message (per threat model T-04-02)
      const safeMsg = httpErr.message.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskApiKey(apiKey));
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: `HTTP ${httpErr.status} ${httpErr.statusText}: ${safeMsg}` };
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    // Redact API key from any error detail (per threat model T-04-01)
    const safeMsg = errMsg.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskApiKey(apiKey));

    if (safeMsg.includes("Timeout after")) {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: `Timeout after ${timeoutSec}s` };
    }

    return { provider, status: "FAIL", latency_ms: latencyMs, detail: safeMsg };
  }
}

// ---------------------------------------------------------------------------
// Provider Smoke Test: runReplicateSmoke
// ---------------------------------------------------------------------------

async function runReplicateSmoke(packsDir: string, apiKey: string, timeoutSec: number, verbose: boolean): Promise<SmokeResult> {
  const provider = "replicate";
  const startTime = Date.now();

  // 1. Load provider card
  const card = await loadProviderCard(packsDir, provider);
  if (!card) {
    return { provider, status: "FAIL", latency_ms: 0, detail: `Provider card not found for ${provider}` };
  }

  // 2. Find predictions feature
  const feature = card.features.find(f => f.id === "predictions_post_v1_predictions");
  if (!feature) {
    return { provider, status: "FAIL", latency_ms: 0, detail: "Feature predictions_post_v1_predictions not found in provider card" };
  }

  // 3. Build ConnectLock inline from provider card
  const lock: ConnectLock = {
    intent: feature.intent,
    provider,
    feature_id: feature.id,
    input_schema: feature.input as ConnectLock["input_schema"],
    output_schema: feature.output as ConnectLock["output_schema"],
    field_mappings: (feature.field_mappings ?? []) as ConnectLock["field_mappings"],
  };

  // 4. Construct ConnectParams
  const baseUrl = card.service.base_url;
  const authType = card.service.auth_type;

  // D-07: hardcoded model version and fixed input
  // The model_version maps to "version" provider field via field_mappings
  const input: Record<string, unknown> = {
    model_version: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c71a94d2b0c6d7e8f9a0b1c2d3e4f5a6b7c",
    input: { prompt: "A cute cat, high quality, photorealistic" },
  };

  const params: ConnectParams = {
    lock,
    input,
    connection: { base_url: baseUrl, api_key: apiKey, auth_type: authType },
    // Smoke checks inspect the provider's raw shape — request it explicitly
    includeRaw: true,
  };

  // 5. Execute with timeout
  try {
    const { connect } = await import("@synapse-router/connector");
    const result = await withTimeout(connect(params), timeoutSec * 1000, "replicate predict");

    const latencyMs = Date.now() - startTime;

    // 6. Verify response shape (D-08: beyond HTTP 200)
    // NOTE: This deviates from D-08 which specified checking `output`. Replicate's async
    // predictions API returns `output: null` in the initial POST response, so `id` and
    // `status` are checked instead (research finding: Replicate predictions are async).
    const raw = result.raw as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: "Response body is not an object" };
    }

    const predictionId = raw.id;
    if (typeof predictionId !== "string" || predictionId.length === 0) {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: "Missing id in prediction response" };
    }

    const predictionStatus = raw.status;
    if (typeof predictionStatus !== "string") {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: "Missing status in prediction response" };
    }

    const detail = `prediction created: ${(predictionId as string).slice(0, 12)}... (status: ${predictionStatus})`;

    return { provider, status: "PASS", latency_ms: latencyMs, detail };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;

    if (err instanceof Error && err.name === "ConnectorHttpError") {
      const httpErr = err as unknown as { status: number; statusText: string; url: string; body: string; message: string };
      const safeMsg = httpErr.message.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskApiKey(apiKey));
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: `HTTP ${httpErr.status} ${httpErr.statusText}: ${safeMsg}` };
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = errMsg.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskApiKey(apiKey));

    if (safeMsg.includes("Timeout after")) {
      return { provider, status: "FAIL", latency_ms: latencyMs, detail: `Timeout after ${timeoutSec}s` };
    }

    return { provider, status: "FAIL", latency_ms: latencyMs, detail: safeMsg };
  }
}

// ---------------------------------------------------------------------------
// Output Formatting: formatSmokeOutput
// ---------------------------------------------------------------------------

export function formatSmokeOutput(results: SmokeResult[], format: "json" | "table" | "compact", verbose: boolean): string {
  switch (format) {
    case "json":
      return JSON.stringify(results, null, 2);

    case "table": {
      // Column headers + rows
      const lines: string[] = [];
      lines.push("Status  Provider     Latency   Detail");
      lines.push("------  ----------   -------   ------");
      for (const r of results) {
        const latency = r.latency_ms > 0 ? `${(r.latency_ms / 1000).toFixed(2)}s` : "0.00s";
        const detail = r.detail.length > 60 ? r.detail.slice(0, 57) + "..." : r.detail;
        const status = r.status === "PASS" ? "PASS " : r.status;
        lines.push(`${status.padEnd(7)} ${r.provider.padEnd(11)} ${latency.padEnd(9)} ${detail}`);
      }
      return lines.join("\n");
    }

    case "compact": {
      // One-liner per provider: "openai ........... PASS (1.23s)"
      const lines: string[] = [];
      for (const r of results) {
        const latency = r.latency_ms > 0 ? `${(r.latency_ms / 1000).toFixed(2)}s` : "0.00s";
        if (r.status === "SKIP") {
          lines.push(`${r.provider.padEnd(12)} ........... SKIP (${r.detail})`);
        } else {
          lines.push(`${r.provider.padEnd(12)} ........... ${r.status} (${latency})`);
        }
      }
      return lines.join("\n");
    }

    default:
      return JSON.stringify(results, null, 2);
  }
}

// ---------------------------------------------------------------------------
// CLI Entry: printSmokeHelp
// ---------------------------------------------------------------------------

export function printSmokeHelp(): void {
  console.log(HELP_SMOKE);
}

// ---------------------------------------------------------------------------
// CLI Entry: parseSmokeArgs
// ---------------------------------------------------------------------------

export function parseSmokeArgs(argv: string[]): SmokeOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    printSmokeHelp();
    process.exit(0);
  }

  const options: SmokeOptions = {
    provider: "",
    timeout: DEFAULT_TIMEOUT_SEC,
    format: "table",
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--provider" && argv[i + 1]) {
      options.provider = argv[++i];
    } else if (arg === "--timeout" && argv[i + 1]) {
      const val = parseInt(argv[++i], 10);
      options.timeout = val > 0 ? val : DEFAULT_TIMEOUT_SEC;
    } else if (arg === "--format" && argv[i + 1]) {
      const fmt = argv[++i];
      if (fmt === "json" || fmt === "table" || fmt === "compact") {
        options.format = fmt;
      }
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--api-key" && argv[i + 1]) {
      options.apiKey = argv[++i];
    }
  }

  if (!options.provider) {
    console.error("Error: --provider is required");
    console.error("Usage: synapse smoke --provider <name> [options]");
    console.error("Run 'synapse smoke --help' for more information.");
    process.exit(1);
  }

  return options;
}

// ---------------------------------------------------------------------------
// CLI Entry: handleSmokeCommand
// ---------------------------------------------------------------------------

export async function handleSmokeCommand(argv: string[]): Promise<void> {
  const options = parseSmokeArgs(argv);
  const { provider, timeout, format, verbose } = options;

  const packsDir = await findPacksDir();

  // Resolve API key: --api-key flag > vault
  let apiKey = options.apiKey ?? "";
  if (!apiKey) {
    const vault = createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
    apiKey = (await vault.getKey(provider)) ?? "";
  }

  // If no API key available, return SKIP for the provider (not a failure)
  if (!apiKey) {
    const skipResult: SmokeResult = {
      provider,
      status: "SKIP",
      latency_ms: 0,
      detail: `No API key for ${provider}. Use --api-key or 'synapse vault set ${provider} <key>'`,
    };
    console.log(formatSmokeOutput([skipResult], format, verbose));
    return;
  }

  // Dispatch to provider-specific test function
  let result: SmokeResult;
  switch (provider) {
    case "openai":
      result = await runOpenAiSmoke(packsDir, apiKey, timeout, verbose);
      break;
    case "replicate":
      result = await runReplicateSmoke(packsDir, apiKey, timeout, verbose);
      break;
    default:
      console.error(`Error: unknown provider "${provider}". Supported: openai, replicate`);
      process.exit(1);
  }

  // Print formatted output
  console.log(formatSmokeOutput([result], format, verbose));
}
