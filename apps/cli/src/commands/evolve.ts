// @synapse-router/cli — `synapse evolve` command
// Reads all provider packs → generates zero-dependency SDK

import { generateSdk } from "@synapse-router/sdk-generator";
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolveOptions {
  providers?: string[];
  outDir: string;
  dryRun: boolean;
  force: boolean;
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

Description:
  Reads provider packs from built-in packs/ and ~/.synapse/packs/, then
  generates a zero-dependency TypeScript SDK for each provider into the
  output directory. The generated SDK uses native fetch only — no LLM,
  no @synapse-router dependencies, no network dependencies beyond provider APIs.

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
    lines.push(`export * from './${result.provider}/index.js';`);
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
  const allPacks = await getAllPacks();

  if (allPacks.length === 0) {
    console.error("Error: No provider packs found.");
    console.error("Install packs with: synapse pack add <provider>");
    console.error("Or place provider packs in: ./packs/ or ~/.synapse/packs/");
    process.exit(1);
  }

  // Filter by --provider if specified
  const targetPacks = options.providers
    ? allPacks.filter((p) => options.providers!.includes(p.id))
    : allPacks;

  if (targetPacks.length === 0) {
    console.error(
      `Error: No matching providers. Available: ${allPacks.map((p) => p.id).join(", ")}`,
    );
    process.exit(1);
  }

  // Header
  if (!options.dryRun) {
    console.log(`\nSynapse Evolve — Generating SDK`);
    console.log(`  Output:   ${outDir}`);
  } else {
    console.log(`\nSynapse Evolve — Preview (dry-run)`);
    console.log(`  Output:   ${outDir} (not written)`);
  }
  console.log(`  Providers: ${targetPacks.map((p) => p.id).join(", ")}`);
  console.log("");

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

  // Write top-level files
  if (!options.dryRun) {
    const successResults = results.filter((r) => !r.error);
    if (successResults.length > 0) {
      await writeTopLevelTsconfig(outDir);
      await writeSynapseJson(outDir, results);
      await writeTopLevelIndex(outDir, results);
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
  }
  if (failCount > 0) {
    console.log(`${failCount} provider(s) failed (see errors above)`);
    process.exit(1);
  }
}
