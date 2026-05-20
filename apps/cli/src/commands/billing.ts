// @synapse-router/cli -- `synapse billing` command
// Manage billing configuration and quota status

import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { pricingFromProviderCard } from "@synapse-router/billing";

// ---------------------------------------------------------------------------
// Billing config file helpers
// ---------------------------------------------------------------------------

const SYNAPSE_DIR = join(homedir(), ".synapse");
const BILLING_CONFIG_PATH = join(SYNAPSE_DIR, "billing-config.json");

interface BillingConfigFile {
  version: string;
  providers: Record<string, {
    pricing: Record<string, object>;
    quotas: object[];
    onError: string;
  }>;
}

async function loadBillingConfig(): Promise<BillingConfigFile> {
  try {
    const content = await readFile(BILLING_CONFIG_PATH, "utf8");
    return JSON.parse(content);
  } catch {
    return { version: "1", providers: {} };
  }
}

async function saveBillingConfig(config: BillingConfigFile): Promise<void> {
  await mkdir(SYNAPSE_DIR, { recursive: true });
  await writeFile(BILLING_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderCardPricing {
  input?: number;
  output?: number;
  unit?: string;
}

interface FeatureDef {
  id: string;
  intent: string;
  name: string;
  description: string;
  pricing?: ProviderCardPricing;
}

interface ProviderCard {
  provider: { id: string; name: string };
  features: FeatureDef[];
  service?: { base_url?: string };
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printBillingHelp(): void {
  console.log(`
synapse billing -- Manage billing configuration and quota status

Usage:
  synapse billing init [options]     Initialize billing configuration
  synapse billing config [subcommand]  View or modify billing configuration
  synapse billing status [options]     View quota status and estimated costs

Subcommands:
  init         Interactive wizard to set up per-provider pricing and quotas
  config       Set/get billing config values (also available via synapse config billing.*)
  status       Display per-provider quota status in grouped table format

Options (init):
  --provider <id>           Provider ID to configure (can repeat for multiple)
  --pricing-strategy <s>    Pricing strategy: perToken, perUnit, flat (default: perToken)
  --quota <limit>           Quota limit in USD (default: 10)
  --quota-period <period>   Quota period: hour, day, month (default: month)
  --on-error <strategy>     Billing error handling: warn, reject (default: warn)

Options (status):
  --format json             Machine-readable output (default: table)

See also:
  synapse config            Manage configuration
  synapse connect           Connect to a provider (auto-wraps with billing if configured)
`);
}

// ---------------------------------------------------------------------------
// Packs directory and provider card loading
// ---------------------------------------------------------------------------

async function findPacksDir(): Promise<string> {
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    // From dist/commands/billing.js -> 5 levels up = project root
    return join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");
  } else {
    // From src/commands/billing.ts -> 4 levels up = project root
    return join(dirname(dirname(dirname(dirname(dir)))), "packs");
  }
}

async function loadProviderCard(packsDir: string, providerId: string): Promise<ProviderCard | null> {
  const dirName = providerId.includes("/") ? providerId.replace("/", "__") : providerId;
  const cardPath = join(packsDir, dirName, "provider-card.json");
  try {
    const content = await readFile(cardPath, "utf8");
    return JSON.parse(content) as ProviderCard;
  } catch {
    return null;
  }
}

async function listInstalledProviders(packsDir: string): Promise<Array<{ id: string; name: string }>> {
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
    // packs dir not found -- return empty list
  }
  return providers;
}

// ---------------------------------------------------------------------------
// Readline prompter
// ---------------------------------------------------------------------------

async function createPrompter(): Promise<{ question: (q: string) => Promise<string>; close: () => void }> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));
  return { question, close: () => { try { rl.close(); } catch { /* ignore */ } } };
}

// ---------------------------------------------------------------------------
// Config command: display and edit billing configuration
// ---------------------------------------------------------------------------

function printBillingConfigHelp(): void {
  console.log(`
synapse billing config -- View or modify billing configuration

Usage:
  synapse billing config                    Display current billing configuration
  synapse billing config set <key> <value>  Set a billing configuration value
  synapse billing config --help             Show this help message

Key format: <provider>.<section>.<field>
Examples:
  set openai.onError reject                 Set error handling strategy
  set openai.pricing.chat.strategy perToken Set pricing strategy for a feature
  set openai.quotas.0.limit 20              Set quota limit

Supported fields:
  onError:     warn, reject, downgrade, notify
  strategy:    perToken, perUnit, tiered, flat
  period:      minute, hour, day, month, oneTime
  limit, used, threshold, inputPrice, outputPrice, unitPrice, costPerCall: non-negative number
  unit, type, id: string

Key paths also accessible via:
  synapse config set billing.<key> <value>

See also:
  synapse billing init        Initialize billing configuration
  synapse billing status      View quota usage
`);
}

async function handleBillingConfig(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printBillingConfigHelp();
    return;
  }

  const subcommand = argv[0];

  if (!subcommand || subcommand === "list" || subcommand === "show") {
    await displayBillingConfig();
    return;
  }

  if (subcommand === "set") {
    await setBillingConfigValue(argv[1], argv.slice(2).join(" "));
    return;
  }

  console.error(`Unknown billing config subcommand: "${subcommand}"`);
  printBillingConfigHelp();
  process.exit(1);
}

async function displayBillingConfig(): Promise<void> {
  const config = await loadBillingConfig();
  const providers = config.providers;
  const providerIds = Object.keys(providers);

  if (providerIds.length === 0) {
    console.log("No billing configuration found. Run 'synapse billing init' to set up billing.");
    return;
  }

  console.log("Billing Configuration:");
  for (const providerId of providerIds) {
    const provider = providers[providerId];
    if (!provider) continue;

    console.log(`\nProvider: ${providerId}`);
    console.log(`  On error: ${provider.onError}`);

    // Display pricing
    const pricing = provider.pricing as Record<string, Record<string, unknown>>;
    const featureIds = Object.keys(pricing ?? {});
    if (featureIds.length > 0) {
      console.log(`  Pricing (${featureIds.length} features):`);
      for (const featureId of featureIds) {
        const rule = pricing[featureId];
        if (!rule) continue;
        const strategy = String(rule.strategy ?? "");
        console.log(`    ${featureId}:`);
        console.log(`      strategy: ${strategy}`);
        if (rule.unit) console.log(`      unit: ${String(rule.unit)}`);
        if (strategy === "perToken") {
          console.log(`      inputPrice: ${rule.inputPrice ?? 0}  |  outputPrice: ${rule.outputPrice ?? 0}`);
        } else if (strategy === "perUnit") {
          console.log(`      unitPrice: ${rule.unitPrice ?? 0}`);
        } else if (strategy === "flat") {
          console.log(`      costPerCall: ${rule.costPerCall ?? 0}`);
        }
      }
    } else {
      console.log(`  Pricing: (none configured)`);
    }

    // Display quotas
    const quotas = provider.quotas as Array<Record<string, unknown>>;
    if (quotas.length > 0) {
      console.log(`  Quotas (${quotas.length}):`);
      for (let i = 0; i < quotas.length; i++) {
        const q = quotas[i];
        if (!q) continue;
        const qId = String(q.id ?? `quota-${i}`);
        const limit = Number(q.limit ?? 0);
        const used = Number(q.used ?? 0);
        const period = String(q.period ?? "month");
        const pct = limit > 0 ? ((used / limit) * 100).toFixed(0) : "0";
        console.log(`    ${qId}:`);
        console.log(`      Used: ${used} / ${limit}  (${pct}%)`);
        console.log(`      Period: ${period}`);
      }
    } else {
      console.log(`  Quotas: (none configured)`);
    }
  }
  console.log();
}

function validateBillingConfigValue(lastSegment: string, value: string): void {
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

function setNestedBillingValue(obj: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  const lastPart = parts[parts.length - 1];

  // Handle quotas array path: "quotas.0.limit"
  if (parts.length >= 3 && parts[0] === "quotas" && /^\d+$/.test(parts[1])) {
    const idx = parseInt(parts[1], 10);
    const field = parts.slice(2).join(".");

    if (!Array.isArray(obj.quotas)) {
      obj.quotas = [];
    }
    const quotas = obj.quotas as unknown as Record<string, unknown>[];
    if (!quotas[idx]) {
      quotas[idx] = {};
    }
    const numericFields = new Set(["limit", "used", "threshold", "inputPrice", "outputPrice", "unitPrice", "costPerCall"]);
    if (numericFields.has(field)) {
      quotas[idx][field] = Number(value);
    } else {
      quotas[idx][field] = value;
    }
    return;
  }

  // Handle nested object paths
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }

  const numericFields = new Set(["limit", "used", "threshold", "inputPrice", "outputPrice", "unitPrice", "costPerCall"]);
  if (numericFields.has(lastPart)) {
    current[lastPart] = Number(value);
  } else {
    current[lastPart] = value;
  }
}

async function setBillingConfigValue(key: string, value: string): Promise<void> {
  if (!key || value === undefined || value === "") {
    console.error("Error: both key and value are required");
    console.error("Usage: synapse billing config set <key> <value>");
    process.exit(1);
  }

  const parts = key.split(".");
  if (parts.length < 2) {
    console.error(`Error: Invalid key '${key}'. Format must be <provider>.<section>.<field>`);
    console.error("Example: openai.onError reject");
    process.exit(1);
  }

  const provider = parts[0];
  const restPath = parts.slice(1).join(".");
  const lastSegment = parts[parts.length - 1];

  validateBillingConfigValue(lastSegment, value);

  const config = await loadBillingConfig();
  if (!config.providers[provider]) {
    config.providers[provider] = { pricing: {}, quotas: [], onError: "warn" };
  }

  setNestedBillingValue(config.providers[provider] as unknown as Record<string, unknown>, restPath, value);
  await saveBillingConfig(config);

  console.log(`✓ billing.${key} = ${value}`);
}

// ---------------------------------------------------------------------------
// Status: display quota usage
// ---------------------------------------------------------------------------

const QUOTAS_DIR = process.env.SYNAPSE_QUOTA_DIR ?? join(homedir(), ".synapse", "quotas");

function formatResetTime(period: string): string {
  const now = Date.now();
  switch (period) {
    case "minute":
      return new Date(now + 60_000).toISOString();
    case "hour":
      return new Date(now + 3_600_000).toISOString();
    case "day": {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.toISOString();
    }
    case "month": {
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);
      return nextMonth.toISOString();
    }
    default:
      return "N/A";
  }
}

interface QuotaRecord {
  id: string;
  type: string;
  limit: number;
  used: number;
  period: string;
  threshold?: number;
  resetAt?: string;
}

function readAllQuotaData(): Map<string, QuotaRecord[]> {
  const result = new Map<string, QuotaRecord[]>();
  try {
    const files = readdirSync(QUOTAS_DIR, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const providerId = file.name.replace(/\.json$/, "");
      try {
        const content = readFileSync(join(QUOTAS_DIR, file.name), "utf8");
        const entries = JSON.parse(content) as Record<string, QuotaRecord>;
        const quotas = Object.values(entries);
        if (quotas.length > 0) {
          result.set(providerId, quotas);
        }
      } catch {
        // Skip corrupt files (T-10-09: DoS mitigation)
      }
    }
  } catch {
    // QUOTAS_DIR does not exist yet
  }
  return result;
}

function estimateCostFromQuota(
  quota: QuotaRecord,
  pricing: Record<string, Record<string, unknown>> | undefined,
): number {
  if (!pricing) return 0;
  const featureIds = Object.keys(pricing);
  if (featureIds.length === 0) return 0;

  // Use first pricing rule for cost estimation
  const rule = pricing[featureIds[0]];
  if (!rule) return 0;

  const strategy = String(rule.strategy ?? "");
  switch (strategy) {
    case "perToken": {
      const inputPrice = Number(rule.inputPrice ?? 0);
      const outputPrice = Number(rule.outputPrice ?? 0);
      return quota.used * (inputPrice + outputPrice) / 2;
    }
    case "perUnit": {
      const unitPrice = Number(rule.unitPrice ?? 0);
      return quota.used * unitPrice;
    }
    case "flat": {
      const costPerCall = Number(rule.costPerCall ?? 0);
      return quota.used * costPerCall;
    }
    default:
      return 0;
  }
}

async function handleBillingStatus(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printBillingStatusHelp();
    return;
  }

  const formatIndex = argv.indexOf("--format");
  const format = formatIndex !== -1 && argv[formatIndex + 1] === "json" ? "json" : "table";

  // Load data
  const billingConfig = await loadBillingConfig();
  const quotaData = readAllQuotaData();

  if (quotaData.size === 0) {
    console.log("No billing data found. Run 'synapse billing init' to set up billing, then use 'synapse connect' to generate quota data.");
    return;
  }

  if (format === "json") {
    outputStatusJson(billingConfig, quotaData);
  } else {
    outputStatusTable(billingConfig, quotaData);
  }
}

function outputStatusJson(
  config: BillingConfigFile,
  quotaData: Map<string, QuotaRecord[]>,
): void {
  const providers: Record<string, {
    quotas: Array<{
      id: string;
      type: string;
      limit: number;
      used: number;
      remaining: number;
      estimatedCost: number;
      isExceeded: boolean;
      isNearThreshold: boolean;
      period: string;
      resetAt: string;
    }>;
    pricingConfigured: boolean;
  }> = {};

  for (const [providerId, quotas] of quotaData) {
    const providerConfig = config.providers[providerId];
    const pricing = providerConfig?.pricing as Record<string, Record<string, unknown>> | undefined;
    const pricingConfigured = !!pricing && Object.keys(pricing).length > 0;

    const quotaList = quotas.map((q) => {
      const remaining = Math.max(0, q.limit - q.used);
      const estimatedCost = estimateCostFromQuota(q, pricing);
      const isExceeded = q.used >= q.limit;
      const isNearThreshold = q.threshold !== undefined && q.used >= q.limit * q.threshold;
      return {
        id: q.id,
        type: q.type,
        limit: q.limit,
        used: q.used,
        remaining,
        estimatedCost: Math.round(estimatedCost * 100) / 100,
        isExceeded,
        isNearThreshold,
        period: q.period,
        resetAt: q.resetAt ?? formatResetTime(q.period),
      };
    });

    providers[providerId] = { quotas: quotaList, pricingConfigured };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    providers,
  };

  console.log(JSON.stringify(output, null, 2));
}

function pctStr(used: number, limit: number): string {
  if (limit <= 0) return "0%";
  return ((used / limit) * 100).toFixed(0) + "%";
}

function outputStatusTable(
  config: BillingConfigFile,
  quotaData: Map<string, QuotaRecord[]>,
): void {
  let grandTotal = 0;
  let providerIndex = 0;

  for (const [providerId, quotas] of quotaData) {
    if (providerIndex > 0) console.log(); // blank line between providers
    providerIndex++;

    const providerConfig = config.providers[providerId];
    const pricing = providerConfig?.pricing as Record<string, Record<string, unknown>> | undefined;
    const hasPricing = !!pricing && Object.keys(pricing).length > 0;

    console.log(`Provider: ${providerId}`);

    // Column header per D-04: Feature, Remaining, Limit, Used, Reset, Est. Cost
    const featureCol    = "Feature".padEnd(25);
    const remainingCol  = "Remaining".padEnd(12);
    const limitCol      = "Limit".padEnd(10);
    const usedCol       = "Used".padEnd(10);
    const resetCol      = "Reset".padEnd(28);
    const costCol       = hasPricing ? "  " + "Est. Cost".padEnd(10) : "";
    console.log(`  ${featureCol} ${remainingCol} ${limitCol} ${usedCol} ${resetCol}${costCol}`);

    for (const q of quotas) {
      const remaining = q.limit - q.used;
      const remainingStr = remaining <= 0 ? "EXCEEDED" : remaining.toFixed(2);
      const limitStr = q.limit.toFixed(2);
      const usedStr = `${q.used.toFixed(2)} (${pctStr(q.used, q.limit)})`;
      const resetStr = q.resetAt ?? formatResetTime(q.period);
      const cost = estimateCostFromQuota(q, pricing);

      const rowId        = q.id.padEnd(25);
      const rowRemaining = remainingStr.padEnd(12);
      const rowLimit     = limitStr.padEnd(10);
      const rowUsed      = usedStr.padEnd(10);
      const rowReset     = resetStr.padEnd(28);
      const rowCost      = hasPricing ? "  " + `$${cost.toFixed(2)}`.padStart(10) : "";
      console.log(`  ${rowId} ${rowRemaining} ${rowLimit} ${rowUsed} ${rowReset}${rowCost}`);

      if (hasPricing) {
        grandTotal += cost;
      }
    }

    // Warning if no pricing configured
    if (!hasPricing && Object.keys(config.providers ?? {}).length > 0) {
      console.log(`  (No pricing configured for this provider. Costs shown as N/A.)`);
    }
  }

  // Summary
  if (grandTotal > 0) {
    console.log(`\nTotal estimated cost: $${grandTotal.toFixed(2)}`);
  }

  if (!config.providers || Object.keys(config.providers).length === 0) {
    console.log("\nWarning: No billing configuration file found. Run 'synapse billing init' to configure pricing.");
  }
}

function printBillingStatusHelp(): void {
  console.log(`
synapse billing status -- View quota status and estimated costs

Usage:
  synapse billing status               Display quota status in grouped table format
  synapse billing status --format json  Output machine-readable JSON
  synapse billing status --help         Show this help message

The status command reads quota data from ~/.synapse/quotas/<provider>.json
and displays per-provider usage with remaining quota, reset times, and
estimated costs based on the billing configuration.

Examples:
  synapse billing status
  synapse billing status --format json

See also:
  synapse billing init        Initialize billing configuration
  synapse billing config      View or modify billing configuration
`);
}

// ---------------------------------------------------------------------------
// Flag parsing for init
// ---------------------------------------------------------------------------

interface InitFlags {
  providers: string[];
  pricingStrategy: string | undefined;
  quota: number | undefined;
  quotaPeriod: string | undefined;
  onError: string | undefined;
}

function parseInitFlags(argv: string[]): InitFlags | null {
  const flags: InitFlags = {
    providers: [],
    pricingStrategy: undefined,
    quota: undefined,
    quotaPeriod: undefined,
    onError: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printBillingHelp();
      return null;
    } else if (arg === "--provider" && argv[i + 1]) {
      flags.providers.push(argv[++i]);
    } else if (arg === "--pricing-strategy" && argv[i + 1]) {
      flags.pricingStrategy = argv[++i];
    } else if (arg === "--quota" && argv[i + 1]) {
      flags.quota = parseFloat(argv[++i]);
    } else if (arg === "--quota-period" && argv[i + 1]) {
      flags.quotaPeriod = argv[++i];
    } else if (arg === "--on-error" && argv[i + 1]) {
      flags.onError = argv[++i];
    }
  }

  // Validate flag values (T-10-05: Elevation of Privilege mitigation)
  const validStrategies = ["perToken", "perUnit", "tiered", "flat"];
  if (flags.pricingStrategy !== undefined && !validStrategies.includes(flags.pricingStrategy)) {
    console.error(`Invalid pricing strategy: '${flags.pricingStrategy}'. Use: perToken, perUnit, tiered, flat`);
    process.exit(1);
  }

  const validPeriods = ["hour", "day", "month"];
  if (flags.quotaPeriod !== undefined && !validPeriods.includes(flags.quotaPeriod)) {
    console.error(`Invalid quota period: '${flags.quotaPeriod}'. Use: hour, day, month`);
    process.exit(1);
  }

  const validOnError = ["warn", "reject"];
  if (flags.onError !== undefined && !validOnError.includes(flags.onError)) {
    console.error(`Invalid on-error strategy: '${flags.onError}'. Use: warn, reject`);
    process.exit(1);
  }

  if (flags.quota !== undefined && isNaN(flags.quota)) {
    console.error(`Invalid quota value. Must be a number.`);
    process.exit(1);
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Pricing rule display helper
// ---------------------------------------------------------------------------

function formatPricingRule(rule: {
  strategy: string;
  unit?: string;
  inputPrice?: number;
  outputPrice?: number;
  unitPrice?: number;
  costPerCall?: number;
}): string {
  return `strategy=${rule.strategy} | unit=${rule.unit ?? "N/A"} | `
    + `inputPrice=${rule.inputPrice ?? 0} outputPrice=${rule.outputPrice ?? 0} `
    + `unitPrice=${rule.unitPrice ?? 0} costPerCall=${rule.costPerCall ?? 0}`;
}

// ---------------------------------------------------------------------------
// Init: interactive provider configuration
// ---------------------------------------------------------------------------

async function configureProviderInteractive(
  question: (q: string) => Promise<string>,
  card: ProviderCard,
): Promise<{ providerId: string; config: Record<string, unknown> } | null> {
  const providerId = card.provider.id;
  const providerName = card.provider.name;
  const featureCount = card.features.length;

  console.log(`\nConfiguring ${providerName} (${providerId}) - ${featureCount} features`);

  const pricing: Record<string, object> = {};
  let configuredFeatures = 0;

  for (const feature of card.features) {
    const defaultRule = pricingFromProviderCard(feature.pricing);
    console.log(`  Feature: ${feature.id} (${feature.intent})`);
    console.log(`    Detected: ${formatPricingRule(defaultRule)}`);

    const answer = (await question("    Accept? [Y/n/custom]: ")).trim();

    if (answer === "" || answer === "Y" || answer === "y") {
      pricing[feature.id] = defaultRule;
      configuredFeatures++;
    } else if (answer === "n" || answer === "N") {
      // Skip this feature -- no billing tracking
      continue;
    } else if (answer.toLowerCase() === "custom") {
      const strategy = (await question("      Strategy (perToken/perUnit/flat): ")).trim();

      if (!["perToken", "perUnit", "flat"].includes(strategy)) {
        console.error(`      Invalid strategy '${strategy}', skipping feature.`);
        continue;
      }

      if (strategy === "perToken") {
        const inputPrice = parseFloat((await question("      Input price per 1k tokens: ")).trim()) || 0;
        const outputPrice = parseFloat((await question("      Output price per 1k tokens: ")).trim()) || 0;
        pricing[feature.id] = {
          strategy: "perToken",
          unit: "1k tokens",
          inputPrice,
          outputPrice,
        };
        configuredFeatures++;
      } else if (strategy === "perUnit") {
        const unit = (await question("      Unit name (e.g., 'per image'): ")).trim() || "per unit";
        const unitPrice = parseFloat((await question("      Price per unit: ")).trim()) || 0;
        pricing[feature.id] = {
          strategy: "perUnit",
          unit,
          unitPrice,
        };
        configuredFeatures++;
      } else if (strategy === "flat") {
        const costPerCall = parseFloat((await question("      Cost per call: ")).trim()) || 0;
        pricing[feature.id] = {
          strategy: "flat",
          unit: "per call",
          costPerCall,
        };
        configuredFeatures++;
      }
    } else {
      // Unknown input -- accept default
      pricing[feature.id] = defaultRule;
      configuredFeatures++;
    }
  }

  // No-pricing warning
  if (configuredFeatures === 0) {
    console.log(`  Warning: No pricing configured for ${providerId}. Billing will be inactive for this provider.`);
  }

  // Quota configuration
  const quotaLimit = parseFloat((await question("    Quota limit in USD (default: 10): ")).trim()) || 10;

  let quotaPeriod = (await question("    Quota period (hour/day/month, default: month): ")).trim().toLowerCase();
  if (!["hour", "day", "month"].includes(quotaPeriod)) {
    quotaPeriod = "month";
  }

  let onError = (await question("    Error handling (warn/reject, default: warn): ")).trim().toLowerCase();
  if (!["warn", "reject"].includes(onError)) {
    onError = "warn";
  }

  const quota = {
    id: `${providerId}-cost-quota`,
    type: "cost",
    limit: quotaLimit,
    used: 0,
    period: quotaPeriod,
    threshold: 0.8,
  };

  return {
    providerId,
    config: {
      pricing,
      quotas: [quota],
      onError,
    },
  };
}

// ---------------------------------------------------------------------------
// Init: non-interactive (flag-based) provider configuration
// ---------------------------------------------------------------------------

async function configureProviderNonInteractive(
  packsDir: string,
  providerId: string,
  pricingStrategyOverride: string | undefined,
  quotaLimit: number,
  quotaPeriod: string,
  onError: string,
): Promise<{ providerId: string; config: Record<string, unknown> }> {
  const card = await loadProviderCard(packsDir, providerId);
  if (!card) {
    console.error(`Error: Provider card not found for '${providerId}'`);
    process.exit(1);
  }

  const pricing: Record<string, object> = {};
  for (const feature of card.features) {
    const rule = pricingFromProviderCard(feature.pricing);
    if (pricingStrategyOverride) {
      pricing[feature.id] = { ...rule, strategy: pricingStrategyOverride };
    } else {
      pricing[feature.id] = rule;
    }
  }

  const quota = {
    id: `${providerId}-cost-quota`,
    type: "cost",
    limit: quotaLimit,
    used: 0,
    period: quotaPeriod,
    threshold: 0.8,
  };

  return {
    providerId,
    config: {
      pricing,
      quotas: [quota],
      onError,
    },
  };
}

// ---------------------------------------------------------------------------
// Init handler
// ---------------------------------------------------------------------------

async function handleBillingInit(argv: string[]): Promise<void> {
  const flags = parseInitFlags(argv);
  if (!flags) return; // --help was shown

  const packsDir = await findPacksDir();
  const configuredProviders: Array<{ id: string; config: Record<string, unknown> }> = [];

  if (flags.providers.length > 0) {
    // Non-interactive mode (--provider flag given)
    const quotaLimit = flags.quota ?? 10;
    const quotaPeriod = flags.quotaPeriod ?? "month";
    const onError = flags.onError ?? "warn";

    for (const providerId of flags.providers) {
      const result = await configureProviderNonInteractive(
        packsDir,
        providerId,
        flags.pricingStrategy,
        quotaLimit,
        quotaPeriod,
        onError,
      );
      configuredProviders.push({ id: result.providerId, config: result.config });
    }
  } else {
    // Interactive wizard
    const installed = await listInstalledProviders(packsDir);

    if (installed.length === 0) {
      console.error("No provider packs found. Run 'synapse pack add <provider>' first.");
      process.exit(1);
    }

    console.log("\nAvailable providers:");
    for (let i = 0; i < installed.length; i++) {
      console.log(`  ${i + 1}. ${installed[i].name} (${installed[i].id})`);
    }
    console.log(`  ${installed.length + 1}. All providers`);

    const prompter = await createPrompter();
    try {
      const selectionStr = await prompter.question("Select provider (enter number): ");
      const selection = parseInt(selectionStr.trim(), 10);

      let selectedProviders: Array<{ id: string; name: string }>;
      if (isNaN(selection) || selection === installed.length + 1) {
        // Last option or invalid = all providers
        selectedProviders = installed;
      } else if (selection >= 1 && selection <= installed.length) {
        selectedProviders = [installed[selection - 1]];
      } else {
        console.error("Invalid selection.");
        process.exit(1);
      }

      for (const provider of selectedProviders) {
        const card = await loadProviderCard(packsDir, provider.id);
        if (!card) {
          console.error(`Error: Provider card not found for '${provider.id}'`);
          process.exit(1);
        }

        const result = await configureProviderInteractive(prompter.question, card);
        if (result) {
          configuredProviders.push({ id: result.providerId, config: result.config });
        }
      }
    } finally {
      prompter.close();
    }
  }

  // Build and write billing-config.json
  const config = await loadBillingConfig();
  for (const cp of configuredProviders) {
    config.providers[cp.id] = cp.config as { pricing: Record<string, object>; quotas: object[]; onError: string; };
  }

  await saveBillingConfig(config);

  // Completion summary
  console.log(`\n✓ Billing configuration saved to ~/.synapse/billing-config.json`);

  console.log("\nConfigured providers:");
  for (const cp of configuredProviders) {
    const featCount = Object.keys((cp.config as Record<string, unknown>).pricing as Record<string, unknown>).length;
    console.log(`  ${cp.id} (${featCount} features)`);
  }

  console.log("\nNext steps:");
  console.log(`  synapse billing status  -- View quota usage`);
  console.log(`  synapse connect ...     -- Connector auto-wraps with billing`);
}

// ---------------------------------------------------------------------------
// Main billing command dispatcher
// ---------------------------------------------------------------------------

export async function handleBillingCommand(argv: string[]): Promise<void> {
  const subcommand = argv[0] || "help";

  switch (subcommand) {
    case "init":
      await handleBillingInit(argv.slice(1));
      break;
    case "config":
      await handleBillingConfig(argv.slice(1));
      break;
    case "status":
      await handleBillingStatus(argv.slice(1));
      break;
    case "--help":
    case "-h":
    default:
      printBillingHelp();
  }
}
