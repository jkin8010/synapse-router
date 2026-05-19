#!/usr/bin/env node
// @synapse-router/install-skill -- One-command Synapse Router Skill installer

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { detectPlatform, VALID_PLATFORMS } from "./detect.js";
import type { Platform } from "./detect.js";
import { installSkill } from "./install.js";
import { uninstallSkill } from "./uninstall.js";

/** Parsed CLI arguments */
interface InstallCliArgs {
  platform?: string;
  dir?: string;
  dryRun: boolean;
  uninstall: boolean;
}

/** Usage text displayed with --help or -h */
const USAGE = `
@synapse-router/install-skill -- Install Synapse Router Skill to AI Agent platforms

Usage: npx @synapse-router/install-skill [flags]

Flags:
  --platform <id>   Target platform: claude-code | cursor | codex | openclaw | hermes
                    If not set, auto-detects from current working directory.
  --dir <path>      Custom install directory (overrides default platform path)
  --dry-run         Preview install plan without writing any files
  --uninstall       Remove all installed skill files and restore backups
  --help, -h        Show this help message
`;

/**
 * Parse CLI arguments from process.argv.
 */
function parseArgs(argv: string[]): InstallCliArgs {
  const result: InstallCliArgs = { dryRun: false, uninstall: false };
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--platform":
        result.platform = args[++i];
        break;
      case "--dir":
        result.dir = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--uninstall":
        result.uninstall = true;
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        console.error("Unknown flag: " + args[i]);
        process.exit(1);
    }
  }

  return result;
}

/**
 * Main entry point for the install-skill CLI.
 */
export async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();
  const home = homedir();

  // --uninstall mode
  if (args.uninstall) {
    const synapseDir = join(cwd, ".synapse");
    const result = await uninstallSkill(synapseDir);
    // uninstallSkill already printed its own messages
    if (result) {
      console.log("Uninstall complete.");
    }
    return;
  }

  // Determine platform
  let platform: string;

  if (args.platform !== undefined) {
    // Manual platform via --platform
    if (!VALID_PLATFORMS.includes(args.platform as Platform)) {
      console.error("Invalid platform: " + args.platform + ". Valid: claude-code, cursor, codex, openclaw, hermes");
      process.exit(1);
    }
    platform = args.platform;
  } else {
    // Auto-detect
    const detected = detectPlatform(cwd, home);
    if (detected === null) {
      console.error("Error: Could not detect AI Agent platform.");
      console.error("Use --platform to specify one: claude-code | cursor | codex | openclaw | hermes");
      process.exit(1);
    }
    platform = detected;
  }

  // Resolve paths
  const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
  const synapseDir = join(cwd, ".synapse");

  // Install
  await installSkill({
    platform,
    skillsDir,
    synapseDir,
    customDir: args.dir,
    dryRun: args.dryRun,
    cwd,
    home,
  });
}

// Top-level error handling
main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Fatal error: " + message);
  process.exit(1);
});
