// @synapse-router/cli — `synapse setup` command
// Interactive first-time setup wizard

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createVault } from "@synapse-router/vault";
import { loadMergedConfig, saveGlobalConfig } from "../utils/config.js";
import { promptSelect, promptInput, promptPassword } from "../utils/prompts.js";
import { HELP_SETUP } from "../utils/help.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  pack: string;
  authType: "Bearer" | "APIKey" | "OAuth2";
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    pack: "openai",
    authType: "Bearer",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    pack: "openai",
    authType: "Bearer",
  },
  {
    id: "moonshot",
    name: "Moonshot (月之暗面)",
    baseUrl: "https://api.moonshot.cn/v1",
    pack: "openai",
    authType: "Bearer",
  },
  {
    id: "replicate",
    name: "Replicate",
    baseUrl: "https://api.replicate.com/v1",
    pack: "replicate",
    authType: "Bearer",
  },
  {
    id: "stability",
    name: "Stability AI",
    baseUrl: "https://api.stability.ai/v1",
    pack: "stability",
    authType: "Bearer",
  },
];


// ---------------------------------------------------------------------------
// Load available packs from packs directory
// ---------------------------------------------------------------------------

async function listPacks(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  let packsDir: string;
  try {
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(import.meta.url);
    if (dir.includes("/dist/")) {
      packsDir = join(dirname(dirname(dirname(dirname(dir)))), "packs");
    } else {
      packsDir = join(dirname(dirname(dirname(dir))), "packs");
    }
  } catch {
    packsDir = join(process.cwd(), "packs");
  }

  try {
    const entries = await readdir(packsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const SYNAPSE_DIR = join(homedir(), ".synapse");
const CONFIG_PATH = join(SYNAPSE_DIR, "config.json");

interface SynapseConfig {
  providers?: Record<string, {
    base_url?: string;
    pack?: string;
    auth_type?: string;
  }>;
  defaults?: Record<string, string>;
}

async function loadConfig(): Promise<SynapseConfig> {
  return loadMergedConfig() as Promise<SynapseConfig>;
}

async function saveConfig(config: SynapseConfig): Promise<void> {
  await saveGlobalConfig(config as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Setup help
// ---------------------------------------------------------------------------

export function printSetupHelp(): void {
  console.log(HELP_SETUP);
}

// ---------------------------------------------------------------------------
// Main setup handler
// ---------------------------------------------------------------------------

/**
 * Scaffold an SDK project (formerly `synapse init`).
 *
 * `synapse init` was merged into `synapse setup`; the SDK project scaffolding it
 * performed lives here so `setup --sdk` keeps that capability.
 */
async function scaffoldSdkProject(options: {
  provider?: string;
  outDir: string;
  withCicd: boolean;
}): Promise<void> {
  const outDir = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(process.cwd(), options.outDir);
  const configPath = resolve(process.cwd(), "synapse.json");

  console.log("\nSynapse Setup — SDK project scaffolding");
  console.log(`  SDK output:  ${outDir}`);
  if (options.provider) console.log(`  Provider:    ${options.provider}`);
  if (options.withCicd) console.log(`  CI/CD:       .github/workflows/synapse-sdk.yml`);
  console.log("");

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, ".gitkeep"), "", "utf8");

  const readme = `# Synapse SDK

Auto-generated zero-dependency TypeScript SDK for provider APIs.

## Regenerate

\`\`\`bash
synapse sdk generate --pack openai --lang typescript --output ${options.outDir}
\`\`\`
`;
  await writeFile(join(outDir, "README.md"), readme, "utf8");

  const config: Record<string, unknown> = {
    version: "0.1.0",
    sdk_output_dir: options.outDir,
    generated_at: new Date().toISOString(),
  };
  if (options.provider) config.default_provider = options.provider;
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  if (options.withCicd) {
    const githubDir = join(process.cwd(), ".github", "workflows");
    await mkdir(githubDir, { recursive: true });
    await writeFile(
      join(githubDir, "synapse-sdk.yml"),
      [
        "# Auto-generated by synapse setup --sdk --with-cicd",
        "name: Synapse SDK Generation",
        "",
        "on:",
        "  schedule:",
        "    - cron: '0 6 * * 1'",
        "  workflow_dispatch:",
        "",
        "jobs:",
        "  generate-sdk:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: 22",
        "      - run: npm install -g pnpm && pnpm install",
        `      - run: npx synapse sdk generate --pack openai --lang typescript --output ${options.outDir}`,
        "",
      ].join("\n"),
      "utf8",
    );
  }

  console.log(`Created: ${outDir}/`);
  console.log(`  README.md`);
  console.log(`  synapse.json${options.withCicd ? "\n  .github/workflows/synapse-sdk.yml" : ""}`);
  console.log("");
}

export async function handleSetupCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printSetupHelp();
    return;
  }

  // Non-interactive SDK project scaffolding (formerly `synapse init`)
  const sdkIdx = argv.indexOf("--sdk");
  if (sdkIdx !== -1) {
    let outDir = "./synapse-sdk";
    let provider: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--out-dir" && argv[i + 1]) outDir = argv[++i];
      else if (argv[i] === "--provider" && argv[i + 1]) provider = argv[++i];
    }
    await scaffoldSdkProject({
      provider,
      outDir,
      withCicd: argv.includes("--with-cicd"),
    });
    return;
  }

  console.log("\n🎯 Synapse Router Setup\n");

  // Step 1: Choose provider
  const presetLabels = PROVIDER_PRESETS.map((p) => `${p.name}`);
  const availablePacks = await listPacks();
  const allOptions = [...presetLabels];
  if (availablePacks.length > 0) {
    allOptions.push("More from installed packs...");
  }
  allOptions.push("Custom provider...");

  const selectedIndex = await promptSelect<number>(
    "Step 1: Choose a provider",
    allOptions.map((label, i) => ({ name: label, value: i })),
    { defaultIndex: 0 }
  );

  let preset: ProviderPreset;

  if (selectedIndex < PROVIDER_PRESETS.length) {
    preset = PROVIDER_PRESETS[selectedIndex];
  } else if (allOptions[selectedIndex] === "More from installed packs...") {
    // Show pack-based providers
    const packOptions = availablePacks.map((p) => p);
    const packIdx = await promptSelect<number>(
      "Select from installed packs:",
      packOptions.map((name, i) => ({ name, value: i })),
      { defaultIndex: 0 }
    );
    const packId = availablePacks[packIdx];
    preset = {
      id: packId,
      name: packId,
      baseUrl: `https://api.${packId}.com/v1`,
      pack: packId,
      authType: "Bearer",
    };
  } else {
    // Custom provider
    const customId = await promptInput("  Provider ID: ");
    const customName = await promptInput("  Provider name: ");
    preset = {
      id: customId || "custom",
      name: customName || customId || "Custom",
      baseUrl: `https://api.${customId || "custom"}.com/v1`,
      pack: "openai",
      authType: "Bearer",
    };
  }

  console.log(`\n  Selected: ${preset.name} (${preset.id})`);

  // Step 2: Enter API key
  const apiKey = await promptPassword("\nStep 2: Enter your API key\n  API Key: ");
  if (!apiKey) {
    console.error("  Error: API key is required");
    process.exit(1);
  }

  // Step 3: Configure base URL
  const defaultBaseUrl = preset.baseUrl;
  const baseUrl = await promptInput(
    `\nStep 3: Configure base URL\n  Base URL [${defaultBaseUrl}]: `,
    { defaultVal: defaultBaseUrl }
  );
  const finalBaseUrl = baseUrl || defaultBaseUrl;

  // Step 4: Select pack
  const packOptions = availablePacks.length > 0
    ? [...availablePacks.map((p) => `${p} (compatible with ${preset.name})`), "Use default (openai)"]
    : ["openai (OpenAI-compatible)", "Generate new pack from OpenAPI spec"];
  const packIdx = await promptSelect<number>(
    "Step 4: Select pack",
    packOptions.map((label, i) => ({ name: label, value: i })),
    { defaultIndex: 0 }
  );
  let pack: string;
  if (packIdx < availablePacks.length && availablePacks.length > 0) {
    pack = availablePacks[packIdx];
  } else {
    pack = preset.pack;
  }

  // Store API key in vault
  console.log("\n  Storing configuration...");
  const vault = createVault({ vaultDir: join(homedir(), ".synapse", "keys") });
  try {
    await vault.setKey(preset.id, apiKey, preset.authType);
  } catch (err) {
    console.error(`  Error storing API key: ${err}`);
    process.exit(1);
  }

  // Update config file
  const config = await loadConfig();
  if (!config.providers) config.providers = {};
  config.providers[preset.id] = {
    base_url: finalBaseUrl,
    pack: pack,
    auth_type: preset.authType,
  };
  await saveConfig(config);

  // Done!
  console.log(`\n✅ ${preset.name} configured!`);
  console.log(`   Pack:     ${pack}`);
  console.log(`   Base URL: ${finalBaseUrl}`);
  console.log(`   Auth:     ${preset.authType}`);
  console.log(`\nNext: synapse connect ${preset.id} chat`);
  console.log("");
}
