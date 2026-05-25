// @synapse-router/cli — `synapse route` command
// Run multi-dimensional routing to select the best provider for a given intent.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  route,
  registerCustomStrategies,
  getStrategies,
  type RoutingRequest,
  type ProviderCapability,
  type RouteResult,
  type CustomStrategyConfig,
} from "@synapse-router/router";
import { loadMergedConfig } from "../utils/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteOptions {
  intent: string;
  strategy: string;
  maxCost?: number;
  minReliability?: number;
  prefer?: string[];
  exclude?: string[];
  region?: string;
  minVersion?: string;
  strategyWeights?: string;   // JSON string of custom weights
  format: "json" | "table" | "compact";
}

interface ProviderEntry {
  card: {
    provider: { id: string; name: string; docs_url?: string; base_url?: string };
    service: { version: string; base_url: string };
    features: Array<{
      id: string;
      intent: string;
      name: string;
      description: string;
      input: { fields: Array<{ name: string; type: string; required: boolean }> };
      field_mappings?: Array<{
        canonical_field: string;
        provider_field: string;
        required?: boolean;
      }>;
    }>;
  };
  source: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_PACKS_DIR = join(homedir(), ".synapse", "packs");
const SYNAPSE_CONFIG_PATH = join(homedir(), ".synapse", "config.json");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseRouteArgs(argv: string[]): RouteOptions {
  const options: RouteOptions = {
    intent: "",
    strategy: "balanced",
    format: "json",
  };

  // First positional = intent
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return options; // help will be checked before processing
    }
  }

  // Find intent (first arg that doesn't start with --)
  let intentFound = false;
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("-") && !intentFound) {
      options.intent = argv[i];
      intentFound = true;
    }
  }

  // Parse flags
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[i + 1];

    if (arg === "--strategy" || arg === "-s") {
      options.strategy = next() ?? "balanced";
      i++;
    } else if (arg === "--max-cost") {
      options.maxCost = parseFloat(next() ?? "0");
      i++;
    } else if (arg === "--min-reliability") {
      options.minReliability = parseFloat(next() ?? "0");
      i++;
    } else if (arg === "--prefer" || arg === "-p") {
      options.prefer = next()?.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (arg === "--exclude" || arg === "-x") {
      options.exclude = next()?.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (arg === "--region") {
      options.region = next();
      i++;
    } else if (arg === "--min-version") {
      options.minVersion = next();
      i++;
    } else if (arg === "--strategy-weights") {
      options.strategyWeights = next();
      i++;
    } else if (arg === "--format" || arg === "-f") {
      const fmt = next() ?? "json";
      if (fmt === "table" || fmt === "compact" || fmt === "json") {
        options.format = fmt;
      }
      i++;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Provider loading
// ---------------------------------------------------------------------------

function readJsonSync(filePath: string): unknown {
  try {
    const { readFileSync } = require("node:fs");
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

async function loadProvidersFromDir(dir: string, source: "builtin" | "registry" | "local"): Promise<ProviderEntry[]> {
  const entries: ProviderEntry[] = [];
  try {
    const providerDirs = await readdir(dir, { withFileTypes: true });
    for (const entry of providerDirs) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const cardPath = join(dir, entry.name, "provider-card.json");
      try {
        const content = await readFile(cardPath, "utf8");
        const card = JSON.parse(content);
        if (card?.provider?.id) {
          entries.push({ card, source });
        }
      } catch {
        // skip invalid pack dirs
      }
    }
  } catch {
    // dir doesn't exist
  }
  return entries;
}

async function findBuiltinPacksDir(): Promise<string | null> {
  const cwd = process.cwd();
  const devPath = join(cwd, "packs");
  try {
    await readdir(devPath);
    return devPath;
  } catch { /* ignore */ }

  try {
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(import.meta.url);
    const depth = dir.includes("/dist/") ? 5 : 4;
    const ups = new Array<string>(depth).fill("..");
    const packsFromCli = join(dir, ...ups, "packs");
    await readdir(packsFromCli);
    return packsFromCli;
  } catch { /* ignore */ }

  return null;
}

async function loadAllProviders(): Promise<ProviderEntry[]> {
  const all = new Map<string, ProviderEntry>();

  // Priority (low to high): builtin < registry < local
  const builtinDir = await findBuiltinPacksDir();
  if (builtinDir) {
    for (const entry of await loadProvidersFromDir(builtinDir, "builtin")) {
      all.set(entry.card.provider.id, entry);
    }
  }

  // Load from ~/.synapse/packs
  for (const entry of await loadProvidersFromDir(USER_PACKS_DIR, "registry")) {
    if (!all.has(entry.card.provider.id)) {
      all.set(entry.card.provider.id, entry);
    }
  }

  // Load from .synapse/packs (local project)
  const localDir = join(process.cwd(), ".synapse", "packs");
  for (const entry of await loadProvidersFromDir(localDir, "local")) {
    all.set(entry.card.provider.id, entry); // local overrides all
  }

  return [...Array.from(all.values())];
}

function toProviderCapability(entry: ProviderEntry): ProviderCapability {
  const card = entry.card;
  const features = (card.features || []).map((f) => ({
    id: f.id,
    intent: f.intent,
    costPerUnit: undefined as number | undefined,
    estimatedLatencyMs: undefined as number | undefined,
    supportsStructuredOutput: undefined as boolean | undefined,
  }));

  return {
    id: card.provider.id,
    name: card.provider.name,
    features,
    performance: {
      latencyCategory: "balanced" as "cheap" | "fast" | "quality",
      reliability: 0.95,
    },
  };
}

// ---------------------------------------------------------------------------
// Config loading (custom strategies from config)
// ---------------------------------------------------------------------------

async function loadCustomStrategiesFromConfig(): Promise<CustomStrategyConfig[]> {
  const config = await loadMergedConfig();
  const routeConfig = config?.route as Record<string, unknown> | undefined;
  const strategies = routeConfig?.strategies as Record<string, unknown> | undefined;
  if (!strategies) return [];

  return Object.entries(strategies)
    .filter(([, val]) => val !== null && typeof val === "object")
    .map(([id, val]) => {
      const s = val as Record<string, unknown>;
      return {
        id,
        name: (s.name as string) ?? id,
        description: (s.description as string) ?? `Custom strategy "${id}"`,
        weights: {
          cost: (s.weights as any)?.cost ?? 1,
          latency: (s.weights as any)?.latency ?? 1,
          reliability: (s.weights as any)?.reliability ?? 1,
          featureMatch: (s.weights as any)?.featureMatch ?? 1,
        },
        maxCost: s.maxCost as number | undefined,
        minReliability: s.minReliability as number | undefined,
      };
    });
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatRouteResult(result: RouteResult, format: string): void {
  if (!result.provider) {
    console.log(
      JSON.stringify({ error: "No suitable provider found", explanation: result.explanation }, null, 2),
    );
    return;
  }

  switch (format) {
    case "json":
      console.log(JSON.stringify(result, null, 2));
      break;

    case "compact":
      console.log(result.provider);
      break;

    case "table":
      console.log(`\nSelected Provider: ${result.provider}`);
      console.log(`Strategy:          ${result.strategy}`);
      console.log(`Score:             ${result.score.totalScore.toFixed(1)}/100`);
      console.log(`\nDimensions:`);
      console.log(`  Cost:             ${result.score.dimensions.cost.toFixed(1)}`);
      console.log(`  Latency:          ${result.score.dimensions.latency.toFixed(1)}`);
      console.log(`  Reliability:      ${result.score.dimensions.reliability.toFixed(1)}`);
      console.log(`  Feature Match:    ${result.score.dimensions.featureMatch.toFixed(1)}`);
      console.log(`\nCandidates:`);
      for (const c of result.candidates) {
        const marker = c.provider === result.provider ? "→ " : "  ";
        console.log(`  ${marker}${c.provider.padEnd(16)} ${c.totalScore.toFixed(1)}`);
      }
      if (result.explanation.failoverChain?.length) {
        console.log(`\nFailover:`);
        for (const f of result.explanation.failoverChain) {
          console.log(`  ${f.from} → ${f.reason}`);
        }
      }
      if (result.explanation.filteredAfterConstraints > 0) {
        console.log(`\n(Filtered out ${result.explanation.filteredAfterConstraints} provider(s))`);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleRouteCommand(rawArgs: string[]): Promise<void> {
  const options = parseRouteArgs(rawArgs);

  // Check: if strategy-weights is provided, use as one-off
  if (options.strategyWeights) {
    try {
      const weights = JSON.parse(options.strategyWeights) as Record<string, number>;
      registerCustomStrategies([{
        id: "_cli_weights",
        name: "CLI One-off Weights",
        description: "One-off strategy weights from --strategy-weights",
        weights: {
          cost: weights.cost ?? 1,
          latency: weights.latency ?? 1,
          reliability: weights.reliability ?? 1,
          featureMatch: weights.featureMatch ?? 1,
        },
      }]);
      options.strategy = "_cli_weights";
    } catch {
      console.error("Error: --strategy-weights must be valid JSON, e.g. '{\"cost\":2,\"latency\":1}'");
      process.exit(1);
    }
  }

  // Load custom strategies from config
  try {
    const customConfigs = await loadCustomStrategiesFromConfig();
    if (customConfigs.length > 0) {
      registerCustomStrategies(customConfigs);
    }
  } catch {
    // silent — config may not exist
  }

  // Load all providers
  const providers = await loadAllProviders();
  if (providers.length === 0) {
    console.error("No providers found. Run 'synapse setup' or 'synapse pack add' first.");
    process.exit(1);
  }

  // Build routing request
  const request: RoutingRequest = {
    intent: options.intent || "chat",
    ...(options.maxCost !== undefined && { maxCost: options.maxCost }),
    ...(options.minReliability !== undefined && { minReliability: options.minReliability }),
    ...(options.prefer && { preferredProviders: options.prefer }),
    ...(options.exclude && { excludeProviders: options.exclude }),
    ...(options.region && { region: options.region }),
    ...(options.minVersion && { minVersion: options.minVersion }),
  };

  // Convert to ProviderCapability[]
  const capabilityProviders = providers.map(toProviderCapability);

  // Execute routing
  const result = route(capabilityProviders, request, options.strategy);

  // Format and output
  formatRouteResult(result, options.format);
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printRouteHelp(): void {
  console.log(HELP_ROUTE);
}

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

export function handleRouteSubcommand(args: string[], flags: Set<string>): void {
  if (flags.has("help") || args.includes("--help") || args.includes("-h")) {
    printRouteHelp();
    return;
  }
  // Forward raw args
  const rawArgs = args; // already contains intent + options
  handleRouteCommand(rawArgs).catch((err) => {
    console.error("Route command failed:", err.message);
    process.exit(1);
  });
}
