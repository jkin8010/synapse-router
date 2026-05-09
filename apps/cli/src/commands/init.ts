// @synapse-router/cli — `synapse init` command
// Sets up SDK project structure for synapse-sdk integration

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitOptions {
  provider?: string;
  outDir: string;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function printInitHelp(): void {
  console.log(`
synapse init — Initialize a synapse-sdk project

Usage:
  synapse init [options]

Options:
  --provider <name>     Provider ID to pre-configure (e.g. openai, replicate)
  --out-dir <path>      Output directory (default: ./synapse-sdk)

Description:
  Creates a synapse-sdk project directory structure with a synapse.json
  configuration file. Run this in your project root before generating SDKs.

Output structure:
  <out-dir>/
  ├── README.md              # Integration instructions
  └── .gitkeep               # Ensures directory is tracked

  synapse.json               # Generation configuration

Examples:
  # Interactive setup
  synapse init

  # Pre-select openai provider
  synapse init --provider openai

  # Custom output directory
  synapse init --out-dir ./src/sdk
`);
}

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

export function parseInitArgs(argv: string[]): InitOptions {
  const options: InitOptions = {
    outDir: "./synapse-sdk",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-dir" && argv[i + 1]) {
      options.outDir = argv[++i];
    } else if (arg === "--provider" && argv[i + 1]) {
      options.provider = argv[++i];
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleInitCommand(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printInitHelp();
    return;
  }

  const options = parseInitArgs(argv);
  const outDir = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(process.cwd(), options.outDir);
  const configPath = resolve(process.cwd(), "synapse.json");

  // Header
  console.log("\nSynapse Init — Setting up SDK project");
  console.log(`  SDK output:  ${outDir}`);

  if (options.provider) {
    console.log(`  Provider:    ${options.provider}`);
  }
  console.log("");

  // Create SDK output directory
  await mkdir(outDir, { recursive: true });

  // Write .gitkeep
  await writeFile(join(outDir, ".gitkeep"), "", "utf8");

  // Write README.md
  const readme = `# Synapse SDK

Auto-generated zero-dependency TypeScript SDK for provider APIs.

## Usage

Import the generated client for any configured provider:

\`\`\`typescript
import { OpenAIClient } from './synapse-sdk/openai/index.js';

const client = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY!,
});

const result = await client.chat({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'gpt-4',
});
\`\`\`

## Regenerate

\`\`\`bash
synapse evolve --out-dir ./synapse-sdk
\`\`\`

## Learn more

[synapse-router](https://github.com/qise-tech/synapse-router)
`;
  await writeFile(join(outDir, "README.md"), readme, "utf8");

  // Write synapse.json config
  const config: Record<string, unknown> = {
    version: "0.1.0",
    sdk_output_dir: options.outDir,
    generated_at: new Date().toISOString(),
  };

  if (options.provider) {
    config.default_provider = options.provider;
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  // Summary
  console.log(`Created: ${outDir}/`);
  console.log(`  README.md`);
  console.log(`  .gitkeep`);
  console.log(`Created: ${configPath}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Add providers:  synapse pack add <provider>`);
  console.log(`  2. Generate SDK:   synapse evolve --out-dir ${options.outDir}`);
}
