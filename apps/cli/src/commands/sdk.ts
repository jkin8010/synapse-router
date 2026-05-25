// @synapse-router/cli — `synapse sdk` command
// Generate SDKs from Provider Packs

import { generateSdk } from "@synapse-router/sdk-generator";
import { HELP_SDK } from "../utils/help.js";
import { readFile } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const USER_PACKS_DIR = join(homedir(), ".synapse", "packs");
const LOCAL_PACKS_DIR = () => join(process.cwd(), ".synapse", "packs");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SdkCommandOptions {
  pack?: string;
  lang?: "typescript" | "python";
  output?: string;
  provider?: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printSdkHelp(): void {
  console.log(HELP_SDK);
}

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

export function parseSdkArgs(argv: string[]): { subcommand: string; options: SdkCommandOptions } {
  const subcommand = argv[0] ?? "";
  const options: SdkCommandOptions = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pack" && argv[i + 1]) {
      options.pack = argv[++i];
    } else if (arg === "--lang" && argv[i + 1]) {
      const lang = argv[++i];
      if (lang !== "typescript" && lang !== "python") {
        console.error(`Error: Unsupported language "${lang}". Use: typescript | python`);
        process.exit(1);
      }
      options.lang = lang;
    } else if (arg === "--output" && argv[i + 1]) {
      options.output = argv[++i];
    } else if (arg === "--provider" && argv[i + 1]) {
      options.provider = argv[++i];
    } else if (arg === "--base-url" && argv[i + 1]) {
      options.baseUrl = argv[++i];
    }
  }

  return { subcommand, options };
}

// ---------------------------------------------------------------------------
// Resolve pack directory
// ---------------------------------------------------------------------------

async function findPacksDir(): Promise<string> {
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(import.meta.url);
  if (dir.includes("/dist/")) {
    return join(dirname(dirname(dirname(dirname(dirname(dir))))), "packs");
  } else {
    return join(dirname(dirname(dirname(dirname(dir)))), "packs");
  }
}

async function resolvePackDir(packId: string): Promise<string> {
  // If it's an absolute or relative path that exists, use it directly
  if (packId.startsWith("/") || packId.startsWith("./") || packId.startsWith("../")) {
    const absPath = isAbsolute(packId) ? packId : resolve(process.cwd(), packId);
    try {
      await readFile(join(absPath, "provider-card.json"), "utf8");
      return absPath;
    } catch {
      throw new Error(`Pack directory not found: ${absPath}`);
    }
  }

  // Search priority: built-in packs/ > local ./synapse-packs/ > ~/.synapse/packs/
  const packsDir = await findPacksDir();
  for (const baseDir of [packsDir, LOCAL_PACKS_DIR(), USER_PACKS_DIR]) {
    // Try namespaced format: "aliyun/qwen-image-edit" → dir/aliyun__qwen-image-edit/
    const dirname = packId.includes("/") ? packId.replace("/", "__") : packId;
    const packDir = join(baseDir, dirname);
    try {
      await readFile(join(packDir, "provider-card.json"), "utf8");
      return packDir;
    } catch { /* try flat fallback */ }

    // Fallback: try flat format (backward compat)
    const flatName = packId.includes("/") ? packId.split("/")[1] : packId;
    const flatDir = join(baseDir, flatName);
    try {
      await readFile(join(flatDir, "provider-card.json"), "utf8");
      return flatDir;
    } catch { /* try next dir */ }
  }

  throw new Error(
    `Pack "${packId}" not found in ${packsDir} or ${USER_PACKS_DIR}. ` +
    `Install it first with: synapse pack add ${packId}`
  );
}

// ---------------------------------------------------------------------------
// Handle `synapse sdk generate` command
// ---------------------------------------------------------------------------

async function handleSdkGenerate(options: SdkCommandOptions): Promise<void> {
  if (!options.pack) {
    console.error("Error: --pack is required. Specify a pack ID (e.g. openai) or path.");
    console.error("Run 'synapse sdk --help' for usage.");
    process.exit(1);
  }

  if (!options.lang) {
    console.error("Error: --lang is required. Specify: typescript | python");
    process.exit(1);
  }

  if (!options.output) {
    console.error("Error: --output is required. Specify the output directory.");
    process.exit(1);
  }

  const packDir = await resolvePackDir(options.pack);
  const outputDir = isAbsolute(options.output) ? options.output : resolve(process.cwd(), options.output);

  console.log(`\n🔧 Synapse SDK Generator\n`);
  console.log(`  Pack:     ${options.pack}`);
  console.log(`  Language: ${options.lang}`);
  console.log(`  Output:   ${outputDir}`);
  if (options.provider) console.log(`  Provider: ${options.provider}`);
  if (options.baseUrl) console.log(`  Base URL: ${options.baseUrl}`);
  console.log("");

  try {
    const result = await generateSdk({
      packDir,
      lang: options.lang,
      outputDir,
      providerOverride: options.provider,
      baseUrlOverride: options.baseUrl,
    });

    console.log(`✅ Generated ${result.features} feature(s) → ${result.files.length} file(s)`);
    console.log("");
    for (const file of result.files) {
      console.log(`   ${file.path}`);
    }
    console.log("");
    console.log(`Provider: ${result.provider}`);
  } catch (err: any) {
    console.error(`Error: ${err?.message ?? err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleSdkCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printSdkHelp();
    return;
  }

  const { subcommand, options } = parseSdkArgs(argv);

  switch (subcommand) {
    case "generate":
      await handleSdkGenerate(options);
      break;
    default:
      printSdkHelp();
      break;
  }
}
