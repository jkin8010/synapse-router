// @synapse-router/cli -- `synapse billing` command
// Manage billing configuration and quota status

import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { pricingFromProviderCard } from "@synapse-router/billing";

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
  const cardPath = join(packsDir, providerId, "provider-card.json");
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
// Skeleton handlers (extended in Plan 10-02)
// ---------------------------------------------------------------------------

async function handleBillingConfig(_argv: string[]): Promise<void> {
  console.log("billing config: coming soon");
  process.exit(0);
}

async function handleBillingStatus(_argv: string[]): Promise<void> {
  console.log("billing status: coming soon");
  process.exit(0);
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
  const configPath = join(homedir(), ".synapse", "billing-config.json");
  const billingConfig: { version: string; providers: Record<string, unknown> } = {
    version: "1",
    providers: {},
  };

  for (const cp of configuredProviders) {
    billingConfig.providers[cp.id] = cp.config;
  }

  await mkdir(join(homedir(), ".synapse"), { recursive: true });
  await writeFile(configPath, JSON.stringify(billingConfig, null, 2) + "\n", "utf8");

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
