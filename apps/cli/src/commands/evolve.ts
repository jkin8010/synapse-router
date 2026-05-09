// @synapse-router/cli — `synapse evolve` command
// Reads all provider packs → generates zero-dependency SDK

import { generateSdk } from "@synapse-router/sdk-generator";
import { createRegistryClient, installPack } from "@synapse-router/registry-client";
import type { PackDetail } from "@synapse-router/registry-client";
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { loadAllProfiles, ProviderProfile } from "./profile.js";
import {
  tuneStrategies,
  formatTuneReportAsJson,
  formatTuneReportAsText,
  type StrategyTuneReport,
} from "./tune.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolveOptions {
  providers?: string[];
  outDir: string;
  dryRun: boolean;
  force: boolean;
  withProfile: boolean;
  tune: boolean;
  fromRegistry: boolean;
  yes: boolean;
  registryUrl?: string;
}

interface RegistryUpdate {
  provider: string;
  localVersion: string;
  remoteVersion: string;
  isBreaking: boolean;
}

interface PackEntry {
  id: string;
  dir: string;
  source: "builtin" | "registry" | "local";
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printEvolveHelp(): void {
  console.log(`
synapse evolve — Generate zero-dependency SDK from all installed Provider Packs

Usage:
  synapse evolve [options]

Options:
  --out-dir <path>      SDK output directory (default: ./synapse-sdk)
  --provider <names>    Comma-separated provider IDs to include (default: all)
  --dry-run             Preview changes without writing files
  --force               Regenerate even if no provider changes detected
  --with-profile        Read .synapse/profiles/ to inform SDK generation
  --tune                Tune strategy weights from production profile data
  --from-registry       Check registry for newer pack versions before generation
  --registry-url <url>  Registry URL (implies --from-registry, overrides config/env)
  --yes, -y             Non-interactive mode (auto-confirm downloads)

Description:
  Reads provider packs from built-in packs/ and ~/.synapse/packs/, then
  generates a zero-dependency TypeScript SDK for each provider into the
  output directory. The generated SDK uses native fetch only — no LLM,
  no @synapse-router dependencies, no network dependencies beyond provider APIs.

  With --with-profile, evolve reads production profiles from .synapse/profiles/
  and includes them in the SDK output as genesis.json with per-provider stats,
  success rates, and latency data. This enables development-time visibility
  into production runtime behavior.

Evolve Workflow:
  1. Production SDK generates events -> .synapse/watchdog/events.ndjson
  2. synapse profile refresh  -> aggregates events into .synapse/profiles/*.json
  3. synapse export           -> packages .synapse/ as tar.gz for dev transfer
  4. synapse import           -> restores .synapse/ in dev environment (via git or pipe)
  5. synapse evolve --with-profile  -> reads profiles, generates SDK + genesis.json
  6. Test -> deploy the new SDK
  7. Repeat -- production data loops back to improve every evolve cycle

  All complexity lives at development time. The generated SDK remains
  pure zero-dependency code with no runtime Router or LLM dependency.

Output structure:
  <out-dir>/
  ├── openai/
  │   ├── index.ts           # Exports client + types
  │   ├── client.ts          # HTTP client (zero-dependency)
  │   ├── types.ts           # Type definitions
  │   ├── <feature>.ts       # Per-feature type files
  │   └── README.md
  ├── replicate/
  │   └── ...
  ├── genesis.json           # Profile-informed metadata (with --with-profile)
  ├── synapse.json           # Generation metadata
  └── tsconfig.json          # TypeScript config

Examples:
  # Generate SDK for all providers
  synapse evolve

  # Generate only for openai and replicate
  synapse evolve --provider openai,replicate

  # Preview without writing
  synapse evolve --dry-run

  # Custom output directory
  synapse evolve --out-dir ./my-sdk

  # Include production profiles in SDK output
  synapse evolve --with-profile
`);
}

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

export function parseEvolveArgs(argv: string[]): EvolveOptions {
  const options: EvolveOptions = {
    outDir: "./synapse-sdk",
    dryRun: false,
    force: false,
    withProfile: false,
    tune: false,
    fromRegistry: false,
    yes: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir" && argv[i + 1]) {
      options.outDir = argv[++i];
    } else if (arg === "--provider" && argv[i + 1]) {
      options.providers = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--with-profile") {
      options.withProfile = true;
    } else if (arg === "--from-registry") {
      options.fromRegistry = true;
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--tune") {
      options.tune = true;
    } else if (arg === "--registry-url" && argv[i + 1]) {
      options.registryUrl = argv[++i];
      options.fromRegistry = true; // --registry-url implies --from-registry
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Pack discovery
// ---------------------------------------------------------------------------

async function findBuiltinPacksDir(): Promise<string | null> {
  // Try to find built-in packs relative to the CLI package
  const cwd = process.cwd();
  // In dev mode: packages are at <root>/packs/
  const devPath = join(cwd, "packs");
  try {
    await readdir(devPath);
    return devPath;
  } catch { /* ignore */ }

  // In installed mode: try relative to node_modules
  try {
    const { fileURLToPath } = await import("node:url");
    const cliDir = fileURLToPath(import.meta.url);
    // apps/cli/src/commands/evolve.ts → ../../../packs
    const packsFromCli = join(cliDir, "..", "..", "..", "..", "packs");
    await readdir(packsFromCli);
    return packsFromCli;
  } catch { /* ignore */ }

  return null;
}

async function discoverPacks(dir: string, source: "builtin" | "registry" | "local"): Promise<PackEntry[]> {
  const entries: PackEntry[] = [];
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const entry of dirents) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const cardPath = join(dir, entry.name, "provider-card.json");
    try {
      const content = await readFile(cardPath, "utf8");
      const card = JSON.parse(content);
      if (card.provider?.id) {
        entries.push({ id: card.provider.id, dir: join(dir, entry.name), source });
      }
    } catch { /* skip */ }
  }
  return entries;
}

async function getAllPacks(): Promise<PackEntry[]> {
  const allPacks = new Map<string, PackEntry>();

  // Priority (low to high): builtin < registry < local
  const builtinDir = await findBuiltinPacksDir();
  if (builtinDir) {
    for (const p of await discoverPacks(builtinDir, "builtin")) {
      allPacks.set(p.id, p);
    }
  }

  const registryDir = join(homedir(), ".synapse", "packs");
  for (const p of await discoverPacks(registryDir, "registry")) {
    allPacks.set(p.id, p);
  }

  const localDir = join(process.cwd(), "synapse-packs");
  for (const p of await discoverPacks(localDir, "local")) {
    allPacks.set(p.id, p);
  }

  return [...allPacks.values()];
}

// ---------------------------------------------------------------------------
// Registry update check
// ---------------------------------------------------------------------------

async function resolveRegistryUrl(options: EvolveOptions): Promise<string | null> {
  // Priority: --registry-url flag > config.json > SYNAPSE_REGISTRY_URL env
  if (options.registryUrl) return options.registryUrl;

  const configPath = join(homedir(), ".synapse", "config.json");
  try {
    const content = await readFile(configPath, "utf8");
    const config = JSON.parse(content);
    if (config.registry?.url) return config.registry.url;
  } catch { /* no config */ }

  return process.env["SYNAPSE_REGISTRY_URL"] ?? null;
}

async function checkRegistryUpdates(
  packs: PackEntry[],
  registryUrl: string,
): Promise<RegistryUpdate[]> {
  const client = createRegistryClient({ registryUrl });
  const updates: RegistryUpdate[] = [];

  for (const pack of packs) {
    try {
      const cardPath = join(pack.dir, "provider-card.json");
      const card = JSON.parse(await readFile(cardPath, "utf8"));
      const localVersion = card.service?.version;
      if (!localVersion) continue;

      const detail: PackDetail = await client.getPack("official", pack.id);

      if (detail.version !== localVersion) {
        const isBreaking =
          detail.versions?.some(
            (v) =>
              v.version === detail.version &&
              v.changelog?.toLowerCase().includes("breaking"),
          ) ?? false;

        updates.push({
          provider: pack.id,
          localVersion,
          remoteVersion: detail.version,
          isBreaking,
        });
      }
    } catch {
      // Skip packs that can't be checked against registry
    }
  }

  return updates;
}

async function confirmDownloads(
  updates: RegistryUpdate[],
  yes: boolean,
): Promise<boolean> {
  if (updates.length === 0) return false;

  console.log(`\n  Pack updates available:`);
  for (const u of updates) {
    const tag = u.isBreaking ? " ⚠ breaking" : " ✅ compatible";
    console.log(
      `    ${u.provider.padEnd(16)} ${u.localVersion} → ${u.remoteVersion}${tag}`,
    );
  }

  if (yes) return true;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(
      `\n  Download and update ${updates.length} pack(s)? [Y/n] `,
      resolve,
    );
  });
  rl.close();

  return answer.trim().toLowerCase() !== "n";
}

async function downloadRegistryUpdates(
  updates: RegistryUpdate[],
  registryUrl: string,
): Promise<void> {
  const client = createRegistryClient({ registryUrl });

  for (const u of updates) {
    process.stdout.write(`  Downloading ${u.provider}@${u.remoteVersion}... `);
    try {
      await installPack(client, `@official/${u.provider}@${u.remoteVersion}`);
      console.log("✓");
    } catch (err: any) {
      console.log(`✗ ${err?.message ?? "download failed"}`);
    }
  }
}

// ---------------------------------------------------------------------------
// SDK generation
// ---------------------------------------------------------------------------

interface EvolveResult {
  provider: string;
  files: string[];
  features: number;
  error?: string;
}

async function evolveProvider(
  pack: PackEntry,
  outDir: string,
  dryRun: boolean,
): Promise<EvolveResult> {
  const providerOutDir = join(outDir, pack.id);

  if (dryRun) {
    // Just read the card to count features
    const cardPath = join(pack.dir, "provider-card.json");
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    const features = card.features?.length ?? 0;
    return { provider: pack.id, files: [], features };
  }

  try {
    const result = await generateSdk({
      packDir: pack.dir,
      lang: "typescript",
      outputDir: providerOutDir,
    });

    // Remove per-provider package.json and tsconfig.json (we use top-level ones)
    try { await rm(join(providerOutDir, "package.json"), { force: true }); } catch { /* ok */ }
    try { await rm(join(providerOutDir, "tsconfig.json"), { force: true }); } catch { /* ok */ }

    return {
      provider: result.provider,
      files: result.files.filter((f) => f.path !== "package.json" && f.path !== "tsconfig.json").map((f) => f.path),
      features: result.features,
    };
  } catch (err: any) {
    return {
      provider: pack.id,
      files: [],
      features: 0,
      error: err?.message ?? String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Top-level files
// ---------------------------------------------------------------------------

async function writeSynapseJson(
  outDir: string,
  results: EvolveResult[],
): Promise<void> {
  const meta = {
    generated_at: new Date().toISOString(),
    version: "0.1.0",
    generator: "@synapse-router/sdk-generator",
    providers: results
      .filter((r) => !r.error)
      .map((r) => ({
        id: r.provider,
        features: r.features,
      })),
  };

  const content = JSON.stringify(meta, null, 2) + "\n";
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "synapse.json"), content, "utf8");
}

async function writeGenesisJson(
  outDir: string,
  profiles: ProviderProfile[],
): Promise<void> {
  const genesis = {
    generated_at: new Date().toISOString(),
    source: ".synapse/profiles/",
    description: "Production profile data that informed this SDK generation",
    providers: profiles.map((p) => ({
      id: p.provider,
      sample_count: p.sample_count,
      success_rate: Math.round(p.success_rate * 10000) / 100,
      latency_ms: {
        p50: p.latency_ms.p50,
        p95: p.latency_ms.p95,
      },
      cost_per_1k: p.cost_per_1k,
      features: Object.entries(p.features).map(([name, fp]) => ({
        name,
        sample_count: fp.sample_count,
        success_rate: Math.round(fp.success_rate * 10000) / 100,
        latency_p50: fp.latency_p50,
      })),
      error_rates: Object.fromEntries(
        Object.entries(p.error_breakdown).map(([code, rate]) => [code, Math.round(rate * 10000) / 100]),
      ),
    })),
  };

  const content = JSON.stringify(genesis, null, 2) + "\n";
  await writeFile(join(outDir, "genesis.json"), content, "utf8");
}

async function writeTopLevelTsconfig(outDir: string): Promise<void> {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      declaration: true,
      sourceMap: true,
      outDir: "./dist",
      rootDir: ".",
    },
    include: ["**/*.ts"],
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "tsconfig.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
}

async function writeTopLevelIndex(
  outDir: string,
  results: EvolveResult[],
): Promise<void> {
  const lines: string[] = [];
  lines.push("// Auto-generated by @synapse-router/sdk-generator");
  lines.push("// Zero-dependency SDK for all providers");
  lines.push("");

  for (const result of results) {
    if (result.error) continue;
    lines.push(`// ${result.provider}`);
    lines.push(`export * as ${result.provider} from './${result.provider}/index.js';`);
  }

  lines.push("");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.ts"), lines.join("\n"), "utf8");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleEvolveCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printEvolveHelp();
    return;
  }

  const options = parseEvolveArgs(argv);
  const outDir = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(process.cwd(), options.outDir);

  // Discover packs
  let allPacks = await getAllPacks();

  if (allPacks.length === 0) {
    console.error("Error: No provider packs found.");
    console.error("Install packs with: synapse pack add <provider>");
    console.error("Or place provider packs in: ./packs/ or ~/.synapse/packs/");
    process.exit(1);
  }

  // Filter by --provider if specified
  let targetPacks = options.providers
    ? allPacks.filter((p) => options.providers!.includes(p.id))
    : allPacks;

  if (targetPacks.length === 0) {
    console.error(
      `Error: No matching providers. Available: ${allPacks.map((p) => p.id).join(", ")}`,
    );
    process.exit(1);
  }

  // Registry update check
  if (options.fromRegistry) {
    const registryUrl = await resolveRegistryUrl(options);

    if (registryUrl) {
      console.log(`\n  Registry: ${registryUrl}`);
      const updates = await checkRegistryUpdates(targetPacks, registryUrl);

      if (updates.length > 0) {
        const shouldDownload = await confirmDownloads(updates, options.yes);
        if (shouldDownload) {
          await downloadRegistryUpdates(updates, registryUrl);
          // Rediscover packs after downloads (registry source overrides builtin)
          allPacks = await getAllPacks();
          targetPacks = options.providers
            ? allPacks.filter((p) => options.providers!.includes(p.id))
            : allPacks;
          console.log("");
        } else {
          console.log("  Skipped.\n");
        }
      } else {
        console.log("  All packs up to date.\n");
      }
    } else {
      console.log(
        "\n  Registry not configured. Use --registry-url or SYNAPSE_REGISTRY_URL.\n",
      );
    }
  }

  // Load profiles if --with-profile
  let profiles: ProviderProfile[] = [];
  if (options.withProfile) {
    profiles = await loadAllProfiles();
  }

  // Header
  if (options.dryRun) {
    console.log(`\nSynapse Evolve — Preview (dry-run)`);
    console.log(`  Output:   ${outDir} (not written)`);
  } else {
    console.log(`\nSynapse Evolve — Generating SDK`);
    console.log(`  Output:   ${outDir}`);
  }
  console.log(`  Providers: ${targetPacks.map((p) => p.id).join(", ")}`);
  if (options.withProfile) {
    console.log(`  Profiles:  ${profiles.length > 0 ? `${profiles.length} provider(s) loaded from .synapse/profiles/` : "none found"}`);
  }
  console.log("");

  // Profile summary
  if (options.withProfile && profiles.length > 0) {
    console.log("  Production data:");
    for (const p of profiles) {
      const rate = (p.success_rate * 100).toFixed(1);
      console.log(`    ${p.provider.padEnd(18)} ${String(p.sample_count).padStart(6)} samples  ${rate}% success  p50=${p.latency_ms.p50}ms  p95=${p.latency_ms.p95}ms`);
    }
    console.log("");
  }

  // Generate for each provider
  const results: EvolveResult[] = [];
  for (const pack of targetPacks) {
    const label = options.dryRun ? "Preview" : "Generate";
    process.stdout.write(`  ${label} ${pack.id}... `);

    const result = await evolveProvider(pack, outDir, options.dryRun);
    results.push(result);

    if (result.error) {
      console.log(`✗ ${result.error}`);
    } else if (options.dryRun) {
      console.log(`${result.features} feature(s)`);
    } else {
      console.log(`${result.features} feature(s) → ${result.files.length} file(s)`);
    }
  }

  // Strategy weight tuning (--tune) — declare early for both write block and tune block
  let tuneReports: StrategyTuneReport[] = [];

  // Write top-level files
  if (!options.dryRun) {
    const successResults = results.filter((r) => !r.error);
    if (successResults.length > 0) {
      await writeTopLevelTsconfig(outDir);
      await writeSynapseJson(outDir, results);
      await writeTopLevelIndex(outDir, results);
      if (options.withProfile && profiles.length > 0) {
        await writeGenesisJson(outDir, profiles);
      }
      // Write tuning reports (after tune block completes)
      if (tuneReports.length > 0) {
        const jsonContent = formatTuneReportAsJson(tuneReports);
        await writeFile(join(outDir, "strategies.json"), jsonContent, "utf8");
        const mdContent = formatTuneReportAsText(tuneReports);
        await writeFile(join(outDir, "STRATEGIES.md"), mdContent, "utf8");
      }
    }
  }

  // Strategy weight tuning (--tune)
  if (options.tune) {
    if (profiles.length === 0) {
      console.log("\n  ⚠ No profile data found. Run 'synapse profile refresh' first or use --with-profile.");
    } else {
      console.log("\n  Tuning strategy weights from production data...");
      tuneReports = tuneStrategies(profiles);
      console.log(`  Evaluated ${profiles.length} provider(s) across ${tuneReports.length} strategy/strategies`);
      for (const report of tuneReports) {
        const biasCounts = {
          match: report.findings.filter((f) => f.bias === "match").length,
          under: report.findings.filter((f) => f.bias === "under").length,
          over: report.findings.filter((f) => f.bias === "over").length,
        };
        console.log(`    ${report.strategy.padEnd(16)} ${biasCounts.match} match  ${biasCounts.under} under  ${biasCounts.over} over`);
      }
    }
  }

  // Summary
  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;
  const totalFeatures = results
    .filter((r) => !r.error)
    .reduce((sum, r) => sum + r.features, 0);

  console.log("");
  if (options.dryRun) {
    console.log(
      `Preview: ${successCount} provider(s) with ${totalFeatures} feature(s) would be generated`,
    );
  } else {
    console.log(
      `Done: ${successCount} provider(s), ${totalFeatures} feature(s) → ${outDir}`,
    );
    if (options.withProfile && profiles.length > 0) {
      console.log(`Profile metadata: genesis.json written to ${outDir}`);
    }
  }
  if (failCount > 0) {
    console.log(`${failCount} provider(s) failed (see errors above)`);
    process.exit(1);
  }
}
